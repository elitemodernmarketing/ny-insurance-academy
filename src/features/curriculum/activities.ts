/** Pure logic for the four lesson activity types. */
import type { Activity } from '@/content/schema';
import { rngFrom, shuffle } from '@/lib/rng';

type Of<T extends Activity['type']> = Extract<Activity, { type: T }>;

export interface CheckResult { correct: number; total: number; allCorrect: boolean; perItem: boolean[] }
const result = (perItem: boolean[]): CheckResult => {
  const correct = perItem.filter(Boolean).length;
  return { correct, total: perItem.length, allCorrect: correct === perItem.length, perItem };
};

/** Permutation of 0..n-1 that is guaranteed not to be the identity (for n > 1). */
export function shuffledPermutation(n: number, seed: number | string): number[] {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return base;
  const rng = rngFrom(seed);
  let p = shuffle(base, rng);
  let guard = 0;
  while (p.every((v, i) => v === i) && guard++ < 10) p = shuffle(base, rng);
  if (p.every((v, i) => v === i)) p = [...base.slice(1), base[0]];
  return p;
}

/**
 * Match: `rightOrder[displayPos]` = index of the pair shown at that position of the (shuffled) right column.
 * `assignment[leftIdx]` = the pair index of the right item chosen for that left item (or null).
 */
export function checkMatch(pairs: Of<'match'>['pairs'], assignment: (number | null)[]): CheckResult {
  return result(pairs.map((_, i) => assignment[i] === i));
}
/** Pair a left item with a right item (by pair index); a right item can only be used once. */
export function assignMatch(assignment: (number | null)[], left: number, right: number): (number | null)[] {
  const next = assignment.map((r) => (r === right ? null : r));
  next[left] = right;
  return next;
}

/** Categorize: `assignment[itemIdx]` = chosen category text (or null). */
export function checkCategorize(items: Of<'categorize'>['items'], assignment: (string | null)[]): CheckResult {
  return result(items.map((it, i) => assignment[i] === it.category));
}

/** Sequence: `order[displayPos]` = index of the original step shown at that position. */
export function checkSequence(order: number[]): CheckResult {
  return result(order.map((stepIdx, pos) => stepIdx === pos));
}
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** True/False: `answers[i]` = learner's answer (or null). */
export function checkTrueFalse(statements: Of<'truefalse'>['statements'], answers: (boolean | null)[]): CheckResult {
  return result(statements.map((s, i) => answers[i] === s.answer));
}

/** Number of items in the activity (what "complete" means for the Check button). */
export function activitySize(a: Activity): number {
  switch (a.type) {
    case 'match': return a.pairs.length;
    case 'categorize': return a.items.length;
    case 'sequence': return a.steps.length;
    case 'truefalse': return a.statements.length;
  }
}
