# Architecture — NY Insurance Licensing Academy

Local-first React + TypeScript PWA. No server, no account, no paid APIs. All progress is in IndexedDB (Dexie).
Content is static JSON under `/content`, validated by Zod, bundled at build time.

## Stack
React 18, TypeScript (strict), Vite 5, Tailwind 3 (CSS-variable design tokens), Radix primitives (dialog, tooltip,
tabs, switch), Dexie 4 + dexie-react-hooks, Zod 3, Recharts 2, lucide-react icons, Vitest + Testing Library +
fake-indexeddb, Playwright, vite-plugin-pwa (Workbox). Path aliases: `@/` → `src/`, `@content/` → `content/`.

## Directory map
```
content/                  JSON content (manifest, term registry, sources, glossary, questions, lessons, scenarios)
research/                 Saved official outline text + statute/federal excerpts that back "verified" content
scripts/                  validate-content.ts, coverage-report.ts (Node, run with tsx)
src/content/schema.ts     Zod schemas + isEligible()  ← the content contract
src/content/index.ts      `content` repository (indexed, eligibility-filtered) + lessonForQuestion(), termName()
src/content/validate.ts   validation rules shared by scripts & tests
src/lib/                  Pure deterministic engines (unit tested):
  rng.ts                  seeded PRNG, shuffle
  blueprint.ts            allocate() largest-remainder by section weight; assembleExam() unique, reports shortfalls
  scoring.ts              scoreExam(), correctNeeded()
  timer.ts                deadline-based exam timer helpers
  srs.ts                  SM-2 spaced repetition (review(), statusOf(), queueOrder(), ratingFromAnswer())
  mastery.ts              concept mastery, section mastery, estimateExamScore()
  selection.ts            topicQuiz, mixedQuiz, weaknessDrill, rapidFire, trickyQuestions, choiceOrder
  rubric.ts               gradeExplanation() keyword rubric for "Explain your answer"
  medicalCost.ts          computeCosts() deductible/copay/coinsurance/OOP calculator
  planner.ts              buildPlan() study plan
  readiness.ts            whyNotReady(), recommendations()
  dates.ts                localDate(), addDays(), daysBetween()
src/db/db.ts              Dexie schema & row types (settings, attempts, cards, cardReviews, termStatus, lessonProgress,
                          examSessions, practiceSessions, studyLog, plan, scenarioProgress, tutorMessages)
src/db/repo.ts            getSettings/updateSettings, recordAttempt (adds missed concepts to flashcards), addToDeck,
                          reviewCard (SM-2), term status, touchLesson/updateLesson, logStudySeconds, questionHistory, newId
src/db/hooks.ts           useSettings(), useSettingsLoaded(), useStudyTimer(kind)
src/db/learnerModel.ts    buildLearnerModel() / useLearnerModel(): mastery, section stats, estimate, readiness,
                          recommendations, card counts, study time, exam history, confused pairs
src/db/backup.ts          exportData / parseBackup / importData / resetAllData / downloadJson
src/components/ui/        Button(+ButtonLink, buttonClass), Card/CardHeader/CardBody, Badge, Progress, Tabs*, Dialog,
                          Tooltip, Switch, misc.tsx (PageHeader, EmptyState, Kbd, Stat, Select, TextField, Callout,
                          Spinner), Markdown (+TermLink, plainText), Speak (SpeakButton, speak, ttsSupported),
                          Verification (VerificationBadge, SourceList), cn()
src/components/question/QuestionView.tsx
                          QuestionView (choices in shuffled order, A–D labels, 1–4/A–D keys, flag button),
                          ExplanationPanel (correct answer, why, every choice's rationale, memory tip, concept links,
                          lesson link, sources), ConfidencePicker, detectConfusion(), LETTERS
src/app/                  App.tsx (routes, lazy pages, onboarding gate), Shell.tsx (nav, focus mode, shortcuts), nav.ts
src/features/<area>/      Pages. Each route's default export lives here.
```

## Routes (defined in src/app/App.tsx — do not rename the files)
| Route | File |
|---|---|
| `/` | features/dashboard/DashboardPage.tsx |
| `/onboarding` | features/onboarding/OnboardingPage.tsx |
| `/learn`, `/learn/:sectionId`, `/lesson/:lessonId` | features/curriculum/{CurriculumPage,SectionPage,LessonPage}.tsx |
| `/dictionary`, `/dictionary/:termId`, `/dictionary/compare?a=&b=` | features/dictionary/{DictionaryPage,TermPage,ComparePage}.tsx |
| `/flashcards` | features/flashcards/FlashcardsPage.tsx |
| `/practice?mode=&section=`, `/practice/session/:sessionId` | features/practice/{PracticeHome,PracticeSession}.tsx |
| `/exam`, `/exam/:sessionId`, `/exam/:sessionId/results` | features/exam/{ExamHome,ExamSession,ExamResults}.tsx |
| `/review` | features/review/ReviewPage.tsx |
| `/scenarios`, `/scenarios/:scenarioId` | features/scenarios/{ScenariosHome,ScenarioPage}.tsx |
| `/analytics` | features/analytics/AnalyticsPage.tsx |
| `/planner` | features/planner/PlannerPage.tsx |
| `/tutor` | features/tutor/TutorPage.tsx |
| `/content` | features/content/ContentPage.tsx |
| `/settings` | features/settings/SettingsPage.tsx |

Links used across the app (keep them working): `/practice?mode=topic&section=<sid>`, `/practice?mode=weakness`,
`/practice?mode=mixed`, `/dictionary/compare?a=<termId>&b=<termId>`, `/lesson/<lessonId>`, `/learn/<sid>`, `/exam`, `/review`.

## Key rules
- **Only eligible content reaches learners.** Use `content.terms`, `content.questions`, `content.lessons` etc. (already
  filtered). `content.all.*` and `content.drafts` are only for the Content page.
- **Progress keys are stable content ids** (question id, term id, lesson id). Never key progress by array index.
- **Record every answer** with `recordAttempt()` (mode, concepts, difficulty, confidence, responseMs, confusedWith via
  `detectConfusion`). It implements "missed questions link to flashcards" and "guessed answers get re-reviewed".
- **Flashcard schedule changes only through `reviewCard()`** — never on view.
- **Exam simulator**: no feedback during the exam; `deadline` stored as an absolute timestamp; auto-submit on expiry
  (including when the app is reopened after the deadline); every answer persisted immediately so a closed tab can resume.
  Scoring via `scoreExam()`; distribution via `allocate()` + `assembleExam()`; show shortfalls honestly.
- **Study time**: call `useStudyTimer(kind)` on study pages. It is independent study time, never "certified hours".
- Deterministic engines: randomness only via `rngFrom(seed)` / `newSeed()`, seeds stored with sessions.
- **No fake controls.** Every button must work. No "coming soon" pages.
- Accessibility: semantic headings, labels on all inputs/buttons (icon buttons need `aria-label`), visible focus,
  keyboard operable, `aria-live` for feedback, color is never the only signal, respects reduced motion
  (`motion-safe:` utilities or the global CSS rule), works at 320px width.
- Styling: Tailwind with tokens `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `text-fg`, `text-muted`,
  `text-primary`, `bg-primary text-primary-fg`, `text-success|warning|danger|info|accent`. Dark mode and high contrast
  come from CSS variables — do not hardcode colors (Recharts: use `rgb(var(--primary))` strings).
- Each page should add `data-testid` hooks on primary actions used by Playwright tests.
