import { CONFIG, PAYING_SYMBOLS } from './config';
import { roundHalfUp } from './accounting';
import type { Grid, NumberGrid, Win, WildState } from './types';

export function countScatters(grid: Grid): number { return grid.reduce((n,reel)=> n + reel.filter(s=>s==='scatter').length,0); }
/** Scatter pays count matching physical cells anywhere; reel adjacency is irrelevant. */
export function evaluateScatterPays(grid: Grid, positionMultipliers: NumberGrid, betCents: number): { wins: Win[]; payoutCents:number } {
  const wins: Win[] = []; let numerator = 0n; let allocatedCents = 0;
  for (const symbol of PAYING_SYMBOLS) {
    const cells: Win['cells'] = [];
    let positionMultiplier = 0;
    for (let reel=0;reel<grid.length;reel++) for (let row=0;row<grid[reel].length;row++) {
      if (grid[reel][row] !== symbol && grid[reel][row] !== 'wild') continue;
      cells.push({reel,row});
      // Unboosted positions are not added: otherwise an ordinary 8-cell win would become 8×.
      const multiplier=positionMultipliers[reel]?.[row] ?? 1;
      if (multiplier>1) positionMultiplier+=multiplier;
    }
    if (cells.length < CONFIG.minimumPayCount) continue;
    positionMultiplier=Math.max(1,positionMultiplier);
    let payIndex=0;
    for (let i=1;i<CONFIG.payThresholds.length;i++) if(cells.length>=CONFIG.payThresholds[i])payIndex=i;
    const payValue=CONFIG.paytable[symbol][payIndex];
    const value=BigInt(betCents)*BigInt(payValue)*BigInt(positionMultiplier);
    numerator+=value;
    const aggregateCents=roundHalfUp(numerator,BigInt(CONFIG.payoutDenominator));
    const payoutCents=aggregateCents-allocatedCents;allocatedCents=aggregateCents;
    wins.push({symbol,count:cells.length,payMultiplier:payValue/CONFIG.payoutDenominator,positionMultiplier,
      payoutCents,cells,reels:new Set(cells.map(cell=>cell.reel)).size,weightedWays:positionMultiplier});
  }
  return {wins,payoutCents:roundHalfUp(numerator,BigInt(CONFIG.payoutDenominator))};
}
/** Legacy entry point. All new callers should provide the numeric position grid directly. */
export function evaluateWays(grid: Grid, frames: boolean[][], _wilds: WildState[], betCents: number, _energy=1): { wins:Win[]; payoutCents:number } {
  return evaluateScatterPays(grid,frames.map(column=>column.map(framed=>framed?2:1)),betCents);
}
