/** Exam Terminology Challenge — deterministic question generation from the glossary. */
import type { GlossaryTerm } from '@/content/schema';
import { rngFrom, shuffle, type Rng } from '@/lib/rng';

export interface TermChoice { id: string; term: string }
export interface TermRound {
  termId: string;
  sectionId: string;
  difficulty: 1 | 2 | 3;
  kind: 'definition' | 'example';
  prompt: string;
  choices: TermChoice[];
  answerId: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace the term, its aliases and simple plurals with a blank so the prompt does not give the answer away. */
export function maskTerm(text: string, term: Pick<GlossaryTerm, 'term' | 'aliases'>): string {
  const names = [term.term, ...term.aliases].filter(Boolean).sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of names) {
    const body = /y$/i.test(n) ? `(?:${escapeRe(n)}(?:'s|s)?|${escapeRe(n.slice(0, -1))}ies)` : `${escapeRe(n)}(?:'s|s|es)?`;
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9])${body}(?![A-Za-z0-9])`, 'gi'), '$1_____');
  }
  return out;
}

function pickDistractors(answer: GlossaryTerm, pool: GlossaryTerm[], rng: Rng, n = 3): GlossaryTerm[] {
  const seen = new Set<string>([answer.term.trim().toLowerCase()]);
  const ok = (t: GlossaryTerm) => t.id !== answer.id && !seen.has(t.term.trim().toLowerCase());
  const take = (cands: GlossaryTerm[], out: GlossaryTerm[]) => {
    for (const c of shuffle(cands, rng)) {
      if (out.length >= n) break;
      if (!ok(c) || seen.has(c.term.trim().toLowerCase())) continue;
      seen.add(c.term.trim().toLowerCase());
      out.push(c);
    }
  };
  const out: GlossaryTerm[] = [];
  // Deliberate look-alikes first (explicitly confused-with terms), then same section, then anywhere.
  const byId = new Map(pool.map((t) => [t.id, t]));
  take(answer.confusedWith.map((id) => byId.get(id)).filter((t): t is GlossaryTerm => !!t && t.sectionId === answer.sectionId), out);
  take(pool.filter((t) => t.sectionId === answer.sectionId), out);
  if (out.length < n) take(pool, out);
  return out;
}

/**
 * Build up to `count` rounds. Needs at least 4 terms with distinct names; returns [] otherwise.
 * Same terms + same seed => identical rounds.
 */
export function buildRounds(terms: readonly GlossaryTerm[], seed: number | string, count = 10): TermRound[] {
  const names = new Set(terms.map((t) => t.term.trim().toLowerCase()));
  if (terms.length < 4 || names.size < 4) return [];
  const rng = rngFrom(seed);
  const sorted = terms.slice().sort((a, b) => a.id.localeCompare(b.id)); // stable regardless of input order
  const chosen = shuffle(sorted, rng).slice(0, Math.min(count, sorted.length));
  return chosen.map((t, i) => {
    const distractors = pickDistractors(t, sorted, rng);
    const choices = shuffle([t, ...distractors], rng).map((c) => ({ id: c.id, term: c.term }));
    const wantExample = i % 2 === 1;
    const example = wantExample ? t.examples.find((e) => maskTerm(e, t) !== e) : undefined;
    // Fall back to the plain definition when no example mentions the term (it would be unanswerable).
    const kind: TermRound['kind'] = example ? 'example' : 'definition';
    const prompt = maskTerm(example ?? t.plain, t);
    return { termId: t.id, sectionId: t.sectionId, difficulty: t.difficulty, kind, prompt, choices, answerId: t.id };
  });
}
