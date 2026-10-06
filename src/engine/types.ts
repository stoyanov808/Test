export type PayingSymbol = 'book' | 'coffee' | 'noodles' | 'doner' | 'female' | 'male' | 'dj' | 'couple';
export type SymbolId = PayingSymbol | 'wild' | 'scatter' | 'vip';
export type Mode = 'standard' | 'hunt' | 'frames' | 'wild' | 'god';
export type BonusTier = 'dorm' | 'friday' | 'december';
export type RoundPhase = 'idle' | 'presenting-base' | 'presenting-bonus' | 'bonus-pending' | 'presenting-vip' | 'presenting-complete';
export type RoundChoice = { kind: 'mode'; mode: Mode } | { kind: 'buy'; bonus: BonusTier };
export type Grid = SymbolId[][];
export interface CellPosition { reel: number; row: number }
export interface WildState { id: string; reel: number; multiplier: number; steps: number }
export interface Win { symbol: PayingSymbol; reels: number; weightedWays: number; payoutCents: number; cells: CellPosition[] }
export interface SpinPresentation {
  id: string; kind: 'spin' | 'vip'; grid: Grid; frames: boolean[][]; wilds: WildState[]; wins: Win[];
  payoutCents: number; roundTotalCents: number; scatters: number; energyUsed: number; energyAfter: number;
  tier: BonusTier | null; bonusAwarded: BonusTier | null; upgradedTo: BonusTier | null;
  retrigger: boolean; maxWin: boolean; roundComplete: boolean; intro: boolean;
  vipAttempts?: boolean[][]; vipLocked?: boolean[]; events: string[];
  roundCostCents: number; lockedBetCents: number; choice: RoundChoice;
}
export interface ActiveRound {
  id: string; choice: RoundChoice; betCents: number; costCents: number; payoutCents: number;
  capCents: number; tier: BonusTier | null; spinsRemaining: number; energy: number;
  frames: boolean[][]; wilds: WildState[]; retriggers: number; spinIndex: number; configVersion: string;
}
export interface HistoryEntry {
  id: string; choice: RoundChoice; betCents: number; costCents: number; payoutCents: number;
  spins: number; maxWin: boolean;
}
export interface Session {
  version: number; phase: RoundPhase; balanceCents: number; betCents: number; selectedMode: Mode; rngState: number;
  roundSequence: number; activeRound: ActiveRound | null; presentation: SpinPresentation | null;
  history: HistoryEntry[];
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
