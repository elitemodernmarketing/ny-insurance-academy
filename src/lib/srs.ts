/**
 * Spaced repetition — SM-2 (Wozniak, 1987) with explicit, deterministic scheduling.
 *
 * Ratings map to SM-2 quality grades: again=1, hard=3, good=4, easy=5.
 *  - quality < 3 (again): repetition count resets, the card is due again in 10 minutes (learning step), lapses += 1.
 *  - first successful review: 1 day; second: 6 days; afterwards interval = round(previous interval × ease factor).
 *  - "hard" uses SM-2's quality 3 (ease drops by 0.14) and, as a common refinement, grows the interval by 1.2× instead of EF.
 *  - ease factor: EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02)), never below 1.3.
 * Card status: new (never reviewed) → learning (interval < 1 day or fewer than 2 successful reps) → review → mature (interval ≥ 21 days).
 * Viewing a card never changes its schedule — only a graded recall does.
 */
import { DAY_MS } from './dates';

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type CardStatus = 'new' | 'learning' | 'review' | 'mature';

export interface SrsState {
  ease: number;
  intervalDays: number; // 0 means "learning step" (minutes)
  reps: number; // consecutive successful reviews
  lapses: number;
  due: number; // epoch ms
  lastReviewed: number | null;
  totalReviews: number;
  correctReviews: number;
}

export const QUALITY: Record<Rating, number> = { again: 1, hard: 3, good: 4, easy: 5 };
export const LEARNING_STEP_MS = 10 * 60_000;
export const MATURE_DAYS = 21;

export function newCard(now: number): SrsState {
  return { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, due: now, lastReviewed: null, totalReviews: 0, correctReviews: 0 };
}

export function nextEase(ease: number, q: number): number {
  const e = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(1.3, Math.round(e * 1000) / 1000);
}

export function review(state: SrsState, rating: Rating, now: number): SrsState {
  const q = QUALITY[rating];
  const s: SrsState = { ...state, totalReviews: state.totalReviews + 1, lastReviewed: now };
  if (q < 3) {
    s.reps = 0;
    s.lapses = state.lapses + 1;
    s.intervalDays = 0;
    s.ease = nextEase(state.ease, q);
    s.due = now + LEARNING_STEP_MS;
    return s;
  }
  s.correctReviews = state.correctReviews + 1;
  let interval: number;
  if (state.reps === 0) interval = rating === 'easy' ? 4 : 1;
  else if (state.reps === 1) interval = rating === 'hard' ? 3 : 6;
  else interval = Math.max(1, Math.round(state.intervalDays * (rating === 'hard' ? 1.2 : state.ease)));
  s.reps = state.reps + 1;
  s.ease = nextEase(state.ease, q);
  if (rating === 'easy' && state.reps >= 2) interval = Math.round(interval * 1.3);
  s.intervalDays = interval;
  s.due = now + interval * DAY_MS;
  return s;
}

export function statusOf(s: SrsState | undefined): CardStatus {
  if (!s || s.totalReviews === 0) return 'new';
  if (s.intervalDays >= MATURE_DAYS) return 'mature';
  if (s.intervalDays < 1 || s.reps < 2) return 'learning';
  return 'review';
}

export function isDue(s: SrsState, now: number): boolean {
  return s.due <= now;
}

/** Order a review queue: overdue learning cards first, then most overdue, then hardest (lowest ease). */
export function queueOrder<T extends { srs: SrsState }>(cards: T[], now: number, mode: 'due' | 'hardest' = 'due'): T[] {
  const arr = cards.slice();
  if (mode === 'hardest') return arr.sort((a, b) => a.srs.ease - b.srs.ease || b.srs.lapses - a.srs.lapses || a.srs.due - b.srs.due);
  return arr.sort((a, b) => {
    const la = a.srs.intervalDays === 0 ? 0 : 1, lb = b.srs.intervalDays === 0 ? 0 : 1;
    if (la !== lb) return la - lb;
    return (a.srs.due - now) - (b.srs.due - now) || a.srs.ease - b.srs.ease;
  });
}

/** Map a self-reported confidence on a correct answer to a rating (guessing → "hard" so it returns sooner). */
export function ratingFromAnswer(correct: boolean, confidence: 'guess' | 'unsure' | 'sure' | null): Rating {
  if (!correct) return 'again';
  if (confidence === 'guess') return 'hard';
  if (confidence === 'sure') return 'easy';
  return 'good';
}
