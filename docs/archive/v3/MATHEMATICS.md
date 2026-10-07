# Studentski Grad mathematics, version 3

This implementation uses a **6×5 board, scatter pays and persistent position multipliers**. Version3 adds the requested normal-badge factor transfer to one other matching regular symbol; the upgraded badge affects all current matches. The browser and simulator use the same pure TypeScript engine. Credits and debits are virtual euro cents.

Duck Hunters' primary rules and official footage establish the observable mechanics described in [the research record](DUCK-HUNTERS-REDESIGN.md). The nine-symbol numerical paytable and current feature prices were verified from the official public guest initialization on 7 October 2026. [Paytable evidence](duck-hunters-public-paytable.json) preserves the filtered response, normalization, source hashes and original-symbol mapping. Verified publisher normal xWays boosts only its source. Version3's additional normal target is a deliberate original rule change. Sampler probabilities and Extra Spin pricing are also original; they are not the publisher's private reel strips or certified theoretical return.

## Matching and payment

There are 30 physical cells and nine regular paying symbols. Each symbol pays for **8–9, 10–11 or 12+** matching positions anywhere. Matches need not touch, occupy adjacent reels or start on the left. A Wild substitutes for each regular symbol. Bonus invitations and extra-shot tokens do not substitute. Wilds can participate in multiple qualifying symbol awards; their position is removed and doubled only once in that cascade.

The verified public table, mapped to original Studentski Grad symbols, stores awards in millionths of the original base bet:

| Symbol | 8–9 | 10–11 | 12+ |
| --- | ---: | ---: | ---: |
| Textbook · L5 | 0.1× | 0.15× | 1× |
| Coffee · L4 | 0.1× | 0.2× | 1.25× |
| Instant noodles · L3 | 0.1× | 0.25× | 1.5× |
| Doner · L2 | 0.1× | 0.3× | 1.75× |
| Beer · L1 | 0.1× | 0.4× | 2× |
| Stylish classmate · M4 | 0.15× | 0.6× | 2.5× |
| Exhausted student · M3 | 0.15× | 0.7× | 3× |
| Student DJ · M2 | 0.2× | 0.8× | 3.5× |
| Bouncer · M1 | 0.3× | 1× | 5× |

For qualifying symbol `s`, let `C(s)` be its matching physical cells, including Wilds, and `m(c)` the multiplier stored at position `c`. Define:

```text
M(s) = max(1, sum(m(c) for c in C(s) where m(c) > 1))
award(s) = locked base bet × bracket value(s, |C(s)|) × M(s)
```

Neutral positions do not add 1 to the sum. Eight textbook cells without marked positions pay 0.1× the base bet. At €0.20 that is €0.02. If three of those cells are marked ×4 and the others are neutral, the sum is 12 and the award is €0.24. Eight marked ×2 positions produce a sum of 16; they remain **eight physical symbols**, not sixteen copies.

The evaluator sums exact BigInt numerators and rounds half up **once per cascade's aggregate award**. Successive differences of the rounded running sum allocate that amount to displayed symbol wins, so their cent values sum exactly to the settled cascade. Cascade awards are then added to the spin and whole-round totals. A cap can reduce the last award to the available remainder. This is not independent rounding of every visual win, and not a global party multiplier.

## Position progress and cascade order

Positions begin at ×1 unless a Day booster initializes them differently. Removing a winning symbol leaves ×2, then doubles that position on later removals up to ×8192. Values stay at their coordinates when symbols fall. Free spins retain the position grid from the triggering spin; direct buys start at ×1. An ordinary subsequent paid round starts with its selected mode's initial grid.

Each cascade follows this sequence:

1. All badges choose one common random regular symbol for that landing. Badges resolve in column-major, row-minor order, each choosing ×2, ×4 or ×8 with equal probability. The source reveals that symbol. A normal badge multiplies its source position and **one other uniformly chosen currently visible matching regular position**, when one exists, by its factor, capped at ×8192. If no other match exists, only the source is boosted.
2. An upgraded Infectious badge instead applies the factor to **all** current matching regular positions, including the source. Future unresolved badges remain badges until their own turn. Later causes can compound earlier revealed sources. Wild, Bonus, Bomb, shot and nonmatching symbols are not factor-transfer targets. The normal additional-target selection is the requested original variation, not Duck Hunters' verified normal rule.
3. Extra-shot tokens award +1 spin, or +2 with the shot upgrade, and are consumed once. They never count as Wilds.
4. Evaluate all scatter awards using the resolved symbols and pre-removal position multipliers. Remove the union of winning positions and double each once.
5. Resolve every Bomb before refilling. A Bomb doubles its own position, clears remaining regular symbols within its clipped 3×3 area, and doubles those cleared positions. Its upgrade changes the area to 5×5. Wild, Bonus and other special symbols are protected from neighboring Bomb removals. Already removed winning positions are not cleared or doubled again by that explosion.
6. Surviving symbols fall within their columns. New symbols fill the vacancies, while the position grid stays fixed. Resolve the resulting board again until no removals remain or the round cap is reached.

The physical grid always has six columns of five cells. Position numbers, matching counts, cascades and modifier combinations vary; reel heights do not. The renderer replays recorded snapshots and consumes no gameplay randomness. Turbo, skipping, sound, language and frame rate do not change the outcome.

## Prices and guarantees

Base bets are €0.10, €0.20, €0.40, €0.60, €1, €2, €5, €10 and €20. A paid round locks its base bet. All payouts use it, rather than the boosted charge or purchase price.

| Choice | Actual debit / base bet | Initial position multiplier / guarantee |
| --- | ---: | --- |
| Normal | 1× | ×1 |
| Find the party · xBet | 2× | ×1; one Bonus on column two on the initial landing |
| Day 2 | 2.8× | Every position ×2 |
| Day 64 | 90× | Every position ×64 |
| Day 1024 | 3000× | Every position ×1024 |
| Buy Dorm party | 70× | 7 spins; 1 random upgrade |
| Buy Friday in Studentski | 200× | 8 spins; 2 distinct random upgrades |
| Buy 8 December | 600× | 10 spins; all 3 upgrades |
| Lucky Draw | 235× | Dorm 50%, Friday 25%, December 25% |

Mode selection changes no money. Spin debits its mode once. A bonus buy or Lucky Draw is a complete alternative paid choice and does not stack with a selected mode's charge. Insufficient balance rejects the action before debit, RNG change or generation.

Three, four or five-plus Bonus invitations trigger Dorm, Friday or December respectively, with the same starting spins and upgrade counts as the direct buys. Invitations can arrive on the initial paid landing and during refills, with at most one per column. They remain protected while other symbols clear. A natural trigger's paid spin and all following free spins share one round.

Upgrades are chosen uniformly without replacement from Infectious xWays, larger Bombs and +2 extra shots. Their selection is part of the engine transition and is persisted before presentation. The Dorm/Friday/December wheel displays those existing one/two/three distinct grants; it never re-rolls or changes the RNG state. Bought bonuses first display a synthetic 3/4/5-invitation landing, including the tier selected by Lucky Draw. That receipt animation creates no payable scatter result, additional spin or debit. A newly awarded upgrade applies to the upcoming free spins, not retroactively to the triggering base spin. Bonus spins generate shot tokens instead of Bonus invitations. Each token extends the feature once; additional landings can extend it again. Wild arrivals are random and have no fixed purchased count or ceiling. The guaranteed entitlement is the granted upgrades and initial spins.

Day 1024 is a high-state booster on the ordinary board. Duck Hunters' public rules do not describe the first version's separate God/VIP collection, and it is no longer a playable outcome.

## Explicit original distributions

Every regular draw uses weights `[1, 1, 1, 1, 1, 1, 1, 1, 1]` in the paytable's order. Conditional on a regular draw, each of the nine regular symbols has probability 1/9. This same distribution chooses the common xWays reveal. Draws are independent, with no concealed win normalization or balance-dependent adjustment.

One uniform draw selects the mutually exclusive special outcomes below; its remaining probability selects a regular symbol using those weights. These rates apply to initial positions and new non-Bonus refill symbols.

The fixed rates below are the frozen version3 profiles in [`CONFIG.modes` and `CONFIG.bonuses`](../src/engine/config.ts). The final simulation report records the complete configuration and exact source hashes. These rates were calibrated against source-plus-one normal badges; archived version2 literals do not describe this rule.

| Profile | Wild | Normal / upgraded badge | Bomb | Extra-shot |
| --- | ---: | ---: | ---: | ---: |
| Normal | 0.008 | 0.03075 | 0.006 | 0 |
| xBet | 0.004 | 0.0163 | 0.0015 | 0 |
| Day 2 | 0.008 | 0.0350 | 0.006 | 0 |
| Day 64 | 0.008 | 0.0445 | 0.006 | 0 |
| Day 1024 | 0.008 | 0.0992 | 0.006 | 0 |
| Dorm | 0.008 | 0.02045 | 0.004 | 0.003 |
| Friday | 0.008 | 0.0190 | 0.004 | 0.003 |
| December | 0.008 | 0.0171 | 0.004 | 0.003 |

A bonus's xWays draws become Infectious when that upgrade is active. Upgrades change the modifier's operation, not the profile's probability of drawing it.

After generating an ordinary paid landing, each column independently has a 0.06 chance of replacing one uniformly chosen cell with Bonus. xBet instead guarantees column two and uses 0.0485 on its other columns. During a refill, a column lacking a surviving Bonus can replace one of its `k` incoming cells with Bonus at probability `profile scatter rate × k / 5`. Bonuses and Extra Spins suppress this Bonus draw. This refill process means natural trigger frequency cannot be inferred from the initial landing's binomial probability alone.

The profiles are fixed and public. Their differences balance the initial multiplier grid and guaranteed Bonus, rather than changing outcomes according to player history. xBet's actual relative bonus frequency is measured in the simulation; this implementation does not simply copy the publisher's advertised five-times claim.

## Extra Spin quotations and the shared cap

The transparent **original** quotation formula uses the frozen `D = CONFIG.extraQuoteDenominator = 33`:

```text
S = sum(all retained position multipliers above 1)
priceCents = ceil(lockedBetCents × max(1, S / 33))
```

For example, at a €0.20 locked bet, thirty retained ×2 cells give `S = 60` and a €0.37 quote; `S = 66` gives €0.40. The upward cent rounding is part of the disclosed price.

An offer appears after a completed non-bonus, non-maximum base or Extra Spin when this price is no greater than that spin's settled award. It retains the base bet, all position multipliers, the original chain identifier and the amount already paid. Accepting debits precisely the shown quote once. A centered modal blocks the underlying game until Buy or No thanks; Escape explicitly declines. Autoplay stops when the offer appears and cannot purchase or reject it automatically. Declining consumes neither money nor RNG. Bet and mode controls remain unavailable while the modal is open; the underlying engine also invalidates a stale offer if bet or mode changes. Extra Spins use the Normal symbol profile and contain no Bonus invitations. They can offer another continuation if eligible.

The **30,000× locked base bet cap** applies to the original paid round and every accepted continuation together. If an original round paid 29,900×, its extra chain can pay at most another 100×. Extra receipts record their local payout and earlier chain offset; their sum is what determines maximum-win status. The publisher's exact pricing formula is unavailable, so this quote and its measured conditional return are not described as identical to Duck Hunters.

## Durable accounting

A pure transition produces a paid debit, complete spin/cascade award, RNG state and active feature together. The UI validates and saves the candidate session before replacing its live state or animating it. Failed persistence retains the earlier live and saved state. Presentation acknowledgments consume no money or randomness. Reload replays or skips an already settled presentation; it does not redraw or credit it again.

Storage uses `studentski-grad-session-v3` with schema3. Existing `studentski-grad-session-v1` and `studentski-grad-session-v2` entries are left untouched and never replayed under the changed rule. The preference key is unchanged, preserving language, sound, volume and speed settings. Bonus-wheel replay and synthetic purchased invitations leave these saved outcomes and grant selections unchanged. Saved data is validated against grids, sequential modifier causes, normal-source-plus-one versus upgraded-all target selection, target multipliers, Wild substitution, win allocation, removals, surviving/refilled positions, bonus entitlements, extra-shot counts, chain offsets and receipts. Active rounds lock further paid actions. History retains the last 100 completed paid receipts, including individual continuation purchases.

The injectable xorshift32 state is deterministic demo randomness, not a real-money random-number certification. Outcomes do not inspect balance or earlier wins/losses; balance only governs affordability. Original Web Audio synthesis has independent presentation randomness.

## Measured validation

The target for the five modes and three direct buys is approximately 96%. A tuning target is not a theoretical result or a guarantee of session profit. Lucky Draw’s expected return follows its weighted tier entitlements: its verified 235× charge equals the 235× weighted direct-buy cost. If all three direct-buy expectations were exactly 96%, Lucky would also return 96%, without modifying payouts.

The final report in [simulation-results.json](simulation-results.json) records actual paid-round debits, full bonus payouts, cap settlement, independent seeds and exact engine/configuration/simulator SHA-256 provenance. It also records positive awards, profitable awards, medians, quantiles, modifier counts, physical matches, upgrade combinations, shot additions and accounting checks. Approximate 95% Monte Carlo intervals can be optimistic for very rare extreme awards; these are not certified theoretical RTPs. Different small stakes can differ slightly because cent rounding is part of the rules.

A separate qualified Extra Spin experiment accepts one offered continuation after each source round and declines subsequent offers. It reports a ratio-of-means confidence interval because quotes vary. Its return describes that conditional cohort and acceptance policy, not the unconditional RTP of an ordinary paid mode or an arbitrary repeat-until-finished strategy.

## Current report and historical separation

The version2 report and measured tables are preserved in [archive/v2](archive/v2/ARCHIVE.md). They were generated with source-only normal badges and do not describe version3. A fresh report is applicable only when its configuration, engine algorithm and simulator hashes match the current sources. Its `configuration` must identify `studentski-duck-3`.

The current return, positive-award frequency, profit over debit, natural bonus frequency and conditional Extra Spin rows below come from that fresh independent report. They are not copied from publisher RTP declarations or calibration samples used to select parameters.

## Recorded version3 results

The independent report contains **9,000,000 paid rounds** at €0.20 base bet: 5,000,000 Normal rounds and 500,000 for each other choice. It uses fresh base seed **83918213**, with per-choice deterministic offsets recorded in each result. Return uses the actual charge for that choice and includes all its bonus spins. These are measurements of the original version3 sampler and requested normal-badge variation, not publisher RTP declarations.

| Choice | Paid rounds | Measured return | Approx. 95% interval | Any payout | Profit over debit | Median award |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 5,000,000 | 97.04% | 92.18–101.91% | 19.19% | 6.47% | €0.00 |
| xBet | 500,000 | 101.10% | 88.61–113.59% | 13.83% | 2.62% | €0.00 |
| Day 2 | 500,000 | 92.37% | 85.81–98.93% | 19.60% | 11.50% | €0.00 |
| Day 64 | 500,000 | 96.55% | 94.75–98.34% | 20.88% | 13.37% | €0.00 |
| Day 1024 | 500,000 | 96.89% | 96.30–97.48% | 34.28% | 25.09% | €0.00 |
| Dorm buy | 500,000 | 95.86% | 93.49–98.23% | 80.91% | 8.88% | €0.70 |
| Friday buy | 500,000 | 96.45% | 94.88–98.03% | 85.74% | 10.60% | €1.66 |
| December buy | 500,000 | 96.56% | 95.55–97.57% | 91.86% | 14.70% | €6.18 |
| Lucky Draw | 500,000 | 98.55% | 96.97–100.12% | 84.84% | 9.96% | €1.40 |

Normal natural bonuses occurred in 0.51% of paid rounds; xBet in 2.34%, approximately 4.63 times as often. The measured ratio is reported rather than substituting the publisher's five-times claim. Normal observed 3 cap awards from its cascade/bonus engine. Both observed wins and intervals depend on the sampler and sample size; they do not guarantee a profitable playing session.

All three physical count brackets, variable Wild arrivals, granted upgrade combinations and persistent multiplier growth were observed. The board remained thirty physical cells. There were zero cent-accounting, cap, physical-count, unfinished-round or safety-limit errors. Exact engine/configuration/simulator hashes and source receipts are embedded in the report.

The separate **1,000,000 source-round Extra Spin cohort** produced **51,351 eligible offers**. Accepting one offer per source round returned **98.58%** of quoted costs, with an approximate 95% interval of **87.63–109.53%**. Quotes averaged €0.5667, with a €0.39 median. 19.93% paid anything and 14.07% paid more than the quote; the median Extra award was €0.00. Combining a source round with at most one accepted offer returned 91.01% (83.74–98.29%). The cohort had zero accounting, cap or unfinished-round errors. These conditional results use denominator33 and do not describe arbitrary repeated continuation purchases.

To reproduce the ordinary paid choices and separate extra cohort in Bash:

```bash
SIM_ROUNDS=500000 SIM_STANDARD_ROUNDS=5000000 SIM_SEED=83918213 SIM_EXTRA_ROUNDS=1000000 SIM_OUTPUT=docs/simulation-results.json npm run simulate
```

PowerShell users set the equivalent `$env:SIM_*` variables before `npm run simulate`. `SIM_MODE` accepts `standard`, `hunt`, `frames`, `wild`, `god`, `buy-dorm`, `buy-friday`, `buy-december`, `lucky` or `extra`. The identifiers `frames`, `wild` and `god` refer to Day 2, Day 64 and Day 1024, respectively. Each result stores its actual mode-offset seed. Merge requires identical configuration, engine algorithm and simulator hashes; stale v1/v2 diagnostics or earlier version3 candidates cannot be combined with a changed source or configuration.
