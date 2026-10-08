import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG, TIER_CHARACTERS, TIER_ORDER, REGULARS, Rng, acknowledgeRound, bonusAward, costCents, createSession, deserializeSession, evaluate, playRound, resolveFeature, retrigger, wildGlobal } from '../src/engine';
import type { Character, Choice, Grid, Matrix, Session, Tier } from '../src/types';

const matrix = (): Matrix => Array.from({ length: 6 }, () => Array(5).fill(0));
const marks = (): boolean[][] => Array.from({ length: 6 }, () => Array(5).fill(false));
const grid = (): Grid => Array.from({ length: 6 }, (_, reel) => Array.from({ length: 5 }, (_, row) => REGULARS[(reel + row) % 6]));
const fixture = (tier: Tier | null = null) => ({ grid: grid(), multipliers: matrix(), sticky: matrix(), marks: marks(), tier, betCents: 20 });

class Scripted extends Rng {
  constructor(private values: number[]) { super(1); }
  override next(): number { return this.values.shift() ?? .1; }
}
const rich = (seed: number): Session => createSession(seed, 100000000);
const round = (seed: number, choice: Choice) => playRound(rich(seed), choice).pending!;

test('six-reel count-anywhere pay can include cells on the sixth reel', () => {
  const board = grid();
  for (const [reel, row] of [[0, 0], [0, 1], [1, 1], [2, 0], [3, 1], [4, 0], [5, 2], [5, 4]]) board[reel][row] = 'crown';
  const win = evaluate(board, matrix(), 100).find(w => w.symbol === 'crown')!;
  assert.ok(win.count >= 8); assert.ok(win.cells.some(c => c.reel === 5)); assert.equal(win.payoutCents, Math.round(win.baseMultiplier * 100));
});
test('pay brackets are 8, 10 and 12+ physical matching cells', () => {
  for (const count of [7, 8, 10, 12, 20]) {
    const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('scatter'));
    for (let i = 0; i < count; i++) board[Math.floor(i / 5)][i % 5] = 'bottle';
    const wins = evaluate(board, matrix(), 100);
    assert.equal(wins.length, count < 8 ? 0 : 1);
    if (count >= 8) assert.equal(wins[0].payoutCents, Math.round(100 * CONFIG.paytable.bottle[count >= 12 ? 12 : count >= 10 ? 10 : 8]));
  }
});
test('visible Wild multipliers sum rather than multiply and empty grids have ×1', () => {
  const board = grid(), multipliers = matrix();
  assert.equal(wildGlobal(board, multipliers), 1);
  board[0][0] = board[3][4] = 'wild'; multipliers[0][0] = 2; multipliers[3][4] = 8;
  assert.equal(wildGlobal(board, multipliers), 10);
});
test('Wild substitution requires seven natural copies and pure Wild boards cannot invent six wins', () => {
  const board: Grid = Array.from({ length: 6 }, () => Array(5).fill('wild'));
  const multipliers: Matrix = Array.from({ length: 6 }, () => Array(5).fill(1));
  assert.equal(evaluate(board, multipliers, 20).length, 0);
  board[5][4] = 'crown'; multipliers[5][4] = 0;
  assert.equal(evaluate(board, multipliers, 20).length, 0);
  for (let i = 0; i < 7; i++) { board[Math.floor(i / 5)][i % 5] = 'crown'; multipliers[Math.floor(i / 5)][i % 5] = 0; }
  assert.equal(evaluate(board, multipliers, 20).length, 1);
});
test('normal shooter creates three to seven shots and repeated hits double 1,2,4', () => {
  const context = fixture('edge'); context.grid[0][0] = 'middle';
  const result = resolveFeature('middle', { reel: 0, row: 0 }, context, new Scripted([.1, 0, 0, 0, 0]));
  assert.equal(result.feature.hits.length, 3);
  assert.deepEqual(result.feature.hits.map(hit => hit.multiplier), [1, 2, 4]);
  assert.deepEqual(result.feature.hits.map(hit => hit.repeated), [false, true, true]);
  assert.equal(result.feature.globalMultiplier, 4);
  assert.equal(result.sticky.flat().reduce((a, b) => a + b), 0);
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
test('shooter can double an existing sticky Wild while its new targets stay transient', () => {
  const context = fixture('old'); context.grid[0][0] = 'middle'; context.grid[0][1] = 'wild'; context.multipliers[0][1] = context.sticky[0][1] = 1;
  const result = resolveFeature('middle', { reel: 0, row: 0 }, context, new Scripted([0, 0, 0, 0, 0, .99, .99]));
  assert.equal(result.sticky[0][1], 4); assert.equal(result.sticky[5][4], 0);
});
test('right consumes only marked boxes; other characters preserve those marks', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right'; context.marks[2][3] = true;
  const result = resolveFeature('right', { reel: 0, row: 0 }, context, new Scripted([0, 0, 0]));
  assert.deepEqual(result.feature.targets, [{ reel: 2, row: 3 }]);
  assert.equal(result.feature.coins[0].kind, 'value'); assert.equal(result.feature.coins[0].value, 1); assert.equal(result.feature.payoutCents, 20);
  assert.equal(result.marks[2][3], false); assert.equal(result.feature.hits.length, 0);
  for (const c of ['left', 'middle'] as Character[]) assert.equal(resolveFeature(c, { reel: 0, row: 0 }, context, new Rng(5)).marks[2][3], true);
});
test('right supports 500× values, local multipliers, global coin multipliers and collectors', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right';
  [0, 1, 2, 3].forEach(row => { context.marks[1][row] = true; });
  const result = resolveFeature('right', { reel: 0, row: 0 }, context, new Scripted([0, 0, .9999, .95, 0, .999, 0, .94, 0]));
  assert.deepEqual(result.feature.coins.map(c => c.kind), ['value', 'multiplier', 'global', 'collector']);
  assert.equal(result.feature.coins[0].value, 500);
  assert.equal(result.feature.coins[0].payoutCents, 20 * 500 * 2 * 2);
  assert.equal(result.feature.coins[3].payoutCents, result.feature.coins[0].payoutCents);
  assert.equal(result.feature.globalMultiplier, 1); // Coin factor cannot inflate Wild sum.
});
test('coin and regular wins obey remaining whole-round cent budget', () => {
  const context = fixture('lux'); context.grid[0][0] = 'right'; context.marks[2][2] = true;
  const result = resolveFeature('right', { reel: 0, row: 0 }, { ...context, budgetCents: 7 }, new Scripted([0, 0, .999]));
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
  const choices: Choice[] = [...TIER_ORDER.map(tier => ({ kind: 'buy', tier } as Choice)), ...(['left', 'right', 'middle'] as Character[]).map(character => ({ kind: 'xbet', character } as Choice)), { kind: 'god' }];
  assert.deepEqual(choices.map(choice => costCents(20, choice)), [700, 5000, 12000, 50000, 30, 900, 90, 60000]);
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
test('shooter bonus Wilds reset at next spin, with no fixed sticky upgrade', () => {
  let changed = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const receipt = round(seed, { kind: 'buy', tier: 'edge' });
    for (let i = 1; i < receipt.spins.length; i++) if (receipt.spins[i].tier === 'edge') {
      assert.equal(receipt.spins[i].initialWildMultipliers.flat().reduce((a, b) => a + b), 0);
      changed += receipt.spins[i - 1].cascades.flatMap(c => c.features).filter(f => f.character === 'middle').reduce((sum, f) => sum + f.hits.length, 0);
    }
  }
  assert.ok(changed > 0);
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
test('God shots stop on first hit and produce exactly 19,999×; all misses retain ordinary rounds', () => {
  let hits = 0, misses = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const receipt = round(seed * 0x19abf, { kind: 'god' });
    if (receipt.godHits.some(Boolean)) {
      hits++; assert.equal(receipt.godHits.at(-1), true); assert.equal(receipt.godHits.filter(Boolean).length, 1);
      assert.equal(receipt.spins.length, 0); assert.equal(receipt.payoutCents, 20 * 19999); assert.equal(receipt.maxWin, true);
    } else { misses++; assert.equal(receipt.godHits.length, 6); assert.ok(receipt.spins.length >= 1); }
  }
  assert.ok(hits > 20 && misses > 200);
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
  assert.ok(checked > 10);
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
  assert.equal(costCents(10, { kind: 'xbet', character: 'left' }), 15);
  assert.equal(costCents(10, { kind: 'xbet', character: 'middle' }), 45);
  assert.equal(costCents(11, { kind: 'xbet', character: 'left' }), 17);
});
test('identical seeds and bets have identical outcomes irrespective of credit balance', () => {
  const a = playRound(createSession(598, 1000000), { kind: 'buy', tier: 'old' });
  const b = playRound(createSession(598, 2000000), { kind: 'buy', tier: 'old' });
  assert.deepEqual(a.pending, b.pending); assert.equal(b.balanceCents - a.balanceCents, 1000000);
});
test('rounds and reload reject unconfigured stakes and an unfundable historical ledger', () => {
  const invalidBet = { ...createSession(123), betCents: 11 };
  assert.throws(() => playRound(invalidBet, { kind: 'spin' }), /Invalid bet/);
  assert.equal(deserializeSession(JSON.stringify(invalidBet)), null);
  const godWin = playRound(rich(1), { kind: 'god' });
  assert.equal(godWin.pending!.maxWin, true);
  godWin.balanceCents = 0;
  assert.equal(deserializeSession(JSON.stringify(godWin)), null);
});
