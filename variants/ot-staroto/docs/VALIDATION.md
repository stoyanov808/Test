# Version 5.1 presentation validation

This presentation update preserves the version 5 mathematical engine, catalogue, audio and receipt format. The earlier exhaustive replay and production sample remain valid against unchanged source hashes; they were not rerun for this art change. The current source passed **59 engine tests**, the TypeScript/Vite production build, **134 browser checks**, and **80 exact mode/stake return calculations**. All **425,984** catalogue stake outcomes were evaluated completely. The production-selector sample settled **200,000** rounds without accounting, cap, safety or character-entitlement failures.

Every offered mode proves exactly **96.5% expected return** against its full debit at all eight supported stakes. This is a mathematical expectation, separate from the finite observed return below. See [RTP calculation](MATH-MODEL.md) and [complete proof](mathematics-proof.json).

Browser validation covers held Space on the board, Spin button, buy confirmation and win scenes; hundreds of repeated events cannot start another paid round or skip animation. A new release/press starts one more round. It verifies the exact 19 reference paths and visible chart, longest line awards, gap and overlapping-cell rules, six-Wild awards, multiple expanding reels, optional follow-up shots, immediately sticky bonus expansions, persistent highlighted characters and bottom-row reel totals, and next-spin recharge, every marked coin reveal, exact 3× boost cost, collector chains, useful Wilds, recorded MAX shots and same-board misses, all buys, pending reload without fresh entropy, previous wallet preservation, BG/EN, static WAV decoding, mute/music/volume persistence, removal of upload controls, independent drops, 16 authored character frames per actor, larger cast, seated LUX contact with the original speaker, unclipped foreground actions, and full-window desktop/portrait/landscape controls.

Exact-pose captures use an explicitly recorded 4.1667ms QA presentation clock only for character-frame gates. Separate feature-action samples use native requestAnimationFrame timing with Turbo enabled; the animation-only diagnostic checks Normal speed separately. Production interaction tests use native browser timing. Exact-pose captures do not establish frame-rate guarantees for every device. Engine receipts and entropy are unchanged by the capture clock. Production tests exercise the actual built HTTP bundle, fresh Web Crypto UI selection and complete saved entropy tapes. A separately labelled multi-Shooter example uses a genuine Node Web Crypto paid receipt committed before production reload; its replay draws no new browser entropy. The developer fixture hooks are absent from production. No JavaScript, missing-asset or external-network failures were recorded. Source, build and screenshot hashes identify the tested files.

## Production-selector sample

Each row records complete debits and awards. Approximate normal confidence intervals describe sampling uncertainty and do not replace the exact expectation proof. A finite session or sample can return less than 96%.

| Mode | Rounds | Observed return | Approximate 95% interval | Mean extra tumbles | 95th percentile |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base spin | 60,000 | 124.85% | 61.05–188.64% | 0.151 | 1 |
| X BET 5× chance | 60,000 | 84.12% | 42.38–125.85% | 0.177 | 1 |
| Left xBet | 10,000 | 97.67% | 92.08–103.26% | 0.687 | 2 |
| Right xBet | 10,000 | 88.38% | 77.21–99.54% | 0.263 | 1 |
| Middle xBet | 10,000 | 87.89% | 75.33–100.45% | 0.610 | 2 |
| Русенско Варено | 10,000 | 96.14% | 93.19–99.08% | 0.447 | 1 |
| ЛУКС | 10,000 | 96.21% | 93.90–98.53% | 0.222 | 1 |
| Ръба са обажда | 10,000 | 92.42% | 87.80–97.05% | 0.584 | 2 |
| ОТ СТАРОТО | 10,000 | 96.69% | 93.00–100.39% | 0.606 | 2 |
| God Spin | 10,000 | 95.14% | 90.57–99.71% | 0.200 | 1 |

The sample uses fresh Web Crypto words. Its initial ledger seeds do not predetermine the paid draws. Rare tails can remain unsampled; the exact finite catalogue calculation includes every supported outcome.

## Evidence

[Browser record](browser-validation.json) · [Sample](mathematics-sample.json) · [Exact proof](mathematics-proof.json) · [Presentation review](research/v5-presentation-review.json) · [Version 5 math review](research/v5-independent-review.json) · [Payline reference](LE-ZEUS-REFERENCE.md) · [Hashes](release-manifest.json) · [Gallery](GALLERY.md) · [Sound-file instructions](../public/audio/README.md)

Runtime, mathematical, production and current screenshot hashes were independently checked against frozen files. Use `npm ci` then `npm start` from the repository root. Production uses `npm run build` and `npm run preview`. The secondary HTML requires its adjacent audio directory and an HTTP server; direct file launch is not claimed as tested.
