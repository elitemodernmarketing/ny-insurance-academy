/**
 * Browser-side content repository. Loads every JSON file under /content at build time (Vite glob import),
 * parses it with the Zod schemas, and exposes indexed, eligibility-filtered collections.
 *
 * - Records that fail schema parsing are skipped and listed in `loadErrors` (shown on the Content page).
 * - `draft` records and unverified NY-specific/time-sensitive records are excluded from learner-facing collections
 *   (see `isEligible`) but kept in `all*` collections for the Content Review page.
 */
import {
  examManifest, glossaryFile, questionFile, lessonFile, scenarioFile, sourceFile,
  isEligible,
  type ExamManifest, type GlossaryTerm, type Question, type Lesson, type Source, type Comparison,
  type ComplianceCase, type ClientProfile, type BeneficiaryCase, type PolicyTimeline, type OutlineNode, type SectionId,
} from './schema';

type Glob = Record<string, unknown>;
const manifestRaw = import.meta.glob('/content/manifest/exam-*.json', { eager: true, import: 'default' }) as Glob;
const glossaryRaw = import.meta.glob('/content/glossary/*.json', { eager: true, import: 'default' }) as Glob;
const questionRaw = import.meta.glob('/content/questions/*.json', { eager: true, import: 'default' }) as Glob;
const lessonRaw = import.meta.glob('/content/lessons/*.json', { eager: true, import: 'default' }) as Glob;
const scenarioRaw = import.meta.glob('/content/scenarios/*.json', { eager: true, import: 'default' }) as Glob;
const sourceRaw = import.meta.glob('/content/sources/*.json', { eager: true, import: 'default' }) as Glob;

export interface LoadError { file: string; message: string }
const loadErrors: LoadError[] = [];

function parseAll<T>(raw: Glob, schema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } } }): T[] {
  const out: T[] = [];
  for (const [file, data] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    const r = schema.safeParse(data);
    if (r.success) out.push(r.data);
    else loadErrors.push({ file, message: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  return out;
}

const manifestsParsed: ExamManifest[] = Object.entries(manifestRaw)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, v]) => examManifest.parse(v));
export const DEFAULT_TRACK_ID = 'ny-17-55';
const TRACK_KEY = 'nyia-track';
/** The learner's active track (stored per device; switching reloads the app so every page rebuilds against it). */
export function getActiveTrackId(): string {
  try {
    const t = localStorage.getItem(TRACK_KEY);
    if (t && manifestsParsed.some((m) => m.id === t)) return t;
  } catch { /* storage may be unavailable */ }
  return DEFAULT_TRACK_ID;
}
export function setActiveTrackId(id: string): void {
  try { localStorage.setItem(TRACK_KEY, id); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.location.assign(import.meta.env.BASE_URL);
}

export interface SectionInfo {
  id: SectionId;
  name: string;
  shortName: string;
  weightPct: number;
  domain: 'general' | 'life' | 'health' | 'property';
  order: number;
  outline: OutlineNode[];
}

const SHORT_NAMES: Record<string, string> = {
  plreg: 'Insurance Regulation', plgen: 'General Insurance', plpc: 'P&C Basics', pldwl: 'Dwelling Policy', plho: 'Homeowners Policy', plauto: 'Auto Insurance', ploth: 'Other Coverages',
  reg: 'Insurance Regulation', gen: 'General Insurance', lib: 'Life Insurance Basics', lip: 'Life Policies',
  lpr: 'Life Provisions & Riders', ann: 'Annuities', tax: 'Federal Taxation', qp: 'Qualified Plans', ls: 'Life Settlements',
  ahb: 'A&H Basics', ihp: 'Health Policy Provisions', di: 'Disability Income', med: 'Medical Plans', aca: 'Affordable Care Act',
  ltc: 'Long-Term Care', grp: 'Group Health', gov: 'Government Plans', sen: 'Seniors & Special Needs',
};

function flatten(nodes: OutlineNode[], out: Map<string, OutlineNode & { sectionId: SectionId; depth: number; path: string[] }>, sectionId: SectionId, depth = 0, path: string[] = []) {
  for (const n of nodes) {
    out.set(n.id, { ...n, sectionId, depth, path: [...path, n.title] });
    if (n.children) flatten(n.children, out, sectionId, depth + 1, [...path, n.title]);
  }
}

function build() {
  const manifest: ExamManifest = manifestsParsed.find((m) => m.id === getActiveTrackId()) ?? manifestsParsed[0];
  const toInfo = (s: ExamManifest['sections'][number], i: number): SectionInfo => ({
    id: s.id, name: s.name, shortName: SHORT_NAMES[s.id] ?? s.name, weightPct: s.weightPct, domain: s.domain, order: i, outline: s.children,
  });
  /** Sections of the ACTIVE track only (this drives every page). */
  const sections: SectionInfo[] = manifest.sections.map(toInfo);
  const activeSectionIds = new Set<string>(sections.map((s) => s.id));
  /** Every section of every track, so past attempts from another track still resolve. */
  const allSectionInfos: SectionInfo[] = manifestsParsed.flatMap((m, mi) => m.sections.map((s, i) => toInfo(s, mi * 100 + i)));
  const sectionById = new Map(allSectionInfos.map((s) => [s.id, s]));
  const outline = new Map<string, OutlineNode & { sectionId: SectionId; depth: number; path: string[] }>();
  for (const m of manifestsParsed) for (const s of m.sections) flatten(s.children, outline, s.id);

  const sources: Source[] = parseAll(sourceRaw, sourceFile).flatMap((f) => f.sources);
  const glossaryFiles = parseAll(glossaryRaw, glossaryFile);
  const allTerms: GlossaryTerm[] = glossaryFiles.flatMap((f) => f.terms);
  const comparisonsRaw: Comparison[] = glossaryFiles.flatMap((f) => f.comparisons);
  const allQuestions: Question[] = parseAll(questionRaw, questionFile).flatMap((f) => f.questions);
  const allLessons: Lesson[] = parseAll(lessonRaw, lessonFile).flatMap((f) => f.lessons);
  const scen = parseAll(scenarioRaw, scenarioFile);

  // de-duplicate by id (first wins) to stay robust against accidental duplicates
  const uniq = <T extends { id: string }>(xs: T[]) => { const m = new Map<string, T>(); for (const x of xs) if (!m.has(x.id)) m.set(x.id, x); return [...m.values()]; };
  const termsAllU = uniq(allTerms);
  const questionsAllU = uniq(allQuestions);
  const lessonsAllU = uniq(allLessons).sort((a, b) => (sectionById.get(a.sectionId)!.order - sectionById.get(b.sectionId)!.order) || a.order - b.order);

  // Track filtering: a record belongs to the active track by its section.
  const termSections = new Set<string>([...activeSectionIds, ...manifest.sharedTermSections]);
  const terms = termsAllU.filter((t) => termSections.has(t.sectionId) && isEligible(t)).sort((a, b) => a.term.localeCompare(b.term));
  const termById = new Map(termsAllU.map((t) => [t.id, t]));
  const eligibleTermIds = new Set(terms.map((t) => t.id));
  const questions = questionsAllU.filter((q) => activeSectionIds.has(q.sectionId) && isEligible(q));
  const questionById = new Map(questionsAllU.map((q) => [q.id, q]));
  const lessons = lessonsAllU.filter((l) => activeSectionIds.has(l.sectionId) && isEligible(l));
  const lessonById = new Map(lessonsAllU.map((l) => [l.id, l]));
  const comparisons = comparisonsRaw.filter((c) => eligibleTermIds.has(c.a) && eligibleTermIds.has(c.b));

  const activeOutlineIds = new Set<string>();
  for (const [oid, n] of outline) if (activeSectionIds.has(n.sectionId)) activeOutlineIds.add(oid);
  const inTrack = (s: { outlineIds: string[] }) => s.outlineIds.some((o) => activeOutlineIds.has(o));
  const complianceCases: ComplianceCase[] = scen.flatMap((s) => s.complianceCases).filter((c) => isEligible(c) && inTrack(c));
  const clientProfiles: ClientProfile[] = scen.flatMap((s) => s.clientProfiles).filter((c) => isEligible(c) && inTrack(c));
  const beneficiaryCases: BeneficiaryCase[] = scen.flatMap((s) => s.beneficiaryCases).filter((c) => isEligible(c) && inTrack(c));
  const policyTimelines: PolicyTimeline[] = scen.flatMap((s) => s.policyTimelines).filter((c) => isEligible(c) && inTrack(c));

  const questionsBySection = new Map<string, Question[]>();
  for (const q of questions) questionsBySection.set(q.sectionId, [...(questionsBySection.get(q.sectionId) ?? []), q]);
  const lessonsBySection = new Map<string, Lesson[]>();
  for (const l of lessons) lessonsBySection.set(l.sectionId, [...(lessonsBySection.get(l.sectionId) ?? []), l]);
  const termsBySection = new Map<string, GlossaryTerm[]>();
  for (const t of terms) termsBySection.set(t.sectionId, [...(termsBySection.get(t.sectionId) ?? []), t]);
  /** Concepts (term ids) per section: owned terms + concepts tagged on that section's questions. */
  const conceptsBySection = new Map<string, string[]>();
  for (const s of sections) {
    const set = new Set<string>((termsBySection.get(s.id) ?? []).map((t) => t.id));
    for (const q of questionsBySection.get(s.id) ?? []) for (const c of q.concepts) if (eligibleTermIds.has(c)) set.add(c);
    conceptsBySection.set(s.id, [...set]);
  }
  /** Lessons that teach a given term (keyTerms). */
  const lessonsByTerm = new Map<string, Lesson[]>();
  for (const l of lessons) for (const k of l.keyTerms) lessonsByTerm.set(k, [...(lessonsByTerm.get(k) ?? []), l]);
  /** Lessons covering an outline id (direct). */
  const lessonsByOutline = new Map<string, Lesson[]>();
  for (const l of lessons) for (const o of l.outlineIds) lessonsByOutline.set(o, [...(lessonsByOutline.get(o) ?? []), l]);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  /** Every track with its eligible content counts (used by the track switcher). */
  const tracks = manifestsParsed.map((m) => {
    const ids = new Set<string>(m.sections.map((s) => s.id));
    return {
      id: m.id, series: m.series, title: m.title, manifest: m, sectionIds: [...ids],
      counts: {
        questions: questionsAllU.filter((q) => ids.has(q.sectionId) && isEligible(q)).length,
        lessons: lessonsAllU.filter((l) => ids.has(l.sectionId) && isEligible(l)).length,
        terms: termsAllU.filter((t) => ids.has(t.sectionId) && isEligible(t)).length,
      },
    };
  });
  const drafts = {
    terms: termsAllU.filter((t) => termSections.has(t.sectionId) && !isEligible(t)),
    questions: questionsAllU.filter((q) => activeSectionIds.has(q.sectionId) && !isEligible(q)),
    lessons: lessonsAllU.filter((l) => activeSectionIds.has(l.sectionId) && !isEligible(l)),
  };

  return {
    manifest, sections, sectionById, outline, tracks,
    terms, termById, termsBySection, comparisons,
    questions, questionById, questionsBySection,
    lessons, lessonById, lessonsBySection, lessonsByTerm, lessonsByOutline,
    conceptsBySection, sources, sourceById,
    complianceCases, clientProfiles, beneficiaryCases, policyTimelines,
    drafts, loadErrors,
    all: {
      terms: termsAllU.filter((t) => termSections.has(t.sectionId)),
      questions: questionsAllU.filter((q) => activeSectionIds.has(q.sectionId)),
      lessons: lessonsAllU.filter((l) => activeSectionIds.has(l.sectionId)),
    },
  };
}

export const content = build();
export type Content = typeof content;

/** Find the lesson that best teaches a question (shared outline id, then shared key term). */
export function lessonForQuestion(q: Pick<Question, 'outlineIds' | 'concepts' | 'sectionId'>): Lesson | undefined {
  for (const o of q.outlineIds) {
    const direct = content.lessonsByOutline.get(o)?.[0];
    if (direct) return direct;
    // walk up the outline tree
    const parts = o.split('.');
    for (let i = parts.length - 1; i >= 2; i--) {
      const l = content.lessonsByOutline.get(parts.slice(0, i).join('.'))?.[0];
      if (l) return l;
    }
  }
  for (const c of q.concepts) {
    const l = content.lessonsByTerm.get(c)?.[0];
    if (l) return l;
  }
  return content.lessonsBySection.get(q.sectionId)?.[0];
}

export function termName(id: string): string {
  return content.termById.get(id)?.term ?? id.replace(/-/g, ' ');
}
