import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, acknowledgeRound, createSession, playRound, TIER_CHARACTERS } from '../src/engine';
import { MATH_MODEL } from '../src/math-model';
import type { Choice } from '../src/types';

const variantRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (relative: string): string => createHash('sha256').update(readFileSync(resolve(variantRoot, relative))).digest('hex');
const sourceHashes = Object.fromEntries(['src/paylines.ts', 'src/engine.ts', 'src/types.ts', 'src/math-model.ts', 'src/math-model.json', 'scripts/simulate.ts'].map(file => [file, sha(file)]));
const ordinaryRounds = Number(process.env.OT_BASE_ROUNDS || 100000);
const modeRounds = Number(process.env.OT_MODE_ROUNDS || 10000);
if (![ordinaryRounds, modeRounds].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Counts must be positive integers');
const choices: Choice[] = [{ kind: 'spin' }, { kind: 'boost' }, { kind: 'xbet', character: 'left' }, { kind: 'xbet', character: 'right' }, { kind: 'xbet', character: 'middle' }, { kind: 'buy', tier: 'ruse' }, { kind: 'buy', tier: 'lux' }, { kind: 'buy', tier: 'edge' }, { kind: 'buy', tier: 'old' }, { kind: 'god' }];
const rows = [];
const percentile = (values: number[], fraction: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
for (const [modeIndex, choice] of choices.entries()) {
  if (process.env.OT_MODES && !process.env.OT_MODES.split(',').includes(String(modeIndex))) continue;
  const n = choice.kind === 'spin' || choice.kind === 'boost' ? ordinaryRounds : modeRounds;
  const seed = (0x1bf732 + modeIndex * 0x7c1b29) >>> 0;
  let session = createSession(seed, 8_000_000_000_000);
  let cost = 0, payout = 0, squares = 0, winningRounds = 0, capped = 0, bonusEntries = 0, spins = 0, cascades = 0, features = 0, regularPayout = 0, coinPayout = 0, godWins = 0, longestCascade = 0, longestBonus = 0, peakBetMultiple = 0;
  const extraTumbles: number[] = [], markedOccupancy: number[] = [], monetaryOccupancy: number[] = [], wavesPerReveal: number[] = [];
  let wildAssistedWins = 0, coinCollections = 0, multiExpandingSpins = 0, expandingFeatures = 0, followupFeatures = 0, followupShots = 0, lockedReelHits = 0;
  for (let i = 0; i < n; i++) {
    const balanceBefore = session.balanceCents;
    session = playRound(session, choice);
    const round = session.pending!;
    if (session.balanceCents !== balanceBefore - round.costCents + round.payoutCents || !Number.isSafeInteger(session.balanceCents)) throw new Error(`Accounting failure ${modeIndex}/${i}`);
    if (round.payoutCents > round.capCents || round.capCents !== round.betCents * CONFIG.maxWin || round.maxWin !== (round.payoutCents === round.capCents)) throw new Error(`Cap failure ${modeIndex}/${i}`);
    let receiptTotal = 0;
    for (const spin of round.spins) {
      spins++; cascades += spin.cascades.length;
      const expanding = spin.cascades.flatMap(c => c.features).filter(f => f.character === 'middle' && f.phase === 'expand');
      const shooting = spin.cascades.flatMap(c => c.features).filter(f => f.phase === 'shots');
      followupFeatures += shooting.length; followupShots += shooting.reduce((n, f) => n + f.shotEvents!.length, 0); lockedReelHits += shooting.reduce((n, f) => n + f.shotEvents!.filter(e => e.sticky).length, 0);
      expandingFeatures += expanding.length; multiExpandingSpins += Number(new Set(expanding.map(f => f.expandedReel)).size >= 2);
      extraTumbles.push(spin.cascades.filter(c => c.removed.length > 0).length);
      longestCascade = Math.max(longestCascade, spin.cascades.length);
      if (spin.initialGrid.some(column => column.filter(s => s === 'scatter').length > 1)) throw new Error('More than one scatter per reel');
      let spinTotal = 0;
      for (const cascade of spin.cascades) {
        wildAssistedWins += cascade.wins.filter(w => w.cells.some(c => cascade.resolvedGrid[c.reel][c.row] === 'wild')).length;
        const natural = cascade.wins.reduce((sum, w) => sum + w.payoutCents, 0);
        const coins = cascade.features.reduce((sum, f) => sum + f.payoutCents, 0);
        if (cascade.payoutCents !== natural + coins) throw new Error('Cascade ledger failure');
        for (const feature of cascade.features) {
          features++;
          if (spin.tier && !TIER_CHARACTERS[spin.tier].includes(feature.character)) throw new Error('Ineligible bonus character');
          if (feature.character !== 'right' && feature.coins.length) throw new Error('Coin role failure');
          if (feature.character === 'right' && feature.targets.length) {
            markedOccupancy.push(feature.targets.length); wavesPerReveal.push(feature.coinWaves.length);
            for (const wave of feature.coinWaves) {
              if (wave.coins.some(c => c.kind === 'empty') || new Set([...wave.coins, ...wave.existingCollectors].map(c => `${c.cell.reel}:${c.cell.row}`)).size !== feature.targets.length) throw new Error('Marked coin box not guaranteed a reveal');
              monetaryOccupancy.push(wave.coins.filter(c => c.kind === 'value' || c.kind === 'collector').length + wave.existingCollectors.length);
              coinCollections += wave.collections.length;
              if (wave.repeat && !wave.collections.length) throw new Error('Retained collector repeated without a new collector');
              for (const collection of wave.collections) {
                if (collection.collectedCents !== collection.sources.reduce((sum, c) => sum + c.payoutCents, 0) || collection.valueAfterCents !== collection.valueBeforeCents + collection.collectedCents) throw new Error('Collector accounting failure');
              }
            }
          }
          if (feature.payoutCents !== feature.coins.reduce((sum, c) => sum + c.payoutCents, 0)) throw new Error('Coin ledger failure');
        }
        if (cascade.refilledGrid?.flat().filter(s => s === 'scatter').length !== undefined && cascade.refilledGrid.flat().filter(s => s === 'scatter').length !== cascade.resolvedGrid.flat().filter(s => s === 'scatter').length) throw new Error('New cascade scatter');
        regularPayout += natural; coinPayout += coins; spinTotal += cascade.payoutCents;
      }
      if (spinTotal !== spin.payoutCents) throw new Error('Spin ledger failure');
      receiptTotal += spinTotal;
      if (spin.roundTotalCents !== receiptTotal || receiptTotal > round.capCents) throw new Error('Round running-total failure');
    }
    if (choice.kind === 'god') {
      if (round.godGrid?.flat().filter(s => s === 'max').length !== 1) throw new Error('MAX symbol count failure');
      if (new Set(round.godShots.map(s => `${s.target.reel}:${s.target.row}`)).size !== round.godShots.length) throw new Error('Repeated God target');
      for (const shot of round.godShots) if (shot.hit !== (round.godGrid![shot.target.reel][shot.target.row] === 'max')) throw new Error('False God hit');
      if (!round.godHits.some(Boolean) && JSON.stringify(round.spins[0].initialGrid) !== JSON.stringify(round.godGrid)) throw new Error('God miss changed board');
    }
    if (round.godHits.some(Boolean)) {
      godWins++; if (round.spins.length || round.payoutCents !== round.capCents || !round.godHits.at(-1) || round.godHits.filter(Boolean).length !== 1) throw new Error('God cutoff failure');
    } else if (receiptTotal !== round.payoutCents) throw new Error('Round payout failure');
    if (choice.kind === 'xbet' && !round.spins[0].initialGrid.flat().includes(choice.character)) throw new Error('xBet guarantee failure');
    cost += round.costCents; payout += round.payoutCents;
    const ratio = round.payoutCents / round.costCents;
    squares += ratio * ratio; winningRounds += +(round.payoutCents > 0); capped += +round.maxWin; bonusEntries += +(round.triggerTier !== null);
    longestBonus = Math.max(longestBonus, round.spins.filter(s => s.tier !== null).length);
    peakBetMultiple = Math.max(peakBetMultiple, round.payoutCents / round.betCents);
    session = acknowledgeRound(session);
  }
  const returnRatio = payout / cost;
  const standardError = Math.sqrt(Math.max(0, squares / n - returnRatio * returnRatio) / n);
  const row = { choice, seed, rounds: n, costCents: cost, payoutCents: payout, observedReturn: returnRatio, standardError, normalApproximation95: [Math.max(0, returnRatio - 1.96 * standardError), returnRatio + 1.96 * standardError], regularReturn: regularPayout / cost, coinReturn: coinPayout / cost, winningRounds, maxWinRounds: capped, godWins, bonusEntries, totalSpins: spins, totalCascades: cascades, totalFeatures: features, longestCascade, longestBonus, peakBetMultiple, meanExtraTumbles: extraTumbles.reduce((sum, n) => sum + n, 0) / Math.max(1, spins),
    extraTumblesP50: percentile(extraTumbles, .5), extraTumblesP95: percentile(extraTumbles, .95), extraTumblesP99: percentile(extraTumbles, .99),
    markedCellsAtRevealP50: percentile(markedOccupancy, .5), markedCellsAtRevealP95: percentile(markedOccupancy, .95), markedCellsAtRevealMax: markedOccupancy.reduce((a, b) => Math.max(a, b), 0),
    monetaryCellsPerWaveP50: percentile(monetaryOccupancy, .5), monetaryCellsPerWaveP95: percentile(monetaryOccupancy, .95), monetaryCellsPerWaveMax: monetaryOccupancy.reduce((a, b) => Math.max(a, b), 0),
    wavesPerRevealP50: percentile(wavesPerReveal, .5), wavesPerRevealP95: percentile(wavesPerReveal, .95), longestCoinReveal: wavesPerReveal.reduce((a, b) => Math.max(a, b), 0), coinCollections, wildAssistedWins, multiExpandingSpins, expandingFeatures, followupFeatures, followupShots, lockedReelHits,
    accountingFailures: 0, capFailures: 0, safetyFailures: 0, entitlementFailures: 0 };
  rows.push(row); console.log(JSON.stringify(row));
}
for (const [file, hash] of Object.entries(sourceHashes)) if (sha(file) !== hash) throw new Error(`Source changed during sample: ${file}`);
const report = {
  sourceVersion: 4, generatedAt: new Date().toISOString(), config: CONFIG,
  sourceHashes,
  notes: ['Weighted prototype mathematics with exact 96.5% expected return at every supported stake and mode; not a certified cash game.', 'Nine regular symbols pay the single longest 3/4/5/6 matching run from the first reel on each of the 19 user-referenced fixed paylines, including active Wild substitution and at least one actual regular of that type.', 'Badges and at most one scatter per reel enter only on each spin initial drop; refill draws regulars.', 'All landed Shooters expand before optional ordered shots. Ordinary shot Wilds are consumed with a winning batch; repeat hits double multipliers. Expanded-reel shots double all five Wilds and lock the full reel until the bonus ends.', 'Normal confidence intervals approximate sampling error; rare tails can remain unsampled. Individual finite samples may return less than 96%.', 'Production paid rounds use fresh independent Web Crypto ticket words; initial ledger seeds are reported but do not predetermine draws. Odds never depend on wallet balance or loss history.', 'God selects weighted complete real-board shooting outcomes, stops on an actual MAX hit, and settles misses on the same board. The weighted catalogue supersedes the old raw procedural 4.32/30 probability.', 'Every marked coin vacancy reveals a coin or effect. Coin reveals finish before modifiers and collector activation; collector repeats clear noncollectors; final retained collector and terminal value coins pay exactly once.'],
  exactModel: { expectedReturn: MATH_MODEL.targetRtp.numerator / MATH_MODEL.targetRtp.denominator, proof: 'docs/mathematics-proof.json', modelSha256: sha('src/math-model.json'), baseBonusChance: 1 / 200, boostBonusChance: 1 / 40, boostedCostMultiplier: 3 },

  rows,
};
mkdirSync(resolve(variantRoot, 'docs'), { recursive: true });
writeFileSync(resolve(variantRoot, 'docs/mathematics-sample.json'), JSON.stringify(report, null, 2) + '\n');
