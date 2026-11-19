import { content } from '@/content';
/** Pure curriculum helpers (unit tested). */
import type { Lesson, OutlineNode, Question } from '@/content/schema';
import type { LessonProgressRow } from '@/db/db';
import { rngFrom, shuffle } from '@/lib/rng';

export type LessonStatus = 'not-started' | 'in-progress' | 'completed';
export function lessonStatus(row: Pick<LessonProgressRow, 'status'> | undefined | null): LessonStatus {
  if (!row) return 'not-started';
  return row.status === 'completed' ? 'completed' : 'in-progress';
}
export const STATUS_LABEL: Record<LessonStatus, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Completed' };

/** Approximate number of exam questions for a section weight (the exam has 150 scored items ≈ weight × 1.5). */
export function approxExamQuestions(weightPct: number, examSize = content.manifest.exam.questionCount): number {
  return Math.round((weightPct * examSize) / 100);
}

export type OutlineCoverage = 'covered' | 'partial' | 'none';
export interface OutlineEntry { node: OutlineNode; depth: number; coverage: OutlineCoverage; lessons: Lesson[] }

/**
 * Walk an outline tree and mark each node covered when a lesson lists it (or an ancestor) in `outlineIds`,
 * `partial` when only some descendants are covered, `none` otherwise.
 */
export function outlineCoverage(nodes: OutlineNode[], lessonsByOutline: Map<string, Lesson[]>): Map<string, OutlineEntry> {
  const out = new Map<string, OutlineEntry>();
  const walk = (list: OutlineNode[], depth: number, inherited: Lesson[]): { any: boolean } => {
    let anyHere = false;
    for (const n of list) {
      const direct = lessonsByOutline.get(n.id) ?? [];
      const lessons = [...new Map([...inherited, ...direct].map((l) => [l.id, l])).values()];
      const entry: OutlineEntry = { node: n, depth, coverage: lessons.length ? 'covered' : 'none', lessons };
      out.set(n.id, entry);
      const child = n.children?.length ? walk(n.children, depth + 1, lessons) : { any: false };
      if (!lessons.length && child.any) entry.coverage = 'partial';
      if (entry.coverage !== 'none') anyHere = true;
    }
    return { any: anyHere };
  };
  walk(nodes, 0, []);
  return out;
}
/** Count of leaf-or-any nodes by coverage for a summary line. */
export function coverageSummary(entries: Map<string, OutlineEntry>): { covered: number; total: number } {
  let covered = 0;
  for (const e of entries.values()) if (e.coverage === 'covered') covered++;
  return { covered, total: entries.size };
}

const isDescendantOrSame = (id: string, ancestor: string) => id === ancestor || id.startsWith(`${ancestor}.`);

/**
 * Bank questions eligible for an end-of-lesson quiz: those whose outline ids overlap the lesson's outline ids
 * (or their descendants); topped up with questions that share a key term when there are too few.
 * Deterministic for a given seed. Returns at most `max` questions.
 */
export function lessonQuizPool(lesson: Pick<Lesson, 'id' | 'outlineIds' | 'keyTerms'>, questions: Question[], seed: number | string = 0, max = 5): Question[] {
  const byOutline = questions.filter((q) => q.outlineIds.some((qo) => lesson.outlineIds.some((lo) => isDescendantOrSame(qo, lo) || isDescendantOrSame(lo, qo))));
  const rng = rngFrom(`${lesson.id}:${seed}`);
  const picked = shuffle(byOutline, rng).slice(0, max);
  if (picked.length < max) {
    const used = new Set(picked.map((q) => q.id));
    const terms = new Set(lesson.keyTerms);
    const byTerm = questions.filter((q) => !used.has(q.id) && q.concepts.some((c) => terms.has(c)));
    picked.push(...shuffle(byTerm, rng).slice(0, max - picked.length));
  }
  return picked;
}

/** Add a viewed part index (immutably, sorted, unique). */
export function withPartViewed(viewed: number[], index: number): number[] {
  return viewed.includes(index) ? viewed : [...viewed, index].sort((a, b) => a - b);
}

/** Can the lesson be marked complete? All parts viewed and all knowledge checks answered. */
export function canComplete(partsViewed: number[], partCount: number, kcAnswered: number, kcCount: number): boolean {
  const all = Array.from({ length: partCount }, (_, i) => i).every((i) => partsViewed.includes(i));
  return all && kcAnswered >= kcCount;
}
