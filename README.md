# ОТ СТАРОТО

A browser slot set in a Ruse courtyard, with original ink cartoon artwork, three feature characters, Bulgarian/English controls and virtual euro credits. This is the default game launched by the repository commands.

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

The left character throws Wilds and retains them in his bonus. The middle character shoots Wilds, with repeated hits doubling their multiplier. The right character reveals marked winning positions as coins, modifiers and collectors. All three can appear together in **ОТ СТАРОТО**, the 2,500× super bonus. **Русенско Варено**, **ЛУКС** and **Ръба са обажда** each have their own character.

Nine regular symbol types reduce routine tumble chains. Active Wilds substitute toward eight matching positions and multiply regular wins. Sticky Wilds retain their position and multiplier throughout the bonus, dim after contributing to a winning tumble, and recharge on the next free spin.

Coin rounds reveal the whole wave before applying modifiers or collecting. A new collector absorbs the revealed values and any previous collector; collected positions clear and reveal again. The last collector stays. The terminal coin board is paid once.

God Spin places one **MAX** symbol in an actual grid. The car's shots target recorded random grid cells; hitting MAX awards the shared **19,999×** round cap. Feature buys, X Bet prices, ordinary payouts and all animations follow the settled receipt. Reload cannot charge or pay it twice.

The controls sit inside the game scene. Settings retain BG/EN, mute, volume and locally uploaded music and effects. All credits are virtual. The approximately 96% return target is prototype mathematics, not certified RTP; see the complete sampled results below.

[Game rules and development notes](variants/ot-staroto/README.md) · [Reference and adaptation notes](variants/ot-staroto/docs/LE-BANDIT-REFERENCE.md) · [Screenshot gallery](variants/ot-staroto/docs/GALLERY.md) · [Validation](variants/ot-staroto/docs/VALIDATION.md)

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser runner starts and closes its own server. Linux can use an installed `/usr/bin/chromium`; Windows and macOS use Playwright's installed Chromium. `npm run simulate` regenerates the mathematical sample with source hashes, payout and accounting checks.

## Previous Studentski Grad game

The earlier game is still available with `npm run start:studentski`. Its build and engine tests use `npm run build:studentski` and `npm run test:studentski`. [Historical documentation](docs/archive/studentski-v5.5/README.md) records that version.
