/**
 * Concept mastery — deterministic and explainable.
 *
 * Evidence events come from practice/exam answers, flashcard reviews and glossary checks. Each event has a score:
 *   correct & confident = 1.0, correct but guessed = 0.5, incorrect = 0.
 * Each event's weight decays with age (half-life 21 days) and is scaled by difficulty (×0.85 easy, ×1.0 medium, ×1.15 hard).
 *   mastery = Σ(weight × score) / (Σ weight + 1)        ← the "+1" is a skeptical prior: one imaginary miss
 * so a single correct answer gives at most 50%, three confident correct answers ≈ 75%, and recent misses pull it down.
 * Level: weak < 40% ≤ developing < 70% ≤ proficient < 85% ≤ mastered (mastered also needs ≥ 3 correct events on ≥ 2 different days).
 */
import { DAY_MS } from './dates';

export interface EvidenceEvent {
  concept: string;
  at: number;
  correct: boolean;
  guessed?: boolean;
  difficulty?: 1 | 2 | 3;
  source: 'question' | 'flashcard' | 'glossary' | 'lesson';
}
export type MasteryLevel = 'unseen' | 'weak' | 'developing' | 'proficient' | 'mastered';
export interface ConceptMastery {
  concept: string;
  score: number; // 0..1
  level: MasteryLevel;
  attempts: number;
  correct: number;
  incorrect: number;
  guessedCorrect: number;
  lastSeen: number | null;
  recentMisses: number; // misses in the last 14 days
}

export const HALF_LIFE_DAYS = 21;
const DIFF = { 1: 0.85, 2: 1, 3: 1.15 } as const;

export function eventScore(e: EvidenceEvent): number {
  if (!e.correct) return 0;
  return e.guessed ? 0.5 : 1;
}

export function conceptMastery(concept: string, events: EvidenceEvent[], now: number): ConceptMastery {
  let num = 0, den = 0, correct = 0, incorrect = 0, guessedCorrect = 0, recentMisses = 0;
  let lastSeen: number | null = null;
  const correctDays = new Set<number>();
  for (const e of events) {
    const ageDays = Math.max(0, (now - e.at) / DAY_MS);
    const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS) * DIFF[e.difficulty ?? 2];
    num += w * eventScore(e);
    den += w;
    if (e.correct) {
      correct++;
      if (e.guessed) guessedCorrect++;
      else correctDays.add(Math.floor(e.at / DAY_MS));
    } else {
      incorrect++;
      if (now - e.at <= 14 * DAY_MS) recentMisses++;
    }
    lastSeen = lastSeen === null ? e.at : Math.max(lastSeen, e.at);
  }
  const score = events.length ? num / (den + 1) : 0;
  let level: MasteryLevel = 'unseen';
  if (events.length) {
    if (score >= 0.85 && correct - guessedCorrect >= 3 && correctDays.size >= 2) level = 'mastered';
    else if (score >= 0.7) level = 'proficient';
    else if (score >= 0.4) level = 'developing';
    else level = 'weak';
  }
  return { concept, score, level, attempts: events.length, correct, incorrect, guessedCorrect, lastSeen, recentMisses };
}

export function masteryByConcept(events: EvidenceEvent[], now: number): Map<string, ConceptMastery> {
  const by = new Map<string, EvidenceEvent[]>();
  for (const e of events) by.set(e.concept, [...(by.get(e.concept) ?? []), e]);
  const out = new Map<string, ConceptMastery>();
  for (const [c, es] of by) out.set(c, conceptMastery(c, es, now));
  return out;
}

export interface SectionMastery { sectionId: string; score: number; coverage: number; concepts: number; seen: number; mastered: number }

/** Average concept mastery across a section's concepts (unseen concepts count as 0), plus coverage. */
export function sectionMastery(sectionId: string, conceptIds: string[], m: Map<string, ConceptMastery>): SectionMastery {
  if (!conceptIds.length) return { sectionId, score: 0, coverage: 0, concepts: 0, seen: 0, mastered: 0 };
  let sum = 0, seen = 0, mastered = 0;
  for (const c of conceptIds) {
    const cm = m.get(c);
    if (cm && cm.attempts) { seen++; sum += cm.score; if (cm.level === 'mastered') mastered++; }
  }
  return { sectionId, score: sum / conceptIds.length, coverage: seen / conceptIds.length, concepts: conceptIds.length, seen, mastered };
}

/**
 * Estimated exam score: Σ section weight × recent accuracy in that section, where recent accuracy uses the last
 * `window` answers per section shrunk toward 50% with a pseudo-count of 5 answers. Sections with no answers yet count as
 * 25% (random guessing on 4 choices) — no knowledge is assumed for unstudied sections.
 */
export function estimateExamScore(
  sections: { id: string; weightPct: number }[],
  answersBySection: Record<string, { correct: boolean; at: number }[]>,
  window = 40,
): { pct: number; confidence: 'low' | 'medium' | 'high'; bySection: Record<string, number> } {
  const by: Record<string, number> = {};
  let pct = 0, totalAnswers = 0;
  for (const s of sections) {
    const recent = (answersBySection[s.id] ?? []).slice().sort((a, b) => b.at - a.at).slice(0, window);
    totalAnswers += recent.length;
    const c = recent.filter((r) => r.correct).length;
    const acc = recent.length ? (c + 0.5 * 5) / (recent.length + 5) : 0.25;
    by[s.id] = acc;
    pct += (s.weightPct / 100) * acc;
  }
  const confidence = totalAnswers >= 300 ? 'high' : totalAnswers >= 120 ? 'medium' : 'low';
  return { pct: Math.round(pct * 1000) / 10, confidence, bySection: by };
}
