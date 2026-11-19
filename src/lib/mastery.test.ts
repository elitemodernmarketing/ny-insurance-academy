import { describe, it, expect } from 'vitest';
import { conceptMastery, sectionMastery, masteryByConcept, estimateExamScore, type EvidenceEvent } from './mastery';
import { DAY_MS } from './dates';

const NOW = Date.UTC(2026, 5, 1);
const ev = (correct: boolean, daysAgo = 0, extra: Partial<EvidenceEvent> = {}): EvidenceEvent => ({ concept: 'x', at: NOW - daysAgo * DAY_MS, correct, source: 'question', ...extra });

describe('concept mastery', () => {
  it('unseen when no events', () => {
    expect(conceptMastery('x', [], NOW)).toMatchObject({ level: 'unseen', score: 0 });
  });
  it('one correct answer is only 50% (skeptical prior)', () => {
    expect(conceptMastery('x', [ev(true)], NOW).score).toBeCloseTo(0.5);
  });
  it('a guessed correct answer counts half', () => {
    expect(conceptMastery('x', [ev(true, 0, { guessed: true })], NOW).score).toBeCloseTo(0.25);
  });
  it('mastered requires >= 85%, 3+ confident correct, on 2+ days', () => {
    const sameDay = Array.from({ length: 8 }, () => ev(true));
    const m1 = conceptMastery('x', sameDay, NOW);
    expect(m1.score).toBeGreaterThan(0.85);
    expect(m1.level).toBe('proficient');
    const spread = [ev(true, 0), ev(true, 1), ev(true, 2), ev(true, 3), ev(true, 4), ev(true, 5), ev(true, 6)];
    expect(conceptMastery('x', spread, NOW).level).toBe('mastered');
  });
  it('recent misses weigh more than old successes', () => {
    const m = conceptMastery('x', [ev(true, 60), ev(true, 60), ev(true, 60), ev(false, 0), ev(false, 1)], NOW);
    expect(m.score).toBeLessThan(0.4);
    expect(m.level).toBe('weak');
    expect(m.recentMisses).toBe(2);
  });
  it('section mastery averages concepts, counting unseen as 0, and reports coverage', () => {
    const map = masteryByConcept([{ ...ev(true), concept: 'a' }, { ...ev(true), concept: 'a' }, { ...ev(true), concept: 'a' }], NOW);
    const s = sectionMastery('gen', ['a', 'b'], map);
    expect(s.coverage).toBe(0.5);
    expect(s.score).toBeCloseTo(0.75 / 2);
  });
  it('estimated exam score weights sections and shrinks toward 50%', () => {
    const est = estimateExamScore([{ id: 's1', weightPct: 50 }, { id: 's2', weightPct: 50 }], {
      s1: Array.from({ length: 40 }, (_, i) => ({ correct: true, at: i })),
    });
    expect(est.bySection.s1).toBeCloseTo((40 + 2.5) / 45);
    expect(est.bySection.s2).toBe(0.25);
    expect(est.confidence).toBe('low');
  });
});
