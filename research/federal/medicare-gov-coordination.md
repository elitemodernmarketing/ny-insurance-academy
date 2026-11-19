# Medicare.gov — How Medicare works with other insurance

- Source URL: https://www.medicare.gov/supplements-other-insurance/how-medicare-works-with-other-insurance (redirected to https://www.medicare.gov/health-drug-plans/coordination)
- Publisher: Centers for Medicare & Medicaid Services (Medicare.gov)
- Retrieved/verified: 2026-11-19 (Firecrawl scrape)

Verbatim excerpts:

- "If you have Medicare and other health insurance (like from a group health plan, retiree coverage, or Medicaid), each
  type of coverage is called a "payer.""
- "The "primary payer" pays up to the limits of its coverage, then sends the rest of the balance to the "secondary
  payer." If the "secondary payer" doesn't cover the remaining balance, you may be responsible for the rest of the costs.
  If your group health plan or retiree coverage is the secondary payer, you may need to sign up for Medicare Part B
  before they'll pay. This order of payment is called "coordination of benefits.""
- "If the insurance company doesn't pay the claim promptly (usually within 120 days), your doctor or other provider may
  bill Medicare. Medicare may make a conditional payment to pay the bill, and then later recover any payments the
  primary payer should've made."

Facts relied on: primary payer pays first up to its limits, secondary pays remaining balance; retiree coverage may be
secondary to Medicare. The employer-size thresholds for when a group plan is primary (working aged / disability) were
NOT on this page; see medicare-gov-who-pays-first section below if captured.

## Who pays first? (decision tool page)
- Source URL: https://www.medicare.gov/health-drug-plans/coordination/who-pays-first
- Retrieved/verified: 2026-11-19 (Firecrawl scrape). The page is an interactive decision tree; the questions and the
  answer texts are shown below verbatim. The pairing of answers to paths follows the tool's question order.

Decision-tree questions (verbatim):
- "What's your age?" — "I'm 65 or older" / "I'm under 65"
- "How do you get your group health coverage?" — "I have COBRA coverage" / "I'm covered by my former employer or my
  spouse's former employer (retiree coverage)" / "I'm covered by my current employer (including self-employment) or my
  spouse or family member's current employer"
- "Does the employer providing your health insurance coverage have 20 or more employees (or is the employer part of a
  multi-employer group health plan where at least one company has 20 or more employees)?"
- "Do you have Medicare because of a disability?" … "Does the employer providing your health insurance coverage have 100
  or more employees (or is the employer part of a multi-employer group where at least one company has 100 or more
  employees)?"

Answer texts (verbatim):
- COBRA: "If you have Medicare because you're 65 or older, Medicare pays first." "COBRA may only pay a small portion of
  your medical costs".
- Retiree coverage: "Medicare pays first, and your (or your spouse's) group health plan pays second." "Retiree coverage
  might not pay your medical costs during any period when you were eligible for Medicare but didn't sign up for it."
- "The group health plan pays first, and Medicare pays second." / "Medicare pays first, and the group health plan pays second."
- "The large group health plan pays first, and Medicare pays second." / "Medicare pays first, and the large group health
  plan pays second." "Note: When an employer has 100 or more employees, the health plan it offers is called a "large
  group health plan.""
- Parallel explicit rule (non-tribal plan answer): "If you have non-tribal group health plan coverage through an employer
  who has 20 or more employees, the non-tribal group health plan pays first, and Medicare pays second." "If you have
  non-tribal group health plan coverage through an employer who has fewer than 20 employees, Medicare pays first, and the
  non-tribal group health plan pays second."
- Workers' compensation: "Workers' compensation pays first for items or services (including drugs) related to the
  workers' compensation claim."
- Medicaid: "Medicaid never pays first for services Medicare covers."

Facts relied on:
- Age 65+, coverage from CURRENT employment, employer with 20+ employees → group plan primary, Medicare secondary
  (fewer than 20 → Medicare primary).
- Medicare due to disability (under 65), current employment, employer with 100+ employees ("large group health plan")
  → group plan primary.
- Retiree coverage and COBRA (age 65+) → Medicare primary.
- Medicaid never pays first for Medicare-covered services.
