/** Frozen full-round weighted catalogue; regenerate using npm run math:build. */
import data from './math-model.json';
export interface MathPool {
  choice: { kind: 'spin' } | { kind: 'xbet'; character: 'left' | 'middle' | 'right' } | { kind: 'buy'; tier: 'ruse' | 'lux' | 'edge' | 'old' } | { kind: 'god' };
  bonus: boolean | null;
  seeds: number[];
  entryScatters?: number[];
  expansionCounts: number[]; shotCounts: number[]; lockedReelCounts: number[];
  triggerTiers: ('ruse' | 'lux' | 'edge' | 'old' | null)[];
  payouts: number[][];
  weights: { baseline: string; extra: string; indices: number[]; total: string; weightedPayout: string; targetNumerator: string; targetDenominator: string }[];
}
export interface MathModel {
  version: 4; targetRtp: { numerator: 193; denominator: 200 };
  betsCents: number[]; sourceHashes: Record<string, string>; pools: Record<string, MathPool>;
}
export const MATH_MODEL = data as unknown as MathModel;
