/** Offline only: evaluate every integer-cent full round, then calibrate rational tickets. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, Rng, simulateRound, costCents, PAYLINES, PAYLINE_REFERENCE_READY } from '../src/engine';
import type { Choice } from '../src/types';
import type { MathModel, MathPool } from '../src/math-model';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (path: string) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
if (!PAYLINE_REFERENCE_READY || !PAYLINES.length) throw new Error('Exact user-provided payline chart is required before building the v4 catalogue');
const sources = ['src/paylines.ts', 'src/engine.ts', 'src/types.ts', 'src/math-model.ts', 'scripts/build-math-model.ts'];
const sourceHashes = Object.fromEntries(sources.map(path => [path, sha(path)]));
const seedRng = new Rng(0x798ea173);
const pools: Record<string, MathPool> = {};
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a;
function calibrated(payouts: number[], numerator: bigint, denominator: bigint) {
  const total = payouts.reduce((sum, n) => sum + BigInt(n), 0n), count = BigInt(payouts.length);
  const deficit = numerator * count - denominator * total;
  let indices: number[] = [], baseline = 1n, extra = 0n;
  if (deficit !== 0n) {
    // Additional weight goes to a whole ensemble; every original outcome stays possible.
    const sorted = payouts.map((payout, index) => ({ payout, index })).sort((a, b) => a.payout - b.payout);
    const candidates = deficit > 0n ? sorted.filter(x => BigInt(x.payout) * denominator > numerator).reverse()
      : sorted.filter(x => BigInt(x.payout) * denominator < numerator);
    if (!candidates.length) throw new Error('Catalogue cannot bracket target expectation');
    const group = candidates;
    indices = group.map(x => x.index).sort((a, b) => a - b);
    const groupSum = group.reduce((sum, x) => sum + BigInt(x.payout), 0n), groupSize = BigInt(group.length);
    baseline = deficit > 0n ? denominator * groupSum - numerator * groupSize : numerator * groupSize - denominator * groupSum;
    extra = deficit > 0n ? deficit : -deficit;
    const divisor = gcd(baseline, extra); baseline /= divisor; extra /= divisor;
  }
  const groupSet = new Set(indices);
  let tickets = 0n, weightedPayout = 0n;
  for (let i = 0; i < payouts.length; i++) {
    const weight = baseline + (groupSet.has(i) ? extra : 0n);
    if (weight <= 0n) throw new Error('Nonpositive ticket weight');
    tickets += weight; weightedPayout += weight * BigInt(payouts[i]);
  }
  if (weightedPayout * denominator !== tickets * numerator) throw new Error('Exact expectation proof failed');
  return { baseline: String(baseline), extra: String(extra), indices, total: String(tickets), weightedPayout: String(weightedPayout), targetNumerator: String(numerator), targetDenominator: String(denominator) };
}
function build(name: string, choice: Choice, count: number, bonus: boolean | null, entryScatters?: number[], fixedSeeds: number[] = []) {
  if (choice.kind === 'boost') throw new Error('Boost shares base conditional pools');
  const seeds: number[] = [], payouts: number[][] = [], expansionCounts: number[] = [], shotCounts: number[] = [], lockedReelCounts: number[] = [], triggerTiers: MathPool['triggerTiers'] = [], unique = new Set<number>();
  while (seeds.length < count) {
    const candidate = fixedSeeds.length ? fixedSeeds.shift()! : (seedRng.next(), seedRng.state);
    if (!candidate || unique.has(candidate)) continue;
    const index = seeds.length, scatterCount = entryScatters?.[index];
    const reference = simulateRound(candidate, CONFIG.defaultBetCents, choice, scatterCount);
    if (bonus !== null && (reference.triggerTier !== null) !== bonus) continue;
    const stakePayouts = CONFIG.betsCents.map(bet => {
      const outcome = simulateRound(candidate, bet, choice, scatterCount);
      if (bonus !== null && (outcome.triggerTier !== null) !== bonus) throw new Error('Stake changed entry branch');
      const ledger = outcome.spins.reduce((sum, spin) => sum + spin.cascades.reduce((n, c) => n + c.features.reduce((n, f) => n + f.payoutCents, 0) + c.wins.reduce((n, w) => n + w.payoutCents, 0), 0), 0);
      if (outcome.godHits.some(Boolean) ? outcome.payoutCents !== outcome.capCents : ledger !== outcome.payoutCents) throw new Error('Outcome ledger mismatch');
      return outcome.payoutCents;
    });
    shotCounts.push(reference.spins.reduce((n, s) => n + s.cascades.flatMap(c => c.features).reduce((n, f) => n + (f.shotEvents?.length ?? 0), 0), 0));
    lockedReelCounts.push(new Set(reference.spins.flatMap(s => s.cascades.flatMap(c => c.features.flatMap(f => (f.shotEvents ?? []).filter(e => e.sticky).map(e => e.expandedReel!))))).size);
    expansionCounts.push(Math.max(0, ...reference.spins.map(spin => new Set(spin.cascades.flatMap(c => c.features).filter(f => f.character === 'middle' && f.phase === 'expand').map(f => f.expandedReel)).size)));
    unique.add(candidate); seeds.push(candidate); payouts.push(stakePayouts); triggerTiers.push(reference.triggerTier);
    if (seeds.length % 128 === 0) console.log(`${name}: ${seeds.length}/${count}`);
  }
  const weights = CONFIG.betsCents.map((bet, stake) => {
    // A=.965/2; B=201*.965/2 makes base and 3x-cost/5x-chance boost both return .965.
    const numerator = name === 'ordinary' ? BigInt(bet) * 193n : name === 'natural-bonus' ? BigInt(bet) * 193n * 201n : BigInt(costCents(bet, choice)) * 193n;
    const denominator = name === 'ordinary' || name === 'natural-bonus' ? 400n : 200n;
    return calibrated(payouts.map(p => p[stake]), numerator, denominator);
  });
  pools[name] = { choice, bonus, seeds, triggerTiers, expansionCounts, shotCounts, lockedReelCounts, ...(entryScatters ? { entryScatters } : {}), payouts, weights };
  for (const spec of weights) {
    const maxWeight = BigInt(spec.baseline) + BigInt(spec.extra);
    if (maxWeight * 100n > BigInt(spec.total)) throw new Error(`${name} needs more diversity: max entry exceeds 1%`);
  }
  console.log(`${name}: exact target validated at ${CONFIG.betsCents.length} stakes`);
}
build('ordinary', { kind: 'spin' }, 8192, false, undefined, [437711782, 301987]);
// More independently seeded natural entries preserve rare stronger invitations
// without concentrating the expected return in a handful of complete bonuses.
build('natural-bonus', { kind: 'spin' }, 8192, true, [...Array(7900).fill(3), ...Array(240).fill(4), ...Array(40).fill(5), ...Array(12).fill(6)]);
build('xbet-left', { kind: 'xbet', character: 'left' }, 4096, null);
build('xbet-right', { kind: 'xbet', character: 'right' }, 4096, null, undefined, [163]);
build('xbet-middle', { kind: 'xbet', character: 'middle' }, 4096, null);
build('buy-ruse', { kind: 'buy', tier: 'ruse' }, 8192, true);
build('buy-lux', { kind: 'buy', tier: 'lux' }, 4096, true);
build('buy-edge', { kind: 'buy', tier: 'edge' }, 4096, true);
build('buy-old', { kind: 'buy', tier: 'old' }, 4096, true, undefined, [5737753, 301987]);
build('god', { kind: 'god' }, 4096, false, undefined, [105151]);
for (const [path, hash] of Object.entries(sourceHashes)) if (sha(path) !== hash) throw new Error(`Source changed during catalogue build: ${path}`);
const model: MathModel = { version: 4, targetRtp: { numerator: 193, denominator: 200 }, betsCents: [...CONFIG.betsCents], sourceHashes, pools };
writeFileSync(resolve(root, 'src/math-model.json'), JSON.stringify(model) + '\n');
const rows = CONFIG.betsCents.flatMap((bet, stake) => Object.entries(pools).filter(([name]) => !['ordinary', 'natural-bonus'].includes(name)).map(([name, pool]) => ({ mode: name, betCents: bet, costCents: costCents(bet, pool.choice), outcomeCount: pool.seeds.length, tickets: pool.weights[stake].total, weightedPayoutCents: pool.weights[stake].weightedPayout, expectedReturnNumerator: 193, expectedReturnDenominator: 200, expectationEquality: true })));
for (const bet of CONFIG.betsCents) for (const mode of ['spin', 'boost'] as const) rows.push({ mode, betCents: bet, costCents: costCents(bet, { kind: mode }), outcomeCount: pools.ordinary.seeds.length + pools['natural-bonus'].seeds.length, tickets: `conditional branches 1/${mode === 'spin' ? 200 : 40}`, weightedPayoutCents: 'conditional exact rational expectation', expectedReturnNumerator: 193, expectedReturnDenominator: 200, expectationEquality: true });
const poolMetrics = Object.fromEntries(Object.entries(pools).map(([name, pool]) => [name, CONFIG.betsCents.map((bet, stake) => {
  const spec = pool.weights[stake], extra = new Set(spec.indices), total = BigInt(spec.total);
  let max = 0n, squares = 0n, paid = 0n, capped = 0n, multiExpansions = 0n, shooting = 0n, locked = 0n;
  const tiers: Record<string, bigint> = {};
  for (let i = 0; i < pool.seeds.length; i++) {
    const weight = BigInt(spec.baseline) + (extra.has(i) ? BigInt(spec.extra) : 0n);
    max = weight > max ? weight : max; squares += weight * weight;
    if (pool.shotCounts[i] > 0) shooting += weight;
    if (pool.lockedReelCounts[i] > 0) locked += weight;
    if (pool.expansionCounts[i] >= 2) multiExpansions += weight;
    if (pool.payouts[i][stake] > 0) paid += weight;
    if (pool.payouts[i][stake] === bet * CONFIG.maxWin) capped += weight;
    const tier = pool.triggerTiers[i] ?? 'none'; tiers[tier] = (tiers[tier] ?? 0n) + weight;
  }
  return { betCents: bet, entries: pool.seeds.length, calibrationEntries: spec.indices.length,
    largestEntryProbability: { numerator: String(max), denominator: String(total), approximate: Number(max) / Number(total) },
    multiReelExpansionEntries: pool.expansionCounts.filter(n => n >= 2).length,
    multiReelExpansionProbability: { numerator: String(multiExpansions), denominator: String(total) },
    followupShotProbability: { numerator: String(shooting), denominator: String(total) },
    bonusReelLockProbability: { numerator: String(locked), denominator: String(total) },
    effectiveOutcomeCount: Number(total * total) / Number(squares),
    hitProbability: { numerator: String(paid), denominator: String(total) },
    capProbability: { numerator: String(capped), denominator: String(total) },
    triggerTierProbabilities: Object.fromEntries(Object.entries(tiers).map(([tier, weight]) => [tier, { numerator: String(weight), denominator: String(total) }])) };
})]));
const proof = {
  paylineCount: PAYLINES.length, paylineRows: PAYLINES,
  modelVersion: 4, generatedAt: new Date().toISOString(), modelSha256: sha('src/math-model.json'), sourceHashes,
  targetRtp: { numerator: 193, denominator: 200, percentage: 96.5 },
  triggerProbabilities: { base: { numerator: 1, denominator: 200 }, boost: { numerator: 1, denominator: 40 }, ratio: 5, boostCostMultiplier: 3 },
  conditionalExpectation: { ordinaryBetMultiple: { numerator: 193, denominator: 400 }, naturalBonusBetMultiple: { numerator: 38793, denominator: 400 } },
  baseProof: '199/200 *193/400 +1/200 *38793/400 =193/200',
  boostProof: '(39/40 *193/400 +1/40 *38793/400)/3 =193/200',
  seedCount: Object.values(pools).reduce((sum, p) => sum + p.seeds.length, 0), completeStakeOutcomes: Object.values(pools).reduce((sum, p) => sum + p.seeds.length * CONFIG.betsCents.length, 0),
  assumptions: ['Theoretical expectation uses independent uniform uint32 ticket words. Production uses Web Crypto with integer rejection sampling and records every consumed word for strict receipt replay; deterministic xorshift selection is confined to QA fixtures.', 'Finite weighted full-round outcome catalogue; each entry replays real procedural mechanics. All outcomes retain positive tickets. Every supported stake is completely evaluated in integer cents.', '96.5% describes mathematical long-run expected paid return. A finite session or sample can be below 96%, and losses are possible.', 'No wallet balance, spin history, or loss compensation affects ticket weights, outcomes, or payout.', 'Source hashes identify the procedural engine used to build every outcome; runtime regenerates and verifies the selected payout before charging.', 'The catalogue has finite outcome variety and is a transparent virtual-credit prototype, not a certified real-money casino system.'],
  poolMetrics, rows,
};
writeFileSync(resolve(root, 'docs/mathematics-proof.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(`Model written: ${proof.seedCount} pool entries; ${proof.completeStakeOutcomes} complete stake outcomes; 80 exact RTP rows.`);
