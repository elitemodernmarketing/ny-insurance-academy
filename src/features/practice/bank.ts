/** Eligible-question lookup shared by practice, exam and review. Only eligible content ever reaches learners. */
import { content } from '@/content';
import type { Question } from '@/content/schema';

let cache: Map<string, Question> | null = null;
function map(): Map<string, Question> {
  if (!cache) cache = new Map(content.questions.map((q) => [q.id, q]));
  return cache;
}

/** An eligible bank question by id (undefined when removed or no longer eligible). */
export function bankQuestion(id: string): Question | undefined {
  return map().get(id);
}
/** Eligible questions for the ids, in the given order; unknown ids are skipped. */
export function bankQuestions(ids: readonly string[]): Question[] {
  const out: Question[] = [];
  for (const id of ids) {
    const q = map().get(id);
    if (q) out.push(q);
  }
  return out;
}
/** Eligible question count per section id. */
export function bankSizeBySection(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of content.sections) out[s.id] = content.questionsBySection.get(s.id)?.length ?? 0;
  return out;
}
