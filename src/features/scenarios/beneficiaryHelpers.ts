import type { BeneficiaryCase } from '@/content/schema';

export const DISTRIBUTION_LABEL: Record<BeneficiaryCase['designation']['distribution'], string> = {
  'per-capita': 'Per capita (surviving beneficiaries in the class share equally)',
  'per-stirpes': 'Per stirpes (a deceased beneficiary’s share passes to that person’s descendants)',
  'named-shares': 'Named shares (each beneficiary receives the stated percentage)',
};

export const ESTATE_LABEL = 'Insured’s estate / someone else';

/** Names a learner can put a prediction on: every named beneficiary, plus the estate. */
export function predictionNames(c: BeneficiaryCase): string[] {
  const names: string[] = [];
  for (const b of [...c.designation.primary, ...c.designation.contingent]) if (!names.includes(b.name)) names.push(b.name);
  names.push(ESTATE_LABEL);
  return names;
}

export function sumPayouts(p: { amount: number }[]): number {
  return Math.round(p.reduce((a, x) => a + x.amount, 0) * 100) / 100;
}

export interface PredictionRow { name: string; predicted: number; actual: number; match: boolean }
export interface PredictionResult { rows: PredictionRow[]; allCorrect: boolean }

const norm = (s: string) => s.trim().toLowerCase();
/** Compare a learner's per-person prediction with the actual payouts (within one dollar). Unlisted people count as $0. */
export function comparePrediction(predicted: Record<string, number>, actual: { name: string; amount: number }[]): PredictionResult {
  const names: string[] = [];
  const add = (n: string) => { if (!names.some((x) => norm(x) === norm(n))) names.push(n); };
  actual.forEach((a) => add(a.name));
  Object.entries(predicted).forEach(([n, v]) => { if (v > 0) add(n); });
  const rows = names.map((name) => {
    const p = Object.entries(predicted).find(([k]) => norm(k) === norm(name))?.[1] ?? 0;
    const a = actual.filter((x) => norm(x.name) === norm(name)).reduce((s, x) => s + x.amount, 0);
    return { name, predicted: p, actual: a, match: Math.abs(p - a) <= 1 };
  });
  return { rows, allCorrect: rows.every((r) => r.match) };
}

/** Warn when designation shares do not add up (teaching cases normally do). */
export function shareTotals(c: BeneficiaryCase): { primary: number; contingent: number } {
  const sum = (xs: { sharePct: number }[]) => Math.round(xs.reduce((a, x) => a + x.sharePct, 0) * 100) / 100;
  return { primary: sum(c.designation.primary), contingent: sum(c.designation.contingent) };
}
