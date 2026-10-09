# Version 4 validation

The current source passed **57 engine tests**, the TypeScript/Vite production build, **111 browser checks**, and **80 exact mode/stake return calculations**. All **425,984** catalogue stake outcomes were evaluated completely. The production-selector sample settled **200,000** rounds without accounting, cap, safety or character-entitlement failures.

Every offered mode proves exactly **96.5% expected return** against its full debit at all eight supported stakes. This is a mathematical expectation, separate from the finite observed return below. See [RTP calculation](MATH-MODEL.md) and [complete proof](mathematics-proof.json).

Browser validation covers held Space on the board, Spin button, buy confirmation and win scenes; hundreds of repeated events cannot start another paid round or skip animation. A new release/press starts one more round. It verifies the exact 19 reference paths and visible chart, longest line awards, gap and overlapping-cell rules, six-Wild awards, multiple expanding reels, optional follow-up shots, whole-reel bonus locks and recharge, every marked coin reveal, exact 3× boost cost, collector chains, useful Wilds, recorded MAX shots and same-board misses, all buys, pending reload without fresh entropy, previous wallet preservation, BG/EN, static WAV decoding, mute/music/volume persistence, removal of upload controls, independent drops, eight authored character frames, and full-window desktop/portrait/landscape controls.

Production tests exercise the actual built HTTP bundle, fresh Web Crypto UI selection and complete saved entropy tapes. A separately labelled multi-Shooter example uses a genuine Node Web Crypto paid receipt committed before production reload; its replay draws no new browser entropy. The developer fixture hooks are absent from production. No JavaScript, missing-asset or external-network failures were recorded. Source, build and screenshot hashes identify the tested files.

## Production-selector sample

Each row records complete debits and awards. Approximate normal confidence intervals describe sampling uncertainty and do not replace the exact expectation proof. A finite session or sample can return less than 96%.

| Mode | Rounds | Observed return | Approximate 95% interval | Mean extra tumbles | 95th percentile |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base spin | 60,000 | 109.00% | 79.34–138.67% | 0.159 | 1 |
| X BET 5× chance | 60,000 | 87.31% | 70.29–104.33% | 0.202 | 1 |
| Left xBet | 10,000 | 98.90% | 92.86–104.94% | 0.683 | 2 |
| Right xBet | 10,000 | 85.92% | 76.24–95.61% | 0.275 | 1 |
| Middle xBet | 10,000 | 97.39% | 83.57–111.21% | 0.589 | 2 |
| Русенско Варено | 10,000 | 95.81% | 92.84–98.78% | 0.448 | 1 |
| ЛУКС | 10,000 | 95.40% | 93.04–97.75% | 0.220 | 1 |
| Ръба са обажда | 10,000 | 95.13% | 92.01–98.25% | 0.489 | 2 |
| ОТ СТАРОТО | 10,000 | 99.07% | 95.53–102.61% | 0.549 | 2 |
| God Spin | 10,000 | 95.94% | 91.35–100.52% | 0.202 | 1 |

The sample uses fresh Web Crypto words. Its initial ledger seeds do not predetermine the paid draws. Rare tails can remain unsampled; the exact finite catalogue calculation includes every supported outcome.

## Evidence

[Browser record](browser-validation.json) · [Sample](mathematics-sample.json) · [Exact proof](mathematics-proof.json) · [Independent review](research/v4-independent-review.json) · [Payline reference](LE-ZEUS-REFERENCE.md) · [Hashes](release-manifest.json) · [Gallery](GALLERY.md) · [Sound-file instructions](../public/audio/README.md)

Runtime, mathematical, production and current screenshot hashes were independently checked against frozen files. Use `npm ci` then `npm start` from the repository root. Production uses `npm run build` and `npm run preview`. The secondary HTML requires its adjacent audio directory and an HTTP server; direct file launch is not claimed as tested.
