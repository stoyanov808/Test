import { BONUS_ORDER, CONFIG, PAYING_SYMBOLS, roundPriceCents } from './config';
import { assertMoney, settledPayout } from './accounting';
import { countScatters, evaluateWays } from './evaluator';
import { SeededRandom, defaultRandomFactory } from './rng';
import type { RandomFactory, RandomGenerator } from './rng';
import type { ActiveRound, BonusTier, Grid, Mode, RoundChoice, Session, SpinPresentation, WildState } from './types';

export const emptyFrames = (): boolean[][] => Array.from({length:CONFIG.reels},()=>Array<boolean>(CONFIG.rows).fill(false));
export const emptyGrid = (): Grid => Array.from({length:CONFIG.reels},()=>Array(CONFIG.rows).fill('book'));
const copyFrames = (frames:boolean[][]): boolean[][] => frames.map(reel=>reel.slice());
function clone(session: Session): Session {
  return {...session, activeRound: session.activeRound ? {...session.activeRound, frames:copyFrames(session.activeRound.frames),wilds:session.activeRound.wilds.map(w=>({...w}))} : null};
}
function assertIdle(session: Session): void { if (session.activeRound || session.presentation) throw new Error('ROUND_ACTIVE'); }
function requireBet(bet: number): void { if (!(CONFIG.betsCents as readonly number[]).includes(bet)) throw new Error('INVALID_BET'); }
function requireChoice(choice:RoundChoice): void {
  if (!choice || (choice.kind==='mode' ? !Object.hasOwn(CONFIG.prices,choice.mode) : choice.kind!=='buy' || !Object.hasOwn(CONFIG.buyPrices,choice.bonus))) throw new Error('INVALID_CHOICE');
}

export function createSession(seed = (Date.now() >>> 0), balanceCents: number = CONFIG.initialBalanceCents): Session {
  assertMoney(balanceCents);
  return {version:CONFIG.schemaVersion,phase:'idle',balanceCents,betCents:CONFIG.defaultBetCents,selectedMode:'standard',rngState:new SeededRandom(seed).state,roundSequence:0,activeRound:null,presentation:null,history:[]};
}
export function selectBet(session:Session, betCents:number):Session { assertIdle(session); requireBet(betCents); return {...session,betCents}; }
export function setMode(session:Session, mode:Mode):Session { assertIdle(session); requireChoice({kind:'mode',mode}); return {...session,selectedMode:mode}; }
export function refillDemo(session:Session):Session { assertIdle(session); const balanceCents=session.balanceCents+CONFIG.refillCents; assertMoney(balanceCents); return {...session,balanceCents}; }

function addFrames(frames:boolean[][], rng:RandomGenerator, count:number): void {
  const available:{reel:number;row:number}[]=[];
  for (let reel=0;reel<CONFIG.reels;reel++) for (let row=0;row<CONFIG.rows;row++) if (!frames[reel][row]) available.push({reel,row});
  for (let i=0;i<count&&available.length;i++) { const index=rng.integer(available.length); const cell=available.splice(index,1)[0]; frames[cell.reel][cell.row]=true; }
}
function ensureBonusMechanics(round:ActiveRound, rng:RandomGenerator): void {
  if (!round.tier) return;
  if (round.tier==='december') round.frames=round.frames.map(reel=>reel.map(()=>true));
  const count=CONFIG.bonuses[round.tier].wildCount;
  while (round.wilds.length<count) {
    const available=Array.from({length:CONFIG.reels},(_,i)=>i).filter(reel=>!round.wilds.some(w=>w.reel===reel));
    round.wilds.push({id:`${round.id}-wild-${round.wilds.length+1}`,reel:available[rng.integer(available.length)],multiplier:1,steps:0});
  }
}
function moveWilds(wilds:WildState[], rng:RandomGenerator):WildState[] {
  const available=Array.from({length:CONFIG.reels},(_,i)=>i);
  return wilds.map(wild=>{
    const reel=available.splice(rng.integer(available.length),1)[0];
    const steps=Math.min(1+rng.integer(CONFIG.maxNudgeSteps),CONFIG.wildMultiplierLimit-wild.multiplier);
    return {...wild,reel,steps,multiplier:Math.min(CONFIG.wildMultiplierLimit,wild.multiplier+steps)};
  });
}
function generateGrid(rng:RandomGenerator, blend:number, focusWeight:number, scatterProbability:number, wilds:WildState[], hunt:boolean):Grid {
  const grid:Grid=[];
  for (let reel=0;reel<CONFIG.reels;reel++) {
    const column:Grid[number]=[];
    for (let row=0;row<CONFIG.rows;row++) {
      const focused=focusWeight>0&&rng.chance(focusWeight);
      column.push(focused?'couple':rng.chance(blend)?PAYING_SYMBOLS[rng.integer(PAYING_SYMBOLS.length)]:CONFIG.homeSymbols[reel]);
    }
    if (wilds.some(wild=>wild.reel===reel)) column.fill('wild');
    else if ((hunt && reel===0) || rng.chance(scatterProbability)) column[rng.integer(CONFIG.rows)]='scatter';
    grid.push(column);
  }
  return grid;
}
function presentation(round:ActiveRound):SpinPresentation {
  return {id:`${round.id}:${round.spinIndex}`,kind:'spin',grid:emptyGrid(),frames:copyFrames(round.frames),wilds:[],wins:[],payoutCents:0,roundTotalCents:round.payoutCents,scatters:0,energyUsed:round.tier?round.energy:1,energyAfter:round.tier?round.energy:1,tier:round.tier,bonusAwarded:null,upgradedTo:null,retrigger:false,maxWin:false,roundComplete:false,intro:false,events:[],roundCostCents:round.costCents,lockedBetCents:round.betCents,choice:round.choice};
}
function settle(session:Session, round:ActiveRound, view:SpinPresentation, requested:number):void {
  view.payoutCents=settledPayout(requested,round.payoutCents,round.capCents);
  round.payoutCents+=view.payoutCents; session.balanceCents+=view.payoutCents;
  assertMoney(session.balanceCents); view.roundTotalCents=round.payoutCents;
  if (round.payoutCents===round.capCents) {view.maxWin=true;round.spinsRemaining=0;view.events.push('maximum-win');}
}
function finishIfNeeded(session:Session, round:ActiveRound, view:SpinPresentation):void {
  if (round.spinsRemaining>0 && !view.maxWin) return;
  view.roundComplete=true;
  session.history=[{id:round.id,choice:round.choice,betCents:round.betCents,costCents:round.costCents,payoutCents:round.payoutCents,spins:round.spinIndex,maxWin:view.maxWin},...session.history].slice(0,CONFIG.historyLimit);
  session.activeRound=null;
  if (round.tier) view.events.push('bonus-end');
}
function processVip(session:Session, round:ActiveRound, rng:RandomGenerator):void {
  round.spinIndex++; const view=presentation(round);view.kind='vip';
  const locked=Array<boolean>(CONFIG.god.positions).fill(false); const attempts:boolean[][]=[];
  for (let opportunity=0;opportunity<CONFIG.god.attempts;opportunity++) {
    attempts.push(locked.map((already,index)=>{
      const reveal=!already&&rng.chance(CONFIG.god.opportunityProbability);
      if (reveal) locked[index]=true;
      return reveal;
    }));
  }
  view.vipAttempts=attempts;view.vipLocked=locked;view.grid=view.grid.map((column,reel)=>column.map((symbol,row)=>locked[reel]&&row===1?'vip':symbol));
  settle(session,round,view,locked.every(Boolean)?round.capCents:0);
  view.events.push(locked.every(Boolean)?'vip-complete':'vip-incomplete');
  finishIfNeeded(session,round,view);session.presentation=view;session.phase='presenting-vip';
}
function processSpin(session:Session, round:ActiveRound, rng:RandomGenerator, base:boolean):void {
  round.spinIndex++;const tierAtStart=round.tier;const view=presentation(round);
  view.intro=!base&&round.choice.kind==='mode'&&round.spinIndex===2;
  if (!base) round.spinsRemaining--;
  if (base && round.choice.kind==='mode' && round.choice.mode==='standard' && rng.chance(CONFIG.standardVipProbability)) {
    view.grid=view.grid.map(column=>column.map((symbol,row)=>row===1?'vip':symbol));
    settle(session,round,view,round.capCents);finishIfNeeded(session,round,view);session.presentation=view;session.phase='presenting-complete';return;
  }
  const mode=round.choice.kind==='mode'?round.choice.mode:'standard';
  const profile=base?CONFIG.modes[mode]:CONFIG.bonuses[round.tier!];
  if (base) {
    if (mode==='frames') round.frames=round.frames.map(column=>column.map(()=>true));
    else if (rng.chance(CONFIG.baseFrameProbability)) addFrames(round.frames,rng,CONFIG.framesAddedPerSpin);
    const needsWild=mode==='wild'||(mode!=='hunt'&&rng.chance(CONFIG.baseWildProbability));
    if (needsWild) round.wilds=[{id:`${round.id}-wild-1`,reel:rng.integer(CONFIG.reels),multiplier:1,steps:0}];
  } else {
    ensureBonusMechanics(round,rng);
    addFrames(round.frames,rng,CONFIG.framesAddedPerSpin);
  }
  round.wilds=moveWilds(round.wilds,rng);
  view.grid=generateGrid(rng,profile.blend,profile.focusWeight,profile.scatterProbability,round.wilds,base&&mode==='hunt');
  view.frames=copyFrames(round.frames);view.wilds=round.wilds.map(w=>({...w}));
  view.scatters=countScatters(view.grid);
  const result=evaluateWays(view.grid,view.frames,view.wilds,round.betCents,view.energyUsed);
  view.wins=result.wins;settle(session,round,view,result.payoutCents);
  if (tierAtStart && view.payoutCents>0) round.energy=Math.min(CONFIG.partyLimit,round.energy+1);
  if (!view.maxWin) {
    if (base && view.scatters>=3) {
      round.tier=BONUS_ORDER[Math.min(2,view.scatters-3)];
      const bonus=CONFIG.bonuses[round.tier];round.spinsRemaining=bonus.spins;round.energy=bonus.energy;
      // A triggering base Wild is not an extra persistent Wild above the selected tier.
      round.wilds=[];ensureBonusMechanics(round,rng);view.bonusAwarded=round.tier;view.events.push('bonus-trigger');
    } else if (!base && view.scatters>=2) {
      if (round.retriggers<CONFIG.retriggerLimit) {
        round.retriggers++;round.spinsRemaining+=CONFIG.retriggerSpins;view.retrigger=true;view.events.push('retrigger');
        const index=BONUS_ORDER.indexOf(round.tier!);
        if (index<BONUS_ORDER.length-1) {round.tier=BONUS_ORDER[index+1];view.upgradedTo=round.tier;view.events.push('upgrade');ensureBonusMechanics(round,rng);}
      } else view.events.push('retrigger-limit');
    }
  }
  view.energyAfter=round.energy;
  if (view.payoutCents>0) view.events.push('win');
  finishIfNeeded(session,round,view);session.presentation=view;session.phase=view.roundComplete?'presenting-complete':base?'presenting-base':'presenting-bonus';
}

/** A full outcome, its debit and its settlement are produced together, before animation. */
export function startRound(session:Session, choice:RoundChoice={kind:'mode',mode:session.selectedMode}, randomFactory:RandomFactory=defaultRandomFactory):Session {
  assertIdle(session);requireChoice(choice);requireBet(session.betCents);
  const cost=roundPriceCents(session.betCents,choice);
  if (session.balanceCents<cost) throw new Error('INSUFFICIENT_BALANCE');
  const next=clone(session);const rng=randomFactory(session.rngState);next.roundSequence++;
  const tier=choice.kind==='buy'?choice.bonus:null;
  const round:ActiveRound={id:`round-${next.roundSequence}`,choice:{...choice},betCents:session.betCents,costCents:cost,payoutCents:0,capCents:session.betCents*CONFIG.capMultiplier,tier,spinsRemaining:tier?CONFIG.bonuses[tier].spins:0,energy:tier?CONFIG.bonuses[tier].energy:1,frames:emptyFrames(),wilds:[],retriggers:0,spinIndex:0,configVersion:CONFIG.version};
  next.balanceCents-=cost;next.activeRound=round;
  if (choice.kind==='mode'&&choice.mode==='god') processVip(next,round,rng);
  else {if(tier)ensureBonusMechanics(round,rng);processSpin(next,round,rng,!tier);if(tier&&next.presentation)next.presentation.intro=true;}
  next.rngState=rng.state;return next;
}
/** Presentation acknowledgement never changes money or consumes randomness. */
export function dismissPresentation(session:Session):Session {return session.presentation?{...session,presentation:null,phase:session.activeRound?'bonus-pending':'idle'}:session;}
/** Generate exactly one pending free spin. No additional paid-round debit. */
export function advanceRound(session:Session, randomFactory:RandomFactory=defaultRandomFactory):Session {
  if (session.presentation) throw new Error('PRESENTATION_PENDING');
  if (!session.activeRound) throw new Error('NO_ACTIVE_ROUND');
  if (session.activeRound.configVersion!==CONFIG.version) throw new Error('CONFIG_VERSION_MISMATCH');
  const next=clone(session);const rng=randomFactory(next.rngState);
  processSpin(next,next.activeRound!,rng,false);next.rngState=rng.state;return next;
}
/** Convenience for simulations: same production transitions, no visual timing. */
export function playCompleteRound(session:Session,choice:RoundChoice):Session {
  let current=startRound(session,choice);
  for (;;) {current=dismissPresentation(current);if(!current.activeRound)return current;current=advanceRound(current);}
}
