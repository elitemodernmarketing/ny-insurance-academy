/** Dictionary search + filtering. Pure functions, unit tested. */
import type { GlossaryTerm, Comparison } from '@/content/schema';
import { content } from '@/content';
import type { MasteryLevel } from '@/lib/mastery';
import { normalizeText, stripParens, statusBucket, type StatusBucket } from './termHelpers';

interface TermIndex { primary: string[]; alias: string[]; plain: string; formal: string }
const cache = new WeakMap<GlossaryTerm, TermIndex>();
function indexOf(t: GlossaryTerm): TermIndex {
  let ix = cache.get(t);
  if (!ix) {
    const primary = [...new Set([normalizeText(t.term), normalizeText(stripParens(t.term))].filter(Boolean))];
    const alias = [...new Set(t.aliases.flatMap((a) => [normalizeText(a), normalizeText(stripParens(a))]).filter((a) => a && !primary.includes(a)))];
    ix = { primary, alias, plain: normalizeText(t.plain), formal: normalizeText(t.formal) };
    cache.set(t, ix);
  }
  return ix;
}

const wordPrefix = (n: string, q: string) => n.startsWith(q) || n.includes(` ${q}`);

function scorePhrase(t: GlossaryTerm, q: string): number {
  const ix = indexOf(t);
  if (ix.primary.includes(q)) return 100;
  if (ix.alias.includes(q)) return 95;
  if (ix.primary.some((n) => n.startsWith(q))) return 85;
  if (ix.alias.some((n) => n.startsWith(q))) return 80;
  if (ix.primary.some((n) => wordPrefix(n, q))) return 70;
  if (ix.alias.some((n) => wordPrefix(n, q))) return 65;
  if (ix.primary.some((n) => n.includes(q))) return 60;
  if (ix.alias.some((n) => n.includes(q))) return 55;
  if (ix.plain.includes(q)) return 40;
  if (ix.formal.includes(q)) return 30;
  return 0;
}

/** Relevance score; 0 = no match. Exact > prefix > word-prefix > contains (term, then aliases, then definitions). */
export function scoreTerm(t: GlossaryTerm, query: string): number {
  const q = normalizeText(query);
  if (!q) return 1;
  const phrase = scorePhrase(t, q);
  if (phrase > 0) return phrase;
  const tokens = q.split(' ');
  if (tokens.length < 2) return 0;
  let min = Infinity;
  for (const tok of tokens) {
    const s = scorePhrase(t, tok);
    if (!s) return 0;
    min = Math.min(min, s);
  }
  return Math.max(1, min - 10);
}

/** Matching terms, best match first (ties alphabetical). Empty query returns all terms alphabetically. */
export function searchTerms(terms: GlossaryTerm[], query: string): GlossaryTerm[] {
  if (!normalizeText(query)) return terms.slice().sort((a, b) => a.term.localeCompare(b.term));
  return terms
    .map((t) => ({ t, s: scoreTerm(t, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.term.localeCompare(b.t.term))
    .map((x) => x.t);
}

export interface TermFilters {
  sectionId?: string;
  domain?: string;
  difficulty?: number;
  status?: StatusBucket;
  difficultOnly?: boolean;
  inDeckOnly?: boolean;
}
export interface FilterContext {
  level: (termId: string) => MasteryLevel | undefined;
  difficult: ReadonlySet<string>;
  deck: ReadonlySet<string>;
}
export function filterTerms(terms: GlossaryTerm[], f: TermFilters, ctx: FilterContext): GlossaryTerm[] {
  return terms.filter((t) => {
    if (f.sectionId && t.sectionId !== f.sectionId) return false;
    if (f.domain && content.sectionById.get(t.sectionId)?.domain !== f.domain) return false;
    if (f.difficulty && t.difficulty !== f.difficulty) return false;
    if (f.status && statusBucket(ctx.level(t.id)) !== f.status) return false;
    if (f.difficultOnly && !ctx.difficult.has(t.id)) return false;
    if (f.inDeckOnly && !ctx.deck.has(t.id)) return false;
    return true;
  });
}

export function letterOf(term: string): string {
  const c = normalizeText(term).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
export function groupAZ(terms: GlossaryTerm[]): { letter: string; terms: GlossaryTerm[] }[] {
  const sorted = terms.slice().sort((a, b) => normalizeText(a.term).localeCompare(normalizeText(b.term)));
  const groups: { letter: string; terms: GlossaryTerm[] }[] = [];
  for (const t of sorted) {
    const l = letterOf(t.term);
    const last = groups[groups.length - 1];
    if (last && last.letter === l) last.terms.push(t);
    else groups.push({ letter: l, terms: [t] });
  }
  return groups;
}

/** Curated comparison for a pair in either order; rows are oriented so `a` matches the first argument. */
export function findComparison(a: string, b: string, list: Comparison[] = content.comparisons): (Comparison & { swapped: boolean }) | undefined {
  for (const c of list) {
    if (c.a === a && c.b === b) return { ...c, swapped: false };
    if (c.a === b && c.b === a) return { ...c, swapped: true };
  }
  return undefined;
}
