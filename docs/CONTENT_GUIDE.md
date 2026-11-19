# Content Authoring Guide (NY Insurance Licensing Academy)

This app teaches the **New York Life, Accident & Health Agent/Broker exam (PSI Series 17-55)**.
All learner-facing content is JSON under `/content`, validated by `src/content/schema.ts` (Zod) and
`src/content/validate.ts`. Run the validator after every batch of edits:

```bash
npx tsx scripts/validate-content.ts --section <sectionId>      # e.g. --section lpr
```

A batch is not done until the validator shows **0 errors** for your sections. Warnings about terms "planned in the
registry but not written yet" are fine when another section owns that term.

## 1. Non-negotiable rules

1. **Original content only.** Never copy or paraphrase closely from PSI sample questions, commercial prep courses
   (ExamFX, Kaplan, Xcel, etc.) or any copyrighted question bank. Write every question, example and explanation yourself.
2. **No invented facts.** Do not invent New York rules, dollar limits, day counts, penalties, ages, percentages or dates.
   If you are not certain, either verify it against a primary source (Section 4) or leave the specific out and teach
   the concept. Wrong numbers are worse than missing numbers.
3. **Exactly one best answer.** Every multiple-choice item must have one answer that is clearly best under the stated
   facts. Distractors must be plausible but definitely wrong. Never make an item ambiguous on purpose.
4. **Shuffle-safe choices.** The app shuffles choices. Never use "All of the above", "None of the above",
   "Both A and B", or refer to letters/positions.
5. **Negative wording** (NOT / EXCEPT) must be in CAPITALS and the question tagged `negative-wording`.
6. **Plain English first.** The learner starts with zero insurance knowledge. Define jargon the first time it is used
   and link glossary terms in lessons with `[[term-id]]`.
7. **Stay in your lane.** Edit only the files assigned to you. Do not edit `src/`, the manifest, the registry, or other
   sections' files. If you need a new glossary term in *your* section, you may add it to your glossary file; it will
   show a "not in registry" warning — list such additions in your final report and the lead will register them.

## 2. Verification statuses (field `verification`)

| status | when to use | eligible for practice & exams? |
|---|---|---|
| `verified` | You checked the specific fact against a **primary source** that is saved under `/research` and listed in `sources` (statute text, regulation text, the PSI outline, or an official federal page such as cms.gov / irs.gov / healthcare.gov / ssa.gov). `method` = `statute-text`, `regulation-text`, `official-outline` or `federal-source`. | yes |
| `reviewed` | General, non-jurisdictional insurance principle (e.g. what an aleatory contract is, how coinsurance works). `method` = `general-principle`, `sources` usually `["general-insurance-principles"]`. You must have self-reviewed it carefully. | yes |
| `draft` | Anything you could not verify, or that you are unsure about. | **no** (hidden from learners, listed for review) |

Hard rule enforced by the validator: if `nySpecific: true` **or** `timeSensitive: true`, the status must be
`verified` (with at least one source) or `draft`. Never `reviewed`.

- `nySpecific: true` — the item depends on New York law/regulation (Insurance Law sections, DFS regulations, NY programs
  such as the NY Disability Benefits Law, Child Health Plus, Healthy NY, NY LTC Partnership, NY continuation).
  Questions with `nySpecific: true` must also carry the `ny-law` tag.
- `timeSensitive: true` — the item depends on a figure that changes over time (Medicare deductibles/premiums, IRS
  contribution limits, ACA percentages, CE hours, fees). Requires `reviewDue` (use one year from `checkedOn`).
  **Prefer to avoid annually indexed dollar figures entirely** — test the concept, not this year's number.
- Use `checkedOn` / `lastReviewed` = today's date: **2026-11-19**.

## 3. Network and safety rules for research

- Use **only** the `mcp__firecrawl__firecrawl_scrape` tool for web research (single URLs, `formats: ["markdown"]`,
  `onlyMainContent: true`). Do **not** use curl/wget/WebFetch, crawl, map or batch tools. Keep it to **≤ 25 page
  fetches per agent**, one at a time. (This server's IP was previously flagged for bulk crawling — never crawl.)
- Good primary sources:
  - NY Insurance Law: `https://www.nysenate.gov/legislation/laws/ISC/<section>` e.g. `.../ISC/3216`, `.../ISC/2103`.
  - NY Workers' Comp Law / Disability Benefits: `https://www.nysenate.gov/legislation/laws/WKC/<section>`.
  - NY regulations (11 NYCRR / 23 NYCRR): DFS pages under `https://www.dfs.ny.gov/industry_guidance/regulations/...`
    or `https://govt.westlaw.com/nycrr/...` (may or may not scrape; if it fails, mark dependent items `draft`).
  - Federal: medicare.gov, cms.gov, ssa.gov, irs.gov, healthcare.gov, dol.gov, ecfr.gov, law.cornell.edu (U.S. Code).
- For every primary source you rely on, **save a short excerpt file** under `research/statutes/` (state law/regs) or
  `research/federal/` with: source URL, revision date shown on the page (if any), retrieval date, and the verbatim
  sentences you relied on. Then add a source entry to your batch's source file `content/sources/<batch-name>.json`
  (format below) with `localCopy` pointing to that excerpt. `research/statutes/ISC-3203.md` is an example; source
  id `ny-isc-3203` already exists — reuse it, don't duplicate.

Source entry format (`content/sources/<batch>.json` → `{ "sources": [ ... ] }`):

```json
{ "id": "ny-isc-3216", "title": "NY Insurance Law § 3216 — Individual accident and health insurance policy provisions",
  "publisher": "New York State Senate Open Legislation", "url": "https://www.nysenate.gov/legislation/laws/ISC/3216",
  "kind": "statute", "citation": "N.Y. Ins. Law § 3216", "retrievedOn": "2026-11-19",
  "localCopy": "research/statutes/ISC-3216.md" }
```

Source ids: kebab-case, globally unique, prefix `ny-isc-` (Insurance Law), `ny-wkc-` (Workers' Comp Law),
`ny-11nycrr-` / `ny-reg-` (regulations), `fed-` (federal).

## 4. Files you write (per section `<sid>`)

- `content/glossary/<sid>.json` → `{ "sectionId": "<sid>", "terms": [...], "comparisons": [...] }`
- `content/questions/<sid>.json` → `{ "sectionId": "<sid>", "questions": [...] }`
- `content/lessons/<sid>.json` → `{ "sectionId": "<sid>", "lessons": [...] }`
- optional scenario file(s) under `content/scenarios/` if assigned.
- Large sections may be split across several files with the same shape: `content/questions/<sid>-1.json`,
  `content/questions/<sid>-2.json`, … (same for glossary/lessons). Keep each file under ~30 records so each write is manageable.

**Outline ids** come from `content/manifest/exam-17-55.json` (human-readable tree:
`research/official/series-17-55-outline-tree.txt`). Use the most specific node id that applies (e.g. `lpr.1.6` for the
life grace period). **Term ids** come from `content/manifest/term-registry.json`; write every term your section owns.
You may reference any registry term id from any section in `related`, `confusedWith`, `concepts`, `keyTerms`, `[[links]]`.

### 4.1 Glossary term (all fields required unless marked optional)

```json
{
  "id": "aleatory-contract",
  "term": "Aleatory Contract",
  "aliases": [],
  "sectionId": "gen",
  "outlineIds": ["gen.4.2.2"],
  "formal": "A contract in which the values exchanged are unequal and performance by one party depends on an uncertain future event.",
  "plain": "You might pay a little in premium and receive a lot in benefits, or pay premiums for years and receive nothing — it depends on whether a covered loss happens.",
  "simpler": "Like buying a ticket where the outcome depends on chance: what each side ends up giving is unequal and unknown in advance.",
  "examples": [
    "Maria pays one monthly premium on a new term policy and dies in an accident the next week; her beneficiary receives the full face amount.",
    "Tom pays premiums on a 20-year term policy and outlives the term; the insurer never pays a death claim."
  ],
  "examTip": "Exam questions describe an 'unequal exchange of value' or 'dependent on chance' — that is aleatory. Don't confuse it with adhesion (one party drafts the contract).",
  "misconception": "Aleatory does not mean the contract is unfair or a gamble that is illegal; it only describes the unequal, chance-dependent exchange.",
  "related": ["contract-of-adhesion", "conditional-contract", "consideration"],
  "confusedWith": ["contract-of-adhesion"],
  "pronunciation": "AY-lee-uh-tor-ee",
  "difficulty": 2,
  "practice": {
    "prompt": "Which contract characteristic describes an unequal exchange of value that depends on an uncertain event?",
    "choices": ["Aleatory", "Adhesion", "Unilateral", "Personal"],
    "answerIndex": 0,
    "explanation": "Aleatory contracts involve an unequal exchange based on chance. Adhesion = one party drafts the terms; unilateral = only the insurer makes a legally enforceable promise; personal = the contract is between the insurer and a specific individual."
  },
  "sources": ["general-insurance-principles"],
  "nySpecific": false,
  "timeSensitive": false,
  "verification": { "status": "reviewed", "method": "general-principle", "checkedOn": "2026-11-19" }
}
```

Comparisons (Term Comparison Mode) — add 2–6 per section for frequently confused pairs:

```json
{ "a": "coinsurance", "b": "copayment",
  "keyDifference": "Coinsurance is a percentage split of covered costs; a copayment is a flat dollar amount per service.",
  "rows": [ { "aspect": "Form", "a": "Percentage (e.g. 80/20)", "b": "Flat dollar amount" },
            { "aspect": "Typical plan", "a": "Major medical / indemnity", "b": "HMO office visits, prescriptions" } ],
  "memoryTip": "CO-insurance = perCentage; CO-pay = fixed Pay." }
```

### 4.2 Question

```json
{
  "id": "lpr-q001",
  "series": ["17-55"],
  "sectionId": "lpr",
  "outlineIds": ["lpr.1.6"],
  "concepts": ["grace-period"],
  "difficulty": 2,
  "style": "scenario",
  "tags": ["ny-law"],
  "scenario": "Dana owns a New York whole life policy with a fixed annual premium due March 1. She has not paid it, and she dies on March 20.",
  "stem": "How will the insurer most likely handle the death claim?",
  "choices": [
    { "id": "a", "text": "Pay the death benefit minus the unpaid premium", "rationale": "Correct: the death occurred within the 31-day grace period, so the policy was still in force; the insurer may deduct the unpaid premium from the proceeds." },
    { "id": "b", "text": "Deny the claim because the premium was unpaid", "rationale": "Incorrect: during the grace period the policy remains in full force." },
    { "id": "c", "text": "Pay only the cash surrender value", "rationale": "Incorrect: cash surrender value is a nonforfeiture concept; it is not the death benefit owed during the grace period." },
    { "id": "d", "text": "Pay the full death benefit plus a refund of the last premium paid", "rationale": "Incorrect: the unpaid premium may be deducted; there is no refund of an earlier premium." }
  ],
  "correct": "a",
  "explanation": "NY Insurance Law § 3203(a)(1) gives fixed-premium life policies a 31-day grace period (or one month) during which the policy continues in force, and § 3203(a)(2) lets the insurer deduct the unpaid premium from the proceeds if death occurs during the grace period.",
  "memoryTip": "Grace = still covered, but the bill is subtracted from the check.",
  "rubric": { "keyPoints": [
    { "label": "Death occurred within the grace period", "anyOf": ["grace", "31 day", "31-day", "one month"] },
    { "label": "Policy remains in force", "anyOf": ["in force", "still covered", "remains"] },
    { "label": "Unpaid premium is deducted", "anyOf": ["deduct", "subtract", "minus"] } ] },
  "version": 1,
  "lastReviewed": "2026-11-19",
  "sources": ["ny-isc-3203"],
  "nySpecific": true,
  "timeSensitive": false,
  "verification": { "status": "verified", "method": "statute-text", "checkedOn": "2026-11-19" }
}
```

Question mix for each section (aim, not exact): difficulty ≈ 30% level 1 / 45% level 2 / 25% level 3;
≥ 25% `scenario`/`application`; ≈ 10% `negative` (NOT/EXCEPT); some `comparison`; tag ≈ 20% as `rapid` (short
terminology recall, stem ≤ 120 chars) and ≈ 20% as `tricky` (subtle distinctions, plausible distractors — still one
clearly best answer); add a `rubric` to ≥ 25% of questions (scenario/tricky ones first). Balance the correct letter
across a/b/c/d. Every rationale explains *why* that choice is right or wrong. `explanation` teaches the concept;
`memoryTip` is one short memorable line. `calculation` items must show the arithmetic in the explanation.

### 4.3 Lesson

Each lesson covers a coherent group of outline nodes. Across a section's lessons, **every outline node of the section
must appear in some lesson's `outlineIds`** (listing a parent counts for its children only if the lesson actually
teaches the children). Target 15–35 minutes per lesson.

```json
{
  "id": "lpr-l01", "sectionId": "lpr", "order": 1,
  "title": "Required Policy Provisions: The Rules Built Into Every Life Policy",
  "outlineIds": ["lpr.1", "lpr.1.1", "lpr.1.2", "lpr.1.3"],
  "estMinutes": 25,
  "intro": "Short motivating paragraph in plain English.",
  "objectives": ["Explain ...", "Distinguish ..."],
  "keyTerms": ["grace-period", "reinstatement"],
  "parts": [
    {
      "heading": "What a grace period is",
      "body": "Paragraphs separated by a blank line.\n\n- bullet\n- bullet\n\nUse **bold** for key ideas and link terms like [[grace-period]] or [[free-look|the free look]].",
      "simple": "Optional: same essential facts in simpler words (Teach Me Like I'm New mode).",
      "advanced": "Optional: deeper detail shown in a collapsible panel.",
      "example": { "title": "Example: Dana's late premium", "body": "..." },
      "callouts": [
        { "kind": "ny-rule", "text": "NY: 31-day grace period for fixed-premium life policies (61 days for flexible-premium policies, measured from when the insurer determines the cash value is insufficient).", "sources": ["ny-isc-3203"] },
        { "kind": "exam-trap", "text": "..." },
        { "kind": "memory-tip", "text": "..." }
      ]
    }
  ],
  "activity": { "type": "match", "prompt": "Match each provision to what it does.", "pairs": [ {"left": "Grace period", "right": "Keeps the policy in force while a late premium is paid"}, {"left": "...", "right": "..."}, {"left": "...", "right": "..."} ] },
  "knowledgeChecks": [ { "prompt": "...", "choices": ["...", "...", "...", "..."], "answerIndex": 1, "explanation": "..." } ],
  "summary": ["...", "...", "..."],
  "related": ["lpr-l02"],
  "sources": ["ny-isc-3203"],
  "nySpecific": true, "timeSensitive": false,
  "verification": { "status": "verified", "method": "statute-text", "checkedOn": "2026-11-19" }
}
```

Activity types: `match` (3–8 pairs, unique right sides), `categorize` (2–4 categories, 4–12 items; each item's
`category` must exactly equal one category string), `sequence` (3–8 steps listed **in the correct order**; the app
shuffles), `truefalse` (3–8 statements with explanations). Knowledge checks: 2–5 inline MCQs (4 choices, `answerIndex`).

A lesson containing NY-specific rules must be `nySpecific: true` and therefore `verified` (with sources) or `draft`.
If a lesson is mostly general but has one NY fact you could verify, keep it `verified` with that source. If you
could not verify an NY fact, remove the specific number and describe the concept, or mark the lesson `draft`.

## 5. Writing style

- Second person, friendly, precise. Short paragraphs. American English.
- Use consistent terminology: policyowner, insured, beneficiary, insurer, producer, premium, coinsurance, copayment,
  noncancelable, incontestable, preexisting, per stirpes, stranger-originated life insurance (STOLI).
- Examples use fictional people and round numbers. Calculations must be arithmetically correct.
- Say "New York law requires…" only when verified; otherwise "Policies commonly…" / "Generally…".

## 6. Expansion batches (growing the bank toward 800+)

- Write **new files only**: `content/questions/<sid>-x1.json`, `<sid>-x2.json`, … Never edit existing question files.
- New ids start at `<sid>-q201` (the `-cov` files use q101+). Run `npx tsx scripts/question-gaps.ts <sid>` to see the
  highest existing number and which outline topics have the fewest questions — prioritise topics with 0–1 direct
  questions and high-yield exam topics, rather than adding more items to topics that are already well covered.
- Each new item must test something not already tested in the same way. Before writing, skim the existing questions
  for the topic; the validator rejects near-duplicates within a section.
- Keep the correct choice no longer than ~1.15× the longest distractor (the validator warns above 1.25×).
- Keep the mix: ≥ 30% scenario/application, some NOT/EXCEPT, some comparison, calculation where natural; rubric on
  scenario/tricky items; difficulty ≈ 30/45/25.

## 7. Personal Lines track (Series 17-54)

A second track, **New York Personal Lines Insurance Agent/Broker (PSI Series 17-54)**: 100 questions, 2 hours, 70% to pass,
40-hour pre-licensing course. Manifest: `content/manifest/exam-17-54.json` (7 sections, 336 outline nodes); readable tree:
`research/official/series-17-54-outline-tree.txt`; weights from the same PSI bulletin (updated 4/28/2023).

| Section id | Name | Weight | Questions per 100-question exam |
|---|---|---:|---:|
| `plreg` | Insurance Regulation | 10% | 10 |
| `plgen` | General Insurance | 10% | 10 |
| `plpc` | Property and Casualty Insurance Basics | 17% | 17 |
| `pldwl` | Dwelling (2014) Policy | 8% | 8 |
| `plho` | Homeowners (2011) Policy | 24% | 24 |
| `plauto` | Auto Insurance | 24% | 24 |
| `ploth` | Other Coverages and Options | 7% | 7 |

- Everything in sections 1–6 above applies unchanged. Section ids, outline ids (`plho.4.1`), question ids (`plho-q001`),
  lesson ids (`plho-l01`) and file names (`content/questions/plho.json`, `plho-1.json`, …) use the PL section ids.
  Validate with `npx tsx scripts/validate-content.ts --section plho`.
- `series` on questions = `["17-54"]`. Registry terms owned by a PL section are written by that section's author.
- **Reusing Life/A&H terms.** `plreg` and `plgen` have no terms of their own: they reuse the existing `reg` and `gen`
  glossary terms (these appear in the Personal Lines dictionary too). Reference any existing term id in `concepts`,
  `keyTerms`, `related` and `[[links]]`. P&C meanings of words that also exist in health (deductible, coinsurance)
  have their own PL term ids (`policy-deductible`, `property-coinsurance-clause`) — never reuse a health term
  for a P&C meaning, and keep the P&C name distinct (the validator rejects duplicate term names).
- **Questions for `plreg`/`plgen`** must still be new: write them from the Personal Lines point of view (auto/home examples,
  P&C agents and brokers, P&C rebating, binders, redlining, unfair claim settlement, agency law with P&C examples).
- **Policy forms are copyrighted.** The outline names ISO/NY forms (HO 00 03, DP 00 03, PP 00 01, endorsement numbers).
  Teach what the coverages do **in your own words**; never copy or closely paraphrase form wording, and do not
  quote ISO text. Describing general coverage concepts (Coverage A = the dwelling, special form = open perils, etc.)
  is general industry knowledge (`reviewed`). **A statement is `nySpecific` — and therefore needs a statute/regulation
  source — when it is a New York rule** (no-fault/PIP, minimum liability limits, UM/SUM, cancellation and nonrenewal
  notice rules, FAIR Plan, MVAIC, assigned risk plan, financial responsibility/proof of insurance, mandatory inspection,
  choice of repair shop, redlining, excess lines, NY endorsement requirements). Anything NY-specific you cannot verify:
  teach the concept without the specific figure, or mark `draft`.
- **Primary sources:** NY Insurance Law (nysenate.gov `ISC/<section>`: 3420, 3425, 3426, 3429, 3430, 3433, 5101–5108,
  5201–5225, 5301–5304, 5401–5412, 2105, 2610, 501–504…), NY Vehicle & Traffic Law (`VAT/<section>`: 311, 313, 333,
  Art. 44-B), DFS regulations (11 NYCRR 65 = Reg 68 no-fault; Part 60 = Reg 35-A; Part 67 = Reg 79; Reg 90 Part 218;
  Reg 41 Part 27), FEMA/NFIP pages (fema.gov, floodsmart.gov, 42 USC 4001+). Source id prefixes: `ny-isc-`, `ny-vat-`,
  `ny-11nycrr-`, `fed-`. **Avoid annually adjusted figures**; if a statutory dollar limit is essential, verify it and
  mark `timeSensitive` with a `reviewDue`.
- Questions use realistic personal-lines scenarios (a fire, a collision, a covered/uncovered loss, who is an insured,
  which coverage responds, what the insurer pays) with simple arithmetic where natural (deductibles, limits,
  coinsurance penalty, pro rata vs short rate returns, split limits, replacement cost vs ACV, other-insurance
  proration). Show the arithmetic in the explanation and keep it correct.
