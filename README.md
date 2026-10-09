# ОТ СТАРОТО

A browser slot set in an illustrated student club, with matching ink cartoon symbols and characters, eight-frame character actions, Bulgarian/English controls and virtual euro credits. This is the default game launched by the repository commands.

## Run the game

Install Node **20.19+ in the Node 20 series, or 22.12+**, then clone this repository or extract **Code → Download ZIP**. Open a terminal in the folder containing this README and `package.json`:

```sh
npm ci
npm start
```

Keep the terminal open. Vite opens the browser at its actual local address; if it does not open automatically, use the **Local** address printed in the terminal. Run these commands without extra port arguments in PowerShell.

To make and run a production build:

```sh
npm run build
npm run preview
```

These commands serve the game over HTTP, including its artwork, sound controls and saved results. The production output is `variants/ot-staroto/dist`. The repository page is a source browser; launch the local server to play.

## Gameplay and presentation

The left character throws Wilds and retains them in his bonus. The middle character expands his whole reel into Wilds and may then shoot random eligible symbols. A regular hit creates a single-use Wild; another Wild hit doubles its multiplier. A hit on an expanded reel doubles all five Wilds and keeps that entire reel sticky until the current bonus ends. Multiple Shooters and sticky expanded reels can appear together. The right character reveals marked winning positions as coins, modifiers and collectors. All three can appear together in **ОТ СТАРОТО**, the 2,500× super bonus. **Русенско Варено**, **ЛУКС** and **Ръба са обажда** each have their own character.

The 6×5 board uses the **19 line paths shown in the supplied Le Zeus chart**. Three to six consecutive matching symbols from the left pay the longest bracket on each line. Lines pay separately; shared winning cells clear once before the next drop. Active Wilds substitute and their visible multipliers sum into the global win factor. A line of six active Wilds pays one 200× award before that factor. Sticky Wilds retain their position and multiplier throughout the bonus, dim after contributing to a winning tumble, and recharge on the next free spin.

Every marked coin box reveals a value, modifier or collector when the feature triggers, including each re-reveal. The whole wave reveals before modifiers or collection. A new collector absorbs the revealed values and any previous collector; collected positions clear and reveal again. The last collector stays. The terminal coin board is paid once.

God Spin places one **MAX** symbol in an actual grid. The car's shots target recorded random grid cells; hitting MAX awards the shared **19,999×** round cap. Feature buys, X Bet prices, ordinary payouts and all animations follow the settled receipt. Reload cannot charge or pay it twice.

The scene and compact controls fill the game window. Holding Space cannot repeat spins, and clicking the board cannot fast-forward a paid round. Settings retain BG/EN, mute, volume and music. Sounds come from files in `variants/ot-staroto/public/audio`, configured in `src/audio-config.ts`; there are no player sound uploads.

X BET · 5× CHANCE costs **3× the base bet** and increases the full bonus-trigger probability from **1/200 to 1/40**. Every offered mode has an exact **96.5% expected RTP** across all eight supported stakes, using a fixed weighted outcome catalogue and fresh Web Crypto ticket draws. This is a long-run expectation; individual sessions can return less. All credits are virtual. [The return calculation](variants/ot-staroto/docs/MATH-MODEL.md) describes the model and its limits.

[Game rules and development notes](variants/ot-staroto/README.md) · [Payline chart reference](variants/ot-staroto/docs/LE-ZEUS-REFERENCE.md) · [Collector reference](variants/ot-staroto/docs/LE-BANDIT-REFERENCE.md) · [Screenshot gallery](variants/ot-staroto/docs/GALLERY.md) · [Validation](variants/ot-staroto/docs/VALIDATION.md) · [Replace sound files](variants/ot-staroto/public/audio/README.md)

## Verify

```sh
npm test
npm run math:check
npm run build
npx playwright install chromium
npm run test:browser
```

The browser runner starts and closes its own server. Linux can use an installed `/usr/bin/chromium`; Windows and macOS use Playwright's installed Chromium. `npm run simulate` samples the production selector with source hashes, payout and accounting checks. `npm run math:check` verifies the exact return calculation. If you change the mathematical engine, run `npm run math:build` to evaluate and regenerate its catalogue; startup and build refuse stale mathematics.

## Previous Studentski Grad game

The earlier game is still available with `npm run start:studentski`. Its build and engine tests use `npm run build:studentski` and `npm run test:studentski`. [Historical documentation](docs/archive/studentski-v5.5/README.md) records that version.
