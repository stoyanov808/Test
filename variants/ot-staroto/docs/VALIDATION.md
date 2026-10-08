# Version 2 validation

The server-based version passed **35 engine tests**, the TypeScript/Vite production build and **69 browser checks**. The root `npm test` command ran the new suite; root `npm run dev` served the new HTML and version 2 modules successfully. Root build and preview serve the production variant.

Browser checks exercise the actual collector sequence and single terminal payout; retained/new collector transfers; useful Wild substitution, sticky exhaustion and recharge; recorded MAX-cell shots and unchanged miss boards; all bonuses; exact receipts, credits and RNG; pending reloads and double-click protection; version 1 wallet preservation; BG/EN/EUR; local WAV storage, mute, volume and removal; independent symbol descent; nonhoverable cells; reduced motion; desktop, portrait and landscape controls.

The production HTTP bundle loads its real assets, has no developer fixture hooks, and supports base play, paid features and pending-result reload without a second charge. No JavaScript errors, missing assets or external requests were recorded.

## Tumble and reveal changes

The 180,000 settled-round sample had zero accounting, cap, safety or character-entitlement failures. Base play averaged **0.174 actual extra tumbles per spin**, versus approximately **3.26** in version 1. Every current mode averaged below **0.685** extra tumbles; its 95th percentile was no higher than **2**. The base longest observed chain was eight actual tumbles. Winning chains are not silently truncated.

Monetary coin occupancy at the 95th percentile was **10 cells or fewer out of 30** in every mode. Empty reveal positions are distinct from monetary coins. Mark occupancy and coin occupancy are recorded separately in the full sample. The longest observed coin reveal was seven waves; a retained collector alone never activates another wave.

## Actual-debit return sample

These finite deterministic samples use each mode’s complete debit and approximate normal confidence intervals. They are not theoretical or certified RTP. Base observed **89.98%**, with a **80.87–99.09%** interval; the approximately 96% target remains unestablished for base play. The full report preserves rare-tail uncertainty and each mode’s measured contributions.

| Mode | Rounds | Observed return | Approximate 95% interval | Mean extra tumbles | 95th percentile |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base spin | 100,000 | 89.98% | 80.87–99.09% | 0.174 | 1 |
| Left xBet | 10,000 | 98.42% | 91.24–105.61% | 0.684 | 2 |
| Right xBet | 10,000 | 96.63% | 81.55–111.70% | 0.179 | 1 |
| Middle xBet | 10,000 | 94.98% | 85.14–104.82% | 0.480 | 1 |
| Русенско Варено | 10,000 | 94.52% | 86.36–102.67% | 0.320 | 1 |
| ЛУКС | 10,000 | 91.45% | 86.81–96.09% | 0.138 | 1 |
| Ръба са обажда | 10,000 | 94.22% | 89.72–98.72% | 0.319 | 1 |
| ОТ СТАРОТО | 10,000 | 96.25% | 92.36–100.14% | 0.360 | 1 |
| God Spin | 10,000 | 97.94% | 93.31–102.56% | 0.123 | 1 |

## Evidence

[Browser record](browser-validation.json) · [Full mathematics sample](mathematics-sample.json) · [Source and screenshot hashes](release-manifest.json) · [Gallery](GALLERY.md) · [Reference access and adaptation](LE-BANDIT-REFERENCE.md)

Runtime, sampler, production bundle and all current screenshot hashes were independently checked against the frozen files. The default server workflow is `npm ci` then `npm start` at the repository root. The standalone HTML remains a secondary artifact; direct file launch is not claimed as tested.
