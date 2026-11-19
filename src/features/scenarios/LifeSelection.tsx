import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, MinusCircle, XCircle, RotateCcw, ChevronRight } from 'lucide-react';
import { content } from '@/content';
import type { ClientProfile } from '@/content/schema';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { TermLink } from '@/components/ui/Markdown';
import { VerificationBadge } from '@/components/ui/Verification';
import { cn } from '@/components/ui/cn';
import { PendingContent } from './ScenarioFrame';
import { markScenarioComplete, useScenarioProgress } from './progress';

type Quality = 'best' | 'acceptable' | 'poor';
const Q: Record<Quality, { label: string; tone: 'success' | 'warning' | 'danger'; Icon: typeof CheckCircle2; points: number }> = {
  best: { label: 'Best choice', tone: 'success', Icon: CheckCircle2, points: 1 },
  acceptable: { label: 'Acceptable', tone: 'warning', Icon: MinusCircle, points: 0.5 },
  poor: { label: 'Poor choice', tone: 'danger', Icon: XCircle, points: 0 },
};

export function scoreDecisions(picks: Quality[]): { pct: number; counts: Record<Quality, number> } {
  const counts: Record<Quality, number> = { best: 0, acceptable: 0, poor: 0 };
  picks.forEach((p) => counts[p]++);
  const pct = picks.length ? Math.round((picks.reduce((a, p) => a + Q[p].points, 0) / picks.length) * 100) : 0;
  return { pct, counts };
}

export default function LifeSelection() {
  const profiles = content.clientProfiles;
  const progress = useScenarioProgress();
  const [profileId, setProfileId] = useState<string | null>(null);
  const profile = profiles.find((p) => p.id === profileId) ?? null;

  if (!profiles.length) return <PendingContent what="client profiles" />;
  if (!profile) {
    return (
      <section aria-labelledby="pick-client">
        <h2 id="pick-client" className="mb-3 text-lg font-semibold">Choose a client</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => {
            const done = progress.get(`life-selection:${p.id}`);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setProfileId(p.id)} data-testid="life-profile"
                  className="flex h-full w-full flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{p.name}, {p.age}</span>
                    {done && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed{done.score !== null ? ` · ${done.score}%` : ''}</Badge>}
                  </span>
                  <span className="mt-1 text-sm text-muted">{p.summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return <ProfileRun key={profile.id} profile={profile} onExit={() => setProfileId(null)} />;
}

function ProfileRun({ profile, onExit }: { profile: ClientProfile; onExit: () => void }) {
  const [step, setStep] = useState(0); // 0..decisions.length-1, then decisions.length = summary
  const [picks, setPicks] = useState<(number | null)[]>(() => profile.decisions.map(() => null));
  const saved = useRef(false);
  const total = profile.decisions.length;
  const finished = step >= total;
  const qualities = useMemo(() => picks.map((p, i) => (p === null ? null : profile.decisions[i].options[p].quality)), [picks, profile]);
  const { pct, counts } = scoreDecisions(qualities.filter((q): q is Quality => q !== null));

  const finish = () => {
    setStep(total);
    if (!saved.current) { saved.current = true; void markScenarioComplete(`life-selection:${profile.id}`, 'life-selection', pct); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`${profile.name}, age ${profile.age}`} description={profile.summary}
          action={<Button variant="ghost" size="sm" onClick={onExit}>Change client</Button>} />
        <CardBody>
          <table className="w-full text-sm">
            <caption className="sr-only">Client facts</caption>
            <tbody>
              {profile.facts.map((f) => (
                <tr key={f.label} className="border-t border-border first:border-0">
                  <th scope="row" className="w-2/5 py-1.5 pr-3 text-left font-medium text-muted">{f.label}</th>
                  <td className="py-1.5">{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 rounded-lg bg-primary/5 p-3 text-sm"><strong>Client goal:</strong> {profile.goal}</p>
        </CardBody>
      </Card>

      {!finished ? (
        <DecisionStep key={step} index={step} total={total} decision={profile.decisions[step]} picked={picks[step]}
          onPick={(o) => setPicks((p) => p.map((v, i) => (i === step ? o : v)))}
          onNext={() => (step + 1 >= total ? finish() : setStep(step + 1))} last={step + 1 >= total} />
      ) : (
        <Card>
          <CardHeader title="Summary" description={`You made ${total} decisions for ${profile.name}.`} action={<VerificationBadge v={profile.verification} nySpecific={profile.nySpecific} />} />
          <CardBody className="space-y-4">
            <div aria-live="polite" className="flex flex-wrap items-center gap-3">
              <span className="text-3xl font-bold tabular-nums">{pct}%</span>
              <Badge tone="success">{counts.best} best</Badge><Badge tone="warning">{counts.acceptable} acceptable</Badge><Badge tone="danger">{counts.poor} poor</Badge>
            </div>
            <ol className="space-y-2 text-sm">
              {profile.decisions.map((d, i) => {
                const q = qualities[i];
                return (
                  <li key={i} className="rounded-lg border border-border p-3">
                    <div className="font-medium">{i + 1}. {d.prompt}</div>
                    <div className="mt-1 text-muted">You chose: {picks[i] !== null ? d.options[picks[i]!].text : 'no answer'}{q && <> — <span className="font-medium text-fg">{Q[q].label}</span></>}</div>
                  </li>
                );
              })}
            </ol>
            <div>
              <h3 className="font-semibold">Key takeaways</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{profile.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            {profile.concepts.length > 0 && (
              <div>
                <h3 className="font-semibold">Review these concepts</h3>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">{profile.concepts.map((c) => <TermLink key={c} id={c} />)}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { saved.current = false; setPicks(profile.decisions.map(() => null)); setStep(0); }}><RotateCcw className="h-4 w-4" aria-hidden />Try again</Button>
              <Button variant="outline" onClick={onExit}>Choose another client</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function DecisionStep({ index, total, decision, picked, onPick, onNext, last }: {
  index: number; total: number; decision: ClientProfile['decisions'][number]; picked: number | null;
  onPick: (i: number) => void; onNext: () => void; last: boolean;
}) {
  const chosen = picked !== null ? decision.options[picked] : null;
  return (
    <Card>
      <CardHeader title={`Decision ${index + 1} of ${total}`} description={decision.prompt} />
      <CardBody className="space-y-3">
        <Progress value={index + (chosen ? 1 : 0)} max={total} label="Decisions completed" />
        <div role="group" aria-label="Options" className="space-y-2">
          {decision.options.map((o, i) => {
            const isPicked = picked === i;
            return (
              <button key={i} type="button" disabled={picked !== null} aria-pressed={isPicked} data-testid="life-option" onClick={() => onPick(i)}
                className={cn('w-full rounded-lg border p-3 text-left text-sm transition-colors', isPicked ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-2', picked !== null && !isPicked && 'opacity-70')}>
                {o.text}
              </button>
            );
          })}
        </div>
        <div aria-live="polite">
          {chosen && (() => {
            const q = Q[chosen.quality];
            return (
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm animate-fade-in">
                <Badge tone={q.tone}><q.Icon className="h-3 w-3" aria-hidden />{q.label}</Badge>
                <p className="mt-2">{chosen.feedback}</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-primary">See what the other options mean</summary>
                  <ul className="mt-2 space-y-2">
                    {decision.options.map((o, i) => i === picked ? null : (
                      <li key={i} className="rounded-md border border-border bg-surface p-2">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{o.text}</span><Badge tone={Q[o.quality].tone}>{Q[o.quality].label}</Badge></div>
                        <p className="mt-1 text-muted">{o.feedback}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            );
          })()}
        </div>
        {chosen && <Button onClick={onNext} data-testid="life-next">{last ? 'See summary' : 'Next decision'}<ChevronRight className="h-4 w-4" aria-hidden /></Button>}
      </CardBody>
    </Card>
  );
}
