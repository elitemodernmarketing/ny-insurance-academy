/**
 * Exam blueprint allocation and assembly.
 *
 * Allocation uses the largest-remainder (Hamilton) method on the official section weights.
 * For 150 questions the 17-55 weights produce 147 whole items plus six sections tied at a .5 remainder
 * (reg, ann, ls, ahb, grp, gov). The remaining 3 items go to tied sections chosen with the exam's seed, so
 * different exams rotate which half-sections receive the extra item. The real PSI allocation of these
 * fractional items is not published.
 */
import { shuffle, rngFrom, type Rng } from './rng';

export interface WeightedSection { id: string; weightPct: number }
export type Allocation = Record<string, number>;

export function allocate(total: number, sections: WeightedSection[], seed: number | string = 0): Allocation {
  const weightSum = sections.reduce((a, s) => a + s.weightPct, 0);
  if (weightSum <= 0) throw new Error('weights must be positive');
  const rng = rngFrom(seed);
  const raw = sections.map((s) => ({ id: s.id, exact: (total * s.weightPct) / weightSum }));
  const out: Allocation = {};
  let assigned = 0;
  for (const r of raw) {
    out[r.id] = Math.floor(r.exact + 1e-9);
    assigned += out[r.id];
  }
  let remaining = total - assigned;
  // Group by remainder (rounded to avoid FP noise), largest first; ties broken by seeded shuffle.
  const withRem = raw.map((r) => ({ id: r.id, rem: Math.round((r.exact - Math.floor(r.exact + 1e-9)) * 1e6) / 1e6 }));
  const groups = new Map<number, string[]>();
  for (const w of withRem) groups.set(w.rem, [...(groups.get(w.rem) ?? []), w.id]);
  const rems = [...groups.keys()].sort((a, b) => b - a);
  for (const rem of rems) {
    if (remaining <= 0 || rem <= 0) break;
    const ids = shuffle(groups.get(rem)!, rng);
    for (const id of ids) {
      if (remaining <= 0) break;
      out[id] += 1;
      remaining--;
    }
  }
  return out;
}

export interface PoolQuestion { id: string; sectionId: string }
export interface Shortfall { sectionId: string; required: number; available: number }
export interface AssembledExam { questionIds: string[]; allocation: Allocation; shortfalls: Shortfall[] }

/**
 * Pick questions per section according to `allocation`, never repeating a question.
 * If a section has too few eligible questions, it reports a shortfall instead of duplicating items.
 * `exposure` (times seen) lets callers prefer fresher questions; ties are broken by seeded randomness.
 */
export function assembleExam(
  pool: PoolQuestion[],
  allocation: Allocation,
  seed: number | string,
  exposure: Record<string, number> = {},
): AssembledExam {
  const rng: Rng = rngFrom(seed);
  const bySection = new Map<string, PoolQuestion[]>();
  for (const q of pool) bySection.set(q.sectionId, [...(bySection.get(q.sectionId) ?? []), q]);
  const picked: string[] = [];
  const shortfalls: Shortfall[] = [];
  const seen = new Set<string>();
  for (const [sectionId, need] of Object.entries(allocation)) {
    if (need <= 0) continue;
    const candidates = shuffle(
      (bySection.get(sectionId) ?? []).filter((q) => !seen.has(q.id)),
      rng,
    ).sort((a, b) => (exposure[a.id] ?? 0) - (exposure[b.id] ?? 0));
    if (candidates.length < need) shortfalls.push({ sectionId, required: need, available: candidates.length });
    for (const q of candidates.slice(0, need)) {
      picked.push(q.id);
      seen.add(q.id);
    }
  }
  return { questionIds: shuffle(picked, rng), allocation, shortfalls };
}

/** Minimum eligible questions per section needed to build one full exam (ceil of each exact share). */
export function minimumBankForFullExam(total: number, sections: WeightedSection[]): Allocation {
  const weightSum = sections.reduce((a, s) => a + s.weightPct, 0);
  return Object.fromEntries(sections.map((s) => [s.id, Math.ceil((total * s.weightPct) / weightSum - 1e-9)]));
}
