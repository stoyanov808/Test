# Version 3 validation

The current source passed **43 engine tests**, the TypeScript/Vite production build, **88 browser checks**, and **80 exact mode/stake return calculations**. All **376,832** catalogue stake outcomes were evaluated completely. The production-selector sample settled **200,000** rounds without accounting, cap, safety or character-entitlement failures.

Every offered mode proves exactly **96.5% expected return** against its full debit at all eight supported stakes. This is a mathematical expectation, separate from the finite observed return below. See [RTP calculation](MATH-MODEL.md) and [complete proof](mathematics-proof.json).

Browser validation covers held Space on the board, Spin button, buy confirmation and win scenes; hundreds of repeated events cannot start another paid round or skip animation. A new release/press starts one more round. It verifies exact 3× boost cost, current collector chains, useful Wilds, sticky recharge, recorded MAX shots and same-board misses, all buys, pending reload without fresh entropy, previous wallet preservation, BG/EN, static WAV decoding, mute/music/volume persistence, removal of upload controls, independent drops, eight authored character frames, and full-window desktop/portrait/landscape controls.

Production tests exercise the actual built HTTP bundle, fresh Web Crypto selection and complete saved entropy tapes. The developer fixture hooks are absent from production. No JavaScript, missing-asset or external-network failures were recorded. Source, build and screenshot hashes identify the tested files.

## Production-selector sample

Each row records complete debits and awards. Approximate normal confidence intervals describe sampling uncertainty and do not replace the exact expectation proof. A finite session or sample can return less than 96%.

| Mode | Rounds | Observed return | Approximate 95% interval | Mean extra tumbles | 95th percentile |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base spin | 60,000 | 128.08% | 54.94–201.22% | 0.155 | 1 |
| X BET 5× chance | 60,000 | 131.43% | 82.31–180.54% | 0.170 | 1 |
| Left xBet | 10,000 | 96.66% | 85.00–108.31% | 0.636 | 1 |
| Right xBet | 10,000 | 87.11% | 79.04–95.19% | 0.174 | 1 |
| Middle xBet | 10,000 | 95.19% | 90.73–99.65% | 0.521 | 1 |
| Русенско Варено | 10,000 | 102.83% | 95.41–110.25% | 0.391 | 1 |
| ЛУКС | 10,000 | 95.91% | 92.40–99.41% | 0.168 | 1 |
| Ръба са обажда | 10,000 | 99.80% | 95.12–104.48% | 0.316 | 1 |
| ОТ СТАРОТО | 10,000 | 94.18% | 90.24–98.13% | 0.415 | 1 |
| God Spin | 10,000 | 96.40% | 91.81–101.00% | 0.136 | 1 |

The sample uses fresh Web Crypto words. Its initial ledger seeds do not predetermine the paid draws. Rare tails can remain unsampled; the exact finite catalogue calculation includes every supported outcome.

## Evidence

[Browser record](browser-validation.json) · [Sample](mathematics-sample.json) · [Exact proof](mathematics-proof.json) · [Hashes](release-manifest.json) · [Gallery](GALLERY.md) · [Sound-file instructions](../public/audio/README.md)

Runtime, mathematical, production and current screenshot hashes were independently checked against frozen files. Use `npm ci` then `npm start` from the repository root. Production uses `npm run build` and `npm run preview`. The secondary HTML requires its adjacent audio directory and an HTTP server; direct file launch is not claimed as tested.
