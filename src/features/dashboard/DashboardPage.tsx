import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, BookOpen, Layers, ListChecks, Timer, Flame, Target, PlayCircle, CalendarDays, Info } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { useLearnerModel } from '@/db/learnerModel';
import { useSettings } from '@/db/hooks';
import { localDate } from '@/lib/dates';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { PageHeader, Spinner, Stat } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';

function fmtHours(sec: number) {
  const h = sec / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

export default function DashboardPage() {
  const m = useLearnerModel();
  const settings = useSettings();
  const inProgressExam = useLiveQuery(() => db.examSessions.where('status').equals('in-progress').toArray().then((r) => r.find((x) => (x.track ?? 'ny-17-55') === content.manifest.id)), []);
  const inProgressPractice = useLiveQuery(() => db.practiceSessions.where('status').equals('in-progress').reverse().sortBy('updatedAt').then((r) => r.filter((x) => (x.track ?? 'ny-17-55') === content.manifest.id)[0]), []);
  const plan = useLiveQuery(() => db.plan.get('current'), []);
  if (!m) return <Spinner label="Loading your progress" />;

  const exam = content.manifest.exam;
  const todayMin = Math.round(m.study.todaySeconds / 60);
  const lastExam = m.examHistory.filter((e) => e.kind === 'full').at(-1);
  const today = localDate();
  const todayPlan = plan?.plan.days.find((d) => d.date === today);
  const weakest = [...m.sectionStats].filter((s) => s.lessonsTotal > 0 || s.answered > 0).sort((a, b) => (a.accuracy ?? a.mastery) - (b.accuracy ?? b.mastery)).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`NY ${content.manifest.title.replace(/ Insurance Agent\/Broker| Agent\/Broker/, "")} · PSI Series ${content.manifest.series}`}
        title="Your study dashboard"
        description={`Official exam: ${exam.questionCount} questions · ${exam.timeLimitMinutes} minutes · ${exam.passingPercent}% to pass. Your practice target: ${settings.practiceTarget}%.`}
        actions={<ButtonLink to={m.nextLesson ? `/lesson/${m.nextLesson.id}` : '/learn'} data-testid="continue-learning"><PlayCircle className="h-4 w-4" aria-hidden />{m.nextLesson ? 'Continue learning' : 'Open curriculum'}</ButtonLink>}
      />

      {(inProgressExam || inProgressPractice) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardBody className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
            <div>
              <div className="font-semibold">Pick up where you left off</div>
              <div className="text-sm text-muted">
                {inProgressExam && <>A {inProgressExam.kind === 'full' ? 'full mock exam' : `${inProgressExam.size}-question practice exam`} is in progress ({Object.keys(inProgressExam.answers).length}/{inProgressExam.questionIds.length} answered). </>}
                {inProgressPractice && <>Practice session “{inProgressPractice.title}” — question {Math.min(inProgressPractice.index + 1, inProgressPractice.questionIds.length)} of {inProgressPractice.questionIds.length}.</>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {inProgressExam && <ButtonLink to={`/exam/${inProgressExam.id}`} data-testid="resume-exam"><Timer className="h-4 w-4" aria-hidden />Resume exam</ButtonLink>}
              {inProgressPractice && <ButtonLink variant="outline" to={`/practice/session/${inProgressPractice.id}`} data-testid="resume-practice">Resume practice</ButtonLink>}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={`${todayMin} min`} hint={<span className="flex items-center gap-1"><Progress value={todayMin} max={settings.dailyGoalMinutes} label="Daily goal progress" className="w-20" /> goal {settings.dailyGoalMinutes} min</span>} />
        <Stat label="Study streak" value={<span className="inline-flex items-center gap-1">{m.study.streak}<Flame className="h-5 w-5 text-warning" aria-hidden /></span>} hint="days in a row" />
        <Stat label="Flashcards due" value={m.dueCards} tone={m.dueCards > 20 ? 'warning' : undefined} hint={`${m.deck.length} cards in your deck`} />
        <Stat label="Est. exam score" value={m.bankAnswered ? `${m.estimate.pct}%` : '—'} tone={m.bankAnswered ? (m.estimate.pct >= settings.practiceTarget ? 'success' : m.estimate.pct >= exam.passingPercent ? 'primary' : 'danger') : undefined} hint={m.bankAnswered ? `${m.estimate.confidence} confidence · not a guarantee` : 'answer practice questions to estimate'} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recommended next" description="Chosen from your results — each recommendation says why." />
          <CardBody>
            {m.recommendations.length === 0 ? (
              <p className="text-sm text-muted">Start your first lesson to get personalised recommendations.</p>
            ) : (
              <ul className="divide-y divide-border">
                {m.recommendations.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-sm text-muted">{r.reason}</div>
                    </div>
                    <ButtonLink to={r.to} variant="outline" size="sm" className="shrink-0">{r.label}<ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Readiness" description="Four different measures — don't confuse them." />
          <CardBody className="space-y-3 text-sm">
            <Measure label="Curriculum completed" value={m.curriculum.total ? m.curriculum.done / m.curriculum.total : 0} detail={`${m.curriculum.done}/${m.curriculum.total} lessons`} />
            <Measure label="Concepts mastered" value={m.conceptsTotal ? m.termsLearned / m.conceptsTotal : 0} detail={`${m.termsLearned}/${m.conceptsTotal} proficient or mastered`} />
            <div className="flex items-center justify-between"><span>Independent study time</span><span className="font-semibold tabular-nums">{fmtHours(m.study.totalSeconds)}</span></div>
            <div className="flex items-center justify-between">
              <span>Last full mock exam</span>
              {lastExam ? <Badge tone={lastExam.pct >= settings.practiceTarget ? 'success' : lastExam.passed ? 'primary' : 'danger'}>{lastExam.pct}% {lastExam.passed ? 'pass' : 'below 70%'}</Badge> : <span className="text-muted">none yet</span>}
            </div>
            <p className="flex gap-1.5 rounded-lg bg-surface-2 p-2 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Study time here is independent study. It is not approved pre-licensing credit — only a DFS-approved provider can issue the School Certificate required for the 40-hour course.</p>
            <ButtonLink to="/analytics#ready" variant="secondary" size="sm" className="w-full">Why am I not ready?</ButtonLink>
          </CardBody>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Sections needing attention" description="Weakest first, by recent accuracy (or mastery if you haven't practiced it)." action={<Link to="/learn" className="text-sm font-medium text-primary hover:underline">All sections</Link>} />
          <CardBody>
            {weakest.length === 0 ? <p className="text-sm text-muted">No section data yet.</p> : (
              <ul className="space-y-3">
                {weakest.map((s) => {
                  const v = s.accuracy ?? s.mastery;
                  return (
                    <li key={s.id}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <Link to={`/learn/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                        <span className="text-muted">{s.weightPct}% of exam · {s.accuracy === null ? `mastery ${Math.round(s.mastery * 100)}%` : `accuracy ${Math.round(s.accuracy * 100)}%`} · {s.lessonsDone}/{s.lessonsTotal} lessons</span>
                      </div>
                      <Progress value={v * 100} label={`${s.name} progress`} tone={v >= 0.85 ? 'success' : v >= 0.7 ? 'primary' : v >= 0.4 ? 'warning' : 'danger'} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Today's plan" action={<Link to="/planner" className="text-sm font-medium text-primary hover:underline">Planner</Link>} />
          <CardBody>
            {!plan ? (
              <div className="text-sm text-muted">
                <p>No study plan yet. Tell the planner your exam date and it will schedule lessons, flashcards, quizzes and mock exams.</p>
                <ButtonLink to="/planner" variant="outline" size="sm" className="mt-3"><CalendarDays className="h-4 w-4" aria-hidden />Create a plan</ButtonLink>
              </div>
            ) : !todayPlan ? (
              <p className="text-sm text-muted">Nothing scheduled today — a rest day, or rebuild your plan in the planner.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {todayPlan.tasks.map((t) => (
                  <li key={t.id} className={cn('flex items-center justify-between gap-2', plan.checks[t.id] && 'text-muted line-through')}>
                    <span>{t.title}</span><span className="shrink-0 text-xs text-muted">{t.minutes} min</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: '/learn', icon: BookOpen, label: 'Lessons', hint: `${content.lessons.length} lessons` },
          { to: '/flashcards', icon: Layers, label: 'Flashcards', hint: `${m.dueCards} due` },
          { to: '/practice', icon: ListChecks, label: 'Practice', hint: `${content.questions.length} questions` },
          { to: '/exam', icon: Target, label: 'Mock exam', hint: `${exam.questionCount} Q · ${exam.timeLimitMinutes} min` },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-2">
            <a.icon className="h-5 w-5 text-primary" aria-hidden />
            <div className="mt-2 font-semibold">{a.label}</div>
            <div className="text-xs text-muted">{a.hint}</div>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Measure({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span>{label}</span><span className="font-semibold tabular-nums">{Math.round(value * 100)}%</span></div>
      <Progress value={value * 100} label={label} />
      <div className="mt-0.5 text-xs text-muted">{detail}</div>
    </div>
  );
}
