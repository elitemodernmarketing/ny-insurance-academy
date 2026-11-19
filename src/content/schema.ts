/**
 * Content schemas — the single contract shared by content files, validation scripts and the app.
 * Content lives in /content as JSON. See docs/CONTENT_GUIDE.md for authoring rules.
 */
import { z } from 'zod';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase kebab-case');
const isoDate = z.string().regex(ISO_DATE, 'YYYY-MM-DD');
const nonEmpty = z.string().trim().min(1);

/** Section ids across all track manifests (17-55 Life/A&H and 17-54 Personal Lines). */
export const SECTION_IDS = [
  'reg', 'gen', 'lib', 'lip', 'lpr', 'ann', 'tax', 'qp', 'ls',
  'ahb', 'ihp', 'di', 'med', 'aca', 'ltc', 'grp', 'gov', 'sen',
  // Personal Lines (17-54) track
  'plreg', 'plgen', 'plpc', 'pldwl', 'plho', 'plauto', 'ploth',
] as const;
export const sectionId = z.enum(SECTION_IDS);
export type SectionId = z.infer<typeof sectionId>;

/**
 * Verification status
 *  - verified : checked against a primary source saved under /research (statute, regulation, official outline, federal agency page)
 *  - reviewed : general insurance principle (NOT New York-specific law and NOT a time-sensitive figure), written from standard
 *               industry knowledge and passed automated checks + a second-pass content review. Eligible for practice/exams.
 *  - draft    : not yet approved. Excluded from practice, flashcards and exams; listed on the Content Review page.
 * Rule: nySpecific or timeSensitive content must be `verified` (with sources) to be eligible.
 */
export const verificationStatus = z.enum(['verified', 'reviewed', 'draft']);
export type VerificationStatus = z.infer<typeof verificationStatus>;

export const verification = z.object({
  status: verificationStatus,
  method: z.enum(['statute-text', 'regulation-text', 'official-outline', 'federal-source', 'general-principle']),
  checkedOn: isoDate,
  notes: z.string().optional(),
});
export type Verification = z.infer<typeof verification>;

/** Provenance fields every content record carries. */
const provenance = {
  sources: z.array(id).default([]),
  nySpecific: z.boolean().default(false),
  timeSensitive: z.boolean().default(false),
  /** Date after which time-sensitive content should be re-verified. Required when timeSensitive. */
  reviewDue: isoDate.optional(),
  verification,
};

// ---------------------------------------------------------------------------
// Curriculum manifest
// ---------------------------------------------------------------------------
export interface OutlineNode {
  id: string;
  title: string;
  refs?: string;
  officialText?: string;
  children?: OutlineNode[];
}
export const outlineNode: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    id: z.string().regex(/^[a-z]+(\.\d+)+$/),
    title: nonEmpty,
    refs: z.string().optional(),
    officialText: z.string().optional(),
    children: z.array(outlineNode).optional(),
  }),
);
export const manifestSection = z.object({
  id: sectionId,
  name: nonEmpty,
  weightPct: z.number().int().min(1).max(100),
  domain: z.enum(['general', 'life', 'health', 'property']),
  children: z.array(outlineNode),
});
export type ManifestSection = z.infer<typeof manifestSection>;
export const examManifest = z.object({
  id: nonEmpty,
  series: nonEmpty,
  state: z.literal('NY'),
  title: nonEmpty,
  exam: z.object({
    questionCount: z.number().int().positive(),
    timeLimitMinutes: z.number().int().positive(),
    passingPercent: z.number().min(1).max(100),
    experimentalItemsNote: z.string().optional(),
    closedBook: z.boolean().optional(),
  }),
  prelicensing: z.object({ statutoryMinimumHours: z.number(), note: z.string(), sources: z.array(id) }),
  /** Sections whose glossary terms are also shown in this track's dictionary (e.g. Personal Lines reuses the general-insurance terms). */
  sharedTermSections: z.array(sectionId).default([]),
  source: z.object({ id, checkedOn: isoDate, note: z.string(), hierarchyNote: z.string().optional() }),
  sections: z.array(manifestSection),
});
export type ExamManifest = z.infer<typeof examManifest>;

// ---------------------------------------------------------------------------
// Source registry
// ---------------------------------------------------------------------------
export const source = z.object({
  id,
  title: nonEmpty,
  publisher: nonEmpty,
  url: z.string().url().optional(),
  kind: z.enum(['official-outline', 'statute', 'regulation', 'federal', 'agency-guidance', 'general']),
  citation: z.string().optional(),
  retrievedOn: isoDate.optional(),
  /** Path (repo-relative) to the saved excerpt under /research, when applicable. */
  localCopy: z.string().optional(),
  notes: z.string().optional(),
});
export type Source = z.infer<typeof source>;
export const sourceFile = z.object({ sources: z.array(source) });

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------
export const mcq = z.object({
  prompt: nonEmpty,
  choices: z.array(nonEmpty).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: nonEmpty,
});
export type InlineMcq = z.infer<typeof mcq>;

export const glossaryTerm = z.object({
  id,
  term: nonEmpty,
  aliases: z.array(nonEmpty).default([]),
  sectionId,
  outlineIds: z.array(z.string()).min(1),
  formal: nonEmpty,
  plain: nonEmpty,
  /** "Teach me like I'm new" / "Explain more simply": an analogy-level explanation. */
  simpler: nonEmpty,
  examples: z.array(nonEmpty).min(2),
  examTip: nonEmpty,
  misconception: nonEmpty,
  related: z.array(id).default([]),
  confusedWith: z.array(id).default([]),
  /** Optional phonetic hint e.g. "AL-ee-uh-tor-ee". TTS reads `term`. */
  pronunciation: z.string().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  practice: mcq,
  ...provenance,
});
export type GlossaryTerm = z.infer<typeof glossaryTerm>;

export const comparison = z.object({
  a: id,
  b: id,
  keyDifference: nonEmpty,
  rows: z.array(z.object({ aspect: nonEmpty, a: nonEmpty, b: nonEmpty })).min(2),
  memoryTip: z.string().optional(),
});
export type Comparison = z.infer<typeof comparison>;

export const glossaryFile = z.object({
  sectionId,
  terms: z.array(glossaryTerm),
  comparisons: z.array(comparison).default([]),
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
export const choiceId = z.enum(['a', 'b', 'c', 'd']);
export const questionStyle = z.enum(['definition', 'concept', 'scenario', 'negative', 'calculation', 'comparison', 'application']);
export const question = z.object({
  id: z.string().regex(/^[a-z]+-q\d{3}$/, 'question ids look like "lpr-q001"'),
  series: z.array(z.string()).min(1),
  sectionId,
  outlineIds: z.array(z.string()).min(1),
  concepts: z.array(id).min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  style: questionStyle,
  tags: z.array(z.enum(['rapid', 'tricky', 'negative-wording', 'ny-law', 'math'])).default([]),
  scenario: z.string().optional(),
  stem: nonEmpty,
  choices: z
    .array(z.object({ id: choiceId, text: nonEmpty, rationale: nonEmpty }))
    .length(4),
  correct: choiceId,
  explanation: nonEmpty,
  memoryTip: nonEmpty,
  /** Optional rubric for "Explain your answer" mode: each key point is matched if any keyword/phrase appears. */
  rubric: z
    .object({ keyPoints: z.array(z.object({ label: nonEmpty, anyOf: z.array(nonEmpty).min(1) })).min(1) })
    .optional(),
  version: z.number().int().positive(),
  lastReviewed: isoDate,
  ...provenance,
});
export type Question = z.infer<typeof question>;
export type ChoiceId = z.infer<typeof choiceId>;
export const questionFile = z.object({ sectionId, questions: z.array(question) });

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
export const callout = z.object({
  kind: z.enum(['exam-trap', 'ny-rule', 'memory-tip', 'note']),
  text: nonEmpty,
  sources: z.array(id).optional(),
});
export const lessonPart = z.object({
  heading: nonEmpty,
  /** markdown-lite: paragraphs, "- " bullets, **bold**, *italic*, [[term-id]] or [[term-id|label]] glossary links */
  body: nonEmpty,
  /** Teach-me-like-I'm-new alternative for `body` (same essential facts, simpler words). */
  simple: z.string().optional(),
  /** Collapsible deeper explanation. */
  advanced: z.string().optional(),
  example: z.object({ title: nonEmpty, body: nonEmpty }).optional(),
  callouts: z.array(callout).default([]),
});
export const activity = z.discriminatedUnion('type', [
  z.object({ type: z.literal('match'), prompt: nonEmpty, pairs: z.array(z.object({ left: nonEmpty, right: nonEmpty })).min(3).max(8) }),
  z.object({
    type: z.literal('categorize'),
    prompt: nonEmpty,
    categories: z.array(nonEmpty).min(2).max(4),
    items: z.array(z.object({ text: nonEmpty, category: nonEmpty })).min(4).max(12),
  }),
  z.object({ type: z.literal('sequence'), prompt: nonEmpty, steps: z.array(nonEmpty).min(3).max(8) }),
  z.object({
    type: z.literal('truefalse'),
    prompt: nonEmpty,
    statements: z.array(z.object({ text: nonEmpty, answer: z.boolean(), explanation: nonEmpty })).min(3).max(8),
  }),
]);
export type Activity = z.infer<typeof activity>;
export const lesson = z.object({
  id: z.string().regex(/^[a-z]+-l\d{2}$/, 'lesson ids look like "lpr-l01"'),
  sectionId,
  order: z.number().int().positive(),
  title: nonEmpty,
  outlineIds: z.array(z.string()).min(1),
  estMinutes: z.number().int().min(5).max(90),
  intro: nonEmpty,
  objectives: z.array(nonEmpty).min(2),
  keyTerms: z.array(id).min(1),
  parts: z.array(lessonPart).min(2),
  activity,
  knowledgeChecks: z.array(mcq).min(2).max(5),
  summary: z.array(nonEmpty).min(3),
  related: z.array(z.string()).default([]),
  ...provenance,
});
export type Lesson = z.infer<typeof lesson>;
export type LessonPart = z.infer<typeof lessonPart>;
export const lessonFile = z.object({ sectionId, lessons: z.array(lesson) });

// ---------------------------------------------------------------------------
// Scenarios (data-driven parts of the scenario simulator)
// ---------------------------------------------------------------------------
export const complianceCase = z.object({
  id,
  title: nonEmpty,
  narrative: nonEmpty,
  question: nonEmpty,
  options: z.array(z.object({ id: choiceId, text: nonEmpty, rationale: nonEmpty })).length(4),
  correct: choiceId,
  issue: z.enum(['misrepresentation', 'rebating', 'replacement', 'advertising', 'unfair-discrimination', 'twisting', 'fiduciary', 'licensing', 'privacy', 'fraud', 'none']),
  explanation: nonEmpty,
  outlineIds: z.array(z.string()).min(1),
  concepts: z.array(id).default([]),
  ...provenance,
});
export const clientProfile = z.object({
  id,
  name: nonEmpty,
  age: z.number().int(),
  summary: nonEmpty,
  facts: z.array(z.object({ label: nonEmpty, value: nonEmpty })).min(3),
  goal: nonEmpty,
  decisions: z
    .array(
      z.object({
        prompt: nonEmpty,
        options: z.array(z.object({ text: nonEmpty, quality: z.enum(['best', 'acceptable', 'poor']), feedback: nonEmpty })).min(2).max(4),
      }),
    )
    .min(2),
  takeaways: z.array(nonEmpty).min(2),
  concepts: z.array(id).default([]),
  outlineIds: z.array(z.string()).min(1),
  ...provenance,
});
export const beneficiaryCase = z.object({
  id,
  title: nonEmpty,
  setup: nonEmpty,
  faceAmount: z.number().positive(),
  designation: z.object({
    primary: z.array(z.object({ name: nonEmpty, relation: nonEmpty, sharePct: z.number() })),
    contingent: z.array(z.object({ name: nonEmpty, relation: nonEmpty, sharePct: z.number() })),
    distribution: z.enum(['per-capita', 'per-stirpes', 'named-shares']),
    revocable: z.boolean(),
  }),
  events: z.array(z.object({ id, label: nonEmpty, outcome: nonEmpty, payouts: z.array(z.object({ name: nonEmpty, amount: z.number() })) })).min(2),
  concepts: z.array(id).default([]),
  outlineIds: z.array(z.string()).min(1),
  ...provenance,
});
export const timelineStep = z.object({
  id,
  day: z.number().int(),
  label: nonEmpty,
  detail: nonEmpty,
  status: z.enum(['in-force', 'grace', 'lapsed', 'reinstated', 'pending']),
  question: mcq.optional(),
  sources: z.array(id).default([]),
});
export const policyTimeline = z.object({
  id,
  title: nonEmpty,
  intro: nonEmpty,
  steps: z.array(timelineStep).min(4),
  concepts: z.array(id).default([]),
  outlineIds: z.array(z.string()).min(1),
  ...provenance,
});
export const scenarioFile = z.object({
  complianceCases: z.array(complianceCase).default([]),
  clientProfiles: z.array(clientProfile).default([]),
  beneficiaryCases: z.array(beneficiaryCase).default([]),
  policyTimelines: z.array(policyTimeline).default([]),
});
export type ComplianceCase = z.infer<typeof complianceCase>;
export type ClientProfile = z.infer<typeof clientProfile>;
export type BeneficiaryCase = z.infer<typeof beneficiaryCase>;
export type PolicyTimeline = z.infer<typeof policyTimeline>;

// ---------------------------------------------------------------------------
// Term registry (planned glossary; owner section writes the entry)
// ---------------------------------------------------------------------------
export const termRegistry = z.object({
  terms: z.array(z.object({ id, term: nonEmpty, owner: sectionId })),
});

/** True when a record may be shown in practice, flashcards and exams. */
export function isEligible(rec: { verification: Verification; nySpecific?: boolean; timeSensitive?: boolean; sources?: string[] }): boolean {
  const s = rec.verification.status;
  if (s === 'draft') return false;
  if ((rec.nySpecific || rec.timeSensitive) && s !== 'verified') return false;
  if ((rec.nySpecific || rec.timeSensitive) && !(rec.sources && rec.sources.length)) return false;
  return true;
}
