# СТУДЕНТСКИ ГРАД

**„Утре съм на лекции.“** A rebuilt browser slot set in Sofia's student nightlife, with original ink illustrations, Bulgarian/English controls and virtual euro balances.

Version 3 keeps the **6 × 5 scatter-pay board**, verified public awards and Studentski Grad setting, with a larger integrated game interface, organic ink illustrations, slower normal/turbo presentation and an upgrade wheel. Eight matching physical symbols anywhere win. The requested normal-badge behavior boosts its own position and **one other matching symbol**; the upgraded infection affects **all matching symbols**. That extra normal target is a deliberate variation from Duck Hunters’ verified source-only normal xWays.

![Studentski Grad version 3, original Sofia party illustrations and the 6×5 board](docs/screenshots/studentski-grad-desktop.png)

[Phone view](docs/screenshots/studentski-grad-mobile.png) · [8 December feature](docs/screenshots/studentski-grad-december.png) · [Party wheel](docs/screenshots/studentski-grad-wheel.png) · [Extra Spin decision](docs/screenshots/studentski-grad-extra.png)

## Play on Windows, macOS or Linux

Requires npm and Node **20.19+ in the Node 20 series, or 22.12+**. Node 22.16.0 is supported.

Clone this repository, or extract the GitHub ZIP and open a terminal in `Test-main`, the folder containing `package.json`:

```bash
npm ci
npm start
```

Keep that terminal running. `npm start` opens your default browser at the actual local address and chooses an available port. If the browser does not open, copy the **Local** URL printed by Vite. You can also run plain `npm run dev` and open its printed address.

**Use these commands without extra port arguments in PowerShell.** A command printed as `vite --host 0.0.0.0 5174` treats `5174` as a project folder and serves an empty directory, causing 404. Stop it with Ctrl+C and use `npm start` or `npm run dev` without additional arguments.

In Codex cloud, use the existing `/workspace/Test` checkout and `npm run dev -- --port 5173 --strictPort`, then open the environment's forwarded port 5173 preview. Your computer's localhost points to your computer rather than a remote cloud server.

For a production build, run `npm run build`, then `npm run preview` and open its printed Local address. Serve the generated `dist` directory at an HTTP server's root. The GitHub source repository itself is not a hosted game.

## What the rewrite does

- Nine paying symbols: books, coffee, noodles, doner and beer; four illustrated adult student/nightlife characters.
- **8–9 / 10–11 / 12+** matching physical positions pay anywhere, without starting on reel one. A Wild substitutes; extra-shot tokens do not.
- Winning symbols disappear, replacements drop, and the new board is evaluated again. Symbol counts change as the board cascades; there is no fictional ways counter or changing reel height.
- Winning positions become ×2, then double on subsequent winning removals up to ×8192. Participating marked multipliers add; neutral positions do not inflate that sum. Progress belongs to a cell and stays behind when symbols fall.
- Normal badges reveal a common symbol and boost their own position plus one uniformly chosen already visible matching regular symbol by ×2/×4/×8. Upgraded infection boosts every already visible match. Badges resolve in sequence; future unrevealed badges stay untouched until their turn. Bombs clear regular symbols, protect Wild/Bonus, double affected cells and resolve before replacements fall.
- Dorm, Friday and 8 December bonuses have **7/8/10 starting spins** and **1/2/3 distinct random upgrades**: Infectious xWays, 5×5 Bombs and +2 shots. Bought bonuses first show 3/4/5 invitations landing, then reveal the already committed upgrades on a party wheel. Dorm has one pointer, Friday two pointers to different upgrades, and December a stationary wheel with all three active. Wild arrivals vary; buys do not impose a fixed maximum number of Wilds.
- Normal / xBet / Day 2 / Day 64 / Day 1024 cost **1× / 2× / 2.8× / 90× / 3000×** the base bet. Day modes initialize every cell at the advertised multiplier. Direct buys cost **70× / 200× / 600×**; Lucky Draw costs **235×** and selects tiers with **50% / 25% / 25%** probabilities.
- Eligible Extra Spin offers open a **centered decision dialog over a blurred game**. Choose Buy or No thanks before continuing; autoplay stops when an offer appears. The dialog shows the exact euro price, retains the position grid and locked stake, and the purchased spin contains no Bonus symbols. The whole continuation chain shares the **30,000×** cap. The disclosed extra-spin quotation formula is an original implementation; the publisher's private formula is unavailable.
- Integer-cent accounting and atomic saved outcomes prevent repeated charges or payouts on reload. Version 3 uses a new save key and leaves both v1 and v2 saves untouched; language and audio preferences are preserved. Invalid data has download, retry and explicit reset controls.

Space spins while idle and skips presentation while busy. Tapping the reels also skips. Neither action bypasses an Extra Spin decision. The upgrade wheel reveals persisted awards rather than rolling another result, and Continue starts the feature presentation. Normal/turbo, mute/volume, BG/EN, history, paytable and bounded autoplay are available. Refill adds €10,000 virtual euros.

## Research and mathematics

[Duck Hunters research](docs/DUCK-HUNTERS-REDESIGN.md) cites official rules, public demo assets and timestamped official footage. [Research comparison](docs/RESEARCH.md) covers the other Nolimit City titles. [Presentation](docs/PRESENTATION.md) explains how the Studentski Grad artwork and animation sequence follow the findings.

[Mathematics](docs/MATHEMATICS.md) specifies the implemented payout formula, distributions, continuation pricing and accounting. [Simulation results](docs/simulation-results.json) must match the current engine/configuration hashes. The commercial game's private reel strips and theoretical mathematics are unavailable; this demo uses independent distributions and measured results. Do not treat a target or sample mean as a certified return, or as a guarantee that a playing session makes a profit.

The nine-symbol numeric paytable and current feature prices are verified against the official public guest demo. The filtered public initialization data and symbol mapping are recorded in [paytable evidence](docs/duck-hunters-public-paytable.json). The normal-badge extra target is the requested original rule change. Sampler distributions and Extra Spin pricing are also original because the publisher does not disclose its complete random model or continuation quote.

## Validate

Version3 passed **58 engine tests** and **32 browser checks** against the current source/artwork hashes, across desktop and touch layouts. The production build was played and reloaded against pure-engine outcomes; reload preserved the award, debit and remaining feature state, and development hooks were absent. The current [simulation report](docs/simulation-results.json) records exact source/configuration hashes, actual debits, measured returns and uncertainty.

The independently verified version3 report covers **9,000,000 paid rounds** plus **1,000,000 source rounds for a conditional Extra Spin cohort**. Normal returned **97.04%** in 5,000,000 rounds, with an approximate 95% interval of **92.18–101.91%**; these are sample measurements, not an exact or certified 96% return. Earlier version2 results are archived and do not describe the changed normal-badge rule.

Engine tests and the production build:

```bash
npm test
npm run build
```

Optional automated browser tests start and close their own server:

```bash
npx playwright install chromium
npm run test:browser
```

On Linux the runner can use `/usr/bin/chromium` when installed. Windows/macOS use Playwright's downloaded Chromium. Set `CHROMIUM_PATH` only to an existing explicit browser executable. `SLOT_BASE_URL` optionally tests an already running development server without closing it.

A reproducible simulation (PowerShell):

```powershell
$env:SIM_ROUNDS = '500000'
$env:SIM_STANDARD_ROUNDS = '5000000'
$env:SIM_EXTRA_ROUNDS = '1000000'
$env:SIM_SEED = '83918213'
$env:SIM_OUTPUT = 'docs/simulation-results.json'
npm run simulate
```

For Bash, prefix the same variables on the `npm run simulate` command. `SIM_MODE` selects a specific mode or buy. Simulation outputs include actual-debit return, confidence intervals, win/profit frequencies, payout quantiles, modifier counts, bonuses, cascades and accounting checks.

## Original assets

All 24 production illustrations are directly authored SVG path geometry in `public/art-v2`, using curved silhouettes, irregular ink contours, facial and hand details, local gradients, selective hatching and vector grain. [Asset provenance](public/art-v2/README.md) records their source and use. A paper/ochre/rust/mint party palette ties the scenes together. The larger board, visible multiplier numbers and surrounding controls share the same illustrated setting. No commercial game artwork, web photographs, reference-video frames or generated raster backgrounds are shipped. Four scenes depict a Sofia dorm street with food and club storefronts, a lived-in pre-party kitchen, a Friday nightclub and a winter 8 December student stage. The original synthesized audio uses no recorded commercial soundtrack. Oswald and Manrope include Cyrillic support and their font licenses.

Earlier research, designs and simulations are preserved in `docs/archive/v1` and `docs/archive/v2` for historical reference. Their measured returns do not describe version3.
