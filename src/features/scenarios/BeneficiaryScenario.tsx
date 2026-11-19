import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Eye, Target } from 'lucide-react';
import { content } from '@/content';
import type { BeneficiaryCase } from '@/content/schema';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TermLink } from '@/components/ui/Markdown';
import { VerificationBadge, SourceList } from '@/components/ui/Verification';
import { cn } from '@/components/ui/cn';
import { PendingContent } from './ScenarioFrame';
import { DISTRIBUTION_LABEL, comparePrediction, predictionNames, shareTotals, sumPayouts, type PredictionResult } from './beneficiaryHelpers';
import { money, num } from './deductibleModel';
import { markScenarioComplete, useScenarioProgress } from './progress';

export default function BeneficiaryScenario() {
  const cases = content.beneficiaryCases;
  const progress = useScenarioProgress();
  const [caseId, setCaseId] = useState<string | null>(null);
  const current = cases.find((c) => c.id === caseId) ?? null;
  if (!cases.length) return <PendingContent what="beneficiary cases" />;
  if (!current) {
    return (
      <section aria-labelledby="pick-case">
        <h2 id="pick-case" className="mb-3 text-lg font-semibold">Choose a case</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {cases.map((c) => {
            const done = progress.get(`beneficiary:${c.id}`);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setCaseId(c.id)} data-testid="beneficiary-case"
                  className="flex h-full w-full flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{c.title}</span>
                    {done && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed{done.score !== null ? ` · ${done.score}%` : ''}</Badge>}</span>
                  <span className="mt-1 text-sm text-muted">{c.setup}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return <CaseRun key={current.id} c={current} onExit={() => setCaseId(null)} />;
}

function Designee({ b }: { b: { name: string; relation: string; sharePct: number } }) {
  return <li className="flex justify-between gap-2"><span>{b.name} <span className="text-muted">({b.relation})</span></span><span className="tabular-nums">{b.sharePct}%</span></li>;
}

function CaseRun({ c, onExit }: { c: BeneficiaryCase; onExit: () => void }) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, PredictionResult | 'skipped'>>({});
  const [guess, setGuess] = useState<Record<string, string>>({});
  const saved = useRef(false);
  const names = useMemo(() => predictionNames(c), [c]);
  const event = c.events.find((e) => e.id === eventId) ?? null;
  const d = c.designation;
  const totals = shareTotals(c);

  const reveal = (skip: boolean) => {
    if (!event) return;
    const result: PredictionResult | 'skipped' = skip
      ? 'skipped'
      : comparePrediction(Object.fromEntries(Object.entries(guess).map(([k, v]) => [k, num(v)])), event.payouts);
    const next = { ...revealed, [event.id]: result };
    setRevealed(next);
    if (!saved.current && c.events.every((e) => next[e.id])) {
      saved.current = true;
      const right = c.events.filter((e) => { const r = next[e.id]; return r !== 'skipped' && r.allCorrect; }).length;
      void markScenarioComplete(`beneficiary:${c.id}`, 'beneficiary', Math.round((right / c.events.length) * 100));
    }
  };
  const select = (id: string) => { setEventId(id); setGuess({}); };
  const result = event ? revealed[event.id] : undefined;
  const doneCount = c.events.filter((e) => revealed[e.id]).length;
  const correctCount = c.events.filter((e) => { const r = revealed[e.id]; return r && r !== 'skipped' && r.allCorrect; }).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={c.title} description={c.setup} action={<Button variant="ghost" size="sm" onClick={onExit}>Change case</Button>} />
        <CardBody className="space-y-3">
          <h3 className="font-semibold">The beneficiary designation on file</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Face amount</dt><dd className="text-lg font-semibold tabular-nums">{money(c.faceAmount)}</dd></div>
            <div><dt className="text-muted">Designation</dt><dd className="font-medium">{d.revocable ? 'Revocable' : 'Irrevocable'} <span className="font-normal text-muted">— {d.revocable ? 'the owner may change it' : 'the beneficiary must consent to a change'}</span></dd></div>
            <div><dt className="text-muted">Primary beneficiaries</dt>
              <dd>{d.primary.length ? <ul className="mt-1 space-y-1">{d.primary.map((b, i) => <Designee key={i} b={b} />)}</ul> : 'None named'}</dd></div>
            <div><dt className="text-muted">Contingent beneficiaries</dt>
              <dd>{d.contingent.length ? <ul className="mt-1 space-y-1">{d.contingent.map((b, i) => <Designee key={i} b={b} />)}</ul> : 'None named'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">If a beneficiary dies first</dt><dd>{DISTRIBUTION_LABEL[d.distribution]}</dd></div>
          </dl>
          {(totals.primary !== 100 && d.primary.length > 0) && <p className="text-xs text-warning">Note: primary shares in this case add up to {totals.primary}%.</p>}
          {c.concepts.length > 0 && <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm"><span className="text-muted">Concepts:</span>{c.concepts.map((x) => <TermLink key={x} id={x} />)}</p>}
          <div className="flex flex-wrap items-center gap-2"><VerificationBadge v={c.verification} nySpecific={c.nySpecific} /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What happens when…?" description={`Pick an event. Predict the payout first, then reveal it. ${doneCount} of ${c.events.length} events revealed${doneCount ? `, ${correctCount} predicted correctly` : ''}.`} />
        <CardBody className="space-y-4">
          <div role="group" aria-label="Events" className="flex flex-wrap gap-2">
            {c.events.map((e) => {
              const r = revealed[e.id];
              return (
                <button key={e.id} type="button" onClick={() => select(e.id)} aria-pressed={eventId === e.id} data-testid="beneficiary-event"
                  className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors', eventId === e.id ? 'border-primary bg-primary/10 font-medium' : 'border-border bg-surface hover:bg-surface-2')}>
                  {r && (r !== 'skipped' && r.allCorrect ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="predicted correctly" /> : <Eye className="h-4 w-4 text-muted" aria-label="revealed" />)}
                  {e.label}
                </button>
              );
            })}
          </div>

          {event && !result && (
            <form className="rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); reveal(false); }} aria-label={`Predict payout: ${event.label}`}>
              <h3 className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" aria-hidden />Your prediction: {event.label}</h3>
              <p className="mt-1 text-sm text-muted">Enter how much each person receives from the {money(c.faceAmount)} policy. Leave blank for $0.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {names.map((n) => (
                  <label key={n} className="block text-sm"><span className="mb-0.5 block font-medium">{n} ($)</span>
                    <input inputMode="decimal" className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" value={guess[n] ?? ''} onChange={(e) => setGuess((g) => ({ ...g, [n]: e.target.value }))} data-testid="beneficiary-guess" />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="submit" data-testid="beneficiary-check"><Eye className="h-4 w-4" aria-hidden />Check my prediction</Button>
                <Button type="button" variant="outline" onClick={() => reveal(true)}>Just show me the outcome</Button>
              </div>
            </form>
          )}

          <div aria-live="polite">
            {event && result && (
              <div className="space-y-3 animate-fade-in" data-testid="beneficiary-outcome">
                {result === 'skipped'
                  ? <Badge tone="neutral"><Eye className="h-3 w-3" aria-hidden />Revealed without a prediction</Badge>
                  : result.allCorrect
                    ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Your prediction was correct</Badge>
                    : <Badge tone="warning"><XCircle className="h-3 w-3" aria-hidden />Your prediction differs from the outcome</Badge>}
                <p className="text-sm">{event.outcome}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[22rem] text-sm">
                    <caption className="sr-only">Payout table for {event.label}</caption>
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="py-1.5 pr-2">Recipient</th>
                      {result !== 'skipped' && <th scope="col" className="px-2 text-right">Your prediction</th>}
                      <th scope="col" className="px-2 text-right">Actual payout</th>
                      {result !== 'skipped' && <th scope="col" className="pl-2">Match</th>}
                    </tr></thead>
                    <tbody>
                      {(result === 'skipped' ? event.payouts.map((p) => ({ name: p.name, predicted: 0, actual: p.amount, match: true })) : result.rows).map((r) => (
                        <tr key={r.name} className="border-b border-border/60">
                          <th scope="row" className="py-1.5 pr-2 text-left font-medium">{r.name}</th>
                          {result !== 'skipped' && <td className="px-2 text-right tabular-nums">{money(r.predicted)}</td>}
                          <td className="px-2 text-right font-semibold tabular-nums">{money(r.actual)}</td>
                          {result !== 'skipped' && <td className="pl-2">{r.match ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />Yes</span> : <span className="inline-flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" aria-hidden />No</span>}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="font-semibold"><th scope="row" className="py-1.5 pr-2 text-left">Total paid</th>{result !== 'skipped' && <td />}<td className="px-2 text-right tabular-nums">{money(sumPayouts(event.payouts))}</td>{result !== 'skipped' && <td />}</tr></tfoot>
                  </table>
                </div>
                <Button variant="outline" size="sm" onClick={() => setRevealed((r) => { const n = { ...r }; delete n[event.id]; return n; })}>Predict this event again</Button>
              </div>
            )}
          </div>
          {!event && <p className="text-sm text-muted">Select an event above to begin.</p>}
          {doneCount === c.events.length && <p className="rounded-lg bg-success/10 p-3 text-sm text-success" role="status">Case complete. You predicted {correctCount} of {c.events.length} events correctly.</p>}
          <SourceList ids={c.sources} />
        </CardBody>
      </Card>
    </div>
  );
}
