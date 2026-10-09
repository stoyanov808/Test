# Le Zeus payline reference

Checked on **9 October 2026** for the requested ОТ СТАРОТО conversion from count-anywhere wins to fixed paylines.

## Publisher access and source quality

The [official Hacksaw Gaming Le Zeus page](https://hacksawgaming.com/games/le-zeus), publisher home page, demo/staging hosts and publisher-group page were rejected by the configured network proxy with `Tunnel connection failed: 403 Forbidden` before their content could be read. Search engines, gameplay search and independent review pages were also blocked. The [access log](research/le-zeus-access.json) records the attempted URLs and results.

An accessible [unaffiliated GitHub review, pinned to its source revision](https://github.com/LeZeusSlot/.github/blob/6cbe0fa253854bba66e6e0f4ea2ebb85fdfce8a0/README.md), explicitly states **6 reels × 5 rows and 19 winning lines**. A [local snapshot](research/le-zeus-secondary-review.md) preserves that text. This is an SEO/affiliate repository, not a publisher game sheet, and it contains **no numbered line diagram or coordinates**. It was not used to supply line coordinates. The later user-provided chart, described below, supplies direct visual evidence for the grid and 19 paths.

A separate [public demo-list repository](https://github.com/zeemowo/HackSaw-Demo-Slots-Games/blob/26030de9195c60e194c71d163433eea874c69878/dist/finalOutput.json) lists a differently titled “Ze Zeus” and a publisher staging-demo address. That address was blocked, and this list does not prove that its entry is the requested Le Zeus game.

The network research did not retrieve official rules, a game sheet or gameplay frames. It does **not** establish the exact 19 line paths, line numbering, payment direction, multiplier order, probabilities or animation timings.

## User-supplied GAME INFO screenshots

The user subsequently supplied two **GAME INFO — LE ZEUS** screenshots. These are user-provided Le Zeus Game Info screenshots, reviewed and transcribed by the primary agent on **9 October 2026**. This reference subtask did not receive local image files for separate pixel inspection. The [transcription evidence](research/le-zeus-user-screenshots.json) records the displayed values and their normalization. These screenshots provide direct evidence for the displayed paytable and Wild substitution rule, while the publisher-access restrictions above still apply.

At the visible **€2 demo bet**, the displayed awards normalize as follows. Entries are ordered by a consecutive match of **3 / 4 / 5 / 6** symbols; every multiplier is the displayed amount divided by €2, without applying an assumed line-bet divisor.

| Symbol group shown | Displayed euro awards | Multiples of the visible €2 bet |
| --- | --- | --- |
| Four low Greek-letter symbols | €0.20 / €0.60 / €2 / €6 | 0.1× / 0.3× / 1× / 3× |
| Cornucopia and lyre | €1 / €2 / €4 / €10 | 0.5× / 1× / 2× / 5× |
| Swords and masks | €2 / €4 / €8 / €20 | 1× / 2× / 4× / 10× |
| Wings | €4 / €10 / €20 / €100 | 2× / 5× / 10× / 50× |
| Helmet | €6 / €20 / €40 / €200 | 3× / 10× / 20× / 100× |
| Wild, six symbols only | €400 | 200× |

The second screenshot states that **Wild substitutes for all paytable symbols** and reports **96.26% theoretical RTP calculated over 10 billion rounds**. That is the displayed commercial game's own claim; it is not this prototype's RTP, an independently rerun calculation or evidence of its private outcome probabilities. The six-Wild award confirms a displayed all-Wild payment, but the screenshots do not establish how competing Wild and ordinary-symbol line awards are selected or multiplied.

Six reel columns are visible behind the modal. The image framing is consistent with five rows, but does not independently expose a complete numbered 19-line chart. **Neither screenshot contains exact payline diagrams or line coordinates.** Those initial two images did not confirm the unaffiliated 19-line claim; the user subsequently supplied a separate complete chart.

The user's requested match concerns the **line layout**. Copying these commercial symbol payouts, artwork or RTP is not implied. The prototype can retain its own nine illustrated symbol types and original mathematical calibration. The separate chart below supplies the requested layout while leaving the prototype's own paytable and mathematical calibration independent.

## User-supplied complete payline chart

The user subsequently supplied the **Le Zeus GAME INFO payline chart** as an inline image. The primary agent reviewed and transcribed its **19 paths on a 6×5 grid**, displayed as **seven diagrams, seven diagrams, then five diagrams**. This reference subtask received the primary transcription, rather than a local copy of the image. An independent reviewer directly inspected the inline image and transcribed all 19 paths before comparison; that transcription exactly matches the primary transcription and implementation. Both reviews confirm six columns, five rows and one selected position per column in every path. The [coordinate evidence](research/le-zeus-payline-chart.json) records source provenance, both coordinate conventions and the [implemented paths](../src/paylines.ts).

The chart contains no visible printed line numerals. The IDs below follow **diagram reading order**—left to right across each displayed row—and are the prototype's identifiers. They do not claim separately verified commercial line numbering. Each six-number path selects one row on each successive reel from left to right; rows count from the top. That drawing convention does not independently establish a left-to-right payment rule.

| Prototype ID | Diagram row/column | Top row = 1 | Top row = 0 |
| --- | --- | --- | --- |
| 1 | 1/1 | 1, 1, 1, 1, 1, 1 | 0, 0, 0, 0, 0, 0 |
| 2 | 1/2 | 2, 2, 2, 2, 2, 2 | 1, 1, 1, 1, 1, 1 |
| 3 | 1/3 | 3, 3, 3, 3, 3, 3 | 2, 2, 2, 2, 2, 2 |
| 4 | 1/4 | 4, 4, 4, 4, 4, 4 | 3, 3, 3, 3, 3, 3 |
| 5 | 1/5 | 5, 5, 5, 5, 5, 5 | 4, 4, 4, 4, 4, 4 |
| 6 | 1/6 | 1, 2, 1, 2, 1, 2 | 0, 1, 0, 1, 0, 1 |
| 7 | 1/7 | 2, 3, 2, 3, 2, 3 | 1, 2, 1, 2, 1, 2 |
| 8 | 2/1 | 3, 4, 3, 4, 3, 4 | 2, 3, 2, 3, 2, 3 |
| 9 | 2/2 | 4, 5, 4, 5, 4, 5 | 3, 4, 3, 4, 3, 4 |
| 10 | 2/3 | 2, 1, 2, 1, 2, 1 | 1, 0, 1, 0, 1, 0 |
| 11 | 2/4 | 3, 2, 3, 2, 3, 2 | 2, 1, 2, 1, 2, 1 |
| 12 | 2/5 | 4, 3, 4, 3, 4, 3 | 3, 2, 3, 2, 3, 2 |
| 13 | 2/6 | 5, 4, 5, 4, 5, 4 | 4, 3, 4, 3, 4, 3 |
| 14 | 2/7 | 1, 2, 3, 3, 2, 1 | 0, 1, 2, 2, 1, 0 |
| 15 | 3/1 | 2, 3, 4, 4, 3, 2 | 1, 2, 3, 3, 2, 1 |
| 16 | 3/2 | 3, 4, 5, 5, 4, 3 | 2, 3, 4, 4, 3, 2 |
| 17 | 3/3 | 5, 4, 3, 3, 4, 5 | 4, 3, 2, 2, 3, 4 |
| 18 | 3/4 | 4, 3, 2, 2, 3, 4 | 3, 2, 1, 1, 2, 3 |
| 19 | 3/5 | 3, 2, 1, 1, 2, 3 | 2, 1, 0, 0, 1, 2 |

The complete chart resolves the earlier uncertainty about grid size, line count and path shapes. It supplies no private probabilities, multiplier order or animation timings. Publisher URLs remain blocked; this verification relies on the user-provided chart, not a retrieved official web page.

## Rules requested for this prototype

These come from the user, independently of the inaccessible commercial reference:

- Replace count-anywhere symbol wins with fixed paylines. A line receipt must record its number, matching symbol, consecutive reel count, winning positions, Wild substitutions and paid cents; shared cells must be marked once for the coin feature.
- Every previously marked eligible box must reveal a coin when the right-character feature triggers. Limit coin values, modifiers and trigger weights through the new mathematical model, rather than leaving marked positions blank. Keep the complete reveal → modifiers → new collector → clear/retain → re-reveal sequence and pay terminal values once.
- Make the middle-character symbol a rare expanding Wild. Each landed shooter expands its own entire reel; more than one landed shooter can expand different reels in the same round. Expansion targets must come from the recorded board, and the animation must replay that receipt without adding randomness.
- In the user's subsequent original mechanic, an expanded shooter can also produce recorded shots. A hit on an ordinary position creates a one-use Wild; repeated hits double its multiplier. A shot hitting an already expanded Wild reel doubles all five Wild multipliers. The user's latest correction makes **every bonus expansion immediately sticky until that bonus ends**, without requiring a shot. Its highlighted character remains on the reel, with the sum of its retained five Wild multipliers at the bottom. Base-game expansions do not carry into a later bonus. These rules are user-derived prototype mechanics, not transcriptions of Le Zeus rules.
- Keep the separate God Spin's MAX-cell shooting rule unless the user changes it. The left character continues to throw Wilds only; the right character continues to own coin reveals.
- Replace the Ruse-yard background with an original cream/black ink scene matching the supplied character drawings.

Version 5 rebuilds the catalogue for immediately sticky bonus expansions while retaining these line paths and guaranteed marked coin reveals. Its [mathematical model](MATH-MODEL.md) and [current validation](VALIDATION.md) record the expected-return proof, complete outcome replay and engine/browser evidence. Earlier versions' mathematical reports remain historical evidence. The prototype targets **96.5% expected return**; individual sessions can return less. No private Hacksaw probabilities or casino certification are claimed.
