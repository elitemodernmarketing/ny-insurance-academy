/** Data-access helpers. Feature code should use these instead of writing tables ad hoc where a helper exists. */
import { db, DEFAULT_SETTINGS, type Settings, type AttemptRow, type CardRow, type CardMode, type ActivityKind, type TermStatusRow, type LessonProgressRow, type Confidence } from './db';
import { newCard, review as srsReview, type Rating } from '@/lib/srs';
import { DAY_MS, localDate } from '@/lib/dates';

// ---------------------------------------------------------------- settings
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), tutor: { ...DEFAULT_SETTINGS.tutor, ...(s?.tutor ?? {}) } };
}
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'app' });
}

// ---------------------------------------------------------------- attempts
/**
 * Record an answer. Side effects that implement the adaptive rules:
 *  - incorrect → each concept's flashcard is added to the deck (if not already) and made due now;
 *  - correct but marked "guess" → each concept's card is added/kept in the deck and due within 1 day.
 */
export async function recordAttempt(a: Omit<AttemptRow, 'id' | 'at'> & { at?: number }): Promise<number> {
  const at = a.at ?? Date.now();
  return db.transaction('rw', db.attempts, db.cards, async () => {
    const id = await db.attempts.add({ ...a, at });
    if (!a.correct || a.confidence === 'guess') {
      for (const termId of a.concepts) {
        const existing = await db.cards.get(termId);
        const dueBy = a.correct ? at + DAY_MS : at;
        if (!existing) {
          await db.cards.put({ termId, inDeck: true, addedAt: at, addedReason: a.correct ? 'guessed' : 'missed-question', srs: { ...newCard(at), due: dueBy } });
        } else {
          await db.cards.put({ ...existing, inDeck: true, srs: { ...existing.srs, due: Math.min(existing.srs.due, dueBy) } });
        }
      }
    }
    return id;
  });
}

// ---------------------------------------------------------------- flashcards
export async function addToDeck(termIds: string[], reason: CardRow['addedReason'] = 'manual'): Promise<number> {
  const now = Date.now();
  let added = 0;
  await db.transaction('rw', db.cards, async () => {
    for (const termId of termIds) {
      const c = await db.cards.get(termId);
      if (!c) { await db.cards.put({ termId, inDeck: true, addedAt: now, addedReason: reason, srs: newCard(now) }); added++; }
      else if (!c.inDeck) { await db.cards.put({ ...c, inDeck: true }); added++; }
    }
  });
  return added;
}
export async function removeFromDeck(termId: string): Promise<void> {
  const c = await db.cards.get(termId);
  if (c) await db.cards.put({ ...c, inDeck: false });
}
/** Grade a recall. Viewing a card does not call this — only an explicit rating changes the schedule. */
export async function reviewCard(termId: string, rating: Rating, mode: CardMode, now = Date.now()): Promise<CardRow> {
  return db.transaction('rw', db.cards, db.cardReviews, async () => {
    const c = (await db.cards.get(termId)) ?? { termId, inDeck: true, addedAt: now, addedReason: 'manual' as const, srs: newCard(now) };
    const next: CardRow = { ...c, inDeck: true, srs: srsReview(c.srs, rating, now) };
    await db.cards.put(next);
    await db.cardReviews.add({ termId, at: now, rating, mode, correct: rating !== 'again' });
    return next;
  });
}

// ---------------------------------------------------------------- glossary status
export async function getTermStatus(termId: string): Promise<TermStatusRow> {
  return (await db.termStatus.get(termId)) ?? { termId, confidence: null, difficult: false, viewCount: 0, lastViewedAt: null };
}
export async function updateTermStatus(termId: string, patch: Partial<TermStatusRow>): Promise<void> {
  const cur = await getTermStatus(termId);
  await db.termStatus.put({ ...cur, ...patch, termId });
}
export async function noteTermViewed(termId: string): Promise<void> {
  const cur = await getTermStatus(termId);
  await db.termStatus.put({ ...cur, viewCount: cur.viewCount + 1, lastViewedAt: Date.now() });
}

// ---------------------------------------------------------------- lessons
export async function touchLesson(lessonId: string, sectionId: string): Promise<LessonProgressRow> {
  const now = Date.now();
  const cur = await db.lessonProgress.get(lessonId);
  const row: LessonProgressRow = cur
    ? { ...cur, lastVisitedAt: now, visits: cur.visits + 1 }
    : { lessonId, sectionId, status: 'in-progress', partsViewed: [], activityDone: false, kcCorrect: 0, kcTotal: 0, quizBest: null, startedAt: now, completedAt: null, lastVisitedAt: now, visits: 1 };
  await db.lessonProgress.put(row);
  return row;
}
export async function updateLesson(lessonId: string, patch: Partial<LessonProgressRow>): Promise<void> {
  const cur = await db.lessonProgress.get(lessonId);
  if (!cur) throw new Error(`lesson ${lessonId} not started`);
  await db.lessonProgress.put({ ...cur, ...patch, lessonId });
}

// ---------------------------------------------------------------- study time
export async function logStudySeconds(kind: ActivityKind, seconds: number, at = Date.now()): Promise<void> {
  if (seconds <= 0) return;
  const date = localDate(at);
  const key = `${date}|${kind}`;
  await db.transaction('rw', db.studyLog, async () => {
    const cur = await db.studyLog.get(key);
    await db.studyLog.put({ key, date, kind, seconds: (cur?.seconds ?? 0) + Math.round(seconds) });
  });
}

// ---------------------------------------------------------------- history helpers
export interface QuestionHistory { exposure: Record<string, number>; missed: Record<string, number>; lastSeen: Record<string, number> }
export async function questionHistory(): Promise<QuestionHistory> {
  const h: QuestionHistory = { exposure: {}, missed: {}, lastSeen: {} };
  await db.attempts.each((a) => {
    h.exposure[a.questionId] = (h.exposure[a.questionId] ?? 0) + 1;
    if (!a.correct) h.missed[a.questionId] = (h.missed[a.questionId] ?? 0) + 1;
    h.lastSeen[a.questionId] = Math.max(h.lastSeen[a.questionId] ?? 0, a.at);
  });
  return h;
}

export function newId(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}-${r}` : r;
}

export type { Confidence };
