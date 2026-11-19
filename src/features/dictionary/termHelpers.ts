/** Shared, pure helpers for glossary terms (used by the dictionary, curriculum and flashcard features). */
import { content } from '@/content';
import type { GlossaryTerm } from '@/content/schema';
import type { MasteryLevel } from '@/lib/mastery';

const TERM_MAP = new Map<string, GlossaryTerm>(content.terms.map((t) => [t.id, t]));

/** Learner-visible (eligible) term by id. */
export function getTerm(id: string): GlossaryTerm | undefined {
  return TERM_MAP.get(id);
}
export function getTerms(ids: string[]): GlossaryTerm[] {
  return ids.map((i) => TERM_MAP.get(i)).filter((t): t is GlossaryTerm => !!t);
}

/** Remove "(parenthetical)" segments. */
export function stripParens(s: string): string {
  return s.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Text inside parentheses, e.g. "Free look (right to examine)" -> ["right to examine"]. */
export function parenContents(s: string): string[] {
  const out: string[] = [];
  const re = /[([]([^)\]]+)[)\]]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1].trim());
  return out;
}

/** Lowercase, strip accents, "&" -> "and", punctuation -> space, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every accepted name for a term: the term, the term without parentheticals, parenthetical text and aliases. */
export function termNames(t: Pick<GlossaryTerm, 'term' | 'aliases'>): string[] {
  const raw = [t.term, stripParens(t.term), ...parenContents(t.term), ...t.aliases.flatMap((a) => [a, stripParens(a), ...parenContents(a)])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of raw) {
    const k = normalizeText(n);
    if (k && !seen.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}

/** Glossary term (other than `selfId`) whose name or alias equals the given choice text. */
export function confusedTermFor(choiceText: string, selfId: string): string | undefined {
  const n = normalizeText(stripParens(choiceText));
  const n2 = normalizeText(choiceText);
  if (!n && !n2) return undefined;
  for (const t of content.terms) {
    if (t.id === selfId) continue;
    if (termNames(t).some((name) => { const k = normalizeText(name); return k === n || k === n2; })) return t.id;
  }
  return undefined;
}

let questionCounts: Map<string, number> | null = null;
/** Number of bank questions that test a term (via `concepts`). */
export function questionCountForTerm(id: string): number {
  if (!questionCounts) {
    questionCounts = new Map();
    for (const q of content.questions) for (const c of q.concepts) questionCounts.set(c, (questionCounts.get(c) ?? 0) + 1);
  }
  return questionCounts.get(id) ?? 0;
}

export const DOMAIN_LABEL = { general: 'General', life: 'Life', health: 'Accident & Health', property: 'Property & Casualty (Personal Lines)' } as const;
export type Domain = keyof typeof DOMAIN_LABEL;

export type StatusBucket = 'unseen' | 'learning' | 'mastered';
export function statusBucket(level: MasteryLevel | undefined): StatusBucket {
  if (!level || level === 'unseen') return 'unseen';
  return level === 'mastered' ? 'mastered' : 'learning';
}

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  unseen: 'Not started', weak: 'Weak', developing: 'Developing', proficient: 'Proficient', mastered: 'Mastered',
};
export const MASTERY_TONE: Record<MasteryLevel, 'neutral' | 'danger' | 'warning' | 'info' | 'success'> = {
  unseen: 'neutral', weak: 'danger', developing: 'warning', proficient: 'info', mastered: 'success',
};
export const DIFFICULTY_LABEL = ['', 'Foundational', 'Intermediate', 'Advanced'] as const;
