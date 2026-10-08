# Download validation

The frozen build passed 31 engine tests, the TypeScript/Vite production build, and 51 browser checks. The browser checks exercised all four purchases, character reveals and impacts, natural bonus entry, retriggers, sticky Wilds, repeated shots, remaining-spin counters, pending-result reloads, exact receipt/credit/RNG agreement, BG/EN settings, EUR formatting, local WAV upload/removal, mute/volume, a 400 × 840 mobile layout and the actual 19,999× God award.

The standalone bundle contains its artwork, font, CSS and JavaScript. Its production checks requested only the HTML document, including reloads: no secondary resources, external requests, JavaScript errors or asset failures. Production contains no developer fixture controls. The download launcher additionally returned the identical HTML bytes from both `/` and `/PLAY.html`.

**Direct file launch remains unverified here.** Managed cloud Chromium rejected `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The unchanged standalone file was checked through a private local HTTP server. The Windows/Node launcher is included as a practical fallback for restricted browsers.

## Payout sample

180,000 full settled rounds had zero accounting, cap, safety or bonus-entitlement failures. Returns use the complete actual debit for each mode. These are finite deterministic samples with approximate normal confidence intervals; they are not theoretical or certified RTP. The modes are not all established at 96%, and further calibration is appropriate before any release beyond prototype testing.

| Mode | Rounds | Observed return | Approximate 95% interval |
| --- | ---: | ---: | ---: |
| Base spin | 100,000 | 97.22% | 90.56–103.89% |
| Left xBet | 10,000 | 101.77% | 90.56–112.99% |
| Right xBet | 10,000 | 91.34% | 86.77–95.91% |
| Middle xBet | 10,000 | 94.17% | 87.10–101.24% |
| Русенско Варено | 10,000 | 92.60% | 76.45–108.76% |
| ЛУКС | 10,000 | 99.96% | 97.74–102.19% |
| Ръба са обажда | 10,000 | 87.28% | 79.79–94.77% |
| ОТ СТАРОТО | 10,000 | 101.17% | 97.01–105.33% |
| God Spin | 10,000 | 96.09% | 91.51–100.68% |

All source and screenshot hashes were independently checked against the current files after both final runs. See [browser evidence](browser-validation.json), [complete mathematics sample](mathematics-sample.json), [release manifest](release-manifest.json) and [screenshots](GALLERY.md).

Standalone SHA256: `6611e041cae3218c28eabcd79862938a030808977bcd373d3b878d15b4482ca6`

The source and ready-to-play distribution are stored under `variants/ot-staroto` in the repository. The [test ZIP](../release/ot-staroto-test.zip) includes the HTML, launcher, license and validation record.
