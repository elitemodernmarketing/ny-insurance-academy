import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { BookOpen, CheckCircle2, Clock, Flag, Info, Target, XCircle } from 'lucide-react';
import { content } from '@/content';
import { db, type ExamSessionRow } from '@/db/db';
import { useSettings, useStudyTimer } from '@/db/hooks';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Callout, EmptyState, Spinner, Stat } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { Expandable, ReviewBody, snippet } from '../practice/parts';
import { startReviewSession } from '../practice/practiceService';
import { buildResultView, filterReview, formatDuration, requestedSize, type ReviewFilter } from './examService';

const FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'incorrect', label: 'Incorrect' }, { id: 'unanswered', label: 'Unanswered' }, { id: 'flagged', label: 'Flagged' },
];

export default function ExamResults() {
  const { sessionId = '' } = useParams();
  const row = useLiveQuery(async () => (await db.examSessions.get(sessionId)) ?? null, [sessionId]);
  const settings = useSettings();
  useStudyTimer('exam', row?.status === 'submitted');
  if (row === undefined) return <Spinner label="Loading results" />;
  if (row === null) return <EmptyState title="Exam not found" action={<ButtonLink to="/exam">Back to mock exams</ButtonLink>}>It may have been discarded.</EmptyState>;
  if (row.status !== 'submitted') return <Navigate to={`/exam/${row.id}`} replace />;
  return <Results row={row} practiceTarget={settings.practiceTarget} />;
}

function Results({ row, practiceTarget }: { row: ExamSessionRow; practiceTarget: number }) {
  const nav = useNavigate();
  const v = useMemo(() => buildResultView(row, practiceTarget), [row, practiceTarget]);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [busy, setBusy] = useState(false);
  const s = v.score;
  const pass = s.passingPercent;
  const shown = useMemo(() => filterReview(row, v.questions, filter), [row, v.questions, filter]);
  const counts: Record<ReviewFilter, number> = useMemo(() => ({
    all: v.questions.length, incorrect: filterReview(row, v.questions, 'incorrect').length,
    unanswered: filterReview(row, v.questions, 'unanswered').length, flagged: filterReview(row, v.questions, 'flagged').length,
  }), [row, v.questions]);

  const chart = s.bySection.map((b) => ({ name: content.sectionById.get(b.sectionId as never)?.shortName ?? b.sectionId, pct: b.pct, label: `${b.correct}/${b.total}` }));

  async function practiceMissed() {
    setBusy(true);
    const r = await startReviewSession(s.missedIds, `Missed in exam (${s.missedIds.length} questions)`);
    if (r) nav(`/practice/session/${r.id}`); else setBusy(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Exam results</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{v.label}</h1>
        <p className="mt-1 text-sm text-muted">Submitted {new Date(row.submittedAt ?? row.startedAt).toLocaleString()}{row.autoSubmitted && ' — submitted automatically when time ran out'}</p>
      </header>

      {row.shortfalls.length > 0 && (
        <Callout kind="note">This exam was shorter than requested because the question bank did not yet cover every section ({row.size} questions instead of {requestedSize(row)}). Treat the score as a smaller sample.</Callout>
      )}

      <Card>
        <CardBody className="pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className={cn('text-5xl font-bold tabular-nums sm:text-6xl', s.passed ? 'text-success' : 'text-danger')} data-testid="exam-score">{s.pct}%</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={s.passed ? 'success' : 'danger'} className="text-sm" data-testid="exam-pass-status">{s.passed ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}{s.passed ? 'PASS' : 'FAIL'} vs official {pass}%</Badge>
                <Badge tone={v.reachedTarget ? 'success' : 'neutral'}><Target className="h-3.5 w-3.5" aria-hidden />Practice target {practiceTarget}%: {v.reachedTarget ? 'reached' : 'not reached'}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{s.correct} of {s.total} correct. You needed {Math.ceil((pass * s.total) / 100 - 1e-9)} to reach {pass}%.</p>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Correct" value={s.correct} tone="success" />
              <Stat label="Incorrect" value={s.incorrect} tone={s.incorrect ? 'danger' : undefined} />
              <Stat label="Unanswered" value={s.unanswered} tone={s.unanswered ? 'warning' : undefined} />
              <Stat label="Time used" value={formatDuration(v.timeUsedMs)} hint={`of ${row.timeLimitMin} min`} />
              <Stat label="Avg per question" value={`${Math.round(v.avgMsPerQuestion / 1000)} s`} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Performance by subject" description={`Bars show percent correct per section; the line marks the ${pass}% passing score.`} />
        <CardBody className="space-y-4">
          <div className="h-72 w-full" role="img" aria-label={`Bar chart of percent correct by section. ${chart.map((c) => `${c.name} ${c.pct}%`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--border))" />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'rgb(var(--fg))', fontSize: 12 }} stroke="rgb(var(--border))" />
                <RTooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, color: 'rgb(var(--fg))' }} formatter={(val: number, _n, p) => [`${val}% (${(p.payload as { label: string }).label})`, 'Correct']} />
                <ReferenceLine x={pass} stroke="rgb(var(--warning))" strokeDasharray="4 4" />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {chart.map((c) => <Cell key={c.name} fill={c.pct >= pass ? 'rgb(var(--success))' : 'rgb(var(--danger))'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[28rem] text-sm" data-testid="results-by-section">
              <caption className="sr-only">Results by section</caption>
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="px-3 py-2">Section</th><th scope="col" className="px-3 py-2 text-right">Correct</th><th scope="col" className="px-3 py-2 text-right">Wrong</th><th scope="col" className="px-3 py-2 text-right">Blank</th><th scope="col" className="px-3 py-2 text-right">Score</th></tr>
              </thead>
              <tbody>
                {s.bySection.map((b) => (
                  <tr key={b.sectionId} className="border-t border-border">
                    <td className="px-3 py-1.5">{content.sectionById.get(b.sectionId as never)?.shortName ?? b.sectionId}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.correct}/{b.total}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.incorrect}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.unanswered}</td>
                    <td className="px-3 py-1.5 text-right"><span className={cn('font-semibold tabular-nums', b.pct >= pass ? 'text-success' : 'text-danger')}>{b.pct}%</span><span className="sr-only">{b.pct >= pass ? ' at or above passing' : ' below passing'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Areas requiring further study" description={`Sections below ${pass}%.`} />
        <CardBody>
          {v.weakSections.length === 0 ? (
            <p className="text-sm text-success">Every section scored at or above {pass}%. Keep practicing mixed questions to keep it that way.</p>
          ) : (
            <ul className="space-y-3" data-testid="weak-sections">
              {v.weakSections.map((w) => (
                <li key={w.sectionId} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-sm tabular-nums text-danger">{w.pct}% ({w.correct}/{w.total})</span>
                  </div>
                  <Progress className="mt-2" value={w.pct} label={`${w.name} score`} tone="danger" />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <Link to={`/learn/${w.sectionId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><BookOpen className="h-4 w-4" aria-hidden />Study this section</Link>
                    {w.lessons.map((l) => <Link key={l.id} to={`/lesson/${l.id}`} className="text-primary hover:underline">Lesson: {l.title}</Link>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recommended next steps" />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {v.followUpSections.map((f) => <ButtonLink key={f.sectionId} to={`/practice?mode=topic&section=${f.sectionId}`} variant="outline" size="sm">Quiz: {f.name} ({f.pct}%)</ButtonLink>)}
            <ButtonLink to="/practice?mode=weakness" variant="outline" size="sm">Weakness drill</ButtonLink>
            {s.missedIds.length > 0 && <Button size="sm" variant="outline" onClick={() => void practiceMissed()} disabled={busy}>Practice the {s.missedIds.length} missed questions</Button>}
            <ButtonLink to="/review" variant="ghost" size="sm">Weakness review</ButtonLink>
            <ButtonLink to="/exam" size="sm">Another exam</ButtonLink>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Questions you missed or left blank were added to your flashcards automatically.</p>
        </CardBody>
      </Card>

      <section aria-labelledby="review-h" className="space-y-3">
        <h2 id="review-h" className="text-lg font-semibold">Answer review</h2>
        <div role="group" aria-label="Filter questions" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`filter-${f.id}`}
              className={cn('inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm', filter === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>
              {f.id === 'flagged' && <Flag className="h-3.5 w-3.5" aria-hidden />}{f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
        {shown.length === 0 ? <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">No questions match this filter.</p> : (
          <ul className="space-y-2" data-testid="answer-review">
            {shown.map((q) => {
              const n = row.questionIds.indexOf(q.id) + 1;
              const a = row.answers[q.id];
              const ok = a === q.correct;
              return (
                <li key={q.id}>
                  <Expandable header={
                    <span className="flex items-start gap-2">
                      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label={a ? 'Incorrect' : 'Unanswered'} />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium"><span className="text-muted">Q{n}.</span> {snippet(q, 130)}</span>
                        <span className="mt-1 flex flex-wrap gap-2"><Badge>{content.sectionById.get(q.sectionId)?.shortName}</Badge>{!a && <Badge tone="warning">Unanswered</Badge>}{row.flags.includes(q.id) && <Badge tone="warning"><Flag className="h-3 w-3" aria-hidden />Flagged</Badge>}</span>
                      </span>
                    </span>
                  }>
                    <ReviewBody question={q} order={row.choiceOrders[q.id] ?? q.choices.map((c) => c.id)} selected={a ?? null} />
                  </Expandable>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Callout kind="note"><span className="inline-flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>Practice results do not predict or guarantee your result on the actual PSI exam. Use them to find gaps, not to decide whether you are ready.</span></span></Callout>
    </div>
  );
}
