import { describe, it, expect } from 'vitest';
import { scoreExam, correctNeeded } from './scoring';
import { formatClock, remainingMs, isExpired, deadlineFrom, timeUsedMs } from './timer';

const qs = Array.from({ length: 150 }, (_, i) => ({ id: `q${i}`, sectionId: i < 75 ? 'life' : 'health', correct: 'a' }));
const answersWith = (n: number) => Object.fromEntries(qs.map((q, i) => [q.id, i < n ? 'a' : 'b']));

describe('scoring and passing threshold', () => {
  it('105 of 150 (70.0%) passes; 104 (69.3%) fails', () => {
    expect(correctNeeded(150, 70)).toBe(105);
    const pass = scoreExam(qs, answersWith(105));
    expect(pass.pct).toBe(70);
    expect(pass.passed).toBe(true);
    const fail = scoreExam(qs, answersWith(104));
    expect(fail.pct).toBe(69.3);
    expect(fail.passed).toBe(false);
  });
  it('counts unanswered as not correct and reports them separately', () => {
    const answers: Record<string, string> = { q0: 'a', q1: 'b' };
    const s = scoreExam(qs, answers);
    expect(s.correct).toBe(1);
    expect(s.incorrect).toBe(1);
    expect(s.unanswered).toBe(148);
    expect(s.total).toBe(150);
    expect(s.missedIds).toHaveLength(149);
  });
  it('breaks results down by section, weakest first', () => {
    const s = scoreExam(qs, answersWith(75));
    expect(s.bySection[0]).toMatchObject({ sectionId: 'health', correct: 0, pct: 0 });
    expect(s.bySection[1]).toMatchObject({ sectionId: 'life', correct: 75, pct: 100 });
  });
  it('custom passing percentage (85% practice target)', () => {
    expect(correctNeeded(50, 85)).toBe(43);
    const q50 = qs.slice(0, 50);
    expect(scoreExam(q50, answersWith(43), 85).passed).toBe(true);
    expect(scoreExam(q50, answersWith(42), 85).passed).toBe(false);
  });
  it('empty exam never passes', () => {
    expect(scoreExam([], {}).passed).toBe(false);
  });
});

describe('timer', () => {
  it('150-minute deadline, remaining time and expiry', () => {
    const start = 1_000_000;
    const end = deadlineFrom(start, 150);
    expect(end - start).toBe(9_000_000);
    expect(remainingMs(end, start + 60_000)).toBe(8_940_000);
    expect(remainingMs(end, end + 5)).toBe(0);
    expect(isExpired(end, end - 1)).toBe(false);
    expect(isExpired(end, end)).toBe(true);
  });
  it('formats clocks', () => {
    expect(formatClock(9_000_000)).toBe('2:30:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });
  it('time used is capped at the limit', () => {
    expect(timeUsedMs(0, 10_000_000, 9_000_000)).toBe(9_000_000);
    expect(timeUsedMs(0, 1000, 9_000_000)).toBe(1000);
  });
});
