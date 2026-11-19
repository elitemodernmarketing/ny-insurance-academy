import { useId, useMemo, useState } from 'react';
import { Plus, Trash2, Calculator, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { computeCosts, type Bill, type CostInputs } from '@/lib/medicalCost';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Switch } from '@/components/ui/Switch';
import { DEFAULT_INPUTS, PRESETS, explainLine, money, num, summarizeResult } from './deductibleModel';
import { markScenarioComplete } from './progress';

interface DraftBill { key: string; label: string; amount: string; copay: string }
let keySeq = 0;
const nextKey = () => `b${++keySeq}`;
const toDraft = (b: Bill): DraftBill => ({ key: nextKey(), label: b.label, amount: String(b.amount), copay: b.copay ? String(b.copay) : '' });
const toBill = (d: DraftBill): Bill => ({ label: d.label.trim() || 'Bill', amount: num(d.amount), copay: d.copay.trim() === '' ? undefined : num(d.copay) });

const FIELD = 'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted';

export default function DeductibleScenario() {
  const uid = useId();
  const [ded, setDed] = useState(String(DEFAULT_INPUTS.deductible));
  const [coins, setCoins] = useState(String(DEFAULT_INPUTS.coinsurancePct));
  const [oop, setOop] = useState(String(DEFAULT_INPUTS.outOfPocketMax));
  const [copayCounts, setCopayCounts] = useState(DEFAULT_INPUTS.copayCountsTowardOOP);
  const [drafts, setDrafts] = useState<DraftBill[]>(() => PRESETS[0].bills.map(toDraft));
  const [committed, setCommitted] = useState<{ inputs: CostInputs; bills: Bill[] }>(() => ({ inputs: DEFAULT_INPUTS, bills: PRESETS[0].bills }));
  const [announce, setAnnounce] = useState('');

  const parsedInputs = (): CostInputs => ({
    deductible: num(ded), coinsurancePct: Math.min(100, num(coins)), outOfPocketMax: num(oop), copayCountsTowardOOP: copayCounts,
  });
  const coinsInvalid = num(coins) > 100;
  const oopLow = num(oop) < num(ded);

  const commit = (ds: DraftBill[] = drafts, record = true) => {
    const inputs = parsedInputs();
    const bills = ds.map(toBill);
    setCommitted({ inputs, bills });
    const r = computeCosts(inputs, bills);
    setAnnounce(`Calculated. ${summarizeResult(r.patientTotal, r.insurerTotal)}`);
    if (record) void markScenarioComplete('deductible', 'deductible', null);
  };
  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const ds = p.bills.map(toDraft);
    setDrafts(ds);
    commit(ds, false);
    setAnnounce(`Loaded the ${p.name} preset.`);
  };
  const update = (key: string, patch: Partial<DraftBill>) => setDrafts((d) => d.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const result = useMemo(() => computeCosts(committed.inputs, committed.bills), [committed]);
  const chartData = [
    ...result.lines.map((l) => ({ name: l.label, You: l.patientTotal, Insurer: l.insurerPays })),
    { name: 'Total', You: result.patientTotal, Insurer: result.insurerTotal },
  ];

  return (
    <div className="space-y-4">
      <div role="note" className="flex gap-3 rounded-xl border-2 border-warning/50 bg-warning/5 p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <p><strong>This is a simplified teaching model.</strong> Real policy terms vary: the order in which copays, the deductible and coinsurance apply, what counts toward the out-of-pocket maximum, and in-network versus out-of-network rules differ from plan to plan. Always read the actual policy.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="space-y-4" aria-label="Cost-sharing calculator">
        <Card>
          <CardHeader title="1. Plan terms" description="The cost-sharing rules for the year." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm" htmlFor={`${uid}-ded`}><span className="mb-1 block font-medium">Deductible ($)</span>
                <input id={`${uid}-ded`} inputMode="decimal" className={FIELD} value={ded} onChange={(e) => setDed(e.target.value)} data-testid="input-deductible" />
              </label>
              <label className="block text-sm" htmlFor={`${uid}-coins`}><span className="mb-1 block font-medium">Your coinsurance (%)</span>
                <input id={`${uid}-coins`} inputMode="decimal" className={FIELD} value={coins} onChange={(e) => setCoins(e.target.value)} aria-invalid={coinsInvalid} data-testid="input-coinsurance" />
                <span className="mt-1 block text-xs text-muted">Your share after the deductible; the insurer pays the rest.</span>
              </label>
              <label className="block text-sm" htmlFor={`${uid}-oop`}><span className="mb-1 block font-medium">Out-of-pocket maximum ($)</span>
                <input id={`${uid}-oop`} inputMode="decimal" className={FIELD} value={oop} onChange={(e) => setOop(e.target.value)} data-testid="input-oop" />
              </label>
            </div>
            {coinsInvalid && <p role="alert" className="mt-2 text-sm text-danger">Coinsurance above 100% is treated as 100%.</p>}
            {oopLow && <p className="mt-2 text-sm text-warning">The out-of-pocket maximum is lower than the deductible, so it will cap your costs before the deductible is fully used.</p>}
            <Switch checked={copayCounts} onCheckedChange={setCopayCounts} label="Copays count toward the out-of-pocket maximum" description="Many plans count them; some do not. Turn off to see the difference." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. Medical bills" description="Add the bills in the order they happen. Copay is optional." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bill presets">
              <span className="text-sm text-muted">Presets:</span>
              {PRESETS.map((p) => <Button key={p.id} type="button" size="sm" variant="outline" title={p.description} onClick={() => loadPreset(p.id)} data-testid={`preset-${p.id}`}>{p.name}</Button>)}
            </div>
            <ul className="space-y-2">
              {drafts.map((b, i) => (
                <li key={b.key} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_8rem_8rem_auto]">
                  <label className="col-span-2 block text-xs sm:col-span-1"><span className="mb-0.5 block font-medium text-muted">Label (bill {i + 1})</span>
                    <input className={FIELD} value={b.label} onChange={(e) => update(b.key, { label: e.target.value })} aria-label={`Bill ${i + 1} label`} />
                  </label>
                  <label className="block text-xs"><span className="mb-0.5 block font-medium text-muted">Amount ($)</span>
                    <input className={FIELD} inputMode="decimal" value={b.amount} onChange={(e) => update(b.key, { amount: e.target.value })} aria-label={`Bill ${i + 1} amount`} />
                  </label>
                  <label className="block text-xs"><span className="mb-0.5 block font-medium text-muted">Copay ($, optional)</span>
                    <input className={FIELD} inputMode="decimal" value={b.copay} onChange={(e) => update(b.key, { copay: e.target.value })} aria-label={`Bill ${i + 1} copay`} placeholder="none" />
                  </label>
                  <div className="col-span-2 flex items-end sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove bill ${i + 1}: ${b.label || 'untitled'}`} onClick={() => setDrafts((d) => d.filter((x) => x.key !== b.key))}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {!drafts.length && <p className="text-sm text-muted">No bills yet. Add one or load a preset.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setDrafts((d) => [...d, { key: nextKey(), label: `Bill ${d.length + 1}`, amount: '', copay: '' }])} data-testid="add-bill">
                <Plus className="h-4 w-4" aria-hidden />Add bill
              </Button>
              <Button type="submit" data-testid="calc-deductible"><Calculator className="h-4 w-4" aria-hidden />Calculate</Button>
            </div>
          </CardBody>
        </Card>
      </form>

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <Card>
        <CardHeader title="3. Who pays what" description={summarizeResult(result.patientTotal, result.insurerTotal)} />
        <CardBody className="space-y-4">
          {!result.lines.length ? <p className="text-sm text-muted">Add at least one bill and press Calculate.</p> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm" data-testid="cost-table">
                  <caption className="sr-only">Itemized cost sharing for each bill</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="py-2 pr-2">Bill</th>
                      <th scope="col" className="px-2 text-right">Amount</th>
                      <th scope="col" className="px-2 text-right">Copay</th>
                      <th scope="col" className="px-2 text-right">Deductible</th>
                      <th scope="col" className="px-2 text-right">Coinsurance</th>
                      <th scope="col" className="px-2 text-right">You pay</th>
                      <th scope="col" className="px-2 text-right">Insurer pays</th>
                      <th scope="col" className="pl-2">Capped?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((l, i) => (
                      <tr key={i} className="border-b border-border/60" data-testid="cost-row">
                        <th scope="row" className="py-2 pr-2 text-left font-medium">{l.label}</th>
                        <td className="px-2 text-right tabular-nums">{money(l.amount)}</td>
                        <td className="px-2 text-right tabular-nums" data-col="copay">{money(l.copay)}</td>
                        <td className="px-2 text-right tabular-nums" data-col="deductible">{money(l.deductible)}</td>
                        <td className="px-2 text-right tabular-nums" data-col="coinsurance">{money(l.coinsurance)}</td>
                        <td className="px-2 text-right font-semibold tabular-nums" data-col="patient">{money(l.patientTotal)}</td>
                        <td className="px-2 text-right tabular-nums" data-col="insurer">{money(l.insurerPays)}</td>
                        <td className="pl-2">{l.capped ? <Badge tone="warning">Capped at OOP max</Badge> : <span className="text-muted">No</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <th scope="row" className="py-2 pr-2 text-left">Totals</th>
                      <td className="px-2 text-right tabular-nums">{money(result.patientTotal + result.insurerTotal)}</td>
                      <td className="px-2 text-right tabular-nums">{money(result.lines.reduce((a, l) => a + l.copay, 0))}</td>
                      <td className="px-2 text-right tabular-nums">{money(result.lines.reduce((a, l) => a + l.deductible, 0))}</td>
                      <td className="px-2 text-right tabular-nums">{money(result.lines.reduce((a, l) => a + l.coinsurance, 0))}</td>
                      <td className="px-2 text-right tabular-nums" data-testid="total-patient">{money(result.patientTotal)}</td>
                      <td className="px-2 text-right tabular-nums" data-testid="total-insurer">{money(result.insurerTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-sm"><span>Deductible met</span><span className="tabular-nums">{money(result.deductibleMet)} of {money(committed.inputs.deductible)}</span></div>
                  <Progress value={result.deductibleMet} max={committed.inputs.deductible || 1} label="Deductible met" tone="accent" />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-sm"><span>Out-of-pocket used</span><span className="tabular-nums">{money(result.oopUsed)} of {money(committed.inputs.outOfPocketMax)}</span></div>
                  <Progress value={result.oopUsed} max={committed.inputs.outOfPocketMax || 1} label="Out-of-pocket maximum used" tone="warning" />
                </div>
              </div>

              <figure aria-label="Stacked bar chart of what you pay versus what the insurer pays for each bill">
                <figcaption className="mb-2 text-sm font-medium">What you pay vs. what the insurer pays</figcaption>
                <div className="h-64 w-full" role="img" aria-label={`Chart: ${summarizeResult(result.patientTotal, result.insurerTotal)} The itemized table above has the same numbers.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} interval={0} tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                      <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`} width={64} />
                      <RTooltip formatter={(v: number) => money(v)} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, color: 'rgb(var(--fg))' }} />
                      <Legend />
                      <Bar dataKey="You" stackId="a" fill="rgb(var(--primary))" isAnimationActive={false} />
                      <Bar dataKey="Insurer" stackId="a" fill="rgb(var(--accent))" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </figure>

              <section aria-labelledby={`${uid}-how`}>
                <h3 id={`${uid}-how`} className="mb-2 font-semibold">How each line was worked out</h3>
                <ol className="space-y-2 text-sm">
                  {result.lines.map((l, i) => (
                    <li key={i} className="rounded-lg border border-border bg-surface-2 p-3" data-testid="line-explanation"><strong>{l.label}.</strong> {explainLine(l, committed.inputs)}</li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
