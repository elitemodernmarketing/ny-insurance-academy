import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Play, RotateCcw, Target, Timer as TimerIcon, Trash2 } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { questionHistory, type QuestionHistory } from '@/db/repo';
import { useSettings } from '@/db/hooks';
import { newSeed } from '@/lib/rng';
import { correctNeeded } from '@/lib/scoring';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Callout, EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { bankSizeBySection } from '../practice/bank';
import { CUSTOM_EXAM_SIZES, createExamSession, discardExam, examLabel, missingTotal, planExam, formatDuration, type ExamPlan } from './examService';

const DISCLAIMER = 'Practice exam scores are study tools. They do not predict or guarantee your result on the real PSI exam.';

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ExamHome() {
  const nav = useNavigate();
  const settings = useSettings();
  const exam = content.manifest.exam;
  const [history, setHistory] = useState<QuestionHistory | null>(null);
  const [seed] = useState(() => newSeed());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => { let live = true; void questionHistory().then((h) => { if (live) setHistory(h); }); return () => { live = false; }; }, []);
  const inProgress = useLiveQuery(() => db.examSessions.where('status').equals('in-progress').reverse().sortBy('startedAt').then((r) => r.filter((x) => (x.track ?? 'ny-17-55') === content.manifest.id)), []);
  const submitted = useLiveQuery(async () => (await db.examSessions.where('status').equals('submitted').toArray()).filter((x) => (x.track ?? 'ny-17-55') === content.manifest.id).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0)), []);
  const sizes = useMemo(() => bankSizeBySection(), []);
  const totalBank = content.questions.length;

  const plans = useMemo(() => {
    if (!history) return null;
    const mk = (k: 'full' | 'custom', n: number) => planExam(k, n, seed + n, { exposure: history.exposure });
    return {
      full: mk('full', exam.questionCount),
      custom: Object.fromEntries(CUSTOM_EXAM_SIZES.map((n) => [n, mk('custom', n)])) as Record<number, ExamPlan>,
    };
  }, [history, seed, exam.questionCount]);

  async function begin(plan: ExamPlan, key: string) {
    setBusy(key); setError(null);
    try {
      const row = await createExamSession(plan);
      nav(`/exam/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the exam');
      setBusy(null);
    }
  }

  const full = plans?.full;
  const fullShort = !!full && full.shortfalls.length > 0;
  const sectionRows = content.sections.map((s) => ({
    s, need: full?.allocation[s.id] ?? 0, have: sizes[s.id] ?? 0,
  }));
  const passCorrect = correctNeeded(exam.questionCount, exam.passingPercent);

  if (totalBank === 0) {
    return (
      <div>
        <PageHeader title="Mock Examinations" description={`Timed practice exams modeled on the PSI Series ${content.manifest.series} format.`} />
        <EmptyState title="The question bank is still being prepared" action={<ButtonLink to="/learn" variant="outline">Study lessons meanwhile</ButtonLink>}>
          No eligible questions are loaded yet, so there is nothing to build an exam from.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mock Examinations" description={`Timed practice exams with no feedback until you submit, like the real thing. The official exam has ${exam.questionCount} questions, ${exam.timeLimitMinutes} minutes, and ${exam.passingPercent}% to pass.`} />

      {inProgress && inProgress.length > 0 && (
        <Card>
          <CardHeader title="Exams in progress" description="The clock keeps running while the exam is open or closed: the deadline is fixed when you start." />
          <CardBody>
            <ul className="divide-y divide-border">
              {inProgress.map((e) => {
                const expired = Date.now() >= e.deadline;
                return (
                  <li key={e.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid="exam-in-progress">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{examLabel(e)}</div>
                      <div className="mt-1 text-xs text-muted">Started {fmtDate(e.startedAt)} · {Object.keys(e.answers).length} of {e.questionIds.length} answered · {expired ? 'time is up (will be submitted when opened)' : `${formatDuration(Math.max(0, e.deadline - Date.now()))} left`}</div>
                    </div>
                    <div className="flex gap-2">
                      <ButtonLink to={`/exam/${e.id}`} size="sm" data-testid="resume-exam"><RotateCcw className="h-4 w-4" aria-hidden />{expired ? 'Open and submit' : 'Resume'}</ButtonLink>
                      <Button size="sm" variant="outline" onClick={() => setDiscard({ id: e.id, label: examLabel(e) })} aria-label={`Discard ${examLabel(e)}`}><Trash2 className="h-4 w-4" aria-hidden />Discard</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={<span className="flex flex-wrap items-center gap-2">Full Exam (official format) <Badge tone="primary">{exam.questionCount} questions</Badge></span>}
          description={`${exam.questionCount} unique questions, ${exam.timeLimitMinutes}-minute countdown, passing score ${exam.passingPercent}% (${passCorrect} correct). Questions follow the verified section weights.`} />
        <CardBody className="space-y-4">
          {!plans ? <Spinner label="Building exam plan" /> : (
            <>
              {fullShort ? (
                <div role="alert" className="rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm" data-testid="exam-shortfall">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Not enough questions for a full {exam.questionCount}-question exam yet</p>
                  <p className="mt-1">The bank has {totalBank} eligible question{totalBank === 1 ? '' : 's'}; {missingTotal(full!.shortfalls)} of the {exam.questionCount} slots cannot be filled from the right sections ({full!.shortfalls.length} section{full!.shortfalls.length === 1 ? '' : 's'} short). Questions are never repeated to fill the gap.</p>
                  <p className="mt-1">You can take a <strong>shortened exam</strong> of {full!.size} questions in {full!.timeLimitMin} minutes (same time per question). It is labeled as shortened and is not counted as an official-format exam.</p>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />The bank covers every section of a full exam.</p>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[30rem] text-sm" data-testid="exam-allocation">
                  <caption className="sr-only">Full exam questions per section compared with eligible questions available</caption>
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                    <tr><th scope="col" className="px-3 py-2">Section</th><th scope="col" className="px-3 py-2 text-right">Weight</th><th scope="col" className="px-3 py-2 text-right">On exam</th><th scope="col" className="px-3 py-2 text-right">In bank</th><th scope="col" className="px-3 py-2">Coverage</th></tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(({ s, need, have }) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-3 py-1.5">{s.shortName}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted">{s.weightPct}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{need}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{have}</td>
                        <td className="px-3 py-1.5">{have >= need ? <Badge tone="success">OK</Badge> : <Badge tone="warning">short by {need - have}</Badge>}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">100%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{sectionRows.reduce((a, r) => a + r.need, 0)}</td><td className="px-3 py-2 text-right tabular-nums">{totalBank}</td><td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">The official outline does not publish how the fractional items are distributed, so the last few slots rotate between equally weighted sections from one exam to the next.</p>

              <div className="flex flex-wrap items-center gap-3">
                {fullShort ? (
                  <Button size="lg" variant="outline" onClick={() => void begin(full!, 'full')} disabled={full!.size === 0 || busy !== null} data-testid="start-full-exam">
                    <Play className="h-4 w-4" aria-hidden />Start shortened exam ({full!.size} questions)
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => void begin(full!, 'full')} disabled={busy !== null} data-testid="start-full-exam"><Play className="h-4 w-4" aria-hidden />{busy === 'full' ? 'Starting…' : `Start full exam (${full!.size} questions)`}</Button>
                )}
                <span className="inline-flex items-center gap-1 text-sm text-muted"><Clock className="h-4 w-4" aria-hidden />{fullShort ? full!.timeLimitMin : exam.timeLimitMinutes} minutes</span>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="custom-h">
        <h2 id="custom-h" className="mb-1 text-lg font-semibold">Custom practice exams</h2>
        <p className="mb-3 text-sm text-muted">Custom practice — not an official exam format. One minute per question, same blueprint weighting, no feedback until you submit.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CUSTOM_EXAM_SIZES.map((n) => {
            const p = plans?.custom[n];
            const short = !!p && p.shortfalls.length > 0;
            return (
              <Card key={n}>
                <CardBody className="space-y-2 pt-4">
                  <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" aria-hidden /><h3 className="text-base font-semibold">{n} questions</h3></div>
                  <p className="flex items-center gap-1 text-sm text-muted"><TimerIcon className="h-4 w-4" aria-hidden />{p ? p.timeLimitMin : n} minutes</p>
                  {short && p.size > 0 && <p className="text-xs text-warning" data-testid={`custom-short-${n}`}>Only {p.size} of {n} questions can be drawn with the blueprint weights. This exam will be shorter, with {p.timeLimitMin} minutes.</p>}
                  {p && p.size === 0 && <p className="text-xs text-warning">No eligible questions yet.</p>}
                  <Button className="w-full" variant="outline" disabled={!p || p.size === 0 || busy !== null} onClick={() => p && void begin(p, `c${n}`)} data-testid={`start-custom-exam-${n}`}>
                    <Play className="h-4 w-4" aria-hidden />{busy === `c${n}` ? 'Starting…' : p && short ? `Start ${p.size}-question exam` : `Start ${n}-question exam`}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardBody className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start">
          <Target className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="text-sm">
            <p><strong>Official passing score: {exam.passingPercent}%.</strong> Your optional practice target is <strong data-testid="practice-target">{settings.practiceTarget}%</strong>, a buffer of {Math.max(0, settings.practiceTarget - exam.passingPercent)} points above the pass mark. You can change it in <Link to="/settings" className="font-medium text-primary hover:underline">Settings</Link>.</p>
            <p className="mt-1 text-muted">{DISCLAIMER}</p>
            {exam.experimentalItemsNote && <p className="mt-1 text-muted">{exam.experimentalItemsNote}</p>}
          </div>
        </CardBody>
      </Card>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 text-lg font-semibold">Exam history</h2>
        {!submitted || submitted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">No submitted exams yet. Your scores will be listed here with a link to the full results.</p>
        ) : (
          <ul className="space-y-2">
            {submitted.map((e) => (
              <li key={e.id}>
                <Link to={`/exam/${e.id}/results`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2" data-testid="exam-history-item">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{examLabel(e)}</span>
                    <span className="block text-xs text-muted">{fmtDate(e.submittedAt ?? e.startedAt)}{e.autoSubmitted && ' · auto-submitted when time ran out'}</span>
                  </span>
                  <span className="text-lg font-bold tabular-nums">{e.result ? `${e.result.pct}%` : '—'}</span>
                  {e.result && <Badge tone={e.result.passed ? 'success' : 'danger'}>{e.result.passed ? 'Pass' : 'Below pass mark'}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Callout kind="note">{DISCLAIMER}</Callout>

      <Dialog open={!!discard} onOpenChange={(o) => { if (!o) setDiscard(null); }} title="Discard this exam?"
        description={discard ? `"${discard.label}" will be removed without scoring. Nothing is recorded to your history.` : undefined}
        footer={<>
          <Button variant="outline" onClick={() => setDiscard(null)}>Keep it</Button>
          <Button variant="danger" onClick={async () => { if (discard) await discardExam(discard.id); setDiscard(null); }}>Discard exam</Button>
        </>} />
    </div>
  );
}
