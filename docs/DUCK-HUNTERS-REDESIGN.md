# Duck Hunters reference and Studentski Grad redesign

Research refreshed on 7 October 2026. This document supersedes the first version's mixed-game design. The reference is **Duck Hunters**. Version 5 keeps the Studentski Grad party theme, verified public table, upgrade wheel and Extra Spin modal. It retains the verified xWays logic from version 4: a normal badge boosts only its source, upgraded infection affects all current matches, and badges on one drop share a common revealed symbol. Smooth top-drop landings and Block 59 / Блок 59 remain.

## Sources and evidence

1. [Nolimit City — Duck Hunters, official game page](https://www.nolimitcity.com/games/duck-hunters): game metadata, named feature descriptions, advertised mathematics and official video links. The page was fetched again for this rewrite.
2. [Official Duck Hunters client rules, English, version 1.1.176](https://partner.nolimitcdn.com/games/DuckHunters/1.1.176/nolimit/translations/en.json): the public rules delivered by the publisher's demo loader. These explicitly state “A 6-reel, 5-row video slot with 14 symbols” and that Bombs double the **multiplier** on affected positions.
3. [Scatter Wins — official footage](https://fan-cdn.nolimitcity.com/Scatter_Wins_Duck_Hunters_c5201e0ab3.mp4), 29.27 seconds: decoded and visually inspected, including full-resolution frames around 11, 12 and 15 seconds.
4. [Big Game Spins — official footage](https://fan-cdn.nolimitcity.com/Big_Game_Spins_Duck_Hunters_ec130a88a7.mp4), 40.93 seconds: decoded and visually inspected for the buy menu, trigger, bonus introduction, upgrade presentation, persistent multipliers and winning formulas.
5. [Day 1024 Spins — official footage](https://fan-cdn.nolimitcity.com/Day_1024_Spins_Duck_Hunters_0c03cc18b7.mp4): decoded and visually inspected for starting cell multipliers and subsequent cascades.
6. [Extra Spins — official footage](https://fan-cdn.nolimitcity.com/Extra_Spins_Duck_Hunters_c1804d8d3e.mp4): decoded and visually inspected for the priced continuation offer, retained cell state and illustrated win presentation.
7. [Official public demo client, version 1.1.176](https://demo.nolimitcdn.com/games/DuckHunters/1.1.176/game.js): inspected to establish the publicly rendered paytable structure and base-bet conversion. Its numeric amounts come from server initialization data. Its generic template contains an unused `M5` placeholder; that placeholder alone does not establish a tenth paying symbol. No publisher code is used in this project's implementation.
8. [Official public guest demo](https://demo.nolimitcdn.com/loader/game-loader.html?game=DuckHunters&operator=FANPAGE_DEMO&language=en&device=desktop&playForFunCurrency=EUR): initialization captured on 7 October 2026 at 05:39:09 UTC. It supplies **nine regular paying symbols**, five lows and four mediums, their exact numeric awards, and current feature-buy prices. The sanitized research receipt is [duck-hunters-public-paytable.json](duck-hunters-public-paytable.json). It contains no guest session keys, player identifiers or private operator credentials.

The current official page does not expose a Duck Hunters game-sheet PDF: its game-sheet field is empty. Its linked public promotional archive could not be downloaded because its server returned HTTP 403. The public demo now provides an independently verified numeric paytable and feature prices. Complete reel strips and random feature occurrence probabilities remain undisclosed; those must not be silently inferred from promotional currency amounts or the displayed paytable.

### Public paytable verification route

The publisher's [public guest launcher](https://demo.nolimitcdn.com/loader/game-loader.html?game=DuckHunters&operator=FANPAGE_DEMO&language=en&device=desktop&playForFunCurrency=EUR) is reconstructed from its documented loader options and the current official site's demo configuration. It uses demo credits and supplies no real-money operator token. The initialization request is `POST https://demo.nolimitcity.com/EjsFrontWeb/fs`, with `action=open_game`, `clientString=FANPAGE_DEMO`, `language=en`, `gameCodeString=DuckHunters@desktop`, and `playForFunCurrency=EUR`.

The guest launcher then establishes its returned game connection and receives initialization data containing `symbolValues`. The public client renders the symbol's 12+ award as `symbolValues[symbol][12] / 20`, 10–11 as index 10 divided by 20, and 8–9 as index 9 divided by 20. Its multiplier data attribute also uses index 8. Both bracket endpoints should therefore be checked against the actual data, rather than assuming equality without a response. These values are multipliers of the **base bet**, not the boosted or bonus-buy cost. The retrieved bracket endpoints are equal for every regular symbol: index 8 equals 9 and index 10 equals 11. Its regular paying identifiers are five lows (`L1` through `L5`) and four mediums (`M1` through `M4`).

The separate research script [fetch-paytable.mjs](../scripts/research/fetch-paytable.mjs) opens that public launcher through Playwright, decodes its WebSocket JSON and saves only the public symbol values, base-bet conversions and feature-price fields. It does not save guest session keys or copy publisher code or assets into the game. Run it from this checkout after installing dependencies and Playwright Chromium:

```bash
npx playwright install chromium
node scripts/research/fetch-paytable.mjs duck-hunters-public-evidence
```

The script uses Playwright's installed browser on Windows and macOS, with an existing system Chromium fallback on Linux. `CHROMIUM_PATH` can select an existing browser executable.

The captured client is version **1.1.176**, with the same SHA-256 hash as the previously inspected partner-host copy. The following public values are applied to the original Studentski Grad symbols, in ascending value order:

| Studentski Grad symbol | Reference identifier | 8–9 | 10–11 | 12+ |
| --- | --- | ---: | ---: | ---: |
| Book | L5 | 0.10× | 0.15× | 1.00× |
| Coffee | L4 | 0.10× | 0.20× | 1.25× |
| Noodles | L3 | 0.10× | 0.25× | 1.50× |
| Doner | L2 | 0.10× | 0.30× | 1.75× |
| Beer | L1 | 0.10× | 0.40× | 2.00× |
| Student woman | M4 | 0.15× | 0.60× | 2.50× |
| Student man | M3 | 0.15× | 0.70× | 3.00× |
| DJ | M2 | 0.20× | 0.80× | 3.50× |
| Bouncer | M1 | 0.30× | 1.00× | 5.00× |

The exact numeric public table replaces the earlier provisional awards. The generic client's unused `M5` placeholder had led the initial research to infer ten paying symbols; the retrieved initialization and nine actual symbol icons correct that inference. Couple artwork is reserved for presentation and celebrations rather than an invented tenth paying entry.

Research receipts retain SHA-256 hashes for the downloaded originals and inspected frames. The inspected public client hash is `8f6518dd22fe2fe5b4bd36ed2605d4d266452a84282dcbc394c05f374a7f2f40`; its English rule data hash is `15822432679e17fd6b9abed38161a5804e21d81fd28360315846641f20531066`. The Day 1024 footage used to verify the Bomb origin has hash `7e62dd12a3261d9703d915488e28bb876d64347b8b1f603cf99a105654482402`.

## Observable game contract

| System | Verified reference behavior | Studentski Grad adaptation |
| --- | --- | --- |
| Grid | Six columns, five rows; 30 physical positions. Both the client rules and footage confirm this. | Use the same 6×5 structure for the requested Duck Hunters rewrite. |
| Winning rule | Eight or more matching paying symbols anywhere on the board. No connection from reel one and no traditional ways count is required. | Show the actual matching count and applicable paytable bracket. Symbols in the last columns count exactly as symbols in the first columns. |
| Paytable brackets | 8–9, 10–11, 12+; nine regular paying symbols, five lows and four mediums, with the numeric values verified in public guest initialization. | Apply the exact public numeric table above to the original themed symbols. |
| Wild | Substitutes for another symbol except Bonus. | A distinct original Studentski Wild contributes to the count of paying symbols. |
| Cascades | Winning symbols are removed and replacements drop into the vacancies. Continue resolving the board until it has no further win or active removal. | Each round contains a visible sequence of actual board states; the payout comes from those states. |
| Position progress | A winning removal leaves ×2. A later winning removal in the same position doubles its existing multiplier, up to ×8192. | Store progress on the position, draw it on that cell, and leave it visible when replacements arrive. |
| Winning multiplier | Footage shows addition of the marked winning-position multipliers. Neutral positions do not add an extra ×1 to this sum. A win without marked positions receives no multiplier boost. | Show the base award, sum of participating marked cells, and resulting award. This prevents a vague global multiplier from hiding the calculation. |
| xWays | Reveals a regular paying symbol and boosts its source position by ×2, ×4 or ×8. Multiple xWays on a landing reveal the same regular symbol. Normal xWays does not infect a second symbol. | Follow the verified source-only normal boost and common revealed type across all badges on one drop. Multiplier values do not create extra physical symbols; the earlier source-plus-one variation is retired. |
| Infectious xWays | The revealed source applies its factor to all already visible matching regular symbols. | The upgraded badge has a distinct appearance and links to all current matching targets. The infection perk guarantees every badge draw in that feature is upgraded. Future unrevealed badges remain untouched until their turn. Physical counts remain independent of multipliers. |
| Bomb | Clears adjacent **regular paying symbols** in a 3×3 area and doubles the affected position multipliers. Bonus and Wild are unaffected. All Bombs explode before the next collapse. | An original party confetti charge performs the same board operation. Resolve all its removals before falling replacements. |
| Bonus persistence | Position multipliers remain during free spins. | Bonus play keeps each cell's progress between its spins, without introducing the first version's unrelated fixed full-reel Wild system. |
| Extra shots | An Extra +1 Shot landing awards one spin. The shot upgrade replaces it with Extra +2 Shots. | Award the extra spin once for its landing and make the change to remaining spins visible. |
| Maximum award | 30,000 times the base bet; reaching the cap ends the game round at that award. | Apply the same cap to the whole paid round, including its cascades and bonus. |

The current official page's prose summary incorrectly calls the board 5×5. Its own “Reels/Rows” value is `5-5-5-5-5-5`; the client rules and official gameplay show six columns. The feature paragraph's phrase “symbol size gets doubled” is also imprecise: the client rules explicitly say the **position multiplier** is doubled. These discrepancies are why the rewrite follows the primary rules and visible calculations.

### Independent winning-formula observations

In Scatter Wins, around 11–12 seconds, eight physical duck symbols each display ×2. The shown formula is **0.28 × 16**: eight marked cells ×2 add to 16. Those eight cells remain an eight-symbol win, rather than becoming sixteen counted symbols.

Around 15–16 seconds, eight can symbols win; three winning positions display ×4 and the remaining winning positions are unmarked. The shown formula is **0.28 × 12**, followed by **3.36**. The three marked positions contribute 4 + 4 + 4; the five neutral positions do not turn this into ×17.

In Big Game Spins, around 22–23 seconds, the shown formula **0.10 × 56** produces **5.60**, with visibly different local position values participating. This supports a sum of local multipliers rather than their product, their maximum, or a fixed round-wide multiplier.

The Scatter Wins clip crops out its bet controls. The displayed 0.28 is a currency award whose base bet is not visible. It cannot establish a 1.4× paytable entry by assuming a €0.20 bet. Edited promotional clips can also combine recorded sessions, so a preceding menu's selected bet is insufficient evidence for every subsequent win's denomination.

### Modifier ordering and Bomb origin

The Day 1024 footage independently resolves a detail absent from the prose summary. At 4.5 seconds, the Bomb sits at column 2, row 2, and every position begins at ×1024. At 5.5 seconds the Bomb and its affected regular neighbors have disappeared, and the **Bomb's own position also displays ×2048**. The adjacent Bonus at column 1, row 1 remains in place and retains ×1024. This confirms that the detonation doubles its source position as well as affected regular positions; protected Bonus positions remain unchanged.

In Big Game Spins around 20–21 seconds, the surviving Infectious badge reveals after existing regular symbols are present. Its own cell becomes the common symbol, and the infection raises multipliers on the other matching regular symbols. A future unresolved badge must not be treated as an already revealed matching regular symbol. Each transformation should be presented in its actual resolution order.

**Version 5 rule:** normal badges boost only their source. Upgraded infection boosts all current matches, and every badge on a drop reveals the same regular symbol. Resolution is column-major, row-minor; Wild, Bonus, Bomb, shot and future unresolved badges are never infection targets. Later infections can affect earlier revealed sources. Version 3’s additional normal target is preserved in `archive/v3`, rather than the current rule. The shared reveal follows the verified reference, with no independent-type variation. This sampler permits rare natural upgraded arrivals with a fixed original 0.5% conditional badge probability. The infection perk guarantees upgraded-only arrivals. Public sources establish the observable perk guarantee, but do not establish this original occurrence rate. A fixed lottery when an ordinary paid drop first reaches three invitations promotes it to four (10%) or five (2%), before evaluation and commitment. These probabilities are independent of previous wins, losses and spin count. Fresh measurements below identify the frozen sampler and exact source hashes.

## Bonuses, boosters and continuation

| Feature | Trigger / price in base bets | Verified entitlement |
| --- | --- | --- |
| Duck Hunt Spins | 3 Bonus symbols; direct buy 70× | 7 initial spins and 1 randomly awarded upgrade. |
| Hawk Eye Spins | 4 Bonus symbols; direct buy 200× | 8 initial spins and 2 randomly awarded upgrades. |
| Big Game Spins | 5 Bonus symbols; direct buy 600× | 10 initial spins and all 3 upgrades. |
| Lucky Draw | 235× | The filmed menu displays 50% / 25% / 25% tier chances. |
| xBet | 2× | Guaranteed Bonus symbol on column two; the official description advertises five times the free-spin likelihood. |
| Day 2 | 2.8× | Every position begins at ×2. |
| Day 64 | 90× | Every position begins at ×64. |
| Day 1024 | 3000× | Every position begins at ×1024. |
| Extra Spin | Variable, based on retained position state | May be offered when its price is no greater than the preceding win; keeps position multipliers and excludes Bonus symbols. |

The direct-buy prices are independently confirmed by public guest initialization and the Big Game Spins footage. At 1.0 seconds, the filmed menu clearly shows **€235** for Lucky Draw with a **€1** base bet, confirming **235×** and correcting the earlier 230× transcription. Its displayed tier chances are 50% / 25% / 25%. The three available upgrades are **all xWays become Infectious**, **Bomb area becomes 5×5**, and **Extra +1 Shot becomes Extra +2 Shots**. Awarded upgrades define the feature's capabilities; individual spins still have random landings. The public reference does not promise a fixed number of sticky Wild reels, and none of these upgrade guarantees should be described as a minimum number of Wilds.

Duck Hunters' official feature list does not describe a separate VIP-lock collection or a standalone God Mode. Its highest listed starting-multiplier booster is Day 1024. The first version's VIP collection and inherited mechanics from other Nolimit titles should therefore not survive this rewrite as supposed Duck Hunters behavior.

The live rendered paytable independently displays **nine** regular paying entries and all 27 awards from the initialization table at a **€1** base bet. Its rules also display the following **publisher advertised mode RTPs for the current public guest configuration**, client version 1.1.176:

| Publisher mode | Advertised RTP |
| --- | ---: |
| Base | 96.05% |
| xBet | 96.03% |
| Day 2 | 96.04% |
| Day 64 | 96.04% |
| Day 1024 | 96.05% |
| Duck Hunt buy | 95.87% |
| Hawk Eye buy | 96.07% |
| Big Game buy | 96.00% |
| Lucky Draw buy | 95.96% |

These declarations belong to the publisher's demo configuration. They do not disclose its private reel probabilities, and they are not measured returns for Studentski Grad. A sanitized DOM receipt records the nine rendered rows, the nine RTP declarations and the displayed client version; its SHA-256 is `486c691fbf719de654ea631c35d965e6d293eb61754c84f11463a1db7106f55b`. The inspected screenshot is retained separately as research evidence, not as a production asset.

The publisher advertises **96.05% RTP**, **17.07% hit frequency**, a free-spin frequency of **1 in 203**, and a max-win probability of **1 in 22 million** for its own game. These are reference facts, not verified statistics for Studentski Grad. Higher symbol awards alone do not guarantee a profitable session. The replacement game's actual engine needs separate measured hit frequency, paid-round return, bonus distribution and tail results, using the same configuration played in the browser.

## Presentation observations and original art direction

The official board dominates the scene. It sits inside a worn fence and vegetation, with large caricature heads, recognizable small objects, illustrated special symbols and bold local numbers. The regular play background has summer greens and blue sky. Big Game Spins changes to orange autumn trees and warm yellow ground under a cyan sky. The upgrade panel remains beside the board, so feature capabilities and persistent progress remain legible during play.

The Studentski Grad adaptation uses dorm blocks, party kitchens, takeaway objects and adult student portraits. Presentation 5.2 uses new original tool-generated painterly art with natural facial planes, dimensional materials and worn architectural surfaces; distinct authored SVG feature signs remain. Its longer normal/turbo presentation gives factor transfers and resulting awards time to register. Actual symbols descend once from above on initial landings and refills, with staggered columns and smooth settling; no reel strip cycles through repeated symbols. The dorm name is Block 59 / Блок 59. Source clips, photographs, publisher sprites and recorded audio remain research references; they are not production assets. The current asset records identify the generated raster atlases and retained authored vector signs; commercial assets and footage remain outside the production art.

| Observed sequence | Timing in the official clips | Adaptation |
| --- | --- | --- |
| Win selection | Scatter Wins roughly 11–12 seconds: nonwinning symbols dim, winning cells acquire crosshairs, and a formula appears. | Use a visible Studentski target-ring treatment, dim unaffected cells, and show count plus award formula before removal. |
| Clear and refill | Roughly 12–17 seconds: impact puffs clear the winners, exposed cell multipliers increase, then replacements drop; another award follows. | Animate removal, multiplier growth and refill as separate stages so every cascade can be followed. |
| Bonus introduction | Big Game Spins roughly 12–17 seconds: an illustrated vehicle arrives with the spin award and Continue; a wheel and an upgrade card explain the granted changes. | Show an original party wheel: one Dorm pointer, two distinct Friday pointers, or a stationary December wheel with all three grants. The wheel displays preselected persisted upgrades; it does not choose another result. |
| Persistent bonus | Big Game Spins roughly 18–29 seconds: orange surroundings and a side upgrade panel remain while local values grow. | Change the district's lighting and scenery, retain the upgrade panel and keep progress on the board. |
| High-state booster | Day 1024: all positions visibly begin with large values; their subsequent gains remain local. | Give the starting state its own brief reveal and readable cell badges rather than a generic “God” screen. |
| Continuation | Extra Spins begins with a priced Yes / No offer; its spin retains the previous board's multipliers. | Open a centered modal over the blurred game, show the actual EUR debit, stop autoplay, and wait for Buy or No thanks. Never debit or consume RNG for decline. |
| Large award | Extra Spins roughly 19 seconds onward: an illustrated scope vignette replaces the board for a count-up. | Use an original Studentski vignette, a skippable amount count-up, and a clear return to the board. |

These are edited demonstrations, not measurements of every ordinary spin or a guarantee of a fixed animation duration. The top-drop motion and cause ordering guide the implementation; its easing and durations are original settings, without a claim to reproduce proprietary animation curves or universal “official” millisecond timings. Turbo should shorten the presentation without changing settled board states or awards.

The downloaded Scatter Wins clip contains an AAC stream, but decoded samples have zero amplitude: FFmpeg `astats` reports peak and RMS levels of negative infinity. Sampled Big Game and Extra Spins windows likewise measured digital silence. This research therefore makes no claim to have heard Duck Hunters' music, voices or impact sounds. Studentski Grad should use original short cues for landing, transformation, infectious spread, charge detonation, multiplier growth, bonus award, extra shot and count-up; audio starts after interaction and keeps separate mute and volume controls.

## What is deliberately original and must remain reviewable

The title, student characters, Bulgarian setting, illustrations, sound synthesis, English/Bulgarian copy and EUR demo-credit ledger are original. The public scatter-pay mechanics and observed feature structure guide the implementation. The numeric paytable and current feature prices match the independently retrieved public guest initialization. The party-wheel pointer arrangement and bought-bonus 3/4/5 invitation receipt animation are also original presentation choices; they replay persisted entitlements and consume no gameplay randomness. The random symbol distributions remain this game's own configuration because the publisher does not disclose its full random model. Fresh version 5 simulation results must report the restored source-only normal badges, shared reveal and actual probabilities rather than repeat the publisher's RTP label or reuse earlier-version statistics. Earlier source-only results are archived in `archive/v2`; the source-plus-one/common-reveal version is archived in `archive/v3`, and version 4's perk-only sampler and slower presentation are archived in `archive/v4`. No balance-dependent outcomes, compensating payouts after losses, forced session profitability or hidden win normalization should be introduced.

## Normal xWays presentation recheck, 8 October 2026

The [official English rules](https://partner.nolimitcdn.com/games/DuckHunters/1.1.176/nolimit/translations/en.json) say normal xWays transforms into a regular symbol and increases its position multiplier by 2, 4 or 8. The separate Infectious rule affects the other matching symbols. [Official Scatter Wins footage](https://fan-cdn.nolimitcity.com/Scatter_Wins_Duck_Hunters_c5201e0ab3.mp4), around 25–27 seconds, shows normal reveal locally. The user selected an original cosmetic beer copy/reveal cue while retaining these payouts: beer marks a visible same-type reference, and a symbol image returns into the original badge. That reference keeps its multiplier. Revision 5.1 makes the hit splash larger and longer-lived without adding a payable cell or changing mathematics.

### One-way beer presentation, 8 October 2026

The user replaced revision 5.1’s returning copy cue with the upgraded badge’s outward flight and splash animation for normal xWays. Normal beer now visits every already visible matching regular as a presentation cue. Its source reveals in place; no bottle or symbol image travels back. The engine still boosts only that source. Upgraded beer continues to mark its actual recorded multiplier targets. This is an original themed visual adaptation; cosmetic normal recipients do not change the verified payout rule or consume random outcomes. Presentation 5.2 also adopts new original painterly adult portraits and student-life scenes, with provenance in `public/art-v3/README.md`.
