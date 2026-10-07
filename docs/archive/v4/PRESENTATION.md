# Studentski Grad presentation, version 4

Version 4 keeps Sofia student nightlife and the 6×5 board, with organic ink illustrations, a larger integrated game stage and longer normal/turbo presentation. Official Duck Hunters footage supplies the cause-before-result sequence. The party-wheel layout and Studentski Grad illustrations belong to this adaptation. The badge replay follows verified Duck Hunters behavior: normal source-only growth, upgraded infection to all current matches, and one common revealed type for badges on a drop. Initial landings and refills now use smooth one-way top drops, with no spinning or cycling strip.

## Reference and original visual direction

[The research record](DUCK-HUNTERS-REDESIGN.md) cites official footage and timestamps. It establishes a physically fixed board, visible persistent position multipliers, targeted awards, symbol removal, cell growth and falling replacements. Sequential infections resolve before awards; Bombs follow the identified wins and precede the next drop. A feature entrance introduces the granted upgrades and a changed bonus scene.

The production setting uses original curved SVG silhouettes and irregular ink contours: Sofia dorm blocks, notices, doner shops, house parties, nightlife and an 8 December stage. Books, coffee, noodles, doner and beer remain distinct at reel size. Adult students, a DJ and a bouncer supply the four paying portraits. The larger board, multiplier numbers, feature indicators and controls form one illustrated stage rather than detached dashboard cards.

The 24 illustrations are directly authored SVG geometry in `public/art-v2`, with local gradients, selective hatching, painted shadow planes and vector grain. [The asset record](../public/art-v2/README.md) documents their provenance. Publisher sprites, web photographs, promotional frames and recorded commercial audio are research references and are not shipped as production assets.

## Recorded settlement replay

1. Fade the previous symbols, then drop each actual recorded 6×5 symbol once from above. Stagger columns and rows, and ease smoothly into the destination cell. Symbols never wrap through the board, repeat on a cycling strip or change identity during flight. Position multiplier panels remain behind them.
2. Reveal the common selected symbol on each badge in recorded sequence. A normal badge multiplies its source position only and sends no factor to a second cell. An upgraded badge sends its factor to every already visible matching regular symbol. The infection perk makes all arriving badges upgraded; this sampler otherwise draws normal badges. Unresolved future badges remain badges; a later infection can compound an earlier revealed source.
3. Show each extra-shot award independently of Wild substitution.
4. Mark participating physical scatter-win cells, display the base-stake award and sum of marked multipliers, then clear the paid cells and double their position values.
5. Detonate recorded Bombs, protect Wild/Bonus symbols and show affected cell growth, including the Bomb source.
6. Move surviving symbols down to their recorded destinations and drop each new symbol once from above, with the same smooth settling direction as the initial landing. No cycling strip is used. Replay the next recorded cascade; position progress stays at its coordinates.
7. Finish the round or continue its bonus with retained multipliers and awarded upgrades visible.

The current rule matches verified Duck Hunters normal source-only and common-reveal behavior. Version 3’s additional normal target is preserved only in its historical archive. Neither implementation counts multiplier values as additional physical symbols.

These are presentation timings chosen for this game, not claimed publisher millisecond specifications:

| Stage | Normal | Turbo |
| --- | ---: | ---: |
| Ordinary staggered top drop | 1,912 ms | 1,110 ms |
| Normal badge reveal and transfer | 1,300 ms | 715 ms |
| Upgraded infection | 1,550 ms | 853 ms |
| Winning-award hold | 950 ms | 330 ms |
| Winning removal | 380 ms | 170 ms |
| Additional clear / pause | 420 / 180 ms | 200 / 100 ms |
| Replacement drop | 1,072 ms | 600 ms |
| Bought-bonus invitation top drop | 1,912 ms | 1,110 ms |
| Bonus-invitation emphasis | 1,250 ms | 750 ms |
| Dorm/Friday wheel rotation | 4,100 ms | 2,900 ms |

The old board fades for 230/160 ms, then columns start 130/60 ms apart. Within a column, bottom-first row starts are 28/20 ms apart, with 780/480 ms flights and a 140/90 ms settled hold (normal/turbo). Flights use the monotonic quintic easing `p³ × (10 − 15p + 6p²)`, reaching the cell smoothly without an overshoot or bounce. One column landing cue fires after all its rows settle. Initial paid spins, free spins, Extra Spins and purchased-invitation staging share this motion. Cascade survivors retain their actual source identity; new symbols enter from above.

Turbo remains readable. Skip shortens only the replay; all grids, targets, multipliers and awards were settled by the engine before animation. Each normal badge reveals the common symbol and grows its source; the upgraded badge uses a distinct appearance and links to all recorded targets. There are no decorative extra targets that disagree with the actual award.

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

BG/EN covers controls, rules, wheel labels, confirmations, modal decisions and euro amounts, including Block 59 / Блок 59. All **35 browser checks passed**, with **45 current source/artwork hashes** independently verified and zero runtime errors, broken artwork requests or external image fetches. Checks cover desktop and touch layouts, source-only normal growth, sequential upgraded infection, common per-drop reveal replay, actual drawn symbol identities and one-way motion, normal/turbo timing, wheel grants, bought trigger counts, reload/skip equivalence, modal decisions and autoplay suspension.

Observed unskipped initial drops took **2,016 ms normal / 1,172 ms turbo** on the loaded test machine. Cascade drops took **1,113–1,185 ms normal / 631–637 ms turbo**. Normal wheel readiness took **4,361 ms**; turbo took **3,341–3,382 ms desktop / 3,202 ms mobile**. December rotation stayed at zero. These include frame scheduling and test-machine overhead; the nominal configured timings above remain 1,912/1,110 ms for initial drops and 1,072/600 ms for refills. Archived earlier-version measurements do not validate changed presentation.
