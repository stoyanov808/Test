# ОТ СТАРОТО — version 4

A student-club slot with matching ink cartoon symbol and character artwork, eight-frame character actions, a full-window integrated scene UI, 19 fixed paylines, Bulgarian/English controls and virtual euro credits. Run it through the repository's normal Vite server.

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

The production server uses `variants/ot-staroto/dist`. Development commands can also run directly from this variant's directory. Build creates a secondary `release/PLAY.html` with adjacent `release/audio/` files. The server is the default workflow; keep the audio directory when distributing the test build.

## Characters and bonuses

| Character | Feature | Bought bonus | Price in base stakes |
| --- | --- | --- | ---: |
| Left, sunglasses | Throws Wilds. His bonus retains their coordinates and multipliers. | Русенско Варено | 95× |
| Right, coin dealer | Marks genuinely removed winning positions and reveals coins, collectors and modifiers. | ЛУКС | 150× |
| Middle, shooter | Expands his whole reel into Wilds; optional follow-up shots create or double Wilds and can lock an expanded reel for the rest of the bonus. | Ръба са обажда | 1,800× |
| All three | Sticky Wilds, shooting and marked-cell coin rounds together. | ОТ СТАРОТО | 2,500× |

Each individual bonus starts with ten spins; the super starts with fifteen. Bought invitations land visibly before the bonus begins, with receipt-derived varied positions. Natural 3/4/5/6 invitations award the corresponding tier. In a bonus, two invitations add two spins; three add five; four add five and upgrade to at least ЛУКС; five add five and upgrade to at least Ръба са обажда; six add ten and unlock ОТ СТАРОТО. A tier upgrade changes the eligible character while retained sticky positions and marks remain. Only the super admits all three arriving characters.

The individual X Bet entries guarantee the chosen character on the initial drop and charge their complete displayed cost: left **8.5×**, right **2.7×**, middle **25×**. Each requires confirmation for one round. **X BET · 5× CHANCE** is a separate persistent booster: it costs **3×**, changes the full natural bonus chance from **1/200 to 1/40**, and keeps the same conditional regular and bonus outcome distributions. The displayed cost is the complete debit; regular payouts still use the base stake.

## Paylines, Wilds and tumbles

The 6×5 board uses the 19 paths transcribed from the supplied Le Zeus Game Info chart. Prototype line IDs follow the diagram order, left to right across rows of seven, seven and five. [The exact coordinates and source review](docs/LE-ZEUS-REFERENCE.md) document the match. The Rules screen shows all paths.

Three or more consecutive matching symbols on a path pay from the first reel, left to right. Each line pays its longest 3/4/5/6 bracket once and requires a matching regular symbol; active Wilds substitute for the other positions. Different lines pay independently. Their shared winning positions are removed once. Six active Wilds on a line instead pay one explicit **200×** award before multipliers, without inventing nine regular-symbol awards.

Nine regular types pay **0.1×–3×** for three matches and **3×–100×** for six, before Wild multipliers. The sum of active Wild multipliers, with a minimum of one, multiplies line wins. Newly created nonsticky Wilds leave when they win. Sticky Wilds keep their positions and multipliers, contribute to all eligible lines in one tumble, then dim for the rest of that spin and recharge on the next free spin.

Each rare Shooter expands all five rows on his own reel. More than one reel can expand in a spin. All expansions happen before optional recorded follow-up shots. A regular target becomes a single-use Wild; an ordinary Wild target doubles. A shot hitting an expanded reel doubles every Wild on it and, during a bonus, locks the entire reel as sticky until that bonus ends. Multiple reels can be locked. In base play the boost lasts for the current spin; base Wilds do not carry into a newly triggered bonus. Existing left-sticky positions retain their identity and upgraded multiplier. Unlocked expanded Wilds remain transient.

Feature badges and invitations enter on initial drops; refills contain regular symbols. There is at most one invitation per reel. Winning chains end through the actual rules, with no concealed tumble truncation.

## Ordered coin rounds

Only the right character reveals coins. Every position in a reveal wave finishes revealing before any modifier or collector acts. Local and global modifiers then apply to their recorded monetary targets. A new collector absorbs the value coins and any earlier collector; those amounts transfer into its stored value rather than paying twice.

Collected positions clear. The newest collector remains in place while the vacant marked positions reveal again. If another collector appears, it absorbs the retained collector. A retained collector does not start another collection by itself. A wave without a new collector ends the feature; surviving values and collectors are paid once, within the round cap.

Reveals use only cells marked by real removed line wins. When triggered, every marked position reveals a value, modifier or collector; no marked position is empty, including repeated waves. Coin denominations range from **0.2× to 500×**. Values, modifiers and collector chains are calibrated through the full-round mathematical model. The source configuration and sampled return contributions are included in the mathematical record.

## God Spin

God Spin costs **3,000×**. One actual MAX symbol lands among 30 cells. The car stops above the board and shoots at four or five distinct recorded positions. Its complete shooting outcomes are weighted by the published mathematical model. A hit occurs exactly when the recorded target is the MAX cell; shooting stops on that hit and awards the **19,999×** cap. A miss resolves ordinary combinations on the same board. No board-wide MAX overlay substitutes for the symbol.

The full round shares the cap, including any bonus. At a €0.20 base stake, the super costs €500, God Spin costs €600, and the max award is €3,999.80.

## Presentation, saves and sound

The ink club scene and compact edge controls fill the entire game window. The board scales to the available width and height without stretching its symbols. Each symbol falls independently; surviving symbols preserve identity and order, sticky positions stay fixed, and grid cells have no hover effects or tooltips. Each character has eight distinct illustrated drawings for anticipation, wind-up, release, follow-through, recoil and recovery. Falling pieces have independent acceleration and damped contact; coins travel along separate arcs into the collector. Winning paths, reel expansion, coin flips, transfers, recoil and shot impacts replay the recorded receipts.

Small ordinary wins count in the HUD. Larger wins and bonus awards use the scene count-up, adding characters at 100× and 500×, shooting at 1,000× and the escape car at the actual cap. Space starts one round per physical press and release. Auto-repeat and native held-button activation are blocked. Board clicks cannot skip an entire round. Win count-ups use their explicit Continue action; a second fresh action is required to close them.

The complete outcome is settled and saved before replay. Reload resumes the same receipt with no repeated debit or award. Version 4 uses its own save key and leaves previous version 1/2/3 bytes untouched. A structurally checked, fully settled previous virtual wallet can carry into a fresh version 4 session. Old receipts are preserved separately; they are not replayed or reinterpreted under the new paylines. Pending old results remain in the old save. Language, turbo, X Bet and normal audio preferences remain available.

Player audio uploads and the browser audio database are removed. Replace the WAV files under `public/audio`, or change filenames and cue settings in `src/audio-config.ts`, then rebuild for deployment. Normal player controls are volume, mute and music on/off. [File and cue instructions](public/audio/README.md) list all eleven bundled sounds.

## Evidence

The [reference notes](docs/LE-BANDIT-REFERENCE.md) distinguish the user's requested collector flow from inaccessible Le Bandit publisher rules. This is original prototype mathematics, not a transcription of private commercial probabilities. The model proves **96.5% theoretical expected return** for every paid mode at all eight supported stakes against its complete debit. Fresh production tickets come from Web Crypto; recorded entropy permits strict reload replay. [RTP calculation](docs/MATH-MODEL.md) explains the finite weighted catalogue, exact integer-cent arithmetic, outcome variety and why finite sessions can return less. The [sample](docs/mathematics-sample.json) records production draws and their uncertainty; it is separate from the exhaustive expectation proof. This remains a virtual-credit prototype, without third-party cash-game certification.

[Validation](docs/VALIDATION.md) · [Screenshot gallery](docs/GALLERY.md) · [Art provenance](public/art/README.md)

From the repository root, `npm test`, `npm run math:check`, `npm run build`, `npm run test:browser` and `npm run simulate` validate this version. Install Playwright Chromium with `npx playwright install chromium` if a system Chromium is unavailable. The browser runner owns its test server and checks the real production HTTP bundle as well as development replay.
