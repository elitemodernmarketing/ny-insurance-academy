import { beforeEach, describe, expect, it } from 'vitest';
import { content } from '@/content';
import { db } from '@/db/db';
import { allocate } from '@/lib/blueprint';
import { scoreExam } from '@/lib/scoring';
import { resetDb } from '../testUtils';
import {
  alreadyCrossed, buildResultView, createExamSession, examFormat, examLabel, filterReview, nextAnnouncement, persistExam, planExam, requestedSize,
  shouldAutoSubmit, submitExam, withAnswer, withFlagToggled, withIndex, withTimeAdded,
} from './examService';

const synthetic = (perSection: number, skip: string[] = []) =>
  content.sections.filter((s) => !skip.includes(s.id)).flatMap((s) => Array.from({ length: perSection }, (_, i) => ({ id: `${s.id}-q${String(i + 1).padStart(3, '0')}`, sectionId: s.id })));

describe('planExam', () => {
  it('builds 150 unique questions that match the blueprint allocation when the bank is large enough', () => {
    const plan = planExam('full', 0, 7, { pool: synthetic(40) });
    expect(plan.size).toBe(150);
    expect(plan.kind).toBe('full');
    expect(plan.shortfalls).toEqual([]);
    expect(new Set(plan.questionIds).size).toBe(150);
    expect(plan.timeLimitMin).toBe(content.manifest.exam.timeLimitMinutes);
    expect(plan.allocation).toEqual(allocate(150, content.sections, 7));
    const counts: Record<string, number> = {};
    for (const id of plan.questionIds) counts[id.split('-')[0]] = (counts[id.split('-')[0]] ?? 0) + 1;
    for (const [sid, n] of Object.entries(plan.allocation)) expect(counts[sid] ?? 0).toBe(n);
  });

  it('reports shortfalls honestly, never duplicates, and stores a shortened full exam as custom', () => {
    const plan = planExam('full', 0, 3, { pool: synthetic(40, ['ann', 'ltc']) });
    expect(plan.shortfalls.map((s) => s.sectionId).sort()).toEqual(['ann', 'ltc']);
    expect(plan.size).toBeLessThan(150);
    expect(plan.size + plan.shortfalls.reduce((n, s) => n + s.required - s.available, 0)).toBe(150);
    expect(new Set(plan.questionIds).size).toBe(plan.size);
    expect(plan.kind).toBe('custom');
    expect(plan.requestedKind).toBe('full');
    expect(plan.timeLimitMin).toBeLessThan(content.manifest.exam.timeLimitMinutes);
  });

  it('custom exams get one minute per question', () => {
    const plan = planExam('custom', 50, 1, { pool: synthetic(40) });
    expect(plan.size).toBe(50);
    expect(plan.timeLimitMin).toBe(50);
    expect(plan.kind).toBe('custom');
  });

  it('prefers questions the learner has seen least', () => {
    const pool = synthetic(40);
    const exposure = Object.fromEntries(pool.slice(0, 10).map((q) => [q.id, 5]));
    const plan = planExam('custom', 25, 2, { pool, exposure });
    expect(plan.questionIds.some((id) => id in exposure)).toBe(false);
  });
});

describe('exam sessions', () => {
  beforeEach(resetDb);
  const makePlan = () => planExam('custom', 25, 11);

  it('creates and persists a session with an absolute deadline and fixed choice orders', async () => {
    const plan = makePlan();
    expect(plan.size).toBeGreaterThan(0);
    const row = await createExamSession(plan, 1_000_000);
    const stored = await db.examSessions.get(row.id);
    expect(stored?.deadline).toBe(1_000_000 + plan.timeLimitMin * 60_000);
    expect(stored?.status).toBe('in-progress');
    expect(Object.keys(stored!.choiceOrders).length).toBe(plan.size);
    expect(new Set(stored!.questionIds).size).toBe(stored!.questionIds.length);
    expect(stored!.shortfalls).toEqual(plan.shortfalls);
  });

  it('refuses to create an exam without questions', async () => {
    await expect(createExamSession({ ...makePlan(), questionIds: [], size: 0 })).rejects.toThrow(/No eligible/);
  });

  it('persists answers, flags, index and time on every change, and restores them', async () => {
    const row = await createExamSession(makePlan());
    const [a, b] = row.questionIds;
    await persistExam(row.id, withAnswer(a, 'b'));
    await persistExam(row.id, withFlagToggled(b));
    await persistExam(row.id, withIndex(1));
    await persistExam(row.id, withTimeAdded(a, 1500));
    await persistExam(row.id, withTimeAdded(a, 500));
    const stored = (await db.examSessions.get(row.id))!;
    expect(stored.answers[a]).toBe('b');
    expect(stored.flags).toEqual([b]);
    expect(stored.currentIndex).toBe(1);
    expect(stored.timeOnQuestion[a]).toBe(2000);
    await persistExam(row.id, withAnswer(a, null));
    expect((await db.examSessions.get(row.id))!.answers[a]).toBeUndefined();
    await persistExam(row.id, withFlagToggled(b));
    expect((await db.examSessions.get(row.id))!.flags).toEqual([]);
  });

  it('computes results, records one attempt per question, and is idempotent', async () => {
    const row = await createExamSession(makePlan(), 5_000);
    const qs = row.questionIds.map((id) => content.questionById.get(id)!);
    // answer first 5 correctly, next 3 wrongly, leave the rest blank
    for (const q of qs.slice(0, 5)) await persistExam(row.id, withAnswer(q.id, q.correct));
    for (const q of qs.slice(5, 8)) await persistExam(row.id, withAnswer(q.id, q.choices.find((c) => c.id !== q.correct)!.id));
    await persistExam(row.id, withFlagToggled(qs[0].id));
    const done = (await submitExam(row.id, { now: 5_000 + 600_000 }))!;
    expect(done.status).toBe('submitted');
    expect(done.autoSubmitted).toBe(false);
    expect(done.result).toMatchObject({ total: qs.length, correct: 5, incorrect: 3, unanswered: qs.length - 8 });
    expect(done.result!.timeUsedMs).toBe(600_000);
    expect(done.result!.pct).toBe(Math.round((5 / qs.length) * 1000) / 10);
    expect(done.result!.passed).toBe(false);
    const attempts = await db.attempts.where('sessionId').equals(row.id).toArray();
    expect(attempts).toHaveLength(qs.length);
    expect(attempts.every((x) => x.mode === 'exam' && x.confidence === null)).toBe(true);
    expect(attempts.filter((x) => x.choiceId === null && !x.correct)).toHaveLength(qs.length - 8);
    expect(attempts.filter((x) => x.correct)).toHaveLength(5);
    // missed concepts reach the flashcard deck
    expect(await db.cards.count()).toBeGreaterThan(0);
    // idempotent
    await submitExam(row.id);
    expect(await db.attempts.where('sessionId').equals(row.id).count()).toBe(qs.length);
    // cannot be modified after submission
    await persistExam(row.id, withAnswer(qs[10].id, qs[10].correct));
    expect((await db.examSessions.get(row.id))!.answers[qs[10].id]).toBeUndefined();

    const view = buildResultView(done, 85);
    expect(view.score.correct).toBe(5);
    expect(view.reachedTarget).toBe(false);
    expect(view.avgMsPerQuestion).toBeCloseTo(600_000 / qs.length);
    expect(view.weakSections.length).toBeGreaterThan(0);
    expect(view.followUpSections.length).toBeLessThanOrEqual(3);
    expect(filterReview(done, view.questions, 'incorrect')).toHaveLength(3);
    expect(filterReview(done, view.questions, 'unanswered')).toHaveLength(qs.length - 8);
    expect(filterReview(done, view.questions, 'flagged').map((q) => q.id)).toEqual([qs[0].id]);
    const direct = scoreExam(qs, done.answers, 70);
    expect(done.result!.missedIds).toEqual(direct.missedIds);
  });

  it('auto-submit caps time used at the limit and stamps the deadline', async () => {
    const row = await createExamSession(makePlan(), 0);
    expect(shouldAutoSubmit(row, row.deadline - 1)).toBe(false);
    expect(shouldAutoSubmit(row, row.deadline)).toBe(true);
    const done = (await submitExam(row.id, { auto: true, now: row.deadline + 3_600_000 }))!;
    expect(done.autoSubmitted).toBe(true);
    expect(done.submittedAt).toBe(row.deadline);
    expect(done.result!.timeUsedMs).toBe(row.timeLimitMin * 60_000);
    expect(shouldAutoSubmit(done, row.deadline + 1)).toBe(false);
  });
});

describe('labels', () => {
  it('distinguishes official, shortened full and custom exams', () => {
    expect(examFormat({ kind: 'full', size: 150, shortfalls: [] })).toBe('official');
    const short = { kind: 'custom' as const, size: 120, shortfalls: [{ sectionId: 'ann', required: 30, available: 0 }] };
    expect(requestedSize(short)).toBe(150);
    expect(examFormat(short)).toBe('shortened-full');
    expect(examLabel(short)).toMatch(/Shortened full exam \(120 of 150/);
    expect(examLabel({ kind: 'custom', size: 50, shortfalls: [] })).toMatch(/Custom practice exam \(50 questions\)/);
  });
});

describe('time announcements', () => {
  it('announces at 30, 15, 5 and 1 minutes remaining, once each', () => {
    let announced = new Set<number>();
    const heard: string[] = [];
    for (let sec = 150 * 60; sec > 0; sec--) {
      const a = nextAnnouncement(sec * 1000, announced, 150);
      announced = a.announced;
      if (a.message) heard.push(a.message);
    }
    expect(heard).toEqual(['30 minutes remaining', '15 minutes remaining', '5 minutes remaining', '1 minute remaining']);
  });
  it('skips thresholds longer than the exam and stale ones after a reload', () => {
    expect(nextAnnouncement(25 * 60_000, new Set(), 25).message).toBeNull();
    const crossed = alreadyCrossed(10 * 60_000, 150);
    expect([...crossed].sort((a, b) => a - b)).toEqual([15, 30]);
    expect(nextAnnouncement(10 * 60_000, crossed, 150).message).toBeNull();
    expect(nextAnnouncement(5 * 60_000 - 1, crossed, 150).message).toBe('5 minutes remaining');
  });
});
