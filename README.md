# СТУДЕНТСКИ ГРАД

**„Утре съм на лекции.“** An original illustrated browser slot with virtual euro balances, Bulgarian and English interfaces, and original synthesized audio. Version one keeps **5 reels × 4 rows**, **1,024 initial ways**, and up to **32,768 ways** through splitting. All characters are adult university students.

## Play and develop

Requires Node.js 24 and npm. On your own computer, download the repository first:

```bash
git clone https://github.com/stoyanov808/Test.git
cd Test
```

In the Codex cloud environment, the repository is already downloaded. Use `cd /workspace/Test` instead. Run each command below on its own line from the repository folder:

```bash
npm ci --cache /tmp/studentski-grad-npm-cache --no-audit --no-fund
npm run build
npm run dev -- --port 5173 --strictPort
```

Keep that terminal running. If you ran the commands on your own computer, open **[http://localhost:5173/](http://localhost:5173/)** in your browser. If the server runs in a cloud environment or a remote container, open its **forwarded preview for port 5173**; your computer's `localhost` does not point to the remote server. Open the preview at its root path `/`.

For a production preview, run `npm run preview -- --port 4173 --strictPort` after building, then open **[http://localhost:4173/](http://localhost:4173/)** (or forward port 4173). The generated `dist` folder can also be served with `python3 -m http.server 8080 --directory dist`; open **[http://localhost:8080/](http://localhost:8080/)**, without adding `/dist` or `/Test` to the address.

The GitHub repository link shows the source code. Pushing the source to GitHub does not create a hosted game or enable GitHub Pages.

If `localhost:5173` returns 404 on the same computer as the server, try `http://127.0.0.1:5173/`. To check a fresh port, run `npm run dev -- --port 5174 --strictPort` from the folder containing this game's `package.json`, then open `http://127.0.0.1:5174/`. The terminal must show `VITE` and `ready`; if it shows an error or the fresh address still returns 404, share the full terminal output and browser address so the server can be identified.

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

```bash
npm test
npm run test:browser
```

Engine suite: **27 passed, no skipped tests**. Browser suite: **19 passed** at desktop and phone sizes, including language/currency, modifier behavior, single debits under rapid input, all buys, bonus reload equivalence, genuine VIP success/failure, bounded autoplay and 44-pixel controls. Browser tests require the development server on port 5173 and `/usr/bin/chromium`; override `SLOT_BASE_URL` for another server. They use isolated browser storage. Screenshots and results are written to ignored `test-results/`.

Reproduce the recorded simulations:

```bash
SIM_ROUNDS=500000 SIM_SEED=400091 SIM_OUTPUT=docs/simulation-results.json npm run simulate
SIM_ROUNDS=2000000 SIM_MODE=hunt SIM_SEED=591823 SIM_MERGE=1 SIM_OUTPUT=docs/simulation-results.json npm run simulate
```

## Source layout

`src/engine` owns configuration, seeded/injectable randomness, evaluation, the state machine, accounting and persistence. `src/render` owns Canvas2D presentation and consumes already settled results. `src/audio.ts` synthesizes the soundtrack and effects. `src/i18n.ts`, `src/menus.ts` and `src/main.ts` provide the bilingual interface and orchestration.

The artwork in `public/art` was generated originally for this game, with vector fallbacks. The game uses no commercial game assets or recorded soundtrack. Oswald and Manrope include Cyrillic support; their SIL Open Font Licenses are included in `public/fonts`.
