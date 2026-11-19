/**
 * Sourced-answer retrieval for the tutor: BM25 over validated glossary terms and lesson parts, plus a little
 * intent detection. Read-only — nothing here changes content or progress.
 */
import { content as defaultContent } from '@/content';
import type { Comparison, GlossaryTerm, Lesson, Question } from '@/content/schema';
import { plainText } from '@/components/ui/Markdown';
import { rngFrom, shuffle } from '@/lib/rng';

// ----------------------------------------------------------------------------- text processing
const STOP = new Set(('a an the and or of to in on for with by at from as is are was were be been being it its this that these those i me my we you your ' +
  'do does did can could would should will what whats how why when who which there here about into than then so if not no yes ' +
  'please tell show give explain describe simple simply plain english like example examples sample quiz test using use topic ' +
  'difference differences between versus vs compare comparison analogy analogies understand mean means meaning define definition').split(' '));

export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}
export function tokenize(s: string, keepStop = false): string[] {
  return s.toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((t) => t && (keepStop || !STOP.has(t))).map(stem);
}

// ----------------------------------------------------------------------------- corpus
export interface Doc {
  id: string; // "term:<termId>" or "lesson:<lessonId>#<partIndex>"
  kind: 'term' | 'lesson';
  title: string;
  text: string;
  link: string;
  sectionId: string;
  /** Names that, when present in the query, strongly indicate this document (term name + aliases). */
  names: string[];
  termId?: string;
  lessonId?: string;
  partIndex?: number;
}

export function corpusFrom(src: { terms: readonly GlossaryTerm[]; lessons: readonly Lesson[] }): Doc[] {
  const docs: Doc[] = [];
  for (const t of src.terms) {
    docs.push({
      id: `term:${t.id}`, kind: 'term', title: t.term, link: `/dictionary/${t.id}`, sectionId: t.sectionId, termId: t.id, names: [t.term, ...t.aliases],
      text: [t.term, ...t.aliases, t.plain, t.formal, t.simpler, ...t.examples, t.examTip, t.misconception].join(' '),
    });
  }
  for (const l of src.lessons) {
    l.parts.forEach((p, i) => {
      docs.push({
        id: `lesson:${l.id}#${i}`, kind: 'lesson', title: `${l.title}: ${p.heading}`, link: `/lesson/${l.id}`, sectionId: l.sectionId, lessonId: l.id, partIndex: i, names: [],
        text: [p.heading, plainText(p.body), p.simple ? plainText(p.simple) : '', p.advanced ? plainText(p.advanced) : '', p.example ? `${p.example.title} ${plainText(p.example.body)}` : '', ...p.callouts.map((c) => c.text)].join(' '),
      });
    });
  }
  return docs;
}

// ----------------------------------------------------------------------------- BM25
export interface Index {
  docs: Doc[];
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgLen: number;
  names: { norm: string; doc: number }[];
}
const TITLE_WEIGHT = 3;

export function buildIndex(docs: Doc[]): Index {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  const names: Index['names'] = [];
  docs.forEach((d, i) => {
    const m = new Map<string, number>();
    let n = 0;
    for (const t of tokenize(d.text)) { m.set(t, (m.get(t) ?? 0) + 1); n++; }
    for (const t of tokenize(d.title)) { m.set(t, (m.get(t) ?? 0) + TITLE_WEIGHT); n += TITLE_WEIGHT; }
    tf.push(m); len.push(n);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    for (const nm of d.names) { const norm = tokenize(nm, true).join(' '); if (norm) names.push({ norm, doc: i }); }
  });
  return { docs, tf, len, df, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length), names };
}

export interface Hit { doc: Doc; score: number; matched: string[] }
const K1 = 1.4;
const B = 0.75;
const NAME_BOOST = 8;

/** Term docs whose name or alias appears (as whole words) in the query. */
export function mentionedTerms(index: Index, query: string): Doc[] {
  const q = ` ${tokenize(query, true).join(' ')} `;
  const out: Doc[] = [];
  for (const { norm, doc } of index.names) if (q.includes(` ${norm} `) && !out.includes(index.docs[doc])) out.push(index.docs[doc]);
  return out;
}

export function search(index: Index, query: string, opts: { limit?: number; kind?: Doc['kind'] } = {}): Hit[] {
  const qTokens = [...new Set(tokenize(query))];
  const mentioned = new Set(mentionedTerms(index, query).map((d) => d.id));
  const N = index.docs.length;
  const hits: Hit[] = [];
  index.docs.forEach((d, i) => {
    if (opts.kind && d.kind !== opts.kind) return;
    let score = 0;
    const matched: string[] = [];
    for (const t of qTokens) {
      const f = index.tf[i].get(t);
      if (!f) continue;
      const df = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.len[i]) / index.avgLen)));
      matched.push(t);
    }
    if (mentioned.has(d.id)) score += NAME_BOOST;
    if (score > 0) hits.push({ doc: d, score, matched });
  });
  hits.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  return hits.slice(0, opts.limit ?? 5);
}

// ----------------------------------------------------------------------------- intent + answer
export type Intent = 'quiz' | 'compare' | 'example' | 'analogy' | 'explain';
export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/\b(quiz|test)\s+me\b|\bquiz\b/.test(s)) return 'quiz';
  if (/\bdifference\b|\bversus\b|\bvs\.?\b|\bcompare\b|\bcompared to\b/.test(s)) return 'compare';
  if (/\banalog(y|ies)\b|\bsimpler\b|like i'?m (5|five|new)|\beli5\b/.test(s)) return 'analogy';
  if (/\bexamples?\b/.test(s)) return 'example';
  return 'explain';
}

export interface SectionLite { id: string; name: string; shortName: string }
/** Pick the exam section a quiz request refers to (rare-word weighted overlap with section names), or undefined. */
export function resolveSection(query: string, sections: readonly SectionLite[]): SectionLite | undefined {
  const q = new Set(tokenize(query));
  const toks = sections.map((s) => new Set([...tokenize(s.shortName), ...tokenize(s.name)]));
  const count = new Map<string, number>();
  for (const t of toks) for (const w of t) count.set(w, (count.get(w) ?? 0) + 1);
  let best: SectionLite | undefined; let bestScore = 0;
  sections.forEach((s, i) => {
    let sc = 0;
    for (const w of toks[i]) if (q.has(w)) sc += 1 / (count.get(w) ?? 1);
    if (q.has(s.id)) sc += 1; // "ann", "ltc" ...
    if (sc > bestScore) { best = s; bestScore = sc; }
  });
  return best;
}

export interface TutorAnswer {
  intent: Intent;
  terms: Hit[];
  lessons: Hit[];
  comparison?: Comparison;
  quiz?: { sectionId: string; sectionName: string; questions: Question[] };
  note?: string;
  /** Citation ids in display order, e.g. "term:annuity", "lesson:ann-l01#2", "quiz:ann". */
  citations: string[];
}

export interface AnswerContext {
  index: Index;
  comparisons: readonly Comparison[];
  questionsBySection: ReadonlyMap<string, readonly Question[]>;
  sections: readonly SectionLite[];
  lastTermId?: string;
}

export function answerQuestion(query: string, ctx: AnswerContext): TutorAnswer {
  const intent = detectIntent(query);
  const base: TutorAnswer = { intent, terms: [], lessons: [], citations: [] };

  if (intent === 'quiz') {
    const topTerm = search(ctx.index, query, { limit: 1, kind: 'term' })[0];
    const sec = resolveSection(query, ctx.sections) ?? ctx.sections.find((s) => s.id === topTerm?.doc.sectionId);
    if (!sec) return { ...base, note: 'Tell me which topic to quiz you on, for example "Quiz me on annuities".', citations: [] };
    const pool = ctx.questionsBySection.get(sec.id) ?? [];
    if (!pool.length) return { ...base, note: `No verified practice questions are published for ${sec.shortName} yet (content pending verification).`, citations: [] };
    const questions = shuffle(pool, rngFrom(`${sec.id}|${query.toLowerCase().trim()}`)).slice(0, 5);
    return { ...base, quiz: { sectionId: sec.id, sectionName: sec.shortName, questions }, citations: [`quiz:${sec.id}`, ...questions.map((q) => `question:${q.id}`)] };
  }

  let mentioned = mentionedTerms(ctx.index, query).filter((d) => d.kind === 'term');
  if (intent === 'analogy' && !mentioned.length && ctx.lastTermId) {
    const d = ctx.index.docs.find((x) => x.termId === ctx.lastTermId);
    if (d) mentioned = [d];
  }
  if (intent === 'analogy' && !mentioned.length && !search(ctx.index, query, { limit: 1, kind: 'term' }).length)
    return { ...base, note: 'Name a topic first (for example "Explain annuity using an analogy"), or ask about a topic and then use this prompt.', citations: [] };

  let termHits = search(ctx.index, query, { limit: 4, kind: 'term' });
  if (mentioned.length) {
    // Make sure explicitly named terms come first, in query order.
    const first = mentioned.map((d) => termHits.find((h) => h.doc.id === d.id) ?? { doc: d, score: NAME_BOOST, matched: [] });
    termHits = [...first, ...termHits.filter((h) => !first.some((f) => f.doc.id === h.doc.id))].slice(0, 4);
  }
  // Drop weak tail results: keep named terms and anything scoring at least 35% of the best hit.
  const namedIds = new Set(mentioned.map((d) => d.id));
  const topTerm = termHits[0]?.score ?? 0;
  termHits = termHits.filter((h) => namedIds.has(h.doc.id) || h.score >= topTerm * 0.35);
  const lessonHitsRaw = search(ctx.index, mentioned.length ? `${mentioned.map((d) => d.title).join(' ')} ${query}` : query, { limit: 3, kind: 'lesson' });
  const lessonHits = lessonHitsRaw.filter((h) => h.score >= (lessonHitsRaw[0]?.score ?? 0) * 0.4);

  let comparison: Comparison | undefined;
  if (mentioned.length >= 2) {
    const ids = mentioned.map((d) => d.termId!);
    comparison = ctx.comparisons.find((c) => ids.includes(c.a) && ids.includes(c.b));
  }
  const citations = [
    ...(comparison ? [`comparison:${comparison.a}|${comparison.b}`] : []),
    ...termHits.map((h) => h.doc.id), ...lessonHits.map((h) => h.doc.id),
  ];
  return { intent, terms: termHits, lessons: lessonHits, comparison, citations, note: citations.length ? undefined : 'I could not find that in the validated course content.' };
}

// ----------------------------------------------------------------------------- default (live content) context
let cached: { key: unknown; index: Index } | null = null;
export function contentContext(lastTermId?: string, c = defaultContent): AnswerContext {
  if (!cached || cached.key !== c) cached = { key: c, index: buildIndex(corpusFrom({ terms: c.terms, lessons: c.lessons })) };
  return {
    index: cached.index, comparisons: c.comparisons, questionsBySection: c.questionsBySection,
    sections: c.sections.map((s) => ({ id: s.id, name: s.name, shortName: s.shortName })), lastTermId,
  };
}

/** Plain-text snippet for a doc, used for LLM grounding. */
export function snippetText(d: Doc, c = defaultContent, max = 700): string {
  let s = '';
  if (d.kind === 'term') {
    const t = c.termById.get(d.termId!);
    s = t ? `${t.term}: ${t.plain} Formal: ${t.formal} Example: ${t.examples[0]}` : d.text;
  } else {
    const l = c.lessonById.get(d.lessonId!)?.parts[d.partIndex!];
    s = l ? plainText(l.body) : d.text;
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
