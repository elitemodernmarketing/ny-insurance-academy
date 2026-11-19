/** Pure planner helpers: task routing, completion, missed-task recovery, milestones and calendar math. */
import { buildPlan, type PlanDay, type PlanTask, type PlannerInput, type PlannerState, type StudyPlan } from '@/lib/planner';
import { addDays, parseLocalDate, localDate } from '@/lib/dates';
import type { PlanRow } from '@/db/db';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Where a planned task sends the learner. */
export function taskRoute(t: Pick<PlanTask, 'kind' | 'ref'>): string {
  switch (t.kind) {
    case 'lesson': return t.ref ? `/lesson/${t.ref}` : '/learn';
    case 'topic-quiz': return t.ref ? `/practice?mode=topic&section=${t.ref}` : '/practice?mode=mixed';
    case 'mixed-practice': return '/practice?mode=mixed';
    case 'weakness-drill': return '/practice?mode=weakness';
    case 'flashcards': return '/flashcards';
    case 'mock-exam':
    case 'custom-exam': return '/exam';
  }
}
export const TASK_LABEL: Record<PlanTask['kind'], string> = {
  lesson: 'Open lesson', 'topic-quiz': 'Start quiz', 'mixed-practice': 'Practice', 'weakness-drill': 'Start drill',
  flashcards: 'Review cards', 'mock-exam': 'Start exam', 'custom-exam': 'Start exam',
};

/** A lesson task counts as done when the lesson itself is completed, regardless of the manual checkbox. */
export function isAutoChecked(t: PlanTask, completedLessons: ReadonlySet<string>): boolean {
  return t.kind === 'lesson' && !!t.ref && completedLessons.has(t.ref);
}
export function isTaskDone(t: PlanTask, checks: Record<string, boolean>, completedLessons: ReadonlySet<string>): boolean {
  return !!checks[t.id] || isAutoChecked(t, completedLessons);
}

/** Tasks on days before `today` (and on/after the plan's generation date) that are not done. */
export function missedTasks(row: Pick<PlanRow, 'plan' | 'checks' | 'generatedOn'>, completedLessons: ReadonlySet<string>, today: string): { day: PlanDay; task: PlanTask }[] {
  const out: { day: PlanDay; task: PlanTask }[] = [];
  for (const day of row.plan.days) {
    if (day.date >= today || day.date < row.generatedOn) continue;
    for (const task of day.tasks) if (!isTaskDone(task, row.checks, completedLessons)) out.push({ day, task });
  }
  return out;
}

/**
 * Build (or rebuild) the plan from `today`. Days before today are kept from the existing plan, with their checks, so
 * history stays visible; everything from today on is regenerated. Check keys for future days are discarded because
 * task ids are positional ("<date>:<kind>:<n>").
 */
export function generatePlan(input: PlannerInput, state: PlannerState, existing: Pick<PlanRow, 'plan' | 'checks'> | undefined, today: string): Pick<PlanRow, 'input' | 'generatedOn' | 'plan' | 'checks'> {
  const nextInput: PlannerInput = { ...input, today };
  const fresh = buildPlan(nextInput, state);
  const pastDays = (existing?.plan.days ?? []).filter((d) => d.date < today);
  const pastIds = new Set(pastDays.flatMap((d) => d.tasks.map((t) => t.id)));
  const checks: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(existing?.checks ?? {})) if (pastIds.has(k)) checks[k] = v;
  const plan: StudyPlan = { ...fresh, days: [...pastDays, ...fresh.days] };
  return { input: nextInput, generatedOn: today, plan, checks };
}

export interface Milestone { id: string; label: string; date: string | null; note?: string }

/** Dates when 25/50/75/100% of all lessons are scheduled to be done, the first mock exam and exam day. */
export function milestones(row: Pick<PlanRow, 'plan' | 'generatedOn' | 'input'>, totalLessons: number): Milestone[] {
  const out: Milestone[] = [];
  const base = Math.max(0, totalLessons - row.plan.lessonsRemaining);
  const upcoming = row.plan.days.filter((d) => d.date >= row.generatedOn);
  const seen = new Set<string>();
  const cumulative: { date: string; done: number }[] = [];
  let done = base;
  for (const d of upcoming) {
    for (const t of d.tasks) if (t.kind === 'lesson' && t.ref && !seen.has(t.ref)) { seen.add(t.ref); done++; }
    cumulative.push({ date: d.date, done });
  }
  if (totalLessons > 0) {
    for (const p of [25, 50, 75, 100]) {
      const need = Math.ceil((totalLessons * p) / 100);
      if (base >= need) out.push({ id: `lessons-${p}`, label: `${p}% of lessons done`, date: null, note: 'Already reached' });
      else {
        const hit = cumulative.find((c) => c.done >= need);
        out.push({ id: `lessons-${p}`, label: `${p}% of lessons done`, date: hit?.date ?? null, note: hit ? undefined : 'Not scheduled before the exam' });
      }
    }
  }
  const mock = upcoming.find((d) => d.tasks.some((t) => t.kind === 'mock-exam' || t.kind === 'custom-exam'));
  out.push({ id: 'first-mock', label: 'First timed mock exam', date: mock?.date ?? null, note: mock ? undefined : 'None scheduled' });
  out.push({ id: 'exam-day', label: 'Exam day', date: row.input.examDate });
  return out;
}

// ----------------------------------------------------------------- calendar math
export function monthKey(date: string): string { return date.slice(0, 7); }
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function dayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
/** Sunday-first weeks covering the month, including leading/trailing days from adjacent months. */
export function monthGrid(key: string): string[][] {
  const first = `${key}-01`;
  const start = addDays(first, -parseLocalDate(first).getDay());
  const weeks: string[][] = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cur, i));
    if (w >= 4 && monthKey(week[0]) !== key) break;
    weeks.push(week);
    cur = addDays(cur, 7);
  }
  return weeks;
}
/** Keyboard navigation inside the grid. Returns the new focused date, or null if the key is not handled. */
export function moveFocus(date: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft': return addDays(date, -1);
    case 'ArrowRight': return addDays(date, 1);
    case 'ArrowUp': return addDays(date, -7);
    case 'ArrowDown': return addDays(date, 7);
    case 'Home': return addDays(date, -parseLocalDate(date).getDay());
    case 'End': return addDays(date, 6 - parseLocalDate(date).getDay());
    case 'PageUp': return shiftClamped(date, -1);
    case 'PageDown': return shiftClamped(date, 1);
    default: return null;
  }
}
function shiftClamped(date: string, delta: number): string {
  const k = shiftMonth(monthKey(date), delta);
  return `${k}-${String(Math.min(Number(date.slice(8)), daysIn(k))).padStart(2, '0')}`;
}
function daysIn(key: string): number { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }

export function sessionsFor(minutes: number, sessionLength: number): number {
  return Math.max(1, Math.ceil(minutes / Math.max(5, sessionLength)));
}

/** Weak sections first, restricted to sections that actually have practice questions. */
export function weakSections(stats: { id: string; mastery: number; weightPct: number }[], hasQuestions: (id: string) => boolean): string[] {
  return stats.filter((s) => hasQuestions(s.id)).sort((a, b) => a.mastery - b.mastery || b.weightPct - a.weightPct).map((s) => s.id);
}

export function defaultInput(today: string, over: Partial<PlannerInput> = {}): PlannerInput {
  return { today, examDate: addDays(today, 60), studyDays: [1, 2, 3, 4, 5], minutesPerDay: 60, sessionLength: 30, priorKnowledge: 'none', ...over };
}

export function validateInput(i: PlannerInput, today = localDate()): string[] {
  const errs: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.examDate)) errs.push('Choose your exam date.');
  else if (i.examDate <= today) errs.push('The exam date must be in the future.');
  if (!i.studyDays.length) errs.push('Pick at least one study day.');
  if (!(i.minutesPerDay >= 15 && i.minutesPerDay <= 600)) errs.push('Minutes per study day must be between 15 and 600.');
  return errs;
}
