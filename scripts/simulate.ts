import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  CONFIG, advanceRound, createSession, dismissPresentation, startRound,
} from '../src/engine/index';
import type { Mode, RoundChoice, Session, SpinPresentation } from '../src/engine/types';

/** Diagnostic runs use the very same paid-round transitions as the browser. */
export interface SimulationResult {
  mode: string; rounds: number; seed: number; stakeCents: number; payoutCents: number;
  rtp: number; rtp95: [number, number]; hitRate: number; profitableRate: number;
  breakEvenRate: number; bonusFrequency: number; naturalBonusTiers: Record<string, number>; purchasedBonusTiers: Record<string, number>;
  bonusRounds: number; bonusFiveTimesBaseBetRate: number | null; bonusReturnFiveTimesDebitRate: number | null;
  bonusMeanPayoutCents: number | null; bonusMedianPayoutCents: number | null;
  maxWinFrequency: number; observedMaxWins: number; observedMaxPayoutCents: number;
  meanPayoutCents: number; medianPayoutCents: number; payoutQuantilesCents: Record<string, number>;
  meanSpins: number; meanCascadeSteps: number; meanWinningCascades: number;
  maxSpins: number; maxCascadeStepsPerSpin: number; maxPositionMultiplier: number;
  maxSymbolSize: number; meanEffectiveSymbols: number; expandingSpinRate: number;
  multiplierGrowthSpinRate: number; meanBoostedPositions: number; positionMultiplierDistribution: Record<string, number>;
  shotsAdded: number; shotSymbols: number; modifierCounts: Record<string, number>;
  payCountDistribution: Record<string, number>; countBracketDistribution: Record<string, number>; payBracketDistribution: Record<string, number>;
  symbolSizeDistribution: Record<string, number>; upgradeDistribution: Record<string, number>;
  physicalWildCountDistribution: Record<string, number>;
  badgeVariantDistribution: Record<string,{normal:number;upgraded:number}>;
  multiBadgeRevealDistribution: {multipleTypes:number;singleType:number};
  truncatedRounds: number; safetyEvents: Record<string, number>; accountingErrors: number;
  capAccountingErrors: number; physicalCountErrors: number;
}

/** A configuration name is insufficient: an unchanged table can use a changed algorithm. */
export function mathProvenance() {
  const sources = ['src/engine/config.ts', 'src/engine/engine.ts', 'src/engine/evaluator.ts', 'src/engine/rng.ts', 'src/engine/accounting.ts'];
  const mathSourceHashes = Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex')]));
  return {
    mathAlgorithmHash: createHash('sha256').update(JSON.stringify(mathSourceHashes)).digest('hex'), mathSourceHashes,
    configurationHash: createHash('sha256').update(JSON.stringify(CONFIG)).digest('hex'),
    simulationProgramHash: createHash('sha256').update(readFileSync(new URL('./simulate.ts', import.meta.url))).digest('hex'),
    publicParameterEvidenceHash: createHash('sha256').update(readFileSync(new URL('../docs/duck-hunters-public-paytable.json', import.meta.url))).digest('hex'),
  };
}

export const CHOICES: RoundChoice[] = [
  ...(['standard', 'hunt', 'frames', 'wild', 'god'] as const).map(mode => ({ kind: 'mode' as const, mode })),
  ...(['dorm', 'friday', 'december'] as const).map(bonus => ({ kind: 'buy' as const, bonus })),
  { kind: 'lucky' },
];

export function choiceLabel(choice: RoundChoice): string {
  return choice.kind === 'mode' ? choice.mode : choice.kind === 'buy' ? `buy-${choice.bonus}` : choice.kind;
}

function increment(histogram: Record<string, number>, key: string | number, count = 1): void {
  histogram[String(key)] = (histogram[String(key)] ?? 0) + count;
}

/** Lower-order quantile reports actual cent outcomes rather than interpolating. */
function quantile(sorted: Float64Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function complete(session: Session, inspect?: (view:SpinPresentation)=>void): Session {
  let current = session, steps = 0;
  while (current.presentation || current.activeRound) {
    if (++steps > 10_000) throw new Error('UNFINISHED_EXTRA_EXPERIMENT_ROUND');
    if(current.presentation)inspect?.(current.presentation);
    current = dismissPresentation(current);
    if (current.activeRound) current = advanceRound(current);
  }
  return current;
}

interface RatioMoments { n: number; cost: number; payout: number; costSquared: number; payoutSquared: number; product: number }
function addRatioSample(moments: RatioMoments, cost: number, payout: number): void {
  moments.n++; moments.cost += cost; moments.payout += payout;
  moments.costSquared += cost * cost; moments.payoutSquared += payout * payout; moments.product += cost * payout;
}
/** Delta-method CI for a ratio of means. It remains valid when quote/debit varies by offer. */
function ratioSummary(moments: RatioMoments): { rtp: number | null; rtp95: [number, number] | null } {
  if (!moments.n || !moments.cost) return { rtp: null, rtp95: null };
  const rtp = moments.payout / moments.cost;
  const residualVariance = Math.max(0, (moments.payoutSquared - 2 * rtp * moments.product + rtp * rtp * moments.costSquared) / Math.max(1, moments.n - 1));
  const margin = 1.96 * Math.sqrt(residualVariance / moments.n) / (moments.cost / moments.n);
  return { rtp, rtp95: [Math.max(0, rtp - margin), rtp + margin] };
}

export function simulateExtraOffers(sourceRounds: number, seed: number, sourceMode: Mode = 'standard') {
  if (!Number.isSafeInteger(sourceRounds) || sourceRounds < 1) throw new Error('sourceRounds must be a positive safe integer');
  let session = createSession(seed, 1_000_000_000_000), offered = 0, hits = 0, profitable = 0, maxWins = 0, accountingErrors = 0, capAccountingErrors = 0;
  let subsequentOffersDeclined = 0;
  const quotes: number[] = [], returns: number[] = [], quoteDistribution: Record<string, number> = {};
  const extra: RatioMoments = { n: 0, cost: 0, payout: 0, costSquared: 0, payoutSquared: 0, product: 0 };
  const pairs: RatioMoments = { ...extra };
  const badgeVariants={normal:0,upgraded:0},multiBadgeReveals={multipleTypes:0,singleType:0};
  for (let index = 0; index < sourceRounds; index++) {
    const beforeSource = session.balanceCents;
    session = complete(startRound(session, { kind: 'mode', mode: sourceMode }));
    const source = session.history[0];
    if (session.balanceCents !== beforeSource - source.costCents + source.payoutCents) accountingErrors++;
    let pairCost = source.costCents, pairPayout = source.payoutCents;
    if (session.extraSpinOffer) {
      offered++;
      const offer = session.extraSpinOffer;
      if (offer.costCents > source.payoutCents) throw new Error('INELIGIBLE_EXTRA_OFFER');
      const beforeExtra = session.balanceCents;
      session = complete(startRound(session, { kind: 'extra' }),view=>{
        for(const step of view.cascadeSteps){
          const badges=step.modifiers.filter(modifier=>modifier.kind==='xways'||modifier.kind==='infectious');
          for(const badge of badges)badgeVariants[badge.kind==='infectious'?'upgraded':'normal']++;
          if(badges.length>1)multiBadgeReveals[new Set(badges.map(badge=>badge.symbol)).size>1?'multipleTypes':'singleType']++;
        }
      });
      const round = session.history[0];
      if (round.costCents !== offer.costCents || session.balanceCents !== beforeExtra - offer.costCents + round.payoutCents) accountingErrors++;
      if (round.sourceRoundId !== offer.sourceRoundId || round.capOffsetCents !== offer.alreadyPaidCents || round.payoutCents + (round.capOffsetCents ?? 0) > round.betCents * CONFIG.capMultiplier) capAccountingErrors++;
      addRatioSample(extra, round.costCents, round.payoutCents);
      quotes.push(round.costCents); returns.push(round.payoutCents); increment(quoteDistribution, round.costCents);
      if (round.payoutCents > 0) hits++;
      if (round.payoutCents > round.costCents) profitable++;
      if (round.maxWin) maxWins++;
      if (session.extraSpinOffer) subsequentOffersDeclined++;
      pairCost += round.costCents; pairPayout += round.payoutCents;
    }
    addRatioSample(pairs, pairCost, pairPayout);
    if (session.balanceCents < 1_000_000) session = { ...session, balanceCents: 1_000_000_000_000 };
  }
  const sortedQuotes = Float64Array.from(quotes).sort(), sortedReturns = Float64Array.from(returns).sort();
  return {
    experiment: 'conditional-extra-offers', sourceMode, sourcePaidRounds: sourceRounds, seed,
    policy: 'Accept one qualified Extra Spin after each source paid round; decline any further offers. Start the next source round using a fresh multiplier grid.',
    quotedPricingStatus: 'Original transparent quote formula; Nolimit City’s private Extra Spin pricing is unavailable and is not claimed to match.',
    offered, offerFrequency: offered / sourceRounds, accepted: extra.n, subsequentOffersDeclined,
    costCents: extra.cost, payoutCents: extra.payout, ...ratioSummary(extra),
    confidenceIntervalMethod: 'Approximate 95% ratio-of-means delta interval using variance(payout − observed RTP × quote) / mean quote². This is a conditional qualified-offer cohort, not the unconditional return of an ordinary mode.',
    hitRate: offered ? hits / offered : null, profitableRate: offered ? profitable / offered : null,
    observedMaxWins: maxWins, meanQuoteCents: offered ? extra.cost / offered : null,
    medianQuoteCents: offered ? quantile(sortedQuotes, .5) : null,
    meanPayoutCents: offered ? extra.payout / offered : null,
    medianPayoutCents: offered ? quantile(sortedReturns, .5) : null,
    payoutQuantilesCents: offered ? Object.fromEntries([.5, .75, .9, .95, .99, .999].map(p => [String(p), quantile(sortedReturns, p)])) : null,
    quoteDistribution, badgeVariantDistribution:badgeVariants, multiBadgeRevealDistribution:multiBadgeReveals,
    accountingErrors, capAccountingErrors, truncatedRounds: 0,
    sourceAndOneExtraPolicy: { costCents: pairs.cost, payoutCents: pairs.payout, ...ratioSummary(pairs) },
  };
}

export function simulate(choice: RoundChoice, rounds: number, seed: number): SimulationResult {
  if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('rounds must be a positive safe integer');
  let session = createSession(seed, 1_000_000_000_000);
  let stake = 0, payout = 0, hits = 0, profitable = 0, equal = 0, bonuses = 0;
  let maxWins = 0, spins = 0, sumSquares = 0, maxPayout = 0, maxSpins = 0;
  let steps = 0, winningSteps = 0, maxSteps = 0, maxMultiplier = 1, maxSize = 1;
  let effectiveSymbols = 0, expandedSpins = 0, shotsAdded = 0, shotSymbols = 0;
  let growingSpins = 0, boostedPositions = 0;
  let truncated = 0, accountingErrors = 0, capAccountingErrors = 0, physicalCountErrors = 0;
  let bonusRounds = 0, bonusFiveTimesBaseBet = 0, bonusFiveTimesDebit = 0, bonusPayoutTotal = 0;
  let currentBonusPayout = 0, currentHasBonus = false;
  const bonusPayouts: number[] = [];
  const payouts = new Float64Array(rounds);
  const modifierCounts: Record<string, number> = {}, payCounts: Record<string, number> = {};
  const countBrackets: Record<string, number> = {};
  const payBrackets: Record<string, number> = {}, sizes: Record<string, number> = {};
  const upgrades: Record<string, number> = {}, wildCounts: Record<string, number> = {};
  const tiers: Record<string, number> = {}, purchasedTiers: Record<string, number> = {}, safetyEvents: Record<string, number> = {};
  const multipliers: Record<string, number> = {};
  const badgeVariants: Record<string,{normal:number;upgraded:number}> = {};
  const multiBadgeReveals = {multipleTypes:0,singleType:0};

  function inspect(view: SpinPresentation): void {
    steps += view.cascadeSteps.length;
    maxSteps = Math.max(maxSteps, view.cascadeSteps.length);
    const physicalSymbols = view.finalGrid.reduce((count, column) => count + column.length, 0);
    effectiveSymbols += physicalSymbols;
    if (physicalSymbols !== CONFIG.reels * CONFIG.rows || view.effectiveSymbols !== physicalSymbols) physicalCountErrors++;
    if (view.tier) { currentHasBonus = true; currentBonusPayout += view.payoutCents; }
    if (view.bonusAwarded) currentHasBonus = true;
    if (physicalSymbols > CONFIG.reels * CONFIG.rows) expandedSpins++;
    if (view.finalPositionMultipliers.some((column, reel) => column.some((value, row) => value > view.initialPositionMultipliers[reel][row]))) growingSpins++;
    shotsAdded += view.shotsAdded;
    if (view.bonusAwarded) { bonuses++; increment(tiers, view.bonusAwarded); }
    if (view.intro && view.tier) {
      increment(upgrades, view.upgrades.slice().sort().join('+') || 'none');
      if (view.choice.kind !== 'mode') increment(purchasedTiers, view.tier);
    }
    for (const event of view.events) {
      if (/limit|truncat|safety|overflow/i.test(event) && !/max.?win/i.test(event)) increment(safetyEvents, event);
    }
    for (const step of view.cascadeSteps) {
      for (const grid of [step.grid, step.resolvedGrid, ...(step.refilledGrid ? [step.refilledGrid] : [])]) {
        if (grid.length !== CONFIG.reels || grid.some(column => column.length !== CONFIG.rows)) physicalCountErrors++;
      }
      if (step.wins.length) winningSteps++;
      let wildCount = 0;
      for (let reel = 0; reel < CONFIG.reels; reel++) {
        for (let row = 0; row < CONFIG.rows; row++) {
          const size = step.resolvedSymbolSizes[reel][row];
          if (size !== 1) physicalCountErrors++;
          maxSize = Math.max(maxSize, size);
          increment(sizes, size);
          maxMultiplier = Math.max(maxMultiplier, step.positionMultipliersAfter[reel][row]);
          increment(multipliers, step.positionMultipliersAfter[reel][row]);
          if (step.positionMultipliersAfter[reel][row] > 1) boostedPositions++;
          if (step.resolvedGrid[reel][row] === 'wild') wildCount++;
        }
      }
      increment(wildCounts, wildCount);
      const badges=step.modifiers.filter(modifier=>modifier.kind==='xways'||modifier.kind==='infectious');
      if(badges.length>1)multiBadgeReveals[new Set(badges.map(badge=>badge.symbol)).size>1?'multipleTypes':'singleType']++;
      const badgeContext=view.tier?(view.upgrades.includes('infectious')?'bonus-with-perk':'bonus-without-perk'):'base';
      const badgeCounts=badgeVariants[badgeContext]??={normal:0,upgraded:0};
      for(const badge of badges)badgeCounts[badge.kind==='infectious'?'upgraded':'normal']++;
      for (const modifier of step.modifiers) {
        increment(modifierCounts, modifier.kind);
        if (modifier.kind === 'shot') shotSymbols++;
      }
      for (const win of step.wins) {
        if (win.count !== win.cells.length || win.count > CONFIG.reels * CONFIG.rows || win.count < CONFIG.minimumPayCount) physicalCountErrors++;
        increment(payCounts, win.count);
        increment(countBrackets, win.count < 10 ? '8-9' : win.count < 12 ? '10-11' : '12+');
        increment(payBrackets, `${win.symbol}:${win.payMultiplier}x`);
      }
    }
  }

  for (let index = 0; index < rounds; index++) {
    const initialBalance = session.balanceCents;
    currentBonusPayout = 0; currentHasBonus = false;
    session = startRound(session, choice);
    let presentations = 0;
    while (session.presentation || session.activeRound) {
      if (session.presentation) { inspect(session.presentation); presentations++; session = dismissPresentation(session); }
      if (session.activeRound) {
        // Emergency diagnostic stop, never a concealed settled outcome.
        if (presentations >= 10_000) { truncated++; break; }
        session = advanceRound(session);
      }
    }
    if (session.presentation || session.activeRound) {
      throw new Error(`UNFINISHED_ROUND ${choiceLabel(choice)} seed=${seed} index=${index}; ${truncated} diagnostic truncation(s)`);
    }
    const round = session.history[0];
    if (session.balanceCents !== initialBalance - round.costCents + round.payoutCents) accountingErrors++;
    const chainPayout = round.payoutCents + (round.capOffsetCents ?? 0), cap = round.betCents * CONFIG.capMultiplier;
    if (chainPayout > cap || round.maxWin !== (chainPayout === cap)) capAccountingErrors++;
    if (currentHasBonus) {
      bonusRounds++; bonusPayoutTotal += currentBonusPayout; bonusPayouts.push(currentBonusPayout);
      if (currentBonusPayout >= 5 * round.betCents) bonusFiveTimesBaseBet++;
      if (currentBonusPayout >= 5 * round.costCents) bonusFiveTimesDebit++;
    }
    stake += round.costCents; payout += round.payoutCents; spins += round.spins;
    maxSpins = Math.max(maxSpins, round.spins); maxPayout = Math.max(maxPayout, round.payoutCents);
    if (round.payoutCents > 0) hits++;
    if (round.payoutCents > round.costCents) profitable++;
    if (round.payoutCents === round.costCents) equal++;
    if (round.maxWin) maxWins++;
    const ratio = round.payoutCents / round.costCents;
    sumSquares += ratio * ratio;
    payouts[index] = round.payoutCents;
    // Bankroll affects affordability only; it never feeds an outcome decision.
    if (session.balanceCents < 1_000_000) session = { ...session, balanceCents: 1_000_000_000_000 };
  }
  payouts.sort();
  const sortedBonusPayouts = Float64Array.from(bonusPayouts).sort();
  const rtp = payout / stake;
  const variance = Math.max(0, (sumSquares - rounds * rtp * rtp) / Math.max(1, rounds - 1));
  const margin = 1.96 * Math.sqrt(variance / rounds);
  return {
    mode: choiceLabel(choice), rounds, seed, stakeCents: stake, payoutCents: payout,
    rtp, rtp95: [Math.max(0, rtp - margin), rtp + margin], hitRate: hits / rounds,
    profitableRate: profitable / rounds, breakEvenRate: equal / rounds,
    bonusFrequency: choice.kind === 'mode' ? bonuses / rounds : 1, naturalBonusTiers: tiers, purchasedBonusTiers: purchasedTiers,
    bonusRounds, bonusFiveTimesBaseBetRate: bonusRounds ? bonusFiveTimesBaseBet / bonusRounds : null,
    bonusReturnFiveTimesDebitRate: bonusRounds ? bonusFiveTimesDebit / bonusRounds : null,
    bonusMeanPayoutCents: bonusRounds ? bonusPayoutTotal / bonusRounds : null,
    bonusMedianPayoutCents: bonusRounds ? quantile(sortedBonusPayouts, .5) : null,
    maxWinFrequency: maxWins / rounds, observedMaxWins: maxWins, observedMaxPayoutCents: maxPayout,
    meanPayoutCents: payout / rounds, medianPayoutCents: quantile(payouts, .5),
    payoutQuantilesCents: Object.fromEntries([.5, .75, .9, .95, .99, .999].map(p => [String(p), quantile(payouts, p)])),
    meanSpins: spins / rounds, meanCascadeSteps: steps / spins, meanWinningCascades: winningSteps / spins,
    maxSpins, maxCascadeStepsPerSpin: maxSteps, maxPositionMultiplier: maxMultiplier,
    maxSymbolSize: maxSize, meanEffectiveSymbols: effectiveSymbols / spins,
    expandingSpinRate: expandedSpins / spins, multiplierGrowthSpinRate: growingSpins / spins,
    meanBoostedPositions: boostedPositions / steps, positionMultiplierDistribution: multipliers,
    shotsAdded, shotSymbols, modifierCounts, badgeVariantDistribution:badgeVariants, multiBadgeRevealDistribution:multiBadgeReveals,
    payCountDistribution: payCounts, countBracketDistribution: countBrackets, payBracketDistribution: payBrackets,
    symbolSizeDistribution: sizes, upgradeDistribution: upgrades, physicalWildCountDistribution: wildCounts,
    truncatedRounds: truncated, safetyEvents, accountingErrors, capAccountingErrors, physicalCountErrors,
  };
}

function main(): void {
  const rounds = Number(process.env.SIM_ROUNDS ?? 100_000), seed = Number(process.env.SIM_SEED ?? 20261006);
  const standardRounds = Number(process.env.SIM_STANDARD_ROUNDS ?? rounds);
  if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('SIM_ROUNDS must be a positive safe integer');
  if (!Number.isSafeInteger(standardRounds) || standardRounds < 1) throw new Error('SIM_STANDARD_ROUNDS must be a positive safe integer');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('SIM_SEED must be an unsigned 32-bit integer');
  const provenance = mathProvenance();
  const extraOnly = process.env.SIM_MODE === 'extra';
  const choices = extraOnly ? [] : process.env.SIM_MODE ? CHOICES.filter(choice => choiceLabel(choice) === process.env.SIM_MODE) : CHOICES;
  if (!choices.length && !extraOnly) throw new Error('Unknown SIM_MODE');
  const results = choices.map(choice => {
    const count = choice.kind === 'mode' && choice.mode === 'standard' ? standardRounds : rounds;
    const result = simulate(choice, count, (seed + CHOICES.indexOf(choice) * 0x9e3779b9) >>> 0);
    console.log(`${result.mode}: ${count.toLocaleString()} rounds; RTP ${(result.rtp * 100).toFixed(2)}%; any win ${(result.hitRate * 100).toFixed(2)}%; profit over debit ${(result.profitableRate * 100).toFixed(2)}%`);
    return result;
  });
  const report = {
    configuration: CONFIG.version, configurationParameters: CONFIG, ...provenance, baseBetCents: CONFIG.defaultBetCents,
    roundsPerMode: standardRounds === rounds ? rounds : null, seed, generatedAt: new Date().toISOString(),
    totalPaidRounds: results.reduce((n, row) => n + row.rounds, 0),
    calibrationTargetRtp: .96,
    parameterProvenance: {
      publicParameterEvidence: 'docs/duck-hunters-public-paytable.json',
      publicParameterEvidenceSha256: provenance.publicParameterEvidenceHash,
      verifiedPublicParameters: 'Nine symbol pays at 8/10/12 physical matches and public mode/buy prices, including current 235× Lucky Draw, from the official public guest demo INIT.',
      originalParameters: ['Symbol weights', 'Modifier and Bonus occurrence probabilities', 'Extra Spin quote formula'],
      badgeRuleContract: 'Normal xWays boosts only its revealed source position. All xWays and Infectious badges on one landing share a common randomly drawn regular symbol. Upgraded Infectious xWays boosts every currently visible matching regular symbol, including its source. Rare natural upgrades use an original fixed 0.5% conditional badge lottery outside the perk. The Infectious perk guarantees every badge upgraded. Publisher private occurrence rates are unavailable.',
      commercialMatch: 'These measured outcomes belong to this Studentski Grad implementation, using the verified public xWays behavior. Nolimit City private reel/RNG parameters were unavailable; matching the public numerical paytable and prices does not establish identical commercial outcomes or RTP.',
    },
    confidenceIntervalMethod: 'Approximate 95% normal interval of independent paid-round return ratios; very rare jackpots can make this interval optimistic. No commercial RTP claim is inferred from public rules.',
    definitions: {
      rtp: 'Total credited cents / total debited cents, including every bonus spin and the whole-round cap.',
      hitRate: 'Paid rounds returning more than zero; this does not mean profitable.',
      profitableRate: 'Paid rounds returning strictly more than their actual debit.',
      bonusFiveTimesBaseBetRate: 'Among rounds containing a bonus, fraction whose bonus spins alone credit at least five times the original base bet; excludes the triggering base-spin payout.',
      bonusReturnFiveTimesDebitRate: 'Among rounds containing a bonus, fraction whose bonus spins alone credit at least five times that paid round’s actual debit; excludes the triggering base-spin payout.',
      bonusMeanPayoutCents: 'Mean payout from bonus spins only, conditional on a bonus occurring; excludes the triggering base-spin payout.',
      payCountDistribution: 'Physical matching cell count at each awarded symbol win, including Wild substitutes.',
      countBracketDistribution: 'Awarded symbol win counts grouped into 8–9, 10–11 and 12+ physical positions.',
      payBracketDistribution: 'Symbol and unboosted paytable multiplier at each awarded win.',
      symbolSizeDistribution: 'Every physical cell after modifiers, over all recorded cascade steps.',
      physicalWildCountDistribution: 'Number of Wild cells after modifiers, over recorded cascade steps.',
      badgeVariantDistribution: 'Resolved badge counts by base, bonus without the Infectious perk, and bonus with the perk. Base and non-perk contexts permit rare upgraded badges; perk contexts must show zero normal badges.',
      multiBadgeRevealDistribution: 'Cascade drops resolving two or more badges, grouped by one shared regular type versus multiple types. Restored public xWays rules require multipleTypes to remain zero.',
      meanEffectiveSymbols: 'Physical reel positions per spin, always 30 for this 6×5 board; position multipliers change without inventing extra payable cells.',
      multiplierGrowthSpinRate: 'Fraction of spins that increase at least one position multiplier beyond its value at the start of that spin.',
      meanBoostedPositions: 'Mean number of physical cells with a multiplier above 1, over recorded cascade steps.',
      safetyEvents: 'Explicit limit or truncation events emitted by the engine; all are retained in this report.',
      capAccountingErrors: 'Receipts whose cumulative original-round/Extra chain payout exceeds the cap or whose maximum-win flag disagrees with reaching the cap.',
      physicalCountErrors: 'Any non-30 physical grid, invented symbol copy, or win count inconsistent with its actual physical cell list.',
    },
    results,
    extraSpinExperiment: extraOnly || process.env.SIM_EXTRA_ROUNDS ? simulateExtraOffers(Number(process.env.SIM_EXTRA_ROUNDS ?? rounds), seed, (process.env.SIM_EXTRA_SOURCE_MODE ?? 'standard') as Mode) : null,
  };
  if (JSON.stringify(provenance) !== JSON.stringify(mathProvenance())) throw new Error('Math or simulation source changed during this run; discard the stale report and rerun after freezing sources');
  console.table(results.map(r => ({
    mode: r.mode, rounds: r.rounds, 'RTP %': (r.rtp * 100).toFixed(2),
    '95% range %': r.rtp95.map(n => (n * 100).toFixed(2)).join('–'),
    'any win %': (r.hitRate * 100).toFixed(2), 'profit %': (r.profitableRate * 100).toFixed(2),
    'median cents': r.medianPayoutCents, 'bonus %': (r.bonusFrequency * 100).toFixed(3),
    'max %': (r.maxWinFrequency * 100).toFixed(4), 'mean cascades': r.meanCascadeSteps.toFixed(3),
  })));
  const out = process.env.SIM_OUTPUT;
  if (out) {
    let outputReport: unknown = report;
    if (process.env.SIM_MERGE === '1' && existsSync(out)) {
      const previous = JSON.parse(readFileSync(out, 'utf8'));
      if (JSON.stringify(previous.configurationParameters) !== JSON.stringify(CONFIG) || previous.mathAlgorithmHash !== provenance.mathAlgorithmHash || previous.simulationProgramHash !== provenance.simulationProgramHash || previous.publicParameterEvidenceHash !== provenance.publicParameterEvidenceHash) throw new Error('Cannot merge reports from different numerical configurations, outcome algorithms, simulation metrics or public evidence');
      const merged: SimulationResult[] = previous.results.map((old: SimulationResult) => results.find(row => row.mode === old.mode) ?? old);
      for (const row of results) if (!merged.some(old => old.mode === row.mode)) merged.push(row);
      outputReport = {
        ...report, roundsPerMode: null, seed: null, totalPaidRounds: merged.reduce((n, row) => n + row.rounds, 0),
        validationRuns: [...(previous.validationRuns ?? [{ baseSeed: previous.seed, roundsPerMode: previous.roundsPerMode, modes: 'initial run' }]), { baseSeed: seed, roundsPerMode: rounds, standardRounds, modes: process.env.SIM_MODE ?? 'all' }],
        results: merged,
        extraSpinExperiment: report.extraSpinExperiment ?? previous.extraSpinExperiment ?? null,
      };
    }
    writeFileSync(out, JSON.stringify(outputReport, null, 2) + '\n');
  }
}

if (process.argv[1]?.endsWith('simulate.ts')) main();
