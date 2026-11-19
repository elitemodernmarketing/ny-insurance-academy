/** Presentation helpers for the deductible scenario. All dollar math comes from computeCosts(). */
import type { Bill, BillLine, CostInputs } from '@/lib/medicalCost';

export const money = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);

export interface BillPreset { id: string; name: string; description: string; bills: Bill[] }
export const PRESETS: BillPreset[] = [
  {
    id: 'er', name: 'Emergency visit', description: 'ER visit with a flat copay, a specialist follow-up and a prescription.',
    bills: [
      { label: 'Emergency room visit', amount: 2000, copay: 150 },
      { label: 'Specialist follow-up', amount: 300, copay: 40 },
      { label: 'Prescription', amount: 120, copay: 20 },
    ],
  },
  {
    id: 'surgery', name: 'Planned surgery', description: 'A big hospital bill that runs into the out-of-pocket maximum.',
    bills: [
      { label: 'Surgeon and anesthesia', amount: 9000 },
      { label: 'Hospital stay', amount: 24000 },
      { label: 'Physical therapy', amount: 1800, copay: 35 },
    ],
  },
  {
    id: 'routine', name: 'Routine year', description: 'Small bills spread across the year, mostly flat copays.',
    bills: [
      { label: 'Annual checkup', amount: 220, copay: 25 },
      { label: 'Lab work', amount: 180 },
      { label: 'Urgent care', amount: 350, copay: 60 },
      { label: 'Prescriptions', amount: 90, copay: 15 },
    ],
  },
];

export const DEFAULT_INPUTS: CostInputs = { deductible: 1000, coinsurancePct: 20, outOfPocketMax: 4000, copayCountsTowardOOP: true };

/** Parse a form field to a non-negative finite number (blank / garbage becomes 0). */
export function num(s: string): number {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Plain-English explanation of one itemized line, built only from the values computeCosts() returned. */
export function explainLine(line: BillLine, inputs: CostInputs): string {
  const parts: string[] = [];
  parts.push(`The ${money(line.amount)} bill`);
  const steps: string[] = [];
  if (line.copay > 0) steps.push(`starts with a ${money(line.copay)} flat copay`);
  if (line.deductible > 0) steps.push(`${money(line.deductible)} goes toward your deductible, which you pay in full before coinsurance starts`);
  if (line.coinsurance > 0) steps.push(`you pay ${inputs.coinsurancePct}% coinsurance on the rest, which is ${money(line.coinsurance)}`);
  if (!steps.length) steps.push(line.capped ? 'needs nothing more from you' : 'has no copay, no deductible left and no coinsurance owed');
  let s = `${parts[0]} ${steps.join('; ')}.`;
  if (line.capped) s += ` Your out-of-pocket maximum was reached, so your share stops at ${money(line.patientTotal)} and the insurer pays everything above that.`;
  else if (line.deductible === 0 && line.coinsurance > 0) s += ' Your deductible was already met by earlier bills.';
  s += ` You pay ${money(line.patientTotal)} and the insurer pays ${money(line.insurerPays)}.`;
  return s;
}

export function summarizeResult(patientTotal: number, insurerTotal: number): string {
  const total = patientTotal + insurerTotal;
  const pct = total > 0 ? Math.round((patientTotal / total) * 100) : 0;
  return `Across ${money(total)} of bills you pay ${money(patientTotal)} (${pct}%) and the insurer pays ${money(insurerTotal)}.`;
}
