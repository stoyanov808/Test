/** Independent complete replay of the frozen full-round payout catalogue. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATH_MODEL } from '../src/math-model';
import { CONFIG, PAYLINES, simulateRound } from '../src/engine';
import { verifyMathModel } from './verify-math-model';
import type { Cell } from '../src/types';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (relative: string) => createHash('sha256').update(readFileSync(resolve(root, relative))).digest('hex');
const sources = [...Object.keys(MATH_MODEL.sourceHashes), 'src/math-model.json', 'scripts/verify-math-model.ts', 'scripts/verify-math-outcomes.ts'];
const sourceHashes = Object.fromEntries(sources.map(file => [file, sha(file)]));
const cellKey = (c: Cell) => `${c.reel}:${c.row}`;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const output: string[] = [];
const log = (message: string) => { output.push(message); console.log(message); };
verifyMathModel();
let outcomes = 0, lines = 0, expansions = 0, guaranteedCoinWaves = 0, multiExpandingSpins = 0, followupShots = 0, lockedReelHits = 0, immediateBonusLocks = 0, retainedBonusReels = 0;
for (const [name, pool] of Object.entries(MATH_MODEL.pools)) {
  for (let i = 0; i < pool.seeds.length; i++) for (const [stake, bet] of CONFIG.betsCents.entries()) {
    const round = simulateRound(pool.seeds[i], bet, pool.choice, pool.entryScatters?.[i]);
    if (round.payoutCents !== pool.payouts[i][stake] || round.triggerTier !== pool.triggerTiers[i] || round.maxWin !== (round.payoutCents === bet * CONFIG.maxWin)) throw new Error(`Frozen outcome mismatch: ${name}/${i}/${bet}`);
    let total = 0, mostReels = 0, shotCount = 0;
    const lockedReels = new Set<number>();
    let previousSpin: typeof round.spins[number] | undefined;
    for (const spin of round.spins) {
      for (const reel of spin.initialExpandedReels) {
        retainedBonusReels++;
        if (!spin.initialGrid[reel].every(s => s === 'wild') || !spin.initialWildMultipliers[reel].every(n => n > 0) || spin.cascades[0].inactiveWilds.length) throw new Error('Locked expanded reel did not stay planted and rearm');
      }
      if (previousSpin) {
        const expected = previousSpin.tier ? previousSpin.finalExpandedReels.filter(reel => previousSpin!.cascades.at(-1)!.stickyWilds[reel].every(n => n > 0)) : [];
        if (!equal(expected, spin.initialExpandedReels)) throw new Error('Transient expanded reel carried or locked reel disappeared');
        for (const reel of expected) if (!equal(previousSpin.cascades.at(-1)!.stickyWilds[reel], spin.initialWildMultipliers[reel])) throw new Error('Bonus reel lock lost its multiplier');
        if (previousSpin.tier === null && spin.tier && (spin.initialExpandedReels.length || spin.initialWildMultipliers.flat().some(n => n > 0))) throw new Error('Base expansion carried into fresh bonus');
      }
      for (const reel of spin.finalExpandedReels) if (!spin.finalGrid[reel].every(s => s === 'wild')) throw new Error('Transient reel marker survived partial removal');
      for (const column of spin.initialGrid) {
        if (column.filter(s => s === 'middle').length > 1 || column.includes('middle') && column.some(s => s === 'scatter' || s === 'left' || s === 'right')) throw new Error('Expanding shooter initial-drop collision');
      }
      const reels = new Set(spin.cascades.flatMap(c => c.features).filter(f => f.character === 'middle' && f.phase === 'expand').map(f => f.expandedReel));
      mostReels = Math.max(mostReels, reels.size); multiExpandingSpins += Number(reels.size >= 2);
      let spinTotal = 0;
      for (const cascade of spin.cascades) {
        const payout = cascade.wins.reduce((n, w) => n + w.payoutCents, 0) + cascade.features.reduce((n, f) => n + f.payoutCents, 0);
        if (payout !== cascade.payoutCents) throw new Error('Cascade accounting failure');
        const inactive = new Set(cascade.inactiveWilds.map(cellKey));
        const expectedGlobal = Math.max(1, cascade.resolvedGrid.reduce((sum, column, reel) => sum + column.reduce((n, symbol, row) => n + (symbol === 'wild' && !inactive.has(`${reel}:${row}`) ? cascade.resolvedWildMultipliers[reel][row] || 1 : 0), 0), 0));
        let budget = round.capCents - total - spinTotal - cascade.features.reduce((n, f) => n + f.payoutCents, 0);
        const uniqueLines = new Set<number>(), removed = new Set<string>();
        for (const win of cascade.wins) {
          lines++;
          const path = PAYLINES[win.line - 1];
          if (!path || uniqueLines.has(win.line) || win.count < 3 || win.count > 6 || !equal(win.cells, path.slice(0, win.count).map((row, reel) => ({ reel, row })))) throw new Error('Invalid payline prefix or duplicate line award');
          uniqueLines.add(win.line);
          let actual = 0;
          for (const cell of win.cells) {
            const symbol = cascade.resolvedGrid[cell.reel][cell.row];
            if (symbol === win.symbol) actual++;
            else if (symbol !== 'wild' || inactive.has(cellKey(cell))) throw new Error('Disconnected payline symbol or inactive substitution');
            if (!cascade.stickyWilds[cell.reel][cell.row]) removed.add(cellKey(cell));
          }
          if (win.symbol === 'wild' ? win.count !== 6 || actual !== 6 : actual < 1) throw new Error('Invented all-Wild natural award');
          if (win.count < 6) {
            const next = { reel: win.count, row: path[win.count] }, symbol = cascade.resolvedGrid[next.reel][next.row];
            if (symbol === win.symbol || symbol === 'wild' && !inactive.has(cellKey(next))) throw new Error('Payline did not award longest matching run');
          }
          const base = win.symbol === 'wild' ? CONFIG.wildLinePay : CONFIG.paytable[win.symbol][win.count as 3 | 4 | 5 | 6];
          const paid = Math.min(budget, Math.round(bet * Math.round(base * 100) * expectedGlobal / 100));
          if (win.baseMultiplier !== base || win.globalMultiplier !== expectedGlobal || win.payoutCents !== paid) throw new Error('Payline bracket, multiplier or cent budget mismatch');
          budget -= paid;
        }
        if (!equal([...removed].sort(), cascade.removed.map(cellKey).sort())) throw new Error('Overlapping payline cells not removed exactly once');
        if (cascade.expandedReels.some(reel => !cascade.resolvedGrid[reel].every(s => s === 'wild'))) throw new Error('Resolved expanded marker is not a full Wild reel');
        let seenShooting = false;
        let priorGrid = cascade.grid.map(column => [...column]), priorMultipliers = cascade.wildMultipliers.map(column => [...column]);
        for (const feature of cascade.features) {
          if (feature.payoutCents !== feature.coins.reduce((n, coin) => n + coin.payoutCents, 0)) throw new Error('Coin accounting failure');
          if (feature.character === 'middle' && feature.phase === 'expand') {
            expansions++;
            if (seenShooting) throw new Error('A shooter began follow-up shots before all initial expansions');
            const reel = feature.expandedReel;
            if (reel !== feature.source.reel || !CONFIG.expandingMultipliers.includes(feature.expansionMultiplier as any) || !equal(feature.targets, Array.from({ length: 5 }, (_, row) => ({ reel, row }))) || feature.gridAfter[reel!].some(s => s !== 'wild')) throw new Error('Shooter did not expand its entire own reel');
            if (feature.hits.length !== 5 || feature.hits.some((hit, row) => hit.cell.reel !== reel || hit.cell.row !== row || hit.multiplier !== feature.wildMultipliersAfter[reel!][row])) throw new Error('Unrecorded expanding Wild multiplier');
            if (spin.tier !== null) {
              immediateBonusLocks++; lockedReels.add(reel!);
              if (!cascade.stickyWilds[reel!].every((n, row) => n > 0 && n === cascade.resolvedWildMultipliers[reel!][row])) throw new Error('Bonus expansion did not immediately plant all five final Wild multipliers');
            } else if (cascade.stickyWilds[reel!].some(n => n > 0)) throw new Error('Base expansion became bonus-sticky');
          }
          if (feature.phase === 'shots') {
            seenShooting = true;
            if (!feature.shotEvents?.length || feature.shotEvents.length > 3 || feature.character !== 'middle') throw new Error('Invalid follow-up phase');
            if (!equal(feature.targets, feature.shotEvents.map(s => s.target)) || !equal(feature.hits, feature.shotEvents.flatMap(s => s.hits))) throw new Error('Shot presentation diverged from ordered receipt');
            for (const event of feature.shotEvents) {
              followupShots++; shotCount++;
              const before = priorGrid[event.target.reel][event.target.row];
              if (before !== 'wild' && !['bottle', 'cash', 'chain', 'cassette', 'sneaker', 'crown', 'lighter', 'dice', 'ring'].includes(before)) throw new Error('Follow-up shot erased an unresolved special');
              const reel = event.expandedReel;
              if (reel !== undefined && (reel !== event.target.reel || !priorGrid[reel].every(s => s === 'wild'))) throw new Error('Shot claimed a non-expanded reel');
              const expectedCells = reel === undefined ? [event.target] : Array.from({ length: 5 }, (_, row) => ({ reel, row }));
              if (!equal(event.hits.map(h => h.cell), expectedCells) || event.sticky !== (reel !== undefined && spin.tier !== null)) throw new Error('Shot column target or sticky rule mismatch');
              for (const hit of event.hits) {
                const { reel: r, row } = hit.cell, repeated = priorGrid[r][row] === 'wild';
                const expected = repeated ? (priorMultipliers[r][row] || 1) * 2 : 1;
                if (hit.repeated !== repeated || hit.multiplier !== expected) throw new Error('Shot did not record exact1x creation or2x repeat');
                priorGrid[r][row] = 'wild'; priorMultipliers[r][row] = expected;
              }
              if (event.sticky) {
                lockedReelHits++;
                if (!cascade.stickyWilds[reel!].every((n, row) => n > 0 && n === cascade.resolvedWildMultipliers[reel!][row])) throw new Error('Expanded-reel hit failed to lock all five final Wild multipliers');
              }
            }
            if (!equal(priorGrid, feature.gridAfter) || !equal(priorMultipliers, feature.wildMultipliersAfter)) throw new Error('Follow-up phase final grid/matrix mismatch');
          }
          priorGrid = feature.gridAfter.map(column => [...column]); priorMultipliers = feature.wildMultipliersAfter.map(column => [...column]);
          for (const wave of feature.coinWaves) {
            guaranteedCoinWaves++;
            const reveals = [...wave.coins, ...wave.existingCollectors].map(coin => cellKey(coin.cell));
            if (wave.coins.some(coin => coin.kind === 'empty') || new Set(reveals).size !== reveals.length || !equal([...reveals].sort(), feature.targets.map(cellKey).sort())) throw new Error('Marked box failed its guaranteed coin/effect reveal');
            if (wave.repeat && !wave.collections.length) throw new Error('Dormant collector triggered an unearned repeat');
            for (const collection of wave.collections) if (collection.collectedCents !== collection.sources.reduce((n, coin) => n + coin.payoutCents, 0) || collection.valueAfterCents !== collection.valueBeforeCents + collection.collectedCents) throw new Error('Collector chain value mismatch');
          }
        }
        spinTotal += payout;
      }
      total += spinTotal;
      previousSpin = spin;
      if (spinTotal !== spin.payoutCents || spin.roundTotalCents !== total || total > round.capCents) throw new Error('Round accounting failure');
    }
    if (shotCount !== pool.shotCounts[i] || lockedReels.size !== pool.lockedReelCounts[i]) throw new Error('Frozen follow-up or locked-reel metric mismatch');
    if (mostReels !== pool.expansionCounts[i]) throw new Error('Frozen multiple-expanding-reel metric mismatch');
    if (round.godHits.some(Boolean) ? round.payoutCents !== round.capCents : total !== round.payoutCents) throw new Error('Settlement failure');
    if (name === 'ordinary' && round.triggerTier !== null || name === 'natural-bonus' && round.triggerTier === null) throw new Error('Natural entry branch failure');
    outcomes++;
  }
  log(`${name}: ${pool.seeds.length * CONFIG.betsCents.length} full stake outcomes verified`);
}
verifyMathModel();
for (const [file, hash] of Object.entries(sourceHashes)) if (sha(file) !== hash) throw new Error(`Source changed during complete replay: ${file}`);
log(`Full math verification passed: ${outcomes} replayed complete outcomes, zero payout, cap, branch, payline, expansion, follow-up shot, bonus reel-lock, guaranteed-coin or accounting failures.`);
writeFileSync(resolve(root, 'docs/mathematics-outcome-validation.json'), JSON.stringify({
  modelVersion: CONFIG.version, generatedAt: new Date().toISOString(), command: 'npm run math:check:full', exitCode: 0,
  outcomeEntries: Object.values(MATH_MODEL.pools).reduce((n, pool) => n + pool.seeds.length, 0), supportedStakes: CONFIG.betsCents,
  completeOutcomesReplayed: outcomes, checkedPaylineAwards: lines, checkedExpansions: expansions, checkedGuaranteedCoinWaves: guaranteedCoinWaves, checkedMultiExpandingSpins: multiExpandingSpins, checkedFollowupShots: followupShots, checkedBonusReelLockHits: lockedReelHits, checkedImmediateBonusReelLocks: immediateBonusLocks, checkedRetainedBonusReels: retainedBonusReels,
  payoutFailures: 0, capFailures: 0, triggerBranchFailures: 0, accountingFailures: 0, paylineFailures: 0, expansionFailures: 0, followupShotFailures: 0, bonusReelLockFailures: 0, guaranteedCoinFailures: 0,
  sourceHashes, checks: ['Every complete outcome independently replayed at every supported stake', 'Exact longest payline prefix, natural/all-Wild rule, bracket, summed active multiplier and remaining-cent budget', 'Overlapping winning cells removed once', 'Shooter initial-drop separation, all-five expansion and positive multiple-reel outcome metric', 'Every bonus expansion immediately plants all five Wilds, including expansions without any follow-up shots; base expansions remain transient', 'All initial expansions complete before optional ordered shots; regular targets become 1x Wilds and repeat hits double their exact multipliers', 'Expanded-reel shots double all five Wilds; all bonus-expanded columns retain exact multipliers and rearm next spin across retriggers and tier upgrades; base columns do not carry into a bonus', 'Every marked coin vacancy guaranteed a reveal; collector chain reconciles', 'Whole-round cap, trigger branch and complete ledgers', 'Pinned sources and all 80 exact expected-return equations before and after replay'], output,
}, null, 2) + '\n');
