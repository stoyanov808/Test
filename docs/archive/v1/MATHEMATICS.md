# Studentski Grad: implemented mathematics

This is an original game using virtual euros. The initial release uses **five reels, four original rows, and 1,024 initial ways**. A larger grid remains a future experiment. The production renderer and the simulator call the same pure TypeScript engine in `src/engine`.

All probabilities, prices, paytables, limits, and symbol profiles are in `src/engine/config.ts`. Outcomes do not depend on balance, previous losses, animation speed, audio, or interface language. Injectable xorshift32 state gives repeatable test and simulation runs. This is demo-game randomness, with no real-money integration.

## Payment and ways

Euro amounts are integer cents. Base bets are €0.10, €0.20, €0.40, €0.60, €1, €2, €5, €10, and €20. Each paid round locks its original base bet; bonus payouts keep that bet even after upgrades or reloads. Spin price is a separate number.

| Paying symbols | 3 reels | 4 reels | 5 reels |
| --- | ---: | ---: | ---: |
| Book, coffee, noodles, doner | 0.003× | 0.03× | 1.6× |
| Female student, male student, DJ, couple | 0.006× | 0.06× | 3.2× |

These are **per weighted way** values. Matching starts on the leftmost reel and pays the longest consecutive run of at least three reels once for each matching paying type. Three- and four-reel prefixes are not added to a five-reel payment. Wild-only runs substitute for every applicable paying type and can therefore pay several types.

For a paying type `s` on reel `r`:

`C(s,r) = natural matching copies + sum(Wild copies × that Wild's multiplier)`.

The win is:

`locked bet × per-way paytable value × product(C(s,r), matching reels) × current party energy`.

A framed original cell contributes two identical copies. Wilds can split; scatters and VIP passes cannot. A tall Wild fills all four original positions of its reel, and its multiplier applies to each covered position. Copies add on one reel; combinations and Wild multipliers multiply across different reels. Example: two framed books and one unframed 3× Wild contribute `2+2+3=7`; a framed 2× Wild on the next reel contributes 4; two books on the third contribute 2. The result is `7×4×2=56` weighted book ways.

Paytable entries are stored in millionths of a base bet. The engine sums exact integer/BigInt payout numerators across the spin, applies party energy, and rounds **once per spin** to the nearest cent. Exact half-cent values round up. Thus a very small winning combination can round to €0.00 at a small base bet. Symbol-level visual breakdowns are rounded independently; the authoritative spin award is the once-rounded aggregate.

All twenty original cells framed gives `8^5 = 32,768` possible ways before Wild multipliers. Scatters count once per original symbol, regardless of frames. At most one scatter can occur on each reel.

## Modes and prices

| Paid selection | Total debit | Guaranteed behavior |
| --- | ---: | --- |
| Standard | 1× base bet | Standard profile |
| Party search | 2× | First-reel scatter; hunt profile on remaining reels |
| Exams can wait | 6× | All original positions framed; scatter/VIP cannot split |
| One more, then I'm off | 25× | One tall nudging Wild |
| God of Studentski | 1,000× | Standalone five-position VIP collection |
| Buy Dorm party | 100× | Enter eight-spin tier 1 |
| Buy Friday in Studentski | 300× | Enter ten-spin tier 2 |
| Buy 8 December | 1,000× | Enter twelve-spin tier 3 |

Selections are mutually exclusive. Bonus purchases do not stack with a previously selected booster charge. Insufficient-balance purchases fail before any debit, RNG change, or outcome generation.

Wilds start at 1×. The first stumble has one or two nudge steps; every successful step raises its multiplier by one, to a configured maximum of 3×. Persistent Wilds retain progress, choose distinct new reels on subsequent spins, and nudge only while below 3×. At the limit they can move horizontally without another multiplier increase.

Standard play has a 12% chance of two new frames and a 0.8% chance of a tall Wild. Hunt suppresses random Wilds to preserve its guaranteed first-reel scatter. All other random outcomes use the explicit profiles below.

## Transparent reel profiles

The game shares one paytable across every mode and bonus. Each profile explicitly blends a uniform eight-symbol distribution with a distinct home symbol on each reel: **book, coffee, noodles, doner, male student**. A focus weight, when nonzero, first selects the couple; otherwise the blend chooses a uniform paying symbol or the reel's home symbol. There is no hidden payout scaling or post-draw rejection.

| Profile | Uniform blend | Couple focus | Scatter probability per available reel |
| --- | ---: | ---: | ---: |
| Standard | 1 | 0 | 0.065 |
| Hunt | 1 | 0 | 0.0484; reel 1 guaranteed |
| All-frame booster | 0.554 | 0 | 0.065 |
| Wild booster | 1 | 0.101 | 0.065 |
| Dorm bonus | 0.964 | 0 | 0.035 |
| Friday bonus | 0.244 | 0 | 0.035 |
| December bonus | 0.034 | 0 | 0.035 |

For blend `b` and zero focus, the home symbol has probability `1−b+b/8`; each other symbol has `b/8`. With couple focus `f`, couple probability is `f+(1−f)b/8`; home probability is `(1−f)(1−b+b/8)`; remaining types have `(1−f)b/8`.

Wild reels are selected first and cannot also contain scatters. On a remaining reel, a successful scatter draw replaces one uniformly selected original row. The above probabilities are therefore conditional on an available reel, not a claim of unconditional independent scatter counts across Wild-covered reels. Different profiles balance the large multiplicity of full-reel Wilds and split positions against the shared paytable; they are fixed configuration, never adjusted during a session.

## Bonuses, upgrades, and cap

Three scatters trigger Dorm party (8 spins, persistent frames, energy 1×). Four trigger Friday (10 spins, frames, one persistent Wild, energy 3×). Five trigger 8 December (12 spins, all frames, two persistent Wilds, energy 5×). The paid triggering spin pays at base-game energy 1× and belongs to the same paid round.

Two new original positions gain persistent frames on each bonus spin until every position is framed. Apply the party multiplier at the start of the spin, then add one after a **positive settled win**, up to 25×. A rounded zero win does not increase it.

At least two scatters during a bonus add two spins and upgrade remaining play by one tier. Preserve accumulated frames, achieved Wild multipliers, and the current party multiplier **unchanged**; do not reset energy to the new tier's starting value. Add missing Wilds and, when reaching tier 3, frame every position. At most three retriggers are accepted in the complete paid round. Further scatters neither extend nor upgrade it. The maximum direct-buy length is therefore 14/16/18 spins by initial tier.

The whole paid round, including triggering spin and all free spins/retriggers, is capped at `20,000×` its locked base bet. The engine settles only the unfilled remainder of the cap, then stops the feature. No additional unplayed spin or retrigger can add money after the cap.

## God and the rare Standard event

God is separate from the ways board: five VIP positions receive up to three independent reveal opportunities each. Collected passes remain locked and consume no further draws. All five passes pay `20,000×` the locked bet; an incomplete collection pays zero. There are no other payouts or free spins.

`p = 1 − (1 − 0.048^(1/5))^(1/3) = 0.23075803249924676`.

`[1 − (1 − p)^3]^5 = 0.04800000000000001`.

Exact theoretical success is **4.8%**, zero return is **95.2%**, and theoretical RTP is `0.048×20,000/1,000 = 96%`. At €0.20 bet, God debits €200 and pays either €4,000 or €0. The real sampled result and all three opportunity rounds are committed before their VIP-lock animation.

Standard has an exclusive configured golden-pass event at probability `0.000001` per paid round (1 in 1,000,000), drawn before its ordinary board. It pays the round cap and no other award. God collection success is 48,000 times as likely as this configured event. Standard bonuses can also reach the universal cap, so observed total maximum-win frequency is reported separately from the golden-pass probability. God remains substantially more likely to reach maximum than Standard; Standard's maximum event plus even the upper bound of all naturally triggered bonuses is under 0.25%, versus God's 4.8%.

## Durable state and validation

Explicit phases are `idle`, `presenting-base`, `presenting-bonus`, `bonus-pending`, `presenting-vip`, and `presenting-complete`. A pure engine transition produces a complete outcome, exact debit if applicable, payout credit, RNG state, and new active-round state together. The UI saves the whole candidate session to `studentski-grad-session-v1` before assigning it or animating it. Failed saves retain the earlier live and persisted session.

Presentation acknowledgements change no money and consume no randomness. Reload replays or skips the saved presentation and then generates only the next unscheduled free spin. It never redraws or credits the saved outcome. Active features lock bet/mode and block further paid actions. Session history contains one settled entry per paid round and retains the latest 100.

`npm test` exercises original scatter counting, 56-way split/Wild examples, Wild substitutions, God equation/locking, each price, no stacking, overlap rejection, upgrades and preservation, three-retrigger exhaustion, cap remainder settlement, reload recovery, failed persistence, malformed saves, explicit phase transitions, natural trigger tiers, a genuine deterministic rare VIP sample, and balance-independent deterministic outcomes.

## Measured simulation

The calibration target for non-God modes is approximately **96%**. A target is not a measured result or a guaranteed theoretical value. The final report is `docs/simulation-results.json`, generated through the production engine with €0.20 base bet and actual mode/buy debits. The report includes seed, sample size, stakes, payouts, positive-round hit rate, profitable-round rate, bonus frequency, total maximum-win frequency, and approximate 95% Monte Carlo confidence intervals. Different small base bets can differ slightly because cent rounding is part of the rules.

Reproduce a full 500,000-round validation of the current configuration, then the longer independent Hunt check:

```bash
SIM_ROUNDS=500000 SIM_SEED=400091 SIM_OUTPUT=docs/simulation-results.json npm run simulate
SIM_ROUNDS=2000000 SIM_MODE=hunt SIM_SEED=591823 SIM_MERGE=1 SIM_OUTPUT=docs/simulation-results.json npm run simulate
```

Seeds used for tuning differ from that final validation seed. Rare Standard maximum events make short-sample RTP intervals wide. A zero observed maximum count does not imply a zero configured probability. God's exact 96% formula is reported separately from its sampled return.

The saved report combines the seven unchanged 500,000-round mode results with the two-million-round Hunt validation: **5,500,000 paid rounds**. The row's stored seed includes the mode index offset, so use that row's seed directly when calling the exported `simulate(choice, count, seed)` function.

| Mode | Paid rounds | Measured RTP | Approx. 95% RTP interval | Positive-round hit rate | Bonus frequency | Max-win frequency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Standard | 500,000 | 97.16% | 90.96–103.37% | 22.34% | 0.2466% | 0 observed |
| Hunt | 2,000,000 | 92.43% | 88.71–96.15% | 18.95% | 1.3188% | 0 observed |
| All-frame booster | 500,000 | 96.74% | 93.09–100.39% | 21.13% | 0.2310% | 0 observed |
| Wild booster | 500,000 | 95.81% | 95.04–96.58% | 66.02% | 0.1100% | 0 observed |
| God | 500,000 | 95.49% | 94.31–96.67% | 4.77% | — | 4.7744% |
| Buy Dorm | 500,000 | 96.12% | 95.00–97.24% | 93.58% | Direct purchase | 0.0060% |
| Buy Friday | 500,000 | 95.43% | 94.00–96.86% | 88.25% | Direct purchase | 0.1590% |
| Buy December | 500,000 | 96.07% | 95.47–96.67% | 99.05% | Direct purchase | 1.0372% |

Hit rate means a positive **total settled paid-round award**, even if it is below the actual debit. The JSON also reports the stricter profitable-round rate. Natural bonuses count their triggering paid round once; all their free spins remain in that round's return. God is standalone and has no free-spin bonus frequency.

Hunt's observed return is 3.57 percentage points below the 96% target. It is reported as **92.43% measured**, not relabelled 96%; its approximate confidence interval includes 96%. Heavy-tailed bonus awards keep its interval wider despite the longer run. Standard's configured one-in-a-million VIP event happened zero times in its 500,000-round sample; its analytic probability remains nonzero, and a short run cannot measure that rare frequency reliably. These are Monte Carlo measurements, not certified theoretical RTP values for the non-God modes.
