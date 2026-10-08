import type { Grid, SymbolId } from '../engine/types';

interface Geometry { x: number; y: number; w: number; h: number; reels: number; rows: number }
interface DropCell {
  reel: number; row: number; symbol: SymbolId; sourceRow: number;
  targetX: number; startY: number; targetY: number;
  startMs: number; flightMs: number; settleMs: number; stationary: boolean;
  drift: number; lean: number; phase: number; curve: number; shake: number;
}
export interface MovingCell extends DropCell {
  x: number; y: number; progress: number; settleProgress: number;
  rotation: number; scaleX: number; scaleY: number;
}
export interface DropPlan { cells: DropCell[]; duration: number; stops: number[]; geometry: Geometry }

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (p: number) => p * p * p * (10 + p * (-15 + p * 6));
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return value;
}
function unit(seed: number, salt: number): number {
  let value = (seed + Math.imul(salt, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

/** Cosmetic timing comes from the committed receipt, never the game's RNG. */
export function planDrop(grid: Grid, geometry: Geometry, seed: string, turbo: boolean, removed?: Set<string>): DropPlan {
  const cascade = !!removed, cellH = geometry.h / geometry.rows, cellW = geometry.w / geometry.reels;
  const clearMs = cascade ? 0 : turbo ? 90 : 140;
  const columnDelay = cascade ? turbo ? 8 : 12 : turbo ? 40 : 90;
  const rowDelay = cascade ? turbo ? 8 : 12 : turbo ? 10 : 18;
  const baseFlight = cascade ? turbo ? 260 : 430 : turbo ? 300 : 520;
  const jitter = turbo ? 10 : 16;
  const cells = grid.flatMap((column, reel) => {
    const survivors = Array.from({length: geometry.rows}, (_, row) => row).filter(row => !removed?.has(`${reel}:${row}`));
    const added = geometry.rows - survivors.length;
    const planned = column.map((symbol, row): DropCell => {
      const sourceRow = !cascade ? row - geometry.rows - .85 : row < added ? row - added - .85 : survivors[row - added];
      const stationary = sourceRow === row;
      const identity = hash(`${seed}:${reel}:${row}:${symbol}:${sourceRow}`);
      const distance = row - sourceRow;
      const distanceFactor = cascade ? .62 + .38 * Math.sqrt(clamp(distance / (geometry.rows + .85))) : 1;
      return {
        reel, row, symbol, sourceRow, stationary,
        targetX: geometry.x + (reel + .5) * cellW,
        startY: geometry.y + (sourceRow + .5) * cellH,
        targetY: geometry.y + (row + .5) * cellH,
        startMs: stationary ? 0 : Math.round(clearMs + reel * columnDelay + (geometry.rows - 1 - row) * rowDelay + unit(identity, 1) * jitter),
        flightMs: stationary ? 0 : Math.round(baseFlight * distanceFactor * (.93 + .14 * unit(identity, 2))),
        settleMs: stationary ? 0 : Math.round(turbo ? 60 + 22 * unit(identity, 3) : 96 + 34 * unit(identity, 3)),
        drift: 1.3 + 2.3 * unit(identity, 4), lean: .032 + .030 * unit(identity, 5),
        phase: unit(identity, 6) * Math.PI * 2, curve: .93 + .17 * unit(identity, 7),
        shake: 1.2 + 1.2 * unit(identity, 8),
      };
    });
    // Keep arrivals bottom-first even when an upper symbol has a faster flight.
    for (let row = geometry.rows - 2; row >= 0; row--) {
      const cell = planned[row], below = planned[row + 1];
      if (!cell.stationary) cell.startMs = Math.max(cell.startMs, below.startMs + below.flightMs + (turbo ? 3 : 6) - cell.flightMs);
    }
    return planned;
  });
  const stops = Array.from({length: geometry.reels}, (_, reel) => Math.max(...cells.filter(cell => cell.reel === reel).map(cell => cell.startMs + cell.flightMs)));
  const duration = Math.max(...cells.map(cell => cell.startMs + cell.flightMs + cell.settleMs)) + (turbo ? 10 : 16);
  return {cells, stops, duration, geometry};
}

/** These exact frames drive both artwork painting and read-only diagnostics. */
export function dropFrames(plan: DropPlan, elapsedMs: number, reducedMotion = false): MovingCell[] {
  const frames = plan.cells.map((cell): MovingCell => {
    const progress = cell.stationary ? 1 : clamp((elapsedMs - cell.startMs) / cell.flightMs);
    const settleProgress = cell.stationary ? 1 : clamp((elapsedMs - cell.startMs - cell.flightMs) / cell.settleMs);
    const flightEnvelope = Math.sin(progress * Math.PI);
    const settleEnvelope = Math.sin(settleProgress * Math.PI) * (1 - settleProgress) ** 2;
    const drift = flightEnvelope * cell.drift * Math.sin(progress * Math.PI * 3 + cell.phase);
    const shake = settleEnvelope * cell.shake * Math.sin(settleProgress * Math.PI * 4);
    const rotation = flightEnvelope * cell.lean * Math.sin(progress * Math.PI * 5 + cell.phase)
      + settleEnvelope * .032 * Math.sin(settleProgress * Math.PI * 4);
    const compression = .06 * Math.sin(settleProgress * Math.PI) * (1 - settleProgress);
    return {
      ...cell, progress, settleProgress,
      x: cell.targetX + (reducedMotion || cell.stationary ? 0 : drift + shake),
      y: cell.startY + (cell.targetY - cell.startY) * ease(progress ** cell.curve),
      rotation: reducedMotion || cell.stationary ? 0 : rotation,
      scaleX: reducedMotion || cell.stationary ? 1 : 1 + compression,
      scaleY: reducedMotion || cell.stationary ? 1 : 1 - compression * .85,
    };
  });
  // A faster upper sprite can follow closely, but never pass the one below it.
  // Both paths are monotonic, so this queue introduces no rebound or teleport.
  const spacing = plan.geometry.h / plan.geometry.rows * .83;
  for (let reel = 0; reel < plan.geometry.reels; reel++) {
    for (let row = plan.geometry.rows - 2; row >= 0; row--) {
      const index = reel * plan.geometry.rows + row;
      frames[index].y = Math.min(frames[index].y, frames[index + 1].y - spacing);
    }
  }
  return frames;
}
