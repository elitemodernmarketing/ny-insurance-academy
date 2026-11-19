# Curriculum Manifest — NY Life, Accident & Health (PSI Series 17-55)

Machine-readable manifest: `content/manifest/exam-17-55.json` (exam section → subject → topic → subtopic, with statute/regulation references). Each lesson, glossary term and question maps to outline ids; `docs/COVERAGE.md` shows the mapping per topic.

## Verified exam facts

| Fact | Value | Source |
|---|---|---|
| Exam | New York Life, Accident, and Health Insurance Agent/Broker, Series 17-55 | PSI NY Candidate Information Bulletin, updated 4/28/2023 (p. 23) |
| Scored items | 150 | Bulletin p. 23 ("150 items - 2.5 Hour Time Limit") |
| Time limit | 2.5 hours (150 minutes) | Bulletin p. 23 |
| Passing score | 70% correct | Bulletin p. 12 ("You must get 70% correct to pass the examination") |
| Experimental items | 5–10 unscored items may be added | Bulletin p. 17 (not simulated — the app uses 150 scored items) |
| Pre-licensing | 40-hour approved Life/A&H course (statutory minimum); waivers/exemptions exist | Bulletin p. 2; DFS Prelicensing Course Standards (Life/A&H combined: 40 hours) |
| School Certificate | Issued only by a DFS-approved provider | Bulletin p. 3 |

Edition check (2026-11-19): PSI bulletin IDs 7208 and 7228 returned the same PDF (sha256 2cf26319…df4df), "Copyright © 2023 … Updated 4/28/2023". No newer New York bulletin was found. The DFS criteria page lists the same 40-hour standard.

## Section weights and items per 150-question exam

The bulletin explains weights as a share of the exam (10% → 15 items on a 150-item exam). Several 17-55 weights produce half items; the simulator uses largest-remainder allocation: whole items first, then the 3 remaining items go to 3 of the 6 sections tied at .5 (chosen with each exam's seed, so they rotate). PSI does not publish how it rounds these.

| # | Section | Weight | Exact items | Items per exam |
|---|---|---:|---:|---|
| 1 | Insurance Regulation (`reg`) | 7% | 10.5 | 10–11 |
| 2 | General Insurance (`gen`) | 4% | 6 | 6 |
| 3 | Life Insurance Basics (`lib`) | 8% | 12 | 12 |
| 4 | Life Insurance Policies (`lip`) | 8% | 12 | 12 |
| 5 | Life Insurance Policy Provisions, Options, and Riders (`lpr`) | 10% | 15 | 15 |
| 6 | Annuities (`ann`) | 7% | 10.5 | 10–11 |
| 7 | Federal Tax Considerations for Life Insurance and Annuities (`tax`) | 2% | 3 | 3 |
| 8 | Qualified Plans (`qp`) | 2% | 3 | 3 |
| 9 | Life Settlement (`ls`) | 3% | 4.5 | 4–5 |
| 10 | Accident and Health Insurance Basics (`ahb`) | 5% | 7.5 | 7–8 |
| 11 | Individual Health Insurance Policy General Provisions (`ihp`) | 4% | 6 | 6 |
| 12 | Disability Income and Related Insurance (`di`) | 6% | 9 | 9 |
| 13 | Medical Plans (`med`) | 6% | 9 | 9 |
| 14 | Federal Patient Protection and Affordable Care Act (`aca`) | 6% | 9 | 9 |
| 15 | Long-Term Care (LTC) Insurance (`ltc`) | 6% | 9 | 9 |
| 16 | Group Health and Blanket Insurance (`grp`) | 5% | 7.5 | 7–8 |
| 17 | Government Insurance Plans (`gov`) | 5% | 7.5 | 7–8 |
| 18 | Private Insurance for Senior Citizens and Special Needs Individuals (`sen`) | 6% | 9 | 9 |
| | **Total** | **100%** | **150** | **150** |

## Outline structure

620 outline nodes across 18 sections. Hierarchy was reconstructed from the PDF's indentation (x-offsets); every token of the official outline text is preserved (verified by a token-count comparison). A few nodes with ambiguous indentation were normalized:

- Medical Plans → Types of plans: PPO/POS/EPO, "Indemnity plan features" and "Catastrophic" placed as siblings of HMOs.
- Long-Term Care → Benefits: benefit periods, benefit amounts, ADLs and the plan-type/underwriting/suitability items placed as direct children of Benefits.
- Group Health → Regulation of employer group plans: FMLA and nondiscrimination rules placed as siblings of ERISA.
- ACA → "Cost share reeducation" (sic in the bulletin) is titled "Cost-sharing reduction" with the original text kept in `officialText`.

Human-readable tree: `research/official/series-17-55-outline-tree.txt`. Full bulletin text: `research/official/psi-bulletin-ny-2023-04-28_fulltext.txt`.

## Personal Lines track (Series 17-54)

100 questions · 2 hours (120 minutes) · 70% to pass · 40-hour course (bulletin pp. 12, 47–50). Manifest: `content/manifest/exam-17-54.json`;
readable tree: `research/official/series-17-54-outline-tree.txt`; outline text: `research/official/psi-bulletin-ny-2023-04-28_series-17-54-outline.txt`.
Same bulletin edition (updated 4/28/2023; bulletin IDs 7208/7228 identical).

| # | Section | Weight | Items per 100-question exam |
|---|---|---:|---:|
| 1 | Insurance Regulation (`plreg`) | 10% | 10 |
| 2 | General Insurance (`plgen`) | 10% | 10 |
| 3 | Property and Casualty Insurance Basics (`plpc`) | 17% | 17 |
| 4 | Dwelling (2014) Policy (`pldwl`) | 8% | 8 |
| 5 | Homeowners (2011) Policy (`plho`) | 24% | 24 |
| 6 | Auto Insurance (`plauto`) | 24% | 24 |
| 7 | Other Coverages and Options (`ploth`) | 7% | 7 |
| | **Total** | **100%** | **100** |

Every weight is a whole number of items on a 100-question exam, so no rounding rule is needed. 336 outline nodes; the hierarchy was
reconstructed from PDF indentation with wrapped titles re-joined (three wrapped endorsement titles were merged and their second halves'
ids retired), and every word of the official text is preserved except a stray heading from the following exam and page numbers.
