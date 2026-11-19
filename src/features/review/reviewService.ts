/** Weakness review data: questions whose most recent attempt was incorrect. */
import type { Question } from '@/content/schema';
import { content } from '@/content';
import { db, type AttemptRow } from '@/db/db';
import { bankQuestion } from '../practice/bank';

export interface MissedItem { question: Question; attempt: AttemptRow }

/** Latest attempt per bank question; keeps only those that were incorrect (or unanswered). Glossary/lesson checks are ignored. */
export function latestMissed(attempts: AttemptRow[]): MissedItem[] {
  const latest = new Map<string, AttemptRow>();
  for (const a of attempts) {
    if (a.questionId.startsWith('term:') || a.questionId.startsWith('lesson:')) continue;
    const cur = latest.get(a.questionId);
    if (!cur || a.at > cur.at || (a.at === cur.at && (a.id ?? 0) > (cur.id ?? 0))) latest.set(a.questionId, a);
  }
  const out: MissedItem[] = [];
  for (const a of latest.values()) {
    if (a.correct) continue;
    const q = bankQuestion(a.questionId);
    if (q) out.push({ question: q, attempt: a });
  }
  return out.sort((a, b) => b.attempt.at - a.attempt.at);
}

export async function loadMissed(): Promise<MissedItem[]> {
  return latestMissed(await db.attempts.toArray());
}

export interface MissedGroup { sectionId: string; name: string; items: MissedItem[] }
export function groupBySection(items: MissedItem[]): MissedGroup[] {
  const groups: MissedGroup[] = [];
  for (const s of content.sections) {
    const its = items.filter((i) => i.question.sectionId === s.id);
    if (its.length) groups.push({ sectionId: s.id, name: s.shortName, items: its });
  }
  return groups;
}
