import { CONFIG, PAYING_SYMBOLS } from './config';
import { roundHalfUp } from './accounting';
import type { Grid, Win, WildState } from './types';

export function countScatters(grid: Grid): number { return grid.reduce((n,reel)=> n + reel.filter(s=>s==='scatter').length,0); }
export function evaluateWays(grid: Grid, frames: boolean[][], wilds: WildState[], betCents: number, energy = 1): { wins: Win[]; payoutCents:number } {
  const wins: Win[] = []; let numerator = 0n;
  for (const symbol of PAYING_SYMBOLS) {
    let ways = 1, reels = 0; const cells: Win['cells'] = [];
    for (let reel=0;reel<CONFIG.reels;reel++) {
      let count = 0; const matches: Win['cells'] = [];
      for (let row=0;row<CONFIG.rows;row++) {
        const cell=grid[reel][row];
        if (cell===symbol || cell==='wild') {
          const multiplier = cell==='wild' ? (wilds.find(w=>w.reel===reel)?.multiplier ?? 1) : 1;
          count += (frames[reel][row] ? 2 : 1) * multiplier;
          matches.push({reel,row});
        }
      }
      if (!count) break;
      ways *= count; reels++; cells.push(...matches);
    }
    if (reels < 3) continue;
    const value = BigInt(betCents) * BigInt(CONFIG.paytable[symbol][reels-3]) * BigInt(ways) * BigInt(energy);
    numerator += value;
    wins.push({symbol,reels,weightedWays:ways,payoutCents:roundHalfUp(value,BigInt(CONFIG.payoutDenominator)),cells});
  }
  return {wins,payoutCents:roundHalfUp(numerator,BigInt(CONFIG.payoutDenominator))};
}
