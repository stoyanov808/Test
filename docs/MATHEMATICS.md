# Studentski Grad mathematics, version 4

This implementation uses a **6×5 board, scatter pays and persistent position multipliers**. Version 4 restores verified Duck Hunters xWays behavior: a normal badge boosts only its source position, an upgraded infection boosts all current matches, and every badge on a drop reveals the same common regular symbol. The browser and simulator use the same pure TypeScript engine. Credits and debits are virtual euro cents.

Duck Hunters' primary rules and official footage establish the observable mechanics described in [the research record](DUCK-HUNTERS-REDESIGN.md). The nine-symbol numerical paytable and current feature prices were verified from the official public guest initialization on 7 October 2026. [Paytable evidence](duck-hunters-public-paytable.json) preserves the filtered response, normalization, source hashes and original-symbol mapping. The private sampler probabilities and Extra Spin pricing remain original; they are not the publisher's private reel strips or certified theoretical return.

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

1. Choose one common regular symbol for every badge on this drop, using the disclosed regular weights. Resolve badges in column-major, row-minor order. Each independently chooses ×2, ×4 or ×8 with equal probability and reveals the common symbol. A normal badge multiplies **only its source position** by that factor, capped at ×8192. It sends no factor to a second matching cell.
2. An upgraded Infectious badge applies its factor to **all** current matching regular positions, including its source. Future unresolved badges remain badges until their own turn. Later infections can compound earlier revealed sources; all badges on the drop share the chosen regular type. Wild, Bonus, Bomb, shot and nonmatching symbols are not factor-transfer targets. With the infection perk, every badge draw in that feature is upgraded.
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

Regular draws use the fixed, disclosed paying-symbol weights in the paytable's order. The probability of a regular type is its weight divided by the sum of those weights. The same distribution chooses the common xWays symbol once for each drop; later badges share that reveal. A later cascade chooses again and may reveal a different type. Draws use no concealed win normalization or balance-dependent adjustment.

One uniform draw selects mutually exclusive special outcomes; its remaining probability selects a regular symbol using those weights. These rates apply to initial positions and new non-Bonus refill symbols. The final frozen version 4 profiles and weights are recorded in [`CONFIG`](../src/engine/config.ts) and copied into [simulation-results.json](simulation-results.json), along with exact source hashes. These original rates target approximately 96% under source-only normal badges and a common reveal; the completed current-source validation below measures their actual return. Archived version 3 rates do not describe this rule.

Every regular symbol uses weight 1, so conditional regular draws and the common xWays reveal are uniform over the nine paying types. The same weights apply to all paid modes, refills, bonuses and Extra Spins.

| Profile | Wild | Badge | Bomb | Extra-shot |
| --- | ---: | ---: | ---: | ---: |
| Normal | 0.008 | 0.0520 | 0.006 | 0 |
| xBet | 0.004 | 0.0195 | 0.0015 | 0 |
| Day 2 | 0.008 | 0.0590 | 0.006 | 0 |
| Day 64 | 0.008 | 0.0662 | 0.006 | 0 |
| Day 1024 | 0.008 | 0.1117 | 0.006 | 0 |
| Dorm | 0.008 | 0.02135 | 0.004 | 0.003 |
| Friday | 0.008 | 0.0194 | 0.004 | 0.003 |
| December | 0.008 | 0.0171 | 0.004 | 0.003 |

This sampler draws normal badges outside an active infection perk. With that perk, every badge draw in the feature is upgraded, on initial landings and refills. The perk changes operation rather than increasing total badge-arrival probability. The reference's public rules establish the all-upgraded perk guarantee; its private occurrence rates are undisclosed, so this implementation's perk-only sampling is not evidence of a verified zero natural-upgrade frequency in the commercial game.

After generating an ordinary paid landing, each column independently has a 0.06 chance of replacing one uniformly chosen cell with Bonus. xBet instead guarantees column two and uses 0.0485 on its other columns. During a refill, a column lacking a surviving Bonus can replace one of its `k` incoming cells with Bonus at probability `profile scatter rate × k / 5`. Bonuses and Extra Spins suppress this Bonus draw. This refill process means natural trigger frequency cannot be inferred from the initial landing's binomial probability alone.

The profiles are fixed and public. Their differences balance the initial multiplier grid and guaranteed Bonus, rather than changing outcomes according to player history. xBet's actual relative bonus frequency is measured in the simulation; this implementation does not simply copy the publisher's advertised five-times claim.

## Extra Spin quotations and the shared cap

The transparent **original** quotation formula uses the frozen `D = CONFIG.extraQuoteDenominator = 28`:

```text
S = sum(all retained position multipliers above 1)
priceCents = ceil(lockedBetCents × max(1, S / 28))
```

For example, at a €0.20 locked bet, thirty retained ×2 cells give `S = 60` and a €0.43 quote; `S = 66` gives €0.48. The upward cent rounding is part of the disclosed price.

An offer appears after a completed non-bonus, non-maximum base or Extra Spin when this price is no greater than that spin's settled award. It retains the base bet, all position multipliers, the original chain identifier and the amount already paid. Accepting debits precisely the shown quote once. A centered modal blocks the underlying game until Buy or No thanks; Escape explicitly declines. Autoplay stops when the offer appears and cannot purchase or reject it automatically. Declining consumes neither money nor RNG. Bet and mode controls remain unavailable while the modal is open; the underlying engine also invalidates a stale offer if bet or mode changes. Extra Spins use the Normal symbol profile and contain no Bonus invitations. They can offer another continuation if eligible.

The **30,000× locked base bet cap** applies to the original paid round and every accepted continuation together. If an original round paid 29,900×, its extra chain can pay at most another 100×. Extra receipts record their local payout and earlier chain offset; their sum is what determines maximum-win status. The publisher's exact pricing formula is unavailable, so this quote and its measured conditional return are not described as identical to Duck Hunters.

## Durable accounting

A pure transition produces a paid debit, complete spin/cascade award, RNG state and active feature together. The UI validates and saves the candidate session before replacing its live state or animating it. Failed persistence retains the earlier live and saved state. Presentation acknowledgments consume no money or randomness. Reload replays or skips an already settled presentation; it does not redraw or credit it again.

Storage uses `studentski-grad-session-v4` with schema 4. Existing `studentski-grad-session-v1`, `studentski-grad-session-v2` and `studentski-grad-session-v3` entries are left untouched and never replayed under the changed rule. The preference key is unchanged, preserving language, sound, volume and speed settings. Bonus-wheel replay and synthetic purchased invitations leave these saved outcomes and grant selections unchanged. Saved data is validated against grids, sequential modifier causes, common per-drop reveals, source-only normal versus upgraded-all target selection, infection-perk guarantees, target multipliers, Wild substitution, win allocation, removals, surviving/refilled positions, bonus entitlements, extra-shot counts, chain offsets and receipts. Active rounds lock further paid actions. History retains the last 100 completed paid receipts, including individual continuation purchases.

The injectable xorshift32 state is deterministic demo randomness, not a real-money random-number certification. Outcomes do not inspect balance or earlier wins/losses; balance only governs affordability. Original Web Audio synthesis has independent presentation randomness.

## Measured validation

The target for the five modes and three direct buys is approximately 96%. A tuning target is not a theoretical result or a guarantee of session profit. Lucky Draw’s expected return follows its weighted tier entitlements: its verified 235× charge equals the 235× weighted direct-buy cost. If all three direct-buy expectations were exactly 96%, Lucky would also return 96%, without modifying payouts.

The final report in [simulation-results.json](simulation-results.json) records actual paid-round debits, full bonus payouts, cap settlement, independent seeds and exact engine/configuration/simulator SHA-256 provenance. It also records positive awards, profitable awards, medians, quantiles, modifier counts, physical matches, upgrade combinations, shot additions and accounting checks. Approximate 95% Monte Carlo intervals can be optimistic for very rare extreme awards; these are not certified theoretical RTPs. Different small stakes can differ slightly because cent rounding is part of the rules.

A separate qualified Extra Spin experiment accepts one offered continuation after each source round and declines subsequent offers. It reports a ratio-of-means confidence interval because quotes vary. Its return describes that conditional cohort and acceptance policy, not the unconditional RTP of an ordinary paid mode or an arbitrary repeat-until-finished strategy.

Independent validation completed **9,000,000 ordinary paid rounds** at a €0.20 locked base bet: five million Normal rounds and 500,000 of each other choice. Each row includes the whole paid round and any triggered free spins, and declines Extra Spin offers. Hit means any positive award; profit means the total award exceeds that choice's actual debit. Median payout is the total settled award in euros, not the net balance change.

| Choice | Paid rounds | Measured RTP | Approx. 95% interval | Hit | Profit over debit | Median payout | 30,000× cap wins |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Normal | 5,000,000 | 95.82% | 90.75–100.88% | 22.04% | 9.71% | €0.00 | 5 |
| xBet | 500,000 | 87.78% | 73.74–101.83% | 14.03% | 2.11% | €0.00 | 3 |
| Day 2 | 500,000 | 96.53% | 90.90–102.17% | 23.33% | 15.99% | €0.00 | 0 |
| Day 64 | 500,000 | 96.64% | 95.20–98.08% | 24.97% | 18.02% | €0.00 | 14 |
| Day 1024 | 500,000 | 95.79% | 95.21–96.37% | 38.73% | 24.20% | €0.00 | 12,991 |
| Buy Dorm | 500,000 | 95.41% | 92.79–98.03% | 81.06% | 7.08% | €0.52 | 88 |
| Buy Friday | 500,000 | 96.23% | 94.62–97.83% | 85.84% | 9.91% | €1.38 | 184 |
| Buy December | 500,000 | 97.98% | 96.95–99.01% | 91.85% | 14.74% | €6.22 | 791 |
| Lucky Draw | 500,000 | 96.02% | 94.44–97.59% | 84.95% | 9.59% | €1.12 | 251 |

The December sample is above the 96% target, with an interval that also lies above it. xBet's lower mean has a much wider interval, reflecting rare large awards. These measured differences are shown rather than replaced with the tuning target. All observed cap wins paid exactly €6,000 at this locked bet; Day 2's largest observed award was €4,494.30 and did not reach the cap. The nine cohorts produced **14,327** actual cap wins in total.

Natural bonus frequency was **0.51702%** for Normal, **2.3022%** for xBet, **0.5070%** for Day 2, **0.5302%** for Day 64 and **0.5906%** for Day 1024. xBet therefore triggered approximately **4.45 times** as often as Normal in this sample. Direct buys always start their bought tier; Lucky Draw selected 249,510 Dorm, 125,294 Friday and 125,196 December features.

| Bonus buy | Actual debit | Mean total payout | Median total payout |
| --- | ---: | ---: | ---: |
| Dorm | €14.00 | €13.36 | €0.52 |
| Friday | €40.00 | €38.49 | €1.38 |
| December | €120.00 | €117.58 | €6.22 |
| Lucky Draw | €47.00 | €45.13 | €1.12 |

Across the ordinary cohorts, recorded badge draws were **12,952,954 normal / 0 upgraded** in base spins, **4,516,066 normal / 0 upgraded** in bonuses without the infection perk, and **0 normal / 8,573,389 upgraded** in bonuses with it. All **6,027,147** drops containing multiple badges revealed one common paying type; none revealed multiple types. Each cohort recorded **zero** accounting errors, cap-accounting errors, physical-count errors and truncated rounds, with no safety events.

The separate Extra Spin cohort processed **1,000,000 Normal source rounds** and accepted **67,460** qualified offers, an offer frequency of **6.746%**. It declined 6,702 subsequent offers. The accepted continuations debited **€30,396.40** and paid **€30,170.07**, returning **99.26%** with an approximate 95% interval of **94.65–103.86%**. Their hit frequency was **23.28%**, profit-over-quote frequency **16.89%**, mean quote **€0.45** and mean award **€0.45**; their median quote was **€0.38** and median award **€0.00**. No accepted continuation reached the cap. All 118,248 recorded badges were normal, and all 33,647 multi-badge drops used a common reveal. Extra accounting, cap-accounting and truncation errors were zero.

Including source-round costs and payouts, this specific source-plus-one-Extra acceptance policy returned **92.46%** on **€230,396.40** of total debits and **€213,028.69** of total awards, with an approximate 95% interval of **85.72–99.20%**. This is a separate experiment, not an extension of the nine-million-round ordinary sample, and its two returns answer different questions: continuation return relative to quoted costs, and the complete source-plus-continuation policy return.

## Current report and historical separation

The [version 2 archive](archive/v2/ARCHIVE.md) preserves source-only normal badges. The [version 3 archive](archive/v3/ARCHIVE.md) preserves the additional normal target with a common symbol reveal per landing and perk-bound upgraded arrivals. Version 4 restores the source-only/common-reveal contract, and the completed frozen-source report identifies `studentski-duck-4`. Earlier reports are retained as history. Current configuration, engine algorithm and simulator hashes were verified against this report; changed sources require a new run.

The report's configuration hash is `66de5e9f92684250b7b188c80ed3e57de2fc163f3fa1ba4fe632f32cde8279e0`, aggregate math-algorithm hash is `c9bb86bf4a0d5e22a1a0999509faed42ca548f810a21ed6e0620744083feb456`, and simulator-program hash is `79b8a5d358c95088fb7e5eefb30f657dc5af362e625c94c2e5c53b54171987fb`. Individual math-source hashes, exact unrounded measurements, each actual seed and public-paytable provenance are stored in the report. These measurements come from the independent validation seed, not publisher RTP declarations, old version 3 metrics or exploratory calibration samples.

## Reproduce the measured run

The completed independent validation covers 9,000,000 paid rounds at €0.20 base bet: 5,000,000 Normal rounds and 500,000 for each other paid choice, plus 1,000,000 source rounds for a separate conditional Extra Spin cohort. The independent base seed is **2817946327**, distinct from exploratory calibration seeds. Per-choice offsets are stored in the report. The measured rows above were populated after completion and source-provenance verification.

Reproduce the complete ordinary cohort and separate Extra Spin cohort in Bash:

```bash
SIM_ROUNDS=500000 SIM_STANDARD_ROUNDS=5000000 SIM_SEED=2817946327 SIM_EXTRA_ROUNDS=1000000 SIM_OUTPUT=docs/simulation-results.json npm run simulate
```

PowerShell users set the equivalent `$env:SIM_*` variables before `npm run simulate`. `SIM_MODE` accepts `standard`, `hunt`, `frames`, `wild`, `god`, `buy-dorm`, `buy-friday`, `buy-december`, `lucky` or `extra`. The identifiers `frames`, `wild` and `god` refer to Day 2, Day 64 and Day 1024, respectively. Each result stores its actual mode-offset seed. Merge requires identical configuration, engine algorithm and simulator hashes; archived v1/v2/v3 diagnostics or earlier candidates cannot be combined with changed sources.
