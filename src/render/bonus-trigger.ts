import { CONFIG, PAYING_SYMBOLS } from '../engine/config';
import type { BonusTier, CellPosition, Grid, SpinPresentation } from '../engine/types';

const INVITATION_COUNTS = { dorm: 3, friday: 4, december: 5 } satisfies Record<BonusTier, number>;

/**
 * A bought feature is already settled before this receipt animation starts.
 * Its committed id varies between purchases; the initial board also separates
 * first purchases in different sessions. Both survive reloads, so decorative
 * invitation positions vary without drawing from or changing gameplay RNG.
 */
export function boughtBonusInvitations(id: string, tier: BonusTier, initialGrid: Grid): CellPosition[] {
  let state = 0x811c9dc5;
  for (const character of `bonus-trigger-v1:${id}:${tier}:${JSON.stringify(initialGrid)}`) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
  const choose = (size: number): number => {
    // Reject the incomplete final range instead of biasing a reel or row.
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % size);
    let value: number;
    do { value = nextUint32(); } while (value >= limit);
    return value % size;
  };

  const reels = Array.from({ length: CONFIG.reels }, (_, reel) => reel);
  for (let index = reels.length - 1; index > 0; index--) {
    const other = choose(index + 1);
    [reels[index], reels[other]] = [reels[other], reels[index]];
  }
  // Match the public trigger shape: one invitation per selected reel.
  return reels.slice(0, INVITATION_COUNTS[tier]).map(reel => ({ reel, row: choose(CONFIG.rows) }));
}

/** Keep future spin badges and upgrades hidden until after the feature wheel. */
export function boughtBonusTriggerGrid(presentation: Pick<SpinPresentation, 'id' | 'tier' | 'initialGrid'>): Grid {
  const { id, tier, initialGrid } = presentation;
  if (!tier) throw new Error('BONUS_TRIGGER_REQUIRES_TIER');
  const grid: Grid = initialGrid.map((column, reel) => column.map((symbol, row) => (
    PAYING_SYMBOLS.some(paying => paying === symbol) ? symbol : (reel + row) % 2 ? 'coffee' : 'book'
  )));
  for (const { reel, row } of boughtBonusInvitations(id, tier, initialGrid)) grid[reel][row] = 'scatter';
  return grid;
}
