import type { BonusTier, Mode, PayingSymbol } from './types';

export const PAYING_SYMBOLS: PayingSymbol[] = ['book','coffee','noodles','doner','female','male','dj','couple'];
export const CONFIG = {
  version: 'studentski-1', schemaVersion: 1, reels: 5, rows: 4,
  betsCents: [10,20,40,60,100,200,500,1000,2000], defaultBetCents: 20,
  initialBalanceCents: 1_000_000, refillCents: 1_000_000, historyLimit: 100, autoplayLimit: 100,
  capMultiplier: 20_000, payoutDenominator: 1_000_000, partyLimit: 25,
  retriggerLimit: 3, retriggerSpins: 2, framesAddedPerSpin: 2, wildMultiplierLimit: 3,
  baseFrameProbability: .12, baseWildProbability: .008, maxNudgeSteps: 2,
  god: { costMultiplier: 1000, successProbability: .048, attempts: 3, positions: 5,
    opportunityProbability: 1 - (1 - .048 ** (1/5)) ** (1/3) },
  standardVipProbability: .000001,
  // Paytable entries are millionths of the locked base bet PER weighted way.
  paytable: {
    book: [3_000,30_000,1_600_000], coffee: [3_000,30_000,1_600_000],
    noodles: [3_000,30_000,1_600_000], doner: [3_000,30_000,1_600_000],
    female: [6_000,60_000,3_200_000], male: [6_000,60_000,3_200_000],
    dj: [6_000,60_000,3_200_000], couple: [6_000,60_000,3_200_000],
  } satisfies Record<PayingSymbol, number[]>,
  prices: { standard: 1, hunt: 2, frames: 6, wild: 25, god: 1000 } satisfies Record<Mode,number>,
  buyPrices: { dorm: 100, friday: 300, december: 1000 } satisfies Record<BonusTier,number>,
  // A profile blends uniform symbol weights with a distinct home symbol per reel.
  // Explicit distributions differ by purchased mode/tier; payouts share one paytable.
  modes: {
    standard: { blend: 1, focusWeight: 0, scatterProbability: .065 },
    hunt: { blend: 1, focusWeight: 0, scatterProbability: .0484 },
    frames: { blend: .554, focusWeight: 0, scatterProbability: .065 },
    wild: { blend: 1, focusWeight: .101, scatterProbability: .065 },
    god: { blend: 1, focusWeight: 0, scatterProbability: 0 },
  } satisfies Record<Mode,{ blend: number; focusWeight:number; scatterProbability: number }>,
  bonuses: {
    dorm: { spins: 8, energy: 1, wildCount: 0, blend: .964, focusWeight:0, scatterProbability: .035 },
    friday: { spins: 10, energy: 3, wildCount: 1, blend: .244, focusWeight:0, scatterProbability: .035 },
    december: { spins: 12, energy: 5, wildCount: 2, blend: .034, focusWeight:0, scatterProbability: .035 },
  } satisfies Record<BonusTier,{ spins:number; energy:number; wildCount:number; blend:number; focusWeight:number; scatterProbability:number }>,
  homeSymbols: ['book','coffee','noodles','doner','male'] as PayingSymbol[],
} as const;

export const BONUS_ORDER: BonusTier[] = ['dorm','friday','december'];
export function roundPriceCents(betCents: number, choice: import('./types').RoundChoice): number {
  return betCents * (choice.kind === 'mode' ? CONFIG.prices[choice.mode] : CONFIG.buyPrices[choice.bonus]);
}
