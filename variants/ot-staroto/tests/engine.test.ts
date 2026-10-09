import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG, TIER_CHARACTERS, TIER_ORDER, REGULARS, Rng, acknowledgeRound, bonusAward, costCents, createSession, deserializeSession, evaluate, playFixtureRound as playRound, playRound as playCryptoRound, simulateRound, uniformTicket, bonusTriggerProbability, resolveFeature, resolveShooterShots, retrigger, wildGlobal, settledLegacyWallet, PAYLINES } from '../src/engine';
import { MATH_MODEL } from '../src/math-model';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Character, Choice, Grid, Matrix, Session, Tier } from '../src/types';

const matrix = (): Matrix => Array.from({ length: 6 }, () => Array(5).fill(0));
const marks = (): boolean[][] => Array.from({ length: 6 }, () => Array(5).fill(false));
const grid = (): Grid => Array.from({ length: 6 }, (_, reel) => Array.from({ length: 5 }, (_, row) => REGULARS[(reel * 5 + row) % REGULARS.length]));
const fixture = (tier: Tier | null = null) => ({ grid: grid(), multipliers: matrix(), sticky: matrix(), marks: marks(), tier, betCents: 20 });

class Scripted extends Rng {
  constructor(private values: number[]) { super(1); }
  override next(): number { return this.values.shift() ?? .1; }
}
const rich = (seed: number): Session => createSession(seed, 100000000);
const round = (seed: number, choice: Choice) => playRound(rich(seed), choice).pending!;

const straight = [[0, 0, 0, 0, 0, 0]];
const lineEvaluate = (board: Grid, m: Matrix = matrix(), bet = 100, budget = 9_000_000_000_000, inactive: { reel: number; row: number }[] = [], lines: readonly (readonly number[])[] = straight) => evaluate(board, m, bet, budget, inactive, lines);
test('payline runs start on the first reel, follow the path, and pay only their longest 3/4/5/6 bracket', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('scatter'));
    for (let reel = 0; reel < count; reel++) board[reel][0] = 'crown';
    const wins = lineEvaluate(board);
    assert.equal(wins.length, count < 3 ? 0 : 1);
    if (count >= 3) { assert.equal(wins[0].line, 1); assert.equal(wins[0].count, count); assert.equal(wins[0].payoutCents, 100 * CONFIG.paytable.crown[count as 3 | 4 | 5 | 6]); }
  }
});
test('payline gaps, off-path matching symbols and a run starting on reel2 never pay', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('crown'));
  board[0][0] = 'scatter'; assert.equal(lineEvaluate(board).length, 0);
  board[0][0] = 'crown'; board[2][0] = 'bottle'; assert.equal(lineEvaluate(board).length, 0);
  assert.equal(lineEvaluate(board, matrix(), 100, undefined, [], [[0, 1, 1, 2, 2, 0]])[0].count, 6);
});
test('payline awards are separate even when winning paths overlap, with an exact whole-round budget', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('scatter'));
  for (let reel = 0; reel < 4; reel++) board[reel][0] = 'bottle';
  board[3][1] = 'bottle';
  const wins = lineEvaluate(board, matrix(), 100, undefined, [], [[0, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0]]);
  assert.equal(wins.length, 2); assert.deepEqual(wins.map(w => w.line), [1, 2]); assert.deepEqual(wins.map(w => w.count), [4, 4]); assert.equal(wins.reduce((n, w) => n + w.payoutCents, 0), 60);
  assert.equal(new Set(wins.flatMap(w => w.cells).map(c => `${c.reel}:${c.row}`)).size, 5);
  assert.equal(lineEvaluate(board, matrix(), 100, 7, [], [[0, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0]]).reduce((n, w) => n + w.payoutCents, 0), 7);
});
test('visible Wild multipliers sum rather than multiply and empty grids have ×1', () => {
  const board = grid(), multipliers = matrix();
  assert.equal(wildGlobal(board, multipliers), 1);
  board[0][0] = board[3][4] = 'wild'; multipliers[0][0] = 2; multipliers[3][4] = 8;
  assert.equal(wildGlobal(board, multipliers), 10);
});
test('payline Wilds substitute through the run but require a real symbol and inactive Wilds break it', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('wild'));
  const m: Matrix = Array.from({ length: 6 }, () => Array(5).fill(1));
  assert.equal(lineEvaluate(board, m)[0].symbol, 'wild'); assert.equal(lineEvaluate(board, m)[0].payoutCents, 100 * CONFIG.wildLinePay * 30);
  board[5][0] = 'crown'; m[5][0] = 0;
  const win = lineEvaluate(board, m)[0]; assert.equal(win.symbol, 'crown'); assert.equal(win.count, 6); assert.equal(win.globalMultiplier, 29);
  assert.equal(win.payoutCents, 100 * CONFIG.paytable.crown[6] * 29);
  assert.equal(lineEvaluate(board, m, 100, undefined, [{ reel: 2, row: 0 }]).length, 0);
});
test('expanding shooter becomes all five Wilds on its own reel and never picks random cells', () => {
  const context = fixture('edge'); context.grid[2][3] = 'middle';
  const result = resolveFeature('middle', { reel: 2, row: 3 }, context, new Scripted([0]));
  assert.equal(result.feature.expandedReel, 2); assert.equal(result.feature.expansionMultiplier, 1);
  assert.deepEqual(result.feature.targets, [0, 1, 2, 3, 4].map(row => ({ reel: 2, row })));
  assert.deepEqual(result.grid[2], Array(5).fill('wild')); assert.deepEqual(result.multipliers[2], Array(5).fill(1));
  assert.equal(result.feature.globalMultiplier, 5); assert.equal(result.sticky.flat().reduce((a, b) => a + b), 0);
  for (const reel of [0, 1, 3, 4, 5]) assert.deepEqual(result.grid[reel], context.grid[reel]);
});
test('two expanding shooters independently expand distinct reels and sum their visible Wild multipliers', () => {
  const context = fixture(); context.grid[1][2] = 'middle'; context.grid[4][0] = 'middle';
  const a = resolveFeature('middle', { reel: 1, row: 2 }, context, new Scripted([0]));
  const b = resolveFeature('middle', { reel: 4, row: 0 }, { ...context, grid: a.grid, multipliers: a.multipliers, sticky: a.sticky, marks: a.marks }, new Scripted([.8]));
  assert.deepEqual(b.grid[1], Array(5).fill('wild')); assert.deepEqual(b.grid[4], Array(5).fill('wild'));
  assert.equal(a.feature.expansionMultiplier, 1); assert.equal(b.feature.expansionMultiplier, 2); assert.equal(b.feature.globalMultiplier, 15);
  assert.equal(b.sticky.flat().reduce((a, b) => a + b), 0);
});
test('left throws one to three distinct Wilds and never reveals coins', () => {
  const context = fixture('ruse'); context.grid[0][0] = 'left';
  const result = resolveFeature('left', { reel: 0, row: 0 }, context, new Scripted([.1, .99, 0, 0, 0]));
  assert.equal(result.feature.targets.length, 3);
  assert.equal(new Set(result.feature.targets.map(c => `${c.reel}:${c.row}`)).size, 3);
  assert.equal(result.feature.coins.length, 0); assert.equal(result.feature.payoutCents, 0);
  assert.equal(result.sticky.flat().reduce((a, b) => a + b), 3);
});
test('base left Wilds are transient and all-feature left Wilds are sticky', () => {
  for (const tier of [null, 'old'] as const) {
    const context = fixture(tier); context.grid[0][0] = 'left';
    const result = resolveFeature('left', { reel: 0, row: 0 }, context, new Scripted([0, 0, 0]));
    assert.equal(result.sticky.flat().reduce((a, b) => a + b), tier === null ? 0 : 1);
  }
});
test('expanding shooter upgrades planted left Wilds in place and new shooter Wilds stay transient', () => {
  const context = fixture('old'); context.grid[0][0] = 'middle'; context.grid[0][1] = 'wild'; context.multipliers[0][1] = context.sticky[0][1] = 3;
  const result = resolveFeature('middle', { reel: 0, row: 0 }, context, new Scripted([.8]));
  assert.equal(result.feature.expansionMultiplier, 2); assert.equal(result.sticky[0][1], 6); assert.equal(result.multipliers[0][1], 6);
  assert.equal(result.sticky[0][2], 0); assert.equal(result.feature.hits[1].repeated, true);
});
test('right consumes only marked boxes; other characters preserve those marks', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right'; context.marks[2][3] = true;
  const result = resolveFeature('right', { reel: 0, row: 0 }, context, new Scripted([0, .1, 0]));
  assert.deepEqual(result.feature.targets, [{ reel: 2, row: 3 }]);
  assert.equal(result.feature.coins[0].kind, 'value'); assert.equal(result.feature.coins[0].value, .2); assert.equal(result.feature.payoutCents, 4);
  assert.equal(result.marks[2][3], false); assert.equal(result.feature.hits.length, 0);
  for (const c of ['left', 'middle'] as Character[]) assert.equal(resolveFeature(c, { reel: 0, row: 0 }, context, new Rng(5)).marks[2][3], true);
});
test('all coins reveal before modifiers and collectors absorb their final monetary amounts once', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right';
  [0, 1, 2, 3].forEach(row => { context.marks[1][row] = true; });
  // reveal 500×, local ×2, global ×2, collector; all three second-wave vacancies reveal .2×.
  const result = resolveFeature('right', { reel: 0, row: 0 }, context,
    new Scripted([.1, .1, .9999, .03, 0, .014, 0, .001, 0, .8, 0, .8, 0, .8, 0]));
  const wave = result.feature.coinWaves[0];
  assert.deepEqual(wave.coins.map(c => c.kind), ['value', 'multiplier', 'global', 'collector']);
  assert.equal(wave.coins[0].payoutCents, 20 * 500); // Raw reveal, before any modifier.
  assert.deepEqual(wave.modifierEvents.map(e => e.factor), [2, 2]);
  assert.equal(wave.collections[0].sources[0].payoutCents, 20 * 500 * 2 * 2);
  assert.equal(wave.collections[0].valueAfterCents, 40000);
  assert.equal(result.feature.payoutCents, 40012); // Never pay both source and collector.
  assert.equal(result.feature.coins.reduce((sum, c) => sum + c.payoutCents, 0), 40012);
  assert.equal(result.feature.globalMultiplier, 1);
});
test('new collectors clear noncollectors and reveal again while the last collector stays dormant', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right';
  [0, 1, 2].forEach(row => { context.marks[1][row] = true; });
  const result = resolveFeature('right', { reel: 0, row: 0 }, context,
    new Scripted([.1, .1, 0, .001, .1, 0, .1, 0, .8, 0]));
  const waves = result.feature.coinWaves;
  assert.equal(waves.length, 2); assert.equal(waves[0].repeat, true); assert.equal(waves[1].repeat, false);
  assert.deepEqual(waves[0].cleared, [{ reel: 1, row: 0 }, { reel: 1, row: 2 }]);
  assert.equal(waves[0].retainedCollectors[0].payoutCents, 8);
  assert.equal(waves[1].existingCollectors[0].payoutCents, 8);
  assert.equal(waves[1].collections.length, 0);
  assert.equal(result.feature.payoutCents, 16);
});
test('a subsequent collector absorbs the previous collector without replaying or double-paying it', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right';
  [0, 1, 2].forEach(row => { context.marks[1][row] = true; });
  const result = resolveFeature('right', { reel: 0, row: 0 }, context,
    new Scripted([.1, .1, 0, .001, .1, 0, .001, .1, 0, .1, 0, .8, 0]));
  const waves = result.feature.coinWaves;
  assert.equal(waves.length, 3);
  const absorption = waves[1].collections[0];
  assert.ok(absorption.sources.some(c => c.kind === 'collector' && c.cell.row === 1));
  assert.equal(absorption.valueAfterCents, 12);
  assert.deepEqual(waves[1].retainedCollectors[0].cell, { reel: 1, row: 0 });
  assert.ok(waves[1].cleared.some(c => c.row === 1));
  assert.equal(result.feature.payoutCents, 20);
});
test('coin and regular wins obey remaining whole-round cent budget', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right'; context.marks[2][2] = true;
  const result = resolveFeature('right', { reel: 0, row: 0 }, { ...context, budgetCents: 7 }, new Scripted([0, .1, .999]));
  assert.equal(result.feature.payoutCents, 7); assert.equal(result.feature.coins[0].payoutCents, 7);
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('crown'));
  assert.equal(evaluate(board, matrix(), 100, 3).reduce((sum, w) => sum + w.payoutCents, 0), 3);
});
test('feature resolution does not mutate caller matrices, source grid or RNG-independent metadata', () => {
  const context = fixture('old'); context.grid[0][0] = 'middle';
  const original = structuredClone(context);
  resolveFeature('middle', { reel: 0, row: 0 }, context, new Rng(123));
  assert.deepEqual(context, original);
});
test('natural 3/4/5/6-scatter tiers and bonus retrigger upgrades preserve stronger tiers', () => {
  assert.deepEqual([2, 3, 4, 5, 6].map(bonusAward), [null, 'ruse', 'lux', 'edge', 'old']);
  assert.deepEqual(retrigger(2, 'ruse'), { addedSpins: 2, upgradedTo: null });
  assert.deepEqual(retrigger(3, 'ruse'), { addedSpins: 5, upgradedTo: null });
  assert.deepEqual(retrigger(4, 'ruse'), { addedSpins: 5, upgradedTo: 'lux' });
  assert.deepEqual(retrigger(5, 'lux'), { addedSpins: 5, upgradedTo: 'edge' });
  assert.deepEqual(retrigger(6, 'edge'), { addedSpins: 10, upgradedTo: 'old' });
  assert.deepEqual(retrigger(4, 'edge'), { addedSpins: 5, upgradedTo: null });
});
test('buy costs and xBet costs debit exact euros and settle full bonus', () => {
  const choices: Choice[] = [{ kind: 'boost' }, ...TIER_ORDER.map(tier => ({ kind: 'buy', tier } as Choice)), ...(['left', 'right', 'middle'] as Character[]).map(character => ({ kind: 'xbet', character } as Choice)), { kind: 'god' }];
  assert.deepEqual(choices.map(choice => costCents(20, choice)), [60, 1900, 3000, 36000, 50000, 170, 54, 500, 60000]);
  for (const choice of choices) {
    const session = rich(422), settled = playRound(session, choice), receipt = settled.pending!;
    assert.equal(settled.balanceCents, session.balanceCents - receipt.costCents + receipt.payoutCents);
    assert.equal(receipt.payoutCents, receipt.godHits.some(Boolean) ? receipt.capCents : receipt.spins.reduce((sum, s) => sum + s.payoutCents, 0));
  }
});
test('xBet selected character appears on every entry board', () => {
  for (const character of ['left', 'right', 'middle'] as Character[]) for (let seed = 1; seed <= 40; seed++) {
    const receipt = round(seed, { kind: 'xbet', character });
    assert.ok(receipt.spins[0].initialGrid.flat().includes(character));
  }
});
test('individual bonuses draw only their entitled badge until an explicit tier upgrade', () => {
  for (const tier of TIER_ORDER) for (let seed = 1; seed <= 30; seed++) {
    const receipt = round(seed, { kind: 'buy', tier });
    assert.equal(receipt.triggerTier, tier);
    assert.ok(receipt.spins.length >= 10 || receipt.maxWin);
    for (const spin of receipt.spins) for (const cascade of spin.cascades) for (const f of cascade.features) assert.ok(TIER_CHARACTERS[spin.tier!].includes(f.character), `${tier}/${spin.tier}: ${f.character}`);
  }
});
test('left sticky Wilds survive every subsequent bonus spin at their coordinates', () => {
  let checks = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const receipt = round(seed, { kind: 'buy', tier: 'ruse' });
    const sticky = new Set<string>();
    receipt.spins.forEach(spin => {
      for (const position of sticky) { const [r, y] = position.split(':').map(Number); assert.equal(spin.initialGrid[r][y], 'wild'); }
      for (const cascade of spin.cascades) {
        for (const feature of cascade.features) if (feature.character === 'left') for (const target of feature.targets) sticky.add(`${target.reel}:${target.row}`);
        for (const cell of cascade.removed) assert.equal(sticky.has(`${cell.reel}:${cell.row}`), false);
      }
      checks += sticky.size;
    });
  }
  assert.ok(checks > 100);
});
test('sticky Wilds pay every matching win in one batch, rest for that spin and re-arm on the next', () => {
  let exhaustedChecks = 0, rearmedChecks = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const receipt = round(seed * 0x19bcf, { kind: 'buy', tier: 'ruse' });
    for (const [spinIndex, spin] of receipt.spins.entries()) {
      assert.deepEqual(spin.cascades[0].inactiveWilds, []);
      for (const [i, cascade] of spin.cascades.entries()) {
        const before = new Set(cascade.inactiveWilds.map(c => `${c.reel}:${c.row}`));
        for (const win of cascade.wins) for (const c of win.cells) assert.equal(before.has(`${c.reel}:${c.row}`), false);
        for (const c of cascade.inactiveWildsAfter) {
          assert.ok(cascade.stickyWilds[c.reel][c.row] > 0);
          assert.equal(cascade.resolvedGrid[c.reel][c.row], 'wild');
          exhaustedChecks++;
        }
        if (spin.cascades[i + 1]) assert.deepEqual(spin.cascades[i + 1].inactiveWilds, cascade.inactiveWildsAfter);
      }
      if (spinIndex && receipt.spins[spinIndex - 1].inactiveWilds.length) rearmedChecks++;
    }
  }
  assert.ok(exhaustedChecks > 20 && rearmedChecks > 10);
});
test('unlocked shooter Wilds reset while shot-locked entire reels remain planted and rearm next free spin', () => {
  let transient = 0, locked = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const receipt = round(seed, { kind: 'buy', tier: 'edge' });
    for (let i = 1; i < receipt.spins.length; i++) {
      const previous = receipt.spins[i - 1], spin = receipt.spins[i];
      for (const reel of spin.initialExpandedReels) {
        assert.deepEqual(spin.initialGrid[reel], Array(5).fill('wild'));
        assert.ok(spin.initialWildMultipliers[reel].every(n => n > 0));
        assert.deepEqual(spin.cascades[0].inactiveWilds, []); locked++;
      }
      for (const f of previous.cascades.flatMap(c => c.features).filter(f => f.phase === 'expand')) if (!spin.initialExpandedReels.includes(f.expandedReel!)) {
        assert.equal(spin.initialWildMultipliers[f.expandedReel!].every(n => n === 0), true); transient++;
      }
    }
  }
  assert.ok(transient > 0 && locked > 0);
});
test('right bonus marks accumulate wins and survive until right reveal consumes them', () => {
  let coinReveals = 0, carried = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const receipt = round(seed, { kind: 'buy', tier: 'lux' });
    for (const spin of receipt.spins) {
      for (const cascade of spin.cascades) {
        if (spin.tier === 'lux' || spin.tier === 'old') for (const cell of cascade.removed) assert.equal(cascade.marks[cell.reel][cell.row], true);
        for (const f of cascade.features) if (f.character === 'right') { coinReveals += f.coins.length; }
      }
      carried += spin.marks.flat().filter(Boolean).length;
    }
  }
  assert.ok(coinReveals > 50); assert.ok(carried > 50);
});
test('God shoots distinct real board cells; MAX hit alone triggers the cap and misses settle that same board', () => {
  let hits = 0, misses = 0, fifthShots = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const receipt = round(seed * 0x19abf, { kind: 'god' });
    assert.equal(receipt.godGrid!.flat().filter(s => s === 'max').length, 1);
    assert.deepEqual(receipt.godHits, receipt.godShots.map(s => s.hit));
    assert.equal(new Set(receipt.godShots.map(s => `${s.target.reel}:${s.target.row}`)).size, receipt.godShots.length);
    for (const shot of receipt.godShots) assert.equal(shot.hit, receipt.godGrid![shot.target.reel][shot.target.row] === 'max');
    if (receipt.godHits.some(Boolean)) {
      hits++; assert.equal(receipt.godHits.at(-1), true); assert.equal(receipt.godHits.filter(Boolean).length, 1);
      assert.equal(receipt.spins.length, 0); assert.equal(receipt.payoutCents, 20 * 19999); assert.equal(receipt.maxWin, true);
    } else {
      misses++; assert.ok(receipt.godHits.length === 4 || receipt.godHits.length === 5);
      assert.deepEqual(receipt.spins[0].initialGrid, receipt.godGrid);
    }
    fifthShots += Number(receipt.godShots.length === 5);
  }
  assert.ok(hits > 20 && misses > 200 && fifthShots > 50);
});
test('reload rejects a tampered God target or MAX board position', () => {
  const source = playRound(rich(58243), { kind: 'god' });
  const badShot = structuredClone(source); badShot.pending!.godShots[0].target.row = (badShot.pending!.godShots[0].target.row + 1) % 5;
  assert.equal(deserializeSession(JSON.stringify(badShot)), null);
  const badBoard = structuredClone(source); badBoard.pending!.godGrid![0][0] = 'max';
  assert.equal(deserializeSession(JSON.stringify(badBoard)), null);
});
test('whole-round cap and atomic cascade ledger hold across bonus spins and coin payouts', () => {
  for (const tier of TIER_ORDER) for (let seed = 1; seed <= 40; seed++) {
    const receipt = round(seed * 37, { kind: 'buy', tier });
    let total = 0;
    for (const spin of receipt.spins) {
      assert.equal(spin.payoutCents, spin.cascades.reduce((sum, c) => sum + c.payoutCents, 0));
      for (const cascade of spin.cascades) assert.equal(cascade.payoutCents, cascade.features.reduce((sum, f) => sum + f.payoutCents, 0) + cascade.wins.reduce((sum, w) => sum + w.payoutCents, 0));
      total += spin.payoutCents; assert.equal(spin.roundTotalCents, total); assert.ok(total <= receipt.capCents);
    }
    assert.equal(total, receipt.payoutCents);
  }
});
test('playing and replaying preserve immutable prior session and receipt', () => {
  const session = rich(9327), original = structuredClone(session);
  const a = playRound(session, { kind: 'buy', tier: 'old' }), b = playRound(session, { kind: 'buy', tier: 'old' });
  assert.deepEqual(session, original); assert.deepEqual(a, b);
  assert.throws(() => playRound(a, { kind: 'spin' }), /current round/);
  const acknowledged = acknowledgeRound(a);
  assert.equal(acknowledged.pending, null); assert.equal(acknowledged.balanceCents, a.balanceCents); assert.equal(acknowledged.rngState, a.rngState);
  assert.equal(acknowledgeRound(acknowledged), acknowledged);
});
test('insufficient credits and invalid bets do not mutate or reroll', () => {
  const session = createSession(1234, 19), original = structuredClone(session);
  assert.throws(() => playRound(session, { kind: 'spin' }), /Insufficient/); assert.deepEqual(session, original);
  assert.throws(() => costCents(.1, { kind: 'spin' }), /Invalid bet/);
});
test('serialized pending and acknowledged sessions reload exact RNG and settle once', () => {
  let session = rich(948);
  for (const choice of [{ kind: 'spin' }, { kind: 'buy', tier: 'old' }, { kind: 'god' }] as Choice[]) {
    session = playRound(session, choice);
    assert.deepEqual(deserializeSession(JSON.stringify(session)), session);
    session = acknowledgeRound(session);
    assert.deepEqual(deserializeSession(JSON.stringify(session)), session);
  }
});
test('reload rejects tampered money, RNG, identity, target lists and per-coin payouts', () => {
  const source = playRound(rich(5000), { kind: 'buy', tier: 'old' });
  const mutations = [
    (s: Session) => { s.balanceCents = -1; }, (s: Session) => { s.balanceCents = .5; },
    (s: Session) => { s.rngState = 0; }, (s: Session) => { s.sequence++; },
    (s: Session) => { s.pending!.payoutCents++; }, (s: Session) => { s.pending!.spins[0].finalGrid[0][0] = 'scatter'; },
    (s: Session) => { s.history[0].initialRng++; },
  ];
  for (const mutate of mutations) { const corrupt = structuredClone(source); mutate(corrupt); assert.equal(deserializeSession(JSON.stringify(corrupt)), null); }
  assert.equal(deserializeSession('{bad'), null); assert.equal(deserializeSession('{}'), null);
});
test('history trims to twelve ordered receipts and remains replay-valid', () => {
  let session = rich(19);
  for (let i = 0; i < 16; i++) session = acknowledgeRound(playRound(session, { kind: 'spin' }));
  assert.equal(session.history.length, 12); assert.equal(session.history[0].id, 5);
  assert.deepEqual(deserializeSession(JSON.stringify(session)), session);
});
test('right base feature waits through real wins, then reveals their marked boxes', () => {
  let checked = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const receipt = round(seed * 0x119a, { kind: 'xbet', character: 'right' });
    const spin = receipt.spins[0];
    for (const [index, cascade] of spin.cascades.entries()) for (const feature of cascade.features) if (feature.character === 'right' && feature.coins.length) {
      assert.ok(index > 0); assert.ok(spin.cascades.slice(0, index).some(c => c.removed.length > 0));
      assert.equal(cascade.grid[feature.source.reel][feature.source.row], 'right');
      assert.ok(feature.targets.every(target => spin.cascades.slice(0, index).some(c => c.marks[target.reel][target.row])));
      checked++;
    }
  }
  assert.ok(checked > 5);
});
test('special badges and one-scatter-per-reel are initial-drop events; refill adds only regulars', () => {
  for (const tier of TIER_ORDER) for (let seed = 1; seed <= 10; seed++) for (const spin of round(seed * 131, { kind: 'buy', tier }).spins) {
    for (const column of spin.initialGrid) assert.ok(column.filter(s => s === 'scatter').length <= 1);
    for (const cascade of spin.cascades) if (cascade.refilledGrid) {
      const before = cascade.resolvedGrid.flat(), after = cascade.refilledGrid.flat();
      for (const symbol of ['scatter', 'left', 'middle', 'right']) assert.equal(after.filter(s => s === symbol).length, before.filter(s => s === symbol).length);
      for (let reel = 0; reel < 6; reel++) for (let row = 0; row < 5; row++) if (cascade.stickyWilds[reel][row]) assert.equal(cascade.refilledGrid[reel][row], 'wild');
    }
  }
});
test('prices round fractional xBet multipliers to exact cents', () => {
  assert.equal(costCents(10, { kind: 'xbet', character: 'left' }), 85);
  assert.equal(costCents(10, { kind: 'xbet', character: 'middle' }), 250);
  assert.equal(costCents(11, { kind: 'xbet', character: 'left' }), 94);
  assert.equal(costCents(10, { kind: 'xbet', character: 'right' }), 27);
});
test('identical seeds and bets have identical outcomes irrespective of credit balance', () => {
  const a = playRound(createSession(598, 1000000), { kind: 'buy', tier: 'old' });
  const b = playRound(createSession(598, 2000000), { kind: 'buy', tier: 'old' });
  assert.deepEqual(a.pending, b.pending); assert.equal(b.balanceCents - a.balanceCents, 1000000);
});
test('rounds and reload reject unconfigured stakes and an unfundable historical ledger', () => {
  const invalidBet = { ...createSession(123), betCents: 11 };
  assert.throws(() => playRound(invalidBet, { kind: 'spin' }), /Invalid choice or bet/);
  assert.equal(deserializeSession(JSON.stringify(invalidBet)), null);
  let godWin = playRound(rich(1), { kind: 'god' });
  for (let seed = 2; !godWin.pending!.maxWin && seed < 1000; seed++) godWin = playRound(rich(seed), { kind: 'god' });
  assert.equal(godWin.pending!.maxWin, true);
  godWin.balanceCents = 0;
  assert.equal(deserializeSession(JSON.stringify(godWin)), null);
});


test('all frozen pools prove exact 96.5% expected return at every offered stake', () => {
  for (const [name, pool] of Object.entries(MATH_MODEL.pools)) for (const [stake, bet] of CONFIG.betsCents.entries()) {
    const spec = pool.weights[stake], indices = new Set(spec.indices);
    assert.equal(indices.size, spec.indices.length); assert.ok([...indices].every(i => i >= 0 && i < pool.seeds.length));
    let total = 0n, weighted = 0n;
    for (const [i, values] of pool.payouts.entries()) {
      const weight = BigInt(spec.baseline) + (indices.has(i) ? BigInt(spec.extra) : 0n);
      assert.ok(weight > 0n); assert.ok(Number.isSafeInteger(values[stake]) && values[stake] >= 0 && values[stake] <= bet * CONFIG.maxWin);
      total += weight; weighted += weight * BigInt(values[stake]);
    }
    assert.equal(total, BigInt(spec.total)); assert.equal(weighted, BigInt(spec.weightedPayout));
    const numerator = name === 'ordinary' ? BigInt(bet) * 193n : name === 'natural-bonus' ? BigInt(bet) * 38793n : BigInt(costCents(bet, pool.choice)) * 193n;
    const denominator = name === 'ordinary' || name === 'natural-bonus' ? 400n : 200n;
    assert.equal(weighted * denominator, total * numerator, `${name}/${bet}`);
  }
  // The SAME A and B distributions: .995 A + .005 B = .965; (.975 A + .025 B)/3 = .965.
  assert.equal(199n * 193n + 38793n, 193n * 400n);
  assert.equal((39n * 193n + 38793n) * 200n, 193n * 40n * 400n * 3n);
});

test('frozen catalogue source hashes match the complete procedural model', () => {
  for (const [path, wanted] of Object.entries(MATH_MODEL.sourceHashes)) {
    const actual = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(actual, wanted, path);
  }
});

test('the 3x XBet raises the entire natural bonus-entry probability exactly five times', () => {
  assert.equal(costCents(20, { kind: 'boost' }), 60);
  assert.equal(bonusTriggerProbability({ kind: 'spin' }), .005);
  assert.equal(bonusTriggerProbability({ kind: 'boost' }), .025);
  assert.equal(bonusTriggerProbability({ kind: 'boost' }) / bonusTriggerProbability({ kind: 'spin' }), 5);
  assert.ok(MATH_MODEL.pools['natural-bonus'].entryScatters?.includes(3));
  assert.ok(MATH_MODEL.pools['natural-bonus'].entryScatters?.includes(4));
  assert.ok(MATH_MODEL.pools['natural-bonus'].entryScatters?.includes(5));
  assert.ok(MATH_MODEL.pools['natural-bonus'].entryScatters?.includes(6));
  for (const betCents of CONFIG.betsCents) assert.equal(costCents(betCents, { kind: 'boost' }), betCents * 3);
});

test('integer rejection sampling discards the modulo tail and supports multiple entropy words', () => {
  const values = [0xffffffff, 17]; let consumed = 0;
  assert.equal(uniformTicket(() => { consumed++; return values.shift()!; }, 10n), 7n);
  assert.equal(consumed, 2);
  const large = [1, 2]; assert.equal(uniformTicket(() => large.shift()!, 1n << 40n), 4294967298n);
  assert.throws(() => uniformTicket(() => -.1, 10n), /entropy/);
  assert.throws(() => uniformTicket(() => 1, 0n), /limit/);
});

test('production crypto receipts record entropy and reload without redrawing or paying twice', () => {
  for (const choice of [{ kind: 'spin' }, { kind: 'boost' }, { kind: 'god' }, { kind: 'buy', tier: 'old' }] as Choice[]) {
    const source = createSession(781, 100000000), played = playCryptoRound(source, choice);
    assert.equal(played.pending!.outcome!.source, 'crypto'); assert.ok(played.pending!.outcome!.draws.length > 0);
    const restored = deserializeSession(JSON.stringify(played)); assert.deepEqual(restored, played);
    const settled = acknowledgeRound(restored!); assert.equal(settled.balanceCents, played.balanceCents);
    assert.deepEqual(deserializeSession(JSON.stringify(settled)), settled);
    const changed = structuredClone(played); changed.pending!.outcome!.draws[0] ^= 1;
    assert.equal(deserializeSession(JSON.stringify(changed)), null);
    const extra = structuredClone(played); extra.pending!.outcome!.draws.push(0);
    assert.equal(deserializeSession(JSON.stringify(extra)), null);
  }
});

test('every selected fixture receipt identifies and matches its verified cent outcome', () => {
  for (const choice of [{ kind: 'spin' }, { kind: 'boost' }, { kind: 'xbet', character: 'right' }, { kind: 'buy', tier: 'old' }, { kind: 'god' }] as Choice[]) for (const betCents of CONFIG.betsCents) {
    const receipt = playRound({ ...rich(17342), betCents }, choice).pending!, outcome = receipt.outcome!;
    const pool = MATH_MODEL.pools[outcome.pool], stake = MATH_MODEL.betsCents.indexOf(betCents);
    assert.equal(receipt.payoutCents, pool.payouts[outcome.index][stake]); assert.equal(outcome.seed, pool.seeds[outcome.index]);
    const generated = simulateRound(outcome.seed, betCents, pool.choice, pool.entryScatters?.[outcome.index]);
    assert.equal(generated.payoutCents, receipt.payoutCents);
  }
});

test('old pending receipts cannot be silently replayed under v4 mathematics', () => {
  const legacy = { ...rich(19), version: 2 };
  assert.equal(deserializeSession(JSON.stringify(legacy)), null);
  assert.equal(createSession(19).version, 4);
});

test('a failed entropy source stops within the replay draw budget and leaves credits untouched', () => {
  const session = rich(19), before = structuredClone(session), crypto = globalThis.crypto;
  const original = crypto.getRandomValues; let calls = 0;
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: (bytes: Uint32Array) => { calls++; bytes.fill(0xffffffff); return bytes; } });
  try {
    assert.throws(() => playCryptoRound(session, { kind: 'spin' }), /Entropy safety limit/);
    assert.equal(calls, 1000); assert.deepEqual(session, before);
  } finally { Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: original }); }
});

test('guaranteed coin reveal gives every marked vacancy a real coin or effect, never an empty box', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const context = fixture('lux'); context.grid[0][0] = 'right';
    for (let reel = 0; reel < 6; reel++) for (let row = 0; row < 5; row++) context.marks[reel][row] = true;
    const result = resolveFeature('right', { reel: 0, row: 0 }, context, new Rng(seed * 0x31af));
    assert.equal(result.feature.targets.length, 30);
    for (const wave of result.feature.coinWaves) {
      assert.ok(wave.coins.every(c => c.kind !== 'empty'));
      const complete = new Set([...wave.coins, ...wave.existingCollectors].map(c => `${c.cell.reel}:${c.cell.row}`));
      assert.equal(complete.size, 30);
    }
    assert.equal(result.feature.payoutCents, result.feature.coins.reduce((n, c) => n + c.payoutCents, 0));
  }
});
test('legacy settled-wallet carry validates version, pending state, header, bounded history and ledger', () => {
  const previous = { ...createSession(319, 128543), version: 3 };
  assert.deepEqual(settledLegacyWallet(JSON.stringify(previous)), { balanceCents: 128543, betCents: 20 });
  for (const changed of [{ ...previous, pending: {} }, { ...previous, balanceCents: -.1 }, { ...previous, betCents: 11 }, { ...previous, sequence: 1 }, { ...previous, history: Array(13).fill({}) }]) assert.equal(settledLegacyWallet(JSON.stringify(changed)), null);
  assert.equal(settledLegacyWallet('{bad'), null);
});

test('six-Wild payline pays one explicit200x Wild award, never nine invented natural-symbol awards', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('wild'));
  const m: Matrix = Array.from({ length: 6 }, () => Array(5).fill(1));
  const wins = lineEvaluate(board, m); assert.equal(wins.length, 1); assert.equal(wins[0].symbol, 'wild'); assert.equal(wins[0].count, 6); assert.equal(wins[0].baseMultiplier, 200); assert.equal(wins[0].payoutCents, 600000);
  board[5][0] = 'scatter'; assert.equal(lineEvaluate(board, m).length, 0);
});

test('depleted payline budget does not declare or remove unpaid combinations', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('crown'));
  assert.deepEqual(lineEvaluate(board, matrix(), 100, 0), []);
  const wins = lineEvaluate(board, matrix(), 100, 1, [], [[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]]);
  assert.equal(wins.length, 1); assert.equal(wins[0].payoutCents, 1);
});

test('expanding shooter drops separate scatters and unresolved badges before recorded initial boards', () => {
  for (const choice of [{ kind: 'spin' }, { kind: 'xbet', character: 'left' }, { kind: 'xbet', character: 'right' }, { kind: 'xbet', character: 'middle' }, { kind: 'buy', tier: 'old' }] as Choice[]) for (let seed = 1; seed <= 100; seed++) {
    const receipt = simulateRound(seed * 0x4ea715, 20, choice);
    if (choice.kind === 'xbet') assert.ok(receipt.spins[0].initialGrid.flat().includes(choice.character));
    for (const spin of receipt.spins) for (const column of spin.initialGrid) if (column.includes('middle')) {
      assert.equal(column.filter(s => s === 'middle').length, 1);
      assert.equal(column.some(s => s === 'scatter' || s === 'left' || s === 'right'), false);
    }
  }
});
test('multiple expanding reels are reachable in a real raw base drop without a guaranteed-entry override', () => {
  const receipt = simulateRound(437711782, 20, { kind: 'spin' });
  const middle = receipt.spins[0].cascades.flatMap(c => c.features).filter(f => f.character === 'middle' && f.phase === 'expand');
  assert.ok(new Set(middle.map(f => f.expandedReel)).size >= 2);
  for (const f of middle) assert.deepEqual(f.gridAfter[f.expandedReel!], Array(5).fill('wild'));
});
test('multiple expanding reels retain positive catalogue weight in base and shooter/super bonuses', () => {
  for (const name of ['ordinary', 'buy-edge', 'buy-old']) {
    const pool = MATH_MODEL.pools[name];
    assert.ok(pool.expansionCounts.some(n => n >= 2), name);
    for (const spec of pool.weights) {
      const boosted = new Set(spec.indices);
      const multiTickets = pool.expansionCounts.reduce((sum, count, index) => sum + (count >= 2 ? BigInt(spec.baseline) + (boosted.has(index) ? BigInt(spec.extra) : 0n) : 0n), 0n);
      assert.ok(multiTickets > 0n);
    }
  }
});

test('every referenced payline pays its complete path and a gap prevents that same line award', () => {
  assert.equal(PAYLINES.length, 19);
  assert.equal(new Set(PAYLINES.map(line => line.join(','))).size, 19);
  for (const [index, path] of PAYLINES.entries()) {
    const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('scatter'));
    for (const [reel, row] of path.entries()) board[reel][row] = 'ring';
    const full = evaluate(board, matrix(), 100).find(w => w.line === index + 1);
    assert.ok(full, `line${index + 1}`); assert.equal(full.count, 6);
    assert.deepEqual(full.cells, path.map((row, reel) => ({ reel, row })));
    assert.equal(full.payoutCents, 100 * CONFIG.paytable.ring[6]);
    board[2][path[2]] = 'cash';
    assert.equal(evaluate(board, matrix(), 100).some(w => w.line === index + 1), false, `gap on line${index + 1}`);
  }
});

test('follow-up shooter phase is optional and regular/repeated ordinary hits produce1x then2x then4x', () => {
  const context = fixture();
  assert.equal(resolveShooterShots({ reel: 2, row: 3 }, context, new Scripted([.99])), null);
  const result = resolveShooterShots({ reel: 2, row: 3 }, context, new Scripted([0, .99, 0, 0, 0]))!;
  assert.equal(result.feature.phase, 'shots'); assert.equal(result.feature.shotEvents!.length, 3);
  assert.deepEqual(result.feature.shotEvents!.map(s => s.hits[0].multiplier), [1, 2, 4]);
  assert.deepEqual(result.feature.shotEvents!.map(s => s.hits[0].repeated), [false, true, true]);
  assert.ok(result.feature.shotEvents!.every(s => s.hits.length === 1 && s.expandedReel === undefined && !s.sticky));
  assert.equal(result.sticky[0][0], 0);
});
test('a follow-up expanded-reel hit doubles all five exact multipliers and locks the entire reel only in a bonus', () => {
  for (const tier of [null, 'edge'] as const) {
    const context = fixture(tier); context.grid[2][3] = 'middle';
    const expansion = resolveFeature('middle', { reel: 2, row: 3 }, context, new Scripted([0]));
    const result = resolveShooterShots({ reel: 2, row: 3 }, { ...context, ...expansion }, new Scripted([0, 0, 10.5 / 30]))!;
    const shot = result.feature.shotEvents![0]; assert.equal(shot.expandedReel, 2); assert.equal(shot.sticky, tier !== null);
    assert.deepEqual(shot.hits.map(h => h.cell), Array.from({ length: 5 }, (_, row) => ({ reel: 2, row })));
    assert.deepEqual(result.multipliers[2], Array(5).fill(2)); assert.deepEqual(result.sticky[2], Array(5).fill(tier === null ? 0 : 2));
    assert.deepEqual(result.grid[2], Array(5).fill('wild'));
  }
});
test('all expansions are available before follow-up shots can boost a different expanded reel', () => {
  const context = fixture('old'); context.grid[1][2] = 'middle'; context.grid[4][0] = 'middle';
  const a = resolveFeature('middle', { reel: 1, row: 2 }, context, new Scripted([0]));
  const b = resolveFeature('middle', { reel: 4, row: 0 }, { ...context, ...a }, new Scripted([.8]));
  const shots = resolveShooterShots({ reel: 1, row: 2 }, { ...context, ...b }, new Scripted([0, 0, 23.5 / 30]))!;
  assert.equal(shots.feature.shotEvents![0].expandedReel, 4); assert.deepEqual(shots.multipliers[4], Array(5).fill(4)); assert.deepEqual(shots.sticky[4], Array(5).fill(4));
  assert.deepEqual(shots.sticky[1], Array(5).fill(0));
});
test('follow-up shots exclude unresolved badges, scatter invitations and MAX cells', () => {
  const context = fixture('old');
  context.grid[0][0] = 'scatter'; context.grid[0][1] = 'left'; context.grid[0][2] = 'right'; context.grid[0][3] = 'max';
  const result = resolveShooterShots({ reel: 3, row: 0 }, context, new Scripted([0, .99, 0, 0, 0]))!;
  assert.deepEqual(result.feature.targets, Array(3).fill({ reel: 0, row: 4 }));
  assert.deepEqual(result.grid[0].slice(0, 4), context.grid[0].slice(0, 4));
});
