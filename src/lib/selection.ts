/** Question selection for practice modes. All selection is deterministic given a seed. */
import { allocate } from './blueprint';
import { rngFrom, shuffle } from './rng';
import type { ConceptMastery } from './mastery';

export interface SelectableQuestion {
  id: string;
  sectionId: string;
  concepts: string[];
  difficulty: 1 | 2 | 3;
  style: string;
  tags: string[];
  stem: string;
}
export interface History { exposure: Record<string, number>; missed: Record<string, number>; lastSeen: Record<string, number> }

const freshFirst = <T extends { id: string }>(qs: T[], h: History, seed: number | string) =>
  shuffle(qs, rngFrom(seed)).sort((a, b) => (h.exposure[a.id] ?? 0) - (h.exposure[b.id] ?? 0));

export function topicQuiz<T extends SelectableQuestion>(pool: T[], sectionIds: string[], count: number, seed: number | string, h: History, difficulty?: (1 | 2 | 3)[]): T[] {
  const set = new Set(sectionIds);
  const qs = pool.filter((q) => set.has(q.sectionId) && (!difficulty?.length || difficulty.includes(q.difficulty)));
  return freshFirst(qs, h, seed).slice(0, count);
}

/** Mixed questions distributed by blueprint weights; sections short of questions are back-filled from others. */
export function mixedQuiz<T extends SelectableQuestion>(pool: T[], sections: { id: string; weightPct: number }[], count: number, seed: number | string, h: History, difficulty?: (1 | 2 | 3)[]): T[] {
  const qs = pool.filter((q) => !difficulty?.length || difficulty.includes(q.difficulty));
  const alloc = allocate(count, sections, seed);
  const picked: T[] = [];
  const used = new Set<string>();
  for (const s of sections) {
    const take = freshFirst(qs.filter((q) => q.sectionId === s.id), h, `${seed}:${s.id}`).slice(0, alloc[s.id] ?? 0);
    for (const q of take) { picked.push(q); used.add(q.id); }
  }
  if (picked.length < count) {
    for (const q of freshFirst(qs.filter((q) => !used.has(q.id)), h, `${seed}:fill`)) {
      if (picked.length >= count) break;
      picked.push(q); used.add(q.id);
    }
  }
  return shuffle(picked, rngFrom(`${seed}:order`));
}

/**
 * Weakness drill: rank questions by (a) previously missed, (b) lowest mastery among their concepts,
 * (c) concepts not seen recently. Returns `count` questions with reasons.
 */
export function weaknessDrill<T extends SelectableQuestion>(pool: T[], mastery: Map<string, ConceptMastery>, count: number, seed: number | string, h: History): { question: T; reason: string }[] {
  const scored = pool.map((q) => {
    const ms = q.concepts.map((c) => mastery.get(c));
    const worst = ms.reduce<ConceptMastery | undefined>((w, m) => (m && (!w || m.score < w.score) ? m : w), undefined);
    const missed = h.missed[q.id] ?? 0;
    const seenConcept = ms.some((m) => m && m.attempts > 0);
    let priority = 0;
    let reason = '';
    if (missed > 0) { priority += 4 + 2 * missed; reason = `You missed this question ${missed} time${missed > 1 ? 's' : ''}.`; }
    if (worst && worst.attempts > 0) {
      priority += (1 - worst.score) * 4 + Math.min(worst.recentMisses, 3);
      reason ||= `Concept "${worst.concept}" is at ${Math.round(worst.score * 100)}% mastery.`;
    }
    if (!seenConcept) priority -= 1; // weakness drill focuses on known weaknesses, not new material
    return { question: q, priority, reason: reason || 'Related to a weak area.' };
  });
  const rng = rngFrom(seed);
  return scored
    .filter((s) => s.priority > 0.5)
    .map((s) => ({ ...s, jitter: rng() }))
    .sort((a, b) => b.priority - a.priority || a.jitter - b.jitter)
    .slice(0, count)
    .map(({ question, reason }) => ({ question, reason }));
}

export function rapidFire<T extends SelectableQuestion>(pool: T[], count: number, seed: number | string, h: History): T[] {
  const qs = pool.filter((q) => q.tags.includes('rapid') || (q.style === 'definition' && q.stem.length <= 160));
  return freshFirst(qs, h, seed).slice(0, count);
}

export function trickyQuestions<T extends SelectableQuestion>(pool: T[], count: number, seed: number | string, h: History): T[] {
  const qs = pool.filter((q) => q.tags.includes('tricky') || q.tags.includes('negative-wording') || q.style === 'negative' || q.difficulty === 3);
  return freshFirst(qs, h, seed).slice(0, count);
}

/** Display order for a question's choices (stable per seed). */
export function choiceOrder(choiceIds: string[], seed: number | string): string[] {
  return shuffle(choiceIds, rngFrom(seed));
}
