# ОТ СТАРОТО — version 2

A Ruse courtyard slot with original ink cartoon artwork, an integrated scene UI, nine paying symbols, Bulgarian/English controls and virtual euro credits. Run it through the repository's normal Vite server.

## Start the server

From the repository root, with Node 20.19+ in Node 20 or Node 22.12+:

```sh
npm ci
npm start
```

Keep the terminal open and use the actual **Local** address printed by Vite. No extra port arguments are needed. The root commands now launch this variant; `npm run start:studentski` launches the earlier Studentski Grad game.

```sh
npm run build
npm run preview
```

The production server uses `variants/ot-staroto/dist`. Development commands can also run directly from this variant's directory. Build creates a secondary self-contained `release/PLAY.html`; the server is the default workflow.

## Characters and bonuses

| Character | Feature | Bought bonus | Price in base stakes |
| --- | --- | --- | ---: |
| Left, sunglasses | Throws Wilds. His bonus retains their coordinates and multipliers. | Русенско Варено | 95× |
| Right, coin dealer | Marks genuinely removed winning positions and reveals coins, collectors and modifiers. | ЛУКС | 150× |
| Middle, shooter | Creates Wilds with recorded shots; repeat hits double their multiplier. | Ръба са обажда | 1,800× |
| All three | Sticky Wilds, shooting and marked-cell coin rounds together. | ОТ СТАРОТО | 2,500× |

Each individual bonus starts with ten spins; the super starts with fifteen. Bought invitations land visibly before the bonus begins, with receipt-derived varied positions. Natural 3/4/5/6 invitations award the corresponding tier. In a bonus, two invitations add two spins; three add five; four add five and upgrade to at least ЛУКС; five add five and upgrade to at least Ръба са обажда; six add ten and unlock ОТ СТАРОТО. A tier upgrade changes the eligible character while retained sticky positions and marks remain. Only the super admits all three arriving characters.

X Bet guarantees the chosen character on the initial drop and charges its complete displayed cost: left **8.5×**, right **2.7×**, middle **25×**. The prices and coin distributions have been recalibrated for version 2.

## Wilds and tumbles

Eight matching physical positions anywhere pay, including active Wild substitution and at least one actual regular symbol of that type. Ten and twelve positions use the next pay brackets. An all-Wild board does not invent nine unrelated symbol awards. There is no seven-natural-symbol restriction.

Nine regular types lower routine matching frequency, while 8-symbol awards now range from **0.5× to 5×** before Wild multipliers; 12+ pays range from **3× to 50×**. The sum of active Wild multipliers, with a minimum of one, multiplies regular wins. Newly created nonsticky Wilds leave when they win. Sticky Wilds keep their positions and multipliers, contribute to all eligible wins in one tumble, then dim for the rest of that spin and recharge on the next free spin. This prevents perpetual refill wins once a board has many retained Wilds. Shooter-created Wilds reset next spin; shooting an existing sticky Wild retains its upgraded multiplier.

Feature badges and invitations enter on initial drops; refills contain regular symbols. There is at most one invitation per reel. Winning chains end through the actual rules, with no concealed tumble truncation.

## Ordered coin rounds

Only the right character reveals coins. Every position in a reveal wave finishes revealing before any modifier or collector acts. Local and global modifiers then apply to their recorded monetary targets. A new collector absorbs the value coins and any earlier collector; those amounts transfer into its stored value rather than paying twice.

Collected positions clear. The newest collector remains in place while the vacant marked positions reveal again. If another collector appears, it absorbs the retained collector. A retained collector does not start another collection by itself. A wave without a new collector ends the feature; surviving values and collectors are paid once, within the round cap.

Reveals use only cells marked by real removed wins. Some reveal positions are empty. Coin denominations range from **1× to 500×**. Bonuses use a richer denomination distribution than base play, while retaining the sparse reveal chance. The source configuration and sampled return contributions are included in the mathematical record.

## God Spin

God Spin costs **3,000×**. One actual MAX symbol lands among 30 cells. The car stops above the board and shoots at four distinct random positions, with a 32% chance of a fifth shot. A hit occurs exactly when the recorded target is the MAX cell; shooting stops on that hit and awards the **19,999×** cap. A miss resolves ordinary combinations on the same board. No board-wide MAX overlay substitutes for the symbol.

The full round shares the cap, including any bonus. At a €0.20 base stake, the super costs €500, God Spin costs €600, and the max award is €3,999.80.

## Presentation, saves and sound

The courtyard fills the viewport and contains the compact controls. Each symbol falls independently; surviving symbols preserve identity and order, sticky positions stay fixed, and grid cells have no hover effects or tooltips. Character anticipation, action and recoil use separate illustrated poses. Coin flips, transfers, recoil and shot impacts replay the recorded targets.

Small ordinary wins count in the HUD. Larger wins and bonus awards use the scene count-up, adding characters at 100× and 500×, shooting at 1,000× and the escape car at the actual cap. Space or clicking the board skips presentation; it does not generate a new outcome.

The complete outcome is settled and saved before replay. Reload resumes the same receipt with no repeated debit or award. Version 2 uses its own save key, leaves version 1 bytes untouched, and can carry a validated fully settled version 1 virtual wallet into a fresh version 2 session. Pending old results remain in the old save and are not reinterpreted with new mathematics. Preferences and custom audio remain available.

Settings accepts your own music, gunshot, feature and win files, up to 50 MB each. Files remain in local browser storage. Volume, mute, removal and reset apply to custom audio too.

## Evidence

The [reference notes](docs/LE-BANDIT-REFERENCE.md) distinguish the user's requested collector flow from inaccessible Le Bandit publisher rules. This is original prototype mathematics, not a transcription of private commercial probabilities. The approximately 96% goal is not a certified theoretical RTP; the [sample](docs/mathematics-sample.json) gives each mode's observed return and uncertainty.

[Validation](docs/VALIDATION.md) · [Screenshot gallery](docs/GALLERY.md) · [Art provenance](public/art/README.md)

From the repository root, `npm test`, `npm run build`, `npm run test:browser` and `npm run simulate` validate this version. Install Playwright Chromium with `npx playwright install chromium` if a system Chromium is unavailable. The browser runner owns its test server and checks the real production HTTP bundle as well as development replay.
