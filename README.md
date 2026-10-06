# СТУДЕНТСКИ ГРАД

**„Утре съм на лекции.“** An original illustrated browser slot with virtual euro balances, Bulgarian and English interfaces, and original synthesized audio. Version one keeps **5 reels × 4 rows**, **1,024 initial ways**, and up to **32,768 ways** through splitting. All characters are adult university students.

## Play and develop

Requires npm and a supported Node.js version: **20.19+ in the Node 20 series, or 22.12+**. Node **22.16.0 works** with the project's Vite 7.1.7. The Codex cloud environment uses Node 24.

On your own computer, clone the repository:

```bash
git clone https://github.com/stoyanov808/Test.git
cd Test
```

If you downloaded the GitHub ZIP instead, extract it and open a terminal in **`Test-main`**, the folder containing `package.json`. For example, in Windows PowerShell:

```powershell
cd "$HOME\Desktop\Test-main"
```

Run these commands on separate lines from the repository folder; they also work in PowerShell:

```bash
npm ci
npm start
```

`npm start` opens the game in your default browser and binds to `127.0.0.1`. Keep that terminal running. It normally uses port 5173, and chooses the next available port if that port is occupied. If the browser does not open automatically, copy the **Local** address printed by Vite into your browser.

In the Codex cloud environment, the repository is already downloaded. Use `cd /workspace/Test`, run `npm ci`, then `npm run dev -- --port 5173 --strictPort`. Open the environment's **forwarded preview for port 5173** at its root path `/`; your computer's `localhost` does not point to the remote server.

For a production preview, run `npm run build` then `npm run preview`, and open the **Local** address it prints (normally **[http://localhost:4173/](http://localhost:4173/)**). The generated `dist` folder can also be served with `python3 -m http.server 8080 --directory dist`; open **[http://localhost:8080/](http://localhost:8080/)**, without adding `/dist` or `/Test` to the address.

The GitHub repository link shows the source code. Pushing the source to GitHub does not create a hosted game or enable GitHub Pages.

If the game returns 404, check the command shown in the terminal. A command such as `vite --host 0.0.0.0 5174` treats `5174` as the project folder, which makes Vite serve the wrong directory. Stop it with Ctrl+C and run **`npm start`** or **`npm run dev`** without extra arguments, from the folder containing this game's `package.json`. Open the actual **Local** address printed by Vite. If needed, use `127.0.0.1` in place of `localhost` while keeping the printed port. The terminal must show `VITE` and `ready`; share the full output and browser address if it still fails.

Select BG / EN at the top, or open Settings. Audio starts after interaction; mute and volume are adjustable. Choose the base bet before a paid round. The interface separates the base bet from the actual debit, including the locked price of purchased features. Booster selection costs nothing until Spin. Bonus purchases and God Mode require an exact-price confirmation and never stack with booster charges.

Space starts a spin while idle; Space or tapping the reels skips the current presentation. Big-win and bonus cards have a Continue button. Autoplay is bounded to 100 paid rounds and can be stopped; the current purchased round always finishes. **Refill adds €10,000 virtual euros** while idle.

## Implemented features

- Sticky-note copies increase multiplicity; Scatters and VIP passes never split.
- Full-reel nudging Wilds increase to 3×. Wild contributions add within a reel and multiply across reels through the documented ways formula.
- Dorm, Friday, and 8 December bonuses have their own painted environment, music layer, introduction and end card. Frames, Wild progress and party energy persist through upgrades. At most three retriggers award two spins each.
- Five paid modes, three direct buys, illustrated paytable, exact rules, history, normal/turbo speed, and touch controls.
- Genuine five-position VIP collection: three opportunities per unlocked position, 4.8% success, 1,000× cost, and 20,000× payout or zero. At €0.20 bet this is a €200 debit and €4,000 success payout.
- Integer-cent accounting, once-per-spin half-up rounding, a whole-round 20,000× cap, explicit state transitions, and atomic saved outcomes. Purchased rounds resume after reload without a second debit or payout. Invalid saves stay untouched and can be downloaded or explicitly replaced.

## Research and measured mathematics

The pre-code study inspected three official sheets and feature descriptions across six Nolimit City titles, plus directly decoded official footage. [Research](docs/RESEARCH.md) contains exact source citations. [Presentation study](docs/PRESENTATION.md) separates timestamped visual observations from measured audio dynamics and documents the limits of the clips.

[Mathematics](docs/MATHEMATICS.md) defines every interaction, distribution and rounding rule. [Simulation results](docs/simulation-results.json) report **5.5 million paid rounds** through the same engine as the game, against actual debits.

| Mode | Measured return |
| --- | ---: |
| Standard | 97.16% |
| Bonus hunt | 92.43% |
| All frames | 96.74% |
| Guaranteed Wild | 95.81% |
| God | 95.49% sampled; **96% exact theoretical** |
| Buy Dorm / Friday / December | 96.12% / 95.43% / 96.07% |

Approximately 96% is a calibration target for the non-God modes. Hunt is 3.57 percentage points below that target in the measured run; its approximate 95% interval is 88.71–96.15%. The report includes uncertainty, hits, bonus frequencies and maximum-win frequencies for every mode. A short simulation observing zero rare Standard maximum wins does not establish a zero probability. Changing the grid or distributions requires new calibration.

## Validation

Tests are **optional to play the game**. `npm start` opens the game; `npm run test:browser` launches a separate automated browser.

For the engine tests:

```bash
npm test
```

For browser tests, install Playwright's Chromium and run the suite:

```bash
npx playwright install chromium
npm run test:browser
```

The suite starts its own development server on an available port and closes it when finished. You do not need another terminal or a running game server. To test an already running development server instead, set `SLOT_BASE_URL` to its actual address. In Windows PowerShell, for example:

```powershell
$env:SLOT_BASE_URL = "http://127.0.0.1:5174/"
npm run test:browser
```

In Bash:

```bash
SLOT_BASE_URL=http://127.0.0.1:5174/ npm run test:browser
```

The runner uses Playwright's installed Chromium on Windows and macOS. On Linux it uses `/usr/bin/chromium` when present, otherwise Playwright's installed Chromium. To choose an executable explicitly, set `CHROMIUM_PATH` to its full path (for example, `$env:CHROMIUM_PATH = "C:\path\to\chrome.exe"` in PowerShell). An unset `CHROMIUM_PATH` is the recommended default.

Engine suite: **27 passed, no skipped tests**. Browser suite: **19 passed** at desktop and phone sizes, including language/currency, modifier behavior, single debits under rapid input, all buys, bonus reload equivalence, genuine VIP success/failure, bounded autoplay and 44-pixel controls. They use isolated browser storage. Screenshots and results are written to ignored `test-results/`.

Reproduce the recorded simulations:

```bash
SIM_ROUNDS=500000 SIM_SEED=400091 SIM_OUTPUT=docs/simulation-results.json npm run simulate
SIM_ROUNDS=2000000 SIM_MODE=hunt SIM_SEED=591823 SIM_MERGE=1 SIM_OUTPUT=docs/simulation-results.json npm run simulate
```

## Source layout

`src/engine` owns configuration, seeded/injectable randomness, evaluation, the state machine, accounting and persistence. `src/render` owns Canvas2D presentation and consumes already settled results. `src/audio.ts` synthesizes the soundtrack and effects. `src/i18n.ts`, `src/menus.ts` and `src/main.ts` provide the bilingual interface and orchestration.

The artwork in `public/art` was generated originally for this game, with vector fallbacks. The game uses no commercial game assets or recorded soundtrack. Oswald and Manrope include Cyrillic support; their SIL Open Font Licenses are included in `public/fonts`.
