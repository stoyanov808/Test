import { carURL, characterURL, sceneURL, symbolURL } from './art';
import { TIER_CHARACTERS } from './engine';
import type { Cell, Character, Coin, Feature, Grid, Matrix, Round, Spin, SymbolId, Tier } from './types';

const W = 1240, H = 900;
const BOARD = { x: 200, y: 154, w: 840, h: 630 };
const COLS = 6, ROWS = 5, CW = BOARD.w / COLS, CH = BOARD.h / ROWS;
const CHARACTERS: Character[] = ['left', 'middle', 'right'];
const SYMBOLS: SymbolId[] = ['bottle', 'cash', 'chain', 'cassette', 'sneaker', 'crown', ...CHARACTERS, 'wild', 'scatter'];
const REGULARS: SymbolId[] = SYMBOLS.slice(0, 6);
const cloneGrid = (grid: Grid): Grid => grid.map(column => [...column]);
const cloneMatrix = (matrix: Matrix): Matrix => matrix.map(column => [...column]);
const emptyMatrix = (): Matrix => Array.from({ length: COLS }, () => Array(ROWS).fill(0));
const emptyMarks = (): boolean[][] => Array.from({ length: COLS }, () => Array(ROWS).fill(false));
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (p: number): number => p * p * p * (10 + p * (-15 + p * 6));
const key = (cell: Cell): string => `${cell.reel}:${cell.row}`;
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
  kind: 'reveal' | 'wild' | 'shot' | 'coin' | 'tier' | 'god' | 'scatter';
  progress: number; source?: Cell; target?: Cell; character?: Character; from?: SymbolId; to?: SymbolId;
  label?: string; value?: number; repeated?: boolean; tier?: Tier; shot?: number; hit?: boolean; coinKind?: Coin['kind']; recipient?: Cell; recipients?: Cell[];
}
export interface RendererUpdate {
  spin: Spin | null; round: Round | null; global: number; remaining: number; tier: Tier | null; totalCents: number;
}
export interface RendererInspection extends Omit<RendererUpdate, 'spin' | 'round'> {
  stage: string; grid: Grid; wildMultipliers: Matrix; marks: boolean[][];
  activeCharacters: Character[]; movingCells: MovingSymbol[]; effect: Effect | null; coins: Coin[];
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
  private activeCharacters: Character[] = [];
  private moving: MovingSymbol[] = [];
  private effect: Effect | null = null;
  private revealedCoins: Coin[] = [];
  private coinsFinal = false;
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

  setIdle(grid?: Grid, multipliers?: Matrix, marks?: boolean[][]): void {
    if (this.playing) return;
    this.grid = grid ? cloneGrid(grid) : Array.from({ length: COLS }, (_, reel) => Array.from({ length: ROWS }, (_, row) => REGULARS[(reel * 2 + row) % REGULARS.length]));
    this.wildMultipliers = multipliers ? cloneMatrix(multipliers) : emptyMatrix();
    this.marks = marks ? marks.map(column => [...column]) : emptyMarks();
    this.activeCharacters = [];
    this.tier = null;
    this.global = 1;
    this.remaining = 0;
    this.totalCents = 0;
    this.round = null;
    this.spin = null;
    this.moving = [];
    this.effect = null;
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
      movingCells: this.moving.map(cell => ({ ...cell })), effect: this.effect ? { ...this.effect, source: this.effect.source ? { ...this.effect.source } : undefined, target: this.effect.target ? { ...this.effect.target } : undefined, recipient: this.effect.recipient ? { ...this.effect.recipient } : undefined, recipients: this.effect.recipients?.map(cell => ({ ...cell })) } : null,
      coins: this.revealedCoins.map(coin => ({ ...coin, cell: { ...coin.cell }, ...(coin.target ? { target: { ...coin.target } } : {}) })),
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
    this.godCutscene = false;
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
        this.emit();
        if (spin.tier && spin.tier !== previousTier) await this.bonusIntro(spin.tier, turbo);
        previousTier = spin.tier;
        if (!spin.tier || !priorSpin?.tier) this.marks = emptyMarks();
        this.options.onSound?.('drop');
        await this.land(spin.initialGrid, spin.initialWildMultipliers, `${round.id}:${spin.index}:initial`, turbo, undefined, spin.initialWildMultipliers);
        for (const cascade of spin.cascades) {
          this.grid = cloneGrid(cascade.grid);
          this.wildMultipliers = cloneMatrix(cascade.wildMultipliers);
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
        this.totalCents = spin.roundTotalCents;
        this.remaining = spin.spinsRemainingAfter;
        this.global = spin.cascades.at(-1)?.globalMultiplier ?? 1;
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
        this.spin = final;
        this.remaining = final.spinsRemainingAfter;
        this.global = final.cascades.at(-1)?.globalMultiplier ?? this.global;
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
      this.revealedCoins = [];
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
      this.revealedCoins = [];
      this.coinsFinal = false;
      for (const coin of feature.coins) {
        const label = coin.kind === 'value' ? `${coin.value}×` : coin.kind === 'collector' ? `€${(coin.payoutCents / 100).toFixed(2)}` : coin.kind === 'global' ? `ALL ×${coin.value}` : `×${coin.value}`;
        this.effect = { kind: 'coin', progress: 0, source: feature.source, target: coin.cell, character: feature.character, label, value: coin.value, coinKind: coin.kind, recipient: coin.target, recipients: coin.kind === 'global' || coin.kind === 'collector' ? feature.coins.filter(value => value.kind === 'value').map(value => value.cell) : undefined };
        this.options.onSound?.(coin.kind === 'collector' ? 'collector' : 'coin');
        await this.animate(turbo ? 185 : 370, p => { if (this.effect) this.effect.progress = p; });
        this.revealedCoins.push({ ...coin, cell: { ...coin.cell } });
        this.marks[coin.cell.reel][coin.cell.row] = false;
        this.effect = null;
      }
      if (!feature.coins.length) await this.animate(turbo ? 80 : 150, () => {});
      else { this.coinsFinal = true; await this.animate(turbo ? 160 : 330, () => {}); }
      this.revealedCoins = [];
    }
    this.grid = cloneGrid(feature.gridAfter);
    this.wildMultipliers = cloneMatrix(feature.wildMultipliersAfter);
    this.global = feature.globalMultiplier;
    this.totalCents += feature.payoutCents;
    this.emit();
    this.draw();
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
    this.stage = 'god-entry';
    this.godCutscene = true;
    this.activeCharacters = [...CHARACTERS];
    this.godCarProgress = 0;
    this.godResolved = [];
    this.options.onSound?.('car');
    await this.animate(turbo ? 300 : 650, p => { this.godCarProgress = smooth(p); });
    for (let shot = 0; shot < round.godHits.length; shot++) {
      this.effect = { kind: 'god', progress: 0, shot, hit: round.godHits[shot], character: CHARACTERS[shot % 3] };
      this.options.onSound?.('shot');
      let impacted = false;
      await this.animate(turbo ? 150 : 280, p => {
        if (this.effect) this.effect.progress = p;
        if (p >= .4 && !impacted) { impacted = true; this.godResolved.push(round.godHits[shot]); }
      });
    }
    this.effect = null;
    this.godCutscene = false;
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
    this.global = Math.max(1, this.grid.reduce((sum, column, reel) => sum + column.reduce((subtotal, symbol, row) => subtotal + (symbol === 'wild' ? this.wildMultipliers[reel]?.[row] || 1 : 0), 0), 0));
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
    const urls = [carURL, ...SYMBOLS.map(symbolURL), ...CHARACTERS.map(characterURL), ...[null, 'ruse', 'lux', 'edge', 'old'].map(tier => sceneURL(tier as Tier | null))];
    return Promise.all([...new Set(urls)].map(url => this.image(url))).then(() => {});
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
    this.drawCharacters();
    this.drawFrame();
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD.x + 3, BOARD.y + 3, BOARD.w - 6, BOARD.h - 6);
    ctx.clip();
    if (this.moving.length) {
      for (const cell of [...this.moving.filter(cell => !cell.sticky), ...this.moving.filter(cell => cell.sticky)]) {
        this.drawSymbol(cell.symbol, cell.x, cell.y, cell.rotation, cell.scaleX, cell.scaleY);
        if (cell.progress >= 1) this.drawMultiplier(cell, this.wildMultipliers[cell.reel]?.[cell.row] ?? 0);
      }
    } else {
      for (let reel = 0; reel < COLS; reel++) for (let row = 0; row < ROWS; row++) {
        const cell = { reel, row }, position = center(cell), removing = this.clearing.has(key(cell));
        ctx.save();
        if (removing) ctx.globalAlpha = 1 - this.clearProgress;
        let symbol = this.grid[reel]?.[row] ?? 'bottle', sx = removing ? 1 - this.clearProgress * .23 : 1;
        if (this.effect?.kind === 'reveal' && this.effect.source && key(this.effect.source) === key(cell)) {
          symbol = this.effect.progress < .5 ? this.effect.from ?? symbol : this.effect.to ?? symbol;
          sx = Math.max(.045, Math.abs(Math.cos(this.effect.progress * Math.PI)));
        }
        this.drawSymbol(symbol, position.x, position.y, 0, sx, removing ? 1 - this.clearProgress * .23 : 1);
        this.drawMultiplier(cell, this.wildMultipliers[reel]?.[row] ?? 0);
        ctx.restore();
      }
    }
    this.drawMarks();
    for (const coin of this.revealedCoins) this.drawCoin(coin);
    this.drawEffect(false);
    ctx.restore();
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
    ctx.shadowColor = '#971f1c'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#131413';
    ctx.fillRect(BOARD.x - 11, BOARD.y - 11, BOARD.w + 22, BOARD.h + 22);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#080909'; ctx.lineWidth = 10;
    ctx.strokeRect(BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24);
    ctx.strokeStyle = '#93887b'; ctx.lineWidth = 3;
    ctx.strokeRect(BOARD.x - 7, BOARD.y - 7, BOARD.w + 14, BOARD.h + 14);
    const background = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x, BOARD.y + BOARD.h);
    background.addColorStop(0, 'rgba(42,40,35,.97)'); background.addColorStop(1, 'rgba(19,21,19,.97)');
    ctx.fillStyle = background; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    ctx.strokeStyle = 'rgba(145,137,124,.14)'; ctx.lineWidth = 1;
    for (let reel = 1; reel < COLS; reel++) { ctx.beginPath(); ctx.moveTo(BOARD.x + reel * CW, BOARD.y); ctx.lineTo(BOARD.x + reel * CW, BOARD.y + BOARD.h); ctx.stroke(); }
    for (let row = 1; row < ROWS; row++) { ctx.beginPath(); ctx.moveTo(BOARD.x, BOARD.y + row * CH); ctx.lineTo(BOARD.x + BOARD.w, BOARD.y + row * CH); ctx.stroke(); }
    ctx.fillStyle = '#bcb4a2';
    for (const x of [BOARD.x - 7, BOARD.x + BOARD.w + 7]) for (const y of [BOARD.y - 7, BOARD.y + BOARD.h + 7]) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawSymbol(symbol: SymbolId, x: number, y: number, rotation = 0, sx = 1, sy = 1): void {
    const ctx = this.ctx, img = this.images.get(symbolURL(symbol));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(sx, sy);
    if (symbol === 'wild' || symbol === 'scatter' || CHARACTERS.includes(symbol as Character)) {
      ctx.shadowColor = symbol === 'wild' ? '#d39b35' : '#b92324'; ctx.shadowBlur = symbol === 'scatter' ? 15 : 9;
    }
    if (img?.complete && img.naturalWidth) {
      const scale = Math.min(CW * .90 / img.naturalWidth, CH * .91 / img.naturalHeight);
      ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
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
      this.inkText(symbol === 'wild' ? 'W' : symbol === 'scatter' ? 'S' : symbol === 'left' ? '☀' : symbol === 'middle' ? '!' : '€', 0, 16, 47, '#151615');
    }
  }

  private drawMultiplier(cell: Cell, multiplier: number): void {
    if (this.grid[cell.reel]?.[cell.row] !== 'wild' || multiplier <= 1) return;
    const position = center(cell);
    this.inkText(`×${multiplier}`, position.x, position.y + 49, 27, '#f7d36f');
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

  private drawCharacters(): void {
    const ctx = this.ctx;
    for (const character of this.activeCharacters) {
      const img = this.images.get(characterURL(character));
      if (!img?.complete || !img.naturalWidth) continue;
      const x = character === 'left' ? 93 : 1150;
      const y = character === 'right' && this.activeCharacters.includes('middle') ? 410 : 710;
      const height = character === 'right' && this.activeCharacters.includes('middle') ? 255 : 420;
      const scale = Math.min(187 / img.naturalWidth, height / img.naturalHeight);
      const active = this.effect?.character === character;
      const wobble = active && !this.reducedMotion.matches ? Math.sin((this.effect?.progress ?? 0) * Math.PI * 4) * .014 : 0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(wobble);
      if (active) { ctx.shadowColor = '#bd3527'; ctx.shadowBlur = 22; }
      ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale, img.naturalWidth * scale, img.naturalHeight * scale);
      ctx.restore();
    }
  }

  private drawLabels(): void {
    const ctx = this.ctx;
    this.inkText('ОТ СТАРОТО', W / 2, 99, 69, '#ddd3bd');
    ctx.font = '900 17px "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#baaca0';
    ctx.fillText(this.tier ? this.tierName(this.tier) : this.text('РУСЕ · НОЩНАТА СМЯНА', 'RUSE · NIGHT SHIFT'), W / 2, 128);
    ctx.fillStyle = '#151615'; ctx.fillRect(BOARD.x, BOARD.y + BOARD.h + 18, BOARD.w, 66);
    ctx.strokeStyle = '#716759'; ctx.lineWidth = 2; ctx.strokeRect(BOARD.x, BOARD.y + BOARD.h + 18, BOARD.w, 66);
    ctx.textAlign = 'left'; ctx.fillStyle = '#a69d8b'; ctx.font = '800 15px Arial';
    ctx.fillText(this.text('МНОЖИТЕЛ', 'MULTIPLIER'), BOARD.x + 17, BOARD.y + BOARD.h + 42);
    this.inkText(`×${this.global}`, BOARD.x + 160, BOARD.y + BOARD.h + 70, 29, '#f4c65c', 'left');
    ctx.textAlign = 'right'; ctx.font = '800 15px Arial'; ctx.fillStyle = '#a69d8b';
    ctx.fillText(this.tier ? this.text('ОСТАВАЩИ', 'REMAINING') : this.text('ПЕЧАЛБА', 'WIN'), BOARD.x + BOARD.w - 17, BOARD.y + BOARD.h + 42);
    this.inkText(this.tier ? String(this.remaining) : `€${(this.totalCents / 100).toFixed(2)}`, BOARD.x + BOARD.w - 17, BOARD.y + BOARD.h + 70, 29, '#e4dac6', 'right');
    if (this.stage === 'max-win') this.inkText('MAX 19 999×', W / 2, 520, 78, '#f5ca68');
  }

  private drawEffect(outside: boolean): void {
    const effect = this.effect;
    if (!effect) return;
    const ctx = this.ctx, p = effect.progress;
    if (effect.kind === 'tier' || effect.kind === 'scatter') {
      if (!outside) return;
      ctx.save();
      if (effect.kind === 'tier') {
        ctx.fillStyle = 'rgba(5,7,6,.8)'; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
        ctx.strokeStyle = '#a62c24'; ctx.lineWidth = 4; ctx.strokeRect(BOARD.x + 58, BOARD.y + 200, BOARD.w - 116, 202);
        this.inkText(this.text('БЕЗПЛАТНИ ЗАВЪРТАНИЯ', 'FREE SPINS'), W / 2, 407, 24, '#c9beaa');
        this.inkText(this.tierName(effect.tier ?? 'ruse'), W / 2, 488, 65, '#f0d27c');
      } else {
        ctx.fillStyle = 'rgba(9,7,7,.79)'; ctx.fillRect(BOARD.x + 98, BOARD.y + 257, BOARD.w - 196, 102);
        this.inkText(effect.label ?? 'SCATTER', W / 2, BOARD.y + 326, 43, '#f0dbbd');
      }
      ctx.restore(); return;
    }
    if (outside || effect.kind === 'god') return;
    if (effect.kind === 'reveal' && effect.source) {
      const pos = center(effect.source);
      ctx.save(); ctx.globalAlpha = Math.sin(p * Math.PI) * .7;
      ctx.strokeStyle = '#e5b552'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 36 + p * 27, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); return;
    }
    if (!effect.target) return;
    const end = center(effect.target), start = effect.source ? center(effect.source) : { x: BOARD.x, y: end.y };
    const flight = clamp(p / .68), impact = clamp((p - .68) / .32);
    if (effect.kind === 'wild') {
      if (p < .68) {
        const x = start.x + (end.x - start.x) * smooth(flight), y = start.y + (end.y - start.y) * flight - Math.sin(flight * Math.PI) * 90;
        ctx.save(); ctx.translate(x, y); ctx.rotate(flight * Math.PI * 2);
        ctx.fillStyle = '#e7bf64'; ctx.strokeStyle = '#080908'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-9, -21); ctx.lineTo(8, -21); ctx.lineTo(8, -5); ctx.lineTo(15, 1); ctx.lineTo(15, 26); ctx.lineTo(-15, 26); ctx.lineTo(-15, 1); ctx.lineTo(-9, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else this.splash(end.x, end.y, impact, '#e4bf65');
    } else if (effect.kind === 'shot') {
      ctx.save();
      if (p < .68) {
        ctx.strokeStyle = '#f2d8a1'; ctx.lineWidth = 3; ctx.globalAlpha = .9;
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(start.x + (end.x - start.x) * flight, start.y + (end.y - start.y) * flight); ctx.stroke();
      } else {
        this.splash(end.x, end.y, impact, '#efd68d');
        this.inkText(`×${effect.value ?? 1}`, end.x, end.y - 25 - impact * 20, 35, '#ffe695');
      }
      ctx.restore();
    } else if (effect.kind === 'coin') {
      const turn = Math.abs(Math.cos(p * Math.PI * 3));
      ctx.save(); ctx.translate(end.x, end.y); ctx.scale(Math.max(.075, turn), 1);
      ctx.fillStyle = '#d7ad4b'; ctx.strokeStyle = '#0b0c09'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f6df95'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 39, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#42351c'; ctx.font = '900 10px Arial'; ctx.textAlign = 'center';
      ctx.fillText(effect.coinKind === 'collector' ? this.text('СЪБИРАЧ', 'COLLECTOR') : effect.coinKind === 'global' ? 'ALL' : effect.coinKind === 'multiplier' ? this.text('МНОЖИТЕЛ', 'MULTIPLIER') : this.text('МОНЕТА', 'COIN'), 0, -22);
      this.inkText(p > .36 ? effect.label ?? '€' : '?', 0, 8, effect.label?.startsWith('€') ? 19 : 22, '#1c1b15');
      ctx.restore();
      if (p > .68) {
        const recipients = effect.recipient ? [effect.recipient] : effect.recipients ?? [];
        const travel = clamp((p - .68) / .32);
        ctx.save(); ctx.strokeStyle = '#e3c56e'; ctx.lineWidth = 3; ctx.globalAlpha = 1 - travel * .35;
        for (const recipient of recipients) {
          const target = center(recipient), reverse = effect.coinKind === 'collector';
          const a = reverse ? target : end, b = reverse ? end : target;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * travel, a.y + (b.y - a.y) * travel); ctx.stroke();
          if (travel > .72) this.splash(b.x, b.y, (travel - .72) / .28, '#e8c974');
        }
        ctx.restore();
      }
      if (p > .75) this.splash(end.x, end.y, clamp((p - .75) / .25), '#d6aa4c');
    }
  }

  private drawCoin(coin: Coin): void {
    const ctx = this.ctx, pos = center(coin.cell);
    ctx.save(); ctx.translate(pos.x, pos.y);
    ctx.fillStyle = coin.kind === 'collector' ? '#dbc583' : '#c6a250'; ctx.strokeStyle = '#090b08'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f2db95'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 37, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '900 10px Arial'; ctx.fillStyle = '#44351b'; ctx.textAlign = 'center';
    ctx.fillText(coin.kind === 'collector' ? this.text('СЪБИРАЧ', 'COLLECTOR') : coin.kind === 'global' ? 'ALL' : coin.kind === 'multiplier' ? this.text('МНОЖИТЕЛ', 'MULTIPLIER') : this.text('МОНЕТА', 'COIN'), 0, -20);
    const label = coin.kind === 'value' ? this.coinsFinal ? `€${(coin.payoutCents / 100).toFixed(2)}` : `${coin.value}×` : coin.kind === 'collector' ? `€${(coin.payoutCents / 100).toFixed(2)}` : coin.kind === 'global' ? `ALL ×${coin.value}` : `×${coin.value}`;
    this.inkText(label, 0, 10, label.startsWith('€') ? 20 : 24, '#211f16'); ctx.restore();
  }

  private splash(x: number, y: number, p: number, color: string): void {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = color; ctx.strokeStyle = '#16140f'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9, radius = 17 + p * (32 + i % 3 * 8);
      ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 5 - p * 2, 8 - p * 3, angle, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private drawGod(): void {
    const ctx = this.ctx;
    ctx.save(); ctx.fillStyle = 'rgba(3,4,4,.88)'; ctx.fillRect(0, 0, W, H);
    const carX = -550 + this.godCarProgress * 910, carY = 270;
    ctx.translate(carX, carY);
    const car = this.images.get(carURL);
    if (car?.complete && car.naturalWidth) {
      const scale = Math.min(495 / car.naturalWidth, 225 / car.naturalHeight);
      ctx.drawImage(car, 0, -30, car.naturalWidth * scale, car.naturalHeight * scale);
    } else {
    ctx.fillStyle = '#77776f'; ctx.strokeStyle = '#050605'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(65, 56); ctx.lineTo(116, -12); ctx.lineTo(351, -12); ctx.lineTo(405, 60); ctx.lineTo(483, 92); ctx.lineTo(483, 157); ctx.lineTo(0, 157); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#212725'; ctx.fillRect(125, 2, 99, 68); ctx.fillRect(243, 2, 101, 68);
    for (const x of [95, 390]) { ctx.fillStyle = '#080908'; ctx.beginPath(); ctx.arc(x, 157, 45, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#aaa798'; ctx.beginPath(); ctx.arc(x, 157, 20, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    this.inkText('GOD MODE', W / 2, 166, 52, '#ddd1b7');
    this.inkText('MAX 19 999×', W / 2, 583, 71, '#ecc35d');
    const godEffect = this.effect?.kind === 'god' ? this.effect : null;
    for (const [shot, hit] of this.godResolved.entries()) this.inkText(hit ? '●' : '×', W / 2 - 180 + shot * 70, 654, 47, hit ? '#d9b15a' : '#bc392d');
    if (godEffect) {
      const shooter = CHARACTERS.indexOf(godEffect.character ?? 'left');
      const from = { x: 320 + shooter * 240, y: 732 }, to = { x: godEffect.hit ? W / 2 : 862, y: godEffect.hit ? 550 : 570 };
      if (godEffect.progress < .4) {
        const travel = godEffect.progress / .4;
        ctx.save(); ctx.strokeStyle = '#f1dba5'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(from.x + (to.x - from.x) * travel, from.y + (to.y - from.y) * travel); ctx.stroke();
        ctx.restore(); this.splash(from.x, from.y, travel, '#e4b351');
      } else if (godEffect.progress < .92) this.splash(to.x, to.y, (godEffect.progress - .4) / .52, godEffect.hit ? '#e8c779' : '#9c8670');
    }
    for (const [index, character] of CHARACTERS.entries()) {
      const img = this.images.get(characterURL(character));
      if (img?.complete && img.naturalWidth) {
        const scale = Math.min(150 / img.naturalWidth, 210 / img.naturalHeight);
        ctx.drawImage(img, 320 + index * 240 - img.naturalWidth * scale / 2, 872 - img.naturalHeight * scale, img.naturalWidth * scale, img.naturalHeight * scale);
      }
    }
  }

  private inkText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
    const ctx = this.ctx;
    ctx.save(); ctx.font = `900 ${size}px RuseInk, Georgia, "Times New Roman", serif`; ctx.textAlign = align;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * .095); ctx.strokeStyle = '#050706'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  }
}
