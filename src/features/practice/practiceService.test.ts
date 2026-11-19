import { beforeEach, describe, expect, it } from 'vitest';
import { content } from '@/content';
import { db } from '@/db/db';
import { questionHistory } from '@/db/repo';
import { masteryByConcept } from '@/lib/mastery';
import { resetDb } from '../testUtils';
import {
  advanceSession, answerQuestion, createPracticeSession, defaultConfig, gradeForQuestion, rubricFor, selectQuestions, startPracticeFromSelection,
  startReviewSession, streaks, summarizeSession, type SelectionContext,
} from './practiceService';
import { bankQuestions } from './bank';

const ctx = async (): Promise<SelectionContext> => ({ pool: content.questions, sections: content.sections, mastery: masteryByConcept([], Date.now()), history: await questionHistory() });
const wrongChoice = (q: { correct: string; choices: { id: string }[] }) => q.choices.find((c) => c.id !== q.correct)!.id;

describe('practice selection', () => {
  beforeEach(resetDb);

  it('topic quiz uses only chosen sections and reports availability honestly', async () => {
    const sec = content.sections.find((s) => (content.questionsBySection.get(s.id)?.length ?? 0) > 3)!;
    const have = content.questionsBySection.get(sec.id)!.length;
    const sel = selectQuestions('topic', { ...defaultConfig('topic', 1), sectionIds: [sec.id], count: have + 50 }, await ctx());
    expect(sel.questions).toHaveLength(have);
    expect(sel.available).toBe(have);
    expect(sel.requested).toBe(have + 50);
    expect(sel.questions.every((q) => q.sectionId === sec.id)).toBe(true);
    expect(new Set(sel.questions.map((q) => q.id)).size).toBe(have);
    expect(selectQuestions('topic', { ...defaultConfig('topic', 1), sectionIds: [] }, await ctx()).questions).toHaveLength(0);
  });

  it('mixed quiz respects the difficulty filter and count', async () => {
    const sel = selectQuestions('mixed', { ...defaultConfig('mixed', 3), count: 15, difficulty: [1] }, await ctx());
    expect(sel.questions.length).toBeLessThanOrEqual(15);
    expect(sel.questions.length).toBeGreaterThan(0);
    expect(sel.questions.every((q) => q.difficulty === 1)).toBe(true);
  });

  it('weakness drill is empty with no history, then targets missed questions with a reason', async () => {
    expect((selectQuestions('weakness', defaultConfig('weakness', 1), await ctx())).available).toBe(0);
    const q = content.questions[0];
    const row = await createPracticeSession({ mode: 'topic', questions: [q], config: { feedback: 'immediate' } });
    await answerQuestion(row.id, q.id, { choiceId: wrongChoice(q), confidence: null, responseMs: 900 });
    const h = await questionHistory();
    const att = await db.attempts.toArray();
    const mastery = masteryByConcept(att.flatMap((a) => a.concepts.map((c) => ({ concept: c, at: a.at, correct: a.correct, difficulty: a.difficulty, source: 'question' as const }))), Date.now());
    const sel = selectQuestions('weakness', defaultConfig('weakness', 1), { pool: content.questions, sections: content.sections, mastery, history: h });
    expect(sel.questions[0].id).toBe(q.id);
    expect(sel.reasons[q.id]).toMatch(/missed this question 1 time/);
  });

  it('rapid and tricky pools only contain matching questions', async () => {
    const r = selectQuestions('rapid', defaultConfig('rapid', 1), await ctx());
    expect(r.questions.every((q) => q.tags.includes('rapid') || q.style === 'definition')).toBe(true);
    const t = selectQuestions('tricky', defaultConfig('tricky', 1), await ctx());
    expect(t.questions.every((q) => q.tags.includes('tricky') || q.tags.includes('negative-wording') || q.style === 'negative' || q.difficulty === 3)).toBe(true);
  });
});

describe('practice sessions', () => {
  beforeEach(resetDb);

  it('creates a session row with fixed choice orders and the right config', async () => {
    const sel = selectQuestions('mixed', { ...defaultConfig('mixed', 9), count: 6, feedback: 'end' }, await ctx());
    const row = await startPracticeFromSelection('mixed', { ...defaultConfig('mixed', 9), count: 6, feedback: 'end' }, sel);
    const stored = (await db.practiceSessions.get(row.id))!;
    expect(stored.id).toMatch(/^ps-/);
    expect(stored.questionIds).toEqual(sel.questions.map((q) => q.id));
    expect(stored.mode).toBe('mixed');
    expect(stored.config.feedback).toBe('end');
    expect(stored.status).toBe('in-progress');
    for (const q of sel.questions) expect([...stored.choiceOrders[q.id]].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(stored.title).toMatch(/Mixed Questions/);
  });

  it('records attempts and the answer + index immediately (immediate feedback), and resumes exactly', async () => {
    const qs = content.questions.slice(0, 3);
    const row = await createPracticeSession({ mode: 'learn', questions: qs, config: { feedback: 'immediate' } });
    const after = await answerQuestion(row.id, qs[0].id, { choiceId: qs[0].correct, confidence: 'sure', responseMs: 1200 });
    expect(after.index).toBe(0);
    const reloaded = (await db.practiceSessions.get(row.id))!;
    expect(reloaded.answers[qs[0].id]).toMatchObject({ choiceId: qs[0].correct, correct: true, confidence: 'sure' });
    const at = await db.attempts.where('sessionId').equals(row.id).toArray();
    expect(at).toHaveLength(1);
    expect(at[0]).toMatchObject({ questionId: qs[0].id, mode: 'learn', correct: true, responseMs: 1200, contentVersion: qs[0].version });
    // answering again is idempotent
    await answerQuestion(row.id, qs[0].id, { choiceId: wrongChoice(qs[0]), confidence: null, responseMs: 5 });
    expect(await db.attempts.where('sessionId').equals(row.id).count()).toBe(1);
    expect((await advanceSession(row.id)).index).toBe(1);
    await answerQuestion(row.id, qs[1].id, { choiceId: wrongChoice(qs[1]), confidence: 'guess', responseMs: 700 });
    await advanceSession(row.id);
    await answerQuestion(row.id, qs[2].id, { choiceId: qs[2].correct, confidence: null, responseMs: 700 });
    const done = await advanceSession(row.id);
    expect(done.status).toBe('completed');
    // missed concepts were added to flashcards by recordAttempt
    for (const c of qs[1].concepts) expect((await db.cards.get(c))?.inDeck).toBe(true);
    const s = summarizeSession(done, bankQuestions(done.questionIds));
    expect(s).toMatchObject({ total: 3, answered: 3, correct: 2, incorrect: 1 });
    expect(s.missed.map((m) => m.id)).toEqual([qs[1].id]);
    expect(s.bySection.reduce((n, b) => n + b.total, 0)).toBe(3);
    expect(s.queuedConcepts.length).toBeGreaterThan(0);
  });

  it('feedback-at-end sessions advance on every answer and complete after the last one', async () => {
    const qs = content.questions.slice(0, 2);
    const row = await createPracticeSession({ mode: 'topic', questions: qs, config: { feedback: 'end' } });
    expect((await answerQuestion(row.id, qs[0].id, { choiceId: qs[0].correct, confidence: null, responseMs: 1 })).index).toBe(1);
    const fin = await answerQuestion(row.id, qs[1].id, { choiceId: qs[1].correct, confidence: null, responseMs: 1 });
    expect(fin.status).toBe('completed');
  });

  it('records a countdown timeout as unanswered and incorrect, and tracks streaks', async () => {
    const qs = content.questions.slice(0, 4);
    const row = await createPracticeSession({ mode: 'rapid', questions: qs, config: { feedback: 'immediate', countdownSec: 15 } });
    await answerQuestion(row.id, qs[0].id, { choiceId: qs[0].correct, confidence: null, responseMs: 100 });
    await answerQuestion(row.id, qs[1].id, { choiceId: qs[1].correct, confidence: null, responseMs: 100 });
    await answerQuestion(row.id, qs[2].id, { choiceId: null, confidence: null, responseMs: 15000 });
    const r = (await db.practiceSessions.get(row.id))!;
    expect(r.answers[qs[2].id]).toMatchObject({ choiceId: '', correct: false });
    const att = (await db.attempts.where('questionId').equals(qs[2].id).first())!;
    expect(att.choiceId).toBeNull();
    expect(att.correct).toBe(false);
    expect(streaks(r)).toEqual({ current: 0, best: 2 });
  });

  it('retry-missed creates a new review session of only the missed ids', async () => {
    const qs = content.questions.slice(0, 3);
    const row = await createPracticeSession({ mode: 'topic', questions: qs, config: { feedback: 'immediate' } });
    await answerQuestion(row.id, qs[0].id, { choiceId: wrongChoice(qs[0]), confidence: null, responseMs: 1 });
    const retry = (await startReviewSession([qs[0].id], 'Retry'))!;
    expect(retry.mode).toBe('review');
    expect(retry.questionIds).toEqual([qs[0].id]);
    expect(retry.id).not.toBe(row.id);
    expect(await startReviewSession(['nope-q999'])).toBeNull();
  });
});

describe('Explain Your Answer grading', () => {
  beforeEach(resetDb);

  it('uses the authored rubric when present, else the concept terms', () => {
    const withRubric = { ...content.questions[0], rubric: { keyPoints: [{ label: 'Mentions risk pooling', anyOf: ['pool', 'pooling'] }, { label: 'Mentions premium', anyOf: ['premium'] }] } };
    const g = gradeForQuestion(withRubric, 'Insurers use pooling of many policyholders.');
    expect(g.matched).toEqual(['Mentions risk pooling']);
    expect(g.missing).toEqual(['Mentions premium']);
    expect(g.score).toBe(0.5);
    const noRubric = { ...content.questions[0], rubric: undefined };
    expect(rubricFor(noRubric).length).toBe(noRubric.concepts.length);
    expect(rubricFor(noRubric)[0].label).toMatch(/^Mentions the concept:/);
  });

  it('records the explanation and rubric score on the attempt and in the session row', async () => {
    const q = { ...content.questions[0] };
    const term = content.termById.get(q.concepts[0])?.term ?? q.concepts[0].replace(/-/g, ' ');
    const row = await createPracticeSession({ mode: 'explain', questions: [q], config: { feedback: 'immediate' } });
    const r = await answerQuestion(row.id, q.id, { choiceId: q.correct, confidence: 'sure', responseMs: 3000, explanation: `  It is about ${term}.  ` });
    expect(r.answers[q.id].explanation).toBe(`It is about ${term}.`);
    const att = (await db.attempts.where('sessionId').equals(row.id).first())!;
    expect(att.explanation).toBe(`It is about ${term}.`);
    expect(att.rubricScore).toBeGreaterThan(0);
    expect(summarizeSession(r, [q]).avgRubricPct).not.toBeNull();
  });

  it('records no rubric score when the explanation is empty', async () => {
    const q = content.questions[1];
    const row = await createPracticeSession({ mode: 'explain', questions: [q], config: { feedback: 'immediate' } });
    await answerQuestion(row.id, q.id, { choiceId: q.correct, confidence: null, responseMs: 10, explanation: '   ' });
    const att = (await db.attempts.where('sessionId').equals(row.id).first())!;
    expect(att.rubricScore).toBeUndefined();
    expect(att.explanation).toBeUndefined();
  });
});
