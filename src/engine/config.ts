import type { BonusTier, Mode, PayingSymbol } from './types';

export const PAYING_SYMBOLS: PayingSymbol[] = ['book','coffee','noodles','doner','beer','female','male','dj','bouncer'];
export const BONUS_ORDER: BonusTier[] = ['dorm','friday','december'];
export const CONFIG = {
  version: 'studentski-duck-5', schemaVersion: 5, reels: 6, rows: 5,
  betsCents: [10,20,40,60,100,200,500,1000,2000], defaultBetCents: 20,
  initialBalanceCents: 1_000_000, refillCents: 1_000_000, historyLimit: 100, autoplayLimit: 100,
  capMultiplier: 30_000, payoutDenominator: 1_000_000,
  minimumPayCount: 8, payThresholds: [8,10,12], positionMultiplierLimit: 8192,
  partyLimit: 8192, retriggerLimit: 1000, retriggerSpins: 1,
  // Compatibility configuration fields; there are no reel-wide nudging or sticky Wilds.
  wildMultiplierLimit: 8192, framesAddedPerSpin: 0, maxNudgeSteps: 0,
  baseFrameProbability: 0, baseWildProbability: .008, standardVipProbability: 0,
  prices: { standard: 1, hunt: 2, frames: 2.8, wild: 90, god: 3000 } satisfies Record<Mode,number>,
  initialPositionMultipliers: { standard: 1, hunt: 1, frames: 2, wild: 64, god: 1024 } satisfies Record<Mode,number>,
  luckyDrawPrice: 235, luckyDrawProbabilities: [.5,.25,.25],
  // Original transparent Extra Spin quotation; calibrated independently of public mode prices.
  extraQuoteDenominator: 28,
  buyPrices: { dorm: 70, friday: 200, december: 600 } satisfies Record<BonusTier,number>,
  // Counts are physical matching positions anywhere, including Wild substitutes.
  // Verified public Duck Hunters guest-demo awards, retrieved 2026-10-07.
  // Original Studentski symbols map L5→L1, M4→M1 in ascending table order.
  // Awards are millionths of the BASE bet, multiplied by active (>1) winning
  // position multipliers added together, or by 1 when none are boosted.
  // Evidence and mapping: docs/duck-hunters-public-paytable.json.
  paytable: {
    book: [100_000,150_000,1_000_000],
    coffee: [100_000,200_000,1_250_000],
    noodles: [100_000,250_000,1_500_000],
    doner: [100_000,300_000,1_750_000],
    beer: [100_000,400_000,2_000_000],
    female: [150_000,600_000,2_500_000],
    male: [150_000,700_000,3_000_000],
    dj: [200_000,800_000,3_500_000],
    bouncer: [300_000,1_000_000,5_000_000],
  } satisfies Record<PayingSymbol, number[]>,
  // Independent original symbol distributions, not Nolimit City's private reel strips.
  symbolWeights: [1,1,1,1,1,1,1,1,1],
  // Conditional on a badge draw; the infection perk guarantees upgraded badges.
  naturalInfectiousProbability: .005,
  // One fixed lottery when a base drop first reaches exactly three invitations.
  invitationPromotionProbabilities: { friday: .10, december: .02 },
  modes: {
    standard: { scatterProbability: .057, wildProbability: .008, xwaysProbability: .049, bombProbability: .006 },
    hunt: { scatterProbability: .0415, wildProbability: .004, xwaysProbability: .0195, bombProbability: .0015 },
    frames: { scatterProbability: .057, wildProbability: .008, xwaysProbability: .0563, bombProbability: .006 },
    wild: { scatterProbability: .06, wildProbability: .008, xwaysProbability: .0648, bombProbability: .006 },
    god: { scatterProbability: .06, wildProbability: .008, xwaysProbability: .1114, bombProbability: .006 },
  } satisfies Record<Mode,{scatterProbability:number;wildProbability:number;xwaysProbability:number;bombProbability:number}>,
  bonuses: {
    dorm: { spins: 7, upgradesCount: 1, energy: 1, wildCount: 0, shotProbability: .003, wildProbability: .008, xwaysProbability: .02135, bombProbability: .004 },
    friday: { spins: 8, upgradesCount: 2, energy: 1, wildCount: 0, shotProbability: .003, wildProbability: .008, xwaysProbability: .0192, bombProbability: .004 },
    december: { spins: 10, upgradesCount: 3, energy: 1, wildCount: 0, shotProbability: .003, wildProbability: .008, xwaysProbability: .01685, bombProbability: .004 },
  } satisfies Record<BonusTier,{spins:number;upgradesCount:number;energy:number;wildCount:number;shotProbability:number;wildProbability:number;xwaysProbability:number;bombProbability:number}>,
} as const;

export function roundPriceCents(betCents: number, choice: import('./types').RoundChoice, extraCostCents?:number): number {
  // All offered stakes make the Day 2 price an exact whole-cent amount.
  if(choice.kind==='extra'){if(!Number.isSafeInteger(extraCostCents)||extraCostCents!<0)throw new Error('EXTRA_SPIN_OFFER_REQUIRED');return extraCostCents!;}
  const multiplier = choice.kind === 'mode' ? CONFIG.prices[choice.mode] : choice.kind === 'buy' ? CONFIG.buyPrices[choice.bonus] : CONFIG.luckyDrawPrice;
  const result = Math.round(betCents * multiplier);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('INVALID_MONEY');
  return result;
}
