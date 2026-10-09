/** Startup/build guard: refuse a stale or arithmetically invalid frozen math model. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MathModel } from '../src/math-model';
import { PAYLINES, PAYLINE_REFERENCE_READY } from '../src/paylines';
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedBets = [10, 20, 50, 100, 200, 500, 1000, 2000];
const costs: Record<string, number> = { 'xbet-left': 8.5, 'xbet-right': 2.7, 'xbet-middle': 25, 'buy-ruse': 95, 'buy-lux': 150, 'buy-edge': 1800, 'buy-old': 2500, god: 3000 };

export function verifyMathModel(root = here): void {
  const bytes = readFileSync(resolve(root, 'src/math-model.json'));
  const model = JSON.parse(bytes.toString('utf8')) as MathModel;
  const proof = JSON.parse(readFileSync(resolve(root, 'docs/mathematics-proof.json'), 'utf8'));
  const fail = (message: string): never => { throw new Error(`Frozen math model: ${message}. Run npm run math:build before starting or building the game.`); };
  if (!PAYLINE_REFERENCE_READY || !PAYLINES.length || PAYLINES.length > 100 || PAYLINES.some(line => line.length !== 6 || line.some(row => !Number.isInteger(row) || row < 0 || row > 4)) || new Set(PAYLINES.map(line => JSON.stringify(line))).size !== PAYLINES.length || proof.paylineCount !== PAYLINES.length || JSON.stringify(proof.paylineRows) !== JSON.stringify(PAYLINES)) fail('exact referenced payline chart is missing, invalid or inconsistent with its proof');
  if (model.version !== 5 || model.targetRtp.numerator !== 193 || model.targetRtp.denominator !== 200 || JSON.stringify(model.betsCents) !== JSON.stringify(expectedBets)) fail('unsupported version, RTP or stake list');
  if (createHash('sha256').update(bytes).digest('hex') !== proof.modelSha256) fail('model SHA does not match its proof');
  for (const [path, hash] of Object.entries(model.sourceHashes)) {
    if (createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') !== hash) fail(`stale source ${path}`);
  }
  const requiredSources = ['src/paylines.ts', 'src/engine.ts', 'src/types.ts', 'src/math-model.ts', 'scripts/build-math-model.ts'];
  if (requiredSources.some(path => !model.sourceHashes[path]) || JSON.stringify(proof.sourceHashes) !== JSON.stringify(model.sourceHashes)) fail('missing or inconsistent source hashes');
  const requiredPools = ['ordinary', 'natural-bonus', ...Object.keys(costs)];
  if (Object.keys(model.pools).length !== requiredPools.length || requiredPools.some(name => !model.pools[name])) fail('incomplete mode pools');
  for (const [name, pool] of Object.entries(model.pools)) {
    const expectedChoice = name === 'ordinary' || name === 'natural-bonus' ? { kind: 'spin' } : name.startsWith('xbet-') ? { kind: 'xbet', character: name.slice(5) } : name.startsWith('buy-') ? { kind: 'buy', tier: name.slice(4) } : { kind: 'god' };
    if (JSON.stringify(pool.choice) !== JSON.stringify(expectedChoice)) fail(`${name} choice does not match its priced mode`);
    if (!pool.seeds.length || pool.seeds.length !== pool.payouts.length || pool.triggerTiers.length !== pool.seeds.length || pool.shotCounts.length !== pool.seeds.length || pool.lockedReelCounts.length !== pool.seeds.length || pool.shotCounts.some(n => !Number.isInteger(n) || n < 0 || n > 6000) || pool.lockedReelCounts.some(n => !Number.isInteger(n) || n < 0 || n > 6) || pool.expansionCounts.length !== pool.seeds.length || pool.expansionCounts.some(n => !Number.isInteger(n) || n < 0 || n > 6) || pool.weights.length !== expectedBets.length || new Set(pool.seeds).size !== pool.seeds.length || pool.seeds.some(seed => !Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)) fail(`${name} invalid seeds or dimensions`);
    if (['ordinary', 'buy-edge', 'buy-old'].includes(name) && !pool.expansionCounts.some(n => n >= 2)) fail(`${name} cannot produce multiple expanding reels`);
    if (['buy-edge', 'buy-old'].includes(name) && !pool.lockedReelCounts.some(n => n > 0)) fail(`${name} has no bonus-sticky expanding reel`);
    if (name === 'natural-bonus' && (pool.entryScatters?.length !== pool.seeds.length || [3, 4, 5, 6].some(scatter => !pool.entryScatters!.includes(scatter)))) fail('natural entry does not support every scatter tier');
    for (const [stake, bet] of expectedBets.entries()) {
      const spec = pool.weights[stake], extra = new Set(spec.indices);
      if (extra.size !== spec.indices.length || [...extra].some(index => !Number.isInteger(index) || index < 0 || index >= pool.seeds.length)) fail(`${name}/${bet} invalid calibration indices`);
      const baseline = BigInt(spec.baseline), increment = BigInt(spec.extra);
      if (baseline <= 0n || increment < 0n) fail(`${name}/${bet} invalid ticket weights`);
      let tickets = 0n, paid = 0n, max = 0n;
      for (let i = 0; i < pool.seeds.length; i++) {
        const payout = pool.payouts[i][stake];
        if (!Number.isSafeInteger(payout) || payout < 0 || payout > bet * 19999 || pool.payouts[i].length !== expectedBets.length) fail(`${name}/${bet} invalid cent payout`);
        const weight = baseline + (extra.has(i) ? increment : 0n);
        tickets += weight; paid += weight * BigInt(payout); max = max > weight ? max : weight;
      }
      const target = name === 'ordinary' ? BigInt(bet) * 193n : name === 'natural-bonus' ? BigInt(bet) * 38793n : BigInt(Math.round(bet * costs[name])) * 193n;
      const denominator = name === 'ordinary' || name === 'natural-bonus' ? 400n : 200n;
      if (tickets !== BigInt(spec.total) || paid !== BigInt(spec.weightedPayout) || paid * denominator !== tickets * target || BigInt(spec.targetNumerator) !== target || BigInt(spec.targetDenominator) !== denominator) fail(`${name}/${bet} does not prove its exact expectation`);
      if (max * 100n > tickets) fail(`${name}/${bet} an individual full outcome exceeds 1% probability`);
    }
  }
  if (proof.rows.length !== 80 || proof.rows.some((row: any) => !row.expectationEquality || row.expectedReturnNumerator !== 193 || row.expectedReturnDenominator !== 200)) fail('incomplete exact RTP proof');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyMathModel(); console.log('Math guard passed: all source hashes, 80 exact 96.5% RTP rows, stake caps and outcome variety.');
}
