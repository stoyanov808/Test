import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, createSession, playCompleteRound } from '../src/engine/index';
import type { RoundChoice } from '../src/engine/types';

export interface SimulationResult {
  mode: string; rounds: number; seed: number; stakeCents: number; payoutCents: number;
  rtp: number; rtp95: [number,number]; hitRate:number; profitableRate:number; bonusFrequency:number;
  maxWinFrequency:number; observedMaxWins:number; meanSpins:number;
}
export const CHOICES:RoundChoice[]=[
  ...(['standard','hunt','frames','wild','god'] as const).map(mode=>({kind:'mode' as const,mode})),
  ...(['dorm','friday','december'] as const).map(bonus=>({kind:'buy' as const,bonus})),
];
export function simulate(choice:RoundChoice, rounds:number, seed:number):SimulationResult {
  let session=createSession(seed,1_000_000_000_000);let stake=0,payout=0,hits=0,profitable=0,bonuses=0,maxWins=0,spins=0,sumSquares=0;
  for(let index=0;index<rounds;index++) {
    session=playCompleteRound(session,choice);const round=session.history[0];
    stake+=round.costCents;payout+=round.payoutCents;spins+=round.spins;
    if(round.payoutCents>0)hits++;if(round.payoutCents>round.costCents)profitable++;
    if(choice.kind==='mode'&&choice.mode!=='god'&&round.spins>1)bonuses++;
    if(round.maxWin)maxWins++;
    const ratio=round.payoutCents/round.costCents;sumSquares+=ratio*ratio;
    // Balance is irrelevant to all RNG decisions; top up simulation bankroll only if needed.
    if(session.balanceCents<1_000_000)session={...session,balanceCents:1_000_000_000_000};
  }
  const rtp=payout/stake, variance=Math.max(0,(sumSquares-rounds*rtp*rtp)/Math.max(1,rounds-1)), margin=1.96*Math.sqrt(variance/rounds);
  return {mode:choice.kind==='mode'?choice.mode:`buy-${choice.bonus}`,rounds,seed,stakeCents:stake,payoutCents:payout,rtp,rtp95:[Math.max(0,rtp-margin),rtp+margin],hitRate:hits/rounds,profitableRate:profitable/rounds,bonusFrequency:choice.kind==='buy'?1:bonuses/rounds,maxWinFrequency:maxWins/rounds,observedMaxWins:maxWins,meanSpins:spins/rounds};
}
function main():void {
  const rounds=Number(process.env.SIM_ROUNDS??100_000),seed=Number(process.env.SIM_SEED??20261006);
  if(!Number.isInteger(rounds)||rounds<1)throw new Error('SIM_ROUNDS must be a positive integer');
  const choices=process.env.SIM_MODE?CHOICES.filter(choice=>(choice.kind==='mode'?choice.mode:`buy-${choice.bonus}`)===process.env.SIM_MODE):CHOICES;
  if(!choices.length)throw new Error('Unknown SIM_MODE');
  const results=choices.map(choice=>simulate(choice,rounds,(seed+CHOICES.indexOf(choice)*0x9e3779b9)>>>0));
  const report={configuration:CONFIG.version,configurationParameters:CONFIG,baseBetCents:CONFIG.defaultBetCents,calibrationTarget:.96,roundsPerMode:rounds,seed,generatedAt:new Date().toISOString(),god:{theoreticalSuccessProbability:CONFIG.god.successProbability,theoreticalRtp:.96,perOpportunityProbability:CONFIG.god.opportunityProbability},standardVip:{configuredProbability:CONFIG.standardVipProbability,theoreticalRtpContribution:CONFIG.standardVipProbability*CONFIG.capMultiplier},results};
  console.table(results.map(r=>({mode:r.mode,rounds:r.rounds,'RTP %':(r.rtp*100).toFixed(2),'95% range %':r.rtp95.map(n=>(n*100).toFixed(2)).join('–'),'hit %':(r.hitRate*100).toFixed(2),'bonus %':(r.bonusFrequency*100).toFixed(3),'max %':(r.maxWinFrequency*100).toFixed(4)})));
  const out=process.env.SIM_OUTPUT;
  if(out) {
    let outputReport:unknown=report;
    if(process.env.SIM_MERGE==='1'&&existsSync(out)) {
      const previous=JSON.parse(readFileSync(out,'utf8'));
      if(JSON.stringify(previous.configurationParameters)!==JSON.stringify(CONFIG))throw new Error('Cannot merge simulations from different numerical configurations');
      const merged:SimulationResult[]=previous.results.map((old:SimulationResult)=>results.find(row=>row.mode===old.mode)??old);
      for(const row of results)if(!merged.some(old=>old.mode===row.mode))merged.push(row);
      outputReport={...report,roundsPerMode:null,seed:null,totalPaidRounds:merged.reduce((n,row)=>n+row.rounds,0),validationRuns:[...(previous.validationRuns??[{baseSeed:previous.seed,roundsPerMode:previous.roundsPerMode,modes:'initial run'}]),{baseSeed:seed,roundsPerMode:rounds,modes:process.env.SIM_MODE??'all'}],results:merged};
    }
    writeFileSync(out,JSON.stringify(outputReport,null,2)+'\n');
  }
}
if(process.argv[1]?.endsWith('simulate.ts'))main();
