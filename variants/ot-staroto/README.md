# ОТ СТАРОТО

A playable Ruse noir cartoon slot prototype, built from the supplied specification and visual references. Virtual euro credits, Bulgarian/English controls, six columns and five rows.

## Play the download

Download the [ready-to-play test ZIP](https://github.com/stoyanov808/Test/raw/refs/heads/main/variants/ot-staroto/release/ot-staroto-test.zip). Alternatively, use GitHub's **Code → Download ZIP**, extract the repository, and open `variants/ot-staroto/release`.

Extract the test ZIP and double-click **PLAY.html** in Chrome, Edge or Firefox. The file contains the JavaScript, styles, font and artwork. Allow local browser storage to keep credits and resume a pending result; moving the file or changing browsers may give it a separate save.

If your browser restricts local HTML or its storage, the download also includes **START-WINDOWS.bat**. With Node already installed, double-click it to serve the same file locally and open the actual address automatically. On other systems run `node START.cjs`. Keep that terminal open while playing. Neither launch method needs internet access.

Use **Settings** to choose your own music, gunshot, feature and win audio files. Files stay on your device and are stored in this browser where IndexedDB is available. Each file may be up to 50 MB. Mute, volume, remove and reset controls also affect custom audio.

## Characters and bonuses

| Character | Feature | Bought bonus | Price in base stakes |
| --- | --- | --- | ---: |
| Left, sunglasses | Throws Wilds. In his bonus they remain at their coordinates until the bonus ends. | Русенско Варено | 35× |
| Right, coin dealer | Winning cells are marked; he reveals their coins, collectors, local modifiers and coin-wide multipliers after regular combinations clear. | ЛУКС | 250× |
| Middle, shooter | Fires at recorded random targets. A new hit creates a Wild; a repeat hit doubles it. Shooter-created Wilds reset next spin. | Ръба са обажда | 600× |
| All three | Sticky Wilds, shooting and marked-cell coins together. | ОТ СТАРОТО | 2,500× |

Each individual bonus starts with ten spins; the super starts with fifteen. Bought invitations visibly drop before the feature begins. A natural initial drop with 3/4/5/6 invitations awards the corresponding tier. In a bonus, two invitations add two spins; three add five; four add five and upgrade to at least ЛУКС; five add five and upgrade to at least Ръба са обажда; six add ten and unlock ОТ СТАРОТО. An upgrade changes the eligible character to that tier; previously retained sticky Wilds and marked cells stay until the bonus ends. Only the super admits all three arriving feature characters.

X Bet guarantees the selected character on the initial drop: left **1.5×**, middle **4.5×**, right **45×**. These prices reflect their different sampled feature values. The mode's displayed debit is the complete cost; it is not added to another spin charge.

God Spin costs **3,000×**. The car arrives and the characters fire at the MAX target. A recorded hit pays the **19,999× base-stake cap**; misses continue with an ordinary recorded spin. The complete round, including any bonus, shares that cap. At a €0.20 stake, the super costs €500, God Spin costs €600, and the max award is €3,999.80.

## Payout and presentation rules

Wins count matching positions anywhere at 8/10/12+ cells, including Wild substitution. A win also requires **seven natural symbols of that type**. This original eligibility rule lets sticky Wild cascades end naturally instead of sustaining guaranteed refill loops. Feature badges and invitations enter on initial drops; refills use regular symbols. There is at most one invitation per reel. Full-Wild boards do not invent six regular-symbol awards.

The sum of visible Wild multipliers, with a minimum of one, multiplies regular wins. Repeated shots double their recorded Wild target. Local and global coin modifiers affect that coin reveal's awards; they do not rewrite the Wild multiplier sum. Coin denominations range from 1× to 500× before their recorded modifiers. A collector awards the actual sum of the value coins. All awards use integer euro cents and the shared round cap.

Every outcome is settled and saved before animation. Reload replays the same receipt, without another debit or award. Each symbol falls independently, sticky positions stay fixed, and the board has no hover highlights or tooltips. Click the board or press Space to skip replay. The win counter introduces a second character at 100×, a third at 500×, red shooting effects at 1,000×, and a car escape at the actual max win.

This is original prototype mathematics, not the private random model of Duck Hunters or Le Bandit. The [mathematics sample](docs/mathematics-sample.json) records actual-debit returns, uncertainty and accounting checks for the frozen implementation. The approximately 96% target is not a certified theoretical RTP.

The generated raster art and authored SVG assets are documented in [the art record](public/art/README.md). The reference images themselves, commercial slot sprites and commercial recordings are not shipped.

## Develop and verify

Requires Node 20.19+ in Node 20, or Node 22.12+.

Run the following commands from `variants/ot-staroto`. The repository root runs the separate Studentski Grad game.

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm start
```

`npm run build` produces the standard `dist` bundle and the self-contained `release/PLAY.html`. `npm start` opens the address actually used by Vite. On Linux the browser runner can use `/usr/bin/chromium`; Windows/macOS use Playwright's installed Chromium. The browser runner owns its development server, verifies the standalone file separately, and saves actual seeded screenshots and a source/receipt validation record under `docs`.

`npm run simulate` regenerates the deterministic prototype sample. Samples demonstrate this implementation, with uncertainty; selected screenshots demonstrate possibilities rather than win frequency. The [screenshot gallery](docs/GALLERY.md) and [validation record](docs/VALIDATION.md) document this download.
