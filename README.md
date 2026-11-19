# NY Insurance Licensing Academy

A personal, offline study app for two New York licensing exams, switchable in Settings:

* **Life, Accident & Health Agent/Broker (PSI Series 17-55)** — 150 questions · 150 minutes · 70% to pass
* **Personal Lines Agent/Broker (PSI Series 17-54)** — 100 questions · 120 minutes · 70% to pass

It combines an interactive textbook, a 562-term insurance dictionary and an original practice bank of 1,225 questions (838 Life/A&H + 386 Personal Lines), spaced-repetition flashcards, seven practice
modes, a realistic timed exam simulator, interactive scenarios, adaptive weakness review, analytics and a study planner.
Everything runs on your own computer: no account, no subscription, no cloud, no paid AI.

> **Important.** New York requires a 40-hour DFS-approved pre-licensing course (or an exemption) before the 17-55 exam.
> This app is independent study. It does **not** issue a School Certificate and its study timer is **not** approved
> course credit. Practice scores help you find gaps; they cannot predict or guarantee an exam result.

---

## Run it on Windows

1. Install **Node.js 20 LTS or newer** from <https://nodejs.org/> (default options).
2. Copy this whole folder to your PC (for example `C:\Study\ny-insurance-academy`).
3. Double-click **`start-windows.bat`**. The first run installs dependencies (a few minutes, needs internet once);
   it then builds the app and opens <http://localhost:4173> in your browser. Keep the window open while studying.

Manual equivalent (PowerShell or Command Prompt in the folder):

```bash
npm install          # first time only
npm run app          # build + serve at http://localhost:4173 and open the browser
```

macOS/Linux: `./start.sh`.

### Install as an app & use offline
In Chrome or Edge, open <http://localhost:4173> and click the **Install** icon in the address bar
(or menu → *Install NY Insurance Academy*). After the first load the whole app — including all lessons,
questions and the dictionary — is cached by a service worker and works with no internet connection.

> Your progress is stored in the browser's IndexedDB **for that address**. Always use the same address
> (`http://localhost:4173`, the default in the scripts) so the app finds your data. Use **Settings → Export backup**
> regularly; a backup can be imported in any browser or on another computer.

### Development
```bash
npm run dev            # hot-reloading dev server at http://localhost:5173
npm test               # unit + integration tests (Vitest)
npm run test:e2e       # browser acceptance tests (Playwright; builds the app first)
npm run content:validate   # validate all content (schema, links, duplicates, verification rules)
npm run content:coverage   # regenerate docs/COVERAGE.md
npm run typecheck
```
Playwright needs a Chromium build: `npx playwright install chromium` (one-time) if it reports a missing browser.

---

## What's inside

| Area | Highlights |
|---|---|
| **Dashboard** | Today's minutes vs goal, streak, due cards, estimated score, recommendations *with reasons*, resume exam/practice, today's plan. |
| **Learning Curriculum** | All 18 official sections with weights and the official outline tree. 74 lessons: intro, objectives, key terms, plain-English parts, examples, NY-rule/exam-trap/memory-tip callouts, "Go deeper" panels, an interactive activity (match / categorize / sequence / true-false), knowledge checks, summary, mini flashcard review, end-of-lesson quiz. **Teach Me Like I'm New** mode. Read-aloud. |
| **Insurance Dictionary** | 412 terms: formal + plain-English + simpler explanation, multiple examples, exam tip, common misunderstanding, related terms, outline classification, sources and verification badge, practice question, flashcard add, difficult flag, confidence rating, mastery status, pronunciation. **Term Comparison Mode** with 60+ curated side-by-side comparisons. |
| **Flashcards** | SM-2 spaced repetition (deterministic, unit-tested). Term→Definition, Definition→Term, Scenario→Concept, multiple-choice, type-the-answer. Daily queue, hardest-first, filters, flip animation, keyboard (Space, 1–4). Missed questions add their concepts automatically; guessed answers are re-scheduled. Viewing never counts as mastering. |
| **Practice** | A Learn & Answer · B Topic Quiz · C Mixed (blueprint-weighted) · D Weakness Drill (shows why each question was chosen) · E Rapid Fire · F Tricky Questions · G Explain Your Answer (keyword rubric, no AI needed). Full explanations: why the answer is right, why each other choice is wrong, concept links, lesson link, memory tip, sources. Sessions resume after closing. |
| **Mock Examinations** | Full exam: 150 unique questions allocated by the official section weights, 150-minute countdown, no feedback, flag, navigator, review-before-submit, auto-submit at 0:00, resume after closing. Custom 25/50/100-question practice exams (clearly labelled unofficial). Results: score, correct/incorrect/unanswered, pass/fail vs 70% and your 85% target, time used, time per question, section breakdown, study links, follow-up quizzes, full answer review. Reports a bank shortfall instead of repeating questions. |
| **Scenario Simulator** | Selecting life insurance (client profiles), deductible/coinsurance/out-of-pocket calculator with itemized math, beneficiary outcomes (per stirpes / per capita / common disaster), policy timeline (grace period, lapse, reinstatement), NY compliance cases, terminology challenge. |
| **Weakness Review** | Every question you last got wrong with explanations, weakest concepts, confused term pairs, one-click drills. |
| **Learning Analytics** | KPIs, daily/weekly study time, accuracy trend, exam history vs 70%/target lines, section performance, topic mastery heatmap, strongest/weakest topics, **Why Am I Not Ready?**, and the four separate measures: curriculum completed vs concepts mastered vs independent study hours vs actual passing performance. Explains exactly how mastery is calculated. |
| **Study Planner** | Exam date, study days, minutes/day, prior knowledge → day-by-day plan of lessons, flashcards, quizzes and mock exams, calendar, milestones, missed-study recovery (rebuild from today). No Google Calendar needed. |
| **AI Tutor (optional)** | Works without any AI: retrieves and cites validated glossary/lesson content. Optional local LLM via **Ollama** (never required, never edits content; answers labelled "AI-generated — not verified"). |
| **Content & Coverage** | Coverage of every official outline topic, bank sufficiency per section, source registry, drafts excluded from learners. |
| **Settings** | Track switcher (Life/A&H 17-55 or Personal Lines 17-54; progress is kept separately per track), theme (light/dark/system), high contrast, text size, reduced motion, focus mode, text-to-speech, practice target, export/import/reset. |

Keyboard: `?` shows shortcuts; `g` then a letter navigates (e.g. `g f` flashcards); `1–4`/`A–D` answer; `←/→` move in exams.

### Optional: local AI tutor with Ollama
1. Install Ollama (<https://ollama.com>), then `ollama pull llama3.1` (or another model).
2. Allow the app's origin: set the environment variable `OLLAMA_ORIGINS=http://localhost:4173` and restart Ollama.
3. In the app: **AI Tutor → enable**, URL `http://localhost:11434`, model name, *Test connection*.

---

## Content, sources and verification

* Curriculum source: **PSI New York Insurance Candidate Information Bulletin, "Updated 4/28/2023"** (Series 17-55 outline
  and section weights). On 2026-11-19 both PSI bulletin links (IDs 7208 and 7228) served the identical PDF; no newer New
  York edition was found. The outline was parsed into `content/manifest/exam-17-55.json` (18 sections, 620 topics,
  weights summing to 100%) — see `docs/CURRICULUM.md`.
* Every learner-visible record carries `sources`, `verification` (status, method, date) and flags for New York-specific
  and time-sensitive content. **New York law and time-sensitive figures are shown only when verified against a saved
  primary-source excerpt** (`research/statutes/`, `research/federal/`). General insurance principles are marked
  *reviewed*. Anything else stays *draft* and is hidden (listed on the Content page).
* All questions, examples and explanations are original. No PSI or commercial question bank content is used.
* Coverage: `docs/COVERAGE.md` (generated). Verification notes and open questions: `docs/VERIFICATION.md`.
* Authoring rules: `docs/CONTENT_GUIDE.md`. Architecture: `docs/ARCHITECTURE.md`.

## Project layout
```
content/          JSON content (manifest, term registry, glossary, questions, lessons, scenarios, sources)
research/         Official outline text + statute/regulation/federal excerpts backing verified content
src/lib/          Deterministic engines (blueprint, scoring, timer, SM-2, mastery, selection, planner, readiness, calculators)
src/db/           IndexedDB (Dexie) schema, repository, learner model, backup
src/features/     Pages
scripts/          validate-content, coverage-report, make-icons, screenshots
tests/e2e/        Playwright acceptance tests
docs/             Architecture, content guide, curriculum, coverage, verification, test results
```

## Tracks: Life/A&H (17-55) and Personal Lines (17-54)
Switch tracks in **Settings → Learning track** (the app reloads on the other track). Each track has its own official
outline and weights (`content/manifest/exam-17-55.json`, `exam-17-54.json`), exam shape, lessons, glossary, questions,
scenarios and coverage report (`docs/COVERAGE.md`, `docs/COVERAGE-17-54.md`). Progress is keyed by content ids and tagged
by track, so switching never mixes or loses progress. Personal Lines: 7 official sections (Regulation 10%, General Insurance
10%, P&C Basics 17%, Dwelling 8%, Homeowners 24%, Auto 24%, Other Coverages 7%), 26 lessons, 150 glossary terms plus the
shared general-insurance/regulation terms, 386 questions, 8 compliance scenarios. Auto-insurance content is heavily New
York no-fault/uninsured-motorist law and is verified against saved statute excerpts. ISO policy-form wording is copyrighted,
so policy coverages are explained in original words.

## Hosting (herisnor.com/fa)
Live at **https://herisnor.com/fa/** (static files in `/home/herisnor/public_html/fa`, served by nginx). Redeploy after any
change with `scripts/deploy-herisnor.sh` (builds with `VITE_BASE=/fa/`, copies, then runs a browser smoke test). The app is
a sub-path build, so it is a separate install from `http://localhost:4173` and keeps its own progress — export from one,
import into the other via Settings if you want to move progress. The nginx block for `/fa/` (SPA fallback + caching) lives in
`/etc/nginx/sites-enabled/herisnor.com.conf`; Virtualmin may regenerate that file, in which case re-add the three `location`
blocks marked "NY Insurance Licensing Academy" (a backup of the pre-change file is in `/etc/nginx/sites-available/*-enabled-pre-fa`).
