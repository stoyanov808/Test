# Studentski Grad presentation, version 2

This rewrite keeps the Studentski Grad setting while using Duck Hunters' publicly visible animation order. It does not ship reference-game characters, backgrounds, frames or recorded audio.

## What the official footage establishes

See [the research record](DUCK-HUNTERS-REDESIGN.md) for exact official URLs and timestamps. The 6×5 board remains physically fixed. Marked cells display persistent multipliers, targeted wins show their count and multiplier sum, symbols are removed, and replacement symbols drop into vacancies. Infectious transformations resolve sequentially. Bombs detonate after already identified wins settle and before the next drop. Bonus entry changes the scene and presents the awarded upgrades before play continues.

The short promotional clips are edited demonstrations, not samples suitable for estimating returns. The downloaded Duck Hunters footage carries silent audio despite an audio track, so the game does not claim to reproduce a soundtrack heard in those clips.

## Studentski Grad adaptation

The stage is a drawn Sofia student district. A concrete dorm facade, crooked lecture notices, late-night doner storefronts and an 8 December stage replace the hunting backdrop. A limited ink, paper, ochre, rust and mint palette ties the scenes to the symbols. Adult student caricatures, a DJ and a bouncer have distinct silhouettes. Low symbols remain readable books, coffee, noodles, doner and beer.

All art is directly authored SVG geometry in `public/art-v2`. Original silhouettes, angles, outlines and flat color shapes provide a consistent drawn appearance. The previous raster atlas/backgrounds were removed. There are no photographs, downloaded stock images, promotional-video frames or commercial game assets in the new production artwork.

## Settlement shown to the player

1. Land the actual recorded 6×5 board; staggered stops give each column weight.
2. Reveal xWays badges in their recorded order. Infect matching resolved symbols and update the affected cell numbers. Unrevealed badges remain badges until their own turn.
3. Show extra-shot awards independently from Wild substitution.
4. Mark all participating scatter-win cells, show the base-stake award and summed marked multipliers, then clear the paid positions and double their cell values.
5. Detonate recorded Bombs, protect Wild/Bonus symbols, and reveal affected position growth, including the Bomb origin.
6. Drop replacements into the vacancies and evaluate the next recorded cascade. Position progress stays on the board rather than falling with symbols.
7. Complete the paid round or continue its bonus with persistent positions and visible awarded upgrades.

Normal speed leaves time to read modifier causes and the resulting payout. Turbo shortens presentation, and tapping/Space can skip it. Every timing uses already settled snapshots; animation speed, audio randomness and frame rate cannot change money or outcomes.

Bonus entry brings an original illustrated student shuttle into the scene. The actually awarded upgrade cards reveal in sequence before the spin entitlement and Continue control. Large awards use an illustrated friends-and-toast vignette with a skippable euro count-up. Each bonus scene has its own palette and drawn background; the side panel continues to show its active upgrades.

The soundtrack is original Web Audio synthesis. Separate cues identify a landing, multiplier reveal, infection, Bomb, extra shot, falling replacement and win. Bonus scenes change the musical layer. Audio starts after interaction and has mute and volume controls. BG/EN covers menus, rules, confirmations, win messages and euro accounting.

Browser validation covers desktop and phone sizes, visible controls, actual modifier replay, skip equivalence, reload recovery and absence of failed artwork requests. Screenshots and browser results are written to `test-results` and are not included in production assets.
