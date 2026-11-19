import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, ChevronDown, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { useSettings, useStudyTimer } from '@/db/hooks';
import { useLearnerModel, type LearnerModel } from '@/db/learnerModel';
import { localDate } from '@/lib/dates';
import { HALF_LIFE_DAYS } from '@/lib/mastery';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, Spinner, Stat } from '@/components/ui/misc';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/components/ui/cn';
import { AccuracyTrendChart, DailyMinutesChart, ExamHistoryChart, SectionPerformanceChart, WeeklyMinutesChart } from './charts';
import { LEVEL_INFO, LEVEL_ORDER, accuracyDelta, buildHeatmap, examSeries, hours, retention, weekOverWeek, weeklyMinutes } from './analyticsHelpers';

const pct = (n: number) => `${Math.round(n)}%`;

function Trend({ delta, unit, label }: { delta: number | null; unit: string; label: string }) {
  if (delta === null) return <span>{label}</span>;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" aria-hidden />{delta === 0 ? 'Flat' : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)}${unit}`} {label}</span>;
}

export default function AnalyticsPage() {
  useStudyTimer('other');
  const model = useLearnerModel();
  const reviews = useLiveQuery(() => db.cardReviews.toArray(), []);
  if (!model || !reviews) return <div><PageHeader title="Learning Analytics" /><Spinner label="Crunching your progress" /></div>;
  return <Analytics model={model} reviews={reviews} />;
}

export function Analytics({ model, reviews }: { model: LearnerModel; reviews: { at: number; correct: boolean }[] }) {
  const settings = useSettings();
  const today = localDate(model.now);
  const weekly = useMemo(() => weeklyMinutes(model.study.secondsByDate, today, 8), [model.study.secondsByDate, today]);
  const wow = weekOverWeek(weekly);
  const acc = accuracyDelta(model.accuracyTrend, today);
  const ret = retention(reviews, model.now, 30);
  const passing = content.manifest.exam.passingPercent;
  const target = settings.practiceTarget;
  const mastered = model.conceptList.filter((c) => c.level === 'mastered').length;
  const curriculumPct = model.curriculum.total ? Math.round((model.curriculum.done / model.curriculum.total) * 100) : 0;
  const brandNew = model.bankAnswered === 0 && model.study.totalSeconds === 0 && model.curriculum.done === 0 && reviews.length === 0 && model.examHistory.length === 0;
  const fulls = model.examHistory.filter((e) => e.kind === 'full');
  const recentFulls = fulls.slice(-3);

  const heat = useMemo(
    () => buildHeatmap(content.sections, content.conceptsBySection, model.mastery, (id) => content.termById.get(id)?.term ?? id),
    [model.mastery],
  );
  const strongest = model.strongConcepts.slice(0, 5);
  const weakest = model.weakConcepts.slice(0, 5);
  const secs = model.sectionStats.filter((s) => s.accuracy !== null && s.answered >= 5);
  const secBest = secs.slice().sort((a, b) => b.accuracy! - a.accuracy!).slice(0, 3);
  const secWorst = secs.slice().sort((a, b) => a.accuracy! - b.accuracy!).slice(0, 3);
  const est = model.estimate;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Your progress" title="Learning Analytics" description="Trends, not just totals. Everything here is computed on this device from your own study history." />

      {brandNew && (
        <Card><CardBody className="pt-4 sm:pt-5">
          <h2 className="font-semibold">Welcome — nothing to chart yet</h2>
          <p className="mt-1 text-sm text-muted">Your analytics fill in as you study. Finish a lesson, answer some practice questions or review flashcards and come back.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink to="/learn" size="sm">Start a lesson</ButtonLink>
            <ButtonLink to="/practice?mode=mixed" size="sm" variant="outline">Practice questions</ButtonLink>
          </div>
        </CardBody></Card>
      )}

      <section aria-labelledby="kpi-h">
        <h2 id="kpi-h" className="sr-only">Key numbers</h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Stat label="Curriculum completed" value={`${curriculumPct}%`} hint={`${model.curriculum.done} of ${model.curriculum.total} lessons`} tone="primary" />
          <Stat label="Concepts mastered" value={`${mastered} / ${model.conceptsTotal}`} hint="Needs 85%+ and 3 confident correct answers on 2+ days" />
          <Stat label="Independent study" value={`${hours(model.study.totalSeconds)} h`} hint="Independent study — not approved pre-licensing credit" />
          <Stat label="Studied today" value={`${Math.round(model.study.todaySeconds / 60)} min`} hint={<Trend delta={weekly.length > 1 ? wow.delta : null} unit=" min" label="this week vs last" />} />
          <Stat label="Practice accuracy" value={model.practiceAccuracy === null ? '—' : pct(model.practiceAccuracy * 100)}
            hint={model.practiceAccuracy === null ? 'No answers yet' : <><span>{model.bankAnswered} answers. </span><Trend delta={acc.delta} unit=" pts" label="vs prior week" /></>} />
          <Stat label="Terms learned" value={`${model.termsLearned}`} hint={`Proficient or mastered, of ${model.conceptsTotal} terms`} />
          <Stat label="Flashcard retention" value={ret.pct === null ? '—' : `${ret.pct}%`} hint={ret.pct === null ? 'No reviews in the last 30 days' : `${ret.correct} of ${ret.reviews} reviews recalled (30 days)`} />
          <Stat label="Overdue reviews" value={model.dueCards} tone={model.dueCards > 20 ? 'warning' : undefined} hint={model.dueCards ? 'Cards due now' : 'You are caught up'} />
          <Stat label="Estimated exam score" value={model.bankAnswered === 0 ? '—' : pct(est.pct)}
            tone={model.bankAnswered === 0 ? undefined : est.pct >= target ? 'success' : est.pct >= passing ? 'warning' : 'danger'}
            hint={model.bankAnswered === 0 ? 'Answer practice questions to get an estimate' : `Confidence: ${est.confidence} (${model.bankAnswered} answers)`} />
          <Stat label="Study streak" value={`${model.study.streak} day${model.study.streak === 1 ? '' : 's'}`} hint="Days in a row with 1+ minute" />
        </div>
      </section>

      <section aria-labelledby="measures-h">
        <Card>
          <CardHeader title="Four different measures — don't mix them up" description="Finishing lessons, knowing concepts, putting in hours and passing exams are separate things." />
          <CardBody>
            <h2 id="measures-h" className="sr-only">Comparison of progress measures</h2>
            <dl className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border p-3" data-testid="measure-curriculum">
                <dt className="text-sm font-semibold">Curriculum completed</dt>
                <dd className="mt-1"><div className="text-xl font-bold tabular-nums">{curriculumPct}%</div>
                  <Progress value={model.curriculum.done} max={model.curriculum.total || 1} label="Curriculum completed" className="my-1.5" />
                  <p className="text-sm text-muted">{model.curriculum.done} of {model.curriculum.total} lessons marked complete. This shows what you have read, not what you remember.</p></dd>
              </div>
              <div className="rounded-lg border border-border p-3" data-testid="measure-mastery">
                <dt className="text-sm font-semibold">Concepts mastered</dt>
                <dd className="mt-1"><div className="text-xl font-bold tabular-nums">{mastered} / {model.conceptsTotal}</div>
                  <Progress value={mastered} max={model.conceptsTotal || 1} label="Concepts mastered" tone="accent" className="my-1.5" />
                  <p className="text-sm text-muted">Based on correct answers that decay over time. A concept only counts as mastered with repeated, confident, spaced success.</p></dd>
              </div>
              <div className="rounded-lg border border-border p-3" data-testid="measure-hours">
                <dt className="text-sm font-semibold">Independent practice hours</dt>
                <dd className="mt-1"><div className="text-xl font-bold tabular-nums">{hours(model.study.totalSeconds)} h</div>
                  <p className="mt-1 text-sm text-muted">Active time in this app. Independent study — not approved pre-licensing credit. {content.manifest.prelicensing.note}</p></dd>
              </div>
              <div className="rounded-lg border border-border p-3" data-testid="measure-passing">
                <dt className="text-sm font-semibold">Actual passing performance</dt>
                <dd className="mt-1">
                  {recentFulls.length ? (
                    <>
                      <ul className="flex flex-wrap gap-2" aria-label="Most recent full mock exam scores">
                        {recentFulls.map((e) => <li key={e.id}><Badge tone={e.passed ? 'success' : 'danger'}>{e.passed ? 'Pass' : 'Below passing'} · {Math.round(e.pct)}%</Badge></li>)}
                      </ul>
                      <p className="mt-1.5 text-sm text-muted">Your last {recentFulls.length} full-length mock exam{recentFulls.length > 1 ? 's' : ''}. The official passing score is {passing}%; your practice target is {target}%.</p>
                    </>
                  ) : <p className="text-sm text-muted">No full-length mock exam yet. This is the measure that best predicts exam day — <Link className="text-primary underline" to="/exam">take one</Link> when you have studied several sections.</p>}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="ready-h">
        <Card>
          <CardHeader title="Why am I not ready?" description="Rule-based findings, ordered by how much they are likely to cost you on the exam." as="h2" />
          <CardBody>
            <span id="ready-h" className="sr-only">Readiness findings</span>
            {model.readiness.ready ? (
              <div className="flex gap-3 rounded-lg border border-success/40 bg-success/5 p-4" role="status" data-testid="ready-state">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden />
                <div><p className="font-semibold text-success">You look ready</p>
                  <p className="text-sm">Your last two full mock exams met your {target}% target and no high-priority issues remain. Keep reviewing flashcards and take one more timed exam close to test day.</p></div>
              </div>
            ) : model.readiness.findings.length === 0 ? (
              <p className="text-sm text-muted" data-testid="no-findings">No specific problems found, but you are not marked ready until two full mock exams meet your {target}% target.</p>
            ) : (
              <ul className="space-y-3" data-testid="findings">
                {model.readiness.findings.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}>{f.severity === 'high' ? 'High priority' : f.severity === 'medium' ? 'Medium' : 'Low'}</Badge>
                        <span className="font-medium">{f.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{f.evidence}</p>
                    </div>
                    <ButtonLink to={f.action.to} size="sm" variant="outline" className="shrink-0">{f.action.label}</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="trends-h">
        <h2 id="trends-h" className="mb-3 text-lg font-semibold">Trends</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <DailyMinutesChart data={model.study.last14} />
          <WeeklyMinutesChart data={weekly} />
          <AccuracyTrendChart data={model.accuracyTrend} target={target} />
          <ExamHistoryChart data={examSeries(model.examHistory)} passing={passing} target={target} />
        </div>
      </section>

      <section aria-labelledby="sections-h">
        <h2 id="sections-h" className="sr-only">Sections</h2>
        <SectionPerformanceChart data={model.sectionStats.map((s) => ({ name: s.name, accuracy: s.accuracy, mastery: s.mastery, answered: s.answered }))} />
      </section>

      <section aria-labelledby="heat-h">
        <Card>
          <CardHeader title="Topic mastery heatmap" description="One row per exam section; each square is a concept. Select a square to open it." as="h2" />
          <CardBody className="space-y-3">
            <span id="heat-h" className="sr-only">Mastery heatmap</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
              {LEVEL_ORDER.map((l) => (
                <li key={l} className="inline-flex items-center gap-1.5"><span className={cn('inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold', LEVEL_INFO[l].cell)} aria-hidden>{LEVEL_INFO[l].glyph}</span>{LEVEL_INFO[l].label}</li>
              ))}
            </ul>
            <div className="space-y-2" data-testid="heatmap">
              {heat.map((row) => (
                <div key={row.sectionId} className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
                  <div className="text-sm font-medium">{row.name}<span className="ml-1 text-xs font-normal text-muted">({row.cells.length})</span></div>
                  {row.cells.length ? (
                    <ul className="flex flex-wrap gap-1">
                      {row.cells.map((c) => (
                        <li key={c.id}>
                          <Link to={`/dictionary/${c.id}`} title={`${c.name}: ${LEVEL_INFO[c.level].label}`} aria-label={`${c.name}: ${LEVEL_INFO[c.level].label}${c.level === 'unseen' ? '' : `, ${Math.round(c.score * 100)} percent`}`}
                            className={cn('inline-flex h-6 w-6 items-center justify-center rounded border text-[11px] font-bold', LEVEL_INFO[c.level].cell)}>{LEVEL_INFO[c.level].glyph}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted">No concepts published for this section yet.</p>}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="sw-h" className="grid gap-4 md:grid-cols-2">
        <h2 id="sw-h" className="sr-only">Strongest and weakest topics</h2>
        <Card>
          <CardHeader as="h3" title="Strongest topics" />
          <CardBody>
            {strongest.length ? <ul className="space-y-1.5 text-sm">{strongest.map((c) => (
              <li key={c.concept} className="flex items-center justify-between gap-2"><Link className="text-primary hover:underline" to={`/dictionary/${c.concept}`}>{content.termById.get(c.concept)?.term}</Link><Badge tone="success">{LEVEL_INFO[c.level].label.split(' (')[0]} · {Math.round(c.score * 100)}%</Badge></li>
            ))}</ul> : <p className="text-sm text-muted">No proficient concepts yet. Strong topics appear after repeated correct answers.</p>}
            {secBest.length > 0 && <><h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Best sections by recent accuracy</h4>
              <ul className="space-y-1 text-sm">{secBest.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="tabular-nums">{pct(s.accuracy! * 100)}</span></li>)}</ul></>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader as="h3" title="Weakest topics" />
          <CardBody>
            {weakest.length ? <ul className="space-y-1.5 text-sm">{weakest.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2"><Link className="text-primary hover:underline" to={`/dictionary/${c.id}`}>{c.name}</Link><Badge tone={c.score < 0.4 ? 'danger' : 'warning'}>{pct(c.score * 100)} · {c.attempts} tries</Badge></li>
            ))}</ul> : <p className="text-sm text-muted">No weak concepts detected yet. Answer more questions so the app can find them.</p>}
            {secWorst.length > 0 && <><h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Lowest sections by recent accuracy</h4>
              <ul className="space-y-1 text-sm">{secWorst.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="tabular-nums">{pct(s.accuracy! * 100)}</span></li>)}</ul></>}
            {weakest.length > 0 && <ButtonLink to="/practice?mode=weakness" size="sm" variant="outline" className="mt-4">Start a weakness drill</ButtonLink>}
          </CardBody>
        </Card>
      </section>

      <details className="group rounded-xl border border-border bg-surface p-4 text-sm shadow-sm" data-testid="how-mastery">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
          How mastery is calculated<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="prose-study mt-3 space-y-2">
          <p><strong>Evidence.</strong> Every practice answer, exam answer, glossary check and flashcard review is a piece of evidence for the concept(s) it tests. A correct, confident answer scores 1. A correct answer you marked as a guess scores 0.5 (half credit). An incorrect answer scores 0.</p>
          <p><strong>Decay.</strong> Older evidence counts less. Each event&rsquo;s weight halves every {HALF_LIFE_DAYS} days and is nudged by difficulty (easy &times;0.85, medium &times;1, hard &times;1.15). Recent misses therefore outweigh old successes.</p>
          <p><strong>Skeptical prior.</strong> Mastery = sum(weight &times; score) / (sum(weight) + 1). The extra +1 acts like one imaginary miss, so a single correct answer is worth at most 50% and it takes several to climb.</p>
          <p><strong>Levels.</strong> Weak: below 40%. Developing: 40&ndash;69%. Proficient: 70&ndash;84%. Mastered: 85% or more <em>and</em> at least 3 confident (not guessed) correct answers on 2 or more different days. A section&rsquo;s mastery is the average over its concepts, counting unseen concepts as 0.</p>
          <p><strong>Estimated exam score.</strong> For each section, take your last 40 practice answers and shrink the accuracy toward 50% by adding 5 pseudo-answers at 50%. Sections with no answers count as 25% (random guessing). The estimate is the exam-weight-weighted sum. Confidence is low under 120 total answers, medium from 120 and high from 300. It is a rough guide, not a prediction of your result.</p>
          <p><strong>Retention</strong> is the share of flashcard reviews in the last 30 days that you did not rate &ldquo;again&rdquo;.</p>
        </div>
      </details>
    </div>
  );
}
