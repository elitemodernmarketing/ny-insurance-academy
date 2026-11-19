import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Flag, RefreshCw, Settings2 } from 'lucide-react';
import { content } from '@/content';
import { db, type PlanRow } from '@/db/db';
import { useSettingsLoaded, useStudyTimer } from '@/db/hooks';
import { useLearnerModel } from '@/db/learnerModel';
import type { PlanDay, PlanTask, PlannerInput, PlannerState } from '@/lib/planner';
import { addDays, daysBetween, localDate } from '@/lib/dates';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, PageHeader, Select, Spinner, TextField } from '@/components/ui/misc';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/components/ui/cn';
import {
  TASK_LABEL, WEEKDAYS, dayLabel, defaultInput, generatePlan, isAutoChecked, isTaskDone, milestones, missedTasks, monthGrid, monthKey,
  monthLabel, moveFocus, sessionsFor, taskRoute, validateInput, weakSections,
} from './plannerHelpers';

async function setCheck(id: string, value: boolean) {
  await db.transaction('rw', db.plan, async () => {
    const r = await db.plan.get('current');
    if (r) await db.plan.put({ ...r, checks: { ...r.checks, [id]: value } });
  });
}
async function savePlan(p: Pick<PlanRow, 'input' | 'generatedOn' | 'plan' | 'checks'>) {
  await db.plan.put({ id: 'current', ...p });
}

export default function PlannerPage() {
  useStudyTimer('other');
  const settings = useSettingsLoaded();
  const model = useLearnerModel();
  const row = useLiveQuery(async () => (await db.plan.get('current')) ?? null, []);
  const lessonRows = useLiveQuery(() => db.lessonProgress.toArray(), []);
  if (!settings || !model || row === undefined || !lessonRows) return <div><PageHeader title="Study Planner" /><Spinner label="Loading your plan" /></div>;
  const completed = new Set(lessonRows.filter((l) => l.status === 'completed').map((l) => l.lessonId));
  const state: PlannerState = {
    lessons: content.lessons.map((l) => ({ id: l.id, sectionId: l.sectionId, title: l.title, estMinutes: l.estMinutes, completed: completed.has(l.id) })),
    weakSectionIds: weakSections(model.sectionStats, (id) => (content.questionsBySection.get(id)?.length ?? 0) > 0),
    sectionNames: Object.fromEntries(content.sections.map((s) => [s.id, s.shortName])),
    dueCards: model.dueCards,
    exam: { questions: content.manifest.exam.questionCount, minutes: content.manifest.exam.timeLimitMinutes },
  };
  return <Planner row={row} state={state} completed={completed} defaults={{ priorKnowledge: settings.priorKnowledge, minutesPerDay: Math.min(600, Math.max(15, settings.dailyGoalMinutes)) }} />;
}

export function Planner({ row, state, completed, defaults, today = localDate() }: {
  row: PlanRow | null; state: PlannerState; completed: ReadonlySet<string>; defaults: Partial<PlannerInput>; today?: string;
}) {
  const [editing, setEditing] = useState(false);
  const generate = async (input: PlannerInput) => { await savePlan(generatePlan(input, state, row ?? undefined, today)); setEditing(false); };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Plan your path" title="Study Planner" description="A day-by-day plan from today to your exam date. It lives on this device and works offline." />
      {!row ? (
        <>
          <EmptyState title="No study plan yet" icon={<CalendarDays className="h-8 w-8" aria-hidden />}>Tell the planner when your exam is and how much time you have. It schedules lessons in outline order, daily flashcards, quizzes and mock exams.</EmptyState>
          <PlannerForm initial={defaultInput(today, defaults)} today={today} onSubmit={generate} submitLabel="Generate my plan" />
        </>
      ) : (
        <PlanView row={row} completed={completed} today={today} editing={editing} setEditing={setEditing} onGenerate={generate} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ form
export function PlannerForm({ initial, today, onSubmit, submitLabel }: { initial: PlannerInput; today: string; onSubmit: (i: PlannerInput) => Promise<void>; submitLabel: string }) {
  const [examDate, setExamDate] = useState(initial.examDate);
  const [days, setDays] = useState<number[]>(initial.studyDays);
  const [minutes, setMinutes] = useState(String(initial.minutesPerDay));
  const [prior, setPrior] = useState<PlannerInput['priorKnowledge']>(initial.priorKnowledge);
  const [session, setSession] = useState(String(initial.sessionLength));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: PlannerInput = { today, examDate, studyDays: [...days].sort(), minutesPerDay: Math.round(Number(minutes)), sessionLength: Number(session), priorKnowledge: prior };
    const errs = validateInput(input, today);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try { await onSubmit(input); } finally { setBusy(false); }
  };
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <Card>
      <CardHeader title="Plan settings" description="You can change these any time; the plan is rebuilt from today." />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" aria-label="Study plan settings" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Target exam date" type="date" value={examDate} min={addDays(today, 1)} onChange={(e) => setExamDate(e.target.value)} required data-testid="planner-exam-date" />
            <TextField label="Minutes per study day" type="number" inputMode="numeric" min={15} max={600} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} hint="Between 15 and 600." data-testid="planner-minutes" />
            <Select label="Prior insurance knowledge" value={prior} onChange={(e) => setPrior(e.target.value as PlannerInput['priorKnowledge'])}>
              <option value="none">None — I'm new to insurance</option><option value="some">Some — I know the basics</option><option value="experienced">Experienced — I've worked in insurance</option>
            </Select>
            <Select label="Preferred session length" value={session} onChange={(e) => setSession(e.target.value)}>
              {[15, 20, 25, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </Select>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Available study days</legend>
            <div className="flex flex-wrap gap-2">
              {order.map((d) => (
                <label key={d} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', days.includes(d) ? 'border-primary bg-primary/10 font-medium' : 'border-border bg-surface')}>
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={days.includes(d)} onChange={(e) => setDays((cur) => (e.target.checked ? [...cur, d] : cur.filter((x) => x !== d)))} />
                  <span><span aria-hidden>{WEEKDAYS[d].slice(0, 3)}</span><span className="sr-only">{WEEKDAYS[d]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {errors.length > 0 && <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button type="submit" disabled={busy} data-testid="planner-generate"><CalendarCheck className="h-4 w-4" aria-hidden />{submitLabel}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ plan view
function PlanView({ row, completed, today, editing, setEditing, onGenerate }: {
  row: PlanRow; completed: ReadonlySet<string>; today: string; editing: boolean; setEditing: (b: boolean) => void; onGenerate: (i: PlannerInput) => Promise<void>;
}) {
  const plan = row.plan;
  const days = useMemo(() => new Map(plan.days.map((d) => [d.date, d])), [plan]);
  const missed = missedTasks(row, completed, today);
  const examPassed = row.input.examDate <= today;
  const allTasks = plan.days.flatMap((d) => d.tasks);
  const doneCount = allTasks.filter((t) => isTaskDone(t, row.checks, completed)).length;
  const daysToExam = daysBetween(today, row.input.examDate);
  const [selected, setSelected] = useState(() => (days.has(today) ? today : plan.days.find((d) => d.date >= today)?.date ?? today));
  const ms = milestones(row, content.lessons.length);

  const rebuild = async () => { await onGenerate({ ...row.input, today }); };

  return (
    <>
      {plan.warnings.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-warning/60 bg-warning/10 p-4" data-testid="planner-warnings">
          <div className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-5 w-5" aria-hidden />Planner warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {examPassed && <div role="alert" className="rounded-xl border border-border bg-surface-2 p-4 text-sm">Your exam date ({row.input.examDate}) has passed. Update the plan settings with a new date to get a fresh schedule.</div>}
      {missed.length > 0 && !examPassed && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="planner-missed">
          <p className="text-sm"><strong>You missed {missed.length} task{missed.length === 1 ? '' : 's'}</strong> — rebuild the plan from today. Unfinished lessons are rescheduled; your past check-offs are kept.</p>
          <Button onClick={rebuild} data-testid="planner-rebuild"><RefreshCw className="h-4 w-4" aria-hidden />Rebuild plan from today</Button>
        </div>
      )}

      <section aria-label="Plan summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Exam date" value={row.input.examDate} hint={daysToExam > 0 ? `${daysToExam} day${daysToExam === 1 ? '' : 's'} to go` : 'Passed'} />
        <Summary label="Study days" value={String(plan.studyDayCount)} hint={`${row.input.minutesPerDay} min each`} />
        <Summary label="Lessons left" value={String(plan.lessonsRemaining)} hint={`~${Math.round(plan.lessonMinutesNeeded / 60)} h of lessons`} />
        <Summary label="Tasks done" value={`${doneCount} / ${allTasks.length}`} hint={<Progress value={doneCount} max={allTasks.length || 1} label="Plan tasks done" className="mt-1" />} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Calendar row={row} days={days} today={today} selected={selected} onSelect={setSelected} completed={completed} />
          <DayPanel date={selected} day={days.get(selected)} row={row} completed={completed} today={today} />
        </div>
        <div className="space-y-4">
          <Upcoming row={row} days={days} today={today} completed={completed} />
          <Card>
            <CardHeader as="h2" title="Milestones" />
            <CardBody>
              <ul className="space-y-2 text-sm" data-testid="milestones">
                {ms.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-primary" aria-hidden />{m.label}</span>
                    <span className="text-right tabular-nums text-muted">{m.date ?? m.note}{m.date && m.date <= today ? ' (past)' : ''}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader as="h2" title="Plan settings" action={<Button variant="outline" size="sm" onClick={() => setEditing(!editing)} aria-expanded={editing} data-testid="planner-edit"><Settings2 className="h-4 w-4" aria-hidden />{editing ? 'Close' : 'Edit'}</Button>} />
            <CardBody className="text-sm text-muted">
              <p>Generated {row.generatedOn}. Study days: {row.input.studyDays.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')}. {row.input.minutesPerDay} min per day in ~{row.input.sessionLength}-minute sessions. Prior knowledge: {row.input.priorKnowledge}.</p>
              <p className="mt-2">Available {Math.round(plan.minutesAvailable / 60)} h in total; lessons need about {Math.round(plan.lessonMinutesNeeded / 60)} h.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={rebuild} data-testid="planner-rebuild-manual"><RefreshCw className="h-4 w-4" aria-hidden />Rebuild from today</Button>
            </CardBody>
          </Card>
        </div>
      </div>
      {editing && <PlannerForm initial={{ ...row.input, today }} today={today} onSubmit={onGenerate} submitLabel="Regenerate plan" />}
    </>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-3"><div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div><div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div>;
}

// ------------------------------------------------------------------------------------------------ tasks
export function TaskRow({ task, checks, completed }: { task: PlanTask; checks: Record<string, boolean>; completed: ReadonlySet<string> }) {
  const auto = isAutoChecked(task, completed);
  const done = isTaskDone(task, checks, completed);
  const id = `task-${task.id}`;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-2.5" data-testid="planner-task">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={done} disabled={auto} onChange={(e) => void setCheck(task.id, e.target.checked)} data-testid="planner-task-check" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn('block text-sm font-medium', done && 'text-muted line-through')}>{task.title}</label>
        <div className="text-xs text-muted">{task.minutes} min{auto ? ' · completed automatically (lesson finished)' : ''}</div>
      </div>
      <Link to={taskRoute(task)} aria-label={`${TASK_LABEL[task.kind]}: ${task.title}`} data-testid="planner-task-link" className="shrink-0 text-sm font-medium text-primary hover:underline">{TASK_LABEL[task.kind]}</Link>
    </li>
  );
}

function DayPanel({ date, day, row, completed, today }: { date: string; day: PlanDay | undefined; row: PlanRow; completed: ReadonlySet<string>; today: string }) {
  return (
    <Card>
      <CardHeader as="h2" title={dayLabel(date)} description={day ? `${day.minutes} planned minutes · ${day.tasks.length} tasks · ${sessionsFor(day.minutes, row.input.sessionLength)} session${sessionsFor(day.minutes, row.input.sessionLength) === 1 ? '' : 's'}` : undefined}
        action={<div className="flex gap-1">{date === today && <Badge tone="primary">Today</Badge>}{date === row.input.examDate && <Badge tone="danger">Exam day</Badge>}{day && <Badge>{day.phase === 'learn' ? 'Learning' : day.phase === 'final' ? 'Final review' : 'Review'}</Badge>}</div>} />
      <CardBody aria-live="polite">
        {day ? <ul className="space-y-2">{day.tasks.map((t) => <TaskRow key={t.id} task={t} checks={row.checks} completed={completed} />)}</ul>
          : <p className="text-sm text-muted">{date === row.input.examDate ? 'Exam day. No new study — rest, review your notes lightly and go in confident.' : date < row.generatedOn ? 'No plan existed for this day.' : 'Rest day — nothing planned.'}</p>}
      </CardBody>
    </Card>
  );
}

function Upcoming({ row, days, today, completed }: { row: PlanRow; days: Map<string, PlanDay>; today: string; completed: ReadonlySet<string> }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  return (
    <Card>
      <CardHeader as="h2" title="Upcoming 7 days" />
      <CardBody>
        <ol className="space-y-3" data-testid="upcoming">
          {dates.map((d) => {
            const day = days.get(d);
            return (
              <li key={d}>
                <div className="mb-1 flex items-center justify-between text-sm font-semibold"><span>{d === today ? 'Today' : dayLabel(d)}</span>{day && <span className="text-xs font-normal text-muted">{day.minutes} min</span>}</div>
                {day ? <ul className="space-y-1.5">{day.tasks.map((t) => <TaskRow key={t.id} task={t} checks={row.checks} completed={completed} />)}</ul>
                  : <p className="text-sm text-muted">{d === row.input.examDate ? 'Exam day' : d > row.input.examDate ? 'After the exam' : 'Rest day'}</p>}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ calendar
function Calendar({ row, days, today, selected, onSelect, completed }: { row: PlanRow; days: Map<string, PlanDay>; today: string; selected: string; onSelect: (d: string) => void; completed: ReadonlySet<string> }) {
  const [focus, setFocus] = useState(selected);
  const [month, setMonth] = useState(monthKey(selected));
  const grid = useRef<HTMLTableElement>(null);
  const moved = useRef(false);
  const weeks = useMemo(() => monthGrid(month), [month]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, month]);

  const go = (d: string) => { moved.current = true; setFocus(d); setMonth(monthKey(d)); };
  const onKey = (e: React.KeyboardEvent) => {
    const next = moveFocus(focus, e.key);
    if (next) { e.preventDefault(); go(next); }
  };
  const shift = (delta: number) => { const k = moveFocus(focus, delta < 0 ? 'PageUp' : 'PageDown')!; setFocus(k); setMonth(monthKey(k)); };
  const focusInMonth = monthKey(focus) === month ? focus : `${month}-01`;

  return (
    <Card>
      <CardHeader as="h2" title={monthLabel(month)}
        action={<div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shift(-1)} data-testid="cal-prev"><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shift(1)} data-testid="cal-next"><ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </div>} />
      <CardBody>
        <p className="mb-2 text-xs text-muted">Arrow keys move between days, Page Up/Down change month, Enter selects a day.</p>
        <table ref={grid} role="grid" aria-label={`${monthLabel(month)} study calendar`} className="w-full table-fixed border-separate border-spacing-0.5" onKeyDown={onKey} data-testid="planner-calendar">
          <thead><tr>{WEEKDAYS.map((w) => <th key={w} scope="col" className="pb-1 text-center text-[11px] font-medium text-muted"><abbr title={w} className="no-underline">{w.slice(0, 3)}</abbr></th>)}</tr></thead>
          <tbody>
            {weeks.map((wk) => (
              <tr key={wk[0]}>
                {wk.map((d) => {
                  const day = days.get(d);
                  const inMonth = monthKey(d) === month;
                  const done = day ? day.tasks.filter((t) => isTaskDone(t, row.checks, completed)).length : 0;
                  const missed = day && d < today && d >= row.generatedOn ? day.tasks.length - done : 0;
                  const isExam = d === row.input.examDate;
                  const label = `${dayLabel(d)}${d === today ? ', today' : ''}${isExam ? ', exam day' : ''}${day ? `, ${day.minutes} planned minutes, ${day.tasks.length} tasks, ${done} done${missed ? `, ${missed} missed` : ''}` : ', no study planned'}`;
                  return (
                    <td key={d} role="gridcell" aria-selected={d === selected} className="p-0">
                      <button type="button" data-date={d} tabIndex={d === focusInMonth ? 0 : -1} aria-label={label} aria-current={d === today ? 'date' : undefined}
                        onClick={() => { setFocus(d); onSelect(d); }} onFocus={() => setFocus(d)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d); } }}
                        className={cn('flex h-14 w-full flex-col items-center justify-start rounded-md border px-0.5 py-1 text-xs transition-colors sm:h-16',
                          d === selected ? 'border-primary bg-primary/15 font-semibold' : 'border-border bg-surface hover:bg-surface-2',
                          !inMonth && 'opacity-50', d === today && 'ring-2 ring-primary/60', isExam && 'border-danger')}>
                        <span className="tabular-nums">{Number(d.slice(8))}</span>
                        {day && <span className="mt-0.5 leading-tight text-[10px] text-muted"><span className="block">{day.minutes}m</span><span className="hidden sm:block">{day.tasks.length} task{day.tasks.length === 1 ? '' : 's'}</span></span>}
                        {day && done === day.tasks.length && <span className="text-[10px] font-semibold text-success" aria-hidden>done</span>}
                        {missed > 0 && <span className="text-[10px] font-semibold text-danger" aria-hidden>{missed} missed</span>}
                        {isExam && <span className="text-[10px] font-bold text-danger" aria-hidden>EXAM</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
