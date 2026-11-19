import { describe, it, expect } from 'vitest';
import { buildPlan, type PlannerState } from './planner';
import { whyNotReady, recommendations, type ReadinessInput } from './readiness';
import { parseLocalDate } from './dates';

const lessons = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, sectionId: i < 6 ? 'gen' : 'lpr', title: `Lesson ${i}`, estMinutes: 20, completed: false }));
const state: PlannerState = { lessons, weakSectionIds: ['lpr'], sectionNames: { gen: 'General', lpr: 'Provisions' }, dueCards: 5 };
const base = { today: '2026-12-01', examDate: '2026-12-31', studyDays: [1, 2, 3, 4, 5], minutesPerDay: 60, sessionLength: 30, priorKnowledge: 'some' as const };

describe('study planner', () => {
  it('only schedules on selected study days before the exam', () => {
    const p = buildPlan(base, state);
    expect(p.days.length).toBe(p.studyDayCount);
    for (const d of p.days) {
      expect([1, 2, 3, 4, 5]).toContain(parseLocalDate(d.date).getDay());
      expect(d.date < base.examDate).toBe(true);
    }
  });
  it('schedules every remaining lesson exactly once when time allows', () => {
    const p = buildPlan(base, state);
    const ids = p.days.flatMap((d) => d.tasks.filter((t) => t.kind === 'lesson').map((t) => t.ref));
    expect(ids.sort()).toEqual(lessons.map((l) => l.id).sort());
    expect(p.overloaded).toBe(false);
    expect(p.days.some((d) => d.tasks.some((t) => t.kind === 'mock-exam' || t.kind === 'custom-exam'))).toBe(true);
  });
  it('every day includes flashcard review', () => {
    for (const d of buildPlan(base, state).days) expect(d.tasks[0].kind).toBe('flashcards');
  });
  it('completed lessons are not rescheduled (missed-day recovery recomputes from today)', () => {
    const st = { ...state, lessons: lessons.map((l, i) => ({ ...l, completed: i < 5 })) };
    const p = buildPlan({ ...base, today: '2026-12-10' }, st);
    const ids = p.days.flatMap((d) => d.tasks.filter((t) => t.kind === 'lesson').map((t) => t.ref));
    expect(ids).toHaveLength(7);
    expect(ids).not.toContain('l0');
  });
  it('warns when the plan is overloaded', () => {
    const p = buildPlan({ ...base, examDate: '2026-12-04', minutesPerDay: 20 }, state);
    expect(p.overloaded).toBe(true);
    expect(p.warnings.join(' ')).toMatch(/Increase to/);
  });
  it('warns on a past exam date', () => {
    expect(buildPlan({ ...base, examDate: '2026-11-01' }, state).warnings[0]).toMatch(/future date/);
  });
  it('uses the track exam shape: a 100-question / 120-minute exam fits a 130-minute day', () => {
    const st = { ...state, exam: { questions: 100, minutes: 120 } };
    const p = buildPlan({ ...base, minutesPerDay: 150 }, st);
    const mock = p.days.flatMap((d) => d.tasks).find((t) => t.kind === 'mock-exam');
    expect(mock?.title).toBe('Full 100-question timed mock exam');
    expect(mock?.minutes).toBe(120);
  });
  it('schedules a full mock exam only when the day has at least 150 minutes', () => {
    const p = buildPlan({ ...base, minutesPerDay: 180 }, state);
    expect(p.days.some((d) => d.tasks.some((t) => t.kind === 'mock-exam'))).toBe(true);
    const p2 = buildPlan(base, state);
    expect(p2.days.some((d) => d.tasks.some((t) => t.kind === 'mock-exam'))).toBe(false);
  });
});

const ri = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  sections: [
    { id: 'lpr', name: 'Provisions', weightPct: 10, accuracy: 0.6, answered: 40, mastery: 0.5, coverage: 0.8, lessonsDone: 7, lessonsTotal: 7 },
    { id: 'tax', name: 'Tax', weightPct: 2, accuracy: 0.95, answered: 20, mastery: 0.9, coverage: 1, lessonsDone: 2, lessonsTotal: 2 },
  ],
  examHistory: [], practiceTarget: 85, passingPercent: 70, dueCards: 0, totalAnswered: 400, guessedCorrect: 0, correctAnswers: 300,
  confusedPairs: [], weakConcepts: [], ...over,
});

describe('readiness', () => {
  it('not ready without full exams; explains why', () => {
    const r = whyNotReady(ri());
    expect(r.ready).toBe(false);
    expect(r.findings[0].severity).toBe('high');
    expect(r.findings.map((f) => f.id)).toContain('no-full');
    expect(r.findings.map((f) => f.id)).toContain('sec-lpr');
    expect(r.findings.map((f) => f.id)).not.toContain('sec-tax');
  });
  it('ready when two recent full exams meet the target and no high-severity gaps', () => {
    const r = whyNotReady(ri({
      sections: [{ id: 'tax', name: 'Tax', weightPct: 2, accuracy: 0.95, answered: 20, mastery: 0.9, coverage: 1, lessonsDone: 2, lessonsTotal: 2 }],
      examHistory: [{ pct: 88, at: 2, kind: 'full' }, { pct: 86, at: 1, kind: 'full' }],
    }));
    expect(r.ready).toBe(true);
  });
  it('flags guessing and confused pairs', () => {
    const r = whyNotReady(ri({ guessedCorrect: 100, confusedPairs: [{ a: 'coinsurance', b: 'copayment', aName: 'Coinsurance', bName: 'Copayment', count: 3 }] }));
    expect(r.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['guessing', 'confuse-coinsurance-copayment']));
  });
  it('recommendations carry reasons', () => {
    const rec = recommendations({ ...ri({ dueCards: 12 }), nextLesson: { id: 'gen-l01', title: 'Risk', sectionName: 'General' } });
    expect(rec[0].id).toBe('cards');
    expect(rec.every((r) => r.reason.length > 10)).toBe(true);
  });
});
