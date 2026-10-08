import { carURL, characterSprite, coinURL, sceneURL, symbolSprite } from './art';
import { REGULARS, TIER_CHARACTERS } from './engine';
import type { Cell, Character, Coin, CoinCollection, Feature, Grid, Matrix, Round, Spin, SymbolId, Tier } from './types';

const W = 1240, H = 900;
const BOARD = { x: 200, y: 170, w: 840, h: 630 };
const COLS = 6, ROWS = 5, CW = BOARD.w / COLS, CH = BOARD.h / ROWS;
const CHARACTERS: Character[] = ['left', 'middle', 'right'];
const SYMBOLS: SymbolId[] = [...REGULARS, ...CHARACTERS, 'wild', 'scatter', 'max'];
const cloneGrid = (grid: Grid): Grid => grid.map(column => [...column]);
const cloneMatrix = (matrix: Matrix): Matrix => matrix.map(column => [...column]);
const emptyMatrix = (): Matrix => Array.from({ length: COLS }, () => Array(ROWS).fill(0));
const emptyMarks = (): boolean[][] => Array.from({ length: COLS }, () => Array(ROWS).fill(false));
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (p: number): number => p * p * p * (10 + p * (-15 + p * 6));
const key = (cell: Cell): string => `${cell.reel}:${cell.row}`;
const cloneCoin = (coin: Coin): Coin => ({ ...coin, cell: { ...coin.cell }, ...(coin.target ? { target: { ...coin.target } } : {}) });
const cloneCollection = (collection: CoinCollection): CoinCollection => ({ ...collection, collector: { ...collection.collector }, sources: collection.sources.map(cloneCoin) });
const center = (cell: Cell) => ({ x: BOARD.x + (cell.reel + .5) * CW, y: BOARD.y + (cell.row + .5) * CH });
const tierCharacters = (tier: Tier | null): Character[] => tier ? [...TIER_CHARACTERS[tier]] : [];
const tierScatters = (tier: Tier): number => ({ ruse: 3, lux: 4, edge: 5, old: 6 })[tier];
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return value;
};
const unit = (seed: number, salt: number): number => {
  let value = (seed + Math.imul(salt, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  return ((value ^ value >>> 15) >>> 0) / 0x100000000;
};

interface DropCell extends Cell {
  symbol: SymbolId; sourceRow: number; start: number; flight: number; settle: number;
  drift: number; lean: number; phase: number; curve: number; stationary: boolean; sticky: boolean;
}
export interface MovingSymbol extends DropCell {
  x: number; y: number; progress: number; settleProgress: number; rotation: number; scaleX: number; scaleY: number;
}
interface DropPlan { cells: DropCell[]; duration: number }
interface Effect {
  kind: 'reveal' | 'wild' | 'shot' | 'coin' | 'modifier' | 'collect' | 'coin-clear' | 'tier' | 'god' | 'scatter';
  progress: number; source?: Cell; target?: Cell; character?: Character; from?: SymbolId; to?: SymbolId;
  label?: string; value?: number; repeated?: boolean; tier?: Tier; shot?: number; hit?: boolean; coinKind?: Coin['kind']; recipient?: Cell; recipients?: Cell[];
  coin?: Coin; collection?: CoinCollection;
}
export interface RendererUpdate {
  spin: Spin | null; round: Round | null; global: number; remaining: number; tier: Tier | null; totalCents: number;
}
export interface RendererInspection extends Omit<RendererUpdate, 'spin' | 'round'> {
  stage: string; grid: Grid; wildMultipliers: Matrix; marks: boolean[][];
  inactiveWilds: Cell[];
  activeCharacters: Character[]; movingCells: MovingSymbol[]; effect: Effect | null; coins: Coin[];
  coinWave: number | null; coinPhase: 'reveal' | 'revealed' | 'modifier' | 'collect' | 'clear' | 'award' | null;
  coinRevealRemaining: number; collection: CoinCollection | null; clearedCoins: Cell[];
  godGrid: Grid | null; godShots: Round['godShots'];
  coinFlips: { coin: Coin; progress: number }[];
}
export interface RendererOptions {
  onUpdate?: (view: RendererUpdate) => void;
  onSound?: (cue: string) => void;
}

/** Receipt-derived visual timing never advances or replaces the engine RNG. */
function planDrop(grid: Grid, seed: string, turbo: boolean, removed?: Set<string>, stickyWilds: Matrix = emptyMatrix()): DropPlan {
  const refill = !!removed;
  const cells = grid.flatMap((column, reel) => {
    const freeRows = Array.from({ length: ROWS }, (_, row) => row).filter(row => !stickyWilds[reel]?.[row]);
    const survivors = freeRows.filter(row => !removed?.has(`${reel}:${row}`));
    const added = freeRows.length - survivors.length;
    const planned = column.map((symbol, row): DropCell => {
      const sticky = !!stickyWilds[reel]?.[row];
      const freeIndex = freeRows.indexOf(row);
      const sourceRow = sticky ? row : !refill ? row - ROWS - .85 : freeIndex < added ? freeIndex - added - .85 : survivors[freeIndex - added];
      const stationary = row === sourceRow;
      const identity = hash(`${seed}:${reel}:${row}:${symbol}:${sourceRow}`);
      const distance = row - sourceRow;
      const factor = refill ? .62 + .38 * Math.sqrt(clamp(distance / (ROWS + .85))) : 1;
      return {
        reel, row, symbol, sourceRow, stationary, sticky,
        start: stationary ? 0 : Math.round((refill ? 0 : turbo ? 70 : 110) + reel * (refill ? turbo ? 8 : 12 : turbo ? 35 : 74) + (ROWS - 1 - row) * (turbo ? 8 : 15) + unit(identity, 1) * (turbo ? 9 : 15)),
        flight: stationary ? 0 : Math.round((refill ? turbo ? 235 : 395 : turbo ? 285 : 470) * factor * (.93 + .14 * unit(identity, 2))),
        settle: stationary ? 0 : Math.round(turbo ? 55 + 20 * unit(identity, 3) : 88 + 30 * unit(identity, 3)),
        drift: 1.3 + 2.1 * unit(identity, 4), lean: .026 + .026 * unit(identity, 5),
        phase: unit(identity, 6) * Math.PI * 2, curve: .94 + .14 * unit(identity, 7),
      };
    });
    for (let index = freeRows.length - 2; index >= 0; index--) {
      const cell = planned[freeRows[index]], below = planned[freeRows[index + 1]];
      if (!cell.stationary) cell.start = Math.max(cell.start, below.start + below.flight + (turbo ? 3 : 6) - cell.flight);
    }
    return planned;
  });
  return { cells, duration: Math.max(...cells.map(cell => cell.start + cell.flight + cell.settle)) + (turbo ? 10 : 16) };
}

function dropFrames(plan: DropPlan, elapsed: number, reduced: boolean): MovingSymbol[] {
  const frames = plan.cells.map((cell): MovingSymbol => {
    const p = cell.stationary ? 1 : clamp((elapsed - cell.start) / cell.flight);
    const s = cell.stationary ? 1 : clamp((elapsed - cell.start - cell.flight) / cell.settle);
    const flightEnvelope = p === 1 ? 0 : Math.sin(p * Math.PI), settleEnvelope = s === 1 ? 0 : Math.sin(s * Math.PI) * (1 - s) ** 2;
    const compression = .06 * Math.sin(s * Math.PI) * (1 - s);
    const target = center(cell);
    return {
      ...cell, progress: p, settleProgress: s,
      x: target.x + (reduced || cell.stationary ? 0 : flightEnvelope * cell.drift * Math.sin(p * Math.PI * 3 + cell.phase) + settleEnvelope * 2 * Math.sin(s * Math.PI * 4)),
      y: p === 1 ? target.y : BOARD.y + (cell.sourceRow + .5) * CH + (cell.row - cell.sourceRow) * CH * smooth(p ** cell.curve),
      rotation: reduced || cell.stationary ? 0 : flightEnvelope * cell.lean * Math.sin(p * Math.PI * 5 + cell.phase) + settleEnvelope * .026 * Math.sin(s * Math.PI * 4),
      scaleX: reduced || cell.stationary ? 1 : 1 + compression,
      scaleY: reduced || cell.stationary ? 1 : 1 - compression * .85,
    };
  });
  for (let reel = 0; reel < COLS; reel++) {
    const free = frames.filter(cell => cell.reel === reel && !cell.sticky);
    for (let index = free.length - 2; index >= 0; index--) free[index].y = Math.min(free[index].y, free[index + 1].y - CH * .83);
  }
  return frames;
}

/** A canvas replay of committed outcomes. It does not calculate a win or mutate a receipt. */
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imageReady = new Map<string, Promise<void>>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private grid: Grid = Array.from({ length: COLS }, (_, reel) => Array.from({ length: ROWS }, (_, row) => REGULARS[(reel * 2 + row) % REGULARS.length]));
  private wildMultipliers = emptyMatrix();
  private marks = emptyMarks();
  private inactiveWilds = new Set<string>();
  private activeCharacters: Character[] = [];
  private moving: MovingSymbol[] = [];
  private effect: Effect | null = null;
  private revealedCoins: Coin[] = [];
  private coinsFinal = false;
  private coinWave: number | null = null;
  private coinPhase: RendererInspection['coinPhase'] = null;
  private coinRevealRemaining = 0;
  private collection: CoinCollection | null = null;
  private clearedCoins: Cell[] = [];
  private coinPositions = new Set<string>();
  private coinFlips: { coin: Coin; progress: number }[] = [];
  private clearing = new Set<string>();
  private clearProgress = 0;
  private highlight = new Set<string>();
  private round: Round | null = null;
  private spin: Spin | null = null;
  private global = 1;
  private remaining = 0;
  private tier: Tier | null = null;
  private totalCents = 0;
  private stage = 'idle';
  private language: 'bg' | 'en' = 'bg';
  private skipped = false;
  private destroyed = false;
  private playing = false;
  private animationFrame = 0;
  private finishAnimation: (() => void) | null = null;
  private deviceRatio = 1;
  private godCarProgress = 0;
  private godCutscene = false;
  private godResolved: boolean[] = [];
  private godGrid: Grid | null = null;
  private godShotMarks: Cell[] = [];
  private sceneReady: Promise<void>;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: RendererOptions = {}) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser needs Canvas 2D support.');
    this.ctx = context;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'ОТ СТАРОТО — шест колони, пет реда');
    canvas.removeAttribute('title');
    canvas.style.cursor = 'default';
    canvas.style.aspectRatio = `${W} / ${H}`;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.sceneReady = this.preload();
    this.resize();
    void this.sceneReady.then(() => { if (!this.playing) this.draw(); }).catch(() => { this.stage = 'asset-error'; this.draw(); });
  }

  setLanguage(language: 'bg' | 'en'): void {
    this.language = language;
    this.canvas.setAttribute('aria-label', language === 'bg' ? 'ОТ СТАРОТО — шест колони, пет реда' : 'OT STAROTO — six columns, five rows');
    this.draw();
  }

  setIdle(grid?: Grid, multipliers?: Matrix, marks?: boolean[][], inactiveWilds: Cell[] = []): void {
    if (this.playing) return;
    this.grid = grid ? cloneGrid(grid) : Array.from({ length: COLS }, (_, reel) => Array.from({ length: ROWS }, (_, row) => REGULARS[(reel * 2 + row) % REGULARS.length]));
    this.wildMultipliers = multipliers ? cloneMatrix(multipliers) : emptyMatrix();
    this.marks = marks ? marks.map(column => [...column]) : emptyMarks();
    this.inactiveWilds = new Set(inactiveWilds.map(key));
    this.activeCharacters = [];
    this.tier = null;
    this.global = 1;
    this.remaining = 0;
    this.totalCents = 0;
    this.round = null;
    this.spin = null;
    this.moving = [];
    this.effect = null;
    this.resetCoins();
    this.godGrid = null;
    this.godShotMarks = [];
    this.highlight.clear();
    this.clearing.clear();
    this.stage = 'idle';
    this.syncGlobal();
    this.draw();
  }

  resize(): void {
    this.deviceRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(W * this.deviceRatio);
    this.canvas.height = Math.round(H * this.deviceRatio);
    this.draw();
  }

  inspect(): RendererInspection {
    return {
      stage: this.stage, grid: cloneGrid(this.grid), wildMultipliers: cloneMatrix(this.wildMultipliers),
      marks: this.marks.map(column => [...column]), activeCharacters: [...this.activeCharacters],
      inactiveWilds: [...this.inactiveWilds].map(value => { const [reel, row] = value.split(':').map(Number); return { reel, row }; }),
      movingCells: this.moving.map(cell => ({ ...cell })), effect: this.effect ? { ...this.effect, source: this.effect.source ? { ...this.effect.source } : undefined, target: this.effect.target ? { ...this.effect.target } : undefined, recipient: this.effect.recipient ? { ...this.effect.recipient } : undefined, recipients: this.effect.recipients?.map(cell => ({ ...cell })), coin: this.effect.coin ? cloneCoin(this.effect.coin) : undefined, collection: this.effect.collection ? cloneCollection(this.effect.collection) : undefined } : null,
      coins: this.revealedCoins.map(cloneCoin),
      coinWave: this.coinWave, coinPhase: this.coinPhase, coinRevealRemaining: this.coinRevealRemaining,
      collection: this.collection ? cloneCollection(this.collection) : null,
      clearedCoins: this.clearedCoins.map(cell => ({ ...cell })),
      godGrid: this.godGrid ? cloneGrid(this.godGrid) : null,
      godShots: this.round?.godShots.map(shot => ({ ...shot, target: { ...shot.target } })) ?? [],
      coinFlips: this.coinFlips.map(flip => ({ coin: cloneCoin(flip.coin), progress: flip.progress })),
      global: this.global, remaining: this.remaining, tier: this.tier, totalCents: this.totalCents,
    };
  }

  skip(): void {
    this.skipped = true;
    this.finishAnimation?.();
  }

  destroy(): void {
    this.destroyed = true;
    this.skipped = true;
    this.finishAnimation?.();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
  }

  async play(round: Round, turbo: boolean): Promise<void> {
    if (this.playing) throw new Error('A committed round is already playing.');
    this.playing = true;
    this.skipped = false;
    this.round = round;
    this.spin = null;
    this.tier = null;
    this.global = 1;
    this.remaining = 0;
    this.totalCents = 0;
    this.activeCharacters = [];
    this.marks = emptyMarks();
    this.inactiveWilds.clear();
    this.godCutscene = false;
    this.godGrid = round.godGrid ? cloneGrid(round.godGrid) : null;
    this.godShotMarks = [];
    this.resetCoins();
    this.stage = 'loading';
    this.emit();
    try {
      await this.sceneReady;
      if (round.choice.kind === 'god') await this.godEntry(round, turbo);
      if (round.choice.kind === 'buy') {
        this.tier = round.choice.tier;
        this.remaining = round.spins[0]?.spinsRemainingBefore ?? 0;
        this.activeCharacters = tierCharacters(this.tier);
        const invitations = this.boughtGrid(round, this.tier);
        await this.land(invitations, emptyMatrix(), `${round.id}:invitations`, turbo);
        this.effect = { kind: 'scatter', progress: 0, label: `${tierScatters(this.tier)} SCATTER` };
        this.options.onSound?.('scatter');
        await this.animate(turbo ? 180 : 330, p => { if (this.effect) this.effect.progress = p; });
        this.effect = null;
        await this.bonusIntro(this.tier, turbo);
      }
      let previousTier: Tier | null = round.choice.kind === 'buy' ? round.choice.tier : null;
      for (const spin of round.spins) {
        if (this.destroyed) break;
        const priorSpin = this.spin;
        this.spin = spin;
        this.tier = spin.tier;
        this.remaining = spin.spinsRemainingBefore;
        this.activeCharacters = tierCharacters(spin.tier);
        this.inactiveWilds.clear();
        this.emit();
        if (spin.tier && spin.tier !== previousTier) await this.bonusIntro(spin.tier, turbo);
        previousTier = spin.tier;
        if (!spin.tier || !priorSpin?.tier) this.marks = emptyMarks();
        this.options.onSound?.('drop');
        if (round.choice.kind === 'god' && spin.index === 0 && round.godGrid) {
          // God shots have already landed this exact initial receipt, including its MAX cell.
          this.grid = cloneGrid(spin.initialGrid);
          this.wildMultipliers = cloneMatrix(spin.initialWildMultipliers);
          this.godShotMarks = [];
          this.stage = 'landed';
          this.draw();
        } else await this.land(spin.initialGrid, spin.initialWildMultipliers, `${round.id}:${spin.index}:initial`, turbo, undefined, spin.initialWildMultipliers);
        for (const cascade of spin.cascades) {
          this.grid = cloneGrid(cascade.grid);
          this.wildMultipliers = cloneMatrix(cascade.wildMultipliers);
          this.inactiveWilds = new Set(cascade.inactiveWilds.map(key));
          this.syncGlobal();
          for (const feature of cascade.features) await this.presentFeature(feature, turbo);
          this.grid = cloneGrid(cascade.resolvedGrid);
          this.wildMultipliers = cloneMatrix(cascade.resolvedWildMultipliers);
          this.marks = cascade.marks.map(column => [...column]);
          this.global = cascade.globalMultiplier;
          this.emit();
          if (cascade.wins.length) {
            this.stage = 'win';
            this.highlight = new Set(cascade.wins.flatMap(win => win.cells).map(key));
            this.totalCents += cascade.wins.reduce((sum, win) => sum + win.payoutCents, 0);
            this.options.onSound?.('win');
            this.emit();
            await this.animate(turbo ? 190 : 360, () => {});
            this.highlight.clear();
          }
          this.inactiveWilds = new Set(cascade.inactiveWildsAfter.map(key));
          this.syncGlobal();
          if (cascade.refilledGrid && cascade.removed.length) {
            this.stage = 'clear';
            this.clearing = new Set(cascade.removed.map(key));
            this.clearProgress = 0;
            this.options.onSound?.('cascade');
            await this.animate(turbo ? 90 : 160, p => { this.clearProgress = p; });
            this.clearing.clear();
            await this.land(cascade.refilledGrid, cascade.refilledWildMultipliers ?? emptyMatrix(), `${round.id}:${spin.index}:cascade:${cascade.index}`, turbo, new Set(cascade.removed.map(key)), cascade.stickyWilds);
          }
        }
        this.grid = cloneGrid(spin.finalGrid);
        this.wildMultipliers = cloneMatrix(spin.finalWildMultipliers);
        this.marks = spin.marks.map(column => [...column]);
        this.inactiveWilds = new Set(spin.inactiveWilds.map(key));
        this.totalCents = spin.roundTotalCents;
        this.remaining = spin.spinsRemainingAfter;
        this.syncGlobal();
        this.stage = spin.maxWin ? 'max-win' : 'settled';
        this.emit();
        this.draw();
        if (spin.bonusAwarded) {
          this.effect = { kind: 'scatter', progress: 0, label: `${spin.scatters} SCATTER` };
          this.options.onSound?.('scatter');
          await this.animate(turbo ? 220 : 450, p => { if (this.effect) this.effect.progress = p; });
          this.effect = null;
        }
        if (spin.addedSpins) {
          this.effect = { kind: 'scatter', progress: 0, label: `+${spin.addedSpins} ${this.text('ЗАВЪРТАНИЯ', 'SPINS')}` };
          this.options.onSound?.('retrigger');
          await this.animate(turbo ? 200 : 420, p => { if (this.effect) this.effect.progress = p; });
          this.effect = null;
        }
        if (!spin.maxWin) await this.animate(turbo ? 65 : 130, () => {});
      }
      const final = round.spins.at(-1);
      if (final) {
        this.grid = cloneGrid(final.finalGrid);
        this.wildMultipliers = cloneMatrix(final.finalWildMultipliers);
        this.marks = final.marks.map(column => [...column]);
        this.inactiveWilds = new Set(final.inactiveWilds.map(key));
        this.spin = final;
        this.remaining = final.spinsRemainingAfter;
        this.syncGlobal();
        this.tier = final.tier;
      }
      this.totalCents = round.payoutCents;
      this.stage = round.maxWin ? 'max-win' : 'settled';
      this.emit();
    } finally {
      this.playing = false;
      this.moving = [];
      this.effect = null;
      this.highlight.clear();
      this.clearing.clear();
      this.godCutscene = false;
      this.resetCoins();
      this.draw();
    }
  }

  private async land(grid: Grid, multipliers: Matrix, seed: string, turbo: boolean, removed?: Set<string>, stickyWilds: Matrix = emptyMatrix()): Promise<void> {
    this.stage = removed ? 'cascade-drop' : 'drop';
    this.grid = cloneGrid(grid);
    this.wildMultipliers = cloneMatrix(multipliers);
    this.syncGlobal();
    const plan = planDrop(grid, seed, turbo, removed, stickyWilds);
    const landedColumns = new Set<number>();
    await this.animate(plan.duration, (_, elapsed) => {
      this.moving = dropFrames(plan, elapsed, this.reducedMotion.matches);
      for (let reel = 0; reel < COLS; reel++) {
        if (!landedColumns.has(reel) && this.moving.filter(cell => cell.reel === reel).every(cell => cell.progress === 1)) {
          landedColumns.add(reel);
          this.options.onSound?.('land');
        }
      }
    });
    this.moving = [];
    this.stage = 'landed';
    this.draw();
  }

  private async presentFeature(feature: Feature, turbo: boolean): Promise<void> {
    this.stage = `feature-${feature.character}`;
    if (!this.activeCharacters.includes(feature.character)) this.activeCharacters.push(feature.character);
    this.emit();
    this.options.onSound?.('feature');
    const from = this.grid[feature.source.reel][feature.source.row];
    const to = feature.gridAfter[feature.source.reel][feature.source.row];
    this.effect = { kind: 'reveal', progress: 0, source: feature.source, character: feature.character, from, to };
    await this.animate(turbo ? 170 : 310, p => { if (this.effect) this.effect.progress = p; });
    this.grid[feature.source.reel][feature.source.row] = to;
    this.effect = null;
    if (feature.character === 'left' || feature.character === 'middle') {
      const hits = feature.hits.length ? feature.hits : feature.targets.map(cell => ({ cell, multiplier: feature.wildMultipliersAfter[cell.reel][cell.row], repeated: false }));
      for (const hit of hits) {
        this.effect = { kind: feature.character === 'left' ? 'wild' : 'shot', progress: 0, source: feature.source, target: hit.cell, character: feature.character, value: hit.multiplier, repeated: hit.repeated };
        this.options.onSound?.(feature.character === 'left' ? 'throw' : 'shot');
        let impacted = false;
        await this.animate(turbo ? 150 : feature.character === 'left' ? 300 : 250, p => {
          if (this.effect) this.effect.progress = p;
          if (p >= .68 && !impacted) {
            impacted = true;
            this.grid[hit.cell.reel][hit.cell.row] = 'wild';
            this.wildMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
            this.syncGlobal();
          }
        });
        this.grid[hit.cell.reel][hit.cell.row] = 'wild';
        this.wildMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
        this.syncGlobal();
        this.effect = null;
      }
    } else {
      await this.presentCoinWaves(feature, turbo);
    }
    this.grid = cloneGrid(feature.gridAfter);
    this.wildMultipliers = cloneMatrix(feature.wildMultipliersAfter);
    this.global = feature.globalMultiplier;
    this.totalCents += feature.payoutCents;
    this.emit();
    this.draw();
  }

  private resetCoins(): void {
    this.revealedCoins = [];
    this.coinsFinal = false;
    this.coinWave = null;
    this.coinPhase = null;
    this.coinRevealRemaining = 0;
    this.collection = null;
    this.clearedCoins = [];
    this.coinPositions.clear();
    this.coinFlips = [];
  }

  /** The order of a coin receipt is part of the feature: reveal, modify, collect, clear, repeat. */
  private async presentCoinWaves(feature: Feature, turbo: boolean): Promise<void> {
    this.resetCoins();
    if (!feature.coinWaves.length) return;
    this.coinPositions = new Set(feature.targets.map(key));
    for (const wave of feature.coinWaves) {
      this.coinWave = wave.index;
      this.coinPhase = 'reveal';
      this.coinRevealRemaining = wave.coins.length;
      this.collection = null;
      this.clearedCoins = [];
      this.revealedCoins = wave.existingCollectors.map(cloneCoin);
      this.stage = 'coin-reveal';
      this.emit();
      if (wave.coins.length > 10) {
        const revealed = new Set<number>();
        const flight = turbo ? 175 : 300, stagger = turbo ? 31 : 52;
        const duration = flight + (wave.coins.length - 1) * stagger;
        this.options.onSound?.('coin');
        await this.animate(duration, (_, elapsed) => {
          this.coinFlips = [];
          for (const [index, coin] of wave.coins.entries()) {
            const progress = clamp((elapsed - index * stagger) / flight);
            if (elapsed < index * stagger) continue;
            if (progress === 1) {
              if (!revealed.has(index)) { revealed.add(index); this.revealedCoins.push(cloneCoin(coin)); this.marks[coin.cell.reel][coin.cell.row] = false; }
            } else this.coinFlips.push({ coin: cloneCoin(coin), progress });
          }
          this.coinRevealRemaining = wave.coins.length - revealed.size;
          const first = this.coinFlips[0];
          this.effect = first ? { kind: 'coin', progress: first.progress, source: feature.source, target: first.coin.cell, character: 'right', coinKind: first.coin.kind, value: first.coin.value, coin: cloneCoin(first.coin), label: this.coinLabel(first.coin, false) } : null;
        });
        this.coinFlips = [];
        this.effect = null;
      } else for (const coin of wave.coins) {
        this.effect = { kind: 'coin', progress: 0, source: feature.source, target: coin.cell, character: 'right', coinKind: coin.kind, value: coin.value, coin: cloneCoin(coin), label: this.coinLabel(coin, false) };
        this.options.onSound?.('coin');
        await this.animate(turbo ? 140 : 255, p => { if (this.effect) this.effect.progress = p; });
        this.revealedCoins.push(cloneCoin(coin));
        this.marks[coin.cell.reel][coin.cell.row] = false;
        this.coinRevealRemaining--;
        this.effect = null;
      }
      // The entire board can be read before any modifier or collector is allowed to act.
      this.coinPhase = 'revealed';
      this.stage = 'coin-reveal-complete';
      this.emit();
      await this.animate(turbo ? 190 : 380, () => {});
      for (const modifier of wave.modifierEvents) {
        this.coinPhase = 'modifier';
        this.stage = 'coin-modifier';
        this.effect = { kind: 'modifier', progress: 0, source: modifier.source, target: modifier.source, recipients: modifier.targets, character: 'right', value: modifier.factor, coinKind: modifier.global ? 'global' : 'multiplier' };
        this.emit();
        this.options.onSound?.('coin');
        let applied = false;
        await this.animate(turbo ? 200 : 400, p => {
          if (this.effect) this.effect.progress = p;
          if (p >= .72 && !applied) {
            applied = true;
            const targets = new Set(modifier.targets.map(key));
            this.revealedCoins = this.revealedCoins.map(coin => targets.has(key(coin.cell)) ? { ...coin, value: coin.value * modifier.factor, payoutCents: coin.payoutCents * modifier.factor } : coin);
          }
        });
        this.effect = null;
      }
      this.coinsFinal = true;
      for (const collection of wave.collections) {
        this.coinPhase = 'collect';
        this.stage = 'coin-collect';
        this.collection = cloneCollection(collection);
        const sourceMap = new Map(collection.sources.map(coin => [key(coin.cell), coin]));
        this.revealedCoins = this.revealedCoins.map(coin => sourceMap.has(key(coin.cell)) ? cloneCoin(sourceMap.get(key(coin.cell))!) : key(coin.cell) === key(collection.collector) ? { ...coin, payoutCents: collection.valueBeforeCents } : coin);
        this.effect = { kind: 'collect', progress: 0, source: collection.collector, target: collection.collector, recipients: collection.sources.map(coin => coin.cell), character: 'right', coinKind: 'collector', collection: cloneCollection(collection) };
        this.options.onSound?.('collector');
        this.emit();
        let applied = false;
        await this.animate(turbo ? 320 : 650, p => {
          if (this.effect) this.effect.progress = p;
          if (p >= .88 && !applied) {
            applied = true;
            const collected = new Set(collection.sources.map(coin => key(coin.cell)));
            this.revealedCoins = this.revealedCoins.filter(coin => !collected.has(key(coin.cell))).map(coin => key(coin.cell) === key(collection.collector) ? { ...coin, payoutCents: collection.valueAfterCents, value: collection.valueAfterCents / (this.round?.betCents || 1) } : coin);
          }
        });
        this.effect = null;
      }
      this.collection = null;
      if (wave.repeat) {
        this.coinPhase = 'clear';
        this.stage = 'coin-clear';
        this.clearedCoins = wave.cleared.map(cell => ({ ...cell }));
        this.effect = { kind: 'coin-clear', progress: 0, character: 'right', recipients: this.clearedCoins };
        this.emit();
        let cleared = false;
        await this.animate(turbo ? 150 : 300, p => {
          if (this.effect) this.effect.progress = p;
          if (p >= .75 && !cleared) { cleared = true; this.revealedCoins = wave.retainedCollectors.map(cloneCoin); }
        });
        this.revealedCoins = wave.retainedCollectors.map(cloneCoin);
        this.effect = null;
        await this.animate(turbo ? 100 : 220, () => {});
      }
    }
    this.coinPhase = 'award';
    this.stage = 'coin-award';
    this.collection = null;
    this.coinRevealRemaining = 0;
    this.revealedCoins = feature.coins.map(cloneCoin);
    this.coinsFinal = true;
    this.emit();
    await this.animate(turbo ? 230 : 470, () => {});
    this.effect = null;
    this.resetCoins();
  }

  private coinLabel(coin: Coin, euros = this.coinsFinal): string {
    if (coin.kind === 'empty') return '';
    if (coin.kind === 'collector' || coin.kind === 'value' && euros) return `€${(coin.payoutCents / 100).toFixed(2)}`;
    if (coin.kind === 'global') return `ALL ×${coin.value}`;
    return `${coin.kind === 'multiplier' ? '×' : ''}${coin.value}${coin.kind === 'value' ? '×' : ''}`;
  }

  private boughtGrid(round: Round, tier: Tier): Grid {
    const grid: Grid = Array.from({ length: COLS }, (_, reel) => Array.from({ length: ROWS }, (_, row) => REGULARS[(reel * 3 + row + round.id) % REGULARS.length]));
    const seed = hash(`${round.id}:${tier}:${JSON.stringify(round.spins[0]?.initialGrid ?? [])}`);
    const reels = Array.from({ length: COLS }, (_, reel) => reel).sort((a, b) => unit(seed, a + 11) - unit(seed, b + 11));
    for (const reel of reels.slice(0, tierScatters(tier))) grid[reel][Math.floor(unit(seed, reel + 27) * ROWS)] = 'scatter';
    return grid;
  }

  private async bonusIntro(tier: Tier, turbo: boolean): Promise<void> {
    this.tier = tier;
    this.activeCharacters = tierCharacters(tier);
    this.stage = 'bonus-intro';
    this.effect = { kind: 'tier', progress: 0, tier };
    this.options.onSound?.('bonus');
    this.emit();
    await this.animate(turbo ? 400 : 900, p => { if (this.effect) this.effect.progress = p; });
    this.effect = null;
  }

  private async godEntry(round: Round, turbo: boolean): Promise<void> {
    if (!round.godGrid) throw new Error('God Mode requires its committed board.');
    this.options.onSound?.('drop');
    await this.land(round.godGrid, emptyMatrix(), `${round.id}:god-board`, turbo);
    this.stage = 'god-entry';
    this.godCutscene = true;
    this.activeCharacters = [...CHARACTERS];
    this.godCarProgress = 0;
    this.godResolved = [];
    this.options.onSound?.('car');
    await this.animate(turbo ? 380 : 760, p => { this.godCarProgress = smooth(p); });
    await this.animate(turbo ? 140 : 270, () => {});
    for (const [shot, result] of round.godShots.entries()) {
      this.stage = 'god-shot';
      this.effect = { kind: 'god', progress: 0, shot, hit: result.hit, character: result.character, target: { ...result.target } };
      this.options.onSound?.('shot');
      let impacted = false;
      await this.animate(turbo ? 230 : 420, p => {
        if (this.effect) this.effect.progress = p;
        if (p >= .4 && !impacted) {
          impacted = true;
          this.godResolved.push(result.hit);
          this.godShotMarks.push({ ...result.target });
          if (result.hit) this.options.onSound?.('max');
        }
      });
    }
    this.effect = null;
    this.stage = round.maxWin ? 'god-hit' : 'god-miss';
    await this.animate(turbo ? 200 : 420, () => {});
    if (!round.maxWin) {
      await this.animate(turbo ? 280 : 570, p => { this.godCarProgress = 1 + smooth(p); });
      this.godCutscene = false;
    }
    this.activeCharacters = [];
    this.draw();
  }

  private animate(duration: number, update: (progress: number, elapsed: number) => void): Promise<void> {
    if (this.skipped || this.destroyed) {
      update(1, duration);
      this.draw();
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let start: number | null = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(this.animationFrame);
        update(1, duration);
        this.draw();
        this.finishAnimation = null;
        resolve();
      };
      this.finishAnimation = finish;
      const frame = (now: number) => {
        if (done) return;
        if (start === null) start = now;
        const elapsed = Math.min(duration, now - start);
        update(clamp(elapsed / duration), elapsed);
        this.draw();
        if (elapsed >= duration || this.skipped || this.destroyed) finish();
        else this.animationFrame = requestAnimationFrame(frame);
      };
      this.animationFrame = requestAnimationFrame(frame);
    });
  }

  private syncGlobal(): void {
    this.global = Math.max(1, this.grid.reduce((sum, column, reel) => sum + column.reduce((subtotal, symbol, row) => subtotal + (symbol === 'wild' && !this.inactiveWilds.has(`${reel}:${row}`) ? this.wildMultipliers[reel]?.[row] || 1 : 0), 0), 0));
    this.emit();
  }

  private emit(): void {
    this.options.onUpdate?.({ spin: this.spin, round: this.round, global: this.global, remaining: this.remaining, tier: this.tier, totalCents: this.totalCents });
  }

  private text(bg: string, en: string): string { return this.language === 'bg' ? bg : en; }
  private tierName(tier: Tier): string {
    return ({ ruse: this.text('РУСЕ', 'RUSE'), lux: this.text('ЛУКС', 'LUX'), edge: this.text('НА РЪБА', 'ON THE EDGE'), old: this.text('ОТ СТАРОТО', 'OT STAROTO') })[tier];
  }

  private preload(): Promise<void> {
    const urls = [carURL, ...SYMBOLS.map(symbol => symbolSprite(symbol).url), ...CHARACTERS.flatMap(character => (['idle', 'reveal', 'action', 'recoil'] as const).map(pose => characterSprite(character, pose).url)), ...(['value', 'collector', 'multiplier', 'global'] as const).map(coinURL), ...[null, 'ruse', 'lux', 'edge', 'old'].map(tier => sceneURL(tier as Tier | null))];
    return Promise.all([...new Set(urls)].filter(Boolean).map(url => this.image(url))).then(() => {});
  }

  private image(url: string): Promise<void> {
    const prior = this.imageReady.get(url);
    if (prior) return prior;
    const img = new Image();
    this.images.set(url, img);
    const promise = new Promise<void>((resolve, reject) => {
      img.onload = () => { void img.decode().then(() => resolve(), () => reject(new Error('An artwork image could not be decoded.'))); };
      img.onerror = () => reject(new Error('An artwork image could not be loaded.'));
      img.src = url;
    });
    this.imageReady.set(url, promise);
    return promise;
  }

  private draw(): void {
    if (this.destroyed) return;
    const ctx = this.ctx;
    ctx.setTransform(this.deviceRatio, 0, 0, this.deviceRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawScene();
    if (!this.godCutscene) this.drawCharacters();
    this.drawFrame();
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD.x + 3, BOARD.y + 3, BOARD.w - 6, BOARD.h - 6);
    ctx.clip();
    if (this.moving.length) {
      for (const cell of [...this.moving.filter(cell => !cell.sticky), ...this.moving.filter(cell => cell.sticky)]) {
        this.drawSymbol(cell.symbol, cell.x, cell.y, cell.rotation, cell.scaleX, cell.scaleY, this.inactiveWilds.has(key(cell)));
        if (cell.progress >= 1) this.drawMultiplier(cell, this.wildMultipliers[cell.reel]?.[cell.row] ?? 0);
      }
    } else {
      for (let reel = 0; reel < COLS; reel++) for (let row = 0; row < ROWS; row++) {
        const cell = { reel, row }, position = center(cell), removing = this.clearing.has(key(cell));
        ctx.save();
        if (removing) ctx.globalAlpha = 1 - this.clearProgress;
        if (this.coinPositions.has(key(cell))) ctx.globalAlpha *= .10;
        let symbol = this.grid[reel]?.[row] ?? 'bottle', sx = removing ? 1 - this.clearProgress * .23 : 1;
        if (this.effect?.kind === 'reveal' && this.effect.source && key(this.effect.source) === key(cell)) {
          symbol = this.effect.progress < .5 ? this.effect.from ?? symbol : this.effect.to ?? symbol;
          sx = Math.max(.045, Math.abs(Math.cos(this.effect.progress * Math.PI)));
        }
        const impactAt = this.effect?.kind === 'god' ? .4 : .68;
        const hit = this.effect?.target && key(this.effect.target) === key(cell) && (this.effect.kind === 'wild' || this.effect.kind === 'shot' || this.effect.kind === 'god');
        const recoil = hit && !this.reducedMotion.matches ? clamp(((this.effect?.progress ?? 0) - impactAt) / (1 - impactAt)) : 1;
        const kick = Math.sin(recoil * Math.PI * 3) * (1 - recoil) ** 2;
        this.drawSymbol(symbol, position.x + kick * 4.5, position.y + kick * 2.2, kick * .045, sx * (1 + Math.sin(recoil * Math.PI) * .055), removing ? 1 - this.clearProgress * .23 : 1, this.inactiveWilds.has(key(cell)));
        this.drawMultiplier(cell, this.wildMultipliers[reel]?.[row] ?? 0);
        ctx.restore();
      }
    }
    this.drawMarks();
    this.drawGodShotMarks();
    for (const coin of this.revealedCoins) this.drawCoin(coin);
    this.drawEffect(false);
    ctx.restore();
    // Action hands may reach into a reel; the character body remains in the street rail.
    if (!this.godCutscene && this.effect?.character) {
      ctx.save(); ctx.beginPath(); ctx.rect(BOARD.x + 3, BOARD.y + 3, BOARD.w - 6, BOARD.h - 6); ctx.clip();
      this.drawCharacters(true); ctx.restore();
    }
    this.drawLabels();
    this.drawEffect(true);
    if (this.godCutscene) this.drawGod();
  }

  private drawScene(): void {
    const ctx = this.ctx, img = this.images.get(sceneURL(this.tier));
    ctx.fillStyle = '#171716';
    ctx.fillRect(0, 0, W, H);
    if (img?.complete && img.naturalWidth) {
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      ctx.drawImage(img, (W - img.naturalWidth * scale) / 2, (H - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
    } else {
      ctx.strokeStyle = '#4a4844';
      ctx.lineWidth = 2;
      for (let line = 0; line < 10; line++) {
        ctx.beginPath(); ctx.moveTo(0, 94 + line * 86); ctx.lineTo(W, 105 + line * 81); ctx.stroke();
      }
    }
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,.43)'); shade.addColorStop(.48, 'rgba(0,0,0,.08)'); shade.addColorStop(1, 'rgba(0,0,0,.66)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    if (this.tier) {
      ctx.fillStyle = this.tier === 'old' ? 'rgba(143,12,14,.16)' : this.tier === 'lux' ? 'rgba(184,133,35,.08)' : 'rgba(121,17,20,.08)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawFrame(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#151615';
    ctx.fillRect(BOARD.x - 4, BOARD.y - 4, BOARD.w + 8, BOARD.h + 8);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(176,161,134,.44)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(BOARD.x - 3, BOARD.y - 3, BOARD.w + 6, BOARD.h + 6);
    const background = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x, BOARD.y + BOARD.h);
    background.addColorStop(0, 'rgba(35,34,29,.96)'); background.addColorStop(.5, 'rgba(24,26,23,.94)'); background.addColorStop(1, 'rgba(12,15,13,.97)');
    ctx.fillStyle = background; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    ctx.strokeStyle = 'rgba(164,151,123,.10)'; ctx.lineWidth = 1;
    for (let reel = 1; reel < COLS; reel++) { ctx.beginPath(); ctx.moveTo(BOARD.x + reel * CW, BOARD.y); ctx.lineTo(BOARD.x + reel * CW, BOARD.y + BOARD.h); ctx.stroke(); }
    for (let reel = 0; reel < COLS; reel++) {
      const well = ctx.createLinearGradient(BOARD.x + reel * CW, 0, BOARD.x + (reel + 1) * CW, 0);
      well.addColorStop(0, 'rgba(0,0,0,.17)'); well.addColorStop(.18, 'rgba(0,0,0,0)'); well.addColorStop(.82, 'rgba(0,0,0,0)'); well.addColorStop(1, 'rgba(0,0,0,.16)');
      ctx.fillStyle = well; ctx.fillRect(BOARD.x + reel * CW, BOARD.y, CW, BOARD.h);
    }
    ctx.strokeStyle = '#b7a484'; ctx.lineWidth = 2;
    for (const x of [BOARD.x, BOARD.x + BOARD.w]) for (const y of [BOARD.y, BOARD.y + BOARD.h]) {
      const dx = x === BOARD.x ? 1 : -1, dy = y === BOARD.y ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(x + dx * 17, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * 17); ctx.stroke();
    }
    ctx.restore();
  }

  private drawSymbol(symbol: SymbolId, x: number, y: number, rotation = 0, sx = 1, sy = 1, inactive = false): void {
    const ctx = this.ctx, sprite = symbolSprite(symbol), img = this.images.get(sprite.url);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(sx, sy);
    ctx.shadowColor = 'rgba(0,0,0,.66)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 5;
    if (inactive && symbol === 'wild') { ctx.filter = 'grayscale(.9)'; ctx.globalAlpha *= .42; }
    if (!inactive && (symbol === 'wild' || symbol === 'scatter' || symbol === 'max' || CHARACTERS.includes(symbol as Character))) {
      ctx.shadowColor = symbol === 'wild' || symbol === 'max' ? '#d39b35' : '#b92324'; ctx.shadowBlur = symbol === 'scatter' || symbol === 'max' ? 12 : 7;
    }
    if (img?.complete && img.naturalWidth) {
      const scale = Math.min(CW * .91 / sprite.width, CH * .93 / sprite.height);
      ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -sprite.width * scale / 2, -sprite.height * scale / 2, sprite.width * scale, sprite.height * scale);
    } else this.drawFallbackSymbol(symbol);
    ctx.restore();
  }

  private drawFallbackSymbol(symbol: SymbolId): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#070808';
    ctx.fillStyle = symbol === 'wild' ? '#e0b458' : symbol === 'scatter' ? '#c5332c' : '#d8d1bc';
    if (symbol === 'bottle') {
      ctx.beginPath(); ctx.moveTo(-12, -46); ctx.lineTo(12, -46); ctx.lineTo(12, -23); ctx.lineTo(26, -9); ctx.lineTo(26, 43); ctx.lineTo(-26, 43); ctx.lineTo(-26, -9); ctx.lineTo(-12, -23); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (symbol === 'cassette' || symbol === 'cash') {
      ctx.fillRect(-46, -30, 92, 60); ctx.strokeRect(-46, -30, 92, 60);
      ctx.beginPath(); ctx.arc(-22, 0, 13, 0, Math.PI * 2); ctx.arc(22, 0, 13, 0, Math.PI * 2); ctx.stroke();
    } else if (symbol === 'chain') {
      for (const ox of [-24, 0, 24]) { ctx.beginPath(); ctx.ellipse(ox, 0, 20, 27, -.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else if (symbol === 'sneaker') {
      ctx.beginPath(); ctx.moveTo(-40, -15); ctx.lineTo(-12, -32); ctx.lineTo(13, -7); ctx.quadraticCurveTo(48, -6, 48, 22); ctx.lineTo(-44, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (symbol === 'crown') {
      ctx.beginPath(); ctx.moveTo(-43, -22); ctx.lineTo(-23, -2); ctx.lineTo(0, -40); ctx.lineTo(23, -2); ctx.lineTo(43, -22); ctx.lineTo(32, 33); ctx.lineTo(-32, 33); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      this.inkText(symbol === 'max' ? 'MAX' : symbol === 'wild' ? 'W' : symbol === 'scatter' ? 'S' : symbol === 'left' ? '☀' : symbol === 'middle' ? '!' : '€', 0, 16, symbol === 'max' ? 26 : 47, '#151615');
    }
  }

  private drawMultiplier(cell: Cell, multiplier: number): void {
    if (this.grid[cell.reel]?.[cell.row] !== 'wild' || multiplier <= 1 && !this.inactiveWilds.has(key(cell))) return;
    const position = center(cell);
    const inactive = this.inactiveWilds.has(key(cell));
    this.inkText(`×${multiplier}`, position.x, position.y + 49, 27, inactive ? '#93887b' : '#f7d36f');
    if (inactive) {
      this.ctx.save(); this.ctx.strokeStyle = '#746d62'; this.ctx.lineWidth = 2;
      this.ctx.beginPath(); this.ctx.moveTo(position.x - 27, position.y + 40); this.ctx.lineTo(position.x + 27, position.y + 50); this.ctx.stroke();
      this.inkText(this.text('ПРЕЗАРЕЖДА', 'RECHARGING'), position.x, position.y - 40, 12, '#b8aa91'); this.ctx.restore();
    }
  }

  private drawMarks(): void {
    const ctx = this.ctx;
    for (let reel = 0; reel < COLS; reel++) for (let row = 0; row < ROWS; row++) {
      const cell = { reel, row }, p = center(cell);
      if (this.highlight.has(key(cell))) {
        ctx.fillStyle = 'rgba(225,164,50,.16)'; ctx.fillRect(p.x - CW / 2 + 4, p.y - CH / 2 + 4, CW - 8, CH - 8);
        ctx.strokeStyle = '#d3a04c'; ctx.lineWidth = 3; ctx.strokeRect(p.x - CW / 2 + 6, p.y - CH / 2 + 6, CW - 12, CH - 12);
      }
      if (this.marks[reel]?.[row]) {
        ctx.strokeStyle = '#a93c31'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - CW / 2 + 10, p.y - CH / 2 + 22); ctx.lineTo(p.x - CW / 2 + 10, p.y - CH / 2 + 10); ctx.lineTo(p.x - CW / 2 + 23, p.y - CH / 2 + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x + CW / 2 - 23, p.y + CH / 2 - 10); ctx.lineTo(p.x + CW / 2 - 10, p.y + CH / 2 - 10); ctx.lineTo(p.x + CW / 2 - 10, p.y + CH / 2 - 23); ctx.stroke();
      }
    }
  }

  private characterPlacement(character: Character): { x: number; y: number; width: number; height: number } {
    if (window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches) {
      return { x: ({ left: 400, middle: 620, right: 840 })[character], y: 158, width: 130, height: 125 };
    }
    const sharedRight = character === 'right' && this.activeCharacters.includes('middle');
    return { x: character === 'left' ? 107 : 1105, y: sharedRight ? 437 : 788, width: character === 'left' ? 190 : sharedRight ? 172 : 190, height: sharedRight ? 246 : 426 };
  }

  private characterMuzzle(character: Character): { x: number; y: number } {
    const box = this.characterPlacement(character), sprite = characterSprite(character, 'action');
    const scale = Math.min(box.width / (sprite.referenceWidth ?? sprite.width), box.height / sprite.height);
    const point = ({ left: { x: 594, y: 150 }, middle: { x: 585, y: 158 }, right: { x: 55, y: 132 } })[character];
    const flip = character === 'middle' ? -1 : 1;
    return { x: box.x + flip * (point.x - (sprite.anchorX ?? sprite.width / 2)) * scale, y: box.y - sprite.height * scale + point.y * scale };
  }

  private drawCharacters(foregroundOnly = false): void {
    const ctx = this.ctx;
    for (const character of this.activeCharacters) {
      const active = this.effect?.character === character;
      if (foregroundOnly && !active) continue;
      const p = active ? this.effect?.progress ?? 0 : 0;
      const pose = !active ? 'idle' : this.effect?.kind === 'reveal' || this.effect?.kind === 'coin' ? 'reveal' : p < .20 ? 'reveal' : p < .68 ? 'action' : 'recoil';
      const sprite = characterSprite(character, pose), img = this.images.get(sprite.url);
      if (!img?.complete || !img.naturalWidth) continue;
      const box = this.characterPlacement(character);
      const scale = Math.min(box.width / (sprite.referenceWidth ?? sprite.width), box.height / sprite.height);
      const recoil = active && !this.reducedMotion.matches && p > .68 ? Math.sin((p - .68) / .32 * Math.PI) * .019 : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.44)'; ctx.beginPath(); ctx.ellipse(box.x, box.y - 5, box.width * .39, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(box.x, box.y); ctx.rotate(recoil * (character === 'left' ? -1 : 1));
      if (character === 'middle') ctx.scale(-1, 1);
      ctx.shadowColor = 'rgba(0,0,0,.54)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 5;
      ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -(sprite.anchorX ?? sprite.width / 2) * scale, -sprite.height * scale, sprite.width * scale, sprite.height * scale);
      ctx.restore();
    }
  }

  private drawLabels(): void {
    if (this.godCutscene) return;
    const ctx = this.ctx;
    const mobile = window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
    if (mobile && this.activeCharacters.length) {
      this.inkText('ОТ СТАРОТО', W / 2, 26, 25, '#ddd3bd');
    } else {
      this.inkText('ОТ СТАРОТО', W / 2, mobile ? 93 : 88, mobile ? 56 : 58, '#ddd3bd');
      ctx.font = '700 14px RuseInk, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b2a68e';
      ctx.fillText(this.tier ? this.tierName(this.tier) : this.text('РУСЕ · НОЩНАТА СМЯНА', 'RUSE · NIGHT SHIFT'), W / 2, mobile ? 123 : 116);
    }
    if (this.coinWave !== null) {
      const label = this.coinPhase === 'collect' ? this.text('СЪБИРАНЕ', 'COLLECT') : this.coinPhase === 'modifier' ? this.text('МНОЖИТЕЛ', 'MULTIPLIER') : this.coinPhase === 'award' ? this.text('ПЕЧАЛБА ОТ МОНЕТИ', 'COIN WIN') : `${this.text('РАЗКРИВАНЕ', 'REVEAL')} ${this.coinWave + 1}`;
      this.inkText(label, W / 2, BOARD.y - 14, 17, '#dfc17a');
    }
  }

  private drawEffect(outside: boolean): void {
    const effect = this.effect;
    if (!effect) return;
    const ctx = this.ctx, p = effect.progress;
    if (effect.kind === 'tier' || effect.kind === 'scatter') {
      if (!outside) return;
      ctx.save();
      ctx.globalAlpha = clamp(p / .12) * (1 - clamp((p - .86) / .14));
      if (effect.kind === 'tier') {
        const tier = effect.tier ?? 'ruse';
        ctx.fillStyle = 'rgba(5,7,6,.86)'; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
        const glow = ctx.createRadialGradient(W / 2, 453, 30, W / 2, 453, 360);
        glow.addColorStop(0, 'rgba(156,43,25,.19)'); glow.addColorStop(1, 'rgba(156,43,25,0)'); ctx.fillStyle = glow; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
        const cast = tierCharacters(tier);
        for (const [index, character] of cast.entries()) {
          const sprite = symbolSprite(character), img = this.images.get(sprite.url);
          if (img?.complete && img.naturalWidth) ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, W / 2 + (index - (cast.length - 1) / 2) * 123 - 58, 297, 116, 116);
        }
        this.inkText(this.text('БЕЗПЛАТНИ ЗАВЪРТАНИЯ', 'FREE SPINS'), W / 2, 456, 23, '#bbaa8c');
        this.inkText(this.tierName(tier), W / 2, 528, tier === 'old' ? 63 : 58, '#f0d27c');
        ctx.strokeStyle = '#a1844d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 162, 560); ctx.lineTo(W / 2 + 162, 560); ctx.stroke();
      } else {
        const lift = (1 - smooth(clamp(p / .24))) * 14;
        ctx.fillStyle = 'rgba(9,7,7,.80)'; ctx.fillRect(BOARD.x + 113, BOARD.y + 265 - lift, BOARD.w - 226, 86);
        this.inkText(effect.label ?? 'SCATTER', W / 2, BOARD.y + 323 - lift, 38, '#f0dbbd');
      }
      ctx.restore(); return;
    }
    if (outside) {
      if ((effect.kind === 'shot' || effect.kind === 'wild') && effect.character && p > .20 && p < .33) {
        const origin = this.characterMuzzle(effect.character);
        this.impact(origin.x, origin.y, clamp((p - .20) / .13), effect.kind === 'shot' ? '#f5dfa3' : '#c5ad6c', true);
      }
      return;
    }
    if (effect.kind === 'coin-clear') return;
    if (effect.kind === 'reveal' && effect.source) {
      const pos = center(effect.source);
      ctx.save(); ctx.globalAlpha = Math.sin(p * Math.PI) * .55;
      ctx.fillStyle = '#ead1a4';
      const width = 13 + Math.sin(p * Math.PI) * 25;
      ctx.translate(pos.x, pos.y); ctx.rotate(-.3);
      ctx.fillRect(-width / 2, -CH * .35, width, CH * .7);
      ctx.restore(); return;
    }
    if (!effect.target) return;
    const end = center(effect.target);
    if (effect.kind === 'coin' && effect.coin) {
      if (this.coinFlips.length) for (const flip of this.coinFlips) this.drawCoinReveal(flip.coin, flip.progress);
      else this.drawCoinReveal(effect.coin, p);
      return;
    }
    if (effect.kind === 'modifier') {
      const travel = smooth(clamp((p - .15) / .57));
      ctx.save(); ctx.strokeStyle = '#e5c371'; ctx.lineWidth = 2;
      for (const target of effect.recipients ?? []) {
        const to = center(target);
        const x = end.x + (to.x - end.x) * travel, y = end.y + (to.y - end.y) * travel;
        ctx.globalAlpha = .72 * (1 - clamp((p - .75) / .25));
        ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.quadraticCurveTo((end.x + to.x) / 2, Math.min(end.y, to.y) - 21, x, y); ctx.stroke();
        if (p < .73) { ctx.fillStyle = '#ffe9a6'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
        if (p > .72) { this.impact(to.x, to.y, clamp((p - .72) / .28), '#e9c575'); this.inkText(`×${effect.value ?? 1}`, to.x, to.y - 37 - (p - .72) * 35, 25, '#ffe9ad'); }
      }
      ctx.restore(); return;
    }
    if (effect.kind === 'collect' && effect.collection) {
      const collection = effect.collection;
      for (const [index, coin] of collection.sources.entries()) {
        const from = center(coin.cell);
        const travel = clamp((p - .12 - Math.min(index, 10) * .015) / .60);
        if (travel <= 0 || travel >= 1) continue;
        const curve = Math.sin(travel * Math.PI) * (22 + Math.min(40, Math.abs(end.x - from.x) * .09));
        const x = from.x + (end.x - from.x) * smooth(travel), y = from.y + (end.y - from.y) * smooth(travel) - curve;
        const img = this.images.get(coinURL(coin.kind));
        ctx.save(); ctx.globalAlpha = 1 - travel * .23; ctx.translate(x, y); ctx.rotate((index % 2 ? -1 : 1) * travel * .35);
        const size = 61 * (1 - travel * .45);
        ctx.shadowColor = '#d6b66b'; ctx.shadowBlur = 7;
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
        else { ctx.fillStyle = '#d1ad57'; ctx.beginPath(); ctx.arc(0, 0, size * .34, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (p > .70) this.impact(end.x, end.y, clamp((p - .70) / .30), '#eacb7d');
      return;
    }
    const god = effect.kind === 'god';
    const start = god ? this.godMuzzle(effect.character ?? 'left') : effect.character ? this.characterMuzzle(effect.character) : effect.source ? center(effect.source) : { x: BOARD.x, y: end.y };
    const impactAt = god ? .4 : .68;
    const flight = clamp((p - .20) / (impactAt - .20)), impact = clamp((p - impactAt) / (1 - impactAt));
    if (effect.kind === 'wild') {
      if (p > .20 && p < impactAt) {
        const x = start.x + (end.x - start.x) * flight, y = start.y + (end.y - start.y) * flight - Math.sin(flight * Math.PI) * Math.min(105, 37 + Math.abs(end.x - start.x) * .12);
        const sprite = symbolSprite('wild'), img = this.images.get(sprite.url);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-.4 + flight * Math.PI * 1.5); ctx.scale(Math.max(.28, Math.abs(Math.cos(flight * Math.PI))), 1); ctx.shadowColor = '#070806'; ctx.shadowBlur = 5;
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -25, -25, 50, 50);
        else { ctx.fillStyle = '#d0b774'; ctx.fillRect(-8, -23, 16, 47); }
        ctx.restore();
      } else if (p >= impactAt) this.splash(end.x, end.y, impact, '#cbaa56');
    } else if (effect.kind === 'shot' || god) {
      ctx.save();
      if (p > .20 && p < impactAt) {
        const x = start.x + (end.x - start.x) * flight, y = start.y + (end.y - start.y) * flight;
        const length = Math.min(.16, flight), tail = Math.max(0, flight - length);
        ctx.strokeStyle = '#f7e4ba'; ctx.lineWidth = 2.8; ctx.shadowColor = '#f5cf7d'; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(start.x + (end.x - start.x) * tail, start.y + (end.y - start.y) * tail); ctx.lineTo(x, y); ctx.stroke();
      } else if (p >= impactAt) {
        this.impact(end.x, end.y, impact, god && !effect.hit ? '#aa9781' : '#efd18b');
        if (!god) this.inkText(`×${effect.value ?? 1}`, end.x, end.y - 27 - impact * 18, 31, '#ffe2a0');
      }
      ctx.restore();
    }
  }

  private drawCoin(coin: Coin): void {
    if (coin.kind === 'empty') return;
    const ctx = this.ctx, pos = center(coin.cell);
    ctx.save();
    if (this.effect?.kind === 'collect' && this.collection?.sources.some(source => key(source.cell) === key(coin.cell))) ctx.globalAlpha *= 1 - clamp((this.effect.progress - .13) / .29);
    if (this.effect?.kind === 'coin-clear' && this.clearedCoins.some(cell => key(cell) === key(coin.cell))) {
      const clear = clamp(this.effect.progress / .75);
      ctx.globalAlpha *= 1 - clear;
      if (!this.reducedMotion.matches) ctx.translate(0, -clear * 11);
    }
    ctx.translate(pos.x, pos.y);
    this.drawCoinPlate(coin, this.coinLabel(coin));
    ctx.restore();
  }

  private drawCoinReveal(coin: Coin, p: number): void {
    const ctx = this.ctx, end = center(coin.cell);
    const flip = Math.max(.055, Math.abs(Math.cos(smooth(p) * Math.PI * 2)));
    const rise = this.reducedMotion.matches ? 0 : -Math.sin(p * Math.PI) * 9;
    ctx.save(); ctx.translate(end.x, end.y + rise); ctx.scale(flip, 1 + Math.sin(p * Math.PI) * .025);
    if (coin.kind !== 'empty' || p < .76) this.drawCoinPlate(coin, p >= .54 ? this.coinLabel(coin, false) : '?', p);
    else { ctx.globalAlpha = (1 - p) * .8; this.inkText('—', 0, 5, 24, '#8f8065'); }
    ctx.restore();
  }

  private drawCoinPlate(coin: Coin, label: string, glint = 1): void {
    const ctx = this.ctx, img = this.images.get(coinURL(coin.kind === 'empty' ? 'value' : coin.kind));
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.62)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 5;
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, -55, -55, 110, 110);
    else {
      const metal = ctx.createLinearGradient(-34, -37, 34, 42);
      metal.addColorStop(0, '#f5dfa1'); metal.addColorStop(.34, '#b78939'); metal.addColorStop(.51, '#e7c671'); metal.addColorStop(1, '#7b5b2e');
      ctx.fillStyle = metal; ctx.strokeStyle = '#17150f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#efda93'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(31,25,16,.74)';
    ctx.beginPath(); ctx.roundRect(-37, -7, 74, 34, 5); ctx.fill();
    const name = coin.kind === 'collector' ? this.text('СЪБИРАЧ', 'COLLECTOR') : coin.kind === 'global' ? 'ALL' : coin.kind === 'multiplier' ? this.text('МНОЖИТЕЛ', 'BOOST') : this.text('МОНЕТА', 'COIN');
    this.inkText(name, 0, -17, 11, '#f8e2a5');
    this.inkText(label, 0, 18, label.length > 8 ? 16 : label.startsWith('€') ? 21 : 25, '#f9e4ad');
    if (glint > 0 && glint < 1) {
      ctx.save(); ctx.globalAlpha = Math.sin(glint * Math.PI) * .6; ctx.strokeStyle = '#fff0c9'; ctx.lineWidth = 1.5;
      const x = -37 + glint * 74; ctx.beginPath(); ctx.moveTo(x - 9, -39); ctx.lineTo(x + 9, -23); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  private splash(x: number, y: number, p: number, color: string): void {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = (1 - p) ** 1.25; ctx.fillStyle = color; ctx.strokeStyle = '#211c0f'; ctx.lineWidth = 1.5;
    if (p < .38) {
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const angle = i * Math.PI * 2 / 14, radius = (i % 2 ? 19 : 35) * (.78 + p * .8);
        if (i) ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .58); else ctx.moveTo(x + radius, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.39996 + .3, radius = 11 + p * (35 + i % 4 * 11);
      const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius * .67 + p * p * (i % 2 ? 29 : 17);
      ctx.beginPath(); ctx.ellipse(x + dx, y + dy, (3.1 + i % 3) * (1 - p * .45), (5.3 + i % 2) * (1 - p * .28), angle + .5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private impact(x: number, y: number, p: number, color: string, muzzle = false): void {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = (1 - p) ** 1.15;
    ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = '#191911'; ctx.lineWidth = 1.5;
    const flare = muzzle ? 26 : 18;
    if (p < .37) {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI * 2 / 12, radius = i % 2 ? flare * .20 : flare * (1 - p * .40) * (i % 3 ? .9 : 1.3);
        if (i) ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else ctx.moveTo(radius, 0);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39996 + .26, speed = 23 + i % 3 * 17;
      const radius = 9 + speed * p;
      ctx.strokeStyle = i % 3 ? color : '#6e695d'; ctx.lineWidth = i % 2 ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius + p * p * 8);
      ctx.lineTo(Math.cos(angle) * (radius + 6 * (1 - p)), Math.sin(angle) * (radius + 6 * (1 - p)) + p * p * 8); ctx.stroke();
    }
    ctx.restore();
  }

  private drawGodShotMarks(): void {
    if (!this.godCutscene) return;
    const ctx = this.ctx;
    for (const cell of this.godShotMarks) {
      const position = center(cell), hit = this.grid[cell.reel]?.[cell.row] === 'max';
      ctx.save(); ctx.translate(position.x + 17, position.y - 9);
      ctx.fillStyle = '#090b08'; ctx.strokeStyle = hit ? '#e6c170' : '#928576'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      for (let line = 0; line < 5; line++) {
        const angle = line * 2.39996;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3); ctx.lineTo(Math.cos(angle) * (8 + line % 3), Math.sin(angle) * (8 + line % 3)); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private godCarBox(): { x: number; y: number; width: number; height: number } {
    const width = 257, height = 168;
    const arrivedX = W / 2 - width / 2;
    const x = this.godCarProgress <= 1 ? -width - 50 + (arrivedX + width + 50) * this.godCarProgress : arrivedX + (W + 80 - arrivedX) * (this.godCarProgress - 1);
    return { x, y: -2, width, height };
  }

  private godMuzzle(character: Character): { x: number; y: number } {
    const box = this.godCarBox();
    const point = ({ left: { x: .055, y: .253 }, middle: { x: .740, y: .115 }, right: { x: .945, y: .356 } })[character];
    return { x: box.x + box.width * point.x, y: box.y + box.height * point.y };
  }

  private drawGod(): void {
    const ctx = this.ctx, box = this.godCarBox();
    const car = this.images.get(carURL);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, BOARD.y - 3); ctx.clip();
    const carShade = ctx.createLinearGradient(0, 0, 0, BOARD.y);
    carShade.addColorStop(0, 'rgba(9,8,6,.22)'); carShade.addColorStop(1, 'rgba(9,8,6,.76)'); ctx.fillStyle = carShade; ctx.fillRect(0, 0, W, BOARD.y);
    const brake = !this.reducedMotion.matches && this.godCarProgress > .85 && this.godCarProgress < 1 ? Math.sin((this.godCarProgress - .85) / .15 * Math.PI) * 1.5 : 0;
    if (car?.complete && car.naturalWidth) {
      ctx.shadowColor = '#050706'; ctx.shadowBlur = 17;
      ctx.drawImage(car, box.x, box.y + brake, box.width, box.height);
    }
    this.inkText('GOD MODE', BOARD.x + 125, 103, 31, '#ddd1b7');
    const hit = this.godResolved.some(Boolean);
    this.inkText(hit ? this.text('В ЦЕЛТА', 'TARGET HIT') : this.text('НА ПРИЦЕЛ', 'TAKE AIM'), BOARD.x + BOARD.w - 126, 103, 24, hit ? '#edc573' : '#d0bc95');
    for (const [shot, resolved] of this.godResolved.entries()) {
      ctx.fillStyle = resolved ? '#d8b263' : '#857260';
      const x = BOARD.x + BOARD.w - 167 + shot * 19;
      ctx.beginPath(); ctx.arc(x, 127, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    const effect = this.effect?.kind === 'god' ? this.effect : null;
    if (effect && effect.progress >= .20 && effect.progress < .34) {
      const from = this.godMuzzle(effect.character ?? 'left');
      this.impact(from.x, from.y, clamp((effect.progress - .20) / .14), '#f3d49a', true);
    }
    ctx.restore();
  }

  private inkText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
    const ctx = this.ctx;
    ctx.save(); ctx.font = `900 ${size}px RuseInk, Georgia, "Times New Roman", serif`; ctx.textAlign = align;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * .095); ctx.strokeStyle = '#050706'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  }
}
