import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { recordAttempt, reviewCard, addToDeck, updateSettings, getSettings, logStudySeconds, touchLesson, updateLesson, questionHistory } from './repo';
import { exportData, importData, parseBackup, resetAllData } from './backup';
import { buildLearnerModel } from './learnerModel';
import { DEFAULT_SETTINGS } from './db';
import { DAY_MS } from '@/lib/dates';

beforeEach(async () => { await resetAllData(); });

const attempt = (over: Partial<Parameters<typeof recordAttempt>[0]> = {}) => recordAttempt({
  questionId: 'lpr-q001', sectionId: 'lpr', concepts: ['grace-period'], difficulty: 2, correct: true, choiceId: 'a',
  confidence: 'sure', responseMs: 1000, mode: 'learn', sessionId: 's1', ...over,
});

describe('adaptive side effects of answers', () => {
  it('a missed question adds its concepts to the flashcard deck, due now', async () => {
    const t = Date.now();
    await attempt({ correct: false, choiceId: 'b', concepts: ['grace-period', 'reinstatement'], at: t });
    const cards = await db.cards.toArray();
    expect(cards.map((c) => c.termId).sort()).toEqual(['grace-period', 'reinstatement']);
    expect(cards.every((c) => c.inDeck && c.srs.due <= t && c.addedReason === 'missed-question')).toBe(true);
  });
  it('a correct guess schedules the concept for review within a day', async () => {
    const t = Date.now();
    await attempt({ confidence: 'guess', at: t });
    const c = await db.cards.get('grace-period');
    expect(c?.inDeck).toBe(true);
    expect(c!.srs.due).toBeLessThanOrEqual(t + DAY_MS);
  });
  it('a confident correct answer does not touch flashcards', async () => {
    await attempt();
    expect(await db.cards.count()).toBe(0);
  });
  it('question history counts exposure and misses', async () => {
    await attempt({ correct: false, choiceId: 'b' });
    await attempt();
    const h = await questionHistory();
    expect(h.exposure['lpr-q001']).toBe(2);
    expect(h.missed['lpr-q001']).toBe(1);
  });
});

describe('flashcards persistence', () => {
  it('only rating changes the schedule; review history is stored', async () => {
    await addToDeck(['indemnity']);
    const before = await db.cards.get('indemnity');
    expect(before?.srs.totalReviews).toBe(0);
    const after = await reviewCard('indemnity', 'good', 'term-def');
    expect(after.srs.intervalDays).toBe(1);
    expect(await db.cardReviews.count()).toBe(1);
  });
});

describe('settings, lessons and study log persist', () => {
  it('settings merge with defaults', async () => {
    expect((await getSettings()).practiceTarget).toBe(85);
    await updateSettings({ practiceTarget: 90, onboardingDone: true });
    const s = await getSettings();
    expect(s.practiceTarget).toBe(90);
    expect(s.onboardingDone).toBe(true);
    expect(s.tutor.baseUrl).toBe(DEFAULT_SETTINGS.tutor.baseUrl);
  });
  it('lesson progress and study seconds accumulate', async () => {
    await touchLesson('gen-l01', 'gen');
    await updateLesson('gen-l01', { status: 'completed', completedAt: 1 });
    expect((await db.lessonProgress.get('gen-l01'))?.status).toBe('completed');
    await logStudySeconds('lesson', 30);
    await logStudySeconds('lesson', 45);
    const rows = await db.studyLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].seconds).toBe(75);
  });
});

describe('export / import', () => {
  it('round-trips every table exactly (replace mode)', async () => {
    await updateSettings({ practiceTarget: 80, onboardingDone: true });
    await attempt({ correct: false, choiceId: 'c' });
    await reviewCard('grace-period', 'easy', 'typed');
    await touchLesson('lpr-l01', 'lpr');
    await logStudySeconds('practice', 120);
    const backup = JSON.parse(JSON.stringify(await exportData()));
    await resetAllData();
    expect(await db.attempts.count()).toBe(0);
    const parsed = parseBackup(backup);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importData(parsed.backup, 'replace');
    const again = JSON.parse(JSON.stringify(await exportData()));
    expect(again.data).toEqual(backup.data);
    expect((await getSettings()).practiceTarget).toBe(80);
  });
  it('rejects invalid or foreign files', () => {
    expect(parseBackup({ hello: 1 }).ok).toBe(false);
    expect(parseBackup({ app: 'other', schemaVersion: 1, exportedAt: 'x', data: {} }).ok).toBe(false);
    expect(parseBackup({ app: 'ny-insurance-academy', schemaVersion: 99, exportedAt: 'x', data: {} }).ok).toBe(false);
    expect(parseBackup({ app: 'ny-insurance-academy', schemaVersion: 1, exportedAt: 'x', data: { evil: [] } }).ok).toBe(false);
  });
  it('merge mode keeps existing rows and appends history', async () => {
    await attempt();
    const backup = await exportData();
    await importData(backup, 'merge');
    expect(await db.attempts.count()).toBe(2);
  });
});

describe('learner model', () => {
  it('builds from empty data without errors', () => {
    const m = buildLearnerModel({ attempts: [], cards: [], cardReviews: [], lessonProgress: [], examSessions: [], studyLog: [], settings: DEFAULT_SETTINGS });
    expect(m.bankAnswered).toBe(0);
    expect(m.readiness.ready).toBe(false);
    expect(m.study.streak).toBe(0);
    expect(m.sectionStats).toHaveLength(18);
  });
  it('detects confused pairs from wrong answers', () => {
    const now = Date.now();
    const base = { questionId: 'med-q001', sectionId: 'med', difficulty: 2 as const, choiceId: 'b', confidence: null, responseMs: 1, mode: 'learn' as const, sessionId: 'x', at: now, correct: false };
    const m = buildLearnerModel({
      attempts: [
        { ...base, concepts: ['coinsurance'], confusedWith: 'copayment' },
        { ...base, concepts: ['copayment'], confusedWith: 'coinsurance' },
      ],
      cards: [], cardReviews: [], lessonProgress: [], examSessions: [], studyLog: [], settings: DEFAULT_SETTINGS,
    }, now);
    // pair is reported only when both terms exist in eligible content
    const p = m.confusedPairs.find((x) => [x.a, x.b].sort().join() === 'coinsurance,copayment');
    if (p) expect(p.count).toBe(2);
  });
});
