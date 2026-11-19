/**
 * Mock-exam logic (no React): planning, session creation, immediate persistence, submission and result view-models.
 *
 * Rules (see docs/ARCHITECTURE.md): no feedback during the exam; the deadline is an absolute timestamp; every change is
 * persisted at once; a session past its deadline is submitted automatically, also when the app is reopened later;
 * questions are never duplicated to fill a shortfall.
 */
import { content, lessonForQuestion } from '@/content';
import type { Lesson, Question } from '@/content/schema';
import { db, type ExamSessionRow } from '@/db/db';
import { newId, recordAttempt } from '@/db/repo';
import { detectConfusion } from '@/components/question/QuestionView';
import { allocate, assembleExam, type Allocation, type PoolQuestion, type Shortfall, type WeightedSection } from '@/lib/blueprint';
import { choiceOrder } from '@/lib/selection';
import { scoreExam, type ExamScore } from '@/lib/scoring';
import { deadlineFrom, isExpired, timeUsedMs } from '@/lib/timer';
import { bankQuestions } from '../practice/bank';

/** Custom practice sizes — always shorter than the official exam so they are never mistaken for it. */
export const CUSTOM_EXAM_SIZES: readonly number[] = content.manifest.exam.questionCount > 100 ? [25, 50, 100] : [25, 50, 75];
export const OFFICIAL_PASS_PERCENT = () => content.manifest.exam.passingPercent;

export interface ExamPlan {
  /** What the learner asked for. */
  requestedKind: 'full' | 'custom';
  /** Stored kind: a full exam that falls short is stored as 'custom' so it never counts as an official-format attempt. */
  kind: 'full' | 'custom';
  requested: number;
  size: number;
  timeLimitMin: number;
  seed: number;
  questionIds: string[];
  allocation: Allocation;
  shortfalls: Shortfall[];
}

export interface PlanOptions {
  pool?: PoolQuestion[];
  sections?: WeightedSection[];
  exposure?: Record<string, number>;
  officialCount?: number;
  officialMinutes?: number;
}

/** Blueprint-weighted, duplicate-free exam plan. Shortfalls are reported, never padded with repeats. */
export function planExam(requestedKind: 'full' | 'custom', customSize: number, seed: number, opts: PlanOptions = {}): ExamPlan {
  const pool = opts.pool ?? content.questions;
  const sections = opts.sections ?? content.sections;
  const officialCount = opts.officialCount ?? content.manifest.exam.questionCount;
  const officialMinutes = opts.officialMinutes ?? content.manifest.exam.timeLimitMinutes;
  const requested = requestedKind === 'full' ? officialCount : customSize;
  const allocation = allocate(requested, sections, seed);
  const a = assembleExam(pool, allocation, seed, opts.exposure ?? {});
  const size = a.questionIds.length;
  const short = a.shortfalls.length > 0;
  const kind: 'full' | 'custom' = requestedKind === 'full' && !short ? 'full' : 'custom';
  const timeLimitMin = requestedKind === 'full'
    ? (short ? Math.max(1, Math.ceil((officialMinutes * size) / officialCount)) : officialMinutes)
    : Math.max(1, size); // custom practice exams: 1 minute per question
  return { requestedKind, kind, requested, size, timeLimitMin, seed, questionIds: a.questionIds, allocation, shortfalls: a.shortfalls };
}

export function missingTotal(shortfalls: Shortfall[]): number {
  return shortfalls.reduce((n, s) => n + (s.required - s.available), 0);
}

export async function createExamSession(plan: ExamPlan, now = Date.now()): Promise<ExamSessionRow> {
  if (plan.questionIds.length === 0) throw new Error('No eligible questions are available for this exam yet.');
  const id = newId('ex');
  const questions = bankQuestions(plan.questionIds);
  const choiceOrders: Record<string, string[]> = {};
  for (const q of questions) choiceOrders[q.id] = choiceOrder(q.choices.map((c) => c.id), `${id}:${q.id}`);
  const row: ExamSessionRow = {
    id, kind: plan.kind, size: plan.questionIds.length, seed: plan.seed, questionIds: plan.questionIds, choiceOrders,
    answers: {}, flags: [], currentIndex: 0, startedAt: now, deadline: deadlineFrom(now, plan.timeLimitMin), timeLimitMin: plan.timeLimitMin,
    submittedAt: null, track: content.manifest.id, status: 'in-progress', autoSubmitted: false, shortfalls: plan.shortfalls, timeOnQuestion: {},
  };
  await db.examSessions.put(row);
  return row;
}

// ------------------------------------------------------------------ labels
/** Number of questions the learner originally asked for (actual size + what the bank could not supply). */
export function requestedSize(row: Pick<ExamSessionRow, 'size' | 'shortfalls'>): number {
  return row.size + missingTotal(row.shortfalls);
}
export type ExamFormat = 'official' | 'shortened-full' | 'custom';
export function examFormat(row: Pick<ExamSessionRow, 'kind' | 'size' | 'shortfalls'>): ExamFormat {
  if (row.kind === 'full') return 'official';
  return requestedSize(row) === content.manifest.exam.questionCount ? 'shortened-full' : 'custom';
}
export function examLabel(row: Pick<ExamSessionRow, 'kind' | 'size' | 'shortfalls'>): string {
  const f = examFormat(row);
  if (f === 'official') return `Full exam (official format, ${row.size} questions)`;
  if (f === 'shortened-full') return `Shortened full exam (${row.size} of ${content.manifest.exam.questionCount} questions)`;
  const asked = requestedSize(row);
  return row.shortfalls.length ? `Custom practice exam (${row.size} of ${asked} questions)` : `Custom practice exam (${row.size} questions)`;
}

// ------------------------------------------------------------------ pure state transforms (also used for optimistic UI)
export type ExamTransform = (r: ExamSessionRow) => ExamSessionRow;
export const withAnswer = (qid: string, choice: string | null): ExamTransform => (r) => {
  const answers = { ...r.answers };
  if (choice) answers[qid] = choice; else delete answers[qid];
  return { ...r, answers };
};
export const withFlagToggled = (qid: string): ExamTransform => (r) => ({ ...r, flags: r.flags.includes(qid) ? r.flags.filter((x) => x !== qid) : [...r.flags, qid] });
export const withIndex = (i: number): ExamTransform => (r) => ({ ...r, currentIndex: Math.max(0, Math.min(r.questionIds.length - 1, Math.floor(i))) });
export const withTimeAdded = (qid: string, ms: number): ExamTransform => (r) => ({ ...r, timeOnQuestion: { ...r.timeOnQuestion, [qid]: Math.round((r.timeOnQuestion[qid] ?? 0) + Math.max(0, ms)) } });

/** Read-modify-write one exam row inside a transaction. A submitted exam is never modified. */
export async function persistExam(id: string, fn: ExamTransform): Promise<ExamSessionRow | undefined> {
  return db.transaction('rw', db.examSessions, async () => {
    const cur = await db.examSessions.get(id);
    if (!cur || cur.status !== 'in-progress') return cur;
    const next = fn(cur);
    await db.examSessions.put(next);
    return next;
  });
}

export function answeredIds(row: Pick<ExamSessionRow, 'questionIds' | 'answers'>): string[] {
  return row.questionIds.filter((id) => !!row.answers[id]);
}
export function shouldAutoSubmit(row: Pick<ExamSessionRow, 'status' | 'deadline'>, now: number): boolean {
  return row.status === 'in-progress' && isExpired(row.deadline, now);
}

// ------------------------------------------------------------------ announcements (aria-live)
export const ANNOUNCE_AT_MIN = [30, 15, 5, 1] as const;
/**
 * Which time-remaining announcement (if any) should be made now. `announced` holds thresholds already handled;
 * thresholds longer than the exam itself never fire. Returns the updated set.
 */
export function nextAnnouncement(remainingMs: number, announced: ReadonlySet<number>, timeLimitMin: number): { message: string | null; announced: Set<number> } {
  const set = new Set(announced);
  let crossed: number | null = null;
  for (const t of ANNOUNCE_AT_MIN) {
    if (t >= timeLimitMin || set.has(t)) continue;
    if (remainingMs <= t * 60_000 && remainingMs > 0) { set.add(t); crossed = crossed === null ? t : Math.min(crossed, t); }
  }
  if (crossed === null) return { message: null, announced: set };
  const mins = Math.max(1, Math.ceil(remainingMs / 60_000));
  return { message: `${mins} minute${mins === 1 ? '' : 's'} remaining`, announced: set };
}
/** Thresholds already passed at a given moment (used to avoid announcing stale ones after a reload). */
export function alreadyCrossed(remainingMs: number, timeLimitMin: number): Set<number> {
  return new Set(ANNOUNCE_AT_MIN.filter((t) => t < timeLimitMin && remainingMs <= t * 60_000));
}

// ------------------------------------------------------------------ submission
/**
 * Submit an exam: score it, store the result, and record one attempt per question (unanswered = incorrect, choiceId null),
 * all in one transaction. Idempotent: a second call returns the stored result without recording anything twice.
 */
export async function submitExam(id: string, opts: { auto?: boolean; now?: number } = {}): Promise<ExamSessionRow | undefined> {
  const now = opts.now ?? Date.now();
  return db.transaction('rw', db.examSessions, db.attempts, db.cards, async () => {
    const row = await db.examSessions.get(id);
    if (!row || row.status === 'submitted') return row;
    const questions = bankQuestions(row.questionIds);
    const pass = OFFICIAL_PASS_PERCENT();
    const score = scoreExam(questions, row.answers, pass);
    const endAt = opts.auto ? Math.min(now, row.deadline) : now;
    const used = timeUsedMs(row.startedAt, endAt, row.timeLimitMin * 60_000);
    const submitted: ExamSessionRow = {
      ...row, status: 'submitted', submittedAt: endAt, autoSubmitted: !!opts.auto, result: { ...score, timeUsedMs: used },
    };
    await db.examSessions.put(submitted);
    for (const q of questions) {
      const choice = row.answers[q.id] ?? null;
      await recordAttempt({
        questionId: q.id, sectionId: q.sectionId, concepts: q.concepts, difficulty: q.difficulty,
        correct: choice !== null && choice === q.correct, choiceId: choice, confidence: null,
        responseMs: row.timeOnQuestion[q.id] ?? 0, mode: 'exam', sessionId: id, at: endAt,
        confusedWith: choice ? detectConfusion(q, choice) : undefined, contentVersion: q.version,
      });
    }
    return submitted;
  });
}

export async function discardExam(id: string): Promise<void> {
  await db.examSessions.delete(id);
}

// ------------------------------------------------------------------ results
export interface WeakSection {
  sectionId: string; name: string; pct: number; correct: number; total: number;
  lessons: Lesson[];
}
export interface ExamResultView {
  score: ExamScore;
  timeUsedMs: number;
  avgMsPerQuestion: number;
  label: string;
  questions: Question[];
  weakSections: WeakSection[];
  followUpSections: { sectionId: string; name: string; pct: number }[];
  practiceTarget: number;
  reachedTarget: boolean;
}

export function buildResultView(row: ExamSessionRow, practiceTarget: number): ExamResultView {
  const questions = bankQuestions(row.questionIds);
  const score = row.result ?? scoreExam(questions, row.answers, OFFICIAL_PASS_PERCENT());
  const used = row.result?.timeUsedMs ?? timeUsedMs(row.startedAt, row.submittedAt ?? row.startedAt, row.timeLimitMin * 60_000);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const pass = score.passingPercent;
  const name = (sid: string) => content.sectionById.get(sid as never)?.shortName ?? sid;
  const weakSections: WeakSection[] = score.bySection
    .filter((s) => s.pct < pass)
    .map((s) => {
      const lessons = new Map<string, Lesson>();
      for (const id of score.missedIds) {
        const q = byId.get(id);
        if (!q || q.sectionId !== s.sectionId) continue;
        const l = lessonForQuestion(q);
        if (l) lessons.set(l.id, l);
      }
      return { sectionId: s.sectionId, name: name(s.sectionId), pct: s.pct, correct: s.correct, total: s.total, lessons: [...lessons.values()] };
    });
  const followUpSections = score.bySection.filter((s) => s.pct < 100).slice(0, 3).map((s) => ({ sectionId: s.sectionId, name: name(s.sectionId), pct: s.pct }));
  return {
    score, timeUsedMs: used, avgMsPerQuestion: score.total ? used / score.total : 0, label: examLabel(row), questions,
    weakSections, followUpSections, practiceTarget, reachedTarget: score.pct >= practiceTarget,
  };
}

export type ReviewFilter = 'all' | 'incorrect' | 'unanswered' | 'flagged';
export function filterReview(row: ExamSessionRow, questions: Question[], f: ReviewFilter): Question[] {
  return questions.filter((q) => {
    const a = row.answers[q.id];
    if (f === 'incorrect') return !!a && a !== q.correct;
    if (f === 'unanswered') return !a;
    if (f === 'flagged') return row.flags.includes(q.id);
    return true;
  });
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${sec} s`;
  return `${sec} s`;
}
