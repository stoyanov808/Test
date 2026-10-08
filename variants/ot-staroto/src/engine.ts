import type { Cascade, Cell, Character, Choice, Coin, Feature, Grid, Matrix, Regular, Round, Session, Spin, Tier, Win } from './types';

export const REGULARS: Regular[] = ['bottle', 'cash', 'chain', 'cassette', 'sneaker', 'crown'];
export const TIER_ORDER: Tier[] = ['ruse', 'lux', 'edge', 'old'];
export const BONUS_NAMES: Record<Tier, string> = { ruse: 'Русенско Варено', lux: 'ЛУКС', edge: 'Ръба са обажда', old: 'ОТ СТАРОТО' };
export const TIER_CHARACTERS: Record<Tier, Character[]> = { ruse: ['left'], lux: ['right'], edge: ['middle'], old: ['left', 'middle', 'right'] };
export const CONFIG = {
  version: 1, reels: 6, rows: 5, maxWin: 19999, minimumNaturalSymbols: 7,
  betsCents: [10, 20, 50, 100, 200, 500, 1000, 2000], defaultBetCents: 20, initialBalanceCents: 1000000,
  buyCosts: { ruse: 35, lux: 250, edge: 600, old: 2500 }, xbetCosts: { left: 1.5, right: 45, middle: 4.5 }, godCost: 3000,
  godShotChance: .0256, godShots: 6,
  weights: {
    base: { scatter: .009, left: .0015, middle: .00025, right: .0003 },
    bonus: { scatter: .018, left: .002, middle: .0221, right: .008 },
    super: { scatter: .018, left: .002, middle: .0065, right: .008 },
  },
  shooterRepeatChance: .9, shooterExistingWildChance: .75,
  paytable: {
    bottle: { 8: .03, 10: .07, 12: .2 }, cash: { 8: .04, 10: .1, 12: .3 },
    chain: { 8: .06, 10: .15, 12: .4 }, cassette: { 8: .08, 10: .2, 12: .6 },
    sneaker: { 8: .12, 10: .3, 12: .8 }, crown: { 8: .2, 10: .5, 12: 1.4 },
  } satisfies Record<Regular, Record<8 | 10 | 12, number>>,
} as const;

const CHARS: Character[] = ['left', 'middle', 'right'];
const MONEY_LIMIT = 9_000_000_000_000;
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

export function costCents(betCents: number, choice: Choice): number {
  if (!integer(betCents, 1, 100000)) throw new Error('Invalid bet');
  const factor = choice.kind === 'spin' ? 1 : choice.kind === 'god' ? CONFIG.godCost : choice.kind === 'buy' ? CONFIG.buyCosts[choice.tier] : CONFIG.xbetCosts[choice.character];
  if (!Number.isFinite(factor) || factor < 1 || factor > 3000) throw new Error('Invalid choice');
  return Math.round(betCents * factor);
}

export function createSession(seed = 0x59a10, balanceCents: number = CONFIG.initialBalanceCents): Session {
  if (!money(balanceCents)) throw new Error('Invalid balance');
  return { version: 1, balanceCents, betCents: CONFIG.defaultBetCents, rngState: new Rng(seed).state, sequence: 0, pending: null, history: [] };
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
  return { grid, multipliers };
}

export function wildGlobal(grid: Grid, multipliers: Matrix): number {
  return Math.max(1, allCells().reduce((sum, c) => sum + (grid[c.reel][c.row] === 'wild' ? multipliers[c.reel][c.row] || 1 : 0), 0));
}

export function evaluate(grid: Grid, multipliers: Matrix, betCents: number, budgetCents = MONEY_LIMIT): Win[] {
  const globalMultiplier = wildGlobal(grid, multipliers);
  const positions = allCells();
  let remaining = budgetCents;
  return REGULARS.flatMap(symbol => {
    const actual = positions.filter(c => grid[c.reel][c.row] === symbol);
    if (actual.length < CONFIG.minimumNaturalSymbols) return [];
    const cells = positions.filter(c => grid[c.reel][c.row] === symbol || grid[c.reel][c.row] === 'wild');
    if (cells.length < 8) return [];
    const bracket = cells.length >= 12 ? 12 : cells.length >= 10 ? 10 : 8;
    const baseMultiplier = CONFIG.paytable[symbol][bracket];
    // Multipliers and hundredth-bet paytables are integer cents; no floating balance ledger.
    const payoutCents = Math.min(remaining, Math.round(betCents * Math.round(baseMultiplier * 100) * globalMultiplier / 100));
    remaining -= payoutCents;
    return [{ symbol, cells, count: cells.length, baseMultiplier, globalMultiplier, payoutCents }];
  });
}

export interface FeatureContext {
  grid: Grid; multipliers: Matrix; sticky: Matrix; marks: boolean[][];
  tier: Tier | null; betCents: number; budgetCents?: number;
}
export interface FeatureResult {
  feature: Feature; grid: Grid; multipliers: Matrix; sticky: Matrix; marks: boolean[][];
}

function coinValue(rng: Rng): number {
  const values = [1, 2, 3, 5, 10, 20, 50, 100, 250, 500];
  const weights = [6500, 2000, 700, 400, 200, 100, 60, 25, 10, 5];
  let ticket = rng.int(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < values.length; i++) { ticket -= weights[i]; if (ticket < 0) return values[i]; }
  return 500;
}

/** Resolves one badge once. Rendering replays this receipt; it never rolls another target. */
export function resolveFeature(which: Character, source: Cell, context: FeatureContext, rng: Rng): FeatureResult {
  const grid = cloneGrid(context.grid), multipliers = cloneMatrix(context.multipliers), sticky = cloneMatrix(context.sticky), marks = context.marks.map(column => [...column]);
  grid[source.reel][source.row] = randomRegular(rng);
  multipliers[source.reel][source.row] = 0;
  const targets: Cell[] = [], hits: Feature['hits'] = [], coins: Coin[] = [];
  let payoutCents = 0;
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
  } else if (which === 'middle' && eligible.length) {
    const shots = 3 + rng.int(5);
    const existing = eligible.filter(c => grid[c.reel][c.row] === 'wild');
    for (let i = 0; i < shots; i++) {
      const c = i && rng.next() < CONFIG.shooterRepeatChance ? targets[i - 1] : !i && existing.length && rng.next() < CONFIG.shooterExistingWildChance ? existing[rng.int(existing.length)] : eligible[rng.int(eligible.length)];
      const repeated = grid[c.reel][c.row] === 'wild';
      const multiplier = repeated ? (multipliers[c.reel][c.row] || 1) * 2 : 1;
      grid[c.reel][c.row] = 'wild'; multipliers[c.reel][c.row] = multiplier;
      // A shot upgrades an existing left-sticky Wild; new shooter Wilds are transient.
      if (sticky[c.reel][c.row]) sticky[c.reel][c.row] = multiplier;
      targets.push(c); hits.push({ cell: c, multiplier, repeated });
    }
  } else if (which === 'right') {
    const cells = allCells().filter(c => marks[c.reel][c.row]);
    let globalCoinFactor = 1;
    for (const c of cells) {
      const chance = rng.next();
      let kind: Coin['kind'] = chance < .935 ? 'value' : chance < .945 ? 'collector' : chance < .995 ? 'multiplier' : 'global';
      // One collector and one global coin event per reveal prevent exponential
      // self-collection; extra rolls become ordinary values, shown honestly.
      if ((kind === 'collector' || kind === 'global') && coins.some(c => c.kind === kind)) kind = 'value';
      const value = kind === 'value' ? coinValue(rng) : kind === 'collector' ? 0 : [2, 3, 5][rng.int(kind === 'global' ? 2 : 3)];
      coins.push({ cell: c, kind, value, payoutCents: 0 });
      targets.push(c); marks[c.reel][c.row] = false;
      if (kind === 'global') globalCoinFactor = value;
    }
    const values = coins.filter(c => c.kind === 'value');
    const localFactors = new Map<Coin, number>();
    for (const modifier of coins.filter(c => c.kind === 'multiplier')) {
      if (!values.length) continue;
      const recipient = values[rng.int(values.length)];
      modifier.target = { ...recipient.cell };
      localFactors.set(recipient, Math.max(localFactors.get(recipient) || 1, modifier.value));
    }
    for (const value of values) value.payoutCents = Math.round(context.betCents * value.value * (localFactors.get(value) || 1) * globalCoinFactor);
    const collection = values.reduce((sum, c) => sum + c.payoutCents, 0);
    for (const collector of coins.filter(c => c.kind === 'collector')) {
      collector.value = collection / context.betCents;
      collector.payoutCents = collection;
    }
    let budget = context.budgetCents ?? MONEY_LIMIT;
    for (const coin of coins) {
      coin.payoutCents = Math.min(budget, coin.payoutCents);
      budget -= coin.payoutCents; payoutCents += coin.payoutCents;
    }
  }
  return {
    grid, multipliers, sticky, marks,
    feature: { character: which, source: { ...source }, targets, hits, coins, globalMultiplier: wildGlobal(grid, multipliers), gridAfter: cloneGrid(grid), wildMultipliersAfter: cloneMatrix(multipliers), payoutCents },
  };
}

export function bonusAward(scatters: number): Tier | null {
  return scatters >= 6 ? 'old' : scatters === 5 ? 'edge' : scatters === 4 ? 'lux' : scatters === 3 ? 'ruse' : null;
}
export function retrigger(scatters: number, tier: Tier): { addedSpins: number; upgradedTo: Tier | null } {
  const candidate = scatters >= 6 ? 'old' : scatters === 5 ? 'edge' : scatters === 4 ? 'lux' : null;
  return { addedSpins: scatters >= 6 ? 10 : scatters >= 3 ? 5 : scatters === 2 ? 2 : 0, upgradedTo: candidate && TIER_ORDER.indexOf(candidate) > TIER_ORDER.indexOf(tier) ? candidate : null };
}

interface State { sticky: Matrix; marks: boolean[][]; markEnabled: boolean }
function playSpin(rng: Rng, tier: Tier | null, betCents: number, index: number, before: number, roundTotal: number, capCents: number, state: State, guaranteed?: Character): Spin {
  let { grid, multipliers } = makeGrid(rng, tier, state.sticky);
  if (guaranteed) {
    const candidates = allCells().filter(c => !state.sticky[c.reel][c.row]);
    const chosen = candidates[rng.int(candidates.length)];
    grid[chosen.reel][chosen.row] = guaranteed;
  }
  const initialGrid = cloneGrid(grid), initialWildMultipliers = cloneMatrix(multipliers);
  const cascades: Cascade[] = [], presentCharacters: Character[] = [];
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
      const result = resolveFeature(which, c, { grid, multipliers, sticky: state.sticky, marks: state.marks, tier, betCents, budgetCents: capCents - roundTotal - payoutCents }, rng);
      grid = result.grid; multipliers = result.multipliers; state.sticky = result.sticky; state.marks = result.marks;
      features.push(result.feature); payoutCents += result.feature.payoutCents;
    };
    for (const { c, which } of sources) if (which !== 'right') applyFeature(c, which);
    let wins = evaluate(grid, multipliers, betCents, capCents - roundTotal - payoutCents);
    // A right badge remains visible while combinations clear; its coin reveal follows
    // those real marked boxes rather than arriving before any boxes can be marked.
    if (!wins.length) {
      for (const { c, which } of sources) if (which === 'right') applyFeature(c, which);
      wins = evaluate(grid, multipliers, betCents, capCents - roundTotal - payoutCents);
    }
    const winPayout = wins.reduce((sum, win) => sum + win.payoutCents, 0);
    payoutCents += winPayout;
    const combined = new Map<string, Cell>();
    for (const win of wins) for (const c of win.cells) if (!state.sticky[c.reel][c.row]) combined.set(key(c), c);
    const removed = [...combined.values()];
    if (state.markEnabled) for (const c of removed) state.marks[c.reel][c.row] = true;
    const cascade: Cascade = {
      index: cascadeIndex, grid: incoming, wildMultipliers: incomingMultipliers, stickyWilds: cloneMatrix(state.sticky), features,
      resolvedGrid: cloneGrid(grid), resolvedWildMultipliers: cloneMatrix(multipliers), marks: state.marks.map(column => [...column]),
      wins, removed, globalMultiplier: wildGlobal(grid, multipliers), payoutCents: features.reduce((sum, f) => sum + f.payoutCents, 0) + winPayout,
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
    cascade.refilledGrid = cloneGrid(grid); cascade.refilledWildMultipliers = cloneMatrix(multipliers);
  }
  const scatters = grid.flat().filter(s => s === 'scatter').length;
  const awarded = tier ? null : bonusAward(scatters);
  const extension = tier ? retrigger(scatters, tier) : { addedSpins: 0, upgradedTo: null };
  return {
    index, tier, initialGrid, initialWildMultipliers, cascades, finalGrid: cloneGrid(grid), finalWildMultipliers: cloneMatrix(multipliers), marks: state.marks.map(column => [...column]), presentCharacters,
    scatters, spinsRemainingBefore: before, spinsRemainingAfter: tier ? Math.max(0, before - 1 + extension.addedSpins) : awarded ? awarded === 'old' ? 15 : 10 : 0,
    addedSpins: extension.addedSpins, upgradedTo: extension.upgradedTo, bonusAwarded: awarded, payoutCents, roundTotalCents: roundTotal + payoutCents, maxWin: roundTotal + payoutCents >= capCents,
  };
}

export function playRound(session: Session, choice: Choice): Session {
  if (session.pending) throw new Error('Finish the current round first');
  if (!money(session.balanceCents) || !integer(session.rngState, 1, 0xffffffff) || !integer(session.sequence, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error('Invalid session');
  if (!(CONFIG.betsCents as readonly number[]).includes(session.betCents)) throw new Error('Invalid bet');
  const cost = costCents(session.betCents, choice);
  if (session.balanceCents < cost) throw new Error('Insufficient credits');
  const rng = new Rng(session.rngState), capCents = session.betCents * CONFIG.maxWin;
  const state: State = { sticky: blankMatrix(), marks: blankMarks(), markEnabled: false };
  const spins: Spin[] = [], godHits: boolean[] = [];
  if (choice.kind === 'god') {
    for (let i = 0; i < CONFIG.godShots; i++) {
      const hit = rng.next() < CONFIG.godShotChance;
      godHits.push(hit); if (hit) break;
    }
  }
  let payoutCents = godHits.some(Boolean) ? capCents : 0;
  let activeTier: Tier | null = choice.kind === 'buy' ? choice.tier : null;
  let triggerTier: Tier | null = activeTier;
  let remaining = activeTier ? activeTier === 'old' ? 15 : 10 : 0;
  if (!payoutCents && !activeTier) {
    const spin = playSpin(rng, null, session.betCents, spins.length, 0, payoutCents, capCents, state, choice.kind === 'xbet' ? choice.character : undefined);
    spins.push(spin); payoutCents += spin.payoutCents;
    activeTier = spin.bonusAwarded; triggerTier = activeTier; remaining = spin.spinsRemainingAfter;
    // Base Wilds are never carried into a newly triggered bonus.
    state.sticky = blankMatrix(); state.marks = blankMarks(); state.markEnabled = false;
  }
  while (activeTier && remaining > 0 && payoutCents < capCents) {
    if (spins.length >= 2000) throw new Error('Bonus safety limit reached; round was not charged');
    state.markEnabled = activeTier === 'lux' || activeTier === 'old';
    const spin = playSpin(rng, activeTier, session.betCents, spins.length, remaining, payoutCents, capCents, state);
    spins.push(spin); payoutCents += spin.payoutCents; remaining = spin.spinsRemainingAfter;
    if (spin.upgradedTo) activeTier = spin.upgradedTo;
  }
  const round: Round = {
    id: session.sequence + 1, choice: { ...choice }, betCents: session.betCents, costCents: cost, payoutCents, capCents, maxWin: payoutCents >= capCents,
    godHits, spins, initialRng: session.rngState, finalRng: rng.state, triggerTier,
  };
  const balanceCents = session.balanceCents - cost + payoutCents;
  if (!money(balanceCents)) throw new Error('Credit limit reached; round was not charged');
  return { ...session, balanceCents, rngState: rng.state, sequence: round.id, pending: round, history: [...session.history, round].slice(-12) };
}

export function acknowledgeRound(session: Session): Session { return session.pending ? { ...session, pending: null } : session; }

function validChoice(c: unknown): c is Choice {
  if (!c || typeof c !== 'object') return false;
  const choice = c as Choice;
  return choice.kind === 'spin' || choice.kind === 'god' || (choice.kind === 'buy' && TIER_ORDER.includes(choice.tier)) || (choice.kind === 'xbet' && CHARS.includes(choice.character));
}
function validRound(r: unknown): r is Round {
  if (!r || typeof r !== 'object') return false;
  const v = r as Round;
  if (!integer(v.id, 1, Number.MAX_SAFE_INTEGER) || !validChoice(v.choice) || !(CONFIG.betsCents as readonly number[]).includes(v.betCents) || !money(v.costCents) || !money(v.payoutCents) || v.costCents !== costCents(v.betCents, v.choice) || v.capCents !== v.betCents * CONFIG.maxWin || v.payoutCents > v.capCents || v.maxWin !== (v.payoutCents === v.capCents)) return false;
  if (!integer(v.initialRng, 1, 0xffffffff) || !integer(v.finalRng, 1, 0xffffffff) || !Array.isArray(v.spins) || !Array.isArray(v.godHits) || v.godHits.length > CONFIG.godShots || v.godHits.some(hit => typeof hit !== 'boolean') || (v.triggerTier !== null && !TIER_ORDER.includes(v.triggerTier))) return false;
  // Strict receipt validation by deterministic replay also checks every grid, shot, coin and ledger.
  try {
    const seedSession = { ...createSession(v.initialRng, v.costCents), betCents: v.betCents, sequence: v.id - 1 };
    return JSON.stringify(playRound(seedSession, v.choice).pending) === JSON.stringify(v);
  } catch { return false; }
}

export function deserializeSession(raw: string): Session | null {
  try {
    const s = JSON.parse(raw) as Session;
    if (s.version !== 1 || !money(s.balanceCents) || !(CONFIG.betsCents as readonly number[]).includes(s.betCents) || !integer(s.rngState, 1, 0xffffffff) || !integer(s.sequence, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(s.history) || s.history.length > 12) return null;
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
