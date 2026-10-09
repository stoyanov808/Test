# Coin collection and tumble reference

Prepared on 8 October 2026 for the second **ОТ СТАРОТО** prototype. The requested reference is Hacksaw Gaming's **Le Bandit**; the interface reference is the earlier Studentski Grad prototype and the user's Nolimit City direction. These are separate references.

## Source access and confidence

The intended primary source is the [official Hacksaw Gaming game page](https://hacksawgaming.com/games/le-bandit). Its HTTPS request, the publisher home page, the publisher's parent-group site and a YouTube search for official gameplay were all rejected by the environment's network proxy with `CONNECT tunnel failed: 403 Forbidden`. The game page could not be retrieved even after an approved network escalation. Independent review pages and search engines were also unavailable. [The access log](research/le-bandit-access.json) records the attempted URLs and results.

Consequently, no Le Bandit game sheet, in-game rules, paytable or gameplay frames were inspected in this revision. No exact Le Bandit probabilities, RTP, Wild rule, multiplier order or animation timings are claimed here. A source link alone does not establish its contents. The sequence below is the user's explicit requested behavior, rather than a purported transcription of inaccessible publisher rules.

## Requested collection sequence

1. After genuine winning symbols have paid and tumbled, reveal every eligible coin position. A revealed collector stays inactive until this reveal phase has finished.
2. Show the local and global multiplier effects against their recorded coin targets. Freeze the resulting monetary values before collection.
3. A newly revealed collector draws in the revealed monetary coins and any older collector. The incoming amounts transfer into the new collector; collection is not an additional award on top of those same coins.
4. Remove the collected noncollector coins and the consumed older collector. Retain the newest collector at its actual grid position.
5. Reveal the vacant eligible positions again. Repeat the complete reveal, modifier and collection sequence if another collector is revealed. The later collector absorbs the earlier collector's stored value.
6. When a reveal ends without a new collector, pay the surviving monetary coins and collector values once. All awards remain within the whole-round 19,999× cap.

The engine must record each reveal round, modifier target, collected value and survivor. Animation must replay that receipt without rolling extra targets. This makes the order visible and makes skip, reload and the balance ledger agree.

Only the **right character** initiates coin reveals. The **left character throws Wilds only**. The middle character remains the Wild shooter. These roles follow the user's earlier clarification.

## What was wrong in the published prototype

The first prototype's [published engine](https://github.com/stoyanov808/Test/blob/25d6bdae4c69c70e58056ffdb8a5feda42931aa0/variants/ot-staroto/src/engine.ts) revealed one list of coins, assigned a collector the sum of the value coins, and credited both the original values and that sum. It had no collection/re-reveal rounds. Thus collection effectively duplicated an award instead of moving value into a persistent collector.

Its frozen [180,000-round sample](research/prototype-v1-mathematics.json), recorded before this revision, also explains the user's tumble and payout complaints:

| Previous mode | Receipt stages per spin | Longest recorded chain |
| --- | ---: | ---: |
| Base game | 4.26 | 129 |
| Left character bonus | 5.87 | 222 |
| All three characters | 6.21 | 231 |

A receipt stage includes the final nonwinning board; the mean number of actual tumbles is about one smaller. The old 8-symbol payments were only **0.03× to 0.20×**. Its requirement for **seven natural matching symbols**, even when Wilds could reach the paid count, restricted Wild substitution. Those are prototype implementation choices, not verified Le Bandit rules.

## Adaptation and validation

Use shorter natural tumble chains with meaningful symbol payments. Change symbol distribution and paytable together rather than truncating an otherwise winning chain. Count matching symbols plus eligible Wilds directly; an all-Wild board needs an explicit, documented rule so it cannot fabricate six unrelated full-board awards. A Wild should have a visible effect on the winning count and on the shooter's global multiplier.

The previous board used six uniformly distributed ordinary symbols. On 30 independent ordinary cells, the exact chance that any type occurs eight or more times is **60.14%** with six types, **36.37%** with seven and **21.44%** with eight. These are occupancy calculations for an illustrative uniform board, not measured Le Bandit hit frequencies. A more varied symbol set can support better individual payments and fewer chained wins. Actual mixed-board probabilities require the full prototype simulator.

Mark only positions removed by real winning combinations. Do not fill the board with arbitrary gold marks to manufacture a reveal. Track distinct marked cells, mark coverage at each reveal, tumble-count percentiles, collector-chain length, ordinary-symbol return, coin return, Wild-assisted wins and return against the actual debit for every paid mode. Each reveal can be rewarding without guaranteeing a nearly full coin board.

Keep the game board and small balance/bet/spin controls in a single visual composition, with the illustrated courtyard filling the stage. Give each dropping symbol its own launch offset and settling motion; reserve stronger camera movement for a shot or collection. Make coin reveals readable before the collector pulls anything inward. Exact motion durations will be measured against this prototype's browser recordings, since reference footage could not be inspected.

For the requested God Spin, use a **MAX symbol in a real board cell** and recorded shots at individual symbols. Only a shot whose recorded target is that MAX cell may trigger the cap. The artwork and effects should show that event instead of putting a MAX label over the board. This is the user's own requested God mechanic, not an attributed Le Bandit feature.

The rebuilt prototype must publish fresh mathematical and browser evidence. The first sample is a historical baseline and must not be presented as validation of changed collector or tumble rules. Neither an attractive animation nor a short sample establishes certified RTP.

## Version 3 mathematics

The 9 October 2026 revision replaces the previous open-ended outcome distribution with a fixed weighted catalogue of completely evaluated rounds. Its own [RTP calculation](MATH-MODEL.md) proves 96.5% expected return for every paid mode and supported stake. The new 3× booster changes the full bonus-entry probability from 1/200 to 1/40 while sharing the base game's conditional outcome distributions. [The previous version 2 sample](research/prototype-v2-mathematics.json) is preserved as a historical comparison.

This is the prototype's original mathematical model. It does not establish any inaccessible Le Bandit or Nolimit City probability, rule or certification. The publisher-access limits described above still apply.
