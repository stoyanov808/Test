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

Keep the game board and small balance/bet/spin controls in a single visual composition, with the illustrated scene filling the stage. Give each dropping symbol its own launch offset and settling motion; reserve stronger camera movement for a shot or collection. Make coin reveals readable before the collector pulls anything inward. Motion durations are checked against this prototype's browser recordings, since reference footage could not be inspected.

For the requested God Spin, use a **MAX symbol in a real board cell** and recorded shots at individual symbols. Only a shot whose recorded target is that MAX cell may trigger the cap. The artwork and effects should show that event instead of putting a MAX label over the board. This is the user's own requested God mechanic, not an attributed Le Bandit feature.

The rebuilt prototype must publish fresh mathematical and browser evidence. The first sample is a historical baseline and must not be presented as validation of changed collector or tumble rules. Neither an attractive animation nor a short sample establishes certified RTP.

## Historical version 3 mathematics

Version 3 replaced the previous open-ended outcome distribution with a fixed weighted catalogue of completely evaluated rounds. Its [archived return proof](research/prototype-v3-mathematics-proof.json) calculated 96.5% expected return for every paid mode and supported stake. Its 3× booster changed the full bonus-entry probability from 1/200 to 1/40 while sharing the base game's conditional outcome distributions. [The previous version 2 sample](research/prototype-v2-mathematics.json) is preserved as a historical comparison.

This is the prototype's original mathematical model. It does not establish any inaccessible Le Bandit or Nolimit City probability, rule or certification. The publisher-access limits described above still apply.

## Current version 5 adaptation

Version 5 retains the [19 paths in the supplied Le Zeus chart](LE-ZEUS-REFERENCE.md) instead of count-anywhere wins. Only cells participating in actual paid lines become coin marks. Every marked vacancy reveals a value, modifier or collector in every wave; the full reveal finishes before modifiers and collection. A new collector absorbs monetary values and the previous collector, then stays while the cleared marked cells reveal again. Terminal values pay once.

The middle character expands his own reel and may then shoot eligible symbols. Every bonus expansion immediately retains all five Wilds until the bonus ends. His highlighted character and bottom-row total remain on that reel between free spins. Ordinary hits create single-use Wilds, repeat Wild hits double their multiplier, and hitting an expanded reel doubles all five Wilds. These are the user's requested mechanics, independent of the inaccessible commercial references. The original ink club scene replaces the courtyard.

The rebuilt [mathematical model](MATH-MODEL.md) and [current validation](VALIDATION.md) record exact expected return against the full cost of each mode at eight stakes, complete outcome replay and engine/browser checks. Finite samples and individual sessions can return less. Archived earlier proofs do not validate these changed Shooter rules.
