# Studentski Grad presentation, revision 5.5

Presentation 5.5 keeps Sofia student nightlife and the 6×5 board, with painterly adult portraits and material textures. Each symbol has an independent fall and a short, subtle contact shake instead of moving as part of a rigid column. Official Duck Hunters footage guides the top drops and cause-before-result sequence; the motion curves, party-wheel layout and Studentski Grad illustrations are this adaptation's own work. Both xWays variants open and reveal the selected regular symbol before applying their effect. Normal xWays boosts its source in one local hit; upgraded infection sends beer to all recorded matching targets. Badges on a drop share one common revealed type. Bought invitations vary their reels and rows while retaining the same purchase layout on reload. Grid cells no longer show hover outlines or tooltips.

## Reference and original visual direction

[The research record](DUCK-HUNTERS-REDESIGN.md) cites official footage and timestamps. It establishes a physically fixed board, visible persistent position multipliers, targeted awards, symbol removal, cell growth and falling replacements. Sequential infections resolve before awards; Bombs follow the identified wins and precede the next drop. A feature entrance introduces the granted upgrades and a changed bonus scene.

The production setting uses original painterly illustrations of adult students, textured takeaway objects and lived-in Sofia nightlife. Natural facial planes, small eyes, articulated hands, cloth folds, reflected glass and rough painted surfaces replace the previous clean mascot look. Books, coffee, noodles, doner and beer remain distinct at reel size. The board, multiplier numbers, feature indicators and controls form one illustrated stage.

The [new asset record](../public/art-v3/README.md) documents original tool-generated PNG artwork and exact atlas crops. The [vector asset record](../public/art-v2/README.md) describes the retained authored SVG feature signs. Publisher sprites, web photographs, promotional frames and recorded commercial audio are research references.

## Recorded settlement replay

1. Fade the previous symbols, then drop each actual recorded 6×5 symbol once from above. Each symbol has its own launch time, travel duration, easing, sideways drift and rocking. A short contact compression and shake settle exactly upright at the cell. Symbols never wrap through the board, repeat on a cycling strip or change identity during flight. Position multiplier panels remain behind them.
2. Reveal the common selected symbol on each badge in recorded sequence. The speaker rocks and shrinks as the paying symbol expands into its cell. At 32% of either badge's animation, the revealed symbol is fully visible with the old position values. Hold this reveal before applying a multiplier: normal xWays gives one local beer/foam hit at 56%; upgraded xWays starts its beer flights at 48%, with recorded target impacts staggered from 78% to 88%. The normal floating number shows the resulting position total, including multiplication of an existing value. Cell values and the highest-multiplier panel update at each recorded impact. The infection perk makes all arriving badges upgraded; otherwise 0.5% of badge draws are naturally upgraded. Large filled amber bursts, a foam crown and trailing liquid droplets mark the impacts. There are no copied paying symbols. Unresolved future badges remain badges; a later infection can compound an earlier revealed source.
3. Show each extra-shot award independently of Wild substitution.
4. Mark participating physical scatter-win cells, display the base-stake award and sum of marked multipliers, then clear the paid cells and double their position values.
5. Detonate recorded Bombs, protect Wild/Bonus symbols and show affected cell growth, including the Bomb source.
6. Move surviving symbols down from their real source cells and drop each new symbol once from above. Short-distance survivors travel faster; survivors already in their destination stay still. Cells have independent timing and movement while preserving their order within each reel. Replay the next recorded cascade; position progress stays at its coordinates.
7. Finish the round or continue its bonus with retained multipliers and awarded upgrades visible.

The current rule matches verified Duck Hunters normal source-only and common-reveal behavior. Version 3’s additional normal target is preserved only in its historical archive. Neither implementation counts multiplier values as additional physical symbols.

These are presentation timings chosen for this game, not claimed publisher millisecond specifications:

| Stage | Normal | Turbo |
| --- | ---: | ---: |
| Independent top drop, seed 4 profile | 1,325 ms | 719 ms |
| Normal badge local reveal and boost | 900 ms | 495 ms |
| Upgraded infection core | 1,120 ms | 616 ms |
| Winning-award hold | 640 ms | 240 ms |
| Winning removal | 260 ms | 130 ms |
| Additional clear / pause | 300 / 110 ms | 150 / 70 ms |
| First replacement drop, seed 4 profile | 674 ms | 418 ms |
| Bought-bonus invitation top drop | Same individual-cell planner | Same individual-cell planner |
| Bonus-invitation emphasis | 1,250 ms | 750 ms |
| Dorm/Friday wheel rotation | 4,100 ms | 2,900 ms |

The old board fades for 140/90 ms, with column offsets of 90/40 ms and bottom-first row offsets of 18/10 ms (Normal/Turbo). Each cell adds a small local launch jitter and varies its 520/300 ms base flight by ±7%. Refills use a 430/260 ms base scaled by the actual fall distance. A receipt-derived hash chooses each cell's profile without consuming gameplay randomness; reload therefore preserves its animation identity. The complete drop duration includes the slowest cell's contact settle, so it varies with the recorded board. The table gives a reproducible seed 4 example, rather than one universal duration.

Each cell varies the exponent of a monotonic quintic easing curve. Up to 3.6 pixels of airborne sideways drift and about 3.5 degrees of rocking give the symbols distinct movement. A 96–130 ms Normal / 60–82 ms Turbo contact settle adds a small damped shake and roughly 3–4% compression. Centers continue downward without vertical rebound. Bottom-first arrivals and a minimum center gap keep independent symbols from overtaking. Stationary survivors remain at their exact centers with no shake. Each column has one landing sound cue when its last cell arrives; position labels remain fixed and upright. Initial paid spins, free spins, Extra Spins and purchased invitations share this planner. System `prefers-reduced-motion` suppresses the added drift, rocking, contact shake and compression. Grid cells have no hover outline, native/DOM tooltip or pointer cursor; clicking an active board still skips replay.

Turbo retains a separate reveal beat. Within the existing core durations, the normal revealed symbol holds for approximately **216 ms Normal / 119 ms Turbo** before its local boost. Upgraded reveal holds for **179 ms / 99 ms** before the first beer flight. Its targets then grow as the bottles arrive. Each splash begins at its first actual painted frame and lasts **280 ms Normal / 160 ms Turbo**; a short finish hold keeps late impacts visible before the next badge opens. This prevents slow frames or an in-flight screenshot from aging an unseen splash. These are original presentation settings. Skip shortens only replay, including that hold; all grids, targets, multipliers and awards were settled by the engine before animation. Reload replays that same committed outcome, and interruption never rerolls, recharges or reapplies accounting.

## Bonus entry and the party wheel

A direct buy or Lucky Draw first stages exactly **3 Dorm, 4 Friday or 5 December invitations** landing on distinct reels. A local hash of the immutable presentation identifier, tier and initial grid determines the decorative reel selection and rows. Different purchases can therefore show different layouts, while reload restores that purchase's exact layout. This bought-bonus landing is a receipt animation: it draws no gameplay random outcome, pays no scatter award, adds no extra spin and never charges again. Future first-spin special symbols are replaced with stable coffee/book fillers for this staging, so its opening does not expose later badge or upgrade arrivals. A natural bonus uses its actual engine-recorded trigger symbols.

The wheel then reveals the engine-selected, already persisted upgrades:

- Dorm: one pointer and one awarded upgrade.
- Friday: two pointers indicating two different upgrades.
- December: a stationary wheel with all three upgrades already marked; no unnecessary spin.

Dorm and Friday rotate, land on their recorded upgrades and wait for Continue. Award cards reveal at landing. The wheel keeps the underlying game inert and blurred, with keyboard focus in its dialog. Bought invitation staging and the wheel stay over the preceding scene; the free-spin scene begins only after Continue. The artwork labels the available infection, larger-Bomb and +2-shot upgrades. The wheel does not choose perks, alter random state or re-roll on reload or skip. Its pointers are a visual explanation of the existing entitlement. The normal badge uses one teal speaker; upgraded infection uses magenta twin speakers on reels, wheel and feature menus. The cyan-edged magenta BONUS invitation and crowned gold WILD remain distinct from both.

Each bonus uses a distinct Studentski Grad scene while retaining the board's position progress: a lived-in pre-party kitchen, a Friday nightclub bar and speakers, or a winter 8 December student stage. Large awards use an original friends-and-toast vignette and a skippable euro count-up.

## Extra Spin decision

An eligible offer opens a centered modal over a dimmed, blurred game. It explains the retained multiplier grid, locked base bet, absence of Bonus symbols and exact euro debit. The game waits for **Buy spin** or **No thanks**; Escape is an explicit decline. The underlying controls are inert and keyboard focus remains in the decision. Ordinary Space or reel clicks do not start a different paid round behind it.

Autoplay stops as soon as an offer appears. It neither buys a continuation nor silently declines it. Reload restores the saved offer, and declining consumes no money or gameplay randomness. Accepting uses the saved quote and the same multiplier grid, with the whole continuation chain sharing its cap.

## Audio, language and validation

The decoded Duck Hunters promotional clips carry digital silence despite AAC tracks, so no heard commercial soundtrack is claimed. Original Web Audio cues mark landings, reveals, factor transfers, Bombs, shots, refills and awards. Scene layers change with the bonus setting. Audio starts after interaction and provides mute and volume controls.

BG/EN covers controls, rules, wheel labels, confirmations, modal decisions and euro amounts, including Block 59 / Блок 59. Fresh browser validation checks desktop/touch layouts, actual painted symbol trajectories and rotation, beer bottles and foam impacts at recorded targets, natural upgrades, wheel grants, reload/skip equivalence and Extra decisions.

Measured frame timings are recorded in `test-results/browser-results.json` after the current-source run. Earlier observed timings remain in the version 4 archive. Nominal durations above describe this version; frame scheduling adds some overhead.

The [current validation receipt](presentation-validation.json) records **62 engine tests and 49 browser checks**, against **50** verified source/artwork hashes. The production build passed; production Normal and purchased Dorm play/reload matched the pure engine exactly, with development hooks absent and no runtime errors.

The browser observes actual canvas transforms alongside the read-only motion trace, checking per-cell timing and rotations within one reel, post-contact compression, physical symbol identity, monotonic descent, stationary survivors, minimum center spacing and anchored multiplier labels in both speeds. Moving over all thirty idle cells leaves the actual canvas pixels and paid session unchanged, with no tooltip or pointer cursor; a busy-board click still settles exactly the original receipt. Timing observations run uninterrupted; separate exact-fixture replays supply impact screenshots. The receipt retains current timing samples for drops, reveal holds and painted splashes, plus reload equivalence, eighteen varied bought-invitation layouts and the remaining-spins counter.

The unskipped seed 4 sample observed an initial drop of **1,342 ms Normal / 727 ms Turbo**, with refills at **633–685 ms / 386–438 ms**, including frame scheduling. Its initial cells had 30 distinct launch times and 23/21 distinct flight durations; actual post-contact compression appeared in both initial falls and refills. The committed receipt includes representative same-reel and stationary-cell frames with their matching actual canvas transforms; the full run trace remains in `test-results/browser-results.json`.

The original painterly set introduced in revision 5.2 supplies all nine regular symbols and four scenes. Paying-symbol atlas cells are isolated on transparent backgrounds; the renderer and menu previews crop the same originals. Scene crops retain the student-life theme while keeping the reel area quiet. Bonus and Wild retain their contrasting silhouettes. Versioned `?v=5.5` requests identify the current presentation assets and avoid stale cache requests.

The dedicated BG/EN bonus counter sits above the reels on desktop and mobile. It shows the full award at entry, consumes each spin when play begins, adds recorded shot awards as they appear, and stays visible at zero during the final spin and completion overlay. It reads the committed presentation without consuming RNG, crediting money or exposing future shot awards.

All version 5 mathematics, storage and simulation source hashes are unchanged by this presentation revision.

## Reproducible screenshot gallery

The [gallery](GALLERY.md) records 14 actual playthrough frames: normal reveal and ×2/×4/×8 impacts, upgraded reveal and beer spread, all three wheel entitlements, December cell growth, a large Day 64 award, an Extra Spin quote, and Bulgarian/English max-win screens. `npm run capture:gallery` uses real UI choices and selected seeded outcomes; read-only frame holds make the chosen moments reproducible. Each completed session is compared with the pure engine, including money and random state. The [gallery receipt](screenshots/gallery/receipt.json) identifies every seed, mode, debit, payout, recorded effect, captured phase and source/image hash. The max example is an actual 30,000× award at a €0.20 base stake, with the €600 Day 1024 mode cost disclosed.
