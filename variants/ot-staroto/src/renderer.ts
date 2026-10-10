import { carURL, characterAnimationSprites, characterFrameCount, characterFrameSprite, characterReleaseFrame, characterSprite, coinURL, sceneURL, symbolSprite } from './art';
import { REGULARS, TIER_CHARACTERS } from './engine';
import type { Cell, Character, Coin, CoinCollection, Feature, Grid, Matrix, Round, Spin, SymbolId, Tier, Win } from './types';

const W = 1240, H = 900;
const BOARD = { x: 200, y: 170, w: 840, h: 630 };
const COLS = 6, ROWS = 5, CW = BOARD.w / COLS, CH = BOARD.h / ROWS;
// The contact sits on the front cabinet's sloping top in the original club
// illustration. Both the desktop contact and the narrow-screen crop use these
// source pixels; LUX is a separate actor, never baked into the backdrop.
const CLUB = { width: 1672, height: 941 };
const SPEAKER = { x: 1318, y: 390, width: 266, height: 425, seatX: 1394, seatY: 406 };
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
  kind: 'reveal' | 'wild' | 'shot' | 'expansion' | 'coin' | 'modifier' | 'collect' | 'coin-clear' | 'tier' | 'god' | 'scatter';
  progress: number; source?: Cell; target?: Cell; character?: Character; from?: SymbolId; to?: SymbolId;
  label?: string; value?: number; repeated?: boolean; tier?: Tier; shot?: number; hit?: boolean; coinKind?: Coin['kind']; recipient?: Cell; recipients?: Cell[];
  boostedReel?: number; sticky?: boolean;
  coin?: Coin; collection?: CoinCollection;
}
interface ReelExpansion { reel: number; source: Cell; multiplier: number; cells: Cell[] }
interface ShooterReelView {
  reel: number; character: 'middle'; sticky: boolean; totalMultiplier: number;
  cellMultipliers: number[]; inactiveRows: number[]; avatarVisible: true; multiplierRow: 4;
}
interface SpeakerSeatView {
  originalBackground: true;
  source: { x: number; y: number };
  contact: { x: number; y: number };
  relocated: boolean;
  sourceWindow: { x: number; y: number; width: number; height: number };
  speakerBounds: { left: number; top: number; right: number; bottom: number };
}
interface CharacterStagingView {
  character: Character; frame: number; index: number; count: number; scale: number; previousScale: number;
  anchor: { x: number; y: number }; bounds: { left: number; top: number; right: number; bottom: number };
  sourceCrop: readonly [number, number, number, number]; rotation: number; flip: number;
  seatContact: { x: number; y: number } | null; drawnSeatContact: { x: number; y: number } | null;
  canvas: 'character-stage' | 'game'; clip: 'none'; separate: true; speakerSeat: SpeakerSeatView | null;
}
interface CastLayoutSnapshot {
  portrait: boolean; scale: number;
  board: { left: number; top: number; width: number; height: number };
  stage: { left: number; top: number; width: number; height: number } | null;
  scene: { left: number; top: number; width: number; height: number } | null;
  viewport: RendererInspection['characterViewport'];
}
interface PoseEnvelope { minX: number; maxX: number; above: number; below: number }
export interface RendererUpdate {
  spin: Spin | null; round: Round | null; global: number; remaining: number; tier: Tier | null; totalCents: number;
}
export interface RendererInspection extends Omit<RendererUpdate, 'spin' | 'round'> {
  stage: string; grid: Grid; wildMultipliers: Matrix; marks: boolean[][];
  inactiveWilds: Cell[];
  activeCharacters: Character[]; movingCells: MovingSymbol[]; effect: Effect | null; coins: Coin[];
  coinWave: number | null; coinPhase: 'reveal' | 'revealed' | 'modifier' | 'collect' | 'clear' | 'award' | null;
  coinRevealRemaining: number; coinRevealProgress: number; collection: CoinCollection | null; clearedCoins: Cell[];
  godGrid: Grid | null; godShots: Round['godShots'];
  coinFlips: { coin: Coin; progress: number }[];
  characterFrames: { character: Character; index: number; count: number; progress: number }[];
  characterStaging: CharacterStagingView[];
  characterViewport: { left: number; top: number; right: number; bottom: number; canvas: 'character-stage' | 'game' };
  coinTransits: { source: Cell; target: Cell; progress: number; arrival: number }[];
  winningLines: Win[]; activeLine: number | null; lineProgress: number;
  expandedReels: ReelExpansion[]; expansionProgress: number; expansionCells: Cell[];
  expandedReelIds: number[]; lockedReels: number[]; shooterPhase: 'expand' | 'shots' | null;
  /** Retained reel values include resting Wilds; they are distinct from the active global multiplier. */
  shooterReels: ShooterReelView[];
  followUpShots: NonNullable<Feature['shotEvents']>;
}
export interface RendererOptions {
  /** The full-window shell can own one continuous scene behind the transparent board. */
  background?: 'scene' | 'transparent';
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
        settle: stationary ? 0 : Math.round(turbo ? 90 + 24 * unit(identity, 3) : 145 + 34 * unit(identity, 3)),
        drift: .8 + 1.8 * unit(identity, 4), lean: .019 + .018 * unit(identity, 5),
        phase: unit(identity, 6) * Math.PI * 2, curve: 1.42 + .22 * unit(identity, 7),
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
    // Each piece accelerates independently, then lands with one damped body reaction.
    // Smoothstep on the whole fall made the last half float; gravity keeps the contact decisive.
    const flightEnvelope = p === 1 ? 0 : Math.sin(p * Math.PI);
    const settling = cell.stationary || p < 1 || s >= 1 ? 0 : Math.sin(s * Math.PI * 3.25) * (1 - s) ** 2;
    const compression = cell.stationary || p < 1 ? 0 : .074 * Math.sin(Math.min(1, s / .28) * Math.PI) * (1 - s);
    const inAir = cell.stationary || p >= 1 ? 0 : Math.sin(p * Math.PI) * .019;
    const target = center(cell);
    return {
      ...cell, progress: p, settleProgress: s,
      x: target.x + (reduced || cell.stationary ? 0 : flightEnvelope * cell.drift * Math.sin(p * Math.PI * 1.75 + cell.phase) + settling * .95 * Math.sin(cell.phase)),
      y: (p === 1 ? target.y : BOARD.y + (cell.sourceRow + .5) * CH + (cell.row - cell.sourceRow) * CH * p ** cell.curve) + (reduced ? 0 : settling * 4.5),
      rotation: reduced || cell.stationary ? 0 : flightEnvelope * cell.lean * Math.sin(p * Math.PI * 1.8 + cell.phase) + settling * .012 * Math.cos(cell.phase),
      scaleX: reduced || cell.stationary ? 1 : 1 + compression - inAir * .55,
      scaleY: reduced || cell.stationary ? 1 : 1 - compression * .77 + inAir,
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
  private ctx: CanvasRenderingContext2D;
  private readonly boardContext: CanvasRenderingContext2D;
  private readonly castCanvas: HTMLCanvasElement | null;
  private readonly castContext: CanvasRenderingContext2D | null;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imageReady = new Map<string, Promise<void>>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly portraitMedia = window.matchMedia('(max-width: 760px) and (orientation: portrait)');
  private layout: CastLayoutSnapshot | null = null;
  private layoutSignature = '';
  private projectedSpeakerSeat: SpeakerSeatView | null = null;
  private readonly poseEnvelopes = new Map<Character, PoseEnvelope>();
  private readonly fittedCharacterScales = new Map<string, number>();
  private frameSurface: HTMLCanvasElement | null = null;
  private frameSurfaceRatio = 0;
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
  private coinRevealProgress = 0;
  private collection: CoinCollection | null = null;
  private clearedCoins: Cell[] = [];
  private coinPositions = new Set<string>();
  private coinFlips: { coin: Coin; progress: number }[] = [];
  private clearing = new Set<string>();
  private clearProgress = 0;
  private highlight = new Set<string>();
  private winningLines: Win[] = [];
  private activeLine = -1;
  private lineProgress = 0;
  private expandedReels: ReelExpansion[] = [];
  private expansionCells: Cell[] = [];
  private expandedReelIds = new Set<number>();
  private lockedReels = new Set<number>();
  private followUpShots: NonNullable<Feature['shotEvents']> = [];
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
  private viewportHeader: { top: number; height: number } | null = null;
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
    this.ctx = this.boardContext = context;
    const stage = canvas.closest<HTMLElement>('.stage');
    this.castCanvas = stage ? document.createElement('canvas') : null;
    this.castContext = this.castCanvas?.getContext('2d') ?? null;
    if (this.castCanvas) {
      this.castCanvas.id = 'character-stage'; this.castCanvas.setAttribute('aria-hidden', 'true');
      Object.assign(this.castCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
      stage!.append(this.castCanvas);
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'ОТ СТАРОТО — шест колони, пет реда');
    canvas.removeAttribute('title');
    canvas.style.cursor = 'default';
    canvas.style.aspectRatio = `${W} / ${H}`;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    if (stage) this.resizeObserver.observe(stage);
    this.sceneReady = this.preload();
    this.resize();
    void this.sceneReady.then(() => { if (!this.playing) this.draw(); }).catch(() => { this.stage = 'asset-error'; this.draw(); });
  }

  setLanguage(language: 'bg' | 'en'): void {
    this.language = language;
    this.canvas.setAttribute('aria-label', language === 'bg' ? 'ОТ СТАРОТО — шест колони, пет реда' : 'OT STAROTO — six columns, five rows');
    this.draw();
  }

  setIdle(grid?: Grid, multipliers?: Matrix, marks?: boolean[][], inactiveWilds: Cell[] = [], expandedReels: number[] = []): void {
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
    this.resetLines();
    this.expandedReels = [];
    this.expansionCells = [];
    this.expandedReelIds = new Set(expandedReels);
    this.lockedReels.clear();
    this.followUpShots = [];
    this.clearing.clear();
    this.stage = 'idle';
    this.syncGlobal();
    this.draw();
  }

  resize(): void {
    this.deviceRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(W * this.deviceRatio), height = Math.round(H * this.deviceRatio);
    // A CSS resize changes staging, not its logical artwork resolution. Do not
    // reset Canvas state or its backing store unless the display ratio changes.
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.refreshLayout();
    this.draw();
  }

  /** The shell may enlarge the board and crop unused street; keep its header inside view. */
  setViewportHeader(top: number, height: number): void {
    if (!Number.isFinite(top) || !Number.isFinite(height)) return;
    const nextTop = Math.max(0, Math.min(BOARD.y - 32, top));
    const nextHeight = Math.max(30, Math.min(BOARD.y - nextTop, height));
    const sameHeader = this.viewportHeader?.top === nextTop && this.viewportHeader?.height === nextHeight;
    const layoutChanged = this.refreshLayout();
    if (sameHeader && !layoutChanged) return;
    this.viewportHeader = { top: nextTop, height: nextHeight };
    this.fittedCharacterScales.clear();
    this.draw();
  }

  inspect(): RendererInspection {
    return {
      stage: this.stage, grid: cloneGrid(this.grid), wildMultipliers: cloneMatrix(this.wildMultipliers),
      marks: this.marks.map(column => [...column]), activeCharacters: [...this.activeCharacters],
      inactiveWilds: [...this.inactiveWilds].map(value => { const [reel, row] = value.split(':').map(Number); return { reel, row }; }),
      movingCells: this.moving.map(cell => ({ ...cell })), effect: this.effect ? { ...this.effect, source: this.effect.source ? { ...this.effect.source } : undefined, target: this.effect.target ? { ...this.effect.target } : undefined, recipient: this.effect.recipient ? { ...this.effect.recipient } : undefined, recipients: this.effect.recipients?.map(cell => ({ ...cell })), coin: this.effect.coin ? cloneCoin(this.effect.coin) : undefined, collection: this.effect.collection ? cloneCollection(this.effect.collection) : undefined } : null,
      coins: this.revealedCoins.map(cloneCoin),
      coinWave: this.coinWave, coinPhase: this.coinPhase, coinRevealRemaining: this.coinRevealRemaining, coinRevealProgress: this.coinRevealProgress,
      collection: this.collection ? cloneCollection(this.collection) : null,
      clearedCoins: this.clearedCoins.map(cell => ({ ...cell })),
      godGrid: this.godGrid ? cloneGrid(this.godGrid) : null,
      godShots: this.round?.godShots.map(shot => ({ ...shot, target: { ...shot.target } })) ?? [],
      coinFlips: this.coinFlips.map(flip => ({ coin: cloneCoin(flip.coin), progress: flip.progress })),
      characterFrames: this.activeCharacters.map(character => this.characterAnimationState(character)),
      characterStaging: this.characterStaging(),
      characterViewport: this.characterViewport(),
      coinTransits: this.effect?.kind === 'collect' && this.effect.collection ? this.effect.collection.sources.map((coin, index) => ({ source: { ...coin.cell }, target: { ...this.effect!.collection!.collector }, ...this.collectionTransit(this.effect!.progress, index, this.effect!.collection!.sources.length) })) : [],
      winningLines: this.winningLines.map(win => ({ ...win, cells: win.cells.map(cell => ({ ...cell })) })),
      activeLine: this.winningLines[this.activeLine]?.line ?? null, lineProgress: this.lineProgress,
      expandedReels: this.expandedReels.map(expansion => ({ ...expansion, source: { ...expansion.source }, cells: expansion.cells.map(cell => ({ ...cell })) })),
      expansionProgress: this.effect?.kind === 'expansion' ? this.effect.progress : 0,
      expansionCells: this.expansionCells.map(cell => ({ ...cell })),
      expandedReelIds: [...this.expandedReelIds], lockedReels: [...this.lockedReels],
      shooterReels: this.shooterReelViews(),
      shooterPhase: this.effect?.character === 'middle' ? this.effect.kind === 'expansion' ? 'expand' : this.effect.kind === 'shot' ? 'shots' : null : null,
      followUpShots: this.followUpShots.map(shot => ({ ...shot, target: { ...shot.target }, hits: shot.hits.map(hit => ({ ...hit, cell: { ...hit.cell } })) })),
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
    this.castCanvas?.remove();
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
    this.resetLines();
    this.expandedReels = [];
    this.expansionCells = [];
    this.expandedReelIds.clear();
    this.lockedReels.clear();
    this.followUpShots = [];
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
        this.expandedReels = [];
        this.expansionCells = [];
        this.followUpShots = [];
        this.expandedReelIds = new Set(spin.initialExpandedReels);
        this.lockedReels = new Set(spin.tier ? spin.initialExpandedReels.filter(reel => spin.initialWildMultipliers[reel].every(value => value > 0)) : []);
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
          this.expandedReelIds = new Set(cascade.expandedReels);
          this.lockedReels = new Set(spin.tier ? cascade.expandedReels.filter(reel => cascade.stickyWilds[reel].every(value => value > 0)) : []);
          this.global = cascade.globalMultiplier;
          this.emit();
          if (cascade.wins.length) {
            this.stage = 'win';
            this.winningLines = cascade.wins.map(win => ({ ...win, cells: win.cells.map(cell => ({ ...cell })) }));
            this.activeLine = 0;
            this.lineProgress = 0;
            this.highlight = new Set(cascade.wins.flatMap(win => win.cells).map(key));
            this.totalCents += cascade.wins.reduce((sum, win) => sum + win.payoutCents, 0);
            this.options.onSound?.('win');
            this.emit();
            // Readable left-to-right paths are replayed from the awarded cells. The
            // chart is never inferred from symbol positions or invented by this view.
            const previews = Math.min(4, this.winningLines.length);
            await this.animate((turbo ? 240 : 420) + (previews - 1) * (turbo ? 125 : 230), p => {
              const beat = Math.min(previews - 1, Math.floor(p * previews));
              this.activeLine = Math.floor(beat * this.winningLines.length / previews);
              this.lineProgress = p === 1 ? 1 : p * previews - beat;
            });
            this.highlight.clear();
            this.resetLines();
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
        this.expandedReelIds = new Set(spin.finalExpandedReels);
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
      this.resetLines();
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
    const shots = feature.character === 'middle' && feature.phase === 'shots';
    this.stage = shots ? 'feature-middle-shots' : `feature-${feature.character}`;
    if (!this.activeCharacters.includes(feature.character)) this.activeCharacters.push(feature.character);
    this.emit();
    this.options.onSound?.('feature');
    if (!shots) {
      const from = this.grid[feature.source.reel][feature.source.row];
      const to = feature.gridAfter[feature.source.reel][feature.source.row];
      this.effect = { kind: 'reveal', progress: 0, source: feature.source, character: feature.character, from, to };
      await this.animate(turbo ? 230 : 420, p => { if (this.effect) this.effect.progress = p; });
      this.grid[feature.source.reel][feature.source.row] = to;
      this.effect = null;
    }
    if (shots) {
      await this.presentFollowUpShots(feature, turbo);
    } else if (feature.character === 'middle') {
      await this.presentExpansion(feature, turbo);
    } else if (feature.character === 'left') {
      const hits = feature.hits.length ? feature.hits : feature.targets.map(cell => ({ cell, multiplier: feature.wildMultipliersAfter[cell.reel][cell.row], repeated: false }));
      for (const hit of hits) {
        this.effect = { kind: 'wild', progress: 0, source: feature.source, target: hit.cell, character: 'left', value: hit.multiplier, repeated: hit.repeated };
        this.options.onSound?.('throw');
        let impacted = false;
        await this.animate(turbo ? 330 : 600, p => {
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

  /** One committed shooter opens its own reel. Multiple shooters replay in
   * receipt order, each with its own release and exact final cell multipliers. */
  private async presentExpansion(feature: Feature, turbo: boolean): Promise<void> {
    if (feature.expandedReel === undefined || feature.expansionMultiplier === undefined) {
      throw new Error('An expanding shooter needs its recorded reel and multiplier.');
    }
    const hits = feature.hits;
    this.stage = 'feature-middle-expand';
    this.expansionCells = [];
    this.expandedReelIds.add(feature.expandedReel);
    if (this.tier !== null) this.lockedReels.add(feature.expandedReel);
    this.effect = { kind: 'expansion', progress: 0, source: { ...feature.source }, target: { ...feature.source }, character: 'middle', value: feature.expansionMultiplier, recipients: hits.map(hit => ({ ...hit.cell })) };
    this.options.onSound?.('shot');
    const revealed = new Set<string>();
    await this.animate(turbo ? 500 : 835, p => {
      if (!this.effect) return;
      this.effect.progress = p;
      let changed = false;
      for (const hit of hits) {
        const identity = key(hit.cell);
        if (p < this.expansionArrival(hit.cell, feature.source) || revealed.has(identity)) continue;
        revealed.add(identity);
        this.grid[hit.cell.reel][hit.cell.row] = 'wild';
        this.wildMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
        this.expansionCells.push({ ...hit.cell });
        changed = true;
      }
      if (changed) this.syncGlobal();
    });
    for (const hit of hits) {
      this.grid[hit.cell.reel][hit.cell.row] = 'wild';
      this.wildMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
    }
    this.expandedReels.push({ reel: feature.expandedReel, source: { ...feature.source }, multiplier: feature.expansionMultiplier, cells: hits.map(hit => ({ ...hit.cell })) });
    this.expandedReelIds.add(feature.expandedReel);
    if (this.tier !== null) this.lockedReels.add(feature.expandedReel);
    this.expansionCells = hits.map(hit => ({ ...hit.cell }));
    this.effect = null;
    this.syncGlobal();
  }

  private async presentFollowUpShots(feature: Feature, turbo: boolean): Promise<void> {
    for (const [index, shot] of (feature.shotEvents ?? []).entries()) {
      const column = shot.expandedReel !== undefined;
      const hit = shot.hits.find(hit => key(hit.cell) === key(shot.target));
      this.effect = { kind: 'shot', progress: 0, source: { ...feature.source }, target: { ...shot.target }, character: 'middle', recipients: shot.hits.map(hit => ({ ...hit.cell })), value: column ? 2 : hit?.multiplier ?? 1, repeated: hit?.repeated ?? false, boostedReel: shot.expandedReel, sticky: shot.sticky, shot: index };
      this.options.onSound?.('shot');
      let applied = false;
      await this.animate(turbo ? column ? 380 : 330 : column ? 660 : 600, p => {
        if (this.effect) this.effect.progress = p;
        if (p < .68 || applied) return;
        applied = true;
        for (const hit of shot.hits) {
          this.grid[hit.cell.reel][hit.cell.row] = 'wild';
          this.wildMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
        }
        if (shot.sticky && shot.expandedReel !== undefined) this.lockedReels.add(shot.expandedReel);
        this.followUpShots.push({ ...shot, target: { ...shot.target }, hits: shot.hits.map(hit => ({ ...hit, cell: { ...hit.cell } })) });
        this.syncGlobal();
      });
      this.effect = null;
    }
  }

  private expansionArrival(cell: Cell, source: Cell): number {
    const reach = Math.max(source.row, ROWS - 1 - source.row, 1);
    return .44 + .29 * Math.abs(cell.row - source.row) / reach;
  }

  private resetLines(): void {
    this.winningLines = [];
    this.activeLine = -1;
    this.lineProgress = 0;
  }

  private resetCoins(): void {
    this.revealedCoins = [];
    this.coinsFinal = false;
    this.coinWave = null;
    this.coinPhase = null;
    this.coinRevealRemaining = 0;
    this.coinRevealProgress = 0;
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
      this.coinRevealProgress = 0;
      this.collection = null;
      this.clearedCoins = [];
      this.revealedCoins = wave.existingCollectors.map(cloneCoin);
      this.stage = 'coin-reveal';
      this.emit();
      if (wave.coins.length > 10) {
        const revealed = new Set<number>();
        const flight = turbo ? 220 : 370, stagger = turbo ? 32 : 48;
        const duration = flight + (wave.coins.length - 1) * stagger;
        this.options.onSound?.('coin');
        await this.animate(duration, (p, elapsed) => {
          this.coinRevealProgress = p;
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
        await this.animate(turbo ? 170 : 295, p => {
          if (this.effect) this.effect.progress = p;
          this.coinRevealProgress = (wave.coins.length - this.coinRevealRemaining + p) / wave.coins.length;
        });
        this.revealedCoins.push(cloneCoin(coin));
        this.marks[coin.cell.reel][coin.cell.row] = false;
        this.coinRevealRemaining--;
        this.effect = null;
      }
      // The entire board can be read before any modifier or collector is allowed to act.
      this.coinRevealProgress = 1;
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
        await this.animate(turbo ? 460 : 840, p => {
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
      const finish = (alreadyPaintedFinal = false) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(this.animationFrame);
        if (!alreadyPaintedFinal) { update(1, duration); this.draw(); }
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
        if (elapsed >= duration) finish(true);
        else if (this.skipped || this.destroyed) finish();
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
    const urls = [carURL, ...SYMBOLS.map(symbol => symbolSprite(symbol).url), ...CHARACTERS.flatMap(character => characterAnimationSprites(character).map(sprite => sprite.url)), ...(['value', 'collector', 'multiplier', 'global'] as const).map(coinURL), ...[null, 'ruse', 'lux', 'edge', 'old'].map(tier => sceneURL(tier as Tier | null))];
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
    this.ctx = this.boardContext;
    const ctx = this.boardContext;
    ctx.setTransform(this.deviceRatio, 0, 0, this.deviceRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawScene();
    this.drawFrame();
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD.x + 3, BOARD.y + 3, BOARD.w - 6, BOARD.h - 6);
    ctx.clip();
    const shooterReels = this.shooterReelViews();
    const shooterIds = new Set(shooterReels.map(reel => reel.reel));
    if (this.moving.length) {
      for (const cell of [...this.moving.filter(cell => !cell.sticky), ...this.moving.filter(cell => cell.sticky)]) {
        if (cell.symbol === 'wild' && shooterIds.has(cell.reel)) continue;
        this.drawSymbol(cell.symbol, cell.x, cell.y, cell.rotation, cell.scaleX, cell.scaleY, this.inactiveWilds.has(key(cell)));
        if (cell.progress >= 1) this.drawMultiplier(cell, this.wildMultipliers[cell.reel]?.[cell.row] ?? 0);
      }
    } else {
      for (let reel = 0; reel < COLS; reel++) for (let row = 0; row < ROWS; row++) {
        if (shooterIds.has(reel)) continue;
        const cell = { reel, row }, position = center(cell), removing = this.clearing.has(key(cell));
        const dissolve = removing ? this.clearCellProgress(cell) : 0;
        ctx.save();
        if (removing) ctx.globalAlpha = 1 - smooth(dissolve);
        if (this.coinPositions.has(key(cell))) ctx.globalAlpha *= .10;
        let symbol = this.grid[reel]?.[row] ?? 'bottle', sx = removing ? 1 - dissolve * .18 : 1;
        if (this.effect?.kind === 'reveal' && this.effect.source && key(this.effect.source) === key(cell)) {
          const reveal = clamp((this.effect.progress - .15) / .59);
          symbol = reveal < .5 ? this.effect.from ?? symbol : this.effect.to ?? symbol;
          sx = this.reducedMotion.matches ? 1 : Math.max(.065, Math.abs(Math.cos(smooth(reveal) * Math.PI)));
        }
        const expanding = this.effect?.kind === 'expansion' && this.effect.source && this.effect.recipients?.some(target => key(target) === key(cell));
        const reelHit = this.effect?.kind === 'shot' && this.effect.boostedReel === reel && this.effect.recipients?.some(target => key(target) === key(cell));
        const impactAt = expanding ? this.expansionArrival(cell, this.effect!.source!) : this.effect?.kind === 'god' ? .4 : .68;
        const hit = expanding || reelHit || this.effect?.target && key(this.effect.target) === key(cell) && (this.effect.kind === 'wild' || this.effect.kind === 'shot' || this.effect.kind === 'god');
        const recoil = hit && !this.reducedMotion.matches ? clamp(((this.effect?.progress ?? 0) - impactAt) / (1 - impactAt)) : 1;
        const kick = Math.sin(recoil * Math.PI * 3) * (1 - recoil) ** 2;
        this.drawSymbol(symbol, position.x + kick * 4.5, position.y + kick * 2.2 - (this.reducedMotion.matches ? 0 : dissolve * 6), kick * .045, sx * (1 + Math.sin(recoil * Math.PI) * .055), removing ? 1 - dissolve * .18 : 1, this.inactiveWilds.has(key(cell)));
        this.drawMultiplier(cell, this.wildMultipliers[reel]?.[row] ?? 0);
        ctx.restore();
        if (removing && dissolve > .08 && dissolve < .8 && !this.reducedMotion.matches) this.clearInk(position.x, position.y, dissolve, hash(`${this.round?.id ?? 0}:${this.spin?.index ?? 0}:${key(cell)}`));
      }
    }
    this.drawShooterReels(shooterReels);
    this.drawMarks();
    this.drawWinningLines();
    this.drawGodShotMarks();
    for (const coin of this.revealedCoins) this.drawCoin(coin);
    this.drawEffect(false);
    ctx.restore();
    this.drawLabels();
    // The transparent cast stage spans the viewport, even on wide displays
    // where the actual club speaker lies beyond the narrower reel canvas.
    this.prepareCastCanvas();
    if (this.castContext) this.ctx = this.castContext;
    // One complete foreground pass, without a reel or header mask.
    if (!this.godCutscene) this.drawCharacters(shooterReels);
    this.drawEffect(true);
    if (this.godCutscene) this.drawGod();
    this.ctx = this.boardContext;
  }

  /** Layout is sampled only when the shell or display changes. Animation RAFs
   * consume the snapshot instead of repeatedly forcing browser layout. */
  private refreshLayout(): boolean {
    const boardRect = this.canvas.getBoundingClientRect();
    const stageRect = this.castCanvas?.getBoundingClientRect() ?? null;
    const sceneRect = this.options.background === 'transparent' ? this.canvas.closest<HTMLElement>('.game-shell')?.getBoundingClientRect() ?? null : null;
    const portrait = this.portraitMedia.matches;
    const signature = [portrait, this.deviceRatio, boardRect.left, boardRect.top, boardRect.width, boardRect.height,
      stageRect?.left, stageRect?.top, stageRect?.width, stageRect?.height, sceneRect?.left, sceneRect?.top, sceneRect?.width, sceneRect?.height].join(':');
    if (this.layout && signature === this.layoutSignature) return false;
    const rect = (value: DOMRect) => ({ left: value.left, top: value.top, width: value.width, height: value.height });
    const board = rect(boardRect), stage = stageRect ? rect(stageRect) : null, scene = sceneRect ? rect(sceneRect) : null;
    const scale = board.width > 0 ? board.width / W : 1;
    const viewport: RendererInspection['characterViewport'] = stage ? { left: (stage.left - board.left) / scale, top: (stage.top - board.top) / scale,
      right: (stage.left + stage.width - board.left) / scale, bottom: (stage.top + stage.height - board.top) / scale, canvas: 'character-stage' }
      : { left: 0, top: 0, right: W, bottom: H, canvas: 'game' };
    this.layout = { portrait, scale, board, stage, scene, viewport };
    this.layoutSignature = signature;
    this.projectedSpeakerSeat = this.projectSpeakerSeat(this.layout);
    this.fittedCharacterScales.clear();
    if (this.castCanvas && stage) {
      const width = Math.max(1, Math.round(stage.width * this.deviceRatio)), height = Math.max(1, Math.round(stage.height * this.deviceRatio));
      if (this.castCanvas.width !== width) this.castCanvas.width = width;
      if (this.castCanvas.height !== height) this.castCanvas.height = height;
    }
    return true;
  }

  private layoutSnapshot(): CastLayoutSnapshot {
    if (!this.layout) this.refreshLayout();
    return this.layout!;
  }

  private prepareCastCanvas(): void {
    if (!this.castCanvas || !this.castContext) return;
    const { stage, board, scale } = this.layoutSnapshot();
    if (!stage) return;
    const ctx = this.castContext;
    ctx.setTransform(this.deviceRatio, 0, 0, this.deviceRatio, 0, 0); ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.setTransform(this.deviceRatio * scale, 0, 0, this.deviceRatio * scale,
      this.deviceRatio * (board.left - stage.left), this.deviceRatio * (board.top - stage.top));
  }

  private characterViewport(): RendererInspection['characterViewport'] {
    return { ...this.layoutSnapshot().viewport };
  }

  private clearCellProgress(cell: Cell): number {
    const delay = this.reducedMotion.matches ? 0 : unit(hash(`${this.round?.id ?? 0}:${this.spin?.index ?? 0}:clear:${key(cell)}`), 19) * .22;
    return clamp((this.clearProgress - delay) / (1 - delay));
  }

  private clearInk(x: number, y: number, p: number, identity: number): void {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = Math.sin(p * Math.PI) * (1 - p) * .58;
    ctx.strokeStyle = '#c7b68e'; ctx.lineWidth = 1.3;
    for (let index = 0; index < 5; index++) {
      const angle = index * 2.39996 + unit(identity, 5) * .7, radius = 25 + p * (22 + unit(identity, index + 7) * 15);
      const length = 2 + (1 - p) * 5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .72);
      ctx.lineTo(x + Math.cos(angle) * (radius + length), y + Math.sin(angle) * (radius + length) * .72); ctx.stroke();
    }
    ctx.restore();
  }

  private drawScene(): void {
    if (this.options.background === 'transparent') return;
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
    if (!this.frameSurface || this.frameSurfaceRatio !== this.deviceRatio) {
      const surface = document.createElement('canvas');
      surface.width = Math.round(W * this.deviceRatio); surface.height = Math.round(H * this.deviceRatio);
      const context = surface.getContext('2d');
      if (!context) { this.paintFrame(); return; }
      const previous = this.ctx;
      this.ctx = context;
      context.setTransform(this.deviceRatio, 0, 0, this.deviceRatio, 0, 0);
      this.paintFrame();
      this.ctx = previous;
      this.frameSurface = surface; this.frameSurfaceRatio = this.deviceRatio;
    }
    // Replay the exact static frame at a one-to-one backing-pixel scale. The
    // expensive shadow and seven gradients are painted only once per DPR.
    this.ctx.drawImage(this.frameSurface, 0, 0, this.frameSurface.width / this.deviceRatio, this.frameSurface.height / this.deviceRatio);
  }

  private paintFrame(): void {
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

  private drawWinningLines(): void {
    if (!this.winningLines.length) return;
    const ctx = this.ctx;
    const trace = (win: Win, progress: number) => {
      const points = win.cells.map(center);
      if (!points.length) return;
      ctx.beginPath(); ctx.moveTo(points[0].x - CW * .40, points[0].y);
      ctx.lineTo(points[0].x, points[0].y);
      const distance = clamp(progress) * Math.max(1, points.length - 1);
      for (let index = 1; index < points.length; index++) {
        const fraction = clamp(distance - index + 1);
        if (fraction === 0) break;
        const from = points[index - 1], to = points[index];
        ctx.lineTo(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
      }
    };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // All awarded segments remain visible, with one readable path travelling
    // from reel one. A thin ink outline avoids covering the symbol drawings.
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(224,185,111,.27)';
    for (const win of this.winningLines) { trace(win, 1); ctx.stroke(); }
    const active = this.winningLines[this.activeLine];
    if (active) {
      const progress = this.reducedMotion.matches ? 1 : smooth(clamp(this.lineProgress / .48));
      ctx.strokeStyle = 'rgba(13,11,8,.92)'; ctx.lineWidth = 7; trace(active, progress); ctx.stroke();
      ctx.strokeStyle = '#efd29b'; ctx.lineWidth = 2.5; trace(active, progress); ctx.stroke();
      const first = center(active.cells[0]);
      ctx.fillStyle = '#241c13'; ctx.strokeStyle = '#e5ba76'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(first.x - CW * .44, first.y - 14, 30, 28, 5); ctx.fill(); ctx.stroke();
      this.inkText(String(active.line), first.x - CW * .44 + 15, first.y + 5, active.line >= 100 ? 12 : 15, '#f6d69b');
      const final = center(active.cells.at(-1)!);
      ctx.fillStyle = '#f5dfa6'; ctx.beginPath(); ctx.arc(final.x, final.y, progress === 1 ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private shooterReelViews(): ShooterReelView[] {
    return [...this.expandedReelIds].sort((a, b) => a - b).flatMap(reel => {
      const cellMultipliers = this.wildMultipliers[reel];
      if (!this.grid[reel]?.every(symbol => symbol === 'wild') || cellMultipliers?.length !== ROWS || !cellMultipliers.every(value => value > 0)) return [];
      return [{ reel, character: 'middle' as const, sticky: this.lockedReels.has(reel), totalMultiplier: cellMultipliers.reduce((sum, value) => sum + value, 0), cellMultipliers: [...cellMultipliers], inactiveRows: Array.from({ length: ROWS }, (_, row) => row).filter(row => this.inactiveWilds.has(`${reel}:${row}`)), avatarVisible: true as const, multiplierRow: 4 as const }];
    });
  }

  /** The character belongs to the expanded column, rather than to its original
   * badge. The receipt's retained five cell values keep the plate readable even
   * while winning Wilds rest, and when subsequent free spins begin to drop. */
  private drawShooterReels(reels: ShooterReelView[]): void {
    const ctx = this.ctx;
    for (const view of reels) {
      const left = BOARD.x + view.reel * CW + 5, width = CW - 10, x = left + width / 2;
      const resting = view.inactiveRows.length === ROWS;
      const columnHit = this.effect?.kind === 'shot' && this.effect.boostedReel === view.reel;
      const hitProgress = columnHit ? clamp((this.effect!.progress - .68) / .32) : 1;
      const hitFlash = columnHit && hitProgress > 0 ? Math.sin(hitProgress * Math.PI) : 0;
      const expansion = this.effect?.kind === 'expansion' && this.effect.source?.reel === view.reel;
      const entrance = expansion ? smooth(clamp((this.effect!.progress - .65) / .35)) : 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(left, BOARD.y + 5, width, BOARD.h - 10); ctx.clip();
      const shade = ctx.createLinearGradient(left, 0, left + width, 0);
      shade.addColorStop(0, resting ? '#282219' : '#6d2920'); shade.addColorStop(.48, resting ? '#373024' : '#9b3c27'); shade.addColorStop(1, resting ? '#282219' : '#6d2920');
      ctx.globalAlpha = .92 * entrance; ctx.fillStyle = shade; ctx.fillRect(left, BOARD.y + 5, width, BOARD.h - 10);
      // Ink hatching, a gold spine and each row's small Wild cue make the entire
      // reel legible without putting five generic W badges over the actor.
      ctx.strokeStyle = resting ? 'rgba(176,150,99,.13)' : 'rgba(247,202,119,.13)'; ctx.lineWidth = 1;
      for (let slash = -BOARD.h; slash < width + BOARD.h; slash += 19) { ctx.beginPath(); ctx.moveTo(left + slash, BOARD.y); ctx.lineTo(left + slash + BOARD.h * .36, BOARD.y + BOARD.h); ctx.stroke(); }
      const glow = ctx.createRadialGradient(x, BOARD.y + BOARD.h * .40, 12, x, BOARD.y + BOARD.h * .40, CW * 1.45);
      glow.addColorStop(0, resting ? 'rgba(220,198,156,.08)' : 'rgba(255,221,153,.32)'); glow.addColorStop(1, 'rgba(255,209,123,0)'); ctx.fillStyle = glow; ctx.fillRect(left, BOARD.y + 5, width, BOARD.h - 10);
      for (let row = 0; row < ROWS; row++) {
        const inactive = view.inactiveRows.includes(row), y = BOARD.y + row * CH + CH * .5;
        ctx.strokeStyle = inactive ? '#8c8066' : '#f5d397'; ctx.lineWidth = 1.5; ctx.globalAlpha = entrance * (inactive ? .48 : .83);
        for (const edge of [left + 9, left + width - 9]) { ctx.beginPath(); ctx.moveTo(edge, y - 10); ctx.lineTo(edge + (edge < x ? 3 : -3), y); ctx.lineTo(edge, y + 10); ctx.stroke(); }
      }
      ctx.globalAlpha = entrance;
      const actorActive = this.effect?.character === 'middle' && this.effect.source?.reel === view.reel;
      const sprite = characterFrameSprite('middle', actorActive ? this.characterAnimationState('middle').index : 0), image = this.images.get(sprite.url);
      const feetY = BOARD.y + CH * 4.06, scale = CH * 3.72 / (sprite.referenceHeight ?? sprite.height);
      const recoil = this.reducedMotion.matches ? 0 : hitFlash * 2.1;
      if (image?.complete && image.naturalWidth) {
        ctx.save(); ctx.translate(x + recoil, feetY); ctx.scale(-1, 1);
        // Cropping at the reel edges preserves the authored body's proportions;
        // no artwork is stretched to fill the tall column.
        ctx.globalAlpha *= resting ? .72 : 1;
        ctx.shadowColor = '#090807'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 4;
        ctx.drawImage(image, sprite.sx, sprite.sy, sprite.width, sprite.height, -(sprite.anchorX ?? sprite.width / 2) * scale, -(sprite.anchorY ?? sprite.height) * scale, sprite.width * scale, sprite.height * scale); ctx.restore();
      }
      this.inkText('WILD', x, BOARD.y + 39, 28, resting ? '#b6a380' : '#f7dfa7');
      if (view.sticky) {
        ctx.strokeStyle = resting ? '#aa9570' : '#f6d695'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x - 5, BOARD.y + 53, 10, 10, 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, BOARD.y + 53, 3.5, Math.PI, Math.PI * 2); ctx.stroke();
      }
      // The last row is a single retained reel total: not a new multiplier and
      // not the active-global sum, which excludes resting Wild cells.
      const plateY = BOARD.y + CH * 4 + 13, plateHeight = CH - 24;
      const plate = ctx.createLinearGradient(0, plateY, 0, plateY + plateHeight);
      plate.addColorStop(0, '#292014'); plate.addColorStop(.45, '#110f0c'); plate.addColorStop(1, '#302216');
      ctx.fillStyle = plate; ctx.strokeStyle = resting ? '#a08962' : '#efc37a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(left + 8, plateY, width - 16, plateHeight, 6); ctx.fill(); ctx.stroke();
      this.inkText(this.text('БАРАБАН', 'REEL TOTAL'), x, plateY + 22, 12, resting ? '#b9a480' : '#e7c68d');
      const total = `×${view.totalMultiplier.toLocaleString(this.language === 'bg' ? 'bg-BG' : 'en-IE')}`;
      this.inkText(total, x, plateY + 57, total.length > 7 ? 23 : total.length > 5 ? 27 : 33, resting ? '#dac39c' : '#ffe1a4');
      this.inkText(resting ? this.text('ПРЕЗАРЕЖДА', 'RECHARGING') : view.sticky ? this.text('ДО КРАЯ НА БОНУСА', 'BONUS STICKY') : this.text('ТОЗИ РУНД', 'THIS ROUND'), x, plateY + 80, 10, resting ? '#a99471' : '#c7a36c');
      ctx.restore();
      ctx.save(); ctx.shadowColor = resting ? 'transparent' : '#c96327'; ctx.shadowBlur = 8 + hitFlash * 19;
      ctx.strokeStyle = resting ? '#b39968' : '#f4c875'; ctx.lineWidth = columnHit ? 2.5 + hitFlash * 1.5 : 2.5; ctx.globalAlpha = entrance * (resting ? .74 : .97);
      ctx.strokeRect(left, BOARD.y + 5, width, BOARD.h - 10); ctx.restore();
    }
  }

  private speakerSeat(): SpeakerSeatView {
    this.layoutSnapshot();
    return this.projectedSpeakerSeat!;
  }

  private projectSpeakerSeat(layout: CastLayoutSnapshot): SpeakerSeatView {
    const source = { x: SPEAKER.seatX, y: SPEAKER.seatY };
    const sourceWindow = { x: SPEAKER.x, y: SPEAKER.y, width: SPEAKER.width, height: SPEAKER.height };
    if (layout.portrait) {
      // The full-height cover crops the right cabinet completely offscreen.
      // Re-stage that same cabinet, using its original pixels, in the header.
      const scale = 58 / SPEAKER.height, contact = { x: 866, y: BOARD.y - 59 };
      const left = contact.x - (SPEAKER.seatX - SPEAKER.x) * scale;
      const top = contact.y - (SPEAKER.seatY - SPEAKER.y) * scale;
      return { originalBackground: true, source, contact, relocated: true, sourceWindow, speakerBounds: { left, top, right: left + SPEAKER.width * scale, bottom: top + SPEAKER.height * scale } };
    }
    const { scene, board, scale } = layout;
    if (scene && scene.width > 0 && scene.height > 0 && board.width > 0) {
      const cover = Math.max(scene.width / CLUB.width, scene.height / CLUB.height);
      const offsetX = scene.left + (scene.width - CLUB.width * cover) / 2;
      const offsetY = scene.top + (scene.height - CLUB.height * cover) / 2;
      const project = (x: number, y: number) => ({ x: (offsetX + x * cover - board.left) / scale, y: (offsetY + y * cover - board.top) / scale });
      const contact = project(source.x, source.y), topLeft = project(SPEAKER.x, SPEAKER.y), bottomRight = project(SPEAKER.x + SPEAKER.width, SPEAKER.y + SPEAKER.height);
      return { originalBackground: true, source, contact, relocated: false, sourceWindow, speakerBounds: { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y } };
    }
    const cover = Math.max(W / CLUB.width, H / CLUB.height);
    const offsetX = (W - CLUB.width * cover) / 2, offsetY = (H - CLUB.height * cover) / 2;
    return { originalBackground: true, source, contact: { x: offsetX + source.x * cover, y: offsetY + source.y * cover }, relocated: false, sourceWindow,
      speakerBounds: { left: offsetX + SPEAKER.x * cover, top: offsetY + SPEAKER.y * cover, right: offsetX + (SPEAKER.x + SPEAKER.width) * cover, bottom: offsetY + (SPEAKER.y + SPEAKER.height) * cover } };
  }

  private characterPlacement(character: Character): { x: number; y: number; width: number; height: number } {
    const portrait = this.layoutSnapshot().portrait;
    if (character === 'right') {
      const contact = this.speakerSeat().contact;
      return { x: contact.x, y: contact.y, width: portrait ? 188 : 260, height: portrait ? 172 : 470 };
    }
    if (portrait) {
      const height = Math.min(160, (this.viewportHeader?.height ?? BOARD.y) - 10);
      return { x: character === 'left' ? 380 : 620, y: BOARD.y - 10, width: 170, height };
    }
    const shareLeftRail = character === 'middle' && this.activeCharacters.includes('right');
    return { x: character === 'left' || shareLeftRail ? 70 : 1080, y: shareLeftRail ? 478 : 795,
      width: character === 'left' ? 245 : 240, height: 470 };
  }

  private characterFlip(character: Character): number {
    return character === 'middle' && !(this.activeCharacters.includes('right') && !this.layoutSnapshot().portrait) ? -1 : 1;
  }

  private characterAnchor(character: Character, sprite: ReturnType<typeof characterFrameSprite>): { x: number; y: number } {
    const seated = sprite as typeof sprite & { seatAnchorX?: number; seatAnchorY?: number };
    return character === 'right' ? { x: seated.seatAnchorX ?? sprite.anchorX ?? sprite.width / 2, y: seated.seatAnchorY ?? sprite.anchorY ?? sprite.height }
      : { x: sprite.anchorX ?? sprite.width / 2, y: sprite.anchorY ?? sprite.height };
  }

  private poseEnvelope(character: Character): PoseEnvelope {
    let envelope = this.poseEnvelopes.get(character);
    if (envelope) return envelope;
    const first = characterFrameSprite(character, 0), reference = first.referenceHeight ?? first.height;
    envelope = { minX: 0, maxX: 0, above: 0, below: 0 };
    for (const sprite of characterAnimationSprites(character)) {
      const ratio = reference / (sprite.referenceHeight ?? sprite.height), anchor = this.characterAnchor(character, sprite);
      envelope.minX = Math.min(envelope.minX, -anchor.x * ratio);
      envelope.maxX = Math.max(envelope.maxX, (sprite.width - anchor.x) * ratio);
      envelope.above = Math.max(envelope.above, anchor.y * ratio);
      envelope.below = Math.max(envelope.below, (sprite.height - anchor.y) * ratio);
    }
    this.poseEnvelopes.set(character, envelope);
    return envelope;
  }

  private characterScale(character: Character, current = characterFrameSprite(character, 0)): number {
    const layout = this.layoutSnapshot(), flip = this.characterFlip(character);
    const stagingKey = `${character}:${this.activeCharacters.includes('right')}:${flip}`;
    const first = characterFrameSprite(character, 0);
    let scale = this.fittedCharacterScales.get(stagingKey);
    if (scale === undefined) {
      const box = this.characterPlacement(character), visible = layout.viewport, envelope = this.poseEnvelope(character);
      scale = Math.min(box.width / (first.referenceWidth ?? first.width), box.height / (first.referenceHeight ?? first.height));
      const minX = flip > 0 ? envelope.minX : -envelope.maxX;
      const maxX = flip > 0 ? envelope.maxX : -envelope.minX;
      if (minX < 0) scale = Math.min(scale, (box.x - visible.left - 8) / -minX);
      if (maxX > 0) scale = Math.min(scale, (visible.right - box.x - 8) / maxX);
      if (envelope.above > 0) scale = Math.min(scale, (box.y - visible.top - 6) / envelope.above);
      if (envelope.below > 0) scale = Math.min(scale, ((layout.portrait ? BOARD.y - 4 : visible.bottom - 8) - box.y) / envelope.below);
      scale = Math.max(.01, scale);
      this.fittedCharacterScales.set(stagingKey, scale);
    }
    return scale * (first.referenceHeight ?? first.height) / (current.referenceHeight ?? current.height);
  }

  private characterMuzzle(character: Character): { x: number; y: number } {
    const sprite = characterSprite(character, 'action');
    if (character === 'middle' && this.effect?.source && this.shooterReelViews().some(view => view.reel === this.effect!.source!.reel)) {
      const scale = CH * 3.72 / (sprite.referenceHeight ?? sprite.height);
      return { x: BOARD.x + (this.effect.source.reel + .5) * CW - ((sprite.attachmentX ?? sprite.width / 2) - (sprite.anchorX ?? sprite.width / 2)) * scale,
        y: BOARD.y + CH * 4.06 + ((sprite.attachmentY ?? sprite.height * .28) - (sprite.anchorY ?? sprite.height)) * scale };
    }
    const box = this.characterPlacement(character), anchor = this.characterAnchor(character, sprite), scale = this.characterScale(character, sprite);
    const flip = this.characterFlip(character);
    return { x: box.x + flip * ((sprite.attachmentX ?? sprite.width / 2) - anchor.x) * scale,
      y: box.y + ((sprite.attachmentY ?? sprite.height * .28) - anchor.y) * scale };
  }

  private characterAnimationState(character: Character): { character: Character; index: number; count: number; progress: number } {
    const active = this.effect?.character === character || this.effect?.kind === 'tier';
    const progress = !active ? 0 : this.effect?.kind === 'coin' && character === 'right' ? this.coinRevealProgress : this.effect?.progress ?? 0;
    const count = characterFrameCount(character), release = characterReleaseFrame(character);
    let index = 0;
    if (active) {
      if (this.reducedMotion.matches) index = progress < .26 ? 0 : progress < .80 ? release : count - 1;
      else if (this.effect?.kind === 'reveal') {
        // Introduce the actor with a soft anticipation and return; the following
        // action, rather than the badge reveal, performs the physical release.
        const preparation = Math.round((count - 1) * .28);
        const breathe = progress < .64 ? smooth(clamp(progress / .64)) : 1 - smooth(clamp((progress - .64) / .36));
        index = Math.floor(breathe * preparation);
      } else {
        // Sixteen genuine poses, with the release drawing exactly at .26.
        // Timings remain continuous, with a readable follow-through and settle.
        const beats = count === 16 ? [.028, .058, .09, .124, .16, .194, .228, .26, .345, .43, .555, .68, .765, .85, .94]
          : Array.from({ length: count - 1 }, (_, index) => index + 1 <= release ? .26 * (index + 1) / release : .26 + .68 * (index + 1 - release) / (count - 1 - release));
        index = beats.filter(beat => progress >= beat).length;
      }
    }
    return { character, index: Math.min(count - 1, index), count, progress };
  }

  private characterStaging(shooterReels = this.shooterReelViews()): CharacterStagingView[] {
    if (this.godCutscene || this.effect?.kind === 'tier') return [];
    return this.activeCharacters.flatMap(character => {
      const active = this.effect?.character === character;
      if (character === 'middle' && shooterReels.some(view => !active || this.effect?.source?.reel === view.reel)) return [];
      const state = this.characterAnimationState(character), sprite = characterFrameSprite(character, state.index), box = this.characterPlacement(character);
      const scale = this.characterScale(character, sprite), flip = this.characterFlip(character), origin = this.characterAnchor(character, sprite);
      const p = state.progress;
      const anticipation = character !== 'right' && active && !this.reducedMotion.matches && p < .26 ? Math.sin(p / .26 * Math.PI) * 1.7 : 0;
      const rotation = active && !this.reducedMotion.matches && p > .68 ? Math.sin((p - .68) / .32 * Math.PI) * (character === 'right' ? .005 : .013) * (character === 'left' ? -1 : 1) : 0;
      const anchor = { x: box.x, y: box.y + anticipation };
      const corners = [[0, 0], [sprite.width, 0], [sprite.width, sprite.height], [0, sprite.height]].map(([x, y]) => {
        const dx = (x - origin.x) * scale * flip, dy = (y - origin.y) * scale;
        return { x: anchor.x + dx * Math.cos(rotation) - dy * Math.sin(rotation), y: anchor.y + dx * Math.sin(rotation) + dy * Math.cos(rotation) };
      });
      const projectedSeat = character === 'right' ? this.speakerSeat() : null;
      const speakerSeat = projectedSeat ? { ...projectedSeat, source: { ...projectedSeat.source }, contact: { ...projectedSeat.contact }, sourceWindow: { ...projectedSeat.sourceWindow }, speakerBounds: { ...projectedSeat.speakerBounds } } : null;
      const portrait = this.layoutSnapshot().portrait;
      const previousScale = portrait ? Math.min(130 / (sprite.referenceWidth ?? sprite.width), 125 / (sprite.referenceHeight ?? sprite.height))
        : Math.min(190 / (sprite.referenceWidth ?? sprite.width), 426 / (sprite.referenceHeight ?? sprite.height));
      return [{ character, frame: state.index, index: state.index, count: state.count, scale, previousScale, anchor,
        bounds: { left: Math.min(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)), right: Math.max(...corners.map(point => point.x)), bottom: Math.max(...corners.map(point => point.y)) },
        sourceCrop: [sprite.sx, sprite.sy, sprite.width, sprite.height] as const, rotation, flip, canvas: this.castCanvas ? 'character-stage' as const : 'game' as const, clip: 'none' as const, separate: true as const,
        speakerSeat, seatContact: speakerSeat?.contact ?? null, drawnSeatContact: speakerSeat ? { ...anchor } : null }];
    });
  }

  private collectionTransit(p: number, index: number, count: number): { progress: number; arrival: number } {
    const stagger = count > 1 ? .23 / (count - 1) : 0;
    const launch = .12 + index * stagger;
    const flight = .47;
    return { progress: clamp((p - launch) / flight), arrival: launch + flight };
  }

  private drawCharacters(shooterReels: ShooterReelView[]): void {
    const ctx = this.ctx, staged = this.characterStaging(shooterReels);
    const seated = staged.find(actor => actor.character === 'right');
    if (seated?.speakerSeat?.relocated) this.drawOriginalSpeaker(seated.speakerSeat);
    for (const actor of staged) {
      const sprite = characterFrameSprite(actor.character, actor.frame), img = this.images.get(sprite.url);
      if (!img?.complete || !img.naturalWidth) continue;
      const origin = this.characterAnchor(actor.character, sprite);
      ctx.save();
      // Feet cast a floor shadow; a seated actor instead contacts the cabinet.
      ctx.fillStyle = 'rgba(0,0,0,.50)'; ctx.beginPath();
      ctx.ellipse(actor.anchor.x, actor.anchor.y + (actor.character === 'right' ? 1 : -5), actor.character === 'right' ? 29 : 62, actor.character === 'right' ? 3.5 : 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(actor.anchor.x, actor.anchor.y); ctx.rotate(actor.rotation); ctx.scale(actor.flip, 1);
      ctx.shadowColor = 'rgba(0,0,0,.48)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -origin.x * actor.scale, -origin.y * actor.scale, sprite.width * actor.scale, sprite.height * actor.scale);
      ctx.restore();
    }
  }

  private drawOriginalSpeaker(seat: SpeakerSeatView): void {
    const image = this.images.get(sceneURL(this.tier));
    if (!image?.complete || !image.naturalWidth) return;
    const ctx = this.ctx, source = seat.sourceWindow, destination = seat.speakerBounds;
    const scale = (destination.right - destination.left) / source.width;
    // Cabinet silhouette from the same source illustration. Cropping a rectangle
    // would leave a pasted background patch; this follows its original edges.
    ctx.save(); ctx.shadowColor = '#090807'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.beginPath();
    for (const [index, point] of [[1318, 409], [1502, 390], [1584, 398], [1584, 641], [1474, 680], [1474, 808], [1318, 757]].entries()) {
      const x = destination.left + (point[0] - source.x) * scale, y = destination.top + (point[1] - source.y) * scale;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.clip();
    ctx.drawImage(image, source.x, source.y, source.width, source.height, destination.left, destination.top, destination.right - destination.left, destination.bottom - destination.top);
    ctx.restore();
  }

  private drawLabels(): void {
    if (this.godCutscene) return;
    const ctx = this.ctx;
    const mobile = this.layoutSnapshot().portrait;
    const header = this.viewportHeader;
    if (mobile && this.activeCharacters.length) {
      this.inkText('ОТ СТАРОТО', W / 2, (header?.top ?? 0) + 26, 25, '#ddd3bd');
    } else {
      const compact = !!header && header.height < 130;
      const titleY = compact ? header.top + header.height * .43 : mobile ? 93 : 88;
      const titleSize = compact ? Math.max(23, Math.min(42, header.height * .43)) : mobile ? 56 : 58;
      this.inkText('ОТ СТАРОТО', W / 2, titleY, titleSize, '#ddd3bd');
      if (this.coinWave === null) {
        const subtitleY = compact ? header.top + header.height * .74 : mobile ? 123 : 116;
        ctx.font = `700 ${compact ? 12 : 14}px RuseInk, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#b2a68e';
        ctx.fillText(this.tier ? this.tierName(this.tier) : this.text('РУСЕ · НОЩНАТА СМЯНА', 'RUSE · NIGHT SHIFT'), W / 2, subtitleY);
      }
    }
    if (this.coinWave !== null) {
      const label = this.coinPhase === 'collect' ? this.text('СЪБИРАНЕ', 'COLLECT') : this.coinPhase === 'modifier' ? this.text('МНОЖИТЕЛ', 'MULTIPLIER') : this.coinPhase === 'award' ? this.text('ПЕЧАЛБА ОТ МОНЕТИ', 'COIN WIN') : `${this.text('РАЗКРИВАНЕ', 'REVEAL')} ${this.coinWave + 1}`;
      this.inkText(label, W / 2, BOARD.y - 14, 17, '#dfc17a');
    } else if (this.effect?.kind === 'expansion') {
      this.inkText(`${this.text('РАЗГЪВАЩ WILD', 'EXPANDING WILD')} ×${this.effect.value ?? 1}`, W / 2, BOARD.y - 14, 17, '#dfc17a');
    } else if (this.effect?.kind === 'shot' && this.effect.boostedReel !== undefined) {
      const label = this.text('ПОДСИЛЕН БАРАБАН', 'REEL BOOST');
      this.inkText(`${label} · ×2`, W / 2, BOARD.y - 14, 17, '#dfc17a');
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
          const state = this.characterAnimationState(character), sprite = characterFrameSprite(character, state.index), img = this.images.get(sprite.url);
          if (!img?.complete || !img.naturalWidth) continue;
          const scale = Math.min(145 / (sprite.referenceWidth ?? sprite.width), 252 / (sprite.referenceHeight ?? sprite.height));
          const x = W / 2 + (index - (cast.length - 1) / 2) * 190;
          ctx.save(); ctx.translate(x, 469);
          ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -(sprite.anchorX ?? sprite.width / 2) * scale, -(sprite.anchorY ?? sprite.height) * scale, sprite.width * scale, sprite.height * scale);
          ctx.restore();
        }
        this.inkText(this.text('БЕЗПЛАТНИ ЗАВЪРТАНИЯ', 'FREE SPINS'), W / 2, 523, 23, '#bbaa8c');
        this.inkText(this.tierName(tier), W / 2, 590, tier === 'old' ? 63 : 58, '#f0d27c');
        ctx.strokeStyle = '#a1844d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 162, 622); ctx.lineTo(W / 2 + 162, 622); ctx.stroke();
      } else {
        const lift = (1 - smooth(clamp(p / .24))) * 14;
        ctx.fillStyle = 'rgba(9,7,7,.80)'; ctx.fillRect(BOARD.x + 113, BOARD.y + 265 - lift, BOARD.w - 226, 86);
        this.inkText(effect.label ?? 'SCATTER', W / 2, BOARD.y + 323 - lift, 38, '#f0dbbd');
      }
      ctx.restore(); return;
    }
    if (outside) {
      if (effect.kind === 'wild' || effect.kind === 'shot' || effect.kind === 'expansion' || effect.kind === 'god') this.drawProjectile(effect);
      if ((effect.kind === 'shot' || effect.kind === 'wild' || effect.kind === 'expansion') && effect.character && p > .26 && p < .39) {
        const origin = this.characterMuzzle(effect.character);
        this.impact(origin.x, origin.y, clamp((p - .26) / .13), effect.kind === 'wild' ? '#c5ad6c' : '#f5dfa3', true);
      }
      return;
    }
    if (effect.kind === 'coin-clear') return;
    if (effect.kind === 'expansion') { this.drawExpansion(effect); return; }
    if (effect.kind === 'shot' && effect.boostedReel !== undefined && effect.target && p >= .68) {
      this.drawExpansion({ ...effect, source: effect.target, progress: .44 + clamp((p - .68) / .32) * .56 });
    }
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
        const { progress: travel, arrival } = this.collectionTransit(p, index, collection.sources.length);
        if (travel <= 0 || travel >= 1) {
          if (p >= arrival && p < arrival + .14) this.impact(end.x, end.y, clamp((p - arrival) / .14), '#d2b777');
          continue;
        }
        const motion = smooth(travel), side = index % 2 ? -1 : 1;
        const curve = Math.sin(travel * Math.PI) * (17 + Math.min(46, Math.abs(end.x - from.x) * .10));
        const x = from.x + (end.x - from.x) * motion + Math.sin(travel * Math.PI) * side * 8;
        const y = from.y + (end.y - from.y) * motion - (this.reducedMotion.matches ? 0 : curve);
        const img = this.images.get(coinURL(coin.kind));
        ctx.save(); ctx.globalAlpha = 1 - travel * .20; ctx.translate(x, y); ctx.rotate(this.reducedMotion.matches ? 0 : side * Math.sin(travel * Math.PI) * .28);
        const size = 67 * (1 - travel * .48);
        ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        // Brief pen strokes behind the moving token keep the motion in the drawing's ink language.
        if (!this.reducedMotion.matches && travel < .82) {
          ctx.strokeStyle = 'rgba(211,189,138,.54)'; ctx.lineWidth = 1.4;
          const vx = Math.sign(end.x - from.x), vy = Math.sign(end.y - from.y);
          ctx.beginPath(); ctx.moveTo(-vx * 22, -vy * 12); ctx.lineTo(-vx * 35, -vy * 22); ctx.stroke();
        }
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
        else { ctx.fillStyle = '#d1ad57'; ctx.beginPath(); ctx.arc(0, 0, size * .34, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      return;
    }
    const god = effect.kind === 'god';
    const impactAt = god ? .4 : .68;
    const impact = clamp((p - impactAt) / (1 - impactAt));
    if (p < impactAt) return;
    if (effect.kind === 'wild') this.splash(end.x, end.y, impact, '#cbaa56');
    else if (effect.kind === 'shot' || god) {
      this.impact(end.x, end.y, impact, god && !effect.hit ? '#aa9781' : '#efd18b');
      if (!god) this.inkText(effect.kind === 'shot' && !effect.repeated ? 'WILD' : `×${effect.value ?? 1}`, end.x, end.y - 27 - impact * 18, 31, '#ffe2a0');
    }
  }

  private drawExpansion(effect: Effect): void {
    if (!effect.source || effect.progress < .44) return;
    const ctx = this.ctx, source = center(effect.source), p = effect.progress;
    const spread = smooth(clamp((p - .44) / .30));
    const top = source.y - (source.y - BOARD.y - 5) * spread;
    const bottom = source.y + (BOARD.y + BOARD.h - 5 - source.y) * spread;
    const left = BOARD.x + effect.source.reel * CW + 7, right = left + CW - 14;
    const fade = 1 - clamp((p - .84) / .16) * .78;
    ctx.save();
    const glow = ctx.createLinearGradient(left, 0, right, 0);
    glow.addColorStop(0, 'rgba(233,195,119,.16)'); glow.addColorStop(.5, 'rgba(233,195,119,.035)'); glow.addColorStop(1, 'rgba(233,195,119,.16)');
    ctx.globalAlpha = fade; ctx.fillStyle = glow; ctx.fillRect(left, top, right - left, bottom - top);
    const border = () => {
      ctx.beginPath(); ctx.moveTo(left + 14, top); ctx.lineTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(left + 14, bottom);
      ctx.moveTo(right - 14, top); ctx.lineTo(right, top); ctx.lineTo(right, bottom); ctx.lineTo(right - 14, bottom);
    };
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#15130d'; ctx.lineWidth = 6; border(); ctx.stroke();
    ctx.strokeStyle = '#e4c284'; ctx.lineWidth = 2.2; border(); ctx.stroke();
    for (const cell of effect.recipients ?? []) {
      const arrival = this.expansionArrival(cell, effect.source), after = p - arrival;
      if (after < 0 || after >= .15) continue;
      const at = center(cell);
      this.impact(at.x, at.y, clamp(after / .15), '#e6c27c');
      if (!this.reducedMotion.matches) {
        const stroke = Math.sin(clamp(after / .15) * Math.PI) * .42;
        ctx.globalAlpha = fade * stroke; ctx.strokeStyle = '#f6dc9d'; ctx.lineWidth = 1.2;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(at.x + side * 32, at.y - 17); ctx.lineTo(at.x + side * 48, at.y - 29); ctx.stroke();
        }
        ctx.globalAlpha = fade;
      }
    }
    ctx.restore();
  }

  /** A released object follows its hand-to-cell path in the complete scene, across the frame rail. */
  private drawProjectile(effect: Effect): void {
    if (!effect.target) return;
    const god = effect.kind === 'god', p = effect.progress, impactAt = god ? .4 : effect.kind === 'expansion' ? .44 : .68, releaseAt = god ? .20 : .26;
    if (p <= releaseAt || p >= impactAt) return;
    const ctx = this.ctx, end = center(effect.target);
    const start = god ? this.godMuzzle(effect.character ?? 'left') : effect.character ? this.characterMuzzle(effect.character) : effect.source ? center(effect.source) : { x: BOARD.x, y: end.y };
    const flight = clamp((p - releaseAt) / (impactAt - releaseAt));
    if (effect.kind === 'wild') {
      const arc = this.reducedMotion.matches ? 0 : Math.min(105, 39 + Math.abs(end.x - start.x) * .12);
      const at = (progress: number) => ({ x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress - Math.sin(progress * Math.PI) * arc });
      const position = at(flight), previous = at(Math.max(0, flight - .06)), tail = at(Math.max(0, flight - .13));
      const sprite = symbolSprite('wild'), img = this.images.get(sprite.url);
      ctx.save();
      if (!this.reducedMotion.matches) {
        ctx.strokeStyle = 'rgba(205,183,125,.47)'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.quadraticCurveTo(previous.x, previous.y, position.x, position.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(27,23,16,.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tail.x - 3, tail.y + 3); ctx.lineTo(previous.x - 3, previous.y + 3); ctx.stroke();
      }
      ctx.translate(position.x, position.y);
      ctx.rotate(this.reducedMotion.matches ? 0 : -.4 + flight * Math.PI * 1.25);
      if (!this.reducedMotion.matches) ctx.scale(Math.max(.40, Math.abs(Math.cos(flight * Math.PI))), 1);
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 3;
      const size = 48 + Math.sin(flight * Math.PI) * 5;
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, sprite.sx, sprite.sy, sprite.width, sprite.height, -size / 2, -size / 2, size, size);
      else { ctx.fillStyle = '#d0b774'; ctx.fillRect(-8, -23, 16, 47); }
      ctx.restore();
    } else {
      const x = start.x + (end.x - start.x) * flight, y = start.y + (end.y - start.y) * flight;
      const tail = Math.max(0, flight - .09);
      ctx.save(); ctx.strokeStyle = '#f4ddb0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(start.x + (end.x - start.x) * tail, start.y + (end.y - start.y) * tail); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#fff0cc'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
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
    let label = this.coinLabel(coin);
    const collection = this.effect?.kind === 'collect' ? this.effect.collection : null;
    if (collection && key(collection.collector) === key(coin.cell)) {
      const arrived = collection.sources.reduce((sum, source, index) => sum + (this.effect!.progress >= this.collectionTransit(this.effect!.progress, index, collection.sources.length).arrival ? source.payoutCents : 0), 0);
      label = `€${((collection.valueBeforeCents + arrived) / 100).toFixed(2)}`;
      if (!this.reducedMotion.matches) {
        const pulse = collection.sources.reduce((max, _source, index) => {
          const after = this.effect!.progress - this.collectionTransit(this.effect!.progress, index, collection.sources.length).arrival;
          return Math.max(max, after > 0 && after < .14 ? Math.sin(after / .14 * Math.PI) * .045 : 0);
        }, 0);
        ctx.scale(1 + pulse, 1 + pulse);
      }
    }
    this.drawCoinPlate(coin, label);
    ctx.restore();
  }

  private drawCoinReveal(coin: Coin, p: number): void {
    const ctx = this.ctx, end = center(coin.cell);
    const flip = this.reducedMotion.matches ? 1 : Math.max(.060, Math.abs(Math.cos(smooth(p) * Math.PI)));
    const rise = this.reducedMotion.matches ? 0 : -Math.sin(p * Math.PI) * 9;
    ctx.save(); ctx.translate(end.x, end.y + rise); ctx.scale(flip, 1 + Math.sin(p * Math.PI) * .025);
    if (coin.kind !== 'empty' || p < .76) this.drawCoinPlate(coin, p >= .50 ? this.coinLabel(coin, false) : '?', p);
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
    const height = Math.min(168, (this.viewportHeader?.height ?? 170) - 2), width = 257 * height / 168;
    const arrivedX = W / 2 - width / 2;
    const x = this.godCarProgress <= 1 ? -width - 50 + (arrivedX + width + 50) * this.godCarProgress : arrivedX + (W + 80 - arrivedX) * (this.godCarProgress - 1);
    return { x, y: this.viewportHeader?.top ?? -2, width, height };
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
    const header = this.viewportHeader ?? { top: 0, height: BOARD.y };
    ctx.beginPath(); ctx.rect(0, header.top, W, header.height - 3); ctx.clip();
    const carShade = ctx.createLinearGradient(0, header.top, 0, header.top + header.height);
    carShade.addColorStop(0, 'rgba(9,8,6,.22)'); carShade.addColorStop(1, 'rgba(9,8,6,.76)'); ctx.fillStyle = carShade; ctx.fillRect(0, header.top, W, header.height);
    const brake = !this.reducedMotion.matches && this.godCarProgress > .85 && this.godCarProgress < 1 ? Math.sin((this.godCarProgress - .85) / .15 * Math.PI) * 1.5 : 0;
    if (car?.complete && car.naturalWidth) {
      ctx.shadowColor = '#050706'; ctx.shadowBlur = 17;
      ctx.drawImage(car, box.x, box.y + brake, box.width, box.height);
    }
    this.inkText('GOD MODE', BOARD.x + 125, header.top + header.height * .61, Math.min(31, header.height * .23), '#ddd1b7');
    const hit = this.godResolved.some(Boolean);
    this.inkText(hit ? this.text('В ЦЕЛТА', 'TARGET HIT') : this.text('НА ПРИЦЕЛ', 'TAKE AIM'), BOARD.x + BOARD.w - 126, header.top + header.height * .61, Math.min(24, header.height * .19), hit ? '#edc573' : '#d0bc95');
    for (const [shot, resolved] of this.godResolved.entries()) {
      ctx.fillStyle = resolved ? '#d8b263' : '#857260';
      const x = BOARD.x + BOARD.w - 167 + shot * 19;
      ctx.beginPath(); ctx.arc(x, header.top + header.height * .77, 3.5, 0, Math.PI * 2); ctx.fill();
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
