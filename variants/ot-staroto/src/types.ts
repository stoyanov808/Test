export type Character = 'left' | 'middle' | 'right';
export type Tier = 'ruse' | 'lux' | 'edge' | 'old';
export type Regular = 'bottle' | 'cash' | 'chain' | 'cassette' | 'sneaker' | 'crown' | 'lighter' | 'dice' | 'ring';
export type SymbolId = Regular | Character | 'wild' | 'scatter' | 'max';
export type Grid = SymbolId[][];
export type Matrix = number[][];
export interface Cell { reel: number; row: number }
export type Choice = { kind: 'spin' } | { kind: 'boost' } | { kind: 'xbet'; character: Character } | { kind: 'buy'; tier: Tier } | { kind: 'god' };
export interface Win { line: number; symbol: Regular | 'wild'; cells: Cell[]; count: number; baseMultiplier: number; globalMultiplier: number; payoutCents: number }
export interface Coin { cell: Cell; kind: 'value' | 'collector' | 'multiplier' | 'global' | 'empty'; value: number; payoutCents: number; target?: Cell }
export interface CoinModifier { source: Cell; targets: Cell[]; factor: number; global: boolean }
export interface CoinCollection { collector: Cell; sources: Coin[]; collectedCents: number; valueBeforeCents: number; valueAfterCents: number }
export interface CoinWave {
  index: number; existingCollectors: Coin[]; coins: Coin[]; modifierEvents: CoinModifier[];
  collections: CoinCollection[]; retainedCollectors: Coin[]; cleared: Cell[]; repeat: boolean;
}
export interface ShooterShot { target: Cell; hits: { cell: Cell; multiplier: number; repeated: boolean }[]; expandedReel?: number; sticky: boolean }
export interface Feature {
  character: Character; source: Cell; targets: Cell[]; phase?: 'expand' | 'shots'; shotEvents?: ShooterShot[]; expandedReel?: number; expansionMultiplier?: number;
  hits: { cell: Cell; multiplier: number; repeated: boolean }[];
  coins: Coin[]; coinWaves: CoinWave[]; globalMultiplier: number; gridAfter: Grid; wildMultipliersAfter: Matrix;
  payoutCents: number;
}
export interface Cascade {
  index: number; grid: Grid; wildMultipliers: Matrix; features: Feature[];
  resolvedGrid: Grid; resolvedWildMultipliers: Matrix; stickyWilds: Matrix; marks: boolean[][];
  expandedReels: number[]; inactiveWilds: Cell[]; inactiveWildsAfter: Cell[];
  wins: Win[]; removed: Cell[]; refilledGrid?: Grid; refilledWildMultipliers?: Matrix;
  globalMultiplier: number; payoutCents: number;
}
export interface Spin {
  index: number; tier: Tier | null; initialExpandedReels: number[]; finalExpandedReels: number[]; initialGrid: Grid; initialWildMultipliers: Matrix;
  cascades: Cascade[]; finalGrid: Grid; finalWildMultipliers: Matrix; marks: boolean[][];
  inactiveWilds: Cell[];
  presentCharacters: Character[]; scatters: number; spinsRemainingBefore: number;
  spinsRemainingAfter: number; addedSpins: number; upgradedTo: Tier | null;
  bonusAwarded: Tier | null; payoutCents: number; roundTotalCents: number; maxWin: boolean;
}
export interface Round {
  id: number; choice: Choice; betCents: number; costCents: number; payoutCents: number;
  capCents: number; maxWin: boolean; godHits: boolean[]; godGrid: Grid | null; godShots: GodShot[]; spins: Spin[];
  initialRng: number; finalRng: number; triggerTier: Tier | null;
  outcome: { pool: string; index: number; seed: number; draws: number[]; source: 'crypto' | 'fixture' } | null;
}
export interface GodShot { target: Cell; character: Character; hit: boolean }
export interface Session {
  version: 5; balanceCents: number; betCents: number; rngState: number; sequence: number;
  pending: Round | null; history: Round[];
}
