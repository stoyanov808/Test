# Studentski Grad presentation, revision 5.2

Presentation 5.2 keeps Sofia student nightlife and the 6×5 board, with painterly adult portraits and material textures, a larger integrated game stage and faster normal/turbo presentation with damped falling wobble. Official Duck Hunters footage supplies the cause-before-result sequence. The party-wheel layout and Studentski Grad illustrations belong to this adaptation. The badge replay follows verified Duck Hunters behavior: normal source-only growth, upgraded infection to all current matches, and one common revealed type for badges on a drop. Initial landings and refills now use smooth one-way top drops, with no spinning or cycling strip.

## Reference and original visual direction

[The research record](DUCK-HUNTERS-REDESIGN.md) cites official footage and timestamps. It establishes a physically fixed board, visible persistent position multipliers, targeted awards, symbol removal, cell growth and falling replacements. Sequential infections resolve before awards; Bombs follow the identified wins and precede the next drop. A feature entrance introduces the granted upgrades and a changed bonus scene.

The production setting uses original painterly illustrations of adult students, textured takeaway objects and lived-in Sofia nightlife. Natural facial planes, small eyes, articulated hands, cloth folds, reflected glass and rough painted surfaces replace the previous clean mascot look. Books, coffee, noodles, doner and beer remain distinct at reel size. The board, multiplier numbers, feature indicators and controls form one illustrated stage.

The [new asset record](../public/art-v3/README.md) documents original tool-generated PNG artwork and exact atlas crops. The [vector asset record](../public/art-v2/README.md) describes the retained authored SVG feature signs. Publisher sprites, web photographs, promotional frames and recorded commercial audio are research references.

## Recorded settlement replay

1. Fade the previous symbols, then drop each actual recorded 6×5 symbol once from above. Stagger columns and rows, and ease smoothly into the destination cell. Symbols never wrap through the board, repeat on a cycling strip or change identity during flight. Position multiplier panels remain behind them.
2. Reveal the common selected symbol on each badge in recorded sequence. A normal badge multiplies its source position only and sends no factor to a second cell. An upgraded badge sends its factor to every already visible matching regular symbol. The infection perk makes all arriving badges upgraded; otherwise 0.5% of badge draws are naturally upgraded. Upgraded beer bottles follow arcs to every recorded multiplier target. A normal badge uses the same outward bottle flights and splashes as upgraded xWays, directed at every already visible same-type regular. The source reveals in place; no bottle or symbol image returns. Those outward recipients are cosmetic, and only the source receives the factor. With no visible match the reveal stays local. Large filled amber bursts, a foam crown and trailing liquid droplets remain visible after impact. There are no copied paying symbols. Unresolved future badges remain badges; a later infection can compound an earlier revealed source.
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
| Normal badge reveal and transfer | 900 ms | 495 ms |
| Upgraded infection | 1,120 ms | 616 ms |
| Winning-award hold | 640 ms | 240 ms |
| Winning removal | 260 ms | 130 ms |
| Additional clear / pause | 300 / 110 ms | 150 / 70 ms |
| Replacement drop | 711 ms | 422 ms |
| Bought-bonus invitation top drop | 1,364 ms | 744 ms |
| Bonus-invitation emphasis | 1,250 ms | 750 ms |
| Dorm/Friday wheel rotation | 4,100 ms | 2,900 ms |

The old board fades for 140/90 ms, then columns start 90/40 ms apart. Within a column, bottom-first row starts are 26/16 ms apart, with 570/330 ms flights and a 100/60 ms settled hold (normal/turbo). Flights use the monotonic quintic easing `p³ × (10 − 15p + 6p²)`, reaching the cell smoothly without vertical overshoot. A deterministic rotation of at most about three degrees wobbles in flight and settles to zero at the cell. It does not move the target center or consume gameplay randomness. One column landing cue fires after all its rows settle. Initial paid spins, free spins, Extra Spins and purchased-invitation staging share this motion. Cascade survivors retain their actual source identity; new symbols enter from above.

Turbo remains readable. Skip shortens only the replay; all grids, targets, multipliers and awards were settled by the engine before animation. Each normal badge reveals the common symbol and grows its source; the upgraded badge uses a distinct appearance and links to all recorded targets. Normal matching-type splashes carry no multiplier labels. Factor labels and multiplier changes appear only at actual award targets.

## Bonus entry and the party wheel

A direct buy or Lucky Draw first stages exactly **3 Dorm, 4 Friday or 5 December invitations** landing on the reels. This bought-bonus landing is a receipt animation: it draws no random outcome, pays no scatter award, adds no extra spin and never charges again. A natural bonus uses its actual engine-recorded trigger symbols.

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

The [current validation receipt](presentation-validation.json) records **62 engine tests and 41 browser checks**, against **48** verified source/artwork hashes. Production Normal and purchased Dorm play/reload also matched the pure engine exactly, with development hooks absent and no runtime errors.

The fresh unskipped browser sample observed initial drops at **1,378 ms Normal / 758 ms Turbo** and refills at **718–718 ms / 435–441 ms**, including scheduling overhead. The natural base-upgrade check observed **nine exact beer recipients**. The normal one-way check painted 37 bottle frames across two matching DJ recipients, with zero returning symbol frames and only the source recorded as paid. Every visible recipient received an amber/foam impact. A separate no-match case showed no bottle, only local source reveal/splash. The counter check showed 7 awarded spins, 6 after consuming the first, 7 after a visible +1 shot, and 0 throughout the last spin.

Revision 5.2 replaces all nine regular symbols and four scenes with a substantially more natural painterly set. Paying-symbol atlas cells are isolated on transparent backgrounds; the renderer and menu previews crop the same originals. Scene crops retain the student-life theme while keeping the reel area quiet. Bonus and Wild retain their contrasting silhouettes. Versioned `?v=5.2` requests prevent earlier cached artwork from hiding the revision.

The dedicated BG/EN bonus counter sits above the reels on desktop and mobile. It shows the full award at entry, consumes each spin when play begins, adds recorded shot awards as they appear, and stays visible at zero during the final spin and completion overlay. It reads the committed presentation without consuming RNG, crediting money or exposing future shot awards.

All version 5 mathematics, storage and simulation source hashes are unchanged by this presentation revision.
