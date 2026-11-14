# BTO Studio — payment, loan & savings planner

Single-file web app (`index.html`) for sitting with a client and answering four
questions about a Singapore BTO purchase:

1. **What do I pay, and when?** — every stage from application to key collection,
   split between CPF OA and cash.
2. **What is the monthly instalment, and how much of it is CPF vs cash?**
3. **How much must I save each month while the flat is being built** (build time
   is an input — 3 years by default).
4. **How much is left for my other investment goals** — as a couple (50/50, by
   income, or any custom split) or buying alone.

Open it by double-clicking `index.html`. No build step, no dependencies, no
network calls. Inputs persist in `localStorage`.

**Live link:** https://lurkeyteg.github.io/bto-studio/ — public repo
`Lurkeyteg/bto-studio`, GitHub Pages. The source is readable by anyone with the
link (true of any static host); `Raw/Code/bto-calculator/` in the vault stays the
source of truth and `~/code/bto-studio/publish.sh` republishes it (`retract`
takes the link down).

Files:

| File | What it is |
|---|---|
| `index.html` | The whole app: engine (marked `BTO ENGINE START/END`), UI, styles |
| `tests/engine.test.mjs` | 164 assertions run against the engine **extracted from `index.html`** |
| `README.md` | This file |

Run the tests with `node tests/engine.test.mjs` (Node 22+). Current status:
**164 passed, 0 failed**.

## Sources

- **Video** — Xavier Tan, *BTO payment timeline* (youtube.com/watch?v=Fzlne3ZEkGk).
  Supplies the four payment stages and the three financing routes, including the
  worked examples used as test fixtures: 4-room $550,000 couple and 2-room
  $250,000 single.
- **Spreadsheet** — "BTO Cacl By XAV" (Google Sheet, id `1W-R8N_...gk9k`),
  tabs `2025-2026`, `IncomeCPF Contribution`, `22.5% DP`,
  `Calculation for DPSavings`, `Loan Repayment Amount`, `BTO Key Collection`.
  Supplies the fee scale, EHG table, CPF/OA allocation table, salary ceilings,
  HPS and fire-insurance figures, and the key-collection checklist.
- **CPF Board** — "CPF Contribution Rate Table from 1 January 2026" (Tables 1–3
  for citizens, SPR 1st and 2nd year) and the CPF allocation table for OA shares.
  `cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay`.
- **HDB / CPF published rules** for BSD bands, conveyancing scale, downpayment
  structure, MSR/TDSR and the staggered downpayment scheme's eligibility.

## Rules as implemented

**Stages**

| Stage | When | What falls due |
|---|---|---|
| 1 Application | at launch | $10, cash |
| 2 Booking | unit selection | option fee $500 (2-room) / $1,000 (3-room) / $2,000 (4-room+), cash, credited to the downpayment |
| 3 Agreement for lease | ~8 months (input) | **first** downpayment share (5% or 2.5% of the price) less the option fee, buyer stamp duty, legal fee |
| 4 Key collection | ~36 months (input) | **balance** downpayment (20% or 22.5%), survey, lease + mortgage in-escrow fees, stamp duty on deed of assignment, HPS, fire insurance (+ optional town-council advance) |

**Downpayment schedule** — chosen in the fact find, separate from the lender

| Applicants | At signing | At key collection | Notes |
|---|---|---|---|
| Adults | 5% of price, less option fee | 20% | whole 25% can be CPF on an HDB loan |
| Student / NSF (staggered, DIA) | 2.5%, less option fee | 22.5% | deferred income assessment; couples only, HDB loans only |

**Financing routes** (total downpayment / cash floor at signing)

| Route | Total DP | Cash floor | Schedule |
|---|---|---|---|
| HDB loan | 25% | none — all CPF-eligible | adult or staggered |
| Bank loan 75% LTV | 25% | 5% of price in cash | adult only |
| Bank loan 55% LTV | 45% | 10% of price in cash | all at signing |

**Fees**

- Buyer stamp duty — 1% first $180k, 2% next $180k, 3% next $640k, 4% next
  $500k, 5% above $1.5m, computed on the price **before** the grant.
- Legal / conveyancing — 0.09% per $100 on the first $30k, 0.072% on the next
  $30k, 0.06% thereafter, rounded up to the dollar, × 1.09 GST.
- Survey — $150 / $212.50 / $275 / $325 by flat type, × GST.
- Lease in-escrow $38.30; mortgage in-escrow $38.30 (HDB loans only).
- Stamp duty on deed of assignment — 0.4% of the loan, capped at $500.
- HPS $185 (input — real premium varies by loan, age and tenure).
- Fire insurance — $1.99 / $3.27 / $4.59 / $5.43 by flat type.

**CPF — citizenship status**

Each person carries a citizenship/PR status, because a PR pays CPF at graduated
rates and therefore builds almost no OA:

| Age | Citizen (and PR 3rd year on) | PR — 1st year | PR — 2nd year |
|---|---|---|---|
| 55 and below | 20% + 17% = 37% | 5% + 4% = 9% | 15% + 9% = 24% |
| 55–60 | 18% + 16% = 34% | 5% + 4% = 9% | 12.5% + 6% = 18.5% |
| 60–65 | 12.5% + 12.5% = 25% | 5% + 3.5% = 8.5% | 7.5% + 3.5% = 11% |
| 65–70 | 7.5% + 9% = 16.5% | 5% + 3.5% = 8.5% | 5% + 3.5% = 8.5% |
| Above 70 | 5% + 7.5% = 12.5% | 5% + 3.5% = 8.5% | 5% + 3.5% = 8.5% |

Employee share shown second. Source: CPF Board "CPF Contribution Rate Table from
1 January 2026", Tables 1 (SC / SPR 3rd year on), 2 (SPR 1st year) and 3 (SPR 2nd
year) under graduated rates (G/G). Salary ceiling $8,000/month applies to all.

- A PR who jointly applies with their employer for full rates (Tables 4–5) is not
  modelled — that is the exception, and the app shows the standard path.
- OA share of total contribution is applied by age only (CPF's allocation table
  is not citizenship-specific): 62.17% below 35, then 56.77 / 51.36 / 40.55 /
  35.3 / 14 / 6.07 / 8%.
- OA grows at 2.5% a year with monthly contributions compounded to each stage.
  Rate fields are entered **as a percentage** (2.5, not 0.025) — the app stores
  the fraction and converts on both sides, so a typed "2.5" can never silently
  become 0.025%. A stored OA rate below 0.5% is repaired on load, since no CPF OA
  rate has ever been that low.
- **CPF pays first, cash covers the rest**, but never more than the mandatory
  cash floor of the chosen route. Any CPF shortfall can be pooled from the
  partner's OA — the split page shows who lends and who draws — and whatever is
  still uncovered becomes cash.
- A PR-only household cannot buy a new flat (at least one applicant must be a
  citizen); the app says so instead of quietly producing a plan.

**Loan**

- Instalment = `PMT(rate/12, tenure×12, loan)`; the loan is the price after
  grant less the downpayment.
- Cash top-up = max(0, instalment − monthly OA inflow); the page also shows how
  many months the leftover OA at key collection can absorb a shortfall.
- Stress test adds a configurable rate (default +1%) and shows the resulting
  instalment and cash top-up.
- MSR check: instalment ÷ gross household income, flagged over 30%.

**Save-up plan**

Required level monthly saving `S` solves both deadlines at once — the signing
lump `X3` at month `m3` and the key-collection lump `X4` at month `m4`:

```
F(n)   = ((1+r)^n − 1) / r           (r = savings rate / 12)
S      = max( (X4 + X3·(1+r)^(m4−m3)) / F(m4),  X3 / F(m3) )
```

i.e. the larger of "fund the whole bill by key collection" and "fund the
signing lump in time". Because the signing lump is often the tighter deadline,
the plan usually lands **ahead** of the total by key collection — the app calls
that out as renovation money rather than hiding it, and gives the lower
**two-speed** rate you can drop to once the lease is signed:

```
S2 = ( X4 − (S·F(m3) − X3)·(1+r)^(m4−m3) ) / F(m4−m3)
```

Wiggle room = monthly cash available (take-home pay less other commitments)
minus that saving requirement. The surplus is what stays free for other goals,
and is projected forward at the investment rate to key collection.

**Where the money sits** — the saving rate is not a single guess. The same goal
is solved four times, once per funding vehicle, and the selected vehicle drives
the headline requirement:

| Vehicle | Nominal (default) | Real at 3% inflation |
|---|---|---|
| Bank savings | 0.05% | −2.86% |
| Fixed deposit | 1.50% | −1.46% |
| Endowment | 3.75% | 0.73% |
| Investment portfolio | 6.00% | 2.91% |

Real rate = `(1 + nominal) / (1 + inflation) − 1`. Rows show the requirement per
month and per year, mirroring the Advisor Suite's "ways to close the gap" card;
the chosen row is highlighted, and typing a rate of your own switches the
selector to "Custom rate". All five rates plus inflation stay editable inputs.

## Assumptions and things to watch

- Prices, grants and rates are **inputs**, not published figures — update them
  at every client meeting.
- The grant reduces the purchase price for the downpayment and the loan (as the
  reference sheet does). HDB actually credits the grant into CPF OA; the net
  effect on cash needed is the same, the CPF ledger is simplified.
- EHG is auto-filled from household income at couple rates, halved in single
  mode. Other grants (e.g. PHG, family grants) go in "Other grants".
- Singles: the app disables nothing, but the Single/Couple tab states the real
  constraints — 2-room Flexi route, no staggered downpayment, half-rate grant.
- Not modelled: ABSD (not payable on a first BTO), resale levy, renovation,
  furniture, town council charges beyond the input, HDB's actual HPS pricing,
  income changes during the build, CPF interest on balances above $20k tiers,
  and a PR's joint application with their employer for full contribution rates.
- **CPF OA share above age 55 is still the advisor's original figure** (35.3% and
  14% of contribution). CPF's published 2025 allocation table says 36.94% and
  14.9%; the 2026 table has not been published separately, and the 2026 rate rise
  for 55–70 lands in the Retirement Account, so the OA share is genuinely moving.
  Under-55 ratios (62.17% etc.) are exact and unchanged. Do not quote a 55+ case
  without checking the client's actual CPF statement.
- CPF rounds the total contribution to the nearest dollar and the employee share
  down; this model does not round month by month, so single dollars can differ.
- EHG eligibility with a PR spouse is not modelled — the grant is an input. The
  app warns when every applicant is a PR, since that household cannot buy a BTO.
- The sheet's `22.5% DP` tab splits the HDB downpayment 2.5% / 22.5%. The video
  and HDB's published rules use **10% at signing and 15% at key collection**
  (or 5% / 20% staggered), which is what this app models. `Calculation for
  DPSavings` in the same workbook agrees with 5% / 20%. The 2.5% / 22.5% split is
  the **deferred income assessment (DIA)** variant and is now its own schedule in
  the fact find (Student / NSF), alongside the standard adult 5% / 20% split.

## Deviation log

- Per-person CPF allocation was initially capped by opening OA only, which
  understated CPF earned during construction — fixed (tests 9).
- Mandatory cash minimums (bank loans) were not enforced against CPF-first
  allocation — fixed (tests 4 and 5).
- The save-up chart dropped the key-collection step — fixed.

## Next steps if this earns a v2

- Compare two flats side by side, and a "cheaper flat" what-if that recomputes
  the same plan at −$50k.
- HPS premium lookup from a published table instead of a single figure.
- Export the client summary as a PDF with the firm's letterhead (print styles
  already hide the inputs).
- Resale / Sale-of-Balance variant with resale levy, ABSD and a shorter timeline.
