# Content Quality Review (read-only) - NY Insurance Licensing Academy

Date: 2026-11-19. Scope: `content/` (glossary 478 terms + 35 comparisons, questions 500, lessons 74). No content or code was edited. Scratch scripts: `/tmp/claude-1014/-opt-FA/2bb31f6f-335a-4e80-96cc-80bb87f569ae/scratchpad/haiku/`.

Limits: no web access, so NY/federal statute figures were checked only for internal consistency (same rule stated the same way across records) and for arithmetic. A figure that is consistent but not independently checked is not marked confirmed.

## 1. Regression outputs (run as specified)

- `npx vitest run src/content`: `Test Files  1 passed (1)` / `Tests  11 passed (11)` (exit 0).
- `npx tsx scripts/validate-content.ts`: `0 error(s), 0 warning(s)` (exit 0). Summary line: `{"terms":413,"termsEligible":410,"questions":500,"questionsEligible":496,"lessons":74,"lessonsEligible":73,"sources":121,"registryTerms":413,"registryWritten":413}`.

## 2. Counts by class

- CONFIRMED-ERROR: 1
- LIKELY-ISSUE: 24
- ESCALATE-TO-OPUS: 29 (plus a consistency-only note in section 7)

## 3. Mechanical checks that found NO problems

- Rationale vs `correct`: every question's correct choice is labeled "Correct", no distractor is labeled "Correct", and no correct choice is labeled "Incorrect" (500/500).
- Explanations that name a letter other than `correct`: none found.
- NOT/EXCEPT stems: 44 stems use NOT/EXCEPT in capitals and all 44 carry `negative-wording`. No untagged negative stems.
- Banned phrases: none. (`lip-q014` matches "Option B", which is a product name, not a choice reference.)
- Duplicate choice texts within a question: none.
- Arithmetic in explanations and rationales (about 60 worked examples, e.g. `di-q014`, `ltc-q010`, `lib-q008`, `ann-q017`, `aca-q018`, `lpr-q018`): all correct.
- Lesson knowledge checks (221): script checked that each keyed choice is the one the explanation supports; about 60 short explanations reviewed by hand. None name a different answer.
- Typos and doubled words: none real (doubled-word hits were cross-field concatenation artifacts).
- Every `sources` id resolves to `content/sources/*.json`.
- Every `nySpecific: true` record carries the `ny-law` tag.
- Correct-letter distribution: a 131, b 127, c 128, d 114 (balanced).

## 4. CONFIRMED-ERROR

1. CONFIRMED-ERROR: `aca-q012` (status `draft`) leaks an internal note into learner-facing rationale: "(Draft: this NY fact was not verified against a saved primary source in this batch.)". Remove before the record is promoted to eligible.

## 5. LIKELY-ISSUE

Numeric and rule consistency:

2. LIKELY-ISSUE: Replacement return period is stated two ways. `reg-l04` says the owner gets "a 60-day period after issuance" (§ 2123(a)(3)(D)). `lib-q028` explanation, `lib-l05` and its knowledge check say "within 60 days of delivery" (11 NYCRR 51.6(d)). Same rule, different anchor point. See also ESCALATE item E2.
3. LIKELY-ISSUE: "Disclosure Statement" names two different documents in the same replacement content. `lib-q027` explanation says the producer submits a signed Disclosure Statement "before delivery" and the replacing insurer sends it "within 10 days of delivery" to the existing insurer. `lib-l05` says "Disclosure Statement before delivery". Learners will conflate them. Name them separately (e.g., "producer's Disclosure Statement" vs "notice to the existing insurer").
4. LIKELY-ISSUE: Small-group employee count in a distractor contradicts the glossary. `qp-q003` choice a says "any employer with fewer than 100 employees qualifies" for SIMPLE; `simple-plan` glossary says "generally 100 or fewer employees". Align wording.
5. LIKELY-ISSUE: `ahb-l04` (lesson) reads "a group covering between one and fifty employees ..., or between one and one hundred employees ... for policies issued or renewed on or after 1/1/2016" as two alternative definitions, and then notes Reg 145 still says "two to 50". Learner-facing text should state the current rule as one sentence (1-100 for policies issued/renewed on or after 1/1/2016, excluding spouses and dependents), and keep the Reg 145 conflict in a note.
6. LIKELY-ISSUE: Two group-conversion periods sit side by side. `grp-l04`/`grp-q023`: group health conversion 60 days (§ 3221(e)). `ltc-l02`/`ltc-q029`: group LTC conversion 45 days (11 NYCRR 52.25). `lip-l05`/`lip-q027`: group life conversion 31 days (§ 3220). Each is correct for its product, but no lesson links them. Add a comparison row or a "don't confuse" callout.
7. LIKELY-ISSUE: A&H free look. `ihp-l03` and `ihp-q015` say A&H is "10 to 20 days" (ESCALATE E1). Life (`lpr-l01`, `lpr-q001`) and annuity (`ann-l02`, `ann-q006`) say "10 to 30 days". Learners will see both ranges. Add a sentence saying the ranges differ by product.
8. LIKELY-ISSUE: Medigap free look and mail-order rules are internally consistent (`ihp-q015`, `ihp-l03`, `sen-q019`, `sen-l02`: 30 days) but `ihp-l03` also calls the Medigap free look "30 days" next to the A&H 10-20 range. Fine, but worth a callout.
9. LIKELY-ISSUE: `reg-q009` (renewal timing). Correct choice d: "remains in force while the timely renewal application is pending". Its explanation says renewals should be filed 60 days before expiration to avoid a late fee, so the Aug 1 filing (19 days before Aug 20 expiry) is a late filing. The stem never says the filing was timely. This makes the key choice contestable. Rewrite the stem as "filed before expiration" or drop "timely" from the key.
10. LIKELY-ISSUE: `grp-l01` (lesson) says "at least 50% of eligible employees (or, if fewer, 50 or more employees)". The statute rule is the lesser of the two (the text quoted in `grp-q004` rationale: "... or, if less, fifty or more"), and the parenthetical reads like an alternative rule. Reword to "whichever is fewer". Same rule for group life (`lip-q026`, `lip-l05`, "50% or five, whichever is fewer", § 4216(b)(1)) versus group health (`grp-q004`, `grp-l01`, "50% or fifty", § 4235(c)(1)(A)). Keep both, but add a callout so learners do not swap 5 and 50.

Question construction:

11. LIKELY-ISSUE: Answer-length bias (test-wiseness). The correct choice is the single longest choice in 252 of 500 questions (50%) and the shortest in 95 (ties excluded from the longest count). Balance option lengths on the next editing pass. Examples where the key is uniquely longest: `aca-q001`, `aca-q003`, `aca-q005`, `lpr-q006`.
12. LIKELY-ISSUE: `rapid` questions over the 120-character stem limit in the guide: `aca-q013`, `aca-q017`, `grp-q012`, `grp-q024`, `grp-q031`, `lib-q035`, `lpr-q007`, `ls-q009`, `ltc-q028`, `med-q001`, `med-q012`, `med-q023`, `med-q027`, `reg-q005`, `reg-q015`, `reg-q023` (16 items, 129-167 chars).
13. LIKELY-ISSUE: `sen-q022` (EXCEPT). The key option "d" bundles two permitted changes ("track changes in Medicare cost sharing, or re-rate premiums by class"). The explanation lists three permitted changes, including "amend the policy to meet minimum standards", which is not in any option. Split the key option or make it one change.
14. LIKELY-ISSUE: Distractor rationale wording. 30 distractor rationales begin "Incorrect choice:" and several read oddly: `gen-q017` a/c/d say "Incorrect choice: this is correct", and `qp-q010` d says "Incorrect choice: this is true." Use "Not the answer:" or rephrase so the label does not contradict the text.
15. LIKELY-ISSUE: `ihp-q015` distractor c ("20 days ... maximum ... for most other individual A&H policies") is the top of the range in `ihp-l03`. If the NY A&H range is actually 10-30 (see E1), 20 days would also be correct for other policy types. Verify E1 before keeping this item.

Terminology:

16. LIKELY-ISSUE: "policyholder" is used for the individual owner in individual-product records where the guide mandates "policyowner": `sen-q023` ("at the policyholder's request"), `ltc-q011` ("the insured or policyholder"), `med-q020` ("the policyholder must submit proof"), `med-q022` ("the policyholder may decline it"), `med-q024` ("the policyholder's option"). In group records "policyholder" is correct (the employer), e.g. `grp-q001`, `lip-q023`, `grp-l01`. Counts across all text: "policyowner" 35/46/107 (Q/L/G) vs "policyholder" 31/24/39.
17. LIKELY-ISSUE: "Medigap" (115 question mentions) and "Medicare supplement" (22) are both used. Pick one learner-facing name and keep "Medicare supplement" only in quoted NY regulatory language (e.g., `sen-q020`, `ltc-q015`, `ihp-l03`).
- NOTE (no action): "exchange" and "Marketplace" are used interchangeably, which is acceptable because `health-insurance-exchange` and `aca-l02` define exchange = Marketplace.
- NOTE (no action): "NY State of Health" is used consistently in `gov-l03`, `gov-q012`, and in the draft `aca-q012`. No variant spellings found.
- NOTE (no action): "superintendent" is used consistently for the NY regulator (45 question hits, 41 lesson hits). "commissioner" appears only in NAIC context (`reg-q029`).

Outline and coverage:

18. LIKELY-ISSUE: Eight outline nodes are marked "partial" with 0 questions AND 0 glossary terms, so they are taught in a lesson only: `reg.1.3.6`, `reg.2.4.4`, `reg.2.5`, `reg.2.10`, `reg.3.1`, `gen.2.2`, `gen.3.4`, `ls.4.1`. Confirm whether these need a term or question.
19. LIKELY-ISSUE: 48 "partial" nodes in `docs/COVERAGE.md` all have zero eligible questions (see section 8). Coverage report says "gap 0", but a lesson-only node has no practice. Consider a minimum of one question per partial node.

Glossary and lesson clarity:

20. LIKELY-ISSUE: `ihp-l01` says "Premium accepted for reinstatement may be applied to a period up to 60 days before the reinstatement date." Not repeated anywhere else, so it cannot be cross-checked. Treat as ESCALATE E20.
21. LIKELY-ISSUE: The 45-day conditional receipt rule appears in `ihp-q004`, `ihp-l01` (twice). Consistent, but not in the glossary. Add a glossary entry for `conditional-receipt` if one is intended.
22. LIKELY-ISSUE: `continuing-education` is `timeSensitive: true` but is sourced only to the 2023 PSI bulletin (see E5). Flag for review date.
23. LIKELY-ISSUE: `ltc-q026` and `ltc-l03` both say Partnership inflation protection is "mandatory unless purchased at or after age 80", while `ltc-l02` and `ltc-q009` say inflation protection must be offered and may be declined. Both can be right (Partnership vs general LTC), but neither record says so. Add the Partnership qualifier to `ltc-l02` (see E15).
24. LIKELY-ISSUE: `ahb-q023` (draft) asks "Is the firm a small group subject to NY community rating?" The correct answer relies on the post-2016 1-100 rule, which conflicts with Reg 145 (see E-small-group). Keep draft until lead decides.
25. LIKELY-ISSUE: `tax-q013` and `tax-q014` are drafts (MEC loan taxation). The eligible tax records were not compared against them in this pass. Before promotion, check that the draft rule matches the tax lesson wording.

## 6. ESCALATE-TO-OPUS

Legal or regulatory facts I cannot settle without a primary source. Each lists what is uncertain.

E1. A&H free look "10 to 20 days" plus "30 for mail order, Medicare supplement and LTC" (`ihp-l03`, `ihp-q015`, KC in `ihp-l03`). Life and annuity ranges are 10-30. Confirm § 3216(c)(10) range.
E2. Replacement 60-day return: "after issuance" (`reg-l04`, § 2123(a)(3)(D)) vs "of delivery" (`lib-q028`, `lib-l05`, `lib-l05` KC, 11 NYCRR 51.6(d)). Confirm the anchor date.
E3. Contributory minimums: group health 50% or 50 employees, whichever is fewer (`grp-q004`, `grp-l01`, § 4235(c)(1)(A)); group life 50% or five, whichever is fewer (`lip-q026`, `lip-l05`, § 4216(b)(1)). Confirm both numbers.
E4. NY continuation: 36 months, premium up to 102%, 60-day written election (`ny-continuation`, `cmp:cobra|ny-continuation`, `grp-q022`, `grp-l04`, § 3221(m)). Notes in the record say the 102% figure was captured as an extracted phrase. Confirm.
E5. Continuing education: 15 CE credits per biennial period and the "first renewal exemption" (`continuing-education`, `reg-l02`). Source is the 2023 PSI/DFS bulletin (`psi-ny-bulletin-2023`), and the record is `timeSensitive: true`. Confirm the current figure.
E6. Controlled business: "more than 10% of aggregate net commissions over 12 months" (`controlled-business`, `reg-l05`, `reg-q020`, § 2103(i)); distractor "5%" attributed to § 2324 (`reg-q020`). Confirm threshold.
E7. Temporary license: "90-day terms, renewable up to 15 months in total" for death or disability (`temporary-license`, § 2109). Confirm.
E8. Renewability/cancellation: "NY: [cancellation] only in the first 90 days" (`renewability-clause`) and KC in `ihp-l02` ("only within the first 90 days after issue, with at least 10 days' notice"). Confirm § 3216 cancellation limits.
E9. Accident policy: "NY bars the accidental-means test" is the basis for the correct answer in `ahb-q002`. Confirm.
E10. A&H advertising file retention: "four years or until the next examination report, whichever is longer" (`ahb-q017`, Reg 34). Confirm.
E11. Compensation disclosure on request: "within five business days" (`reg-q027`, Reg 194). Confirm.
E12. Insurable interest: a woman may insure the life of her adult brother (`lib-q002` choice b treated as having insurable interest). The item is an EXCEPT question, so if this is not permitted, two choices become keys. Confirm § 3205.
E13. Group underwriting "geographic regions" rate option (`grp-q025` choice a, EXCEPT). If it is prohibited, two choices fit the stem. Confirm NY small-group community rating regions.
E14. LTC exclusion of services by immediate family members (`ltc-q017` choice b, EXCEPT). If it is prohibited, two choices fit. Confirm the regulation.
E15. Partnership inflation protection: "mandatory unless purchased at or after age 80" and "3.5% or 5% compound" (`ltc-q026`, `ltc-l03`). Confirm and add the Partnership qualifier to `ltc-l02`.
E16. Accelerated death benefits: 5-day illustration and 5-day wait; "24 hours" distractor (`lpr-q042`, `lpr-l06`, `accelerated-death-benefit`, § 3230). Confirm.
E17. Medigap Medicaid suspension: up to 24 months, notice within 90 days (`sen-q023`, `sen-l02`, 11 NYCRR 58.1(c)(7)(i)); Medigap commission cap of 200% of second-year and renewal-level replacement pay (`sen-q016`, `sen-q017`, `sen-l02`, 58.1(f)). Confirm.
E18. Juvenile life limits: 14 years 6 months competency; $50,000 or 50%/25% (under 4 years 6 months) of coverage on the parent (`juvenile-life-insurance`, `lip-q019`, `lip-q020`, `lip-q021`, `lip-l04`, § 3207). Confirm.
E19. Life settlements: broker license exam waiver for a life-line producer (`ls-q005`, § 2137(f)(1)(A)); "no medical exam after settlement" (`ls-q011`); stranger-originated life insurance definition (`ls-q013`, § 7815); exclusion of related-party transfers (`ls-q002`, § 7802(k)(3)(H)). Confirm each.
E20. Conditional receipt and reinstatement: policy reinstated on the 45th day after a conditional receipt absent disapproval (`ihp-q004`, `ihp-l01`, § 3216(d)(1)(D)); premium credited back up to 60 days (`ihp-l01`, unverifiable). Confirm.
E21. Business overhead expense: "premium refund (may be limited to one year's premium)" (`di-q028`, Reg 62). Confirm.
E22. Nonforfeiture election: 60 days after default for a non-automatic option (`lpr-q031`, § 4221(a)(3)). Confirm.
E23. Association group life: "at least two years" (`lip-q025`, § 4216(b)(10)). Confirm.
E24. Annuity nonforfeiture scope: which annuities § 4223 covers (`ann-q016`, EXCEPT). If index-account deferred annuities are excluded, choice c also becomes a key. Confirm.
E25. Annuity minimum death benefit during deferral: key says "full accumulated value" (`ann-q019`); a reader could argue for "cash surrender value after surrender charges" under the NY nonforfeiture law. Confirm the required minimum.
E26. Relation of earnings to insurance: continuation "until at least age 50 (or five years if issued after 44)" (`di-q015`, `di-l02`, § 3216(d)(2)(F)). Noncancelable/guaranteed renewable to age 65 (`di-q011`, `ihp-q013`) is consistent, but the two ages are close enough to confuse. Confirm both.
E27. Medicare: Plans C and F limited to people first eligible before 1/1/2020 (`sen-q008`). Federal fact; not verified here.
E28. Marriage special enrollment effective "first of the next month" (`aca-q020` explanation; HIPAA). Federal; not verified here.
E29. MEC exchange under § 1035 stays a MEC (`tax-q010`). Federal tax; not verified here.
NOTE. Life/annuity grace, incontestable, reinstatement and free-look numbers (31 days, 2 years, 3 years, 6%, 10-30 days) are consistent across 15+ records and cite § 3203/§ 3219. Consistent, not independently verified.

## 7. Statutory numbers checked for consistency (all consistent unless listed above)

- Life grace: 31 days fixed premium, 61 days flexible (`grace-period`, `lpr-q002`, `lpr-q003`, `lip-q013`, `lip-l03`, `lpr-l02`).
- Life free look 10-30 days, 30 mail order (`free-look`, `lpr-q001`, `lpr-l01`).
- Annuity: grace 31, incontestable 2 years except age/sex/identity, reinstatement 3 years, free look 10-30 (`ann-l02`, `ann-q006`-`ann-q011`).
- Incontestable 2 years; suicide exclusion 2 years (`lpr-q006`, `lpr-q009`, `lpr-l02`, `suicide-exclusion`).
- Reinstatement 3 years, evidence of insurability, up to 6% interest (`reinstatement`, `lpr-q004`, `lpr-q005`, `lpr-l02`).
- Conversion (group life) 31 days, 15-day notice window, 45 days after late notice (`conversion-privilege`, `lip-q027`-`lip-q030`, `lip-l05`).
- COBRA 20+ employees, 18/29/36 months, 102%/150% (`cobra`, `grp-q021`, `grp-l04`).
- Small group 1-100 employees for policies issued/renewed on or after 1/1/2016 (`small-group`, `small-employer`, `grp-q024`, `grp-l05`), except Reg 145 conflict (see item 5).
- FMLA 50 employees, 12 weeks, 26 military caregiver, 1,250 hours, 75 miles (`fmla`, `grp-q009`, `grp-l02`).
- Medicare secondary payer: 20 employees (65+), 100 employees (disabled), 24-month SSDI wait (`working-aged`, `medicare-disabled-under-65`, `sen-q026`-`sen-q028`, `grp-q010`).
- Medigap OE 6 months once; IEP 7 months; 90-day solicitation limit; 63-day credit; 6-month preexisting limit (`medigap-open-enrollment`, `initial-enrollment-period`, `sen-q003`, `sen-q006`, `sen-q029`, `sen-l01`).
- SSDI 12-month duration, 5-month waiting period, 40 credits (20 recent) (`social-security-disability`, `gov-q001`-`gov-q007`, `gov-l01`).
- NY DBL: 7-day wait, 50% of AWW, 26 weeks in 52 (`disability-benefits-law`, `gov-q009`, `gov-q010`, `gov-l02`).
- MLR 85% large group, 80% small group/individual; rebate = shortfall (`medical-loss-ratio`, `aca-q017`, `aca-q018`, `aca-l03`).
- ACA employer: 50 FTE (incl. FTE), 30 hours, 95% offer (`employer-shared-responsibility`, `aca-q022`, `aca-q023`, `aca-l03`).
- Metal levels 60/70/80/90 (`metal-levels`, `aca-q013`, `aca-q014`).
- Replacement notice before issue/delivery; 60-day return (see items 2, E2).
- Licensing: renewal 2-year cycle, file 60 days before expiry or late fee (`reg-l02`, `reg-q008`, `reg-q009`); nonresident resident-license application 90 days (`nonresident-license`); revocation hearing not less than 10 days after notice, 1-year bar, 30-day report (`license-revocation`, `reg-q005`, `reg-q007`).
- Appointment filed within 15 days of contract or first application (`appointment`, `reg-q003`).
- Employer LTC 20% state tax credit (`ltc-tax-credit`, `ltc-q028`, `ltc-l03`); LTC 6-month look-back, 6-month preexisting limit (`ltc-q013`, `ltc-q018`, `ltc-l02`).
- Juvenile limits: see E18.
- Healthy NY: 50 employees or fewer, 12 months no group coverage, 30% lower-wage, 50% participation (`healthy-new-york`, `gov-q025`, `gov-l03`).
- Free look for Medicare supplement and LTC: 30 days (`ihp-q015`, `ltc-q015`, `ihp-l03`).

## 8. Outline nodes marked "partial" with no questions (`docs/COVERAGE.md`)

All 48 partial nodes have 0 eligible questions and their section's lesson covers them. Summary by section:

- reg (16): reg.1.2.4, reg.1.2.5, reg.1.3.1, reg.1.3.2, reg.1.3.4, reg.1.3.6, reg.1.4.2, reg.2.1, reg.2.2.2, reg.2.3.2, reg.2.4.2, reg.2.4.4, reg.2.5, reg.2.8, reg.2.10, reg.3.1
- gen (21): gen.1.1.2, gen.1.1.5, gen.1.2.1, gen.1.2.2, gen.1.2.3, gen.1.2.5, gen.2.1.3, gen.2.2, gen.2.6, gen.3.3.1, gen.3.3.2, gen.3.4, gen.4.1.1, gen.4.1.3, gen.4.1.4, gen.4.2.1, gen.4.2.2, gen.4.2.3, gen.4.2.5, gen.4.3.1, gen.4.3.2
- lpr (7): lpr.2.1.1, lpr.3.1, lpr.6.1, lpr.6.2, lpr.6.4, lpr.6.5, lpr.9.3
- ls (3): ls.1.3, ls.1.5, ls.4.1
- grp (1): grp.7.2

Zero glossary terms as well (lesson-only): reg.1.3.6, reg.2.4.4, reg.2.5, reg.2.10, reg.3.1, gen.2.2, gen.3.4, ls.4.1.

The coverage summary (`complete 572, partial 48, gap 0`) is correct. The sections with the most partial nodes are gen and reg. Recommend one question each for the partial items most likely on the exam: gen.4.2.2 (aleatory), gen.4.1.4 (legal purpose), reg.2.3.2 (false advertising, §2603), reg.1.4.2 (continuing education, §2132), lpr.6.2 (reduction of premium payments).

## 9. Top 15 ambiguity risks (distractor could also be true, or EXCEPT stem with two fits)

1. `lib-q002` (EXCEPT): choice b (woman insuring adult brother) may be disallowed under § 3205, which would make two keys (E12).
2. `grp-q025` (may NOT): choice a (separate community rates for geographic regions) may be prohibited, making two keys (E13).
3. `ltc-q017` (EXCEPT): choice b (exclude family-member services) may be prohibited (E14).
4. `ann-q016` (EXCEPT): choice c (deferred annuity with equity index account) may fall outside § 4223 (E24).
5. `ann-q019` ("minimum death benefit"): "full accumulated value" is keyed; the nonforfeiture minimum may be cash surrender value (E25).
6. `reg-q009`: "timely" renewal in the key vs a 19-day-before-expiry filing the explanation calls late (item 9).
7. `ihp-q015` vs `ihp-l03`: choice c "20 days" is the top of the A&H range in the lesson; if A&H is 10-30, it is also correct (item 15, E1).
8. `lib-q028` vs `reg-l04`: 60-day return keyed from delivery; another record says from issuance (item 2, E2).
9. `ahb-q002`: key depends on the NY bar on accidental-means test; the "all recreational injuries" distractor is not clearly wrong without it (E9).
10. `sen-q022` (EXCEPT): key option bundles two changes; one may not be permitted (item 13).
11. `ahb-q017`: key retention period (4 years or next exam report) cannot be checked without Reg 34 (E10).
12. `reg-q027`: "five business days" key cannot be checked (E11).
13. `gov-q004`: first benefit month depends on counting the 5-month waiting period from the first full month (April), which the question leaves implicit.
14. `ltc-q020` (may NOT exceed): key is "renewal compensation payable by replacing insurer". The renewal-level cap is stated for Medigap in `sen-l02`; the LTC equivalent is not cited in `ltc-q020` or `ltc-l03`. Confirm the LTC rule.
15. `lpr-q042`: "reduced death benefit" and "five-day wait" in the key; the 24-hour distractor is excluded only by the § 3230 wait (E16).

## 10. Remaining ESCALATE and LIKELY items at a glance

- ESCALATE: E1-E30 (section 6).
- LIKELY: items 2-25 (section 5, numbered; notes are unnumbered).
- CONFIRMED-ERROR: item 1 (section 4).

## 11. Method notes

- Scripted checks over all 500 questions, 74 lessons, 478 glossary terms and 35 comparisons. Manual review of about 1,860 number-plus-unit sentences grouped by rule family, all 44 negative-wording stems, and the 134 `tricky`-tagged questions (stems and choices).
- Glossary practice items: 478 checked by script (answer index valid, explanation not naming another choice as the answer). 3 flags reviewed manually; all benign.
- Not reviewed line by line: glossary `examples`, `simpler` and `misconception` fields, and lesson `advanced` panels. Spot-checked only.
