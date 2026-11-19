import { describe, it, expect } from 'vitest';
import { newCard, review, statusOf, nextEase, queueOrder, ratingFromAnswer, LEARNING_STEP_MS } from './srs';
import { DAY_MS } from './dates';

const T0 = Date.UTC(2026, 0, 1);

describe('SM-2 scheduling', () => {
  it('good, good, good → 1 day, 6 days, round(6 × EF)', () => {
    let c = newCard(T0);
    expect(statusOf(c)).toBe('new');
    c = review(c, 'good', T0);
    expect(c.intervalDays).toBe(1);
    expect(c.due).toBe(T0 + DAY_MS);
    expect(statusOf(c)).toBe('learning');
    c = review(c, 'good', c.due);
    expect(c.intervalDays).toBe(6);
    expect(statusOf(c)).toBe('review');
    const ef = c.ease;
    c = review(c, 'good', c.due);
    expect(c.intervalDays).toBe(Math.round(6 * ef));
  });
  it('ease factor follows the SM-2 formula and never drops below 1.3', () => {
    expect(nextEase(2.5, 5)).toBeCloseTo(2.6);
    expect(nextEase(2.5, 4)).toBeCloseTo(2.5);
    expect(nextEase(2.5, 3)).toBeCloseTo(2.36);
    expect(nextEase(1.35, 1)).toBe(1.3);
  });
  it('again resets repetitions, counts a lapse, and re-queues in 10 minutes', () => {
    let c = review(review(newCard(T0), 'good', T0), 'good', T0 + DAY_MS);
    c = review(c, 'again', T0 + 7 * DAY_MS);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(1);
    expect(c.intervalDays).toBe(0);
    expect(c.due).toBe(T0 + 7 * DAY_MS + LEARNING_STEP_MS);
    expect(statusOf(c)).toBe('learning');
  });
  it('becomes mature at 21+ day intervals', () => {
    let c = newCard(T0);
    let t = T0;
    for (let i = 0; i < 4; i++) { c = review(c, 'easy', t); t = c.due; }
    expect(c.intervalDays).toBeGreaterThanOrEqual(21);
    expect(statusOf(c)).toBe('mature');
  });
  it('is deterministic', () => {
    const a = review(review(newCard(T0), 'hard', T0), 'good', T0 + DAY_MS);
    const b = review(review(newCard(T0), 'hard', T0), 'good', T0 + DAY_MS);
    expect(a).toEqual(b);
  });
  it('tracks correct vs total reviews', () => {
    const c = review(review(review(newCard(T0), 'good', T0), 'again', T0 + DAY_MS), 'good', T0 + 2 * DAY_MS);
    expect(c.totalReviews).toBe(3);
    expect(c.correctReviews).toBe(2);
  });
  it('queue: learning-step cards first, then most overdue; hardest mode sorts by ease', () => {
    const mk = (id: string, due: number, interval: number, ease: number) => ({ id, srs: { ...newCard(T0), due, intervalDays: interval, ease } });
    const cards = [mk('a', T0 - 5 * DAY_MS, 3, 2.5), mk('b', T0 - 1000, 0, 2.5), mk('c', T0 - 9 * DAY_MS, 6, 1.3)];
    expect(queueOrder(cards, T0).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(queueOrder(cards, T0, 'hardest')[0].id).toBe('c');
  });
  it('guessing a correct answer schedules a sooner review than knowing it', () => {
    expect(ratingFromAnswer(true, 'guess')).toBe('hard');
    expect(ratingFromAnswer(true, 'sure')).toBe('easy');
    expect(ratingFromAnswer(false, 'sure')).toBe('again');
  });
});
