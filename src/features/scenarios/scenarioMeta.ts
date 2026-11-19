import { content } from '@/content';

export type ScenarioId = 'life-selection' | 'deductible' | 'beneficiary' | 'policy-timeline' | 'compliance' | 'terminology';

export interface ScenarioMeta {
  id: ScenarioId;
  title: string;
  blurb: string;
  skills: string;
  /** Progress row ids that make up this scenario (a single id for stand-alone scenarios). */
  progressIds: () => string[];
  /** How many playable items exist in verified content. null = no content dependency. */
  available: () => number | null;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'life-selection', title: 'Life Insurance Needs & Selection',
    blurb: 'Meet a client, read their situation, and make the recommendations a careful agent would make.',
    skills: 'Needs analysis, policy selection, suitability',
    progressIds: () => content.clientProfiles.map((c) => `life-selection:${c.id}`),
    available: () => content.clientProfiles.length,
  },
  {
    id: 'deductible', title: 'Deductible, Coinsurance & Out-of-Pocket Max',
    blurb: 'Build a year of medical bills and see exactly who pays what, line by line.',
    skills: 'Cost sharing, copays, out-of-pocket maximum',
    progressIds: () => ['deductible'],
    available: () => null,
  },
  {
    id: 'beneficiary', title: 'Beneficiary Designation',
    blurb: 'Predict who is paid, and how much, when a named beneficiary dies, divorces or is missing.',
    skills: 'Primary and contingent, per capita, per stirpes, revocable',
    progressIds: () => content.beneficiaryCases.map((c) => `beneficiary:${c.id}`),
    available: () => content.beneficiaryCases.length,
  },
  {
    id: 'policy-timeline', title: 'Policy Lifecycle Timeline',
    blurb: 'Walk a policy from application through grace period, lapse and reinstatement.',
    skills: 'Grace period, lapse, reinstatement, status changes',
    progressIds: () => content.policyTimelines.map((c) => `policy-timeline:${c.id}`),
    available: () => content.policyTimelines.length,
  },
  {
    id: 'compliance', title: 'Ethics & Compliance Cases',
    blurb: 'Read a short producer scenario and spot the rule that applies.',
    skills: 'Misrepresentation, rebating, replacement, twisting, privacy',
    progressIds: () => content.complianceCases.map((c) => `compliance:${c.id}`),
    available: () => content.complianceCases.length,
  },
  {
    id: 'terminology', title: 'Exam Terminology Challenge',
    blurb: 'Ten quick rounds: match a plain definition or masked example to the right insurance term.',
    skills: 'Vocabulary precision, telling look-alike terms apart',
    progressIds: () => ['terminology'],
    available: () => content.terms.length >= 4 ? content.terms.length : 0,
  },
];

export const scenarioById = (id: string | undefined) => SCENARIOS.find((s) => s.id === id);

export const PENDING_NOTE = 'Content pending verification — this scenario will unlock when its source-checked content is published.';
