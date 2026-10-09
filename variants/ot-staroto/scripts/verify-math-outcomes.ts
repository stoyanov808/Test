/** Independent complete replay of the frozen full-round payout catalogue. */
import { MATH_MODEL } from '../src/math-model';
import { CONFIG, simulateRound } from '../src/engine';
import { verifyMathModel } from './verify-math-model';
verifyMathModel();
let outcomes = 0;
for (const [name, pool] of Object.entries(MATH_MODEL.pools)) {
  for (let i = 0; i < pool.seeds.length; i++) for (const [stake, bet] of CONFIG.betsCents.entries()) {
    const round = simulateRound(pool.seeds[i], bet, pool.choice, pool.entryScatters?.[i]);
    if (round.payoutCents !== pool.payouts[i][stake] || round.triggerTier !== pool.triggerTiers[i] || round.maxWin !== (round.payoutCents === bet * CONFIG.maxWin)) throw new Error(`Frozen outcome mismatch: ${name}/${i}/${bet}`);
    let total = 0;
    for (const spin of round.spins) {
      let spinTotal = 0;
      for (const cascade of spin.cascades) {
        const payout = cascade.wins.reduce((n, w) => n + w.payoutCents, 0) + cascade.features.reduce((n, f) => n + f.payoutCents, 0);
        if (payout !== cascade.payoutCents) throw new Error('Cascade accounting failure');
        for (const feature of cascade.features) if (feature.payoutCents !== feature.coins.reduce((n, coin) => n + coin.payoutCents, 0)) throw new Error('Coin accounting failure');
        spinTotal += payout;
      }
      total += spinTotal;
      if (spinTotal !== spin.payoutCents || spin.roundTotalCents !== total || total > round.capCents) throw new Error('Round accounting failure');
    }
    if (round.godHits.some(Boolean) ? round.payoutCents !== round.capCents : total !== round.payoutCents) throw new Error('Settlement failure');
    if (name === 'ordinary' && round.triggerTier !== null || name === 'natural-bonus' && round.triggerTier === null) throw new Error('Natural entry branch failure');
    outcomes++;
  }
  console.log(`${name}: ${pool.seeds.length * CONFIG.betsCents.length} full stake outcomes verified`);
}
verifyMathModel();
console.log(`Full math verification passed: ${outcomes} replayed complete outcomes, zero payout, cap, branch or accounting failures.`);
