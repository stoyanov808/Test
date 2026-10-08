import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, acknowledgeRound, createSession, playRound, TIER_CHARACTERS } from '../src/engine';
import type { Choice } from '../src/types';

const variantRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (relative: string): string => createHash('sha256').update(readFileSync(resolve(variantRoot, relative))).digest('hex');
const sourceHashes = Object.fromEntries(['src/engine.ts', 'src/types.ts', 'scripts/simulate.ts'].map(file => [file, sha(file)]));
const ordinaryRounds = Number(process.env.OT_BASE_ROUNDS || 100000);
const modeRounds = Number(process.env.OT_MODE_ROUNDS || 10000);
if (![ordinaryRounds, modeRounds].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Counts must be positive integers');
const choices: Choice[] = [{ kind: 'spin' }, { kind: 'xbet', character: 'left' }, { kind: 'xbet', character: 'right' }, { kind: 'xbet', character: 'middle' }, { kind: 'buy', tier: 'ruse' }, { kind: 'buy', tier: 'lux' }, { kind: 'buy', tier: 'edge' }, { kind: 'buy', tier: 'old' }, { kind: 'god' }];
const rows = [];
for (const [modeIndex, choice] of choices.entries()) {
  const n = choice.kind === 'spin' ? ordinaryRounds : modeRounds;
  const seed = (0x1bf732 + modeIndex * 0x7c1b29) >>> 0;
  let session = createSession(seed, 8_000_000_000_000);
  let cost = 0, payout = 0, squares = 0, winningRounds = 0, capped = 0, bonusEntries = 0, spins = 0, cascades = 0, features = 0, regularPayout = 0, coinPayout = 0, godWins = 0, longestCascade = 0, longestBonus = 0, peakBetMultiple = 0;
  for (let i = 0; i < n; i++) {
    const balanceBefore = session.balanceCents;
    session = playRound(session, choice);
    const round = session.pending!;
    if (session.balanceCents !== balanceBefore - round.costCents + round.payoutCents || !Number.isSafeInteger(session.balanceCents)) throw new Error(`Accounting failure ${modeIndex}/${i}`);
    if (round.payoutCents > round.capCents || round.capCents !== round.betCents * CONFIG.maxWin || round.maxWin !== (round.payoutCents === round.capCents)) throw new Error(`Cap failure ${modeIndex}/${i}`);
    let receiptTotal = 0;
    for (const spin of round.spins) {
      spins++; cascades += spin.cascades.length;
      longestCascade = Math.max(longestCascade, spin.cascades.length);
      if (spin.initialGrid.some(column => column.filter(s => s === 'scatter').length > 1)) throw new Error('More than one scatter per reel');
      let spinTotal = 0;
      for (const cascade of spin.cascades) {
        const natural = cascade.wins.reduce((sum, w) => sum + w.payoutCents, 0);
        const coins = cascade.features.reduce((sum, f) => sum + f.payoutCents, 0);
        if (cascade.payoutCents !== natural + coins) throw new Error('Cascade ledger failure');
        for (const feature of cascade.features) {
          features++;
          if (spin.tier && !TIER_CHARACTERS[spin.tier].includes(feature.character)) throw new Error('Ineligible bonus character');
          if (feature.character !== 'right' && feature.coins.length) throw new Error('Coin role failure');
          if (feature.payoutCents !== feature.coins.reduce((sum, c) => sum + c.payoutCents, 0)) throw new Error('Coin ledger failure');
        }
        if (cascade.refilledGrid?.flat().filter(s => s === 'scatter').length !== undefined && cascade.refilledGrid.flat().filter(s => s === 'scatter').length !== cascade.resolvedGrid.flat().filter(s => s === 'scatter').length) throw new Error('New cascade scatter');
        regularPayout += natural; coinPayout += coins; spinTotal += cascade.payoutCents;
      }
      if (spinTotal !== spin.payoutCents) throw new Error('Spin ledger failure');
      receiptTotal += spinTotal;
      if (spin.roundTotalCents !== receiptTotal || receiptTotal > round.capCents) throw new Error('Round running-total failure');
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
  const row = { choice, seed, rounds: n, costCents: cost, payoutCents: payout, observedReturn: returnRatio, standardError, normalApproximation95: [Math.max(0, returnRatio - 1.96 * standardError), returnRatio + 1.96 * standardError], regularReturn: regularPayout / cost, coinReturn: coinPayout / cost, winningRounds, maxWinRounds: capped, godWins, bonusEntries, totalSpins: spins, totalCascades: cascades, totalFeatures: features, longestCascade, longestBonus, peakBetMultiple, accountingFailures: 0, capFailures: 0, safetyFailures: 0, entitlementFailures: 0 };
  rows.push(row); console.log(JSON.stringify(row));
}
for (const [file, hash] of Object.entries(sourceHashes)) if (sha(file) !== hash) throw new Error(`Source changed during sample: ${file}`);
const report = {
  sourceVersion: 1, generatedAt: new Date().toISOString(), config: CONFIG,
  sourceHashes,
  notes: ['Independent prototype mathematics, not a licensed game clone or certified RTP.', 'Seven natural regular symbols plus Wilds must reach 8/10/12 physical-cell brackets.', 'Badges and at most one scatter per reel enter only on each spin initial drop; refill draws regulars.', 'Normal confidence intervals approximate sampling error; rare tails can remain unsampled.', 'Each mode uses a fixed seed and full settled rounds; odds never depend on credit balance.', 'God theoretical six-shot cap contribution excludes ordinary miss-round payouts.'],
  godTheoreticalHitProbability: 1 - (1 - CONFIG.godShotChance) ** CONFIG.godShots,
  godTheoreticalCapReturn: (1 - (1 - CONFIG.godShotChance) ** CONFIG.godShots) * CONFIG.maxWin / CONFIG.godCost,
  rows,
};
mkdirSync(resolve(variantRoot, 'docs'), { recursive: true });
writeFileSync(resolve(variantRoot, 'docs/mathematics-sample.json'), JSON.stringify(report, null, 2) + '\n');
