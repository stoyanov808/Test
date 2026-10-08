# Studentski Grad presentation, revision 5.3

Presentation 5.3 keeps Sofia student nightlife and the 6×5 board, with painterly adult portraits and material textures, a larger integrated game stage and faster normal/turbo presentation with damped falling wobble. Official Duck Hunters footage supplies the cause-before-result sequence. The party-wheel layout and Studentski Grad illustrations belong to this adaptation. Normal xWays now reveals and boosts its own position in one local hit; upgraded infection continues to send beer to all recorded matching targets. Badges on a drop share one common revealed type. Bought invitations vary their reels and rows while retaining the same purchase layout on reload. Initial landings and refills use smooth one-way top drops, with no spinning or cycling strip.

## Reference and original visual direction

[The research record](DUCK-HUNTERS-REDESIGN.md) cites official footage and timestamps. It establishes a physically fixed board, visible persistent position multipliers, targeted awards, symbol removal, cell growth and falling replacements. Sequential infections resolve before awards; Bombs follow the identified wins and precede the next drop. A feature entrance introduces the granted upgrades and a changed bonus scene.

The production setting uses original painterly illustrations of adult students, textured takeaway objects and lived-in Sofia nightlife. Natural facial planes, small eyes, articulated hands, cloth folds, reflected glass and rough painted surfaces replace the previous clean mascot look. Books, coffee, noodles, doner and beer remain distinct at reel size. The board, multiplier numbers, feature indicators and controls form one illustrated stage.

The [new asset record](../public/art-v3/README.md) documents original tool-generated PNG artwork and exact atlas crops. The [vector asset record](../public/art-v2/README.md) describes the retained authored SVG feature signs. Publisher sprites, web photographs, promotional frames and recorded commercial audio are research references.

## Recorded settlement replay

1. Fade the previous symbols, then drop each actual recorded 6×5 symbol once from above. Stagger columns and rows, and ease smoothly into the destination cell. Symbols never wrap through the board, repeat on a cycling strip or change identity during flight. Position multiplier panels remain behind them.
2. Reveal the common selected symbol on each badge in recorded sequence. A normal badge multiplies its source position only: the symbol reveal, local beer splash and resulting cell multiplier appear together at 22% of the badge animation. Its floating number shows the resulting position total, including multiplication of an existing value; the highest-multiplier panel updates at the same hit. Normal xWays uses one local impact. An upgraded badge sends its factor to every already visible matching regular symbol, with beer bottles following arcs to the recorded targets. The infection perk makes all arriving badges upgraded; otherwise 0.5% of badge draws are naturally upgraded. Large filled amber bursts, a foam crown and trailing liquid droplets remain visible after impact. There are no copied paying symbols. Unresolved future badges remain badges; a later infection can compound an earlier revealed source.
3. Show each extra-shot award independently of Wild substitution.
4. Mark participating physical scatter-win cells, display the base-stake award and sum of marked multipliers, then clear the paid cells and double their position values.
5. Detonate recorded Bombs, protect Wild/Bonus symbols and show affected cell growth, including the Bomb source.
6. Move surviving symbols down to their recorded destinations and drop each new symbol once from above, with the same smooth settling direction as the initial landing. No cycling strip is used. Replay the next recorded cascade; position progress stays at its coordinates.
7. Finish the round or continue its bonus with retained multipliers and awarded upgrades visible.

The current rule matches verified Duck Hunters normal source-only and common-reveal behavior. Version 3’s additional normal target is preserved only in its historical archive. Neither implementation counts multiplier values as additional physical symbols.

These are presentation timings chosen for this game, not claimed publisher millisecond specifications:

| Stage | Normal | Turbo |
| --- | ---: | ---: |
| Ordinary staggered top drop | 1,364 ms | 744 ms |
| Normal badge local reveal and boost | 900 ms | 495 ms |
| Upgraded infection | 1,120 ms | 616 ms |
| Winning-award hold | 640 ms | 240 ms |
| Winning removal | 260 ms | 130 ms |
| Additional clear / pause | 300 / 110 ms | 150 / 70 ms |
| Replacement drop | 711 ms | 422 ms |
| Bought-bonus invitation top drop | 1,364 ms | 744 ms |
| Bonus-invitation emphasis | 1,250 ms | 750 ms |
| Dorm/Friday wheel rotation | 4,100 ms | 2,900 ms |

The old board fades for 140/90 ms, then columns start 90/40 ms apart. Within a column, bottom-first row starts are 26/16 ms apart, with 570/330 ms flights and a 100/60 ms settled hold (normal/turbo). Flights use the monotonic quintic easing `p³ × (10 − 15p + 6p²)`, reaching the cell smoothly without vertical overshoot. A deterministic rotation of at most about three degrees wobbles in flight and settles to zero at the cell. It does not move the target center or consume gameplay randomness. One column landing cue fires after all its rows settle. Initial paid spins, free spins, Extra Spins and purchased-invitation staging share this motion. Cascade survivors retain their actual source identity; new symbols enter from above.

Turbo remains readable. Skip shortens only the replay; all grids, targets, multipliers and awards were settled by the engine before animation. Each normal badge reveals the common symbol and grows its source at one synchronized local hit; the upgraded badge uses a distinct appearance and links to all recorded targets. Impact labels and multiplier changes describe actual award targets. The local normal hit occurs at about 198 ms Normal / 109 ms Turbo with these original timings; it does not claim to reproduce a publisher animation duration or curve.

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

The [current validation receipt](presentation-validation.json) records **62 engine tests and 43 browser checks**, against **49** verified source/artwork hashes. The production build passed; production Normal and purchased Dorm play/reload matched the pure engine exactly, with development hooks absent and no runtime errors.

The fresh unskipped browser sample observed initial drops at **1,372 ms Normal / 749 ms Turbo** and refills at **719–720 ms / 435–437 ms**, including scheduling overhead. The normal source revealed at 22.47% progress with two matching characters elsewhere: one local foam impact, no bottles or returning symbols, and only its source boosted. An already ×2 source receiving a ×8 factor correctly displayed **×16**, including in the highest-multiplier panel during the reveal. Upgraded infection retained nine exact beer recipients. Eighteen actual bonus buys across all tiers varied reels and rows, concealed future special symbols, reproduced the pending landing on reload and settled to the exact pure-engine outcome without another charge. The counter check showed 7 awarded spins, 6 after consuming the first, 7 after a visible +1 shot, and 0 throughout the last spin.

The original painterly set introduced in revision 5.2 supplies all nine regular symbols and four scenes. Paying-symbol atlas cells are isolated on transparent backgrounds; the renderer and menu previews crop the same originals. Scene crops retain the student-life theme while keeping the reel area quiet. Bonus and Wild retain their contrasting silhouettes. Versioned `?v=5.3` requests identify the current presentation assets and avoid stale cache requests.

The dedicated BG/EN bonus counter sits above the reels on desktop and mobile. It shows the full award at entry, consumes each spin when play begins, adds recorded shot awards as they appear, and stays visible at zero during the final spin and completion overlay. It reads the committed presentation without consuming RNG, crediting money or exposing future shot awards.

All version 5 mathematics, storage and simulation source hashes are unchanged by this presentation revision.
