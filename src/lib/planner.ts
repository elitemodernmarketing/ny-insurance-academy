/**
 * Study planner — builds a day-by-day plan from today until the exam date.
 * Deterministic: same inputs → same plan. Re-running it after missed days automatically reschedules
 * unfinished lessons ("missed-study recovery").
 */
import { addDays, daysBetween, parseLocalDate } from './dates';

export interface PlannerInput {
  today: string; // YYYY-MM-DD
  examDate: string;
  studyDays: number[]; // 0=Sunday … 6=Saturday
  minutesPerDay: number;
  sessionLength: number; // preferred session length in minutes
  priorKnowledge: 'none' | 'some' | 'experienced';
}
export interface PlannerLesson { id: string; sectionId: string; title: string; estMinutes: number; completed: boolean }
export interface PlannerState {
  lessons: PlannerLesson[]; // in curriculum order
  weakSectionIds: string[]; // weakest first
  sectionNames: Record<string, string>;
  dueCards: number;
  /** Official exam shape; defaults to 150 questions / 150 minutes. */
  exam?: { questions: number; minutes: number };
}
export type TaskKind = 'lesson' | 'flashcards' | 'topic-quiz' | 'mixed-practice' | 'weakness-drill' | 'mock-exam' | 'custom-exam';
export interface PlanTask { id: string; kind: TaskKind; title: string; minutes: number; ref?: string }
export interface PlanDay { date: string; tasks: PlanTask[]; minutes: number; phase: 'learn' | 'review' | 'final' }
export interface StudyPlan {
  days: PlanDay[];
  studyDayCount: number;
  lessonsRemaining: number;
  lessonMinutesNeeded: number;
  minutesAvailable: number;
  overloaded: boolean;
  warnings: string[];
}

const PACE = { none: 1.25, some: 1.0, experienced: 0.8 } as const;

export function buildPlan(input: PlannerInput, state: PlannerState): StudyPlan {
  const warnings: string[] = [];
  const totalDays = daysBetween(input.today, input.examDate);
  const days: PlanDay[] = [];
  if (totalDays < 1) warnings.push('The exam date is today or in the past — pick a future date.');
  const studyDates: string[] = [];
  for (let i = 0; i < Math.max(0, totalDays); i++) {
    const d = addDays(input.today, i);
    if (input.studyDays.includes(parseLocalDate(d).getDay())) studyDates.push(d);
  }
  const perDay = Math.max(15, input.minutesPerDay);
  const remaining = state.lessons.filter((l) => !l.completed);
  const lessonMinutes = remaining.map((l) => Math.round(l.estMinutes * PACE[input.priorKnowledge]));
  const lessonMinutesNeeded = lessonMinutes.reduce((a, b) => a + b, 0);
  const minutesAvailable = studyDates.length * perDay;
  // Reserve the last ~25% of study days (min 2 if possible) for final review & mock exams.
  const finalDays = studyDates.length >= 4 ? Math.max(2, Math.round(studyDates.length * 0.25)) : 0;
  const learnDates = studyDates.slice(0, studyDates.length - finalDays);
  const learnBudgetPerDay = Math.round(perDay * 0.65);
  const learnCapacity = learnDates.length * learnBudgetPerDay;
  const overloaded = lessonMinutesNeeded > learnCapacity;
  if (overloaded) {
    const need = learnDates.length ? Math.ceil(lessonMinutesNeeded / 0.65 / learnDates.length) : lessonMinutesNeeded;
    warnings.push(`Remaining lessons need about ${Math.round(lessonMinutesNeeded / 60)} hours. Increase to ~${need} minutes per study day, add study days, or move the exam date. Lessons are packed as tightly as possible below.`);
  }
  if (studyDates.length === 0 && totalDays > 0) warnings.push('No study days fall before the exam date — select more weekdays.');

  let li = 0;
  let mockCount = 0;
  studyDates.forEach((date, idx) => {
    const isFinal = idx >= learnDates.length;
    const tasks: PlanTask[] = [];
    const t = (kind: TaskKind, title: string, minutes: number, ref?: string) =>
      tasks.push({ id: `${date}:${kind}:${tasks.length}`, kind, title, minutes: Math.max(5, Math.round(minutes)), ref });
    const cardMin = Math.min(20, Math.max(10, Math.round(perDay * 0.15)));
    t('flashcards', 'Flashcard review (due cards first)', cardMin);
    let budget = perDay - cardMin;
    if (!isFinal || li < remaining.length) {
      // Learning day: lessons then a short topic quiz on what was studied.
      const lessonBudget = overloaded ? budget * 0.8 : Math.min(budget * 0.75, learnBudgetPerDay);
      let used = 0;
      const studied = new Set<string>();
      while (li < remaining.length && (used === 0 || used + lessonMinutes[li] <= lessonBudget)) {
        t('lesson', `Lesson: ${remaining[li].title}`, lessonMinutes[li], remaining[li].id);
        used += lessonMinutes[li];
        studied.add(remaining[li].sectionId);
        li++;
        if (used >= lessonBudget) break;
      }
      budget -= used;
      if (budget >= 10) {
        const sec = [...studied][0] ?? state.weakSectionIds[0];
        if (sec) t('topic-quiz', `Topic quiz: ${state.sectionNames[sec] ?? sec}`, Math.min(budget, 25), sec);
        else t('mixed-practice', 'Mixed practice questions', Math.min(budget, 25));
      }
      days.push({ date, tasks, minutes: tasks.reduce((a, x) => a + x.minutes, 0), phase: isFinal ? 'final' : 'learn' });
      return;
    }
    // Final-review day.
    const daysLeft = studyDates.length - idx;
    const examMin = state.exam?.minutes ?? 150;
    const examQ = state.exam?.questions ?? 150;
    const fullExamFits = budget >= examMin;
    if (daysLeft > 1 && (mockCount === 0 || idx % 3 === 0)) {
      if (fullExamFits) t('mock-exam', `Full ${examQ}-question timed mock exam`, examMin);
      else t('custom-exam', `Custom ${budget >= 55 ? 50 : 25}-question timed practice`, budget >= 55 ? 50 : 25);
      mockCount++;
    } else {
      const weak = state.weakSectionIds[0];
      t('weakness-drill', weak ? `Weakness drill (focus: ${state.sectionNames[weak] ?? weak})` : 'Weakness drill', Math.min(30, budget * 0.5));
      t('mixed-practice', 'Mixed practice by exam weights', Math.min(40, budget * 0.5));
    }
    days.push({ date, tasks, minutes: tasks.reduce((a, x) => a + x.minutes, 0), phase: 'final' });
  });
  if (li < remaining.length) warnings.push(`${remaining.length - li} lesson(s) could not be scheduled before the exam date.`);
  return {
    days,
    studyDayCount: studyDates.length,
    lessonsRemaining: remaining.length,
    lessonMinutesNeeded,
    minutesAvailable,
    overloaded,
    warnings,
  };
}
