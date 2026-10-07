# Studentski Grad presentation, version 3

Version 3 keeps Sofia student nightlife and the 6×5 board, with organic ink illustrations, a larger integrated game stage and longer normal/turbo presentation. Official Duck Hunters footage supplies the cause-before-result sequence. The party-wheel layout, illustrations and requested normal-badge extra target belong to this adaptation.

## Reference and original visual direction

[The research record](DUCK-HUNTERS-REDESIGN.md) cites official footage and timestamps. It establishes a physically fixed board, visible persistent position multipliers, targeted awards, symbol removal, cell growth and falling replacements. Sequential infections resolve before awards; Bombs follow the identified wins and precede the next drop. A feature entrance introduces the granted upgrades and a changed bonus scene.

The production setting uses original curved SVG silhouettes and irregular ink contours: Sofia dorm blocks, notices, doner shops, house parties, nightlife and an 8 December stage. Books, coffee, noodles, doner and beer remain distinct at reel size. Adult students, a DJ and a bouncer supply the four paying portraits. The larger board, multiplier numbers, feature indicators and controls form one illustrated stage rather than detached dashboard cards.

The 24 illustrations are directly authored SVG geometry in `public/art-v2`, with local gradients, selective hatching, painted shadow planes and vector grain. [The asset record](../public/art-v2/README.md) documents their provenance. Publisher sprites, web photographs, promotional frames and recorded commercial audio are research references and are not shipped as production assets.

## Recorded settlement replay

1. Land the actual recorded 6×5 board with staggered column stops.
2. Reveal each normal badge and send its factor from the source to one already visible matching regular symbol, when one exists. An upgraded infection sends its factor to every already visible match. Unresolved future badges remain badges; later causes can compound earlier revealed sources.
3. Show each extra-shot award independently of Wild substitution.
4. Mark participating physical scatter-win cells, display the base-stake award and sum of marked multipliers, then clear the paid cells and double their position values.
5. Detonate recorded Bombs, protect Wild/Bonus symbols and show affected cell growth, including the Bomb source.
6. Drop replacements into vacancies and replay the next recorded cascade. Position progress stays at its coordinates.
7. Finish the round or continue its bonus with retained multipliers and awarded upgrades visible.

The normal source-plus-one rule is the user's requested variation. Verified Duck Hunters normal xWays boosts only its own source; the research document keeps that distinction explicit. Neither implementation counts multiplier values as additional physical symbols.

These are presentation timings chosen for this game, not claimed publisher millisecond specifications:

| Stage | Normal | Turbo |
| --- | ---: | ---: |
| Ordinary staggered landing | 1,925 ms | 970 ms |
| Normal badge reveal and transfer | 1,300 ms | 715 ms |
| Upgraded infection | 1,550 ms | 853 ms |
| Winning-award hold | 950 ms | 330 ms |
| Winning removal | 380 ms | 170 ms |
| Additional clear / pause | 420 / 180 ms | 200 / 100 ms |
| Replacement drop | 780 ms | 380 ms |
| Bought-bonus invitation landing | 1,880 ms | 1,085 ms |
| Bonus-invitation emphasis | 1,250 ms | 750 ms |
| Dorm/Friday wheel rotation | 4,100 ms | 2,900 ms |

Turbo remains readable. Skip shortens only the replay; all grids, targets, multipliers and awards were settled by the engine before animation. The normal badge reveals its symbol first, then sends the factor to its recorded target; the upgraded badge uses a distinct appearance and links to all recorded targets. There are no decorative extra targets that disagree with the actual award.

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

BG/EN covers controls, rules, wheel labels, confirmations, modal decisions and euro amounts. All **32 browser checks passed** against 45 current source/artwork hashes. They cover desktop and touch layouts, actual target replay, slower normal/turbo timing, wheel grants, bought trigger counts, reload/skip equivalence, modal decisions, autoplay suspension and artwork loading, with zero runtime errors or broken artwork requests. Recorded unskipped ordinary landings took approximately 1.94 seconds in normal speed and 0.99 seconds in turbo; Dorm/Friday wheel readiness took approximately 4.20/3.00 seconds, while December remained stationary. Version2 design descriptions and statistics remain in its archive.
