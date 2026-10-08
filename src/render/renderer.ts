import type { BonusTier, CellPosition, Grid, ModifierEvent, SpinPresentation, SymbolId, Win } from '../engine/types';
import { SymbolArtwork, SYMBOL_LABELS, SYMBOLS } from './art-v2';
import { boughtBonusTriggerGrid } from './bonus-trigger';
import { dropFrames, planDrop, type DropPlan, type MovingCell } from './drop-motion';
export { drawSymbolPreview, SYMBOL_LABELS } from './art-v2';

export type RendererEvent = 'reel-stop' | 'xways' | 'infectious' | 'bomb' | 'shot' | 'cascade' | 'win' | 'scatter' | 'upgrade';
export interface RendererOptions {
  translate?: (key: string) => string;
  formatMoney?: (euros: number, maximumFractionDigits?: number) => string;
  onEvent?: (name: RendererEvent, value?: number) => void;
  onStep?: (view: { grid: Grid; positionMultipliers: number[][]; payoutCents: number; cascade: number }) => void;
}
interface BoardView { grid: Grid; positionMultipliers: number[][]; wins: Win[] }
interface PartialBoardView {
  grid: Grid; positionMultipliers?: number[][]; finalGrid?: Grid; finalPositionMultipliers?: number[][];
  frames?: boolean[][]; wins?: Win[]; tier?: BonusTier | null;
}
interface SpinView { target: BoardView; previous: Grid; elapsed: number; stops: number[]; plan: DropPlan; clearDuration: number; duration: number; stopped: Set<number> }
interface TumbleView { plan: DropPlan; progress: number; duration: number }
interface EffectView { event: ModifierEvent; progress: number; before: BoardView; splashed: Map<string, number>; splashDuration: number }
interface Particle { x: number; y: number; vx: number; vy: number; spin: number; size: number; color: string; born: number; lifetime: number; fluid?: boolean }

const REELS = 6, ROWS = 5, WIDTH = 1040, HEIGHT = 730;
const BADGE_REVEAL_AT = .32;
const NORMAL_BOOST_AT = .56;
const INFECTION_THROW_AT = .48;
const AREA = { x: 34, y: 48, w: 972, h: 650 };
const CELL_W = AREA.w / REELS, CELL_H = AREA.h / ROWS, INK = '#201c28';
const SCENES: Record<string, { wood: string; shade: string; tint: string; accent: string }> = {
  base: { wood: '#39323f', shade: '#2d2733', tint: '#d5a459', accent: '#f2d28c' },
  dorm: { wood: '#334541', shade: '#273530', tint: '#92bc9d', accent: '#b9e3c5' },
  friday: { wood: '#45313f', shade: '#352431', tint: '#db81af', accent: '#f1a5d0' },
  december: { wood: '#39374e', shade: '#2b293e', tint: '#a39ed7', accent: '#95ded5' },
};
const key = (cell: CellPosition) => `${cell.reel}:${cell.row}`;
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const ease = (p: number) => 1 - (1 - clamp(p)) ** 3;
const fallEase = (p: number) => { const t = clamp(p); return t * t * t * (10 + t * (-15 + t * 6)); };
const seeded = (n: number) => { const value = Math.sin(n * 127.1 + 19.7) * 43758.5453123; return value - Math.floor(value); };
const matrix = (value: number) => Array.from({ length: REELS }, () => Array(ROWS).fill(value) as number[]);
const copyGrid = (grid: Grid): Grid => grid.map(column => [...column]);
const copyMatrix = (values: number[][]): number[][] => values.map(column => [...column]);
function badgeImpactAt(event: ModifierEvent, targetIndex: number): number {
  return event.kind === 'xways' ? NORMAL_BOOST_AT : INFECTION_THROW_AT + .30 + Math.max(0, targetIndex) * .10 / Math.max(1, event.targets.length - 1);
}
function centre(cell: CellPosition) { return { x: AREA.x + (cell.reel + .5) * CELL_W, y: AREA.y + (cell.row + .5) * CELL_H }; }
function polygon(ctx: CanvasRenderingContext2D, points: number[], fill: string, stroke = INK, width = 3) {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (width) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, stroke = INK, width = 5) {
  ctx.font = `900 ${size}px "Grad Display", "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}

/** Replays settled engine snapshots. Rendering never rolls symbols or changes a payout. */
export class SlotRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly artwork = new SymbolArtwork();
  private current: BoardView;
  private spin: SpinView | null = null;
  private tumble: TumbleView | null = null;
  private effect: EffectView | null = null;
  private removal: { cells: Set<string>; progress: number; fixed?: Set<string> } | null = null;
  private highlightProgress = 0;
  private tier: BonusTier | null = null;
  private sceneChangedAt = 0;
  private cascadeIndex = 0;
  private lockedBetCents = 0;
  private maxWin = false;
  private scatterPulse = 0;
  private stagedBonus: { tier: BonusTier; scatters: number } | null = null;
  private particles: Particle[] = [];
  private active = false;
  private destroyed = false;
  private skipRequested = false;
  private frameId = 0;
  private lastDraw = 0;
  private celebration: { start: number; maxWin: boolean; ratio: number } | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(readonly canvas: HTMLCanvasElement, private readonly options: RendererOptions = {}) {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D is unavailable'); this.ctx = ctx;
    const paying = SYMBOLS.filter(id => !['wild', 'scatter', 'vip', 'xways', 'infectious', 'bomb', 'shot'].includes(id));
    this.current = {
      grid: Array.from({ length: REELS }, (_, reel) => Array.from({ length: ROWS }, (_, row) => paying[(reel * 3 + row * 5) % paying.length])),
      positionMultipliers: matrix(1), wins: [],
    };
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Студентски град — 6 × 5, печалби от осем еднакви символа навсякъде');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.aspectRatio = `${WIDTH}/${HEIGHT}`;
    canvas.removeAttribute('title'); canvas.style.cursor = 'default';
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    this.resize(); this.frameId = requestAnimationFrame(this.tick);
  }
  get busy() { return this.active; }
  /** Read-only view of the snapshots currently being painted, for UI diagnostics. */
  snapshot() {
    const motion = this.spin ? {
      kind: 'landing' as const, elapsedMs: this.spin.elapsed, durationMs: this.spin.duration,
      previousAlpha: clamp(1 - this.spin.elapsed / this.spin.clearDuration), cells: this.landingCells(),
    } : this.tumble ? {
      kind: 'cascade' as const, elapsedMs: this.tumble.progress * this.tumble.duration,
      durationMs: this.tumble.duration, cells: this.tumbleCells(),
    } : null;
    const event = this.effect?.event;
    const badge = event?.kind === 'xways' || event?.kind === 'infectious';
    const phase = badge && this.effect ? this.effect.progress < BADGE_REVEAL_AT ? 'opening' : this.effect.progress < (event.kind === 'xways' ? NORMAL_BOOST_AT : INFECTION_THROW_AT) ? 'revealed' : 'applying' : null;
    return { grid: copyGrid(this.current.grid), positionMultipliers: copyMatrix(this.current.positionMultipliers), cascade: this.cascadeIndex, motion, modifier: this.effect ? {kind: this.effect.event.kind, progress: this.effect.progress, phase, revealedSymbol: badge ? event.symbol : undefined, source: {...this.effect.event.source}, targets: this.effect.event.targets.map(target => ({...target})), visualTargets: this.beerVisualTargets(this.effect.event)} : null };
  }
  private publishStep(payoutCents = 0) { this.options.onStep?.({ ...this.snapshot(), payoutCents }); }
  private label(symbol: SymbolId) { const name = `symbol.${symbol}`, value = this.options.translate?.(name); return value && value !== name ? value : SYMBOL_LABELS[symbol] ?? symbol; }
  private translate(name: string, fallback: string) { const value = this.options.translate?.(name); return value && value !== name ? value : fallback; }
  resize() {
    const cssWidth = this.canvas.getBoundingClientRect().width || WIDTH, scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(cssWidth * scale)), height = Math.max(1, Math.round(width * HEIGHT / WIDTH));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0); this.draw(performance.now());
  }
  setScene(tier: BonusTier | null) {
    if (tier === this.tier) return; this.tier = tier; this.sceneChangedAt = performance.now(); this.canvas.dataset.scene = tier ?? 'base';
  }
  render(presentation: SpinPresentation | Grid | PartialBoardView, frames?: boolean[][], _wilds?: unknown[], wins?: Win[]) {
    this.spin = null; this.tumble = null; this.effect = null; this.removal = null;
    const view: PartialBoardView = Array.isArray(presentation) ? { grid: presentation, frames, wins } : presentation;
    this.current = {
      grid: copyGrid(view.finalGrid ?? view.grid),
      positionMultipliers: copyMatrix(view.finalPositionMultipliers ?? view.positionMultipliers ?? view.frames?.map(column => column.map(frame => frame ? 2 : 1)) ?? matrix(1)), wins: [],
    };
    this.cascadeIndex = 0; this.highlightProgress = 0; if (view.tier !== undefined) this.setScene(view.tier);
    this.canvas.dataset.animation = 'idle'; this.draw(performance.now());
  }
  private createLanding(target: BoardView, turbo: boolean, seed: string): SpinView {
    const plan = planDrop(target.grid, {...AREA, reels: REELS, rows: ROWS}, seed, turbo);
    return { target, previous: copyGrid(this.current.grid), elapsed: 0, plan, clearDuration: turbo ? 90 : 140, stops: plan.stops, duration: plan.duration, stopped: new Set() };
  }
  /** These same coordinates drive both the painting and the read-only motion view. */
  private landingCells(): MovingCell[] {
    const spin = this.spin;
    if (!spin) return [];
    return dropFrames(spin.plan, spin.elapsed, this.reducedMotion.matches);
  }
  private tumbleCells(): MovingCell[] {
    const tumble = this.tumble;
    if (!tumble) return [];
    return dropFrames(tumble.plan, tumble.progress * tumble.duration, this.reducedMotion.matches);
  }
  async play(presentation: SpinPresentation, turbo = false) { return this.animateSpin(presentation, turbo); }
  /** Bought invitations are a receipt animation, never another paid spin or RNG draw. */
  async playBonusTrigger(presentation: SpinPresentation, turbo = false): Promise<void> {
    const tier = presentation.tier;
    if (!tier) throw new Error('BONUS_TRIGGER_REQUIRES_TIER');
    const scatterCount = ({ dorm: 3, friday: 4, december: 5 })[tier];
    const grid = boughtBonusTriggerGrid(presentation);
    const target = { grid, positionMultipliers: matrix(1), wins: [] };
    this.active = true; this.skipRequested = false; this.stagedBonus = { tier, scatters: scatterCount };
    this.current.wins = []; this.effect = null; this.tumble = null; this.removal = null;
    this.spin = this.createLanding(target, turbo, `${presentation.id}:invitations`);
    const { duration, stops } = this.spin;
    this.canvas.dataset.animation = 'bonus-trigger'; this.canvas.dataset.bonusTrigger = tier; this.canvas.dataset.triggerScatters = String(scatterCount); this.canvas.dataset.triggerPhase = 'landing';
    await this.animate(duration, p => {
      if (!this.spin) return; this.spin.elapsed = p * duration;
      stops.forEach((stop, reel) => { if (this.spin!.elapsed >= stop && !this.spin!.stopped.has(reel)) { this.spin!.stopped.add(reel); this.options.onEvent?.('reel-stop'); } });
    });
    this.spin = null; this.current = target; this.canvas.dataset.triggerPhase = 'landed';
    this.options.onEvent?.('scatter', scatterCount);
    await this.animate(turbo ? 750 : 1250, p => { this.scatterPulse = .45 + Math.sin(p * Math.PI) * .55; });
    this.scatterPulse = 0; this.stagedBonus = null; this.active = false; this.canvas.dataset.animation = 'idle'; this.canvas.dataset.triggerPhase = 'complete';
    this.draw(performance.now());
  }
  async animateSpin(presentation: SpinPresentation, turbo = false): Promise<void> {
    const view = presentation;
    delete this.canvas.dataset.bonusTrigger; delete this.canvas.dataset.triggerScatters; delete this.canvas.dataset.triggerPhase;
    this.lockedBetCents = view.lockedBetCents; this.maxWin = view.maxWin;
    this.active = true; this.skipRequested = false; this.cascadeIndex = 0; this.highlightProgress = 0;
    this.effect = null; this.tumble = null; this.removal = null; this.celebration = null; this.current.wins = [];
    this.setScene(view.tier ?? null);
    const initial: BoardView = {
      grid: copyGrid(view.initialGrid ?? view.grid),
      positionMultipliers: copyMatrix(view.initialPositionMultipliers ?? view.positionMultipliers ?? matrix(1)), wins: [],
    };
    this.current.positionMultipliers = copyMatrix(initial.positionMultipliers);
    this.spin = this.createLanding(initial, turbo, `${view.id}:initial`);
    const { duration, stops } = this.spin;
    this.canvas.dataset.animation = 'spin';
    await this.animate(duration, p => {
      if (!this.spin) return; this.spin.elapsed = p * duration;
      stops.forEach((stop, reel) => { if (this.spin!.elapsed >= stop && !this.spin!.stopped.has(reel)) { this.spin!.stopped.add(reel); this.options.onEvent?.('reel-stop'); } });
    });
    this.spin = null; this.current = initial; this.publishStep();
    for (const step of view.cascadeSteps) {
      this.cascadeIndex = step.index;
      this.current = { grid: copyGrid(step.grid), positionMultipliers: copyMatrix(step.positionMultipliers), wins: [] };
      this.publishStep();
      for (const event of step.modifiers.filter(event => event.kind !== 'bomb')) await this.animateModifier(event, turbo);
      this.current = { grid: copyGrid(step.resolvedGrid), positionMultipliers: copyMatrix(step.resolvedPositionMultipliers), wins: [] };
      this.publishStep();
      if (step.wins.length) {
        for (const win of step.wins) {
          this.current.wins = [win]; this.canvas.dataset.animation = 'win'; this.options.onEvent?.('win', win.payoutCents);
          await this.animate(turbo ? 240 : 640, p => { this.highlightProgress = ease(p); });
        }
        this.current.wins = step.wins;
        const winning = [...new Map(step.wins.flatMap(win => win.cells).map(cell => [key(cell), cell])).values()];
        this.removal = { cells: new Set(winning.map(key)), progress: 0 };
        for (const cell of winning) { const pos = centre(cell); this.emit(pos.x, pos.y, 8, '#f7e8ad', 560); }
        await this.animate(turbo ? 130 : 260, p => { if (this.removal) this.removal.progress = p; });
        for (const cell of winning) this.current.positionMultipliers[cell.reel][cell.row] = Math.min(8192, this.current.positionMultipliers[cell.reel][cell.row] * 2);
        this.current.wins = []; this.highlightProgress = 0;
      }
      for (const event of step.modifiers.filter(event => event.kind === 'bomb')) await this.animateModifier(event, turbo);
      if (step.removed.length) {
        this.canvas.dataset.animation = 'clear'; this.options.onEvent?.('cascade');
        const alreadyCleared = new Set([
          ...step.wins.flatMap(win => win.cells.map(key)),
          ...step.modifiers.filter(event => event.kind === 'bomb').flatMap(event => [key(event.source), ...event.targets.map(key)]),
        ]);
        this.removal = { cells: new Set(step.removed.map(key)), progress: 0, fixed: alreadyCleared };
        for (const cell of step.removed.filter(cell => !step.wins.some(win => win.cells.some(winner => key(winner) === key(cell))))) { const pos = centre(cell); this.emit(pos.x, pos.y, 8, '#f7e8ad', 560); }
        await this.animate(turbo ? 150 : 300, p => { if (this.removal) this.removal.progress = p; });
        this.current.positionMultipliers = copyMatrix(step.positionMultipliersAfter); this.current.wins = []; this.highlightProgress = 0;
        this.publishStep(step.payoutCents);
        await this.animate(turbo ? 70 : 110, () => {});
        if (step.refilledGrid) {
          const plan = planDrop(step.refilledGrid, {...AREA, reels: REELS, rows: ROWS}, `${view.id}:cascade:${step.index}`, turbo, new Set(step.removed.map(key)));
          const duration = plan.duration;
          this.tumble = { plan, progress: 0, duration };
          this.removal = null; this.canvas.dataset.animation = 'cascade';
          await this.animate(duration, p => { if (this.tumble) this.tumble.progress = p; });
          this.current.grid = copyGrid(step.refilledGrid); this.tumble = null; this.publishStep(step.payoutCents);
        }
        this.removal = null;
      }
    }
    this.current = { grid: copyGrid(view.finalGrid), positionMultipliers: copyMatrix(view.finalPositionMultipliers), wins: [] };
    this.publishStep(view.payoutCents);
    this.effect = null; this.tumble = null; this.removal = null; this.highlightProgress = 0;
    if (view.scatters >= 3 && view.bonusAwarded) { this.options.onEvent?.('scatter', view.scatters); await this.animate(turbo ? 750 : 1250, p => { this.scatterPulse = Math.sin(p * Math.PI); }); this.scatterPulse = 0; }
    this.active = false; this.canvas.dataset.animation = 'idle'; this.draw(performance.now());
  }
  private async animateModifier(event: ModifierEvent, turbo: boolean) {
    this.effect = { event, progress: 0, before: { grid: copyGrid(this.current.grid), positionMultipliers: copyMatrix(this.current.positionMultipliers), wins: [] }, splashed: new Map(), splashDuration: turbo ? 160 : 280 };
    this.canvas.dataset.animation = event.kind; this.options.onEvent?.(event.kind, event.shotsAdded ?? event.factor);
    const source = centre(event.source);
    if (event.kind === 'bomb') for (const target of event.targets) { const pos = centre(target); this.emit(pos.x, pos.y, 14, '#eaa756', 750); }
    if (event.kind === 'shot') this.emit(source.x, source.y, 12, '#f8e9ac', 600);
    const duration = event.kind === 'infectious' ? 1120 : event.kind === 'bomb' ? 780 : event.kind === 'shot' ? 740 : 900;
    let revealed = false;
    const applied = new Set<string>();
    await this.animate(turbo ? Math.round(duration * .55) : duration, p => {
      if (!this.effect) return;
      this.effect.progress = p;
      if (event.kind !== 'xways' && event.kind !== 'infectious') return;
      if (!revealed && p >= BADGE_REVEAL_AT) {
        // Open the badge into its recorded regular symbol first. Retain the old
        // position values for a visible beat before any multiplier is applied.
        revealed = true;
        if (event.gridAfter) this.current.grid = copyGrid(event.gridAfter);
        this.publishStep();
      }
      let boosted = false;
      event.targets.forEach((target, index) => {
        if (p < badgeImpactAt(event, index) || applied.has(key(target))) return;
        applied.add(key(target));
        if (event.positionMultipliersAfter) this.current.positionMultipliers[target.reel][target.row] = event.positionMultipliersAfter[target.reel][target.row];
        boosted = true;
      });
      if (boosted) this.publishStep();
    });
    if ((event.kind === 'xways' || event.kind === 'infectious') && !this.skipRequested && !this.destroyed) {
      // A slow frame must not age an impact before it was ever visible. Paint
      // any remaining hits, then let their short foam tails finish before the
      // next badge opens. Skip still settles immediately without this hold.
      this.draw(performance.now());
      const lastImpact = Math.max(...this.effect!.splashed.values());
      const remaining = lastImpact + this.effect!.splashDuration - performance.now();
      if (remaining > 0) await this.animate(remaining, () => {});
    }
    if (event.gridAfter) this.current.grid = copyGrid(event.gridAfter);
    if (event.positionMultipliersAfter) this.current.positionMultipliers = copyMatrix(event.positionMultipliersAfter);
    this.effect = null; this.publishStep();
  }
  /** Compatibility entry point for saved first-version presentation. */
  async animateVip(presentation: SpinPresentation, turbo = false) { return this.animateSpin(presentation, turbo); }
  async celebrate(ratio: number, maxWin = false, turbo = false): Promise<void> {
    this.skipRequested = false; this.celebration = { start: performance.now(), maxWin, ratio };
    for (let i = 0; i < (maxWin ? 75 : 42); i++) this.emit(seeded(i + 31) * WIDTH, -seeded(i + 53) * 120, 1, i % 3 ? '#f6dc8d' : '#d39858', 2500, true);
    await this.animate(turbo ? 300 : maxWin ? 2200 : ratio >= 50 ? 1600 : 1000, () => {}); this.celebration = null;
  }
  skip() { this.skipRequested = true; }
  private animate(duration: number, update: (p: number) => void): Promise<void> {
    if (this.skipRequested || this.destroyed) { update(1); return Promise.resolve(); }
    return new Promise(resolve => { const start = performance.now(); const step = (time: number) => { const p = this.skipRequested || this.destroyed ? 1 : clamp((time - start) / duration); update(p); if (p >= 1) { resolve(); return; } requestAnimationFrame(step); }; requestAnimationFrame(step); });
  }
  private tick = (time: number) => {
    if (this.destroyed) return;
    if (this.active || this.celebration || this.particles.length || time - this.lastDraw > 80) { this.draw(time); this.lastDraw = time; }
    this.frameId = requestAnimationFrame(this.tick);
  };
  private draw(time: number) {
    const ctx = this.ctx; ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.save();
    if (this.effect?.event.kind === 'bomb') { const s = Math.sin(this.effect.progress * Math.PI) * 4; ctx.translate(Math.sin(this.effect.progress * 52) * s, Math.cos(this.effect.progress * 40) * s); }
    this.drawMaterial(time); ctx.save(); ctx.beginPath(); ctx.rect(AREA.x, AREA.y, AREA.w, AREA.h); ctx.clip();
    if (this.tumble) this.drawTumble(time); else this.drawSymbols(time);
    if (this.effect) this.drawEffect(time);
    if (this.current.wins.length && this.highlightProgress > .05) this.drawWin(this.current.wins[0], this.lockedBetCents);
    ctx.restore(); this.drawBorder(time); this.drawParticles(time);
    if (this.celebration) {
      ctx.fillStyle = '#111921b8'; ctx.fillRect(AREA.x, AREA.y, AREA.w, AREA.h);
      const p = ease((time - this.celebration.start) / 200);
      ctx.save(); ctx.translate(WIDTH / 2, HEIGHT * .43); ctx.scale(.72 + p * .28, .72 + p * .28); ctx.rotate(-.03);
      const label = this.celebration.maxWin ? this.translate('render.maxwin', 'ГРАДЪТ Е ТВОЙ!') : this.celebration.ratio >= 50 ? this.translate('render.bigwin', 'ГОЛЯМА ВЕЧЕР!') : this.translate('render.win', 'НАЗДРАВЕ!');
      outlinedText(ctx, label, 0, 0, 76, '#f4d788', INK, 10); ctx.restore();
    }
    ctx.restore();
  }
  private drawMaterial(time: number) {
    const ctx = this.ctx, scene = SCENES[this.tier ?? 'base'];
    polygon(ctx, [AREA.x - 12, AREA.y - 14, AREA.x + AREA.w + 10, AREA.y - 9, AREA.x + AREA.w + 13, AREA.y + AREA.h + 18, AREA.x - 15, AREA.y + AREA.h + 12], '#202528', INK, 6);
    for (let reel = 0; reel < REELS; reel++) {
      const x = AREA.x + reel * CELL_W;
      ctx.fillStyle = reel % 2 ? scene.wood : scene.shade; ctx.fillRect(x, AREA.y, CELL_W, AREA.h);
      polygon(ctx, [x + 3, AREA.y + 2, x + CELL_W - 3, AREA.y + 3, x + CELL_W - 4, AREA.y + AREA.h - 2, x + 4, AREA.y + AREA.h], reel % 2 ? scene.wood : scene.shade, '#211d2a', 3);
      ctx.fillStyle = '#121a2120'; ctx.fillRect(x + CELL_W * .16, AREA.y + 3, 4, AREA.h - 6); ctx.fillRect(x + CELL_W * .81, AREA.y + 3, 2, AREA.h - 6);
      ctx.strokeStyle = '#e0c17a12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + CELL_W * .42, AREA.y + 14); ctx.lineTo(x + CELL_W * .38, AREA.y + AREA.h - 12); ctx.stroke();
      for (let row = 0; row < ROWS; row++) {
        const value = this.current.positionMultipliers[reel]?.[row] ?? 1;
        if (value > 1) { const y = AREA.y + row * CELL_H, color = value >= 64 ? '#456960' : value >= 8 ? '#824f44' : '#815c42'; polygon(ctx, [x + 4, y + 5, x + CELL_W - 6, y + 2, x + CELL_W - 3, y + CELL_H - 5, x + 5, y + CELL_H - 2], color, '#322921', 1); }
      }
    }
    if (time - this.sceneChangedAt < 500) { ctx.fillStyle = scene.tint; ctx.globalAlpha = (1 - (time - this.sceneChangedAt) / 500) * .13; ctx.fillRect(AREA.x, AREA.y, AREA.w, AREA.h); ctx.globalAlpha = 1; }
  }
  private drawBorder(_time: number) {
    const ctx = this.ctx, scene = SCENES[this.tier ?? 'base'];
    ctx.strokeStyle = '#b59668'; ctx.lineWidth = 3; ctx.strokeRect(AREA.x - 3, AREA.y - 3, AREA.w + 6, AREA.h + 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.strokeRect(AREA.x - 9, AREA.y - 10, AREA.w + 18, AREA.h + 22);
    for (const x of [AREA.x - 5, AREA.x + AREA.w + 5]) for (const y of [AREA.y - 5, AREA.y + AREA.h + 8]) { ctx.fillStyle = '#d2b283'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#292723'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x + 2, y - 2); ctx.stroke(); }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = '800 17px "Grad Display", Arial, sans-serif'; ctx.fillStyle = '#e4d3ad'; ctx.fillText(this.translate('render.block', 'БЛОК 59 / СТУДЕНТСКИ'), AREA.x + 4, 21);
    ctx.textAlign = 'right'; ctx.fillStyle = this.stagedBonus ? '#f5a9cf' : scene.accent; ctx.fillText(this.stagedBonus ? `${this.stagedBonus.scatters} ${this.translate('render.invitations', 'ПОКАНИ ЗА КУПОН')}` : this.translate('render.scatterpay', '8+ ЕДНАКВИ НАВСЯКЪДЕ'), AREA.x + AREA.w - 4, 21);
  }
  private drawSymbols(time: number) {
    const ctx = this.ctx, winners = new Set(this.current.wins.flatMap(win => win.cells.map(key)));
    const landing = this.spin ? this.landingCells() : [];
    for (let reel = 0; reel < REELS; reel++) {
      const x = AREA.x + reel * CELL_W, spin = this.spin;
      ctx.save(); ctx.beginPath(); ctx.rect(x, AREA.y, CELL_W, AREA.h); ctx.clip();
      if (spin) {
        const previousAlpha = clamp(1 - spin.elapsed / spin.clearDuration);
        for (let row = 0; row < ROWS; row++) {
          const pos = centre({ reel, row });
          if (previousAlpha > 0) this.drawSymbol(spin.previous[reel][row], pos.x, pos.y, time, 1, previousAlpha);
          this.drawMultiplier(spin.target.positionMultipliers[reel]?.[row] ?? 1, pos.x, pos.y, true);
        }
        // Every committed symbol has one downward path and one final cell.
        // Entire columns enter from above; the first artwork is never below the grid.
        for (const cell of landing.filter(cell => cell.reel === reel)) {
          const pos = centre(cell);
          this.drawSymbol(cell.symbol, cell.x, cell.y, time, 1, 1, cell.rotation, cell.scaleX, cell.scaleY);
          if (cell.progress >= 1) this.drawMultiplier(spin.target.positionMultipliers[reel]?.[cell.row] ?? 1, pos.x, pos.y, false);
        }
      } else {
        const board = this.current;
        for (let row = 0; row < ROWS; row++) {
          const cell = { reel, row }, cellKey = key(cell), pos = centre(cell), symbol = board.grid[reel]?.[row]; if (!symbol) continue;
          const mult = board.positionMultipliers[reel]?.[row] ?? 1, winning = winners.has(cellKey);
          let scale = 1, alpha = winners.size && !winning ? .29 : 1;
          if (this.removal?.cells.has(cellKey)) {
            const progress = this.removal.fixed?.has(cellKey) ? 1 : this.removal.progress;
            scale = 1 - ease(progress); alpha *= 1 - progress;
          }
          const event = this.effect?.event, affected = event && (key(event.source) === cellKey || event.targets.some(target => key(target) === cellKey));
          if (affected && this.effect) {
            const p = this.effect.progress;
            if (event!.kind === 'bomb' && p > .45) { scale *= 1 - ease((p - .45) / .55); alpha *= 1 - clamp((p - .45) / .55); }
            else if ((event!.kind === 'xways' || event!.kind === 'infectious') && event!.gridAfter?.[reel]?.[row]) {
              const source = key(event!.source) === cellKey;
              const targetIndex = event!.targets.findIndex(target => key(target) === cellKey);
              const impact = badgeImpactAt(event!, targetIndex);
              if (source && p < BADGE_REVEAL_AT) {
                const opening = clamp((p - .10) / (BADGE_REVEAL_AT - .10));
                const transition = fallEase(opening);
                // The speaker rocks open, then the selected paying symbol
                // expands into place. Its position number remains unchanged.
                this.drawSymbol(symbol, pos.x, pos.y, time, 1.04 - transition * .30, alpha * (1 - transition), Math.sin(p * 42) * .055 * (1 - transition));
                if (opening > 0) this.drawSymbol(event!.gridAfter[reel][row], pos.x, pos.y, time, .64 + transition * .36, alpha * transition, -.035 * (1 - transition));
                this.drawMultiplier(mult, pos.x, pos.y, false); continue;
              }
              if (source && p >= BADGE_REVEAL_AT || !source && p >= impact) {
                this.drawSymbol(event!.gridAfter[reel][row], pos.x, pos.y, time, .97 + Math.sin(p * Math.PI) * .08, alpha, source ? .018 * Math.sin(p * 24) : 0);
                this.drawMultiplier(p >= impact ? event!.positionMultipliersAfter?.[reel]?.[row] ?? mult : mult, pos.x, pos.y, false); continue;
              }
            }
          }
          if (scale > .025) this.drawSymbol(symbol, pos.x, pos.y, time, scale, alpha, winning ? Math.sin(time * .009) * .015 : 0);
          this.drawMultiplier(mult, pos.x, pos.y, scale < .1);
          if (winning) this.drawCrosshair(pos.x, pos.y, CELL_H * .43, this.highlightProgress, '#eee5c8');
          if (symbol === 'scatter' && this.scatterPulse > 0) this.drawCrosshair(pos.x, pos.y, CELL_H * .43, this.scatterPulse, '#f1cd5f');
        }
      }
      ctx.restore();
    }
  }
  private drawSymbol(symbol: SymbolId, x: number, y: number, time: number, scale = 1, alpha = 1, rotation = 0, scaleX = 1, scaleY = 1) {
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale * scaleX, scale * scaleY);
    if (symbol === 'scatter' || symbol === 'wild') {
      const color = symbol === 'scatter' ? '#f59dd1' : '#f7d482';
      ctx.fillStyle = symbol === 'scatter' ? '#d7379224' : '#e7b44b26'; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      if (symbol === 'scatter') {
        polygon(ctx, [-49, -55, 48, -57, 54, -44, 50, 52, 39, 59, -50, 54, -55, 40, -53, -44], ctx.fillStyle as string, color, 2.5);
      } else {
        const points: number[] = [];
        for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + i * Math.PI / 9, r = i % 2 ? 49 : 60; points.push(Math.cos(a) * r, Math.sin(a) * r); }
        polygon(ctx, points, ctx.fillStyle as string, color, 2);
      }
      ctx.shadowColor = color; ctx.shadowBlur = 8;
    }
    const visualSymbol = symbol === 'infectious' ? 'infectious-upgraded' : symbol;
    this.artwork.draw(ctx, visualSymbol, 0, 0, CELL_W * .86, CELL_H * .94, time); ctx.restore();
  }
  private drawMultiplier(value: number, x: number, y: number, empty: boolean) {
    if (value <= 1) return;
    const ctx = this.ctx, color = value >= 256 ? '#a0e6eb' : value >= 16 ? '#e3dc88' : '#f0c287'; ctx.save();
    if (empty) outlinedText(ctx, `×${value}`, x, y, value >= 1000 ? 44 : 56, color, '#263235', 7);
    else { polygon(ctx, [x - 43, y + 29, x + 41, y + 25, x + 44, y + 55, x - 42, y + 59], '#493328', INK, 3); outlinedText(ctx, `×${value}`, x, y + 43, value >= 1000 ? 24 : 31, color, '#272425', 4); }
    ctx.restore();
  }
  private drawCrosshair(x: number, y: number, radius: number, progress: number, color: string) {
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = clamp(progress * 3); ctx.translate(x, y); const r = radius * (1.2 - ease(progress) * .2);
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(i * Math.PI / 2); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, -r - 8); ctx.lineTo(0, -r + 18); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.stroke(); ctx.restore(); }
    ctx.restore();
  }
  private drawWin(win: Win, lockedBetCents: number) {
    const baseEuros = lockedBetCents * win.payMultiplier / 100, mult = win.positionMultiplier;
    const format = this.options.formatMoney ?? ((euros: number, maximumFractionDigits = 2) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits }).format(euros));
    // Preserve sub-cent base awards until multiplication; the right side is the
    // recorded, rounded (and possibly capped) amount actually paid by the engine.
    const capped = this.maxWin && baseEuros * mult * 100 - win.payoutCents > 1;
    const equation = `${format(baseEuros, 4)} × ${mult} ${capped ? '→' : '='} ${format(win.payoutCents / 100)}`;
    const ctx = this.ctx; ctx.save(); ctx.translate(WIDTH / 2, AREA.y + AREA.h * .5); ctx.rotate(-.025);
    ctx.font = '900 64px "Grad Display", "Arial Black", sans-serif';
    const size = Math.min(64, 64 * (AREA.w - 60) / Math.max(1, ctx.measureText(equation).width));
    outlinedText(ctx, equation, 0, 0, size, '#fff1c8', INK, 10);
    ctx.font = '800 18px "Grad Display", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff4da'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    const subtitle = `${win.count} ${this.translate('render.matching', 'ЕДНАКВИ СИМВОЛА')}${capped ? ' · 30 000× MAX' : ''}`; ctx.strokeText(subtitle, 0, 48); ctx.fillText(subtitle, 0, 48); ctx.restore();
  }
  private drawTumble(time: number) {
    const cells = this.tumbleCells(), ctx = this.ctx;
    for (let reel = 0; reel < REELS; reel++) for (let row = 0; row < ROWS; row++) {
      const pos = centre({ reel, row });
      this.drawMultiplier(this.current.positionMultipliers[reel]?.[row] ?? 1, pos.x, pos.y, true);
    }
    for (let reel = 0; reel < REELS; reel++) {
      const x = AREA.x + (reel + .5) * CELL_W;
      ctx.save(); ctx.beginPath(); ctx.rect(AREA.x + reel * CELL_W, AREA.y, CELL_W, AREA.h); ctx.clip();
      for (const cell of cells.filter(cell => cell.reel === reel)) {
        this.drawSymbol(cell.symbol, cell.x, cell.y, time, 1, 1, cell.rotation, cell.scaleX, cell.scaleY);
        if (cell.progress >= 1) this.drawMultiplier(this.current.positionMultipliers[reel]?.[cell.row] ?? 1, x, cell.targetY, false);
      }
      ctx.restore();
    }
  }
  private drawEffect(time: number) {
    const ctx = this.ctx, { event, progress: p } = this.effect!, source = centre(event.source);
    const color = event.kind === 'infectious' ? '#f499d0' : event.kind === 'bomb' ? '#f6b25c' : event.kind === 'shot' ? '#f0d093' : '#74ddd1';
    if (event.kind === 'infectious' || event.kind === 'xways') this.drawBeerThrows(event, p);
    if (event.kind === 'shot') for (const target of event.targets.filter(target => key(target) !== key(event.source))) {
      const pos = centre(target), t = event.kind === 'shot' ? ease(clamp(p * 1.6)) : ease(clamp((p - .4) / .35));
      if (t <= 0) continue;
      const bend = (target.reel % 2 ? 1 : -1) * Math.min(52, Math.hypot(pos.x - source.x, pos.y - source.y) * .12);
      const mid = { x: (source.x + pos.x) / 2, y: (source.y + pos.y) / 2 + bend };
      const dart = { x: (1 - t) ** 2 * source.x + 2 * (1 - t) * t * mid.x + t ** 2 * pos.x, y: (1 - t) ** 2 * source.y + 2 * (1 - t) * t * mid.y + t ** 2 * pos.y };
      ctx.save(); ctx.globalAlpha = p > .8 ? clamp((1 - p) * 5) : 1;
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.quadraticCurveTo(source.x + (mid.x - source.x) * t, source.y + (mid.y - source.y) * t, dart.x, dart.y); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = event.kind === 'shot' ? 2 : 3; ctx.stroke();
      ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dart.x, dart.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      if (p > .72) this.drawCrosshair(pos.x, pos.y, CELL_H * .36, clamp((p - .72) * 4), color);
    }
    if (event.kind === 'bomb') {
      const radius = ease(p) * CELL_H * 1.7; ctx.save(); ctx.globalAlpha = (1 - p) * .8;
      const points: number[] = []; for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6, r = radius * (i % 2 ? .61 : 1); points.push(source.x + Math.cos(angle) * r, source.y + Math.sin(angle) * r); }
      polygon(ctx, points, '#f3c471', '#8c463b', 5); ctx.restore();
    } else { const radius = CELL_H * (.35 + Math.sin(p * Math.PI) * .25); ctx.save(); ctx.globalAlpha = Math.sin(p * Math.PI); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(source.x, source.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if ((event.kind === 'xways' || event.kind === 'infectious') && p >= BADGE_REVEAL_AT) {
      ctx.save(); ctx.translate(source.x, source.y); ctx.rotate(Math.sin(p * 15) * .018);
      const applying = p >= (event.kind === 'xways' ? NORMAL_BOOST_AT : INFECTION_THROW_AT);
      if (!applying && event.symbol) outlinedText(ctx, this.label(event.symbol), 0, event.source.row === ROWS - 1 ? 43 : 61, 21, color, INK, 5);
      if (applying) {
        const multiplier = event.kind === 'xways' ? event.positionMultipliersAfter?.[event.source.reel]?.[event.source.row] ?? event.factor ?? 2 : event.factor ?? 2;
        outlinedText(ctx, `×${multiplier}`, 0, (event.source.row === 0 ? -35 : -53) - Math.sin(p * Math.PI) * 8, 42, color, INK, 7);
      }
      ctx.restore();
    }
    if (event.kind === 'shot' && p > .45) outlinedText(ctx, `+${event.shotsAdded ?? 1} ${this.translate('render.extrashot', 'ЗАВЪРТАНЕ')}`, source.x, source.y - 44 - p * 30, 28, '#f8e2a0', INK, 5);
    if (event.kind === 'infectious') for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 + time * .001; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(source.x + Math.cos(a) * 43, source.y + Math.sin(a) * 43, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  /** Only upgraded infection sends beer to other recorded positions. */
  private beerVisualTargets(event: ModifierEvent): CellPosition[] {
    return event.kind === 'infectious' ? event.targets.map(target => ({...target})) : [];
  }
  private drawBeerThrows(event: ModifierEvent, progress: number) {
    if (event.kind === 'xways') {
      // Normal xWays opens first, then boosts only its own cell with one local
      // beer/foam hit. No unpaid matching cell is splashed.
      if (progress >= NORMAL_BOOST_AT) this.drawBeerSplash(event.source, `source:${key(event.source)}`);
      return;
    }
    const targets = this.beerVisualTargets(event);
    targets.forEach((target, index) => {
      const start = INFECTION_THROW_AT + index * .10 / Math.max(1, targets.length - 1), impact = badgeImpactAt(event, index);
      this.drawBeerFlight(event.source, target, clamp((progress - start) / .30));
      if (progress >= impact) this.drawBeerSplash(target, `target:${key(target)}`);
    });
  }
  private drawBeerFlight(sourceCell: CellPosition, target: CellPosition, t: number) {
    if(t<=0||t>=1)return;
    const ctx=this.ctx,source=centre(sourceCell),end=centre(target),same=key(target)===key(sourceCell);
    const start={x:source.x-28,y:source.y+12};
    const mid={x:(start.x+end.x)/2+(same?48:0),y:Math.min(start.y,end.y)-Math.min(130,55+Math.abs(end.x-start.x)*.18)};
    const x=(1-t)**2*start.x+2*(1-t)*t*mid.x+t*t*end.x,y=(1-t)**2*start.y+2*(1-t)*t*mid.y+t*t*end.y;
    ctx.save();ctx.translate(x,y);ctx.rotate(-.45+t*Math.PI*2);
    const glass = ctx.createLinearGradient(-12, 0, 12, 0);
    glass.addColorStop(0, '#3c2113'); glass.addColorStop(.28, '#a65319'); glass.addColorStop(.55, '#d78b33'); glass.addColorStop(1, '#492516');
    ctx.fillStyle=glass;ctx.strokeStyle=INK;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-5,-25);ctx.lineTo(5,-25);ctx.lineTo(5,-12);ctx.quadraticCurveTo(12,-7,12,0);ctx.lineTo(11,25);ctx.quadraticCurveTo(0,30,-11,25);ctx.lineTo(-12,0);ctx.quadraticCurveTo(-12,-7,-5,-12);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#be974a';ctx.fillRect(-5,-25,10,5);ctx.fillStyle='#eee0b7';ctx.fillRect(-9,0,18,15);
    ctx.fillStyle='#a6573b';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('SG',0,11);
    ctx.strokeStyle='#f8d29a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-7,-5);ctx.lineTo(-7,22);ctx.stroke();ctx.restore();
  }
  /** Filled beer, a foam crown and hanging droplets make the impact readable. */
  private drawBeerSplash(target: CellPosition, identity: string) {
    if (!this.effect) return;
    const now = performance.now(), pos=centre(target), ctx=this.ctx;
    if(!this.effect.splashed.has(identity)){
      this.effect.splashed.set(identity, now);this.emit(pos.x,pos.y,16,'#d79a36',720,false,true);this.emit(pos.x,pos.y-10,12,'#fff0cb',760,false,true);
    }
    const life=clamp((now - this.effect.splashed.get(identity)!) / this.effect.splashDuration);
    if (life >= 1) return;
    ctx.save();ctx.translate(pos.x,pos.y);ctx.globalAlpha=life<.32?1:1-ease((life-.32)/.68);
    const burst=ease(Math.min(1,life*5)),points:number[]=[];
    for(let i=0;i<24;i++){const a=i*Math.PI/12,r=(i%2?27:48+seeded(i+37)*20)*(0.55+burst*.65);points.push(Math.cos(a)*r,Math.sin(a)*r);}
    polygon(ctx,points,'#d79a36','#6b4523',2.5);
    ctx.strokeStyle='#ffdda0';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,9,25+burst*24,14+burst*10,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#fff0cb';ctx.strokeStyle='#a4773b';ctx.lineWidth=1.5;
    for(let i=0;i<9;i++){const a=i*2.4,r=9+burst*(16+seeded(i+19)*22),radius=(7+seeded(i+4)*7)*(1-life*.45);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r-12,radius,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.fillStyle='#d79a36';
    for(let i=0;i<5;i++){const x=(i-2)*17,y=24+life*(14+seeded(i+2)*23);ctx.beginPath();ctx.ellipse(x,y,3.5,9+life*8,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  private emit(x: number, y: number, count: number, color: string, lifetime: number, rain = false, fluid = false) {
    const start = this.particles.length, now = performance.now();
    for (let i = 0; i < count; i++) { const n = i + start; this.particles.push({ x, y, vx: (seeded(n + 12) - .5) * (rain ? 70 : 200), vy: rain ? 90 + seeded(n + 17) * 110 : -65 - seeded(n + 17) * 125, spin: (seeded(n + 9) - .5) * 9, size: 3 + seeded(n + 88) * 5, color, born: now, lifetime, fluid }); }
  }
  private drawParticles(time: number) {
    this.particles = this.particles.filter(p => time - p.born < p.lifetime); const ctx = this.ctx;
    for (const particle of this.particles) { const t = (time - particle.born) / 1000, p = (time - particle.born) / particle.lifetime; ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(particle.x + particle.vx * t, particle.y + particle.vy * t + 160 * t * t); ctx.rotate(particle.spin * t); ctx.fillStyle = particle.color; ctx.strokeStyle = INK; ctx.lineWidth = 1; if(particle.fluid){ctx.beginPath();ctx.ellipse(0,0,particle.size*.6,particle.size*(.8+t*.6),0,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(-particle.size, -particle.size / 2, particle.size * 2, particle.size);ctx.strokeRect(-particle.size, -particle.size / 2, particle.size * 2, particle.size);} ctx.restore(); }
  }
  destroy() { this.destroyed = true; this.skipRequested = true; cancelAnimationFrame(this.frameId); this.resizeObserver.disconnect(); }
}
export { SlotRenderer as Renderer };
