import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFIG, PAYING_SYMBOLS, roundPriceCents, countScatters, evaluateScatterPays,
  formatMoney, roundHalfUp, settledPayout, SeededRandom, resolveCascades,
  advanceRound, createSession, dismissPresentation, refillDemo, selectBet, setMode, startRound, quoteExtraSpinCostCents,
  commitSession, loadSession, saveSession, STORAGE_KEY, LEGACY_STORAGE_KEY,
} from '../src/engine/index';
import type {
  BonusTier, BonusUpgrade, CellPosition, Grid, Mode, NumberGrid, RoundChoice, Session,
  SpinPresentation, StorageLike, SymbolId,
} from '../src/engine/types';

const MODES: Mode[] = ['standard', 'hunt', 'frames', 'wild', 'god'];
const TIERS: BonusTier[] = ['dorm', 'friday', 'december'];
const CELLS: CellPosition[] = Array.from({ length: 30 }, (_, i) => ({ reel: Math.floor(i / 5), row: i % 5 }));
const numbers = (value = 1): NumberGrid => Array.from({ length: 6 }, () => Array<number>(5).fill(value));
const board = (symbol: SymbolId = 'scatter'): Grid => Array.from({ length: 6 }, () => Array<SymbolId>(5).fill(symbol));
function place(grid: Grid, symbol: SymbolId, cells: CellPosition[]): Grid {
  for (const { reel, row } of cells) grid[reel][row] = symbol;
  return grid;
}
class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
function finishRound(session: Session, inspect?: (view: SpinPresentation) => void): Session {
  let current = session, steps = 0;
  while (current.presentation || current.activeRound) {
    assert.ok(++steps < 1_000, 'a seeded test feature must terminate rather than silently discard spins');
    if (current.presentation) {
      inspect?.(current.presentation);
      const acknowledged = dismissPresentation(current);
      assert.equal(acknowledged.balanceCents, current.balanceCents);
      assert.equal(acknowledged.rngState, current.rngState);
      current = acknowledged;
    }
    if (current.activeRound) current = advanceRound(current);
  }
  return current;
}
function purchasedFixture(tier: BonusTier, seed = 57): Session {
  const started = startRound(createSession(seed), { kind: 'buy', bonus: tier });
  const ready = dismissPresentation(started);
  assert.ok(ready.activeRound, 'fixture must retain unplayed free spins');
  return ready;
}
function findTransition(session: Session, predicate: (next: Session) => boolean, limit = 5_000): [Session, Session] {
  for (let seed = 1; seed <= limit; seed++) {
    const candidate = { ...session, rngState: seed };
    const next = advanceRound(candidate);
    if (predicate(next)) return [candidate, next];
  }
  assert.fail(`no deterministic seed in ${limit} produced requested transition`);
}
function extraFixture(): Session {
  for (let index = 1; index <= 2_000; index++) {
    const completed = finishRound(startRound(createSession(Math.imul(index, 0x9e3779b9) >>> 0)));
    if (completed.extraSpinOffer) return completed;
  }
  assert.fail('the deterministic corpus must exercise a qualified Extra Spin offer');
}

// These first fixtures are player-visible rule examples, not a replay of implementation internals.
test('the game uses six reels of five physical positions and a 30,000× whole-round cap', () => {
  assert.equal(CONFIG.reels, 6);
  assert.equal(CONFIG.rows, 5);
  assert.equal(CONFIG.minimumPayCount, 8);
  assert.equal(PAYING_SYMBOLS.length, 9);
  assert.deepEqual(CONFIG.payThresholds, [8, 10, 12]);
  assert.equal(CONFIG.capMultiplier, 30_000);
  assert.equal(CONFIG.positionMultiplierLimit, 8192);
});

test('eight symbols pay anywhere, including only the final two reels without a left-reel symbol', () => {
  const cells = [...CELLS.slice(20, 25), ...CELLS.slice(25, 28)];
  const result = evaluateScatterPays(place(board(), 'book', cells), numbers(), 100);
  assert.equal(result.wins.length, 1);
  assert.equal(result.wins[0].symbol, 'book');
  assert.equal(result.wins[0].count, 8);
  assert.deepEqual(result.wins[0].cells, cells);
  assert.ok(result.payoutCents > 0);
  assert.ok(result.wins[0].cells.every(cell => cell.reel >= 4));
  assert.equal(evaluateScatterPays(place(board(), 'book', cells.slice(0, 7)), numbers(8192), 100).payoutCents, 0);
});

test('a qualifying win includes every matching cell on all six reels with no three-reel cutoff', () => {
  const cells = [{ reel: 0, row: 0 }, { reel: 1, row: 3 }, { reel: 2, row: 1 },
    { reel: 3, row: 4 }, { reel: 4, row: 2 }, { reel: 5, row: 0 }, { reel: 5, row: 3 }, { reel: 5, row: 4 }];
  const result = evaluateScatterPays(place(board(), 'coffee', cells), numbers(), 100);
  assert.equal(result.wins[0].cells.length, 8);
  assert.equal(new Set(result.wins[0].cells.map(cell => cell.reel)).size, 6);
  const reversed = place(board(), 'coffee', cells.map(({ reel, row }) => ({ reel: 5 - reel, row: 4 - row })));
  assert.equal(evaluateScatterPays(reversed, numbers(), 100).payoutCents, result.payoutCents);
});

test('only a winning symbol’s boosted positions contribute, and there is no global multiplier', () => {
  const grid = place(board(), 'book', CELLS.slice(0, 8));
  const multipliers = numbers();
  const unboosted = evaluateScatterPays(grid, multipliers, 100);
  multipliers[0][0] = 2; multipliers[1][2] = 4; multipliers[5][4] = 8192;
  const boosted = evaluateScatterPays(grid, multipliers, 100);
  assert.equal(unboosted.wins[0].positionMultiplier, 1);
  assert.equal(boosted.wins[0].positionMultiplier, 6);
  assert.equal(boosted.payoutCents, unboosted.payoutCents * 6);
  const allBoosted = evaluateScatterPays(grid, numbers(2), 100);
  assert.equal(allBoosted.wins[0].positionMultiplier, 16);
  assert.equal(allBoosted.payoutCents, unboosted.payoutCents * 16);
});

test('official footage multiplier examples reproduce sums of 12 and 16 over eight physical symbols', () => {
  // Official Scatter Wins clip at 15 s shows three marked ×4 positions and five neutral.
  // At 12 s every winning position is marked ×2. The video does not disclose its base bet.
  const grid = place(board(), 'book', CELLS.slice(0, 8)), multipliers = numbers();
  for (const cell of CELLS.slice(0, 3)) multipliers[cell.reel][cell.row] = 4;
  assert.equal(evaluateScatterPays(grid, multipliers, 100).wins[0].positionMultiplier, 12);
  assert.equal(evaluateScatterPays(grid, numbers(2), 100).wins[0].positionMultiplier, 16);
});

test('each symbol pays once at the highest achieved count bracket, even with multiple simultaneous wins', () => {
  const grid = place(place(board(), 'book', CELLS.slice(0, 10)), 'bouncer', CELLS.slice(10, 18));
  const result = evaluateScatterPays(grid, numbers(), 100);
  assert.deepEqual(result.wins.map(win => [win.symbol, win.count]), [['book', 10], ['bouncer', 8]]);
  assert.equal(result.payoutCents, result.wins.reduce((sum, win) => sum + win.payoutCents, 0));
  const eight = evaluateScatterPays(place(board(), 'book', CELLS.slice(0, 8)), numbers(), 100);
  assert.ok(result.wins[0].payMultiplier > eight.wins[0].payMultiplier);
});

test('the public count brackets are 8–9, 10–11 and 12+, with no extra invented upper brackets', () => {
  const multiplier = (count: number) => evaluateScatterPays(place(board(), 'book', CELLS.slice(0, count)), numbers(), 100).wins[0].payMultiplier;
  assert.equal(multiplier(8), multiplier(9));
  assert.equal(multiplier(10), multiplier(11));
  assert.ok(multiplier(10) > multiplier(9));
  assert.ok(multiplier(12) > multiplier(11));
  for (const count of [13, 15, 20, 25, 30]) assert.equal(multiplier(count), multiplier(12));
});

test('all 27 unboosted pays match the independently verified current official demo symbol table', () => {
  // docs/duck-hunters-public-paytable.json: official guest INIT, 2026-10-07.
  // SymbolTable values / 20, at 8/10/12 physical positions.
  // Studentski Grad maps L5/L4/L3/L2/L1/M4/M3/M2/M1 in this order.
  const expectedCentsAtOneEuro: [SymbolId, [number, number, number]][] = [
    ['book', [10, 15, 100]], ['coffee', [10, 20, 125]], ['noodles', [10, 25, 150]],
    ['doner', [10, 30, 175]], ['beer', [10, 40, 200]], ['female', [15, 60, 250]],
    ['male', [15, 70, 300]], ['dj', [20, 80, 350]], ['bouncer', [30, 100, 500]],
  ];
  for (const [symbol, pays] of expectedCentsAtOneEuro) {
    for (const [index, count] of [8, 10, 12].entries()) {
      const result = evaluateScatterPays(place(board(), symbol, CELLS.slice(0, count)), numbers(), 100);
      assert.equal(result.wins.length, 1);
      assert.equal(result.payoutCents, pays[index], `${symbol}, ${count} physical matches at €1`);
    }
  }
});

test('Wild substitutes for paying symbols while Bonus, Bomb and unrevealed xWays do not', () => {
  const seven = place(board(), 'doner', CELLS.slice(0, 7));
  seven[1][2] = 'wild';
  const result = evaluateScatterPays(seven, numbers(), 100);
  assert.deepEqual(result.wins.map(win => [win.symbol, win.count]), [['doner', 8]]);
  for (const special of ['scatter', 'bomb', 'xways', 'infectious', 'shot'] as SymbolId[]) {
    const candidate = structuredClone(seven); candidate[1][2] = special;
    assert.equal(evaluateScatterPays(candidate, numbers(), 100).payoutCents, 0);
  }
  assert.equal(countScatters(seven), 22);
});

test('rounding happens once for aggregate money and the cap pays only its remainder', () => {
  assert.equal(roundHalfUp(5n, 10n), 1);
  assert.equal(roundHalfUp(4n, 10n), 0);
  assert.equal(settledPayout(1000, 599_999, 600_000), 1);
  assert.equal(settledPayout(1000, 600_000, 600_000), 0);
  assert.throws(() => settledPayout(-1, 0, 100), /INVALID_MONEY/);
  assert.match(formatMoney(12345, 'bg'), /€/);
  assert.match(formatMoney(12345, 'en'), /€/);
});

test('two half-cent win contributions round together and their displayed allocations sum exactly', () => {
  const grid = place(place(board(), 'book', CELLS.slice(0, 8)), 'coffee', CELLS.slice(8, 16));
  const result = evaluateScatterPays(grid, numbers(), 5);
  assert.equal(result.payoutCents, 1, 'two 0.5-cent contributions total one cent instead of rounding separately to two cents');
  assert.equal(result.wins.reduce((sum, win) => sum + win.payoutCents, 0), result.payoutCents);
});

test('a clipped cascade allocates only the remaining cent across its displayed winning symbols', () => {
  const grid = place(place(board(), 'book', CELLS.slice(0, 10)), 'coffee', CELLS.slice(10, 20));
  const result = resolveCascades(grid, numbers(64), 100, new SeededRandom(532), { remainingCapCents: 1 });
  assert.equal(result.payoutCents, 1);
  assert.equal(result.maxWin, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].wins.reduce((sum, win) => sum + win.payoutCents, 0), 1);
});

test('a paid cascade removes every winner, doubles only those cell multipliers, and refills to 6×5', () => {
  const grid = place(board(), 'book', CELLS.slice(20, 28)), multipliers = numbers();
  const snapshot = structuredClone({ grid, multipliers });
  const result = resolveCascades(grid, multipliers, 100, new SeededRandom(410));
  const first = result.steps[0];
  assert.equal(first.wins[0].count, 8);
  assert.equal(first.removed.length, 8);
  for (const cell of CELLS) {
    const winning = cell.reel >= 4 && (cell.reel === 4 || cell.row < 3);
    assert.equal(first.positionMultipliersAfter[cell.reel][cell.row], winning ? 2 : 1);
  }
  assert.equal(result.finalGrid.length, 6);
  assert.ok(result.finalGrid.every(column => column.length === 5));
  assert.deepEqual({ grid, multipliers }, snapshot, 'pure mechanics must not mutate their input board');
  assert.ok(result.steps.every(step => step.wins.every(win => win.count >= 8)));
});

test('a non-winning board consumes no refills and is never changed into a forced win', () => {
  const grid = CELLS.reduce((grid, cell, i) => place(grid, PAYING_SYMBOLS[i % PAYING_SYMBOLS.length], [cell]), board());
  const random = new SeededRandom(573), beforeState = random.state;
  const result = resolveCascades(grid, numbers(), 100, random);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].wins.length, 0);
  assert.equal(result.steps[0].removed.length, 0);
  assert.equal(result.steps[0].refilledGrid, undefined);
  assert.deepEqual(result.finalGrid, grid);
  assert.equal(result.payoutCents, 0);
  assert.equal(random.state, beforeState);
});

test('a collapse replaces vacancies only, keeps survivors in order, and leaves position multipliers at fixed coordinates', () => {
  const grid: Grid = Array.from({ length: 6 }, () => [...PAYING_SYMBOLS.slice(0, 5)]), multipliers = numbers();
  grid[2][2] = 'bomb'; multipliers[0][0] = 64; multipliers[5][4] = 1024; multipliers[1][1] = 16;
  const result = resolveCascades(grid, multipliers, 100, new SeededRandom(754));
  const first = result.steps[0]; assert.ok(first.refilledGrid);
  for (let reel = 0; reel < 6; reel++) {
    const removedRows = new Set(first.removed.filter(cell => cell.reel === reel).map(cell => cell.row));
    const survivors = grid[reel].filter((_symbol, row) => !removedRows.has(row));
    assert.deepEqual(first.refilledGrid[reel].slice(removedRows.size), survivors);
    assert.equal(first.refilledGrid[reel].length, survivors.length + removedRows.size);
    if (!removedRows.size) assert.deepEqual(first.refilledGrid[reel], grid[reel]);
  }
  assert.equal(first.positionMultipliersAfter[0][0], 64);
  assert.equal(first.positionMultipliersAfter[5][4], 1024);
  assert.equal(first.positionMultipliersAfter[1][1], 32);
  if (result.steps[1]) assert.deepEqual(result.steps[1].positionMultipliers, first.positionMultipliersAfter);
});

test('Wild is one physical substitute and never awards an extra shot', () => {
  const grid = place(board(), 'book', CELLS.slice(0, 7)); grid[5][4] = 'wild';
  const result = resolveCascades(grid, numbers(), 100, new SeededRandom(493), { tier: 'dorm' });
  const first = result.steps[0];
  assert.equal(first.wins.length, 1);
  assert.equal(first.wins[0].count, 8);
  assert.equal(first.wins[0].cells.filter(cell => grid[cell.reel][cell.row] === 'wild').length, 1);
  assert.equal(first.shotsAdded, 0);
  assert.ok(!first.modifiers.some(modifier => modifier.kind === 'shot'));
});

test('xWays sources reveal a common symbol and multiply their own positions by 2/4/8', () => {
  const grid = board(); grid[0][0] = 'xways'; grid[5][4] = 'xways';
  const result = resolveCascades(grid, numbers(), 100, new SeededRandom(917));
  const first = result.steps[0], events = first.modifiers.filter(event => event.kind === 'xways');
  assert.equal(events.length, 2);
  assert.equal(new Set(events.map(event => event.symbol)).size, 1);
  for (const event of events) {
    assert.ok([2, 4, 8].includes(event.factor));
    assert.equal(first.resolvedGrid[event.source.reel][event.source.row], event.symbol);
    assert.equal(first.resolvedPositionMultipliers[event.source.reel][event.source.row], event.factor);
    assert.equal(first.resolvedSymbolSizes[event.source.reel][event.source.row], 1, 'the payable unit remains one physical position');
  }
  assert.equal(first.wins.length, 0, 'two large xWays icons do not turn two physical positions into an eight-cell win');
});

test('sequential Infectious ×2 sources boost prior revealed sources and regular matches, but not future badges', () => {
  class TwoRandom extends SeededRandom {
    override next(): number { super.next(); return 0; }
    override integer(_max: number): number { this.next(); return 0; }
  }
  const grid = board(); grid[0][0] = 'infectious'; grid[1][0] = 'infectious'; grid[5][4] = 'book';
  const first = resolveCascades(grid, numbers(), 100, new TwoRandom(938)).steps[0];
  const events = first.modifiers.filter(event => event.kind === 'infectious');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.factor), [2, 2]);
  assert.deepEqual(events[0].targets, [{ reel: 0, row: 0 }, { reel: 5, row: 4 }]);
  assert.equal(events[0].gridAfter![1][0], 'infectious', 'the second source is still an unrevealed badge during the first infection');
  assert.equal(events[0].positionMultipliersAfter![1][0], 1);
  assert.deepEqual(events[1].targets, [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 5, row: 4 }]);
  assert.equal(first.resolvedPositionMultipliers[0][0], 4, 'official two-source example: source one receives both ×2 effects');
  assert.equal(first.resolvedPositionMultipliers[1][0], 2, 'official two-source example: source two receives its own ×2 effect');
  assert.equal(first.resolvedPositionMultipliers[5][4], 4, 'ordinary matching symbols on the last reel receive both effects');
  assert.equal(first.resolvedSymbolSizes.flat().reduce((total, size) => total + size, 0), 30);
  assert.equal(first.wins.length, 0, 'three physical symbols never become twelve payable symbols');
});

test('a later xWays badge reveals the common symbol without receiving an earlier infection', () => {
  class TwoRandom extends SeededRandom {
    override next(): number { super.next(); return 0; }
    override integer(_max: number): number { this.next(); return 0; }
  }
  const grid = board(); grid[0][0] = 'infectious'; grid[1][0] = 'xways'; grid[5][4] = 'book';
  const first = resolveCascades(grid, numbers(), 100, new TwoRandom(939)).steps[0];
  assert.deepEqual(first.modifiers.map(event => event.kind), ['infectious', 'xways']);
  assert.deepEqual(first.modifiers[0].targets, [{ reel: 0, row: 0 }, { reel: 5, row: 4 }]);
  assert.deepEqual(first.modifiers[1].targets, [{ reel: 1, row: 0 }]);
  assert.equal(first.resolvedGrid[0][0], first.resolvedGrid[1][0]);
  assert.equal(first.resolvedPositionMultipliers[0][0], 2);
  assert.equal(first.resolvedPositionMultipliers[1][0], 2);
  assert.equal(first.resolvedPositionMultipliers[5][4], 2);
});

test('a Bomb clears regular symbols in its square before collapse and leaves Wild/Bonus untouched', () => {
  const grid = CELLS.reduce((grid, cell, i) => place(grid, PAYING_SYMBOLS[i % 8], [cell]), board());
  grid[2][2] = 'bomb'; grid[1][1] = 'wild'; grid[3][3] = 'scatter';
  const result = resolveCascades(grid, numbers(), 100, new SeededRandom(257));
  const first = result.steps[0], bomb = first.modifiers.find(event => event.kind === 'bomb');
  assert.ok(bomb);
  assert.equal(bomb.radius, 1);
  assert.ok(bomb.targets.every(cell => Math.abs(cell.reel - 2) <= 1 && Math.abs(cell.row - 2) <= 1));
  assert.ok(!bomb.targets.some(cell => cell.reel === 1 && cell.row === 1));
  assert.ok(!bomb.targets.some(cell => cell.reel === 3 && cell.row === 3));
  assert.equal(bomb.targets.length, 6);
  for (const cell of bomb.targets) assert.equal(first.positionMultipliersAfter[cell.reel][cell.row], 2);
  assert.equal(first.positionMultipliersAfter[2][2], 2, 'the Bomb also doubles its own source position before falling out');
  assert.equal(first.resolvedGrid[1][1], 'wild');
  assert.equal(first.resolvedGrid[3][3], 'scatter');
  assert.ok(first.refilledGrid, 'a Bomb removal must be followed by a collapse');
});

test('a Bomb doubles its own Day 1024 position as shown in official footage and saturates at 8192', () => {
  const grid = board(); grid[2][2] = 'bomb'; grid[1][1] = 'wild';
  const first = resolveCascades(grid, numbers(1024), 100, new SeededRandom(258)).steps[0];
  assert.equal(first.positionMultipliersAfter[2][2], 2048);
  assert.equal(first.positionMultipliersAfter[1][1], 1024, 'Wild neighbors stay protected');
  assert.equal(first.positionMultipliersAfter[3][3], 1024, 'Bonus neighbors stay protected');
  const capped = resolveCascades(grid, numbers(8192), 100, new SeededRandom(258)).steps[0];
  assert.equal(capped.positionMultipliersAfter[2][2], 8192);
});

test('the upgraded Bomb reaches a 5×5 square, with identical Wild/Bonus protection', () => {
  const grid = CELLS.reduce((grid, cell, i) => place(grid, PAYING_SYMBOLS[i % 8], [cell]), board());
  grid[2][2] = 'bomb'; grid[0][0] = 'wild'; grid[4][4] = 'scatter';
  const result = resolveCascades(grid, numbers(), 100, new SeededRandom(257), { tier: 'december', upgrades: ['bomb'] });
  const bomb = result.steps[0].modifiers.find(event => event.kind === 'bomb');
  assert.ok(bomb);
  assert.equal(bomb.radius, 2);
  assert.ok(bomb.targets.some(cell => cell.reel === 0 && cell.row === 4));
  assert.ok(bomb.targets.every(cell => cell.reel <= 4));
  assert.ok(!bomb.targets.some(cell => cell.reel === 0 && cell.row === 0));
  assert.ok(!bomb.targets.some(cell => cell.reel === 4 && cell.row === 4));
});

test('wins pay before Bomb effects and a winning position is never doubled twice by the same explosion', () => {
  const grid = place(board(), 'book', CELLS.slice(0, 8)); grid[1][3] = 'bomb';
  const result = resolveCascades(grid, numbers(), 100, new SeededRandom(457));
  const first = result.steps[0], bomb = first.modifiers.find(event => event.kind === 'bomb');
  assert.equal(first.wins[0].positionMultiplier, 1);
  assert.ok(bomb);
  assert.ok(bomb.targets.every(cell => !first.wins[0].cells.some(winning => winning.reel === cell.reel && winning.row === cell.row)));
  for (const cell of first.wins[0].cells) assert.equal(first.positionMultipliersAfter[cell.reel][cell.row], 2);
});

test('winning a previously boosted position doubles again up to 8192 instead of resetting', () => {
  const grid = place(board(), 'coffee', CELLS.slice(0, 8)), multipliers = numbers();
  multipliers[0][0] = 4; multipliers[0][1] = 8192;
  const result = resolveCascades(grid, multipliers, 100, new SeededRandom(939));
  assert.equal(result.steps[0].positionMultipliersAfter[0][0], 8);
  assert.equal(result.steps[0].positionMultipliersAfter[0][1], 8192);
  assert.ok(result.positionMultipliers.every(column => column.every(value => value <= 8192)));
});

test('shots add one spin, or two with the shots upgrade, when they land in a bonus', () => {
  for (const [upgrades, award] of [[[], 1], [['shots'], 2]] as [BonusUpgrade[], number][]) {
    const grid = board(); grid[5][4] = 'shot';
    const result = resolveCascades(grid, numbers(), 100, new SeededRandom(29), { tier: 'dorm', upgrades });
    assert.equal(result.steps[0].shotsAdded, award);
    assert.equal(result.steps[0].modifiers.find(event => event.kind === 'shot')?.shotsAdded, award);
  }
});

test('all mode and bonus prices use the original base bet without stacking purchases', () => {
  assert.deepEqual(MODES.map(mode => roundPriceCents(20, { kind: 'mode', mode })), [20, 40, 56, 1800, 60000]);
  assert.deepEqual(TIERS.map(bonus => roundPriceCents(20, { kind: 'buy', bonus })), [1400, 4000, 12000]);
  assert.equal(roundPriceCents(20, { kind: 'lucky' }), 4700);
  for (const bet of CONFIG.betsCents) assert.ok(Number.isInteger(roundPriceCents(bet, { kind: 'mode', mode: 'frames' })));
});

test('Day 2, 64 and 1024 initialize every position while Standard/xBet begin at 1', () => {
  for (const [mode, value] of [['standard', 1], ['hunt', 1], ['frames', 2], ['wild', 64], ['god', 1024]] as [Mode, number][]) {
    const started = startRound(createSession(519), { kind: 'mode', mode });
    const view = started.presentation!;
    assert.deepEqual(view.initialPositionMultipliers, numbers(value));
    assert.equal(view.kind, 'spin', 'Day 1024 uses the same cascade engine, not an unrelated binary VIP lottery');
    if (mode === 'hunt') assert.ok(view.initialGrid[1].includes('scatter'), 'xBet guarantees a Bonus on the second reel');
  }
});

test('one debit and committed outcome occur atomically before presentation, without mutating input', () => {
  const choices: RoundChoice[] = [...MODES.map(mode => ({ kind: 'mode' as const, mode })), ...TIERS.map(bonus => ({ kind: 'buy' as const, bonus })), { kind: 'lucky' }];
  for (const choice of choices) {
    const initial = createSession(1947), snapshot = structuredClone(initial);
    const started = startRound(initial, choice), view = started.presentation!;
    assert.deepEqual(initial, snapshot);
    assert.equal(view.roundCostCents, roundPriceCents(initial.betCents, choice));
    assert.equal(started.balanceCents, initial.balanceCents - view.roundCostCents + view.payoutCents);
    assert.equal(started.roundSequence, 1);
    const completed = finishRound(started);
    assert.equal(completed.history.length, 1);
    const round = completed.history[0];
    assert.equal(completed.balanceCents, initial.balanceCents - round.costCents + round.payoutCents);
    assert.equal(round.costCents, view.roundCostCents);
    assert.equal(round.betCents, initial.betCents);
  }
});

test('Lucky Draw uses exact 50/25/25 tier boundaries, one 235× debit and distinct tier upgrades', () => {
  for (const [draw, tier, count] of [[0, 'dorm', 1], [.499999, 'dorm', 1], [.5, 'friday', 2], [.749999, 'friday', 2], [.75, 'december', 3], [.999999, 'december', 3]] as [number, BonusTier, number][]) {
    class DrawRandom extends SeededRandom {
      used = false;
      override next(): number { const normal = super.next(); if (!this.used) { this.used = true; return draw; } return normal; }
    }
    const initial = setMode(selectBet(createSession(649), 100), 'god');
    const started = startRound(initial, { kind: 'lucky' }, seed => new DrawRandom(seed)), view = started.presentation!;
    assert.equal(view.tier, tier);
    assert.equal(view.intro, true);
    assert.equal(view.upgrades.length, count);
    assert.equal(new Set(view.upgrades).size, count);
    assert.deepEqual(view.choice, { kind: 'lucky' });
    assert.equal(view.roundCostCents, 23500);
    assert.equal(started.balanceCents, initial.balanceCents - 23500 + view.payoutCents);
    const storage = new MemoryStorage(); saveSession(started, storage);
    const completed = finishRound(loadSession(storage));
    assert.equal(completed.history[0].costCents, 23500);
    assert.deepEqual(completed.history[0].choice, { kind: 'lucky' });
    assert.equal(completed.balanceCents, initial.balanceCents - 23500 + completed.history[0].payoutCents);
  }
});

test('an Extra Spin offer quotes the disclosed original formula and never costs more than the previous win', () => {
  assert.equal(quoteExtraSpinCostCents(20, numbers()), 20);
  assert.equal(quoteExtraSpinCostCents(20, numbers(2)), 43);
  const boosted = numbers(); boosted[0][0] = 64; boosted[5][4] = 2;
  assert.equal(quoteExtraSpinCostCents(20, boosted), 48);
  // The 30 marked ×2 positions total 60; neutral positions never enter the sum.
  // Every offered stake must quote a whole-cent debit, rounded upward, with a
  // one-base-bet floor. These amounts also exercise the non-integral quotes.
  const expectedQuotedCents = [22, 43, 86, 129, 215, 429, 1072, 2143, 4286];
  for (const [index, bet] of CONFIG.betsCents.entries()) {
    assert.equal(quoteExtraSpinCostCents(bet, numbers()), bet);
    assert.equal(quoteExtraSpinCostCents(bet, numbers(2)), expectedQuotedCents[index]);
  }
  const source = extraFixture(), offer = source.extraSpinOffer!;
  assert.equal(offer.sourceRoundId, source.history[0].id);
  assert.ok(offer.costCents <= source.history[0].payoutCents);
  assert.equal(offer.costCents, quoteExtraSpinCostCents(offer.betCents, offer.positionMultipliers));
  assert.equal(roundPriceCents(offer.betCents, { kind: 'extra' }, offer.costCents), offer.costCents);
  assert.throws(() => roundPriceCents(20, { kind: 'extra' }), /EXTRA_SPIN_OFFER_REQUIRED/);
  const storage = new MemoryStorage(); saveSession(source, storage);
  assert.deepEqual(loadSession(storage).extraSpinOffer, offer);
});

test('an accepted Extra Spin retains multipliers and the locked bet, pays one quote, and never lands Bonus symbols', () => {
  const source = extraFixture(), offer = structuredClone(source.extraSpinOffer!), snapshot = structuredClone(source);
  const started = startRound(source, { kind: 'extra' }), view = started.presentation!;
  assert.deepEqual(source, snapshot);
  assert.deepEqual(view.initialPositionMultipliers, offer.positionMultipliers);
  assert.equal(view.lockedBetCents, offer.betCents);
  assert.equal(view.roundCostCents, offer.costCents);
  assert.equal(started.balanceCents, source.balanceCents - offer.costCents + view.payoutCents);
  assert.equal(view.bonusAwarded, null);
  assert.equal(started.activeRound, null);
  for (const step of view.cascadeSteps) {
    assert.ok(step.grid.every(column => !column.includes('scatter')));
    assert.ok(step.resolvedGrid.every(column => !column.includes('scatter')));
    if (step.refilledGrid) assert.ok(step.refilledGrid.every(column => !column.includes('scatter')));
  }
  const storage = new MemoryStorage(); saveSession(started, storage);
  const loaded = loadSession(storage);
  assert.deepEqual(loaded, started);
  const completed = dismissPresentation(loaded);
  assert.equal(completed.balanceCents, started.balanceCents);
  assert.equal(completed.rngState, started.rngState);
  assert.deepEqual(completed.history[0].choice, { kind: 'extra' });
  assert.equal(completed.history[0].costCents, offer.costCents);
  assert.deepEqual(completed.history[0].extraInitialMultipliers, offer.positionMultipliers);
  assert.equal(completed.history[0].sourceRoundId, offer.sourceRoundId);
  assert.equal(completed.history[0].capOffsetCents, offer.alreadyPaidCents);
  if (completed.extraSpinOffer) {
    assert.equal(completed.extraSpinOffer.sourceRoundId, offer.sourceRoundId, 'every Extra Spin in a chain retains its original source round');
    assert.equal(completed.extraSpinOffer.alreadyPaidCents, offer.alreadyPaidCents + completed.history[0].payoutCents);
  }
});

test('an Extra Spin chain shares the original 30,000× cap rather than resetting it on purchase', () => {
  const source = extraFixture(), offer = source.extraSpinOffer!;
  const remaining = source.betCents * CONFIG.capMultiplier - 1;
  source.history[0].payoutCents = remaining;
  source.extraSpinOffer = { ...offer, alreadyPaidCents: remaining };
  const storage = new MemoryStorage(); saveSession(source, storage);
  class WinningRandom extends SeededRandom {
    override next(): number { super.next(); return .5; }
  }
  const started = startRound(loadSession(storage), { kind: 'extra' }, seed => new WinningRandom(seed));
  const view = started.presentation!;
  assert.equal(view.payoutCents, 1);
  assert.equal(view.capOffsetCents, remaining);
  assert.equal(view.roundTotalCents, 1, 'this receipt shows the current purchase payout');
  assert.equal(view.chainTotalCents, source.betCents * CONFIG.capMultiplier, 'the cap also includes all previous chain payouts');
  assert.equal(view.maxWin, true);
  assert.equal(started.balanceCents, source.balanceCents - offer.costCents + 1);
  assert.equal(started.activeRound, null);
  assert.equal(started.extraSpinOffer, null);
  assert.equal(started.history[0].sourceRoundId, offer.sourceRoundId);
  assert.equal(started.history[0].payoutCents + started.history[0].capOffsetCents!, source.betCents * CONFIG.capMultiplier);
  saveSession(started, storage);
  const finished = dismissPresentation(loadSession(storage));
  assert.equal(finished.balanceCents, started.balanceCents);
  assert.throws(() => startRound(finished, { kind: 'extra' }), /NO_EXTRA_SPIN_OFFER/);
});

test('a final non-winning bonus spin closes once, keeps its upgrades and pays no additional debit', () => {
  const fixture = purchasedFixture('friday');
  const round = fixture.activeRound!;
  round.spinIndex = CONFIG.bonuses.friday.spins - 1 + round.shotsAwarded;
  round.spinsRemaining = 1;
  const [before, after] = findTransition(fixture, next => next.presentation!.payoutCents === 0 && next.presentation!.shotsAdded === 0);
  assert.equal(after.activeRound, null);
  assert.equal(after.presentation!.roundComplete, true);
  assert.equal(after.presentation!.maxWin, false);
  assert.ok(after.presentation!.events.includes('bonus-end'));
  assert.deepEqual(after.presentation!.upgrades, before.activeRound!.upgrades);
  assert.equal(after.balanceCents, before.balanceCents);
  assert.equal(after.history.length, 1);
  assert.equal(after.history[0].payoutCents, before.activeRound!.payoutCents);
  const storage = new MemoryStorage(); saveSession(after, storage);
  const finished = dismissPresentation(loadSession(storage));
  assert.equal(finished.balanceCents, after.balanceCents);
  assert.equal(finished.history.length, 1);
  assert.deepEqual(dismissPresentation(finished), finished);
});

test('Extra Spin requires an affordable live offer, and changing mode or bet invalidates that offer', () => {
  assert.throws(() => startRound(createSession(51), { kind: 'extra' }), /NO_EXTRA_SPIN_OFFER/);
  const source = extraFixture(), snapshot = structuredClone(source);
  const poor = { ...source, balanceCents: source.extraSpinOffer!.costCents - 1 };
  assert.throws(() => startRound(poor, { kind: 'extra' }), /INSUFFICIENT_BALANCE/);
  assert.deepEqual(source, snapshot);
  assert.equal(selectBet(source, 100).extraSpinOffer, null);
  assert.equal(setMode(source, 'god').extraSpinOffer, null);
  assert.deepEqual(refillDemo(source).extraSpinOffer, source.extraSpinOffer);
  assert.throws(() => startRound(setMode(source, 'hunt'), { kind: 'extra' }), /NO_EXTRA_SPIN_OFFER/);
});

test('bonus tier descriptions are minimum distinct upgrades, with no fixed Wild count', () => {
  const observed = new Map<BonusTier, Set<string>>(), wildCounts = new Set<number>();
  for (const [tier, spins, minimum] of [['dorm', 7, 1], ['friday', 8, 2], ['december', 10, 3]] as [BonusTier, number, number][]) {
    assert.equal(CONFIG.bonuses[tier].spins, spins);
    const combinations = new Set<string>(); observed.set(tier, combinations);
    for (let index = 1; index <= 40; index++) {
      const seed = Math.imul(index, 0x9e3779b9) >>> 0;
      const started = startRound(createSession(seed), { kind: 'buy', bonus: tier }), view = started.presentation!;
      assert.equal(view.upgrades.length, minimum);
      assert.equal(new Set(view.upgrades).size, minimum);
      assert.ok(view.upgrades.every(upgrade => ['infectious', 'bomb', 'shots'].includes(upgrade)));
      combinations.add(view.upgrades.slice().sort().join('+'));
      wildCounts.add(view.initialGrid.flat().filter(symbol => symbol === 'wild' || symbol === 'shot').length);
      if (started.activeRound) assert.equal(started.activeRound.spinsRemaining, spins - 1 + view.shotsAdded);
    }
    assert.equal(combinations.size, tier === 'december' ? 1 : 3, 'low tiers randomly choose their distinct upgrades');
  }
  assert.ok(wildCounts.size > 1, 'bonus symbol/Wild occurrences must vary rather than use a fixed guaranteed amount');
});

test('three, four, five or six Bonus symbols trigger 7/8/10 spins and 1/2/3 upgrades after cascades', () => {
  for (const [count, tier, spins, upgrades] of [[3, 'dorm', 7, 1], [4, 'friday', 8, 2], [5, 'december', 10, 3], [6, 'december', 10, 3]] as [number, BonusTier, number, number][]) {
    class TriggerRandom extends SeededRandom {
      scatterChecks = 0;
      override chance(_probability: number): boolean { this.next(); return this.scatterChecks++ < count; }
      override integer(max: number): number { this.next(); return 0 % max; }
    }
    const initial = createSession(63819), started = startRound(initial, { kind: 'mode', mode: 'standard' }, seed => new TriggerRandom(seed));
    assert.equal(started.presentation!.scatters, count);
    assert.equal(started.presentation!.bonusAwarded, tier);
    assert.equal(started.activeRound!.tier, tier);
    assert.equal(started.activeRound!.spinsRemaining, spins);
    assert.equal(started.activeRound!.upgrades.length, upgrades);
    assert.equal(started.presentation!.roundCostCents, initial.betCents, 'a natural bonus never incurs a second debit');
    assert.deepEqual(started.activeRound!.positionMultipliers, started.presentation!.finalPositionMultipliers, 'triggering cascades carry their position progress into the feature');
  }
});

test('five Bonus symbols award all upgrades for future spins without upgrading the triggering Bomb retroactively', () => {
  class TriggerWithBombRandom extends SeededRandom {
    initialDraws: number[] = CELLS.flatMap((_cell, index) => index === 12
      ? [CONFIG.modes.standard.wildProbability + CONFIG.modes.standard.xwaysProbability + CONFIG.modes.standard.bombProbability / 2]
      : [.5, (index % PAYING_SYMBOLS.length + .5) / PAYING_SYMBOLS.length]);
    scatterChecks = 0;
    override next(): number { const normal = super.next(); return this.initialDraws.shift() ?? normal; }
    override chance(probability: number): boolean {
      if (this.scatterChecks < CONFIG.reels) { this.next(); return this.scatterChecks++ < 5; }
      return super.chance(probability);
    }
    override integer(max: number): number { this.next(); return 0 % max; }
  }
  const started = startRound(createSession(838), { kind: 'mode', mode: 'standard' }, seed => new TriggerWithBombRandom(seed));
  const view = started.presentation!;
  assert.equal(view.initialGrid[2][2], 'bomb');
  assert.equal(view.bonusAwarded, 'december');
  assert.deepEqual(view.upgrades.slice().sort(), ['bomb', 'infectious', 'shots']);
  const triggeringBomb = view.cascadeSteps[0].modifiers.find(event => event.kind === 'bomb')!;
  assert.ok(triggeringBomb);
  assert.equal(triggeringBomb.radius, 1, 'the upgrade awarded after cascades does not turn the earlier 3×3 Bomb into a 5×5 Bomb');
  assert.ok(view.cascadeSteps.flatMap(step => step.modifiers).filter(event => event.kind === 'bomb').every(event => event.radius === 1));
  const bonus = advanceRound(dismissPresentation(started));
  assert.equal(bonus.presentation!.tier, 'december');
  assert.deepEqual(bonus.presentation!.upgrades.slice().sort(), ['bomb', 'infectious', 'shots']);
});

test('bonus position multipliers persist into the next spin, but a fresh paid round resets them', () => {
  const fixture = purchasedFixture('friday'), expected = structuredClone(fixture.activeRound!.positionMultipliers);
  const next = advanceRound(fixture);
  assert.deepEqual(next.presentation!.initialPositionMultipliers, expected);
  const complete = finishRound(next), newPaid = startRound(complete, { kind: 'mode', mode: 'standard' });
  assert.deepEqual(newPaid.presentation!.initialPositionMultipliers, numbers());
});

test('shot additions increase remaining spins without charging again or changing tier/upgrades', () => {
  const fixture = purchasedFixture('friday');
  const [before, after] = findTransition(fixture, next => next.presentation!.shotsAdded > 0 && !next.presentation!.maxWin);
  assert.ok(after.activeRound);
  assert.equal(after.activeRound.spinsRemaining, before.activeRound!.spinsRemaining - 1 + after.presentation!.shotsAdded);
  assert.deepEqual(after.activeRound.upgrades, before.activeRound!.upgrades);
  assert.equal(after.activeRound.tier, before.activeRound!.tier);
  assert.equal(after.balanceCents - before.balanceCents, after.presentation!.payoutCents);
});

test('overlapping rounds, purchases, bet/mode/refill changes and premature advancement fail safely', () => {
  const started = startRound(createSession(751), { kind: 'buy', bonus: 'dorm' }), snapshot = structuredClone(started);
  assert.throws(() => startRound(started), /ROUND_ACTIVE/);
  assert.throws(() => selectBet(started, 100), /ROUND_ACTIVE/);
  assert.throws(() => setMode(started, 'god'), /ROUND_ACTIVE/);
  assert.throws(() => refillDemo(started), /ROUND_ACTIVE/);
  assert.throws(() => advanceRound(started), /PRESENTATION_PENDING/);
  assert.deepEqual(started, snapshot);
  const complete = finishRound(started);
  assert.throws(() => advanceRound(complete), /NO_ACTIVE_ROUND/);
  assert.equal(refillDemo(complete).balanceCents, complete.balanceCents + CONFIG.refillCents);
});

test('unaffordable or invalid requests fail before touching cents, state or randomness', () => {
  const initial = createSession(511, 19), snapshot = structuredClone(initial);
  assert.throws(() => startRound(initial), /INSUFFICIENT_BALANCE/);
  assert.throws(() => selectBet(initial, 13), /INVALID_BET/);
  assert.throws(() => setMode(initial, 'constructor' as Mode), /INVALID_CHOICE/);
  assert.throws(() => startRound(initial, { kind: 'mode', mode: 'toString' as Mode }), /INVALID_CHOICE/);
  assert.deepEqual(initial, snapshot);
});

test('an almost-capped bonus credits one remaining cent, closes once and cannot duplicate payout', () => {
  const fixture = purchasedFixture('friday');
  fixture.activeRound!.payoutCents = fixture.activeRound!.capCents - 1;
  const [before, after] = findTransition(fixture, next => next.presentation!.payoutCents > 0);
  assert.equal(after.presentation!.payoutCents, 1);
  assert.equal(after.presentation!.wins.reduce((sum, win) => sum + win.payoutCents, 0), 1);
  assert.equal(after.balanceCents - before.balanceCents, 1);
  assert.equal(after.presentation!.roundTotalCents, before.betCents * 30_000);
  assert.equal(after.presentation!.maxWin, true);
  assert.equal(after.activeRound, null);
  assert.equal(after.history[0].payoutCents, before.betCents * 30_000);
  assert.equal(dismissPresentation(after).balanceCents, after.balanceCents);
});

test('every reload and acknowledgement reproduces the committed round without extra debit or RNG', () => {
  for (const choice of [{ kind: 'buy', bonus: 'friday' }, { kind: 'mode', mode: 'god' }] as RoundChoice[]) {
    const storage = new MemoryStorage(), initial = createSession(823);
    let current = commitSession(initial, startRound(initial, choice), storage);
    const direct = finishRound(current);
    let spins = 0;
    while (current.presentation || current.activeRound) {
      assert.ok(++spins < 1_000);
      const loaded = loadSession(storage); assert.deepEqual(loaded, current);
      const acknowledged = dismissPresentation(loaded);
      assert.equal(acknowledged.balanceCents, loaded.balanceCents);
      assert.equal(acknowledged.rngState, loaded.rngState);
      assert.deepEqual(dismissPresentation(acknowledged), acknowledged);
      const next = acknowledged.activeRound ? advanceRound(acknowledged) : acknowledged;
      current = commitSession(current, next, storage);
    }
    assert.deepEqual(current, direct);
    assert.equal(current.balanceCents, initial.balanceCents - current.history[0].costCents + current.history[0].payoutCents);
    assert.equal(current.history.length, 1);
  }
});

test('a failed storage write leaves both the previous save and live balance intact', () => {
  const storage = new MemoryStorage(), initial = createSession(831); saveSession(initial, storage);
  const candidate = startRound(initial, { kind: 'buy', bonus: 'dorm' });
  const failing: StorageLike = { getItem: key => storage.getItem(key), setItem: () => { throw new Error('QUOTA_EXCEEDED'); } };
  assert.throws(() => commitSession(initial, candidate, failing), /QUOTA_EXCEEDED/);
  assert.deepEqual(loadSession(storage), initial);
  assert.equal(initial.roundSequence, 0);
  assert.equal(initial.balanceCents, CONFIG.initialBalanceCents);
});

test('malformed saved cents, RNG, phase, round cap, upgrades or position multipliers cannot resume', () => {
  const storage = new MemoryStorage(), valid = purchasedFixture('friday');
  const corruptions: ((session: Session) => void)[] = [
    session => { session.balanceCents = -1; }, session => { session.balanceCents = .5; },
    session => { session.rngState = 0; }, session => { session.rngState = 0x1_0000_0000; },
    session => { session.roundSequence = -1; }, session => { session.selectedMode = 'constructor' as Mode; },
    session => { session.phase = 'idle'; }, session => { session.phase = 'presenting-bonus'; },
    session => { session.activeRound!.payoutCents = session.activeRound!.capCents + 1; },
    session => { session.activeRound!.capCents += 1; },
    session => { session.activeRound!.positionMultipliers[0][0] = 8193; },
    session => { session.activeRound!.positionMultipliers[0][0] = 1.5; },
    session => { session.activeRound!.positionMultipliers[0].pop(); },
    session => { session.activeRound!.upgrades = ['bomb', 'bomb']; },
    session => { session.activeRound!.upgrades = ['invented' as BonusUpgrade]; },
    session => { session.activeRound!.upgrades = ['bomb']; },
    session => { session.activeRound!.tier = 'constructor' as BonusTier; },
    session => { session.activeRound!.tier = 'dorm'; },
    session => { session.activeRound!.shotsAwarded += 1; },
    session => { session.activeRound!.spinsRemaining += 1; },
    session => { session.activeRound!.frames[0][0] = !session.activeRound!.frames[0][0]; },
    session => { session.activeRound!.energy = 3; },
    session => { session.activeRound!.capOffsetCents = 1; },
    session => { session.activeRound!.sourceRoundId = 'unrelated-source'; },
  ];
  for (const corrupt of corruptions) {
    const candidate = structuredClone(valid); corrupt(candidate);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    assert.throws(() => loadSession(storage), 'corrupt data must never resume or silently reset');
  }
  const mismatch = structuredClone(valid); mismatch.activeRound!.configVersion = 'unknown-math';
  storage.setItem(STORAGE_KEY, JSON.stringify(mismatch));
  assert.throws(() => loadSession(storage), /CONFIG_VERSION_MISMATCH/);
  assert.throws(() => advanceRound(mismatch), /CONFIG_VERSION_MISMATCH/);
  storage.setItem(STORAGE_KEY, '{invalid json'); assert.throws(() => loadSession(storage));
});

test('corrupt pending presentation money, boards, cell addresses and cascade totals are rejected', () => {
  const storage = new MemoryStorage(), valid = startRound(createSession(823), { kind: 'buy', bonus: 'friday' });
  const corruptions: ((view: SpinPresentation) => void)[] = [
    view => { view.payoutCents += 1; }, view => { view.roundTotalCents = view.lockedBetCents * 30_000 + 1; },
    view => { view.initialGrid[0].pop(); }, view => { view.initialGrid[0][0] = 'invented' as SymbolId; },
    view => { view.initialPositionMultipliers[0][0] = 3; },
    view => { view.cascadeSteps[0].payoutCents += 1; },
    view => { view.cascadeSteps[0].positionMultipliersAfter[0][0] = 0; },
    view => { view.tier = null; },
    view => { view.upgrades.pop(); },
    view => { view.bonusAwarded = 'dorm'; },
    view => { view.chainTotalCents += 1; },
    view => { view.effectiveSymbols = 31; },
  ];
  for (const corrupt of corruptions) {
    const candidate = structuredClone(valid); corrupt(candidate.presentation!);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    assert.throws(() => loadSession(storage));
  }
  saveSession(valid, storage); assert.deepEqual(loadSession(storage), valid);
});

test('saved modifier causes, snapshots, removed cells and collapse survivors must describe the actual spin', () => {
  const storage = new MemoryStorage();
  let valid: Session | undefined;
  for (let seed = 1; seed <= 2_000; seed++) {
    const candidate = startRound(createSession(seed), { kind: 'buy', bonus: 'december' });
    if (candidate.presentation!.cascadeSteps.some(step => step.refilledGrid && step.modifiers.some(event => event.kind === 'infectious' || event.kind === 'bomb'))) {
      valid = candidate; break;
    }
  }
  assert.ok(valid, 'the deterministic corpus must include a modifier followed by a collapse');
  saveSession(valid, storage); assert.deepEqual(loadSession(storage), valid);
  const corruptions: ((view: SpinPresentation) => void)[] = [
    view => {
      const step = view.cascadeSteps.find(step => step.modifiers.length)!;
      step.modifiers[0].source = { reel: 6, row: 0 };
    },
    view => {
      const step = view.cascadeSteps.find(step => step.modifiers.some(event => event.kind === 'infectious' || event.kind === 'bomb'))!;
      const modifier = step.modifiers.find(event => event.kind === 'infectious' || event.kind === 'bomb')!;
      modifier.targets = [];
    },
    view => {
      const step = view.cascadeSteps.find(step => step.modifiers.length)!;
      const modifier = step.modifiers[0];
      modifier.gridAfter![modifier.source.reel][modifier.source.row] = 'scatter';
    },
    view => {
      const step = view.cascadeSteps.find(step => step.modifiers.length)!;
      const modifier = step.modifiers[0];
      const before = modifier.positionMultipliersAfter![0][0];
      modifier.positionMultipliersAfter![0][0] = before === 1 ? 2 : 1;
    },
    view => {
      const step = view.cascadeSteps.find(step => step.removed.length)!;
      step.removed.pop();
    },
    view => {
      const step = view.cascadeSteps.find(step => step.refilledGrid)!;
      for (let reel = 0; reel < CONFIG.reels; reel++) {
        const incoming = step.removed.filter(cell => cell.reel === reel).length;
        if (incoming < CONFIG.rows) {
          const current = step.refilledGrid![reel][incoming];
          step.refilledGrid![reel][incoming] = current === 'book' ? 'coffee' : 'book';
          return;
        }
      }
      assert.fail('fixture must retain at least one surviving symbol');
    },
    view => {
      const step = view.cascadeSteps.find(step => step.refilledGrid)!;
      step.refilledGrid = undefined;
    },
  ];
  for (const corrupt of corruptions) {
    const candidate = structuredClone(valid); corrupt(candidate.presentation!);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    assert.throws(() => loadSession(storage), 'presentation corruption must never resume an altered feature');
  }
});

test('saved Extra Spin offers and receipts cannot reset their source or discard already credited cap progress', () => {
  const source = extraFixture(), storage = new MemoryStorage();
  for (const corrupt of [
    (session: Session) => { session.extraSpinOffer!.sourceRoundId = 'unrelated-source'; },
    (session: Session) => { session.extraSpinOffer!.alreadyPaidCents -= 1; },
    (session: Session) => { session.extraSpinOffer!.costCents += 1; },
    (session: Session) => { session.history[0].capOffsetCents = 1; },
  ]) {
    const candidate = structuredClone(source); corrupt(candidate);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate)); assert.throws(() => loadSession(storage));
  }
  const started = startRound(source, { kind: 'extra' });
  saveSession(started, storage); assert.deepEqual(loadSession(storage), started);
  for (const corrupt of [
    (session: Session) => { session.history[0].sourceRoundId = session.history[0].id; },
    (session: Session) => { session.history[0].spins = 2; },
    (session: Session) => { session.history[0].capOffsetCents = 0; session.presentation!.capOffsetCents = 0; session.presentation!.chainTotalCents = session.presentation!.roundTotalCents; },
  ]) {
    const candidate = structuredClone(started); corrupt(candidate);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate)); assert.throws(() => loadSession(storage));
  }
});

test('completed bonus receipts retain the tier, distinct upgrades and exact awarded-shot spin count', () => {
  const complete = finishRound(startRound(createSession(833), { kind: 'buy', bonus: 'friday' }));
  const receipt = complete.history[0], storage = new MemoryStorage();
  assert.equal(receipt.bonusTier, 'friday');
  assert.equal(receipt.bonusUpgrades.length, 2);
  assert.equal(new Set(receipt.bonusUpgrades).size, 2);
  if (!receipt.maxWin) assert.equal(receipt.spins, CONFIG.bonuses.friday.spins + receipt.shotsAwarded);
  saveSession(complete, storage); assert.deepEqual(loadSession(storage), complete);
  for (const corrupt of [
    (session: Session) => { session.history[0].bonusTier = 'dorm'; },
    (session: Session) => { session.history[0].bonusUpgrades.pop(); },
    (session: Session) => { session.history[0].bonusUpgrades = ['bomb', 'bomb']; },
    (session: Session) => { session.history[0].shotsAwarded += 1; },
    (session: Session) => { session.history[0].spins = 1; },
    (session: Session) => { session.history[0].bonusTier = null; session.history[0].bonusUpgrades = []; session.history[0].shotsAwarded = 0; },
  ]) {
    const candidate = structuredClone(complete); corrupt(candidate);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate)); assert.throws(() => loadSession(storage));
  }
});

test('saved Extra Shot events cannot change their upgrade-dependent award or removal cause', () => {
  const storage = new MemoryStorage(); let valid: Session | undefined;
  for (let seed = 1; seed <= 1_000; seed++) {
    const candidate = startRound(createSession(seed), { kind: 'buy', bonus: 'december' });
    if (candidate.presentation!.shotsAdded > 0) { valid = candidate; break; }
  }
  assert.ok(valid, 'the deterministic corpus must land an upgraded Extra Shot');
  saveSession(valid, storage); assert.deepEqual(loadSession(storage), valid);
  for (const corrupt of [
    (view: SpinPresentation) => {
      const modifier = view.cascadeSteps.flatMap(step => step.modifiers).find(event => event.kind === 'shot')!;
      modifier.factor = 1; modifier.shotsAdded = 1;
    },
    (view: SpinPresentation) => {
      const modifier = view.cascadeSteps.flatMap(step => step.modifiers).find(event => event.kind === 'shot')!;
      modifier.targets = [];
    },
    (view: SpinPresentation) => {
      const step = view.cascadeSteps.find(step => step.modifiers.some(event => event.kind === 'shot'))!;
      const source = step.modifiers.find(event => event.kind === 'shot')!.source;
      step.removed = step.removed.filter(cell => cell.reel !== source.reel || cell.row !== source.row);
    },
  ]) {
    const candidate = structuredClone(valid); corrupt(candidate.presentation!);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate)); assert.throws(() => loadSession(storage));
  }
});

test('the previous mathematical model is archived untouched and never replayed or charged by v2', () => {
  const storage = new MemoryStorage();
  const oldPayload = JSON.stringify({ version: 1, balanceCents: 71923, activeRound: { configVersion: 'studentski-1', payoutCents: 321 }, presentation: { payoutCents: 321 } });
  storage.setItem(LEGACY_STORAGE_KEY, oldPayload);
  const current = loadSession(storage, 731);
  assert.equal(current.version, 2);
  assert.equal(current.balanceCents, CONFIG.initialBalanceCents);
  assert.equal(current.activeRound, null);
  assert.equal(current.presentation, null);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), oldPayload);
  saveSession(current, storage);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), oldPayload);
  assert.deepEqual(loadSession(storage), current);
});

test('outcomes depend on seed and paid choice rather than balance or presentation timing', () => {
  for (const choice of [{ kind: 'mode', mode: 'wild' }, { kind: 'buy', bonus: 'december' }] as RoundChoice[]) {
    const low = startRound(createSession(19283, 500_000), choice), high = startRound(createSession(19283, 5_000_000), choice);
    assert.deepEqual(low.presentation, high.presentation);
    assert.equal(low.rngState, high.rngState);
    const a = finishRound(low), b = finishRound(high);
    assert.deepEqual(a.history, b.history);
    assert.equal(a.rngState, b.rngState);
    assert.equal(b.balanceCents - a.balanceCents, 4_500_000);
  }
});

test('serializable seeded randomness advances reproducibly and zero seed retains entropy', () => {
  const first = new SeededRandom(7583), second = new SeededRandom(7583);
  const samples = Array.from({ length: 1_000 }, () => first.next());
  assert.deepEqual(samples, Array.from({ length: 1_000 }, () => second.next()));
  assert.ok(samples.every(value => value >= 0 && value < 1));
  assert.equal(first.state, second.state);
  const zero = new SeededRandom(0); assert.notEqual(zero.state, 0); assert.notEqual(zero.next(), zero.next());
});
