import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG, roundPriceCents } from '../src/engine/config';
import { countScatters, evaluateWays } from '../src/engine/evaluator';
import { formatMoney, roundHalfUp, settledPayout } from '../src/engine/accounting';
import { SeededRandom } from '../src/engine/rng';
import {
  advanceRound, createSession, dismissPresentation, refillDemo, selectBet, setMode, startRound,
} from '../src/engine/engine';
import { commitSession, loadSession, saveSession, STORAGE_KEY } from '../src/engine/persistence';
import type { BonusTier, Grid, Mode, RoundChoice, Session, StorageLike, SymbolId, WildState } from '../src/engine/types';

function emptyFrames(): boolean[][] {
  return Array.from({ length: 5 }, () => Array<boolean>(4).fill(false));
}

function grid(...reels: SymbolId[][]): Grid {
  assert.equal(reels.length, 5);
  assert.ok(reels.every(reel => reel.length === 4));
  return reels;
}

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function finishRound(session: Session, onSpin?: (before: Session, after: Session) => void): Session {
  let current = session;
  let remainingSteps = 40;
  while (current.presentation || current.activeRound) {
    if (current.presentation) {
      const acknowledged = dismissPresentation(current);
      assert.equal(acknowledged.balanceCents, current.balanceCents);
      assert.equal(acknowledged.rngState, current.rngState);
      current = acknowledged;
    }
    if (current.activeRound) {
      assert.ok(--remainingSteps > 0, 'a feature must terminate within its bounded spin count');
      const next = advanceRound(current);
      onSpin?.(current, next);
      current = next;
    }
  }
  return current;
}

function nextBonusFixture(tier: BonusTier, seed = 7): Session {
  const started = startRound(createSession(seed), { kind: 'buy', bonus: tier });
  const ready = dismissPresentation(started);
  assert.ok(ready.activeRound, `${tier} buy must retain free spins after its first outcome`);
  return ready;
}

function findTransition(session: Session, predicate: (next: Session) => boolean, limit = 20_000): [Session, Session] {
  for (let seed = 1; seed <= limit; seed++) {
    const candidate = { ...session, rngState: seed };
    const next = advanceRound(candidate);
    if (predicate(next)) return [candidate, next];
  }
  assert.fail(`no deterministic seed among ${limit} produced the requested feature transition`);
}

test('scatters count original cells and never become paying or substituting symbols', () => {
  const board = grid(
    ['scatter', 'scatter', 'vip', 'vip'],
    ['scatter', 'vip', 'vip', 'vip'],
    ['scatter', 'vip', 'vip', 'vip'],
    ['scatter', 'vip', 'vip', 'vip'],
    ['scatter', 'vip', 'vip', 'vip'],
  );
  assert.equal(countScatters(board), 6);
  const splitFrames = emptyFrames().map(reel => reel.map(() => true));
  assert.deepEqual(evaluateWays(board, splitFrames, [], 20), { wins: [], payoutCents: 0 });
});

test('ways require three consecutive reels from the left and pay only the longest run', () => {
  const board = grid(
    ['book', 'scatter', 'scatter', 'scatter'],
    ['book', 'scatter', 'scatter', 'scatter'],
    ['book', 'scatter', 'scatter', 'scatter'],
    ['book', 'scatter', 'scatter', 'scatter'],
    ['book', 'scatter', 'scatter', 'scatter'],
  );
  const result = evaluateWays(board, emptyFrames(), [], 20);
  assert.equal(result.payoutCents, Math.round(20 * CONFIG.paytable.book[2] / CONFIG.payoutDenominator));
  assert.equal(result.wins.length, 1);
  assert.equal(result.wins[0].symbol, 'book');
  assert.equal(result.wins[0].reels, 5);
  assert.equal(result.wins[0].weightedWays, 1);
  const missingFirst = structuredClone(board);
  missingFirst[0][0] = 'vip';
  assert.equal(evaluateWays(missingFirst, emptyFrames(), [], 20).payoutCents, 0);
  const interrupted = structuredClone(board);
  interrupted[2][0] = 'vip';
  assert.equal(evaluateWays(interrupted, emptyFrames(), [], 20).payoutCents, 0);
});

test('frames and Wild multipliers add on a reel, then multiply across reels', () => {
  const board = grid(
    ['book', 'book', 'wild', 'scatter'],
    ['wild', 'scatter', 'scatter', 'scatter'],
    ['book', 'book', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
  );
  const frames = emptyFrames();
  frames[0][0] = frames[0][1] = frames[1][0] = true;
  const wilds: WildState[] = [
    { id: 'first', reel: 0, multiplier: 3, steps: 2 },
    { id: 'second', reel: 1, multiplier: 2, steps: 1 },
  ];
  const result = evaluateWays(board, frames, wilds, 20);
  assert.equal(result.wins.length, 1);
  assert.equal(result.wins[0].weightedWays, 56); // (2 + 2 + 3) × (2 × 2) × 2.
  assert.equal(result.payoutCents, Math.round(20 * CONFIG.paytable.book[0] / CONFIG.payoutDenominator * 56));
  assert.equal(evaluateWays(board, frames, wilds, 20, 3).payoutCents,
    Math.round(20 * CONFIG.paytable.book[0] / CONFIG.payoutDenominator * 56 * 3));
});

test('two framed Wild reels substitute for each applicable paying symbol', () => {
  const board = grid(
    ['wild', 'scatter', 'scatter', 'scatter'],
    ['wild', 'scatter', 'scatter', 'scatter'],
    ['book', 'coffee', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
  );
  const frames = emptyFrames();
  frames[0][0] = frames[1][0] = true;
  const wilds: WildState[] = [
    { id: 'first', reel: 0, multiplier: 3, steps: 2 },
    { id: 'second', reel: 1, multiplier: 2, steps: 1 },
  ];
  const result = evaluateWays(board, frames, wilds, 20);
  assert.deepEqual(result.wins.map(win => [win.symbol, win.weightedWays]), [['book', 24], ['coffee', 24]]);
  assert.equal(result.payoutCents, Math.round(20 * 24 * (CONFIG.paytable.book[0] + CONFIG.paytable.coffee[0]) / CONFIG.payoutDenominator));
});

test('all-Wild reels pay every paying symbol rather than choosing one symbol', () => {
  const board = Array.from({ length: 5 }, () => Array<SymbolId>(4).fill('wild'));
  const result = evaluateWays(board, emptyFrames(), [], 20);
  assert.equal(result.wins.length, 8);
  assert.ok(result.wins.every(win => win.reels === 5 && win.weightedWays === 1024));
  assert.equal(result.payoutCents, Math.round(20 * 1024 * (4 * CONFIG.paytable.book[2] + 4 * CONFIG.paytable.female[2]) / CONFIG.payoutDenominator));
});

test('money rounds once over a spin and settles only the remaining round cap', () => {
  const board = grid(
    ['book', 'book', 'book', 'coffee'],
    ['book', 'coffee', 'coffee', 'coffee'],
    ['book', 'coffee', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
    ['scatter', 'scatter', 'scatter', 'scatter'],
  );
  const bet = Math.floor(400_000 / (3 * CONFIG.paytable.book[0]));
  const result = evaluateWays(board, emptyFrames(), [], bet);
  assert.equal(result.payoutCents, 1); // Two ~0.4-cent contributions round together to one cent.
  assert.equal(result.wins.reduce((sum, win) => sum + win.payoutCents, 0), 0);
  assert.equal(roundHalfUp(5n, 10n), 1);
  assert.equal(roundHalfUp(4n, 10n), 0);
  assert.equal(settledPayout(500, 999_900, 1_000_000), 100);
  assert.equal(settledPayout(500, 1_000_000, 1_000_000), 0);
  assert.match(formatMoney(12345, 'bg'), /€/);
  assert.match(formatMoney(12345, 'en'), /€/);
  assert.throws(() => settledPayout(-1, 0, 100), /INVALID_MONEY/);
});

test('God independent opportunity equation yields 4.8% success and 96% return', () => {
  const p = CONFIG.god.opportunityProbability;
  const success = (1 - (1 - p) ** 3) ** 5;
  assert.ok(Math.abs(p - 0.23075803249924676) < 1e-14);
  assert.ok(Math.abs(success - 0.048) < 1e-14);
  assert.ok(Math.abs(success * 20_000 / 1_000 - 0.96) < 1e-13);
  assert.ok(CONFIG.standardVipProbability < success);
});

test('all mode and purchase prices charge the original base bet exactly once', () => {
  const modes: Mode[] = ['standard', 'hunt', 'frames', 'wild', 'god'];
  assert.deepEqual(modes.map(mode => roundPriceCents(20, { kind: 'mode', mode })), [20, 40, 120, 500, 20_000]);
  assert.deepEqual(['dorm', 'friday', 'december'].map(bonus => roundPriceCents(20, { kind: 'buy', bonus: bonus as 'dorm' | 'friday' | 'december' })), [2_000, 6_000, 20_000]);
});

test('seeded random has reproducible advancing state and retains entropy on zero seed', () => {
  const first = new SeededRandom(123456);
  const second = new SeededRandom(123456);
  const samples = Array.from({ length: 1000 }, () => first.next());
  assert.deepEqual(samples, Array.from({ length: 1000 }, () => second.next()));
  assert.ok(samples.every(value => value >= 0 && value < 1));
  assert.equal(first.state, second.state);
  const zero = new SeededRandom(0);
  assert.notEqual(zero.state, 0);
  assert.notEqual(zero.next(), zero.next());
});

test('starting all paid modes commits one debit and one outcome without mutating the input', () => {
  const choices: RoundChoice[] = (['standard', 'hunt', 'frames', 'wild', 'god'] as Mode[]).map(mode => ({ kind: 'mode', mode }));
  for (const choice of choices) {
    const initial = createSession(89123);
    const snapshot = structuredClone(initial);
    const started = startRound(initial, choice);
    assert.deepEqual(initial, snapshot);
    assert.ok(started.presentation);
    const view = started.presentation;
    const cost = roundPriceCents(20, choice);
    assert.equal(view.roundCostCents, cost);
    assert.equal(view.lockedBetCents, 20);
    assert.equal(started.balanceCents, initial.balanceCents - cost + view.payoutCents);
    assert.equal(started.roundSequence, 1);
    assert.deepEqual(view.choice, choice);
    if (choice.kind === 'mode' && choice.mode === 'hunt') assert.equal(view.grid[0].filter(symbol => symbol === 'scatter').length, 1);
    if (choice.kind === 'mode' && choice.mode === 'frames') assert.ok(view.frames.every(column => column.every(Boolean)));
    if (choice.kind === 'mode' && choice.mode === 'wild') assert.equal(view.wilds.length, 1);
    for (const column of view.grid) assert.ok(column.filter(symbol => symbol === 'scatter').length <= 1);
  }
});

test('bonus purchases do not stack the selected booster price and lock the paid base bet', () => {
  for (const bonus of ['dorm', 'friday', 'december'] as BonusTier[]) {
    const initial = setMode(selectBet(createSession(123), 100), 'god');
    const started = startRound(initial, { kind: 'buy', bonus });
    const view = started.presentation!;
    assert.equal(view.roundCostCents, ({ dorm: 10_000, friday: 30_000, december: 100_000 })[bonus]);
    assert.equal(view.lockedBetCents, 100);
    assert.equal(view.tier, bonus);
    assert.equal(view.intro, true);
    assert.equal(started.balanceCents, initial.balanceCents - view.roundCostCents + view.payoutCents);
    assert.throws(() => selectBet(started, 200), /ROUND_ACTIVE/);
    assert.throws(() => setMode(started, 'standard'), /ROUND_ACTIVE/);
    const completed = finishRound(started, (before, after) => {
      assert.equal(after.presentation!.lockedBetCents, 100);
      assert.equal(after.balanceCents - before.balanceCents, after.presentation!.payoutCents);
      assert.equal(after.presentation!.roundCostCents, view.roundCostCents);
    });
    assert.equal(completed.history[0].costCents, view.roundCostCents);
    assert.equal(completed.history[0].betCents, 100);
    assert.equal(completed.balanceCents, initial.balanceCents - view.roundCostCents + completed.history[0].payoutCents);
  }
});

test('overlapping spin, purchase, bet, mode and refill actions are rejected', () => {
  const started = startRound(createSession(45), { kind: 'buy', bonus: 'dorm' });
  const snapshot = structuredClone(started);
  assert.throws(() => startRound(started), /ROUND_ACTIVE/);
  assert.throws(() => startRound(started, { kind: 'buy', bonus: 'december' }), /ROUND_ACTIVE/);
  assert.throws(() => selectBet(started, 10), /ROUND_ACTIVE/);
  assert.throws(() => setMode(started, 'hunt'), /ROUND_ACTIVE/);
  assert.throws(() => refillDemo(started), /ROUND_ACTIVE/);
  assert.throws(() => advanceRound(started), /PRESENTATION_PENDING/);
  assert.deepEqual(started, snapshot);
  const completed = finishRound(started);
  assert.throws(() => advanceRound(completed), /NO_ACTIVE_ROUND/);
  assert.equal(selectBet(completed, 40).betCents, 40);
  assert.equal(setMode(completed, 'hunt').selectedMode, 'hunt');
  assert.equal(refillDemo(completed).balanceCents, completed.balanceCents + CONFIG.refillCents);
});

test('unaffordable rounds and unsupported input fail before money or RNG changes', () => {
  const initial = createSession(15, 19);
  const snapshot = structuredClone(initial);
  assert.throws(() => startRound(initial), /INSUFFICIENT_BALANCE/);
  assert.throws(() => startRound(initial, { kind: 'buy', bonus: 'dorm' }), /INSUFFICIENT_BALANCE/);
  assert.throws(() => selectBet(initial, 13), /INVALID_BET/);
  assert.throws(() => setMode(initial, 'invented' as Mode), /INVALID_CHOICE/);
  assert.throws(() => setMode(initial, 'toString' as Mode), /INVALID_CHOICE/);
  assert.throws(() => startRound(initial, { kind: 'mode', mode: 'constructor' as Mode }), /INVALID_CHOICE/);
  assert.deepEqual(initial, snapshot);
});

test('explicit phases keep base, bonus, VIP, completion and acknowledgement state consistent', () => {
  const idle = createSession(3);
  assert.equal(idle.phase, 'idle');
  let natural: Session | undefined;
  for (let seed = 1; seed < 2000 && !natural; seed++) {
    const candidate = startRound(createSession(seed), { kind: 'mode', mode: 'hunt' });
    if (candidate.activeRound) natural = candidate;
  }
  assert.ok(natural);
  assert.equal(natural.phase, 'presenting-base');
  const pending = dismissPresentation(natural);
  assert.equal(pending.phase, 'bonus-pending');
  assert.equal(advanceRound(pending).phase, 'presenting-bonus');
  const bought = startRound(idle, { kind: 'buy', bonus: 'friday' });
  assert.equal(bought.phase, 'presenting-bonus');
  const completed = finishRound(bought);
  assert.equal(completed.phase, 'idle');
  assert.equal(completed.activeRound, null);
  assert.equal(completed.presentation, null);
  const vip = startRound(idle, { kind: 'mode', mode: 'god' });
  assert.equal(vip.phase, 'presenting-vip');
  assert.equal(dismissPresentation(vip).phase, 'idle');
  const capped = startRound(createSession(524352), { kind: 'mode', mode: 'standard' });
  assert.equal(capped.phase, 'presenting-complete');
  assert.equal(dismissPresentation(capped).phase, 'idle');
});

test('God outcomes retain three independent opportunities and never reroll a locked pass', () => {
  const seedSource = new SeededRandom(0x81af2345);
  let successes = 0;
  let winningSeed: number | undefined;
  let losingSeed: number | undefined;
  const sampleSize = 10_000;
  for (let index = 0; index < sampleSize; index++) {
    seedSource.next();
    const seed = seedSource.state;
    const initial = createSession(seed);
    const started = startRound(initial, { kind: 'mode', mode: 'god' });
    const view = started.presentation!;
    assert.equal(view.kind, 'vip');
    assert.equal(view.vipAttempts!.length, 3);
    assert.equal(view.vipLocked!.length, 5);
    assert.ok(view.vipAttempts!.every(attempt => attempt.length === 5));
    for (let position = 0; position < 5; position++) {
      const reveals = view.vipAttempts!.map(attempt => attempt[position]);
      assert.ok(reveals.filter(Boolean).length <= 1, 'a locked pass has no later success draw');
      assert.equal(view.vipLocked![position], reveals.some(Boolean));
    }
    const replay = new SeededRandom(initial.rngState);
    const locked = Array<boolean>(5).fill(false);
    for (const attempt of view.vipAttempts!) for (let position = 0; position < 5; position++) {
      if (!locked[position]) replay.next();
      if (attempt[position]) locked[position] = true;
    }
    assert.equal(started.rngState, replay.state, 'locked positions consume no additional opportunity draws');
    const won = view.vipLocked!.every(Boolean);
    assert.equal(view.payoutCents, won ? 400_000 : 0);
    assert.equal(view.maxWin, won);
    assert.equal(view.roundComplete, true);
    assert.equal(view.wins.length, 0);
    assert.equal(view.scatters, 0);
    assert.equal(view.bonusAwarded, null);
    assert.equal(started.balanceCents, initial.balanceCents - 20_000 + view.payoutCents);
    assert.equal(started.activeRound, null);
    if (won) { successes++; winningSeed ??= seed; } else losingSeed ??= seed;
  }
  assert.ok(Math.abs(successes / sampleSize - 0.048) < 0.01, `measured God success ${successes}/${sampleSize} differs materially from 4.8%`);
  assert.ok(winningSeed !== undefined && losingSeed !== undefined);
  for (const seed of [winningSeed, losingSeed]) {
    const first = startRound(createSession(seed), { kind: 'mode', mode: 'god' });
    const second = startRound(createSession(seed), { kind: 'mode', mode: 'god' });
    assert.deepEqual(first, second, 'forced success and failure seeds replay the committed outcome exactly');
  }
});

test('three, four and five original scatters award the respective natural bonus tier', () => {
  const found = new Map<BonusTier, Session>();
  for (let seed = 1; seed <= 50_000 && found.size < 3; seed++) {
    const started = startRound(createSession(seed), { kind: 'mode', mode: 'hunt' });
    const awarded = started.presentation!.bonusAwarded;
    if (awarded && !found.has(awarded)) found.set(awarded, started);
  }
  assert.equal(found.size, 3, 'the deterministic corpus must exercise every natural bonus trigger');
  for (const [tier, scatters] of [['dorm', 3], ['friday', 4], ['december', 5]] as [BonusTier, number][]) {
    const started = found.get(tier)!;
    const view = started.presentation!;
    assert.equal(view.scatters, scatters);
    assert.equal(view.energyUsed, 1, 'a triggering spin evaluates with base energy');
    assert.equal(started.activeRound!.tier, tier);
    assert.equal(started.activeRound!.spinsRemaining, CONFIG.bonuses[tier].spins);
    assert.equal(started.activeRound!.energy, CONFIG.bonuses[tier].energy);
    assert.equal(started.activeRound!.wilds.length, CONFIG.bonuses[tier].wildCount);
    assert.equal(view.roundCostCents, 40, 'a natural bonus adds no purchase debit');
    const completed = finishRound(started);
    assert.equal(completed.balanceCents, CONFIG.initialBalanceCents - 40 + completed.history[0].payoutCents);
    assert.ok(completed.history[0].spins <= 1 + CONFIG.bonuses[tier].spins + 6);
  }
});

test('the explicitly rare Standard VIP event settles the cap without ways or bonus payouts', () => {
  const forcedSeed = 524352; // Its first xorshift32 draw is below the configured one-in-a-million threshold.
  assert.ok(new SeededRandom(forcedSeed).next() < CONFIG.standardVipProbability);
  const initial = createSession(forcedSeed);
  const started = startRound(initial, { kind: 'mode', mode: 'standard' });
  const view = started.presentation!;
  assert.equal(view.payoutCents, 400_000);
  assert.equal(view.roundTotalCents, 400_000);
  assert.equal(view.maxWin, true);
  assert.equal(view.roundComplete, true);
  assert.equal(view.wins.length, 0);
  assert.equal(view.scatters, 0);
  assert.equal(view.bonusAwarded, null);
  assert.equal(started.activeRound, null);
  assert.equal(view.grid.reduce((count, reel) => count + reel.filter(symbol => symbol === 'vip').length, 0), 5);
  assert.equal(started.balanceCents, initial.balanceCents - 20 + 400_000);
  assert.equal(started.history[0].payoutCents, 400_000);
});

test('bonus party energy is applied before its post-win increment and obeys its limit', () => {
  const fixture = nextBonusFixture('dorm');
  const [before, after] = findTransition(fixture, next => next.presentation!.payoutCents > 0);
  const view = after.presentation!;
  assert.equal(view.energyUsed, before.activeRound!.energy);
  assert.equal(view.energyAfter, Math.min(CONFIG.partyLimit, view.energyUsed + 1));
  const evaluated = evaluateWays(view.grid, view.frames, view.wilds, before.activeRound!.betCents, view.energyUsed);
  assert.equal(view.payoutCents, Math.min(evaluated.payoutCents, before.activeRound!.capCents - before.activeRound!.payoutCents));
  const atLimit = structuredClone(before);
  atLimit.activeRound!.energy = CONFIG.partyLimit;
  const limited = advanceRound(atLimit);
  assert.equal(limited.presentation!.energyUsed, CONFIG.partyLimit);
  assert.equal(limited.presentation!.energyAfter, CONFIG.partyLimit);
  const [lossBefore, lossAfter] = findTransition(fixture, next => next.presentation!.payoutCents === 0 && !next.presentation!.retrigger);
  assert.equal(lossAfter.presentation!.energyAfter, lossBefore.activeRound!.energy);
});

test('scatter retriggers add exactly two spins and preserve frames, Wild progress and energy on upgrade', () => {
  for (const [from, to] of [['dorm', 'friday'], ['friday', 'december']] as [BonusTier, BonusTier][]) {
    const fixture = nextBonusFixture(from);
    fixture.activeRound!.energy = 7;
    fixture.activeRound!.frames[2][1] = true;
    for (const wild of fixture.activeRound!.wilds) { wild.multiplier = 3; wild.steps = 2; }
    const [before, after] = findTransition(fixture, next => next.presentation!.retrigger);
    const view = after.presentation!;
    assert.ok(after.activeRound);
    const previous = before.activeRound!;
    const current = after.activeRound;
    assert.equal(view.upgradedTo, to);
    assert.equal(view.tier, from, 'the current spin evaluates with its starting tier');
    assert.equal(current.tier, to);
    assert.equal(current.spinsRemaining, previous.spinsRemaining - 1 + 2);
    assert.equal(current.retriggers, previous.retriggers + 1);
    assert.equal(view.energyUsed, 7);
    assert.equal(current.energy, view.payoutCents > 0 ? 8 : 7);
    for (let reel = 0; reel < 5; reel++) for (let row = 0; row < 4; row++) {
      if (previous.frames[reel][row]) assert.equal(current.frames[reel][row], true);
    }
    for (const wild of previous.wilds) {
      const retained = current.wilds.find(candidate => candidate.id === wild.id);
      assert.ok(retained);
      assert.ok(retained.multiplier >= wild.multiplier);
    }
    assert.equal(current.wilds.length, CONFIG.bonuses[to].wildCount);
    assert.equal(new Set(current.wilds.map(wild => wild.reel)).size, current.wilds.length);
    if (to === 'december') assert.ok(current.frames.every(column => column.every(Boolean)));
  }
});

test('accepted retriggers have a finite limit even on further scatter outcomes', () => {
  const fixture = nextBonusFixture('december');
  fixture.activeRound!.retriggers = CONFIG.retriggerLimit;
  const [before, after] = findTransition(fixture, next => next.presentation!.scatters >= 2 && !next.presentation!.maxWin);
  assert.equal(after.presentation!.retrigger, false);
  assert.equal(after.presentation!.upgradedTo, null);
  assert.ok(after.presentation!.events.includes('retrigger-limit'));
  assert.equal(after.activeRound!.retriggers, CONFIG.retriggerLimit);
  assert.equal(after.activeRound!.spinsRemaining, before.activeRound!.spinsRemaining - 1);
  for (const bonus of ['dorm', 'friday', 'december'] as BonusTier[]) {
    for (let seed = 1; seed <= 40; seed++) {
      const complete = finishRound(startRound(createSession(seed), { kind: 'buy', bonus }));
      assert.ok(complete.history[0].spins <= CONFIG.bonuses[bonus].spins + CONFIG.retriggerLimit * CONFIG.retriggerSpins);
      assert.ok(complete.history[0].payoutCents <= complete.history[0].betCents * CONFIG.capMultiplier);
    }
  }
});

test('the cumulative paid-round cap credits only its remainder and terminates the feature', () => {
  const fixture = nextBonusFixture('friday');
  fixture.activeRound!.payoutCents = fixture.activeRound!.capCents - 1;
  const [before, after] = findTransition(fixture, next => next.presentation!.payoutCents > 0);
  assert.equal(after.presentation!.payoutCents, 1);
  assert.equal(after.balanceCents - before.balanceCents, 1);
  assert.equal(after.presentation!.roundTotalCents, 400_000);
  assert.equal(after.presentation!.maxWin, true);
  assert.equal(after.presentation!.roundComplete, true);
  assert.equal(after.activeRound, null);
  assert.equal(after.history[0].payoutCents, 400_000);
  const dismissed = dismissPresentation(after);
  assert.equal(dismissed.balanceCents, after.balanceCents);
  assert.throws(() => advanceRound(dismissed), /NO_ACTIVE_ROUND/);
});

test('saved bonus intro, intermediate spin and VIP outcomes reload without duplicate money or draws', () => {
  const storage = new MemoryStorage();
  for (const choice of [{ kind: 'buy', bonus: 'friday' }, { kind: 'mode', mode: 'god' }] as RoundChoice[]) {
    const initial = createSession(9001);
    let current = commitSession(initial, startRound(initial, choice), storage);
    assert.deepEqual(loadSession(storage), current);
    let steps = 0;
    while (current.presentation || current.activeRound) {
      assert.ok(++steps <= 40);
      const loaded = loadSession(storage);
      assert.deepEqual(loaded, current);
      const balance = loaded.balanceCents;
      const rngState = loaded.rngState;
      const ack = dismissPresentation(loaded);
      assert.equal(ack.balanceCents, balance);
      assert.equal(ack.rngState, rngState);
      const after = ack.activeRound ? advanceRound(ack) : ack;
      const expectedAck = dismissPresentation(current);
      const expected = expectedAck.activeRound ? advanceRound(expectedAck) : expectedAck;
      assert.deepEqual(after, expected);
      current = commitSession(current, after, storage);
      saveSession(current, storage);
      assert.deepEqual(loadSession(storage), current);
    }
    assert.equal(current.history.length, 1);
    assert.equal(current.balanceCents, initial.balanceCents - current.history[0].costCents + current.history[0].payoutCents);
    commitSession(current, current, storage);
    assert.equal(loadSession(storage).balanceCents, current.balanceCents);
    assert.equal(loadSession(storage).history.length, 1);
  }
});

test('failed storage commits leave the previously persisted and live session intact', () => {
  const storage = new MemoryStorage();
  const initial = createSession(821);
  saveSession(initial, storage);
  const candidate = startRound(initial, { kind: 'buy', bonus: 'dorm' });
  const failingStorage: StorageLike = {
    getItem: key => storage.getItem(key),
    setItem: () => { throw new Error('QUOTA_EXCEEDED'); },
  };
  assert.throws(() => commitSession(initial, candidate, failingStorage), /QUOTA_EXCEEDED/);
  assert.deepEqual(loadSession(storage), initial);
  assert.equal(initial.balanceCents, CONFIG.initialBalanceCents);
  assert.equal(initial.roundSequence, 0);
  storage.setItem(STORAGE_KEY, '{broken json');
  assert.throws(() => loadSession(storage));
});

test('corrupted saved money, RNG, phase, modifiers and configuration are rejected before resumption', () => {
  const storage = new MemoryStorage();
  const valid = nextBonusFixture('friday');
  const corruptions: ((session: Session) => void)[] = [
    session => { session.balanceCents = -1; },
    session => { session.balanceCents = 0.5; },
    session => { session.rngState = 0; },
    session => { session.rngState = -1; },
    session => { session.rngState = 0x1_0000_0000; },
    session => { session.roundSequence = -1; },
    session => { session.selectedMode = 'constructor' as Mode; },
    session => { session.phase = 'idle'; },
    session => { session.phase = 'presenting-bonus'; },
    session => { session.activeRound!.payoutCents = session.activeRound!.capCents + 1; },
    session => { session.activeRound!.capCents += 1; },
    session => { session.activeRound!.retriggers = CONFIG.retriggerLimit + 1; },
    session => { session.activeRound!.energy = CONFIG.partyLimit + 1; },
    session => { session.activeRound!.frames.pop(); },
    session => { session.activeRound!.frames[0][0] = 'yes' as unknown as boolean; },
    session => { session.activeRound!.wilds[0].reel = 5; },
    session => { session.activeRound!.wilds[0].multiplier = 4; },
    session => { session.activeRound!.wilds.push({ ...session.activeRound!.wilds[0], id: 'duplicate-reel' }); },
  ];
  for (const corrupt of corruptions) {
    const candidate = structuredClone(valid);
    corrupt(candidate);
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    assert.throws(() => loadSession(storage), 'corrupted persisted state must not resume');
  }
  const changedConfig = structuredClone(valid);
  changedConfig.activeRound!.configVersion = 'unknown-configuration';
  storage.setItem(STORAGE_KEY, JSON.stringify(changedConfig));
  assert.throws(() => loadSession(storage), /CONFIG_VERSION_MISMATCH/);
  assert.throws(() => advanceRound(changedConfig), /CONFIG_VERSION_MISMATCH/);
  saveSession(valid, storage);
  assert.deepEqual(loadSession(storage), valid);
});

test('visual acknowledgements, reloads and starting balance never alter mathematical outcomes', () => {
  for (const choice of [{ kind: 'mode', mode: 'wild' }, { kind: 'buy', bonus: 'friday' }, { kind: 'mode', mode: 'god' }] as RoundChoice[]) {
    const low = startRound(createSession(123456789, 500_000), choice);
    const high = startRound(createSession(123456789, 5_000_000), choice);
    assert.deepEqual(low.presentation, high.presentation);
    assert.equal(low.rngState, high.rngState);
    const storage = new MemoryStorage();
    let withReloads = high;
    const direct = finishRound(low);
    while (withReloads.presentation || withReloads.activeRound) {
      saveSession(withReloads, storage);
      const loaded = loadSession(storage);
      const firstAck = dismissPresentation(loaded);
      const repeatedAck = dismissPresentation(firstAck);
      assert.deepEqual(firstAck, repeatedAck);
      withReloads = repeatedAck.activeRound ? advanceRound(repeatedAck) : repeatedAck;
    }
    assert.deepEqual(direct.history, withReloads.history);
    assert.equal(direct.rngState, withReloads.rngState);
    assert.equal(withReloads.balanceCents - direct.balanceCents, 4_500_000);
  }
});

test('settled history stays bounded while each paid round retains one accounting entry', () => {
  let session = createSession(18181818);
  for (let index = 0; index < CONFIG.historyLimit + 5; index++) {
    session = finishRound(startRound(session, { kind: 'mode', mode: 'standard' }));
    assert.equal(session.roundSequence, index + 1);
    assert.equal(session.history.length, Math.min(index + 1, CONFIG.historyLimit));
    assert.equal(session.history[0].id, `round-${index + 1}`);
  }
  assert.equal(new Set(session.history.map(entry => entry.id)).size, CONFIG.historyLimit);
});

test('randomness is injectable while the default source reproduces the same seeded engine', () => {
  let reveals=0;
  class RevealSource extends SeededRandom {
    override chance(_probability:number):boolean { this.next(); reveals++;return true; }
  }
  const input=createSession(7112);
  const won=startRound(input,{kind:'mode',mode:'god'},state=>new RevealSource(state));
  assert.equal(reveals,CONFIG.god.positions);
  assert.deepEqual(won.presentation!.vipAttempts,[Array(5).fill(true),Array(5).fill(false),Array(5).fill(false)]);
  assert.equal(won.presentation!.payoutCents,input.betCents*CONFIG.capMultiplier);
  assert.deepEqual(startRound(input),startRound(input,{kind:'mode',mode:'standard'},state=>new SeededRandom(state)));
});
