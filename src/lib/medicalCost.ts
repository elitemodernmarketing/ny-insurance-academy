/**
 * Simplified medical cost-sharing calculator for teaching (Scenario 2).
 * Order applied to each covered bill: copayment (if the service has one, and does not count toward the deductible
 * in this simplified model unless `copayCountsTowardOOP`), then deductible, then coinsurance, with everything the
 * patient pays capped by the out-of-pocket maximum. Real policies vary — this is an illustrative model only.
 */
export interface CostInputs {
  deductible: number;
  coinsurancePct: number; // the insured's share, e.g. 20
  outOfPocketMax: number;
  copayCountsTowardOOP: boolean;
}
export interface Bill { label: string; amount: number; copay?: number }
export interface BillLine {
  label: string; amount: number;
  copay: number; deductible: number; coinsurance: number; patientTotal: number; insurerPays: number;
  capped: boolean;
}
export interface CostResult { lines: BillLine[]; patientTotal: number; insurerTotal: number; deductibleMet: number; oopUsed: number }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function computeCosts(inputs: CostInputs, bills: Bill[]): CostResult {
  let dedRemaining = Math.max(0, inputs.deductible);
  let oopRemaining = Math.max(0, inputs.outOfPocketMax);
  const lines: BillLine[] = [];
  for (const b of bills) {
    const amount = Math.max(0, b.amount);
    let copay = Math.min(b.copay ?? 0, amount);
    let rest = amount - copay;
    let ded = Math.min(dedRemaining, rest);
    rest -= ded;
    let coins = r2(rest * (inputs.coinsurancePct / 100));
    // Apply OOP cap
    let capped = false;
    const countsCopay = inputs.copayCountsTowardOOP ? copay : 0;
    const wouldPayTowardOOP = countsCopay + ded + coins;
    if (wouldPayTowardOOP > oopRemaining) {
      capped = true;
      let room = oopRemaining - countsCopay;
      if (room < 0) { copay = r2(copay + room); room = 0; }
      ded = Math.min(ded, room);
      room -= ded;
      coins = r2(Math.min(coins, room));
    }
    dedRemaining = r2(dedRemaining - ded);
    oopRemaining = r2(oopRemaining - ((inputs.copayCountsTowardOOP ? copay : 0) + ded + coins));
    const patientTotal = r2(copay + ded + coins);
    lines.push({ label: b.label, amount, copay: r2(copay), deductible: r2(ded), coinsurance: coins, patientTotal, insurerPays: r2(amount - patientTotal), capped });
  }
  const patientTotal = r2(lines.reduce((a, l) => a + l.patientTotal, 0));
  return {
    lines,
    patientTotal,
    insurerTotal: r2(lines.reduce((a, l) => a + l.insurerPays, 0)),
    deductibleMet: r2(Math.max(0, inputs.deductible) - dedRemaining),
    oopUsed: r2(Math.max(0, inputs.outOfPocketMax) - oopRemaining),
  };
}
