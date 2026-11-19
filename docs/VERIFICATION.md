# Verification Record

How the content was researched, verified and reviewed, and the decisions taken on ambiguous points.
Last updated 2026-11-19 (after the question-bank expansion).

## 1. Official curriculum (Phase 1)

| Check | Result |
|---|---|
| PSI NY bulletin `api/content/bulletin/7208` | PDF, 80 pages, "Copyright © 2023 … Updated 4/28/2023", sha256 `2cf26319…df4df` |
| Newer edition? | A web search surfaced bulletin `7228`; it is byte-identical to 7208. Bulletin `7286` is Pennsylvania's (2026). No newer NY edition found. |
| DFS prelicensing criteria | Retrieved (direct requests returned 403, so retrieval was via Firecrawl). Course Standards: Life/A&H Agent (combined) — 40 minimum approvable hours. |
| DFS Agents & Brokers page | Retrieved; confirms PSI as exam vendor and 15 CE credits for renewal after 2 years. |
| Exam format | 150 items, 2.5 hours, 70% to pass, 5–10 unscored experimental items (bulletin pp. 12, 17, 23). |
| Outline | 18 sections, weights sum to 100%, 620 outline nodes; token-for-token check against the bulletin text. See `docs/CURRICULUM.md`. |

Saved copies: `research/official/`.

## 2. Verification policy (enforced by `src/content/validate.ts`)

* `verified` — checked against a **saved primary-source excerpt** (`research/statutes/*`, `research/federal/*`) listed in
  `content/sources/*.json`. Methods: statute-text, regulation-text, official-outline, federal-source.
* `reviewed` — a general insurance principle (not New York law, not a changing figure), self-reviewed by the author and
  passed through the automated checks and the consistency review.
* `draft` — not shown to learners.
* New York-specific or time-sensitive records **cannot** be `reviewed`; they must be `verified` with sources or stay `draft`.
* Time-sensitive records carry `reviewDue`; the Content page flags them once overdue.

Research was limited to single-page fetches through Firecrawl (no crawling from this server; ≤ 25 fetches per author).
Primary-source excerpts are saved under `research/statutes/` and `research/federal/` and registered as 131 sources.

## 3. Content totals (eligible = shown to learners)

See the generated counts in `docs/COVERAGE.md` and `docs/TEST_RESULTS.md`. After the expansion batch: 838 eligible questions — 474 (57%) `verified` against primary sources and 364 `reviewed` general principles. Drafts hidden from learners: `ahb-q023` (small-group conflict), `ann-q217` (accurate but beyond exam scope), `sen-q212` (key needs re-verification, see §4) and the glossary term `viatical-settlement`. Previously drafted items promoted after their sources were retrieved: `tax-q013`, `tax-q014`, `tax-l03` (26 USC 72), `aca-q012` (NY Public Health Law § 268-b), `nonpublic-personal-information` (11 NYCRR 420.3) and `fair-credit-reporting-act` (15 USC 1681d).

## 4. Decisions on ambiguous or conflicting facts

| Topic | Finding | Decision |
|---|---|---|
| **Small group size** | Ins. Law §§ 3231(a)(1)/4317(a)(1): 1–100 employees for policies issued/renewed on or after 1/1/2016. The outline cites Reg 145 (11 NYCRR 360.2(f)), which still says 2–50. | Teach the current statute (1–100) and point out the older regulation wording. The one question that depends on the conflict (`ahb-q023`) stays `draft`. |
| **Rebating** | The outline cites § 2324, but § 2324(e) excludes life/A&H policies governed by § 4224. | Teach rebating for life/A&H under § 4224 (verified), and mention § 2324 for other lines. |
| **Temporary license** | § 2109 allows temporary licenses only to continue a deceased, disabled or military-service producer's business (90-day terms, max 15 months, **no new sales**). Prep courses often describe "trainee" temporary licenses. | Teach the NY rule. |
| **Controlled business vs. § 2324** | Controlled business = more than 10% of aggregate net commissions (§ 2103(i)); § 2324's 5% is a different rule. | Kept separate; a question tests the distinction. |
| **§ 4220 (annuity nonforfeiture)** | Applies only to older contracts; current rules are in § 4223. | Teach § 4223; § 4220 noted as legacy. |
| **Indexed annuities / licensing** | Fixed indexed annuities need a life license; registered index-linked annuities are securities (FINRA). | Teach both, with the caveat. |
| **Accidental means** | Reg 62 § 52.17(a)(8) bars NY individual accident benefits from depending on "accidental means". | Teach the national definition **and** the NY rule. |
| **A&H free look vs life free look** | A&H: 10–20 days (§ 3216(c)(10)); life/annuity: 10–30 days (§§ 3203, 3219); 30 days for mail order, Medigap, LTC. | All verified; lesson notes added so learners don't conflate them. |
| **Replacement 60-day return** | § 2123(a)(3)(D) mandates a 60-day period; Reg 60 (11 NYCRR 51.6(d)) runs it from **delivery**. | Corrected `reg-l04` and the compliance case to "60 days from delivery". |
| **Group conversion periods** | Health 60 days (§ 3221(e)), life 31 days (§ 3220), LTC 45 days (Reg 62). | All verified for their own product. |
| **Viatical settlement** | Not defined in NY § 7802. | Term kept `draft`. |
| **NY DBL weekly maximum, Child Health Plus age limit, Healthy NY eligibility details** | Could not be verified within the fetch budget, or the figures are dated. | Taught without the specific figures. |
| **NY LTC tax credit** | Statute text shows a $1,500 cap and $250,000 income limit (recent amendments). | Marked `timeSensitive`, review due 2027-11-19; the lesson teaches only the 20% rate and carryover. |
| **Policy loan/withdrawal taxation and MEC rules** | 26 USC 72 text could not be retrieved. | `tax-q013`, `tax-q014` and `tax-l03` stay `draft`. |
| **NY State of Health naming** | Not verified from a primary source. | `aca-q012` stays `draft`. |
| **FCRA, nonpublic personal information** | Statute/regulation text not retrieved. | Those two glossary terms stay `draft`; lessons teach the concepts. |
| **Continuing education** | 15 credits (2023 bulletin) re-confirmed on the DFS page on 2026-11-19. | Kept verified; review due 2027-11-19. |
| **Medigap preexisting-condition credit** (`sen-q212`) | 11 NYCRR 58.1(b)(3)(ii) credits creditable coverage "including" Medigap, SELECT and Medicare Advantage — a non-exhaustive list; federal creditable coverage generally includes Medicare Parts A/B. | Question withheld (`draft`) until the key is re-verified. |
| **Annuity minimum nonforfeiture rate formula** (`ann-q217`) | Accurate per § 4223(c)(2)(F) but beyond licensing-exam scope. | Withheld (`draft`) so it doesn't distort mock exams. |
| **Federal Medicare facts** (Medigap core benefits, Initial Enrollment Period, Part D, ESRD) | Long-standing federal program structure, taught without annual dollar figures. | Marked `reviewed` (no NY-specific or time-sensitive figures used). |

## 5. Independent consistency review (Haiku) and resolution

Report: `docs/review/haiku-content-review.md` (1 confirmed error, 24 likely issues, 29 escalations). Mechanical checks found
**no** answer-key contradictions, no mislabelled rationales, no arithmetic errors, and correctly tagged negative stems.

Resolution:
* Confirmed error (internal note in `aca-q012`, a draft) — removed.
* Replacement anchor date, group contributory wording, `reg-q009` stem, confusing "Incorrect choice: this is correct"
  labels on NOT questions — fixed.
* Escalations E1, E2, E6, E7, E8, E10, E11, E14, E16, E17, E18, E21, E23, E25 — **checked against the saved statute or
  regulation excerpts and confirmed** (verbatim matches). E12, E13, E20, E22, E26–E29 — confirmed as correct general
  or federal rules.
* Answer-length cue — the 56 questions whose correct choice was >1.25× longer than every distractor were rebalanced.
* 48 outline topics that had lessons but no questions — new questions written (`content/questions/*-cov.json`).
* Not changed: "policyholder" in individual health items (it is the statutory term in § 3216); "Medigap" and
  "Medicare supplement" are both used deliberately (the glossary entry names both).

## 6. Known limitations

* The PSI outline can change; re-check the bulletin before your exam (link under Content & Coverage → Sources).
* Questions are original practice items written to the outline. They are not PSI items, and practice scores do not
  predict real results.
* A few statute texts were retrieved through extraction mode (verbatim quotes of the relevant sentences rather than
  the full section); the excerpt files say so where it applies.

## 7. Personal Lines (17-54) track

* **Outline/weights:** same PSI bulletin (updated 4/28/2023), pp. 47–50. 7 sections, weights sum to 100%.
* **Content:** 150 glossary terms (+ shared `reg`/`gen` terms), 386 eligible questions (162 `verified`, 224 `reviewed` general principles),
  26 lessons, 8 compliance scenarios. Drafts hidden from learners: `plho-q064` (NY Special Provisions endorsement specifics),
  `plauto-q077` and term `rental-vehicle-coverage` (NY rental-vehicle endorsement), `ploth-q037` and term `excess-lines-total-cost-form`
  (contents of the total cost form not found in the regulation text read).
* **New York rules verified from saved excerpts:** Ins. Law §§ 501–504, 2105, 2118, 2603, 2606, 2607, 2610, 2612, 3420, 3425, 3426,
  3428, 3429, 3430, 3433, 3455, 5102–5106, 5201–5202, 5301–5303, 5401–5414; Veh & Traf §§ 311, 313, 1693; 11 NYCRR 60-2, 65, 67, Reg 41 Part 27;
  NY Workers' Comp Law § 3; 44 CFR 59.1.
* **Where the outline's citations differ from the current law:** minimum auto liability limits are in Veh & Traf § 311(4)(a) (the outline
  cites § 333); cancellation notice periods for auto are in Veh & Traf § 313; C-MAP is § 5414 (outline cites 5401–5412); § 2121 concerns a
  broker's authority to receive premium, not commission sharing; § 2123 covers only life and A&H, so P&C misrepresentation uses § 2110(a)(6).
* **Rules with scheduled changes** (marked `timeSensitive`, review before relying): spousal liability opt-out (§ 3420(g)) changes 2027-07-31;
  DMV reporting (§ 313(2)–(4)) 2028-12-31; SUM default rule (§ 3420(f)(2-a)) repealed 2029-06-30.
* **Intentionally not taught (no verified source):** personal-lines cancellation notice days under § 3425, Reg 90 Part 218 details,
  additional-PIP amounts, assigned-risk binding details, Reg 79 inspection waivers, NY-specific endorsement wording.
* ISO policy-form text is copyrighted; coverages are described in original words and typical figures are phrased as "commonly".
* Nine outline topics are lesson-only (no question yet); see `docs/COVERAGE-17-54.md`.
