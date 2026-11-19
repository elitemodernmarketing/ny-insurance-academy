import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { db, type PlanRow } from '@/db/db';
import { addDays, localDate } from '@/lib/dates';
import type { PlanTask, PlannerState, StudyPlan } from '@/lib/planner';
import PlannerPage from './PlannerPage';
import { generatePlan, isAutoChecked, isTaskDone, milestones, missedTasks, monthGrid, moveFocus, taskRoute, validateInput, defaultInput, sessionsFor } from './plannerHelpers';

const today = localDate();
const wrap = (ui: React.ReactElement) => render(<MemoryRouter><TooltipProvider>{ui}</TooltipProvider></MemoryRouter>);

const T = (id: string, kind: PlanTask['kind'], ref?: string, minutes = 20): PlanTask => ({ id, kind, title: `Task ${id}`, minutes, ref });
const state: PlannerState = {
  lessons: Array.from({ length: 8 }, (_, i) => ({ id: `gen-l0${i + 1}`, sectionId: 'gen', title: `Lesson ${i + 1}`, estMinutes: 20, completed: false })),
  weakSectionIds: ['gen'], sectionNames: { gen: 'General' }, dueCards: 0,
};
const basePlan = (days: StudyPlan['days'], over: Partial<StudyPlan> = {}): StudyPlan => ({ days, studyDayCount: days.length, lessonsRemaining: 8, lessonMinutesNeeded: 200, minutesAvailable: 600, overloaded: false, warnings: [], ...over });

describe('task routing', () => {
  it('maps every task kind to the right route', () => {
    expect(taskRoute({ kind: 'lesson', ref: 'gen-l01' })).toBe('/lesson/gen-l01');
    expect(taskRoute({ kind: 'topic-quiz', ref: 'ann' })).toBe('/practice?mode=topic&section=ann');
    expect(taskRoute({ kind: 'mixed-practice' })).toBe('/practice?mode=mixed');
    expect(taskRoute({ kind: 'weakness-drill' })).toBe('/practice?mode=weakness');
    expect(taskRoute({ kind: 'flashcards' })).toBe('/flashcards');
    expect(taskRoute({ kind: 'mock-exam' })).toBe('/exam');
    expect(taskRoute({ kind: 'custom-exam' })).toBe('/exam');
  });
});

describe('completion and recovery', () => {
  const done = new Set(['gen-l01']);
  it('lesson tasks auto-check when the lesson is completed', () => {
    const lesson = T('a', 'lesson', 'gen-l01');
    expect(isAutoChecked(lesson, done)).toBe(true);
    expect(isTaskDone(lesson, {}, done)).toBe(true);
    expect(isTaskDone(T('b', 'lesson', 'gen-l02'), {}, done)).toBe(false);
    expect(isTaskDone(T('b', 'lesson', 'gen-l02'), { b: true }, done)).toBe(true);
    expect(isAutoChecked(T('c', 'flashcards'), done)).toBe(false);
  });
  it('counts unchecked tasks on past days only', () => {
    const y = addDays(today, -1), t2 = addDays(today, -2);
    const row = { generatedOn: t2, checks: { 'x:1': true } as Record<string, boolean>, plan: basePlan([
      { date: t2, phase: 'learn', minutes: 40, tasks: [T('x:1', 'flashcards'), T('x:2', 'lesson', 'gen-l01')] },
      { date: y, phase: 'learn', minutes: 40, tasks: [T('y:1', 'flashcards'), T('y:2', 'lesson', 'gen-l02')] },
      { date: today, phase: 'learn', minutes: 20, tasks: [T('z:1', 'flashcards')] },
    ]) };
    const m = missedTasks(row, done, today);
    expect(m.map((x) => x.task.id)).toEqual(['y:1', 'y:2']); // x:1 checked, x:2 auto-checked, today not past
  });
  it('rebuild keeps past days and their checks, regenerates from today', () => {
    const y = addDays(today, -1);
    const existing = { checks: { [`${y}:flashcards:0`]: true, [`${addDays(today, 1)}:flashcards:0`]: true }, plan: basePlan([{ date: y, phase: 'learn' as const, minutes: 15, tasks: [{ id: `${y}:flashcards:0`, kind: 'flashcards' as const, title: 'old', minutes: 15 }] }]) };
    const input = defaultInput(addDays(today, -5), { examDate: addDays(today, 40), studyDays: [0, 1, 2, 3, 4, 5, 6] });
    const out = generatePlan(input, state, existing, today);
    expect(out.generatedOn).toBe(today);
    expect(out.input.today).toBe(today);
    expect(out.plan.days[0].date).toBe(y);
    expect(out.plan.days.slice(1).every((d) => d.date >= today)).toBe(true);
    expect(out.checks).toEqual({ [`${y}:flashcards:0`]: true }); // future-day check dropped, past kept
    // after a rebuild nothing is "missed" because tracking starts at generatedOn
    expect(missedTasks({ ...out }, new Set(), today)).toHaveLength(0);
  });
  it('validates settings', () => {
    expect(validateInput(defaultInput(today), today)).toEqual([]);
    expect(validateInput(defaultInput(today, { examDate: today }), today)).toContain('The exam date must be in the future.');
    expect(validateInput(defaultInput(today, { studyDays: [] }), today).join()).toMatch(/study day/);
    expect(validateInput(defaultInput(today, { minutesPerDay: 5 }), today).join()).toMatch(/15 and 600/);
    expect(sessionsFor(75, 30)).toBe(3);
  });
});

describe('milestones and calendar math', () => {
  it('computes lesson percentage milestones from the schedule', () => {
    const lessonDay = (date: string, ids: string[]) => ({ date, phase: 'learn' as const, minutes: 30, tasks: ids.map((id, i) => T(`${date}:${i}`, 'lesson', id)) });
    const plan = basePlan([
      lessonDay('2027-01-04', ['l1', 'l2']), lessonDay('2027-01-05', ['l3', 'l4']), lessonDay('2027-01-06', ['l5', 'l6']), lessonDay('2027-01-07', ['l7', 'l8']),
      { date: '2027-01-10', phase: 'final', minutes: 60, tasks: [T('m', 'mock-exam')] },
    ], { lessonsRemaining: 8 });
    const ms = milestones({ plan, generatedOn: '2027-01-04', input: defaultInput('2027-01-04', { examDate: '2027-01-20' }) }, 8);
    const by = Object.fromEntries(ms.map((m) => [m.id, m]));
    expect(by['lessons-25'].date).toBe('2027-01-04');
    expect(by['lessons-50'].date).toBe('2027-01-05');
    expect(by['lessons-75'].date).toBe('2027-01-06');
    expect(by['lessons-100'].date).toBe('2027-01-07');
    expect(by['first-mock'].date).toBe('2027-01-10');
    expect(by['exam-day'].date).toBe('2027-01-20');
  });
  it('reports already-reached milestones', () => {
    const ms = milestones({ plan: basePlan([], { lessonsRemaining: 2 }), generatedOn: '2027-01-04', input: defaultInput('2027-01-04') }, 8);
    expect(ms.find((m) => m.id === 'lessons-50')?.note).toBe('Already reached');
    expect(ms.find((m) => m.id === 'lessons-100')?.note).toMatch(/Not scheduled/);
  });
  it('month grid is Sunday-first, whole weeks, and keyboard moves work', () => {
    const g = monthGrid('2026-11');
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toBe('2026-11-01'); // Nov 1 2026 is a Sunday
    expect(g.flat()).toContain('2026-11-30');
    expect(moveFocus('2026-11-19', 'ArrowRight')).toBe('2026-11-20');
    expect(moveFocus('2026-11-19', 'ArrowUp')).toBe('2026-11-12');
    expect(moveFocus('2026-11-19', 'Home')).toBe('2026-11-15');
    expect(moveFocus('2026-11-19', 'End')).toBe('2026-11-21');
    expect(moveFocus('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveFocus('2026-11-19', 'x')).toBeNull();
  });
});

async function seedRow(over: Partial<PlanRow> = {}) {
  const tasks: PlanTask[] = [
    { id: `${today}:flashcards:0`, kind: 'flashcards', title: 'Flashcard review', minutes: 10 },
    { id: `${today}:lesson:1`, kind: 'lesson', title: 'Lesson: done one', minutes: 20, ref: 'reg-l01' },
    { id: `${today}:lesson:2`, kind: 'lesson', title: 'Lesson: open one', minutes: 20, ref: 'reg-l02' },
    { id: `${today}:topic-quiz:3`, kind: 'topic-quiz', title: 'Topic quiz: Regulation', minutes: 15, ref: 'reg' },
    { id: `${today}:mixed-practice:4`, kind: 'mixed-practice', title: 'Mixed practice', minutes: 15 },
    { id: `${today}:weakness-drill:5`, kind: 'weakness-drill', title: 'Weakness drill', minutes: 15 },
    { id: `${today}:custom-exam:6`, kind: 'custom-exam', title: 'Custom exam', minutes: 50 },
  ];
  const row: PlanRow = {
    id: 'current', generatedOn: today, checks: {},
    input: defaultInput(today, { examDate: addDays(today, 30), studyDays: [0, 1, 2, 3, 4, 5, 6] }),
    plan: basePlan([{ date: today, phase: 'learn', minutes: 145, tasks }]), ...over,
  };
  await db.plan.put(row);
  await db.lessonProgress.put({ lessonId: 'reg-l01', sectionId: 'reg', status: 'completed', partsViewed: [], activityDone: true, kcCorrect: 0, kcTotal: 0, quizBest: null, startedAt: 1, completedAt: 2, lastVisitedAt: 2, visits: 1 });
  return row;
}

beforeEach(async () => { await db.plan.clear(); await db.lessonProgress.clear(); });

describe('planner page', () => {
  it('shows the settings form when there is no plan, then generates and saves one', async () => {
    const user = userEvent.setup();
    wrap(<PlannerPage />);
    const gen = await screen.findByTestId('planner-generate');
    expect(screen.getByText(/No study plan yet/)).toBeInTheDocument();
    await user.click(gen);
    await waitFor(async () => expect(await db.plan.get('current')).toBeTruthy());
    const saved = (await db.plan.get('current'))!;
    expect(saved.generatedOn).toBe(today);
    expect(saved.input.examDate).toBe(addDays(today, 60));
    expect(saved.plan.days.length).toBeGreaterThan(0);
    expect(await screen.findByTestId('planner-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('upcoming')).toBeInTheDocument();
    expect(screen.getByTestId('milestones')).toHaveTextContent(/Exam day/);
  });

  it('rejects a past exam date with an alert', async () => {
    const user = userEvent.setup();
    wrap(<PlannerPage />);
    const date = await screen.findByTestId('planner-exam-date');
    await user.clear(date); await user.type(date, today);
    await user.click(screen.getByTestId('planner-generate'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be in the future/);
    expect(await db.plan.get('current')).toBeUndefined();
  });

  it('links each task to its route and auto-checks completed lessons', async () => {
    await seedRow();
    wrap(<PlannerPage />);
    const upcoming = await screen.findByTestId('upcoming');
    const hrefOf = (title: RegExp) => within(upcoming).getByRole('link', { name: title }).getAttribute('href');
    expect(hrefOf(/Review cards/)).toBe('/flashcards');
    expect(hrefOf(/Open lesson: Lesson: done one/)).toBe('/lesson/reg-l01');
    expect(hrefOf(/Open lesson: Lesson: open one/)).toBe('/lesson/reg-l02');
    expect(hrefOf(/Start quiz/)).toBe('/practice?mode=topic&section=reg');
    expect(hrefOf(/Practice: Mixed/)).toBe('/practice?mode=mixed');
    expect(hrefOf(/Start drill/)).toBe('/practice?mode=weakness');
    expect(hrefOf(/Start exam/)).toBe('/exam');
    const checks = within(upcoming).getAllByTestId('planner-task-check') as HTMLInputElement[];
    expect(checks[1]).toBeChecked(); expect(checks[1]).toBeDisabled(); // reg-l01 completed
    expect(checks[2]).not.toBeChecked();
  });

  it('stores a manual check in plan.checks', async () => {
    const row = await seedRow();
    const user = userEvent.setup();
    wrap(<PlannerPage />);
    const upcoming = await screen.findByTestId('upcoming');
    await user.click(within(upcoming).getAllByTestId('planner-task-check')[0]);
    await waitFor(async () => expect((await db.plan.get('current'))!.checks[`${today}:flashcards:0`]).toBe(true));
    expect(row.checks).toEqual({}); // original object untouched
  });

  it('offers recovery for missed tasks and rebuilds from today keeping past checks', async () => {
    const y = addDays(today, -1);
    const pastTasks: PlanTask[] = [{ id: `${y}:flashcards:0`, kind: 'flashcards', title: 'Old cards', minutes: 15 }, { id: `${y}:lesson:1`, kind: 'lesson', title: 'Old lesson', minutes: 20, ref: 'reg-l02' }];
    await seedRow({ generatedOn: y, checks: { [`${y}:flashcards:0`]: true }, plan: basePlan([{ date: y, phase: 'learn', minutes: 35, tasks: pastTasks }, { date: today, phase: 'learn', minutes: 10, tasks: [{ id: `${today}:flashcards:0`, kind: 'flashcards', title: 'Cards today', minutes: 10 }] }]) });
    const user = userEvent.setup();
    wrap(<PlannerPage />);
    const banner = await screen.findByTestId('planner-missed');
    expect(banner).toHaveTextContent('You missed 1 task');
    await user.click(screen.getByTestId('planner-rebuild'));
    await waitFor(async () => expect((await db.plan.get('current'))!.generatedOn).toBe(today));
    const saved = (await db.plan.get('current'))!;
    expect(saved.plan.days[0].date).toBe(y);
    expect(saved.checks[`${y}:flashcards:0`]).toBe(true);
    expect(saved.plan.days.some((d) => d.date === today)).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('planner-missed')).not.toBeInTheDocument());
  });
});
