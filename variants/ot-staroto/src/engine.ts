import { MATH_MODEL } from './math-model';
import { PAYLINES, PAYLINE_REFERENCE_READY } from './paylines';
export { PAYLINES, PAYLINE_REFERENCE_READY } from './paylines';
import type { Cascade, Cell, Character, Choice, Coin, CoinWave, Feature, GodShot, Grid, Matrix, Regular, Round, Session, ShooterShot, Spin, Tier, Win } from './types';

export const REGULARS: Regular[] = ['bottle', 'cash', 'chain', 'cassette', 'sneaker', 'crown', 'lighter', 'dice', 'ring'];
export const TIER_ORDER: Tier[] = ['ruse', 'lux', 'edge', 'old'];
export const BONUS_NAMES: Record<Tier, string> = { ruse: 'Русенско Варено', lux: 'ЛУКС', edge: 'Ръба са обажда', old: 'ОТ СТАРОТО' };
export const TIER_CHARACTERS: Record<Tier, Character[]> = { ruse: ['left'], lux: ['right'], edge: ['middle'], old: ['left', 'middle', 'right'] };
export const CONFIG = {
  version: 5, targetRtp: .965, bonusTriggerDenominator: 200, boostedBonusTriggerDenominator: 40, boostCost: 3, reels: 6, rows: 5, maxWin: 19999, wildLinePay: 200, minimumNaturalSymbols: 1,
  betsCents: [10, 20, 50, 100, 200, 500, 1000, 2000], defaultBetCents: 20, initialBalanceCents: 1000000,
  buyCosts: { ruse: 95, lux: 150, edge: 1800, old: 2500 }, xbetCosts: { left: 8.5, right: 2.7, middle: 25 }, godCost: 3000,
  godShots: 5, godMinimumShots: 4, godExtraShotChance: .32,
  coinRevealChance: 1, coinCollectorChance: .012, coinLocalChance: .035, coinGlobalChance: .004,
  weights: {
    base: { scatter: .009, left: .0015, middle: .0007, right: .0003 },
    bonus: { scatter: .018, left: .002, middle: .014, right: .008 },
    super: { scatter: .018, left: .0015, middle: .0052, right: .008 },
  },
  coinValues: [.2, .5, 1, 2, 3, 5, 10, 25, 100, 500],
  coinValueWeights: {
    base: [5000, 2500, 1400, 600, 250, 120, 70, 40, 15, 5],
    bonus: [2500, 2200, 1800, 1300, 800, 650, 450, 230, 60, 10],
  },
  shooterFollowupChance: .3, shooterMinimumShots: 1, shooterMaximumShots: 3,
  expandingMultipliers: [1, 2, 3, 5, 10, 20, 50, 100],
  expandingMultiplierWeights: [6500, 1800, 800, 450, 250, 120, 60, 20],
  paytable: {
    bottle: { 3: .1, 4: .3, 5: 1, 6: 3 }, cash: { 3: .1, 4: .3, 5: 1, 6: 3 },
    chain: { 3: .5, 4: 1, 5: 2, 6: 5 }, cassette: { 3: .5, 4: 1, 5: 2, 6: 5 },
    sneaker: { 3: 1, 4: 2, 5: 4, 6: 10 }, crown: { 3: 2, 4: 5, 5: 10, 6: 50 },
    lighter: { 3: .1, 4: .3, 5: 1, 6: 3 }, dice: { 3: 1, 4: 2, 5: 4, 6: 10 }, ring: { 3: 3, 4: 10, 5: 20, 6: 100 },
  } satisfies Record<Regular, Record<3 | 4 | 5 | 6, number>>,
} as const;

const CHARS: Character[] = ['left', 'middle', 'right'];
const MONEY_LIMIT = 9_000_000_000_000;
const MAX_ENTROPY_WORDS = 1000;
const cloneGrid = (g: Grid): Grid => g.map(column => [...column]);
const cloneMatrix = (m: Matrix): Matrix => m.map(column => [...column]);
const blankMatrix = (): Matrix => Array.from({ length: CONFIG.reels }, () => Array(CONFIG.rows).fill(0));
const blankMarks = (): boolean[][] => Array.from({ length: CONFIG.reels }, () => Array(CONFIG.rows).fill(false));
const key = (c: Cell): string => `${c.reel}:${c.row}`;
const allCells = (): Cell[] => Array.from({ length: CONFIG.reels * CONFIG.rows }, (_, i) => ({ reel: Math.floor(i / CONFIG.rows), row: i % CONFIG.rows }));
const regular = (s: string): s is Regular => REGULARS.includes(s as Regular);
const character = (s: string): s is Character => CHARS.includes(s as Character);
const money = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MONEY_LIMIT;
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;

function secureSeed(): number {
  const bytes = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(bytes); } while (!bytes[0]);
  return bytes[0];
}

/** A local RNG object makes deterministic fixtures possible without sharing the UI's RNG. */
export class Rng {
  state: number;
  constructor(state: number) { this.state = state >>> 0 || 0x6d2b79f5; }
  next(): number {
    let s = this.state;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.state = s >>> 0;
    return this.state / 0x100000000;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
}

/** Unbiased rational tickets from independent uniform uint32 words. Production uses
 * Web Crypto; the consumed draw tape is recorded so reload can replay without RNG.
 */
export function uniformTicket(word: () => number, limit: bigint): bigint {
  if (limit <= 0n) throw new Error('Invalid ticket limit');
  const radix = 0x100000000n;
  let space = radix, words = 1;
  while (space < limit) { space *= radix; words++; }
  const accepted = space - space % limit;
  for (;;) {
    let value = 0n;
    for (let i = 0; i < words; i++) {
      const next = word();
      if (!integer(next, 0, 0xffffffff)) throw new Error('Invalid entropy word');
      value = value * radix + BigInt(next);
    }
    if (value < accepted) return value % limit;
  }
}

export function costCents(betCents: number, choice: Choice): number {
  if (!integer(betCents, 1, 100000)) throw new Error('Invalid bet');
  const factor = choice.kind === 'spin' ? 1 : choice.kind === 'boost' ? CONFIG.boostCost : choice.kind === 'god' ? CONFIG.godCost : choice.kind === 'buy' ? CONFIG.buyCosts[choice.tier] : CONFIG.xbetCosts[choice.character];
  if (!Number.isFinite(factor) || factor < 1 || factor > 3000) throw new Error('Invalid choice');
  return Math.round(betCents * factor);
}

export function createSession(seed = secureSeed(), balanceCents: number = CONFIG.initialBalanceCents): Session {
  if (!money(balanceCents)) throw new Error('Invalid balance');
  return { version: 5, balanceCents, betCents: CONFIG.defaultBetCents, rngState: new Rng(seed).state, sequence: 0, pending: null, history: [] };
}

function randomRegular(rng: Rng): Regular { return REGULARS[rng.int(REGULARS.length)]; }
function drawSymbol(rng: Rng, tier: Tier | null): Grid[number][number] {
  const n = rng.next();
  // These are transparent prototype weights, independent of balance and previous results.
  const weights = tier === 'old' ? CONFIG.weights.super : tier ? CONFIG.weights.bonus : CONFIG.weights.base;
  const scatterRate = weights.scatter;
  if (n < scatterRate) return 'scatter';
  const allowed = tier ? TIER_CHARACTERS[tier] : CHARS;
  let cutoff = scatterRate;
  for (const c of allowed) {
    cutoff += weights[c];
    if (n < cutoff) return c;
  }
  return randomRegular(rng);
}
function makeGrid(rng: Rng, tier: Tier | null, sticky: Matrix): { grid: Grid; multipliers: Matrix } {
  const multipliers = cloneMatrix(sticky);
  const grid: Grid = Array.from({ length: CONFIG.reels }, (_, reel) => {
    let hasScatter = false;
    return Array.from({ length: CONFIG.rows }, (_, row) => {
      if (sticky[reel][row] > 0) return 'wild';
      let symbol = drawSymbol(rng, tier);
      if (symbol === 'scatter') { if (hasScatter) symbol = randomRegular(rng); else hasScatter = true; }
      return symbol;
    });
  });
  normalizeShooterReels(grid, rng);
  return { grid, multipliers };
}

function normalizeShooterReels(grid: Grid, rng: Rng): void {
  for (const column of grid) {
    const shooterRow = column.indexOf('middle');
    if (shooterRow < 0) continue;
    for (let row = 0; row < column.length; row++) if (row !== shooterRow && !regular(column[row]) && column[row] !== 'wild') column[row] = randomRegular(rng);
  }
}

export function wildGlobal(grid: Grid, multipliers: Matrix, inactive: Cell[] = []): number {
  const exhausted = new Set(inactive.map(key));
  return Math.max(1, allCells().reduce((sum, c) => sum + (grid[c.reel][c.row] === 'wild' && !exhausted.has(key(c)) ? multipliers[c.reel][c.row] || 1 : 0), 0));
}

/** Fixed left-to-right paylines. One longest matching run, with a natural
 * symbol, pays on each line. Different lines pay independently. */
export function evaluate(grid: Grid, multipliers: Matrix, betCents: number, budgetCents = MONEY_LIMIT, inactive: Cell[] = [], paylines: readonly (readonly number[])[] = PAYLINES): Win[] {
  const globalMultiplier = wildGlobal(grid, multipliers, inactive);
  const exhausted = new Set(inactive.map(key));
  let remaining = budgetCents;
  const wins: Win[] = [];
  for (const [index, line] of paylines.entries()) {
    if (remaining <= 0) break;
    if (line.length !== CONFIG.reels || line.some(row => !integer(row, 0, CONFIG.rows - 1))) throw new Error('Invalid payline');
    const cells: Cell[] = [];
    let symbol: Regular | null = null;
    for (let reel = 0; reel < CONFIG.reels; reel++) {
      const cell = { reel, row: line[reel] }, value = grid[reel][cell.row];
      if (value === 'wild' && !exhausted.has(key(cell))) { cells.push(cell); continue; }
      if (!regular(value) || symbol && value !== symbol) break;
      symbol = value; cells.push(cell);
    }
    if (cells.length < 3 || !symbol && cells.length !== CONFIG.reels) continue;
    const awardedSymbol = symbol ?? 'wild';
    const baseMultiplier = symbol ? CONFIG.paytable[symbol][cells.length as 3 | 4 | 5 | 6] : CONFIG.wildLinePay;
    const payoutCents = Math.min(remaining, Math.round(betCents * Math.round(baseMultiplier * 100) * globalMultiplier / 100));
    remaining -= payoutCents;
    wins.push({ line: index + 1, symbol: awardedSymbol, cells, count: cells.length, baseMultiplier, globalMultiplier, payoutCents });
  }
  return wins;
}

export interface FeatureContext {
  grid: Grid; multipliers: Matrix; sticky: Matrix; marks: boolean[][];
  tier: Tier | null; betCents: number; expandedReels?: number[]; budgetCents?: number; inactiveWilds?: Cell[];
}
export interface FeatureResult {
  feature: Feature; grid: Grid; multipliers: Matrix; sticky: Matrix; marks: boolean[][]; expandedReels: number[];
}

function coinValue(rng: Rng, tier: Tier | null): number {
  const values = CONFIG.coinValues;
  const weights = tier === 'lux' || tier === 'old' ? CONFIG.coinValueWeights.bonus : CONFIG.coinValueWeights.base;
  let ticket = rng.int(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < values.length; i++) { ticket -= weights[i]; if (ticket < 0) return values[i]; }
  return 500;
}

/** Resolves one badge once. Rendering replays this receipt; it never rolls another target. */
export function resolveFeature(which: Character, source: Cell, context: FeatureContext, rng: Rng): FeatureResult {
  const grid = cloneGrid(context.grid), multipliers = cloneMatrix(context.multipliers), sticky = cloneMatrix(context.sticky), marks = context.marks.map(column => [...column]);
  if (which !== 'middle') grid[source.reel][source.row] = randomRegular(rng);
  multipliers[source.reel][source.row] = 0;
  const targets: Cell[] = [], hits: Feature['hits'] = [], coins: Coin[] = [], coinWaves: CoinWave[] = [];
  let payoutCents = 0;
  let expanding: { expandedReel: number; expansionMultiplier: number } | undefined;
  const eligible = allCells().filter(c => key(c) !== key(source) && (regular(grid[c.reel][c.row]) || grid[c.reel][c.row] === 'wild'));
  if (which === 'left') {
    const empty = eligible.filter(c => grid[c.reel][c.row] !== 'wild');
    const count = Math.min(empty.length, 1 + rng.int(3));
    for (let i = 0; i < count; i++) {
      const c = empty.splice(rng.int(empty.length), 1)[0];
      grid[c.reel][c.row] = 'wild'; multipliers[c.reel][c.row] = 1;
      if (context.tier === 'ruse' || context.tier === 'old') sticky[c.reel][c.row] = 1;
      targets.push(c); hits.push({ cell: c, multiplier: 1, repeated: false });
    }
  } else if (which === 'middle') {
    // The drop receipt forbids a scatter or another unresolved badge on this
    // reel. Expansion therefore visibly converts all rows without erasing an
    // invitation or another character. Every bonus expansion is planted until
    // that entire bonus ends; base-game expansions remain single-spin Wilds.
    if (grid[source.reel].some((s, row) => row !== source.row && !regular(s) && s !== 'wild')) throw new Error('Shooter reel contains an unresolved special');
    let ticket = rng.int(CONFIG.expandingMultiplierWeights.reduce((a, b) => a + b, 0));
    let factor: number = CONFIG.expandingMultipliers.at(-1)!;
    for (let i = 0; i < CONFIG.expandingMultipliers.length; i++) { ticket -= CONFIG.expandingMultiplierWeights[i]; if (ticket < 0) { factor = CONFIG.expandingMultipliers[i]; break; } }
    expanding = { expandedReel: source.reel, expansionMultiplier: factor };
    for (let row = 0; row < CONFIG.rows; row++) {
      const c = { reel: source.reel, row };
      const repeated = grid[c.reel][row] === 'wild';
      const multiplier = Math.min(MONEY_LIMIT, (repeated ? multipliers[c.reel][row] || 1 : 1) * factor);
      grid[c.reel][row] = 'wild'; multipliers[c.reel][row] = multiplier;
      if (context.tier !== null || sticky[c.reel][row]) sticky[c.reel][row] = multiplier;
      targets.push(c); hits.push({ cell: c, multiplier, repeated });
    }
  } else if (which === 'right') {
    const cells = allCells().filter(c => marks[c.reel][c.row]);
    targets.push(...cells);
    for (const c of cells) marks[c.reel][c.row] = false;
    const copyCoin = (coin: Coin): Coin => ({ ...coin, cell: { ...coin.cell }, ...(coin.target ? { target: { ...coin.target } } : {}) });
    let retained: Coin[] = [];
    let vacancies = cells;
    const budget = context.budgetCents ?? MONEY_LIMIT;
    // Every repeat is caused by a newly revealed collector. A retained collector
    // sits quietly until another one absorbs it; it cannot collect itself again.
    while (vacancies.length) {
      const existing = retained.map(copyCoin);
      const revealed: Coin[] = vacancies.map(c => {
        const chance = rng.next();
        let kind: Coin['kind'];
        if (chance < CONFIG.coinCollectorChance) kind = 'collector';
        else if (chance < CONFIG.coinCollectorChance + CONFIG.coinGlobalChance) kind = 'global';
        else if (chance < CONFIG.coinCollectorChance + CONFIG.coinGlobalChance + CONFIG.coinLocalChance) kind = 'multiplier';
        else kind = 'value';
        const value = kind === 'value' ? coinValue(rng, context.tier) : kind === 'collector' ? 0 : [2, 3, 5][rng.int(kind === 'global' ? 2 : 3)];
        return { cell: { ...c }, kind, value, payoutCents: kind === 'value' ? Math.round(context.betCents * value) : 0 };
      });
      const wave: CoinWave = { index: coinWaves.length, existingCollectors: existing.map(copyCoin), coins: revealed.map(copyCoin), modifierEvents: [], collections: [], retainedCollectors: [], cleared: [], repeat: false };
      // The wave receipt keeps the raw reveal amounts. All modifiers happen only
      // after every fresh coin is revealed and are recorded in presentation order.
      const monetary = [...revealed.filter(c => c.kind === 'value'), ...existing];
      for (const modifier of revealed.filter(c => c.kind === 'multiplier' || c.kind === 'global')) {
        if (!monetary.length) continue;
        const recipients = modifier.kind === 'global' ? monetary : [monetary[rng.int(monetary.length)]];
        if (modifier.kind === 'multiplier') modifier.target = { ...recipients[0].cell };
        wave.modifierEvents.push({ source: { ...modifier.cell }, targets: recipients.map(c => ({ ...c.cell })), factor: modifier.value, global: modifier.kind === 'global' });
        for (const recipient of recipients) {
          recipient.payoutCents = Math.min(MONEY_LIMIT, recipient.payoutCents * modifier.value);
          recipient.value = recipient.payoutCents / context.betCents;
        }
      }
      let pool = monetary;
      const newCollectors = revealed.filter(c => c.kind === 'collector');
      for (const collector of newCollectors) {
        const amount = pool.reduce((sum, c) => sum + c.payoutCents, 0);
        wave.collections.push({ collector: { ...collector.cell }, sources: pool.map(copyCoin), collectedCents: amount, valueBeforeCents: collector.payoutCents, valueAfterCents: amount });
        collector.payoutCents = amount; collector.value = amount / context.betCents;
        pool = [collector];
      }
      if (newCollectors.length) {
        retained = pool.map(copyCoin);
        const surviving = new Set(retained.map(c => key(c.cell)));
        wave.cleared = cells.filter(c => !surviving.has(key(c))).map(c => ({ ...c }));
        vacancies = wave.cleared;
        wave.repeat = vacancies.length > 0 && retained.reduce((sum, c) => sum + c.payoutCents, 0) < budget;
      } else {
        retained = existing;
        vacancies = [];
      }
      wave.retainedCollectors = retained.map(copyCoin);
      coinWaves.push(wave);
      if (!wave.repeat) {
        const terminal = newCollectors.length ? retained : [...revealed, ...retained];
        let remaining = budget;
        for (const coin of terminal) {
          const paid = Math.min(remaining, coin.payoutCents);
          coins.push({ ...copyCoin(coin), payoutCents: paid });
          remaining -= paid; payoutCents += paid;
        }
        break;
      }
    }
  }

  return {
    grid, multipliers, sticky, marks, expandedReels: [...new Set([...(context.expandedReels ?? []), ...(expanding ? [expanding.expandedReel] : [])])],
    feature: { character: which, source: { ...source }, targets, hits, ...expanding, ...(which === 'middle' ? { phase: 'expand' as const } : {}), coins, coinWaves, globalMultiplier: wildGlobal(grid, multipliers, context.inactiveWilds), gridAfter: cloneGrid(grid), wildMultipliersAfter: cloneMatrix(multipliers), payoutCents },
  };
}

/** Optional follow-up phase. Every initially landed shooter expands before any
 * of these recorded shots, so another expanded reel is a legal target. */
export function resolveShooterShots(source: Cell, context: FeatureContext, rng: Rng): FeatureResult | null {
  if (rng.next() >= CONFIG.shooterFollowupChance) return null;
  const grid = cloneGrid(context.grid), multipliers = cloneMatrix(context.multipliers), sticky = cloneMatrix(context.sticky), marks = context.marks.map(column => [...column]);
  const expandedReels = [...(context.expandedReels ?? [])];
  const eligible = allCells().filter(c => regular(grid[c.reel][c.row]) || grid[c.reel][c.row] === 'wild');
  if (!eligible.length) return null;
  const shots = CONFIG.shooterMinimumShots + rng.int(CONFIG.shooterMaximumShots - CONFIG.shooterMinimumShots + 1);
  const targets: Cell[] = [], hits: Feature['hits'] = [], shotEvents: ShooterShot[] = [];
  for (let i = 0; i < shots; i++) {
    const target = { ...eligible[rng.int(eligible.length)] };
    const isExpanded = expandedReels.includes(target.reel) && grid[target.reel].every(s => s === 'wild');
    const affected = isExpanded ? Array.from({ length: CONFIG.rows }, (_, row) => ({ reel: target.reel, row })) : [target];
    const event: ShooterShot = { target, hits: [], ...(isExpanded ? { expandedReel: target.reel } : {}), sticky: isExpanded && context.tier !== null };
    for (const cell of affected) {
      const repeated = grid[cell.reel][cell.row] === 'wild';
      const multiplier = Math.min(MONEY_LIMIT, repeated ? (multipliers[cell.reel][cell.row] || 1) * 2 : 1);
      grid[cell.reel][cell.row] = 'wild'; multipliers[cell.reel][cell.row] = multiplier;
      if (sticky[cell.reel][cell.row] || event.sticky) sticky[cell.reel][cell.row] = multiplier;
      const hit = { cell: { ...cell }, multiplier, repeated }; event.hits.push(hit); hits.push(hit);
    }
    targets.push(target); shotEvents.push(event);
  }
  return {
    grid, multipliers, sticky, marks, expandedReels,
    feature: { character: 'middle', phase: 'shots', source: { ...source }, targets, hits, shotEvents, coins: [], coinWaves: [], globalMultiplier: wildGlobal(grid, multipliers, context.inactiveWilds), gridAfter: cloneGrid(grid), wildMultipliersAfter: cloneMatrix(multipliers), payoutCents: 0 },
  };
}

export function bonusAward(scatters: number): Tier | null {
  return scatters >= 6 ? 'old' : scatters === 5 ? 'edge' : scatters === 4 ? 'lux' : scatters === 3 ? 'ruse' : null;
}
export function retrigger(scatters: number, tier: Tier): { addedSpins: number; upgradedTo: Tier | null } {
  const candidate = scatters >= 6 ? 'old' : scatters === 5 ? 'edge' : scatters === 4 ? 'lux' : null;
  return { addedSpins: scatters >= 6 ? 10 : scatters >= 3 ? 5 : scatters === 2 ? 2 : 0, upgradedTo: candidate && TIER_ORDER.indexOf(candidate) > TIER_ORDER.indexOf(tier) ? candidate : null };
}

interface State { expandedStickyReels: number[]; sticky: Matrix; marks: boolean[][]; markEnabled: boolean }
function playSpin(rng: Rng, tier: Tier | null, betCents: number, index: number, before: number, roundTotal: number, capCents: number, state: State, guaranteed?: Character, suppliedGrid?: Grid): Spin {
  let { grid, multipliers } = suppliedGrid ? { grid: cloneGrid(suppliedGrid), multipliers: blankMatrix() } : makeGrid(rng, tier, state.sticky);
  if (guaranteed) {
    const free = allCells().filter(c => !state.sticky[c.reel][c.row]);
    const separated = guaranteed === 'middle' ? free : free.filter(c => !grid[c.reel].includes('middle'));
    // If all reels contain a shooter, replace a shooter itself; putting another
    // badge elsewhere on that reel would be removed by drop normalization.
    const candidates = separated.length ? separated : guaranteed === 'middle' ? free : free.filter(c => grid[c.reel][c.row] === 'middle');
    const chosen = candidates[rng.int(candidates.length)];
    grid[chosen.reel][chosen.row] = guaranteed;
    normalizeShooterReels(grid, rng);
  }
  const initialGrid = cloneGrid(grid), initialWildMultipliers = cloneMatrix(multipliers);
  const initialExpandedReels = [...state.expandedStickyReels];
  let expandedReels = [...initialExpandedReels];
  const cascades: Cascade[] = [], presentCharacters: Character[] = [];
  const exhausted = new Map<string, Cell>();
  let payoutCents = 0;
  for (let cascadeIndex = 0; ; cascadeIndex++) {
    if (cascadeIndex >= 500) throw new Error('Cascade safety limit reached; round was not charged');
    const incoming = cloneGrid(grid), incomingMultipliers = cloneMatrix(multipliers), features: Feature[] = [];
    const sources = allCells().filter(c => character(grid[c.reel][c.row])).map(c => ({ c, which: grid[c.reel][c.row] as Character }));
    for (const { which } of sources) {
      if (!presentCharacters.includes(which)) presentCharacters.push(which);
      if (which === 'right') state.markEnabled = true;
    }
    const applyFeature = (c: Cell, which: Character): void => {
      const result = resolveFeature(which, c, { grid, multipliers, sticky: state.sticky, marks: state.marks, tier, betCents, budgetCents: capCents - roundTotal - payoutCents, inactiveWilds: [...exhausted.values()], expandedReels }, rng);
      grid = result.grid; multipliers = result.multipliers; state.sticky = result.sticky; state.marks = result.marks; expandedReels = result.expandedReels;
      features.push(result.feature); payoutCents += result.feature.payoutCents;
    };
    for (const { c, which } of sources) if (which === 'left') applyFeature(c, which);
    for (const { c, which } of sources) if (which === 'middle') applyFeature(c, which);
    for (const { c, which } of sources) if (which === 'middle') {
      const result = resolveShooterShots(c, { grid, multipliers, sticky: state.sticky, marks: state.marks, tier, betCents, budgetCents: capCents - roundTotal - payoutCents, inactiveWilds: [...exhausted.values()], expandedReels }, rng);
      if (!result) continue;
      grid = result.grid; multipliers = result.multipliers; state.sticky = result.sticky; state.marks = result.marks; expandedReels = result.expandedReels;
      features.push(result.feature);
    }
    state.expandedStickyReels = expandedReels.filter(reel => state.sticky[reel].every(n => n > 0));
    let wins = evaluate(grid, multipliers, betCents, capCents - roundTotal - payoutCents, [...exhausted.values()]);
    // A right badge remains visible while combinations clear; its coin reveal follows
    // those real marked boxes rather than arriving before any boxes can be marked.
    if (!wins.length) {
      for (const { c, which } of sources) if (which === 'right') applyFeature(c, which);
      wins = evaluate(grid, multipliers, betCents, capCents - roundTotal - payoutCents, [...exhausted.values()]);
    }
    const inactiveWilds = [...exhausted.values()].map(c => ({ ...c }));
    const globalMultiplier = wildGlobal(grid, multipliers, inactiveWilds);
    const winPayout = wins.reduce((sum, win) => sum + win.payoutCents, 0);
    payoutCents += winPayout;
    const combined = new Map<string, Cell>();
    for (const win of wins) for (const c of win.cells) if (!state.sticky[c.reel][c.row]) combined.set(key(c), c);
    const removed = [...combined.values()];
    // A sticky Wild can join all matching wins in this batch, then rests until
    // the next free spin. Its coordinate and multiplier stay in the bonus state.
    for (const win of wins) for (const c of win.cells) if (state.sticky[c.reel][c.row]) exhausted.set(key(c), { ...c });
    if (state.markEnabled) for (const c of removed) state.marks[c.reel][c.row] = true;
    const cascade: Cascade = {
      index: cascadeIndex, grid: incoming, wildMultipliers: incomingMultipliers, stickyWilds: cloneMatrix(state.sticky), features,
      resolvedGrid: cloneGrid(grid), resolvedWildMultipliers: cloneMatrix(multipliers), marks: state.marks.map(column => [...column]),
      expandedReels: [...expandedReels], inactiveWilds, inactiveWildsAfter: [...exhausted.values()].map(c => ({ ...c })),
      wins, removed, globalMultiplier, payoutCents: features.reduce((sum, f) => sum + f.payoutCents, 0) + winPayout,
    };
    cascades.push(cascade);
    if (!removed.length || roundTotal + payoutCents >= capCents) break;
    const removedSet = new Set(removed.map(key));
    // Sticky positions do not fall. Other survivors compact within their reel's free slots.
    const next = cloneGrid(grid), nextMultipliers = cloneMatrix(multipliers);
    for (let reel = 0; reel < CONFIG.reels; reel++) {
      const freeRows = Array.from({ length: CONFIG.rows }, (_, row) => row).filter(row => !state.sticky[reel][row]);
      const survivors = freeRows.filter(row => !removedSet.has(`${reel}:${row}`)).map(row => ({ symbol: grid[reel][row], multiplier: multipliers[reel][row] }));
      const freshCount = freeRows.length - survivors.length;
      // Feature badges and scatter invitations belong to the initial spin drop;
      // refills draw paying symbols, so cascades cannot farm unlimited new badges.
      const sequence = [...Array.from({ length: freshCount }, () => ({ symbol: randomRegular(rng), multiplier: 0 })), ...survivors];
      freeRows.forEach((row, i) => { next[reel][row] = sequence[i].symbol; nextMultipliers[reel][row] = sequence[i].multiplier; });
    }
    grid = next; multipliers = nextMultipliers;
    expandedReels = expandedReels.filter(reel => grid[reel].every(s => s === 'wild'));
    cascade.refilledGrid = cloneGrid(grid); cascade.refilledWildMultipliers = cloneMatrix(multipliers);
  }
  const scatters = grid.flat().filter(s => s === 'scatter').length;
  const awarded = tier ? null : bonusAward(scatters);
  const extension = tier ? retrigger(scatters, tier) : { addedSpins: 0, upgradedTo: null };
  return {
    index, tier, initialExpandedReels, finalExpandedReels: [...expandedReels], initialGrid, initialWildMultipliers, cascades, finalGrid: cloneGrid(grid), finalWildMultipliers: cloneMatrix(multipliers), marks: state.marks.map(column => [...column]), presentCharacters, inactiveWilds: [...exhausted.values()].map(c => ({ ...c })),
    scatters, spinsRemainingBefore: before, spinsRemainingAfter: tier ? Math.max(0, before - 1 + extension.addedSpins) : awarded ? awarded === 'old' ? 15 : 10 : 0,
    addedSpins: extension.addedSpins, upgradedTo: extension.upgradedTo, bonusAwarded: awarded, payoutCents, roundTotalCents: roundTotal + payoutCents, maxWin: roundTotal + payoutCents >= capCents,
  };
}

/** Offline procedural outcome generator. Paid play selects a fully evaluated weighted outcome. */
export function simulateRound(seed: number, betCents: number, choice: Choice, entryScatters?: number): Round {
  if (!(CONFIG.betsCents as readonly number[]).includes(betCents)) throw new Error('Invalid bet');
  const rng = new Rng(seed), capCents = betCents * CONFIG.maxWin;
  const cost = costCents(betCents, choice);
  const state: State = { expandedStickyReels: [], sticky: blankMatrix(), marks: blankMarks(), markEnabled: false };
  const spins: Spin[] = [], godHits: boolean[] = [], godShots: GodShot[] = [];
  let godGrid: Grid | null = null;
  if (choice.kind === 'god') {
    godGrid = Array.from({ length: CONFIG.reels }, () => Array.from({ length: CONFIG.rows }, () => randomRegular(rng)));
    const maxCell = allCells()[rng.int(CONFIG.reels * CONFIG.rows)];
    godGrid[maxCell.reel][maxCell.row] = 'max';
    const shots = CONFIG.godMinimumShots + Number(rng.next() < CONFIG.godExtraShotChance);
    const remainingTargets = allCells();
    for (let i = 0; i < shots; i++) {
      const target = remainingTargets.splice(rng.int(remainingTargets.length), 1)[0];
      const hit = key(target) === key(maxCell);
      godShots.push({ target, character: CHARS[i % CHARS.length], hit });
      godHits.push(hit);
      if (hit) break;
    }
  }

  let payoutCents = godHits.some(Boolean) ? capCents : 0;
  let activeTier: Tier | null = choice.kind === 'buy' ? choice.tier : null;
  let triggerTier: Tier | null = activeTier;
  let remaining = activeTier ? activeTier === 'old' ? 15 : 10 : 0;
  if (!payoutCents && !activeTier) {
    let entryGrid = godGrid ?? undefined;
    if (entryScatters !== undefined) {
      if (choice.kind !== 'spin' || !integer(entryScatters, 3, 6)) throw new Error('Invalid natural entry');
      entryGrid = makeGrid(rng, null, state.sticky).grid;
      for (const c of allCells()) if (entryGrid[c.reel][c.row] === 'scatter') entryGrid[c.reel][c.row] = randomRegular(rng);
      const reels = Array.from({ length: CONFIG.reels }, (_, i) => i);
      for (let i = 0; i < entryScatters; i++) {
        const reel = reels.splice(rng.int(reels.length), 1)[0];
        for (let row = 0; row < CONFIG.rows; row++) if (entryGrid[reel][row] === 'middle') entryGrid[reel][row] = randomRegular(rng);
        entryGrid[reel][rng.int(CONFIG.rows)] = 'scatter';
      }
    }
    const spin = playSpin(rng, null, betCents, spins.length, 0, payoutCents, capCents, state, choice.kind === 'xbet' ? choice.character : undefined, entryGrid);
    spins.push(spin); payoutCents += spin.payoutCents;
    activeTier = spin.bonusAwarded; triggerTier = activeTier; remaining = spin.spinsRemainingAfter;
    // Base Wilds are never carried into a newly triggered bonus.
    state.expandedStickyReels = []; state.sticky = blankMatrix(); state.marks = blankMarks(); state.markEnabled = false;
  }
  while (activeTier && remaining > 0 && payoutCents < capCents) {
    if (spins.length >= 2000) throw new Error('Bonus safety limit reached; round was not charged');
    state.markEnabled = activeTier === 'lux' || activeTier === 'old';
    const spin = playSpin(rng, activeTier, betCents, spins.length, remaining, payoutCents, capCents, state);
    spins.push(spin); payoutCents += spin.payoutCents; remaining = spin.spinsRemainingAfter;
    if (spin.upgradedTo) activeTier = spin.upgradedTo;
  }
  const round: Round = {
    id: 1, choice: { ...choice }, betCents: betCents, costCents: cost, payoutCents, capCents, maxWin: payoutCents >= capCents,
    godHits, godGrid, godShots, spins, initialRng: new Rng(seed).state, finalRng: rng.state, triggerTier, outcome: null,
  };
  return round;
}

const weightCache = new Map<string, { cumulative: bigint[]; total: bigint }>();
/** The advertised chance applies to the entire bonus entry event, not each scatter. */
export function bonusTriggerProbability(choice: Choice, betCents: number = CONFIG.defaultBetCents): number {
  if (choice.kind === 'spin') return 1 / CONFIG.bonusTriggerDenominator;
  if (choice.kind === 'boost') return 1 / CONFIG.boostedBonusTriggerDenominator;
  if (choice.kind === 'buy') return 1;
  if (choice.kind === 'god') return 0;
  const pool = MATH_MODEL.pools[`xbet-${choice.character}`], stake = MATH_MODEL.betsCents.indexOf(betCents);
  if (!pool || stake < 0) throw new Error('Math model does not cover this stake');
  const spec = pool.weights[stake], extra = new Set(spec.indices);
  let tickets = 0n;
  for (let i = 0; i < pool.seeds.length; i++) if (pool.triggerTiers[i]) tickets += BigInt(spec.baseline) + (extra.has(i) ? BigInt(spec.extra) : 0n);
  return Number(tickets) / Number(BigInt(spec.total));
}

function selectOutcome(word: () => number, betCents: number, choice: Choice): { pool: string; index: number; seed: number; expectedPayout: number } {
  if (!PAYLINE_REFERENCE_READY || !PAYLINES.length) throw new Error('Exact payline chart is not ready; round was not charged');
  const stake = MATH_MODEL.betsCents.indexOf(betCents);
  if (stake < 0 || MATH_MODEL.version !== CONFIG.version) throw new Error('Math model does not cover this stake');
  const poolName = choice.kind === 'spin' || choice.kind === 'boost'
    ? uniformTicket(word, BigInt(choice.kind === 'boost' ? CONFIG.boostedBonusTriggerDenominator : CONFIG.bonusTriggerDenominator)) === 0n ? 'natural-bonus' : 'ordinary'
    : choice.kind === 'buy' ? `buy-${choice.tier}` : choice.kind === 'xbet' ? `xbet-${choice.character}` : 'god';
  const pool = MATH_MODEL.pools[poolName];
  if (!pool || !pool.seeds.length || pool.payouts.length !== pool.seeds.length) throw new Error('Incomplete math catalogue');
  const cacheKey = `${poolName}:${stake}`;
  let cached = weightCache.get(cacheKey);
  if (!cached) {
    const spec = pool.weights[stake], extra = new Set(spec.indices);
    let total = 0n, weightedPayout = 0n;
    const cumulative = pool.seeds.map((_seed, i) => {
      const weight = BigInt(spec.baseline) + (extra.has(i) ? BigInt(spec.extra) : 0n);
      if (weight <= 0n || !money(pool.payouts[i][stake]) || pool.payouts[i][stake] > betCents * CONFIG.maxWin) throw new Error('Invalid math outcome');
      total += weight; weightedPayout += weight * BigInt(pool.payouts[i][stake]);
      return total;
    });
    if (total <= 0n || total !== BigInt(spec.total)) throw new Error('Invalid math ticket total');
    const targetNumerator = poolName === 'natural-bonus' ? BigInt(betCents) * 193n * 201n : poolName === 'ordinary' ? BigInt(betCents) * 193n : BigInt(costCents(betCents, pool.choice)) * 193n;
    const targetDenominator = poolName === 'natural-bonus' || poolName === 'ordinary' ? 400n : 200n;
    if (weightedPayout !== BigInt(spec.weightedPayout) || weightedPayout * targetDenominator !== total * targetNumerator) throw new Error('Math catalogue RTP equality failed');
    cached = { cumulative, total }; weightCache.set(cacheKey, cached);
  }
  const ticket = uniformTicket(word, cached.total);
  let lo = 0, hi = cached.cumulative.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (ticket < cached.cumulative[mid]) hi = mid; else lo = mid + 1; }
  return { pool: poolName, index: lo, seed: pool.seeds[lo], expectedPayout: pool.payouts[lo][stake] };
}

/** Paid outcomes are frozen, independently weighted full-round receipts. No wallet input affects selection. */
function settleWeighted(session: Session, choice: Choice, source: () => number, label: 'crypto' | 'fixture'): Session {
  if (session.pending) throw new Error('Finish the current round first');
  if (session.version !== 5 || !money(session.balanceCents) || !integer(session.rngState, 1, 0xffffffff) || !integer(session.sequence, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error('Invalid session');
  if (!validChoice(choice) || !(CONFIG.betsCents as readonly number[]).includes(session.betCents)) throw new Error('Invalid choice or bet');
  const cost = costCents(session.betCents, choice);
  if (session.balanceCents < cost) throw new Error('Insufficient credits');
  const draws: number[] = [];
  const word = () => {
    if (draws.length >= MAX_ENTROPY_WORDS) throw new Error('Entropy safety limit reached; round was not charged');
    const value = source(); if (!integer(value, 0, 0xffffffff)) throw new Error('Invalid entropy word');
    draws.push(value); return value;
  };
  const selected = selectOutcome(word, session.betCents, choice);
  const rawChoice = MATH_MODEL.pools[selected.pool].choice;
  const pool = MATH_MODEL.pools[selected.pool];
  const generated = simulateRound(selected.seed, session.betCents, rawChoice, pool.entryScatters?.[selected.index]);
  if (generated.payoutCents !== selected.expectedPayout || (selected.pool === 'ordinary' && generated.triggerTier !== null) || (selected.pool === 'natural-bonus' && generated.triggerTier === null)) throw new Error('Math catalogue changed; round was not charged');
  const chain = new Rng(session.rngState);
  for (const draw of draws) { chain.state = (chain.state ^ draw) >>> 0 || 0x6d2b79f5; chain.next(); }
  const round: Round = { ...generated, id: session.sequence + 1, choice: { ...choice }, costCents: cost, initialRng: session.rngState, finalRng: chain.state, outcome: { pool: selected.pool, index: selected.index, seed: selected.seed, draws, source: label } };
  const balanceCents = session.balanceCents - cost + round.payoutCents;
  if (!money(balanceCents)) throw new Error('Credit limit reached; round was not charged');
  return { ...session, balanceCents, rngState: chain.state, sequence: round.id, pending: round, history: [...session.history, round].slice(-12) };
}

/** Production paid play. Fresh unbiased CSPRNG words; no balance-adaptive odds. */
export function playRound(session: Session, choice: Choice): Session {
  const value = new Uint32Array(1);
  return settleWeighted(session, choice, () => { globalThis.crypto.getRandomValues(value); return value[0]; }, 'crypto');
}

/** Deterministic QA factory. The UI calls this only from its development reset hook. */
export function playFixtureRound(session: Session, choice: Choice): Session {
  const rng = new Rng(session.rngState);
  return settleWeighted(session, choice, () => { rng.next(); return rng.state; }, 'fixture');
}

export function acknowledgeRound(session: Session): Session { return session.pending ? { ...session, pending: null } : session; }

function validChoice(c: unknown): c is Choice {
  if (!c || typeof c !== 'object') return false;
  const choice = c as Choice;
  return choice.kind === 'spin' || choice.kind === 'boost' || choice.kind === 'god' || (choice.kind === 'buy' && TIER_ORDER.includes(choice.tier)) || (choice.kind === 'xbet' && CHARS.includes(choice.character));
}
function validRound(r: unknown): r is Round {
  if (!r || typeof r !== 'object') return false;
  const v = r as Round;
  if (!integer(v.id, 1, Number.MAX_SAFE_INTEGER) || !validChoice(v.choice) || !(CONFIG.betsCents as readonly number[]).includes(v.betCents) || !money(v.costCents) || !money(v.payoutCents) || v.costCents !== costCents(v.betCents, v.choice) || v.capCents !== v.betCents * CONFIG.maxWin || v.payoutCents > v.capCents || v.maxWin !== (v.payoutCents === v.capCents)) return false;
  if (!integer(v.initialRng, 1, 0xffffffff) || !integer(v.finalRng, 1, 0xffffffff) || !Array.isArray(v.spins) || !Array.isArray(v.godHits) || v.godHits.length > CONFIG.godShots || v.godHits.some(hit => typeof hit !== 'boolean') || (v.triggerTier !== null && !TIER_ORDER.includes(v.triggerTier))) return false;
  // Strict receipt validation by deterministic replay also checks every grid, shot, coin and ledger.
  try {
    if (!v.outcome || !['crypto', 'fixture'].includes(v.outcome.source) || !Array.isArray(v.outcome.draws) || !v.outcome.draws.length || v.outcome.draws.length > MAX_ENTROPY_WORDS || v.outcome.draws.some(word => !integer(word, 0, 0xffffffff))) return false;
    const seedSession = { ...createSession(v.initialRng, v.costCents), betCents: v.betCents, sequence: v.id - 1 };
    let replay: Session;
    if (v.outcome.source === 'fixture') replay = playFixtureRound(seedSession, v.choice);
    else {
      let at = 0;
      replay = settleWeighted(seedSession, v.choice, () => { if (at >= v.outcome!.draws.length) throw new Error('Truncated entropy'); return v.outcome!.draws[at++]; }, 'crypto');
      if (at !== v.outcome.draws.length) return false;
    }
    return JSON.stringify(replay.pending) === JSON.stringify(v);
  } catch { return false; }
}

export function deserializeSession(raw: string): Session | null {
  try {
    const s = JSON.parse(raw) as Session;
    if (s.version !== 5 || !money(s.balanceCents) || !(CONFIG.betsCents as readonly number[]).includes(s.betCents) || !integer(s.rngState, 1, 0xffffffff) || !integer(s.sequence, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(s.history) || s.history.length > 12) return null;
    if (s.pending !== null && !validRound(s.pending)) return null;
    if (!s.history.every(validRound)) return null;
    for (let i = 1; i < s.history.length; i++) if (s.history[i].id !== s.history[i - 1].id + 1 || s.history[i].initialRng !== s.history[i - 1].finalRng) return null;
    const last = s.history.at(-1);
    if ((s.sequence === 0 && (last || s.pending)) || (s.sequence > 0 && (!last || last.id !== s.sequence || last.finalRng !== s.rngState))) return null;
    if (s.pending && JSON.stringify(s.pending) !== JSON.stringify(last)) return null;
    let ledgerBalance = s.balanceCents - s.history.reduce((net, r) => net + r.payoutCents - r.costCents, 0);
    if (!money(ledgerBalance)) return null;
    for (const receipt of s.history) {
      if (ledgerBalance < receipt.costCents) return null;
      ledgerBalance += receipt.payoutCents - receipt.costCents;
      if (!money(ledgerBalance)) return null;
    }
    if (ledgerBalance !== s.balanceCents) return null;
    return s;
  } catch { return null; }
}

/** Legacy settled virtual-wallet import, with bounded structural/ledger checks.
 * It never reinterprets a pending old receipt under the new payline mathematics.
 * This is not an authentication mechanism or a replay of obsolete outcomes. */
export function settledLegacyWallet(raw: string): { balanceCents: number; betCents: number } | null {
  try {
    const s = JSON.parse(raw);
    if (![1, 2, 3, 4].includes(s.version) || s.pending !== null || !money(s.balanceCents) || !(CONFIG.betsCents as readonly number[]).includes(s.betCents) || !integer(s.rngState, 1, 0xffffffff) || !integer(s.sequence, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(s.history) || s.history.length > 12) return null;
    let previous: any;
    for (const r of s.history) {
      if (!r || !integer(r.id, 1, Number.MAX_SAFE_INTEGER) || !validChoice(r.choice) || !(CONFIG.betsCents as readonly number[]).includes(r.betCents) || !money(r.costCents) || r.costCents !== costCents(r.betCents, r.choice) || !money(r.payoutCents) || r.capCents !== r.betCents * CONFIG.maxWin || r.payoutCents > r.capCents || r.maxWin !== (r.payoutCents === r.capCents) || !integer(r.initialRng, 1, 0xffffffff) || !integer(r.finalRng, 1, 0xffffffff) || !Array.isArray(r.spins) || r.spins.length > 2000 || !Array.isArray(r.godHits) || r.godHits.length > CONFIG.godShots || r.godHits.some((v: unknown) => typeof v !== 'boolean')) return null;
      if (previous && (r.id !== previous.id + 1 || r.initialRng !== previous.finalRng)) return null;
      let total = 0;
      for (const spin of r.spins) {
        if (!Array.isArray(spin.cascades) || spin.cascades.length > 500 || !money(spin.payoutCents) || !money(spin.roundTotalCents)) return null;
        let spinTotal = 0;
        for (const c of spin.cascades) {
          if (!Array.isArray(c.wins) || c.wins.length > 30 || !Array.isArray(c.features) || c.features.length > 30 || !money(c.payoutCents)) return null;
          let paid = 0;
          for (const w of c.wins) { if (!money(w.payoutCents)) return null; paid += w.payoutCents; }
          for (const f of c.features) {
            if (!money(f.payoutCents) || !Array.isArray(f.coins) || f.coins.length > 30 || f.coins.some((coin: any) => !money(coin.payoutCents)) || f.coins.reduce((n: number, coin: any) => n + coin.payoutCents, 0) !== f.payoutCents) return null;
            paid += f.payoutCents;
          }
          if (paid !== c.payoutCents) return null;
          spinTotal += paid;
        }
        total += spinTotal;
        if (spinTotal !== spin.payoutCents || spin.roundTotalCents !== total || total > r.capCents) return null;
      }
      if (r.godHits.some(Boolean) ? r.payoutCents !== r.capCents || r.spins.length !== 0 : total !== r.payoutCents) return null;
      previous = r;
    }
    if (s.sequence === 0 ? s.history.length !== 0 : !previous || previous.id !== s.sequence || previous.finalRng !== s.rngState) return null;
    let balance = s.balanceCents - s.history.reduce((n: number, r: any) => n + r.payoutCents - r.costCents, 0);
    if (!money(balance)) return null;
    for (const r of s.history) { if (balance < r.costCents) return null; balance += r.payoutCents - r.costCents; if (!money(balance)) return null; }
    return balance === s.balanceCents ? { balanceCents: s.balanceCents, betCents: s.betCents } : null;
  } catch { return null; }
}
