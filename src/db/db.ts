/**
 * Local persistence (IndexedDB via Dexie). All learner progress lives here, keyed by stable content ids, so content
 * updates (new question versions, added lessons) never destroy progress. No server, no account.
 */
import Dexie, { type Table } from 'dexie';
import type { SrsState, Rating } from '@/lib/srs';
import type { ExamScore } from '@/lib/scoring';
import type { Shortfall } from '@/lib/blueprint';
import type { PlannerInput, StudyPlan } from '@/lib/planner';

export type PracticeMode =
  | 'learn' | 'topic' | 'mixed' | 'weakness' | 'rapid' | 'tricky' | 'explain'
  | 'exam' | 'lesson-quiz' | 'diagnostic' | 'review' | 'glossary' | 'scenario';
export type Confidence = 'guess' | 'unsure' | 'sure';
export type ActivityKind = 'lesson' | 'flashcards' | 'practice' | 'exam' | 'dictionary' | 'scenario' | 'review' | 'other';
export type CardMode = 'term-def' | 'def-term' | 'scenario' | 'multiple-choice' | 'typed';

export interface Settings {
  id: 'app';
  theme: 'system' | 'light' | 'dark';
  textScale: number; // 0.875 – 1.5
  highContrast: boolean;
  reducedMotion: boolean;
  teachMeNew: boolean;
  ttsEnabled: boolean;
  ttsRate: number;
  focusMode: boolean;
  onboardingDone: boolean;
  onboardingDoneAt: number | null;
  priorKnowledge: 'none' | 'some' | 'experienced';
  practiceTarget: number; // default 85
  dailyGoalMinutes: number;
  track: string;
  showTimerInPractice: boolean;
  tutor: { enabled: boolean; baseUrl: string; model: string };
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app', theme: 'system', textScale: 1, highContrast: false, reducedMotion: false, teachMeNew: false,
  ttsEnabled: true, ttsRate: 1, focusMode: false, onboardingDone: false, onboardingDoneAt: null, priorKnowledge: 'none',
  practiceTarget: 85, dailyGoalMinutes: 45, track: 'ny-17-55', showTimerInPractice: false,
  tutor: { enabled: false, baseUrl: 'http://localhost:11434', model: 'llama3.1' },
};

export interface AttemptRow {
  id?: number;
  questionId: string; // bank id, or "term:<termId>" for glossary checks, or "lesson:<lessonId>:<n>" for knowledge checks
  sectionId: string;
  concepts: string[];
  difficulty: 1 | 2 | 3;
  correct: boolean;
  choiceId: string | null; // null = unanswered
  confidence: Confidence | null;
  responseMs: number;
  mode: PracticeMode;
  sessionId: string;
  at: number;
  /** Term id the learner chose instead (when a distractor clearly names another glossary term). */
  confusedWith?: string;
  explanation?: string;
  rubricScore?: number;
  contentVersion?: number;
}

export interface CardRow {
  termId: string;
  inDeck: boolean;
  addedAt: number;
  addedReason: 'manual' | 'missed-question' | 'lesson' | 'onboarding' | 'guessed';
  srs: SrsState;
}
export interface CardReviewRow { id?: number; termId: string; at: number; rating: Rating; mode: CardMode; correct: boolean }
export interface TermStatusRow { termId: string; confidence: 1 | 2 | 3 | 4 | 5 | null; difficult: boolean; viewCount: number; lastViewedAt: number | null }

export interface LessonProgressRow {
  lessonId: string;
  sectionId: string;
  status: 'in-progress' | 'completed';
  partsViewed: number[];
  activityDone: boolean;
  kcCorrect: number;
  kcTotal: number;
  quizBest: number | null; // percent
  startedAt: number;
  completedAt: number | null;
  lastVisitedAt: number;
  visits: number;
}

export interface ExamSessionRow {
  id: string;
  kind: 'full' | 'custom';
  size: number;
  seed: number;
  questionIds: string[];
  choiceOrders: Record<string, string[]>;
  answers: Record<string, string>;
  flags: string[];
  currentIndex: number;
  startedAt: number;
  deadline: number;
  timeLimitMin: number;
  submittedAt: number | null;
  /** Track id the exam belongs to (rows without it predate multi-track and belong to ny-17-55). */
  track?: string;
  status: 'in-progress' | 'submitted';
  autoSubmitted: boolean;
  shortfalls: Shortfall[];
  /** Time each question was visible (ms), for time-per-question stats. */
  timeOnQuestion: Record<string, number>;
  result?: ExamScore & { timeUsedMs: number };
}

export interface PracticeSessionRow {
  id: string;
  mode: PracticeMode;
  title: string;
  config: Record<string, unknown>;
  questionIds: string[];
  choiceOrders: Record<string, string[]>;
  index: number;
  answers: Record<string, { choiceId: string; correct: boolean; confidence: Confidence | null; explanation?: string }>;
  reasons?: Record<string, string>;
  startedAt: number;
  updatedAt: number;
  track?: string;
  status: 'in-progress' | 'completed';
}

export interface StudyLogRow { key: string; date: string; kind: ActivityKind; seconds: number }
export interface PlanRow { id: 'current'; input: PlannerInput; generatedOn: string; plan: StudyPlan; checks: Record<string, boolean> }
export interface ScenarioProgressRow { id: string; kind: string; completedAt: number; score: number | null; attempts: number }
export interface TutorMessageRow { id?: number; at: number; role: 'user' | 'assistant' | 'system'; text: string; sourced: boolean; citations: string[] }

export class AcademyDB extends Dexie {
  settings!: Table<Settings, string>;
  attempts!: Table<AttemptRow, number>;
  cards!: Table<CardRow, string>;
  cardReviews!: Table<CardReviewRow, number>;
  termStatus!: Table<TermStatusRow, string>;
  lessonProgress!: Table<LessonProgressRow, string>;
  examSessions!: Table<ExamSessionRow, string>;
  practiceSessions!: Table<PracticeSessionRow, string>;
  studyLog!: Table<StudyLogRow, string>;
  plan!: Table<PlanRow, string>;
  scenarioProgress!: Table<ScenarioProgressRow, string>;
  tutorMessages!: Table<TutorMessageRow, number>;

  constructor(name = 'ny-insurance-academy') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      attempts: '++id, questionId, sectionId, *concepts, mode, sessionId, at, correct',
      cards: 'termId, inDeck, srs.due',
      cardReviews: '++id, termId, at',
      termStatus: 'termId, difficult',
      lessonProgress: 'lessonId, sectionId, status',
      examSessions: 'id, status, startedAt, kind',
      practiceSessions: 'id, status, updatedAt, mode',
      studyLog: 'key, date, kind',
      plan: 'id',
      scenarioProgress: 'id, kind',
      tutorMessages: '++id, at',
    });
  }
}

export const db = new AcademyDB();

export const TABLES = [
  'settings', 'attempts', 'cards', 'cardReviews', 'termStatus', 'lessonProgress', 'examSessions',
  'practiceSessions', 'studyLog', 'plan', 'scenarioProgress', 'tutorMessages',
] as const;
export type TableName = (typeof TABLES)[number];
