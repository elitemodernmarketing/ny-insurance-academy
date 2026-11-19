/**
 * Content validation — pure functions over a raw content bundle so they can run in Node scripts,
 * in Vitest and (optionally) in the browser.
 */
import { z } from 'zod';
import {
  examManifest, glossaryFile, questionFile, lessonFile, scenarioFile, sourceFile, termRegistry,
  type ExamManifest, type GlossaryTerm, type Question, type Lesson, type OutlineNode, type Source,
  isEligible,
} from './schema';

export interface RawFile { path: string; data: unknown }
export interface RawBundle {
  manifest: RawFile;
  /** Additional track manifests (e.g. Personal Lines 17-54). Section ids must be unique across manifests. */
  extraManifests?: RawFile[];
  registry: RawFile;
  sources: RawFile[];
  glossary: RawFile[];
  questions: RawFile[];
  lessons: RawFile[];
  scenarios: RawFile[];
}
export interface Issue { level: 'error' | 'warning'; file: string; id?: string; message: string }

export interface ValidationResult {
  issues: Issue[];
  counts: {
    terms: number; termsEligible: number; questions: number; questionsEligible: number;
    lessons: number; lessonsEligible: number; sources: number; registryTerms: number; registryWritten: number;
  };
  bySection: Record<string, { terms: number; questions: number; questionsEligible: number; lessons: number }>;
}

const BANNED_CHOICE_PATTERNS: [RegExp, string][] = [
  [/\ball of the above\b/i, '"All of the above" breaks answer shuffling'],
  [/\bnone of the above\b/i, '"None of the above" breaks answer shuffling'],
  [/\bboth (a|b|c|d) and (a|b|c|d)\b/i, 'positional reference ("both A and B") breaks shuffling'],
  [/\b(choices?|options?|answers?) (a|b|c|d)\b/i, 'positional reference to a lettered choice'],
  [/^(a|b|c|d) and (a|b|c|d)$/i, 'positional reference'],
  [/\b(a|b|c|d), (a|b|c|d),? and (a|b|c|d)\b/, 'positional reference'],
];

const TERMINOLOGY: [RegExp, string][] = [
  [/\bnoncancellable\b/i, 'use "noncancelable"'],
  [/\bincontestible\b/i, 'use "incontestable"'],
  [/\bbeneficiery\b/i, 'misspelling: beneficiary'],
  [/\bannuitent\b/i, 'misspelling: annuitant'],
  [/\bco-insurance\b/i, 'use "coinsurance"'],
  [/\bco-payment\b/i, 'use "copayment"'],
  [/\bsuperintendant\b/i, 'misspelling: superintendent'],
  [/\bper stirpe\b/i, 'use "per stirpes"'],
  [/\bpre-existing\b/i, 'use "preexisting" (outline spelling)'],
  [/\bpolicy owner\b/i, 'use "policyowner"'],
  [/\bstrangers?-originated\b(?! life)/i, 'use "stranger-originated life insurance"'],
];

export function flattenOutline(nodes: OutlineNode[], out: Map<string, OutlineNode> = new Map()): Map<string, OutlineNode> {
  for (const n of nodes) {
    out.set(n.id, n);
    if (n.children) flattenOutline(n.children, out);
  }
  return out;
}

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)),
  );
}
const STOP = new Set(['the', 'and', 'which', 'following', 'what', 'that', 'this', 'with', 'for', 'are', 'from', 'his', 'her', 'their', 'has', 'have', 'was', 'will', 'would', 'under', 'most', 'best', 'likely', 'true', 'statement', 'describes', 'correct']);
export function jaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Extract [[term-id]] / [[term-id|label]] links from markdown-lite. */
export function extractTermLinks(md: string): string[] {
  return [...md.matchAll(/\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1]);
}

function zodIssues(file: string, err: z.ZodError): Issue[] {
  return err.issues.slice(0, 25).map((i) => ({ level: 'error' as const, file, message: `${i.path.join('.')}: ${i.message}` }));
}

export interface ParsedContent {
  /** Primary manifest (Life, Accident & Health 17-55). */
  manifest: ExamManifest;
  /** All track manifests including the primary one. */
  manifests: ExamManifest[];
  outline: Map<string, OutlineNode>;
  sources: Source[];
  terms: GlossaryTerm[];
  questions: Question[];
  lessons: Lesson[];
}

export function validateBundle(raw: RawBundle, opts: { today?: string } = {}): ValidationResult & { parsed: ParsedContent | null } {
  const issues: Issue[] = [];
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const err = (file: string, message: string, id?: string) => issues.push({ level: 'error', file, id, message });
  const warn = (file: string, message: string, id?: string) => issues.push({ level: 'warning', file, id, message });

  const m = examManifest.safeParse(raw.manifest.data);
  if (!m.success) {
    issues.push(...zodIssues(raw.manifest.path, m.error));
    return { issues, counts: emptyCounts(), bySection: {}, parsed: null };
  }
  const manifest = m.data;
  const manifests: ExamManifest[] = [manifest];
  for (const extra of raw.extraManifests ?? []) {
    const em = examManifest.safeParse(extra.data);
    if (!em.success) { issues.push(...zodIssues(extra.path, em.error)); continue; }
    manifests.push(em.data);
  }
  const allSections = manifests.flatMap((mf) => mf.sections);
  const seenSections = new Set<string>();
  for (const sec of allSections) { if (seenSections.has(sec.id)) err(raw.manifest.path, `duplicate section id across manifests: ${sec.id}`); seenSections.add(sec.id); }
  const outline = flattenOutline(allSections.flatMap((sec) => sec.children));
  for (const mf of manifests) {
    const weightSum = mf.sections.reduce((a, sec) => a + sec.weightPct, 0);
    if (weightSum !== 100) err(raw.manifest.path, `${mf.id}: section weights sum to ${weightSum}, expected 100`);
  }

  const reg = termRegistry.safeParse(raw.registry.data);
  const registry = new Map<string, string>();
  if (!reg.success) issues.push(...zodIssues(raw.registry.path, reg.error));
  else for (const t of reg.data.terms) registry.set(t.id, t.owner);

  // Sources
  const sources: Source[] = [];
  const sourceIds = new Set<string>();
  for (const f of raw.sources) {
    const p = sourceFile.safeParse(f.data);
    if (!p.success) { issues.push(...zodIssues(f.path, p.error)); continue; }
    for (const s of p.data.sources) {
      if (sourceIds.has(s.id)) err(f.path, `duplicate source id`, s.id);
      sourceIds.add(s.id); sources.push(s);
    }
  }

  // Glossary
  const terms: GlossaryTerm[] = [];
  const termById = new Map<string, GlossaryTerm>();
  const termNames = new Map<string, string>();
  const comparisons: { file: string; a: string; b: string }[] = [];
  for (const f of raw.glossary) {
    const p = glossaryFile.safeParse(f.data);
    if (!p.success) { issues.push(...zodIssues(f.path, p.error)); continue; }
    for (const t of p.data.terms) {
      if (t.sectionId !== p.data.sectionId) err(f.path, `term sectionId ${t.sectionId} != file sectionId ${p.data.sectionId}`, t.id);
      if (termById.has(t.id)) err(f.path, 'duplicate term id', t.id);
      const norm = t.term.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
      if (termNames.has(norm) && termNames.get(norm) !== t.id) err(f.path, `duplicate term name "${t.term}" (also ${termNames.get(norm)})`, t.id);
      termNames.set(norm, t.id);
      termById.set(t.id, t); terms.push(t);
      if (registry.size && !registry.has(t.id)) warn(f.path, 'term not in registry (add it to content/manifest/term-registry.json)', t.id);
      else if (registry.get(t.id) && registry.get(t.id) !== t.sectionId) err(f.path, `term is owned by section "${registry.get(t.id)}" in the registry`, t.id);
      checkMcq(f.path, t.id, t.practice, err);
      if (t.examples.length !== new Set(t.examples).size) err(f.path, 'duplicate examples', t.id);
      if (t.plain === t.formal) warn(f.path, 'plain definition identical to formal definition', t.id);
    }
    for (const c of p.data.comparisons) comparisons.push({ file: f.path, a: c.a, b: c.b });
  }

  // Questions
  const questions: Question[] = [];
  const qById = new Map<string, Question>();
  for (const f of raw.questions) {
    const p = questionFile.safeParse(f.data);
    if (!p.success) { issues.push(...zodIssues(f.path, p.error)); continue; }
    const letterCounts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (const q of p.data.questions) {
      if (q.sectionId !== p.data.sectionId) err(f.path, `question sectionId mismatch`, q.id);
      if (!q.id.startsWith(q.sectionId + '-')) err(f.path, `question id must start with "${q.sectionId}-"`, q.id);
      if (qById.has(q.id)) err(f.path, 'duplicate question id', q.id);
      qById.set(q.id, q); questions.push(q);
      letterCounts[q.correct]++;
      const ids = q.choices.map((c) => c.id);
      if (new Set(ids).size !== 4 || !['a', 'b', 'c', 'd'].every((x) => ids.includes(x as never))) err(f.path, 'choices must have ids a,b,c,d exactly once', q.id);
      const texts = q.choices.map((c) => c.text.trim().toLowerCase());
      if (new Set(texts).size !== 4) err(f.path, 'duplicate choice text', q.id);
      for (const c of q.choices) {
        for (const [re, why] of BANNED_CHOICE_PATTERNS) if (re.test(c.text)) err(f.path, `choice ${c.id}: ${why}`, q.id);
      }
      if (/\b(NOT|EXCEPT)\b/.test(q.stem) && !q.tags.includes('negative-wording')) warn(f.path, 'stem uses NOT/EXCEPT but lacks "negative-wording" tag', q.id);
      if (/\b(not|except)\b/.test(q.stem) && /which .* (not|except)\b/i.test(q.stem) && !/\b(NOT|EXCEPT)\b/.test(q.stem)) warn(f.path, 'negative wording should be CAPITALIZED (NOT / EXCEPT)', q.id);
      if (q.tags.includes('ny-law') !== q.nySpecific) warn(f.path, '"ny-law" tag and nySpecific flag disagree', q.id);
      if (q.stem.length > 600) warn(f.path, 'very long stem (>600 chars)', q.id);
      const correctChoice = q.choices.find((c) => c.id === q.correct);
      const longestDistractor = Math.max(...q.choices.filter((c) => c.id !== q.correct).map((c) => c.text.length));
      if (correctChoice && correctChoice.text.length > 25 && correctChoice.text.length > 1.25 * longestDistractor)
        warn(f.path, `correct answer is ${(correctChoice.text.length / longestDistractor).toFixed(2)}× the longest distractor (test-wise cue; keep ≤ 1.15×)`, q.id);
      for (const c of q.concepts) checkTermRef(f.path, q.id, c, 'concept');
    }
    const n = p.data.questions.length;
    if (n >= 12) for (const [k, v] of Object.entries(letterCounts)) if (v / n > 0.4) warn(f.path, `answer key skew: ${Math.round((v / n) * 100)}% of answers are "${k}"`);
  }

  // Lessons
  const lessons: Lesson[] = [];
  const lessonIds = new Set<string>();
  for (const f of raw.lessons) {
    const p = lessonFile.safeParse(f.data);
    if (!p.success) { issues.push(...zodIssues(f.path, p.error)); continue; }
    for (const l of p.data.lessons) {
      if (lessonIds.has(l.id)) err(f.path, 'duplicate lesson id', l.id);
      lessonIds.add(l.id); lessons.push(l);
      if (!l.id.startsWith(l.sectionId + '-')) err(f.path, `lesson id must start with "${l.sectionId}-"`, l.id);
      for (const k of l.keyTerms) checkTermRef(f.path, l.id, k, 'keyTerm');
      for (const kc of l.knowledgeChecks) checkMcq(f.path, l.id, kc, err);
      for (const part of l.parts) {
        for (const txt of [part.body, part.simple ?? '', part.advanced ?? '', part.example?.body ?? '']) {
          for (const link of extractTermLinks(txt)) checkTermRef(f.path, l.id, link, 'link');
        }
        for (const c of part.callouts) for (const s of c.sources ?? []) if (!sourceIds.has(s)) err(f.path, `callout source "${s}" not in source registry`, l.id);
        if (part.callouts.some((c) => c.kind === 'ny-rule') && !l.nySpecific) warn(f.path, 'lesson has an ny-rule callout but nySpecific=false', l.id);
      }
      if (l.activity.type === 'categorize') {
        const cats = new Set(l.activity.categories);
        for (const it of l.activity.items) if (!cats.has(it.category)) err(f.path, `activity item category "${it.category}" not in categories`, l.id);
      }
      if (l.activity.type === 'match') {
        const rights = l.activity.pairs.map((p) => p.right);
        if (new Set(rights).size !== rights.length) err(f.path, 'match activity has duplicate right-hand values', l.id);
      }
    }
  }
  for (const l of lessons) for (const r of l.related) if (!lessonIds.has(r)) err('lessons', `related lesson "${r}" does not exist`, l.id);

  // Scenarios
  for (const f of raw.scenarios) {
    const p = scenarioFile.safeParse(f.data);
    if (!p.success) { issues.push(...zodIssues(f.path, p.error)); continue; }
    const all = [...p.data.complianceCases, ...p.data.clientProfiles, ...p.data.beneficiaryCases, ...p.data.policyTimelines];
    for (const s of all) {
      checkProvenance(f.path, s.id, s);
      for (const o of s.outlineIds) if (!outline.has(o)) err(f.path, `unknown outline id "${o}"`, s.id);
      for (const c of s.concepts) checkTermRef(f.path, s.id, c, 'concept');
      if (s.nySpecific === false && 'issue' in s) warn(f.path, 'compliance case not flagged nySpecific — confirm it is not New York law', s.id);
    }
    for (const b of p.data.beneficiaryCases) {
      for (const ev of b.events) {
        const total = ev.payouts.reduce((a, x) => a + x.amount, 0);
        if (ev.payouts.length && Math.abs(total - b.faceAmount) > 0.5) warn(f.path, `event "${ev.id}" payouts sum ${total} != face ${b.faceAmount}`, b.id);
      }
    }
  }

  // Cross-reference checks common to terms / questions / lessons
  for (const t of terms) {
    checkProvenance(`glossary/${t.sectionId}`, t.id, t);
    for (const o of t.outlineIds) if (!outline.has(o)) err(`glossary/${t.sectionId}`, `unknown outline id "${o}"`, t.id);
    for (const r of [...t.related, ...t.confusedWith]) checkTermRef(`glossary/${t.sectionId}`, t.id, r, 'related');
    if (t.related.includes(t.id)) err(`glossary/${t.sectionId}`, 'term lists itself as related', t.id);
  }
  for (const c of comparisons) {
    checkTermRef(c.file, `${c.a}~${c.b}`, c.a, 'comparison');
    checkTermRef(c.file, `${c.a}~${c.b}`, c.b, 'comparison');
  }
  for (const q of questions) {
    checkProvenance(`questions/${q.sectionId}`, q.id, q);
    for (const o of q.outlineIds) {
      if (!outline.has(o)) err(`questions/${q.sectionId}`, `unknown outline id "${o}"`, q.id);
      else if (!o.startsWith(q.sectionId + '.')) warn(`questions/${q.sectionId}`, `outline id "${o}" belongs to another section; blueprint uses sectionId`, q.id);
    }
  }
  for (const l of lessons) {
    checkProvenance(`lessons/${l.sectionId}`, l.id, l);
    for (const o of l.outlineIds) if (!outline.has(o)) err(`lessons/${l.sectionId}`, `unknown outline id "${o}"`, l.id);
  }

  // Terminology consistency over all learner-facing text
  const scanText = (file: string, rid: string, text: string) => {
    for (const [re, why] of TERMINOLOGY) if (re.test(text)) warn(file, `terminology: ${why}`, rid);
  };
  for (const t of terms) scanText(`glossary/${t.sectionId}`, t.id, [t.formal, t.plain, t.simpler, ...t.examples, t.examTip, t.misconception].join(' '));
  for (const q of questions) scanText(`questions/${q.sectionId}`, q.id, [q.stem, q.scenario ?? '', q.explanation, ...q.choices.map((c) => c.text + ' ' + c.rationale)].join(' '));
  for (const l of lessons) scanText(`lessons/${l.sectionId}`, l.id, l.parts.map((p) => `${p.body} ${p.simple ?? ''} ${p.advanced ?? ''}`).join(' '));

  // Near-duplicate questions (within a section, and exact duplicates anywhere)
  const bySec = groupBy(questions, (q) => q.sectionId);
  for (const qs of Object.values(bySec)) {
    for (let i = 0; i < qs.length; i++) {
      for (let j = i + 1; j < qs.length; j++) {
        const a = qs[i], b = qs[j];
        const sim = jaccard(a.stem + ' ' + (a.scenario ?? ''), b.stem + ' ' + (b.scenario ?? ''));
        const sameAnswer = a.choices.find((c) => c.id === a.correct)?.text.toLowerCase() === b.choices.find((c) => c.id === b.correct)?.text.toLowerCase();
        if (sim >= 0.9 || (sim >= 0.75 && sameAnswer)) err(`questions/${a.sectionId}`, `near-duplicate of ${b.id} (similarity ${sim.toFixed(2)})`, a.id);
      }
    }
  }
  const stemSeen = new Map<string, string>();
  for (const q of questions) {
    const k = q.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (stemSeen.has(k) && !q.scenario) err(`questions/${q.sectionId}`, `identical stem to ${stemSeen.get(k)}`, q.id);
    stemSeen.set(k, q.id);
  }

  // Overdue reviews
  for (const rec of [...terms, ...questions, ...lessons] as { id: string; reviewDue?: string; timeSensitive: boolean }[]) {
    if (rec.timeSensitive && rec.reviewDue && rec.reviewDue < today) warn('review', `time-sensitive content past its review date (${rec.reviewDue})`, rec.id);
  }

  const bySection: ValidationResult['bySection'] = {};
  for (const s of allSections) bySection[s.id] = { terms: 0, questions: 0, questionsEligible: 0, lessons: 0 };
  for (const t of terms) bySection[t.sectionId].terms++;
  for (const q of questions) { bySection[q.sectionId].questions++; if (isEligible(q)) bySection[q.sectionId].questionsEligible++; }
  for (const l of lessons) bySection[l.sectionId].lessons++;

  return {
    issues,
    counts: {
      terms: terms.length,
      termsEligible: terms.filter(isEligible).length,
      questions: questions.length,
      questionsEligible: questions.filter(isEligible).length,
      lessons: lessons.length,
      lessonsEligible: lessons.filter(isEligible).length,
      sources: sources.length,
      registryTerms: registry.size,
      registryWritten: [...registry.keys()].filter((k) => termById.has(k)).length,
    },
    bySection,
    parsed: { manifest, manifests, outline, sources, terms, questions, lessons },
  };

  function checkTermRef(file: string, rid: string, termId: string, what: string) {
    if (termById.has(termId)) return;
    // Terms may be written in a later file in load order; defer check.
    deferred.push({ file, rid, termId, what });
  }
  function checkProvenance(file: string, rid: string, rec: { sources: string[]; nySpecific: boolean; timeSensitive: boolean; reviewDue?: string; verification: { status: string; method: string } }) {
    for (const s of rec.sources) if (!sourceIds.has(s)) err(file, `source "${s}" not in source registry`, rid);
    if ((rec.nySpecific || rec.timeSensitive) && rec.verification.status === 'reviewed')
      err(file, 'nySpecific/timeSensitive content cannot be "reviewed" — verify against a primary source or mark "draft"', rid);
    if (rec.verification.status === 'verified' && rec.sources.length === 0) err(file, '"verified" requires at least one source', rid);
    if (rec.verification.status === 'verified' && rec.verification.method === 'general-principle') err(file, '"verified" cannot use method general-principle', rid);
    if (rec.timeSensitive && !rec.reviewDue) err(file, 'timeSensitive content needs reviewDue', rid);
  }
}

// Deferred term-reference checks (resolved after all glossary files are loaded).
const deferred: { file: string; rid: string; termId: string; what: string }[] = [];

/** Run validation and resolve deferred term references. */
export function validate(raw: RawBundle, opts: { today?: string } = {}) {
  deferred.length = 0;
  const res = validateBundle(raw, opts);
  const termIds = new Set(res.parsed?.terms.map((t) => t.id) ?? []);
  const registry = termRegistry.safeParse(raw.registry.data);
  const regIds = new Set(registry.success ? registry.data.terms.map((t) => t.id) : []);
  for (const d of deferred) {
    if (termIds.has(d.termId)) continue;
    if (regIds.has(d.termId)) res.issues.push({ level: 'warning', file: d.file, id: d.rid, message: `${d.what} "${d.termId}" is planned in the registry but not written yet` });
    else res.issues.push({ level: 'error', file: d.file, id: d.rid, message: `${d.what} "${d.termId}" is not a glossary term (not in registry either)` });
  }
  deferred.length = 0;
  return res;
}

function checkMcq(file: string, rid: string, q: { choices: string[]; answerIndex: number }, err: (f: string, m: string, id?: string) => void) {
  const t = q.choices.map((c) => c.trim().toLowerCase());
  if (new Set(t).size !== t.length) err(file, 'inline question has duplicate choices', rid);
  for (const c of q.choices) for (const [re, why] of BANNED_CHOICE_PATTERNS) if (re.test(c)) err(file, `inline question choice: ${why}`, rid);
}

function groupBy<T>(xs: T[], f: (x: T) => string): Record<string, T[]> {
  const o: Record<string, T[]> = {};
  for (const x of xs) (o[f(x)] ??= []).push(x);
  return o;
}
function emptyCounts(): ValidationResult['counts'] {
  return { terms: 0, termsEligible: 0, questions: 0, questionsEligible: 0, lessons: 0, lessonsEligible: 0, sources: 0, registryTerms: 0, registryWritten: 0 };
}
