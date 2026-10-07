export type PayingSymbol = 'book' | 'coffee' | 'noodles' | 'doner' | 'beer' | 'female' | 'male' | 'dj' | 'bouncer';
export type SymbolId = PayingSymbol | 'wild' | 'scatter' | 'vip' | 'xways' | 'infectious' | 'bomb' | 'shot';
/** Stable identifiers; UI calls these Normal, xBet, Day 2, Day 64 and Day 1024. */
export type Mode = 'standard' | 'hunt' | 'frames' | 'wild' | 'god';
export type BonusTier = 'dorm' | 'friday' | 'december';
export type BonusUpgrade = 'infectious' | 'bomb' | 'shots';
export type RoundPhase = 'idle' | 'presenting-base' | 'presenting-bonus' | 'bonus-pending' | 'presenting-vip' | 'presenting-complete';
export type RoundChoice = { kind: 'mode'; mode: Mode } | { kind: 'buy'; bonus: BonusTier } | { kind: 'lucky' } | { kind: 'extra' };
export type Grid = SymbolId[][];
export type NumberGrid = number[][];
export interface CellPosition { reel: number; row: number }
export interface WildState { id: string; reel: number; row?: number; multiplier: number; steps: number }
export interface Win {
  symbol: PayingSymbol; count: number; payMultiplier: number; positionMultiplier: number;
  payoutCents: number; cells: CellPosition[];
  /** Compatibility fields: count-anywhere pays do not evaluate consecutive reels or ways. */
  reels: number; weightedWays: number;
}
export interface ModifierEvent {
  /** The landed badge is the cause. Reveal events include their source and eligible visible matches. */
  kind: 'xways' | 'infectious' | 'bomb' | 'shot'; source: CellPosition; targets: CellPosition[];
  factor: number; symbol?: PayingSymbol; radius?: number;
  gridAfter?: Grid; positionMultipliersAfter?: NumberGrid; shotsAdded?: number;
}
export interface CascadeStep {
  index: number; grid: Grid; symbolSizes: NumberGrid; positionMultipliers: NumberGrid;
  resolvedGrid: Grid; resolvedSymbolSizes: NumberGrid; resolvedPositionMultipliers: NumberGrid;
  modifiers: ModifierEvent[]; wins: Win[]; removed: CellPosition[];
  positionMultipliersAfter: NumberGrid; symbolSizesAfter: NumberGrid;
  refilledGrid?: Grid; refilledSymbolSizes?: NumberGrid; payoutCents: number; shotsAdded: number;
}
export interface SpinPresentation {
  id: string; kind: 'spin' | 'vip'; grid: Grid; frames: boolean[][]; wilds: WildState[]; wins: Win[];
  initialGrid: Grid; initialSymbolSizes: NumberGrid; initialPositionMultipliers: NumberGrid;
  symbolSizes: NumberGrid; positionMultipliers: NumberGrid;
  finalGrid: Grid; finalSymbolSizes: NumberGrid; finalPositionMultipliers: NumberGrid;
  cascadeSteps: CascadeStep[]; upgrades: BonusUpgrade[]; shotsAdded: number; effectiveSymbols: number;
  payoutCents: number; roundTotalCents: number; chainTotalCents: number; capOffsetCents: number; scatters: number; energyUsed: number; energyAfter: number;
  tier: BonusTier | null; bonusAwarded: BonusTier | null; upgradedTo: BonusTier | null;
  retrigger: boolean; maxWin: boolean; roundComplete: boolean; intro: boolean;
  vipAttempts?: boolean[][]; vipLocked?: boolean[]; events: string[];
  roundCostCents: number; lockedBetCents: number; choice: RoundChoice;
}
export interface ActiveRound {
  id: string; choice: RoundChoice; betCents: number; costCents: number; payoutCents: number;
  capCents: number; tier: BonusTier | null; spinsRemaining: number; energy: number;
  frames: boolean[][]; wilds: WildState[]; retriggers: number; spinIndex: number; configVersion: string;
  capOffsetCents: number; sourceRoundId: string; positionMultipliers: NumberGrid; upgrades: BonusUpgrade[]; shotsAwarded: number; extraInitialMultipliers?: NumberGrid;
}
export interface HistoryEntry {
  id: string; choice: RoundChoice; betCents: number; costCents: number; payoutCents: number;
  spins: number; maxWin: boolean; capOffsetCents: number; sourceRoundId: string; extraInitialMultipliers?: NumberGrid;
  bonusTier: BonusTier | null; bonusUpgrades: BonusUpgrade[]; shotsAwarded: number;
}
export interface ExtraSpinOffer { betCents: number; costCents: number; positionMultipliers: NumberGrid; sourceRoundId: string; alreadyPaidCents: number }
export interface Session {
  version: number; phase: RoundPhase; balanceCents: number; betCents: number; selectedMode: Mode; rngState: number;
  roundSequence: number; activeRound: ActiveRound | null; presentation: SpinPresentation | null;
  history: HistoryEntry[]; extraSpinOffer?: ExtraSpinOffer | null;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
