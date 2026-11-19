/** Pure flashcard logic: typed-answer matching, scenario masking, queue building, interval previews. Unit tested. */
import type { GlossaryTerm } from '@/content/schema';
import type { CardRow, CardMode } from '@/db/db';
import { DAY_MS, localDate, parseLocalDate } from '@/lib/dates';
import { hashString, rngFrom, shuffle } from '@/lib/rng';
import { queueOrder, review, type Rating, type SrsState } from '@/lib/srs';
import { normalizeText, stripParens, termNames } from '@/features/dictionary/termHelpers';

// ------------------------------------------------------------------ typed answers
const ARTICLES = /^(the|a|an)\s+/;
function variants(norm: string): string[] {
  const base = norm.replace(ARTICLES, '').trim();
  if (!base) return [];
  const compact = base.replace(/\s+/g, '');
  const out = new Set<string>([base, compact]);
  // Tolerate a plural/singular difference ("annuities" vs "annuity" is NOT handled on purpose; only a trailing "s").
  if (base.length > 3 && base.endsWith('s')) { out.add(base.slice(0, -1)); out.add(compact.slice(0, -1)); }
  return [...out].filter(Boolean);
}

/** Tolerant comparison: ignores case, punctuation, parentheticals and a leading article; accepts aliases. */
export function isTypedAnswerCorrect(input: string, term: Pick<GlossaryTerm, 'term' | 'aliases'>): boolean {
  const inputs = new Set<string>([...variants(normalizeText(input)), ...variants(normalizeText(stripParens(input)))]);
  if (inputs.size === 0) return false;
  for (const name of termNames(term)) {
    for (const v of variants(normalizeText(name))) if (inputs.has(v)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ scenario masking
export const MASK = '▢▢▢';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Replace the term name, its aliases and variants in `text` with ▢▢▢. */
export function maskTerm(text: string, term: Pick<GlossaryTerm, 'term' | 'aliases'>): string {
  const names = termNames(term).filter((n) => n.trim().length >= 2).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${names.map(escapeRe).join('|')})(?:s|es)?(?![A-Za-z0-9])`, 'gi');
  return text.replace(re, MASK);
}
export function scenarioFor(term: GlossaryTerm, seed: string | number = 0): string {
  const ex = term.examples[hashString(`${term.id}:${seed}`) % term.examples.length];
  return maskTerm(ex, term);
}

// ------------------------------------------------------------------ intervals
export function formatInterval(ms: number): string {
  if (ms < 60_000) return '<1 min';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `${h} h`;
  const d = Math.round(ms / DAY_MS);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 365) { const mo = Math.round(d / 30); return `${mo} mo`; }
  return `${(d / 365).toFixed(1)} y`;
}
/** Next-interval label for each rating — computed with the real scheduler, never saved. */
export function previewIntervals(srs: SrsState, now: number): Record<Rating, string> {
  const f = (r: Rating) => formatInterval(review(srs, r, now).due - now);
  return { again: f('again'), hard: f('hard'), good: f('good'), easy: f('easy') };
}
export function formatDue(due: number, now: number): string {
  return due <= now ? 'now' : `in ${formatInterval(due - now)}`;
}

// ------------------------------------------------------------------ queue
export type ReviewMode = 'due' | 'hardest';
export interface QueueOptions { mode: ReviewMode; now: number; newLimit: number; sessionSize: number }

export const startOfDay = (now: number) => parseLocalDate(localDate(now)).getTime();
/** New cards already started today (first-ever review happened today). */
export function newIntroducedToday(cards: Pick<CardRow, 'termId' | 'srs'>[], reviewsToday: { termId: string }[]): number {
  const per = new Map<string, number>();
  for (const r of reviewsToday) per.set(r.termId, (per.get(r.termId) ?? 0) + 1);
  return cards.filter((c) => (per.get(c.termId) ?? 0) > 0 && (per.get(c.termId) ?? 0) >= c.srs.totalReviews).length;
}

export interface QueueBreakdown { ids: string[]; due: number; fresh: number }
/** Daily queue = due reviews (queueOrder 'due') + up to `newLimit` new cards. Hardest = lowest-ease reviewed cards. */
export function buildReviewQueue(cards: CardRow[], o: QueueOptions): QueueBreakdown {
  if (o.mode === 'hardest') {
    const reviewed = queueOrder(cards.filter((c) => c.srs.totalReviews > 0), o.now, 'hardest').slice(0, o.sessionSize);
    const ids = reviewed.length ? reviewed.map((c) => c.termId) : queueOrder(cards, o.now, 'hardest').slice(0, o.sessionSize).map((c) => c.termId);
    return { ids, due: ids.length, fresh: 0 };
  }
  const due = queueOrder(cards.filter((c) => c.srs.totalReviews > 0 && c.srs.due <= o.now), o.now, 'due');
  const fresh = cards.filter((c) => c.srs.totalReviews === 0).sort((a, b) => a.addedAt - b.addedAt).slice(0, Math.max(0, o.newLimit));
  return { ids: [...due, ...fresh].map((c) => c.termId), due: due.length, fresh: fresh.length };
}

// ------------------------------------------------------------------ card types
export type CardTypeChoice = CardMode | 'mixed';
export const CARD_TYPES: { value: CardTypeChoice; label: string }[] = [
  { value: 'mixed', label: 'Mixed (all types)' },
  { value: 'term-def', label: 'Term → Definition' },
  { value: 'def-term', label: 'Definition → Term' },
  { value: 'scenario', label: 'Scenario → Concept' },
  { value: 'multiple-choice', label: 'Multiple-choice recall' },
  { value: 'typed', label: 'Type the answer' },
];
const MIX: CardMode[] = ['term-def', 'multiple-choice', 'def-term', 'typed', 'scenario'];
export function cardTypeAt(choice: CardTypeChoice, index: number): CardMode {
  return choice === 'mixed' ? MIX[index % MIX.length] : choice;
}

export interface McSpec { kind: 'names' | 'practice'; prompt: string; choices: string[]; answerIndex: number; explanation?: string }
/**
 * Multiple-choice recall. Either "which term matches this definition" with 3 distractor term names from the same
 * section (topped up from other sections), or the term's own practice question (choices shuffled).
 */
export function buildMultipleChoice(term: GlossaryTerm, allTerms: GlossaryTerm[], seed: string | number = 0): McSpec {
  const rng = rngFrom(`${term.id}:mc:${seed}`);
  const own = new Set(termNames(term).map(normalizeText));
  const eligible = (t: GlossaryTerm) => t.id !== term.id && !termNames(t).some((n) => own.has(normalizeText(n)));
  const same = shuffle(allTerms.filter((t) => eligible(t) && t.sectionId === term.sectionId), rng);
  const other = shuffle(allTerms.filter((t) => eligible(t) && t.sectionId !== term.sectionId), rng);
  const distractors = [...same, ...other].slice(0, 3);
  const preferPractice = hashString(`${term.id}:${seed}`) % 2 === 1;
  if (distractors.length < 3 || preferPractice) {
    const order = shuffle([0, 1, 2, 3], rng);
    return {
      kind: 'practice', prompt: term.practice.prompt,
      choices: order.map((i) => term.practice.choices[i]),
      answerIndex: order.indexOf(term.practice.answerIndex),
      explanation: term.practice.explanation,
    };
  }
  const choices = shuffle([term.term, ...distractors.map((d) => d.term)], rng);
  return { kind: 'names', prompt: 'Which term matches this definition?', choices, answerIndex: choices.indexOf(term.term) };
}

// ------------------------------------------------------------------ grading
/** Ratings a learner may pick. A wrong objective answer (multiple choice / typed) forces "Again". */
export function allowedRatings(correct: boolean | null): Rating[] {
  return correct === false ? ['again'] : ['again', 'hard', 'good', 'easy'];
}
export function summarize(ratings: Rating[]): { reviewed: number; correctPct: number } {
  const reviewed = ratings.length;
  return { reviewed, correctPct: reviewed ? Math.round((ratings.filter((r) => r !== 'again').length / reviewed) * 100) : 0 };
}
