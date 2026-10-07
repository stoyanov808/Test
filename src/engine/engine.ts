import { BONUS_ORDER, CONFIG, PAYING_SYMBOLS, roundPriceCents } from './config';
import { assertMoney, settledPayout } from './accounting';
import { countScatters, evaluateScatterPays } from './evaluator';
import { SeededRandom, defaultRandomFactory } from './rng';
import type { RandomFactory, RandomGenerator } from './rng';
import type { ActiveRound, BonusTier, BonusUpgrade, CascadeStep, CellPosition, Grid, Mode, ModifierEvent, NumberGrid, RoundChoice, Session, SpinPresentation, SymbolId, WildState } from './types';

export const emptyFrames = (): boolean[][] => Array.from({length:CONFIG.reels},()=>Array<boolean>(CONFIG.rows).fill(false));
export const emptyGrid = (): Grid => Array.from({length:CONFIG.reels},()=>Array<SymbolId>(CONFIG.rows).fill('book'));
export const positionGrid = (value=1): NumberGrid => Array.from({length:CONFIG.reels},()=>Array<number>(CONFIG.rows).fill(value));
const copyNumbers=(matrix:NumberGrid):NumberGrid=>matrix.map(column=>column.slice());
const copyGrid=(grid:Grid):Grid=>grid.map(column=>column.slice());
const framesOf=(multipliers:NumberGrid):boolean[][]=>multipliers.map(column=>column.map(value=>value>1));
const largestMultiplier=(multipliers:NumberGrid):number=>Math.max(1,...multipliers.flat());
const key=(position:CellPosition):string=>`${position.reel}:${position.row}`;
const boosted=(value:number,factor:number):number=>Math.min(CONFIG.positionMultiplierLimit,value*factor);
const isPaying=(symbol:SymbolId):boolean=>(PAYING_SYMBOLS as readonly string[]).includes(symbol);
const wildsOf=(grid:Grid,multipliers:NumberGrid,id:string):WildState[]=>grid.flatMap((column,reel)=>column.flatMap((symbol,row)=>symbol==='wild'?[{id:`${id}-${reel}-${row}`,reel,row,multiplier:multipliers[reel][row],steps:0}]:[]));
function clone(session:Session):Session {
  return {...session,activeRound:session.activeRound?{...session.activeRound,choice:{...session.activeRound.choice},frames:session.activeRound.frames.map(column=>column.slice()),wilds:session.activeRound.wilds.map(wild=>({...wild})),positionMultipliers:copyNumbers(session.activeRound.positionMultipliers),upgrades:session.activeRound.upgrades.slice()}:null};
}
function assertIdle(session:Session):void {if(session.activeRound||session.presentation)throw new Error('ROUND_ACTIVE');}
function requireBet(bet:number):void {if(!(CONFIG.betsCents as readonly number[]).includes(bet))throw new Error('INVALID_BET');}
function requireChoice(choice:RoundChoice):void {
  if(!choice||(choice.kind==='mode'?!Object.hasOwn(CONFIG.prices,choice.mode):choice.kind==='buy'?!Object.hasOwn(CONFIG.buyPrices,choice.bonus):choice.kind!=='lucky'&&choice.kind!=='extra'))throw new Error('INVALID_CHOICE');
}
export function createSession(seed=(Date.now()>>>0),balanceCents:number=CONFIG.initialBalanceCents):Session {
  assertMoney(balanceCents);return{version:CONFIG.schemaVersion,phase:'idle',balanceCents,betCents:CONFIG.defaultBetCents,selectedMode:'standard',rngState:new SeededRandom(seed).state,roundSequence:0,activeRound:null,presentation:null,history:[],extraSpinOffer:null};
}
export function selectBet(session:Session,betCents:number):Session {assertIdle(session);requireBet(betCents);return{...session,betCents,extraSpinOffer:null};}
export function setMode(session:Session,mode:Mode):Session {assertIdle(session);requireChoice({kind:'mode',mode});return{...session,selectedMode:mode,extraSpinOffer:null};}
export function refillDemo(session:Session):Session {assertIdle(session);const balanceCents=session.balanceCents+CONFIG.refillCents;assertMoney(balanceCents);return{...session,balanceCents};}

function randomPaying(rng:RandomGenerator):SymbolId {
  const total=CONFIG.symbolWeights.reduce((sum,weight)=>sum+weight,0);
  let draw=rng.next()*total;
  for(let i=0;i<PAYING_SYMBOLS.length;i++){draw-=CONFIG.symbolWeights[i];if(draw<0)return PAYING_SYMBOLS[i];}
  return PAYING_SYMBOLS[PAYING_SYMBOLS.length-1];
}
export function chooseBonusUpgrades(tier:BonusTier,rng:RandomGenerator):BonusUpgrade[] {
  const available:BonusUpgrade[]=['infectious','bomb','shots'];const selected:BonusUpgrade[]=[];
  for(let i=0;i<CONFIG.bonuses[tier].upgradesCount;i++)selected.push(available.splice(rng.integer(available.length),1)[0]);
  return selected;
}
export interface CascadeOptions { tier?:BonusTier|null; upgrades?:BonusUpgrade[]; mode?:Mode; remainingCapCents?:number; noBonus?:boolean }
function newSymbol(rng:RandomGenerator,options:CascadeOptions):SymbolId {
  const tier=options.tier??null;
  const profile=tier?CONFIG.bonuses[tier]:CONFIG.modes[options.mode??'standard'];
  let chance=rng.next();
  if(tier){const shotProbability=CONFIG.bonuses[tier].shotProbability;if(chance<shotProbability)return'shot';chance-=shotProbability;}
  if(chance<profile.wildProbability)return'wild';chance-=profile.wildProbability;
  if(chance<profile.xwaysProbability)return options.upgrades?.includes('infectious')?'infectious':'xways';chance-=profile.xwaysProbability;
  if(chance<profile.bombProbability)return'bomb';
  return randomPaying(rng);
}
function initialSpinGrid(rng:RandomGenerator,options:CascadeOptions):Grid {
  const grid=Array.from({length:CONFIG.reels},()=>Array.from({length:CONFIG.rows},()=>newSymbol(rng,options)));
  if(!options.tier&&!options.noBonus){
    const mode=options.mode??'standard';
    for(let reel=0;reel<CONFIG.reels;reel++)if((mode==='hunt'&&reel===1)||rng.chance(CONFIG.modes[mode].scatterProbability))grid[reel][rng.integer(CONFIG.rows)]='scatter';
  }
  return grid;
}
function refillGrid(grid:Grid,removed:Set<string>,rng:RandomGenerator,options:CascadeOptions):Grid {
  return grid.map((column,reel)=>{
    const remaining=column.filter((_symbol,row)=>!removed.has(`${reel}:${row}`));
    const missing=CONFIG.rows-remaining.length;
    const incoming=Array.from({length:missing},()=>newSymbol(rng,options));
    // Bonus invitations can also arrive during a collapse, but at most one on each reel.
    if(!options.tier&&!options.noBonus&&missing>0&&!remaining.includes('scatter')){
      const mode=options.mode??'standard';
      if(rng.chance(CONFIG.modes[mode].scatterProbability*missing/CONFIG.rows))incoming[rng.integer(missing)]='scatter';
    }
    return[...incoming,...remaining];
  });
}
function modifierSnapshot(kind:ModifierEvent['kind'],source:CellPosition,targets:CellPosition[],factor:number,grid:Grid,multipliers:NumberGrid,extra:Partial<ModifierEvent>={}):ModifierEvent {
  return{kind,source,targets,factor,...extra,gridAfter:copyGrid(grid),positionMultipliersAfter:copyNumbers(multipliers)};
}
export interface CascadeResult { steps:CascadeStep[]; finalGrid:Grid; positionMultipliers:NumberGrid; payoutCents:number; shotsAdded:number; scatters:number; maxWin:boolean }
/** Pure complete cascade math. Position coordinates stay fixed while symbols fall. */
export function resolveCascades(initialGrid:Grid,initialMultipliers:NumberGrid,betCents:number,rng:RandomGenerator,options:CascadeOptions={}):CascadeResult {
  let grid=copyGrid(initialGrid);let multipliers=copyNumbers(initialMultipliers);
  const steps:CascadeStep[]=[];let payoutCents=0;let shotsAdded=0;
  const cap=options.remainingCapCents??betCents*CONFIG.capMultiplier;
  for(let index=0;;index++){
    const step:CascadeStep={index,grid:copyGrid(grid),symbolSizes:positionGrid(),positionMultipliers:copyNumbers(multipliers),resolvedGrid:copyGrid(grid),resolvedSymbolSizes:positionGrid(),resolvedPositionMultipliers:copyNumbers(multipliers),modifiers:[],wins:[],removed:[],positionMultipliersAfter:copyNumbers(multipliers),symbolSizesAfter:positionGrid(),payoutCents:0,shotsAdded:0};
    const removed=new Set<string>();
    // All xWays on a drop reveal the same randomly selected paying symbol.
    const ways:CellPosition[]=[];
    for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='xways'||grid[reel][row]==='infectious')ways.push({reel,row});
    if(ways.length){
      const symbol=randomPaying(rng) as import('./types').PayingSymbol;
      const infectious=ways.map(position=>grid[position.reel][position.row]==='infectious');
      for(let i=0;i<ways.length;i++){
        const source=ways[i];grid[source.reel][source.row]=symbol;const factor=[2,4,8][rng.integer(3)];
        const targets=infectious[i]?grid.flatMap((column,reel)=>column.flatMap((current,row)=>current===symbol?[{reel,row}]:[])):[source];
        for(const target of targets)multipliers[target.reel][target.row]=boosted(multipliers[target.reel][target.row],factor);
        step.modifiers.push(modifierSnapshot(infectious[i]?'infectious':'xways',source,targets,factor,grid,multipliers,{symbol}));
      }
    }
    // Extra Shot tokens are single-use awards: after award they are removed on this drop.
    for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='shot'){
      const source={reel,row};const added=options.tier?(options.upgrades?.includes('shots')?2:1):0;
      step.shotsAdded+=added;shotsAdded+=added;removed.add(key(source));
      step.modifiers.push(modifierSnapshot('shot',source,[source],added,grid,multipliers,{shotsAdded:added}));
    }
    step.resolvedGrid=copyGrid(grid);step.resolvedPositionMultipliers=copyNumbers(multipliers);
    // Shots are not counted as paying symbols; only the distinct Wild substitutes.
    const payingGrid=grid.map(column=>column.map(symbol=>symbol==='shot'?'scatter':symbol));
    const result=evaluateScatterPays(payingGrid,multipliers,betCents);
    step.wins=result.wins;step.payoutCents=settledPayout(result.payoutCents,payoutCents,cap);
    payoutCents+=step.payoutCents;
    if(step.payoutCents<result.payoutCents){let remaining=step.payoutCents;step.wins=step.wins.map(win=>{const paid=Math.min(win.payoutCents,remaining);remaining-=paid;return{...win,payoutCents:paid};});}
    const winPositions=new Set(result.wins.flatMap(win=>win.cells.map(key)));
    for(const positionKey of winPositions){
      const[reel,row]=positionKey.split(':').map(Number);removed.add(positionKey);multipliers[reel][row]=boosted(multipliers[reel][row],2);
    }
    // Wins pay first. Every bomb then clears remaining regular neighbors before the drop.
    const bombs:CellPosition[]=[];
    for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='bomb')bombs.push({reel,row});
    for(const source of bombs){
      const radius=options.upgrades?.includes('bomb')?2:1;const targets:CellPosition[]=[];
      removed.add(key(source));multipliers[source.reel][source.row]=boosted(multipliers[source.reel][source.row],2);
      for(let reel=Math.max(0,source.reel-radius);reel<=Math.min(CONFIG.reels-1,source.reel+radius);reel++)for(let row=Math.max(0,source.row-radius);row<=Math.min(CONFIG.rows-1,source.row+radius);row++){
        const target={reel,row};if(!isPaying(grid[reel][row])||removed.has(key(target)))continue;
        targets.push(target);removed.add(key(target));multipliers[reel][row]=boosted(multipliers[reel][row],2);
      }
      step.modifiers.push(modifierSnapshot('bomb',source,targets,2,grid,multipliers,{radius}));
    }
    step.removed=[...removed].map(positionKey=>{const[reel,row]=positionKey.split(':').map(Number);return{reel,row};});
    step.positionMultipliersAfter=copyNumbers(multipliers);
    if(payoutCents>=cap){steps.push(step);return{steps,finalGrid:copyGrid(grid),positionMultipliers:multipliers,payoutCents,shotsAdded,scatters:countScatters(grid),maxWin:true};}
    if(!removed.size){steps.push(step);return{steps,finalGrid:copyGrid(grid),positionMultipliers:multipliers,payoutCents,shotsAdded,scatters:countScatters(grid),maxWin:false};}
    grid=refillGrid(grid,removed,rng,options);step.refilledGrid=copyGrid(grid);step.refilledSymbolSizes=positionGrid();steps.push(step);
  }
}

function presentation(round:ActiveRound,grid:Grid):SpinPresentation {
  const multipliers=copyNumbers(round.positionMultipliers);
  return{id:`${round.id}:${round.spinIndex}`,kind:'spin',grid:copyGrid(grid),frames:framesOf(multipliers),wilds:wildsOf(grid,multipliers,round.id),wins:[],initialGrid:copyGrid(grid),initialSymbolSizes:positionGrid(),initialPositionMultipliers:copyNumbers(multipliers),symbolSizes:positionGrid(),positionMultipliers:copyNumbers(multipliers),finalGrid:copyGrid(grid),finalSymbolSizes:positionGrid(),finalPositionMultipliers:copyNumbers(multipliers),cascadeSteps:[],upgrades:round.upgrades.slice(),shotsAdded:0,effectiveSymbols:CONFIG.reels*CONFIG.rows,payoutCents:0,roundTotalCents:round.payoutCents,chainTotalCents:round.capOffsetCents+round.payoutCents,capOffsetCents:round.capOffsetCents,scatters:0,energyUsed:largestMultiplier(multipliers),energyAfter:largestMultiplier(multipliers),tier:round.tier,bonusAwarded:null,upgradedTo:null,retrigger:false,maxWin:false,roundComplete:false,intro:false,events:[],roundCostCents:round.costCents,lockedBetCents:round.betCents,choice:round.choice};
}
function finishIfNeeded(session:Session,round:ActiveRound,view:SpinPresentation):void {
  if(round.spinsRemaining>0&&!view.maxWin)return;
  view.roundComplete=true;session.history=[{id:round.id,choice:round.choice,betCents:round.betCents,costCents:round.costCents,payoutCents:round.payoutCents,spins:round.spinIndex,maxWin:view.maxWin,capOffsetCents:round.capOffsetCents,sourceRoundId:round.sourceRoundId,bonusTier:round.tier,bonusUpgrades:round.upgrades.slice(),shotsAwarded:round.shotsAwarded,...(round.extraInitialMultipliers?{extraInitialMultipliers:copyNumbers(round.extraInitialMultipliers)}:{})},...session.history].slice(0,CONFIG.historyLimit);session.activeRound=null;
  if(round.tier)view.events.push('bonus-end');
  if(!round.tier&&!view.maxWin){const costCents=quoteExtraSpinCostCents(round.betCents,round.positionMultipliers);if(costCents<=view.payoutCents)session.extraSpinOffer={betCents:round.betCents,costCents,positionMultipliers:copyNumbers(round.positionMultipliers),sourceRoundId:round.sourceRoundId,alreadyPaidCents:round.capOffsetCents+round.payoutCents};}
}
function processSpin(session:Session,round:ActiveRound,rng:RandomGenerator,base:boolean):void {
  round.spinIndex++;if(!base)round.spinsRemaining--;
  const mode=round.choice.kind==='mode'?round.choice.mode:'standard';
  const options:CascadeOptions={mode,tier:base?null:round.tier,upgrades:round.upgrades,remainingCapCents:round.capCents-round.capOffsetCents-round.payoutCents,noBonus:round.choice.kind==='extra'};
  const grid=initialSpinGrid(rng,options);const view=presentation(round,grid);
  view.intro=!base&&round.spinIndex===(round.choice.kind==='mode'?2:1);
  const result=resolveCascades(grid,round.positionMultipliers,round.betCents,rng,options);
  round.positionMultipliers=copyNumbers(result.positionMultipliers);round.frames=framesOf(round.positionMultipliers);round.energy=largestMultiplier(round.positionMultipliers);
  round.wilds=[];round.shotsAwarded+=result.shotsAdded;round.spinsRemaining+=result.shotsAdded;
  view.cascadeSteps=result.steps;view.wins=result.steps.flatMap(step=>step.wins);view.finalGrid=result.finalGrid;view.finalPositionMultipliers=copyNumbers(result.positionMultipliers);
  view.shotsAdded=result.shotsAdded;view.retrigger=result.shotsAdded>0;view.scatters=result.scatters;view.energyAfter=round.energy;
  view.payoutCents=result.payoutCents;round.payoutCents+=result.payoutCents;session.balanceCents+=result.payoutCents;assertMoney(session.balanceCents);view.roundTotalCents=round.payoutCents;view.chainTotalCents=round.capOffsetCents+round.payoutCents;
  view.maxWin=result.maxWin;if(result.maxWin){round.spinsRemaining=0;view.events.push('maximum-win');}
  if(result.shotsAdded)view.events.push('extra-shot');
  if(result.steps.some(step=>step.modifiers.some(modifier=>modifier.kind==='xways'||modifier.kind==='infectious')))view.events.push('xways');
  if(result.steps.some(step=>step.modifiers.some(modifier=>modifier.kind==='bomb')))view.events.push('bomb');
  if(view.payoutCents>0)view.events.push('win');
  if(base&&!view.maxWin&&result.scatters>=3){
    round.tier=BONUS_ORDER[Math.min(2,result.scatters-3)];round.spinsRemaining=CONFIG.bonuses[round.tier].spins;round.upgrades=chooseBonusUpgrades(round.tier,rng);
    view.bonusAwarded=round.tier;view.upgrades=round.upgrades.slice();view.events.push('bonus-trigger');
  }
  finishIfNeeded(session,round,view);session.presentation=view;session.phase=view.roundComplete?'presenting-complete':base?'presenting-base':'presenting-bonus';
}
/** One atomic paid outcome: debit and all cascades settle before presentation begins. */
export function quoteExtraSpinCostCents(betCents:number,multipliers:NumberGrid):number {
  assertMoney(betCents);const sum=multipliers.flat().reduce((total,value)=>total+(value>1?value:0),0);const cost=Math.ceil(betCents*Math.max(1,sum/CONFIG.extraQuoteDenominator));assertMoney(cost);return cost;
}
export function startRound(session:Session,choice:RoundChoice={kind:'mode',mode:session.selectedMode},randomFactory:RandomFactory=defaultRandomFactory):Session {
  assertIdle(session);requireChoice(choice);requireBet(session.betCents);
  const offer=choice.kind==='extra'?session.extraSpinOffer:null;if(choice.kind==='extra'&&!offer)throw new Error('NO_EXTRA_SPIN_OFFER');
  const betCents=offer?.betCents??session.betCents;const cost=roundPriceCents(betCents,choice,offer?.costCents);
  if(session.balanceCents<cost)throw new Error('INSUFFICIENT_BALANCE');
  const next=clone(session);next.extraSpinOffer=null;const rng=randomFactory(session.rngState);next.roundSequence++;
  let tier:BonusTier|null=choice.kind==='buy'?choice.bonus:null;
  if(choice.kind==='lucky'){const draw=rng.next();tier=draw<.5?'dorm':draw<.75?'friday':'december';}
  const initialMultiplier=choice.kind==='mode'?CONFIG.initialPositionMultipliers[choice.mode]:1;
  const round:ActiveRound={capOffsetCents:offer?.alreadyPaidCents??0,sourceRoundId:offer?.sourceRoundId??`round-${next.roundSequence}`,id:`round-${next.roundSequence}`,choice:{...choice},betCents,costCents:cost,payoutCents:0,capCents:betCents*CONFIG.capMultiplier,tier,spinsRemaining:tier?CONFIG.bonuses[tier].spins:0,energy:initialMultiplier,frames:emptyFrames(),wilds:[],retriggers:0,spinIndex:0,configVersion:CONFIG.version,positionMultipliers:offer?copyNumbers(offer.positionMultipliers):positionGrid(initialMultiplier),...(offer?{extraInitialMultipliers:copyNumbers(offer.positionMultipliers)}:{}),upgrades:tier?chooseBonusUpgrades(tier,rng):[],shotsAwarded:0};
  round.frames=framesOf(round.positionMultipliers);next.balanceCents-=cost;next.activeRound=round;
  processSpin(next,round,rng,!tier);next.rngState=rng.state;return next;
}
/** Acknowledging animation never changes money and never consumes randomness. */
export function declineExtraSpin(session:Session):Session {assertIdle(session);return{...session,extraSpinOffer:null};}
export function dismissPresentation(session:Session):Session {return session.presentation?{...session,presentation:null,phase:session.activeRound?'bonus-pending':'idle'}:session;}
/** Each free spin, all modifiers and all cascades are settled atomically with no debit. */
export function advanceRound(session:Session,randomFactory:RandomFactory=defaultRandomFactory):Session {
  if(session.presentation)throw new Error('PRESENTATION_PENDING');if(!session.activeRound)throw new Error('NO_ACTIVE_ROUND');if(session.activeRound.configVersion!==CONFIG.version)throw new Error('CONFIG_VERSION_MISMATCH');
  const next=clone(session);const rng=randomFactory(next.rngState);processSpin(next,next.activeRound!,rng,false);next.rngState=rng.state;return next;
}
export function playCompleteRound(session:Session,choice:RoundChoice):Session {
  let current=startRound(session,choice);
  for(;;){current=dismissPresentation(current);if(!current.activeRound)return current;current=advanceRound(current);}
}
