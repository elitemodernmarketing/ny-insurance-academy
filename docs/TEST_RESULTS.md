# Test Results

Executed on 2026-11-19 (re-run after the question-bank expansion to 838 eligible questions) on the build in this folder (Linux, Node 20.20, Chromium build 1208 via Playwright 1.58.2).
Every number below comes from an actual run; nothing is estimated.

## Summary

| Suite | Command | Result |
|---|---|---|
| Content validation | `npx tsx scripts/validate-content.ts` | **0 errors, 0 warnings** — 565 terms (562 eligible), 1,230 questions (1,225 eligible), 100 lessons, 183 sources, both tracks |
| Outline coverage | `npx tsx scripts/coverage-report.ts` | **Life/A&H: 620/620 topics complete. Personal Lines: 327/336 complete, 9 partial (taught, not yet tested), 0 gaps.** A full exam can be assembled in both tracks |
| Type check | `npx tsc -b` | **No errors** |
| Unit + integration | `npx vitest run` | **26 files, 244 passed, 1 skipped** |
| Browser acceptance | `npx playwright test` | **13 passed, 0 failed** (production build + service worker) |

The one skipped unit test (`ExamHome … shortfall`) runs only when some section has fewer questions than the blueprint
needs. Every section now has enough, so it is skipped by design. Shortfall handling is still covered by
`src/lib/blueprint.test.ts` ("reports shortfalls instead of duplicating") and the exam service tests.

## What the unit/integration tests cover

| Area | Tests |
|---|---|
| Quiz scoring & passing threshold | `src/lib/scoring.test.ts`: 105/150 = 70.0% passes, 104/150 = 69.3% fails; unanswered counts as incorrect; per-section breakdown; 85% target |
| Timers | `scoring.test.ts`: 150-minute deadline, remaining time, expiry, clock formatting, time-used cap; exam auto-submit in `src/features/exam` tests |
| Spaced repetition | `src/lib/srs.test.ts`: SM-2 intervals 1 → 6 → round(6×EF), ease formula and 1.3 floor, lapses, maturity at 21 days, determinism, queue order, guessed answers re-scheduled |
| Answer shuffling | `src/lib/misc.test.ts`: permutation, deterministic per seed, roughly uniform position of the correct answer over 4,000 shuffles |
| Question selection & subject weights | `src/lib/blueprint.test.ts`: (also 17-54: 100 items allocate exactly to the published weights) official weights sum to 100; 150 items allocated exactly (floor/ceil of each share; 10% → 15, 8% → 12, 2% → 3); the 3 half-items rotate by seed; 25/50/100 sizes; unique assembly; shortfall reporting; least-exposed preference. `misc.test.ts`: topic, mixed, weakness drill, rapid fire, tricky |
| Mastery / adaptive engine | `src/lib/mastery.test.ts`, `src/lib/planner.test.ts` (readiness and recommendations) |
| Study progress persistence & session restoration | `src/db/db.test.ts`: missed questions add flashcards; guessed answers re-scheduled; settings/lessons/study-log persistence. Practice and exam service tests: resume from the saved row, auto-submit after the deadline |
| Import / export | `src/db/db.test.ts`: exact round-trip of every table, rejection of invalid or foreign files, merge mode |
| Curriculum coverage & content integrity | `src/content/content.test.ts`: real content has 0 validation errors, meets the ≥200 term / ≥300 question minimums, every question has exactly one key, a full exam can be assembled, every section has lessons |
| Duplicate detection | `content.test.ts`: near-duplicate and identical stems flagged; banned choices; NY content must be verified; unknown ids/sources caught |
| Calculation simulator | `misc.test.ts`: deductible → coinsurance → out-of-pocket cap math, deductible carry-over, copays, insurer pays 100% after the OOP max is reached |
| UI components | Curriculum (activities, lesson gating), dictionary (search ranking, term page), flashcards (typed-answer matching, rating), practice, exam, review, scenarios, analytics, planner, tutor retrieval |

## Browser acceptance tests (Playwright)

| # | Flow | Spec | Result |
|---|---|---|---|
| 1 | First launch → onboarding → 12-question diagnostic → dashboard; onboarding not forced again | `01-onboarding.spec.ts` | ✓ |
| 2 | Complete a lesson (read all parts, answer knowledge checks, mark complete, revisit shows completed) | `02-lesson.spec.ts` | ✓ |
| 3 | Study glossary terms (search, simpler explanation, another example, test, add to flashcards, mark difficult, compare) | `03-glossary.spec.ts` | ✓ |
| 4 | Review flashcards (add 3, flip, rate Good, session summary) | `04-flashcards.spec.ts` | ✓ |
| 5 | Topic quiz (10 questions, full explanation after each, final score) | `05-topic-quiz.spec.ts` | ✓ |
| 6 | Full 150-question mock exam (timer at 2:30:00, no feedback, flag, keyboard answering, navigator, review screen showing 30 unanswered and 1 flagged, submit, results, section breakdown) | `06-full-exam.spec.ts` | ✓ |
| 7 | Review incorrect answers (results filter + expanded explanation; Weakness Review page) | `06-full-exam.spec.ts` | ✓ |
| 8 | Close and reopen the app (theme + flashcards persist in a new tab) | `08-persistence-offline.spec.ts` | ✓ |
| 9 | Resume saved progress (interrupted exam resumes with answers and the same deadline) and auto-submit when time expires (simulated clock) | `09-resume-exam.spec.ts` | ✓ ✓ |
| 10 | Offline mode (service worker; reload offline; dashboard, dictionary, curriculum, practice, exam all work) | `08-persistence-offline.spec.ts` | ✓ |
| — | Export/import backup round-trip through the UI | `08-persistence-offline.spec.ts` | ✓ |
| — | Switch to Personal Lines (17-54), see its 7 sections, start its 100-question / 2-hour exam, switch back; the 17-54 exam is not offered under 17-55 | `10-track-switch.spec.ts` | ✓ |
| — | Responsive navigation on a phone viewport (Pixel 7), no horizontal overflow | `08-persistence-offline.spec.ts` | ✓ |

The HTML report is written to `test-results/e2e-report/`.
