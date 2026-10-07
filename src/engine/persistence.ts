import { BONUS_ORDER, CONFIG, PAYING_SYMBOLS, roundPriceCents } from './config';
import { assertMoney, settledPayout } from './accounting';
import { countScatters, evaluateScatterPays } from './evaluator';
import { createSession, quoteExtraSpinCostCents } from './engine';
import type { CascadeStep, CellPosition, Grid, ModifierEvent, NumberGrid, RoundChoice, Session, SpinPresentation, StorageLike } from './types';

/** Different mathematics gets a different key; old balances and pending rounds stay untouched. */
export const STORAGE_KEY='studentski-grad-session-v5';
export const PREVIOUS_STORAGE_KEY='studentski-grad-session-v4';
export const PREVIOUS_V3_STORAGE_KEY='studentski-grad-session-v3';
export const PREVIOUS_V2_STORAGE_KEY='studentski-grad-session-v2';
export const LEGACY_STORAGE_KEY='studentski-grad-session-v1';
const browserStorage=():StorageLike=>globalThis.localStorage;
const symbols=new Set<string>([...PAYING_SYMBOLS,'wild','scatter','xways','infectious','bomb','shot']);
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
const maximum=(matrix:NumberGrid):number=>Math.max(1,...matrix.flat());
const cellKey=(cell:CellPosition):string=>`${cell.reel}:${cell.row}`;
const boost=(value:number,factor:number):number=>Math.min(CONFIG.positionMultiplierLimit,value*factor);
const isPaying=(symbol:string):boolean=>(PAYING_SYMBOLS as readonly string[]).includes(symbol);
const isMoney=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const isId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
function fail():never {throw new Error('INVALID_SAVE');}
function validChoice(choice:RoundChoice):boolean {return!!choice&&(choice.kind==='mode'?Object.hasOwn(CONFIG.prices,choice.mode):choice.kind==='buy'?Object.hasOwn(CONFIG.buyPrices,choice.bonus):choice.kind==='lucky'||choice.kind==='extra');}
function matrix(value:unknown,test:(cell:unknown)=>boolean):boolean {return Array.isArray(value)&&value.length===CONFIG.reels&&value.every(column=>Array.isArray(column)&&column.length===CONFIG.rows&&column.every(test));}
function validNumbers(value:unknown):value is NumberGrid {return matrix(value,cell=>typeof cell==='number'&&Number.isInteger(cell)&&cell>=1&&cell<=CONFIG.positionMultiplierLimit&&(cell&(cell-1))===0);}
function validSizes(value:unknown):boolean {return matrix(value,cell=>cell===1);}
function validFrames(value:unknown):boolean {return matrix(value,cell=>typeof cell==='boolean');}
function validGrid(value:unknown):value is Grid {return matrix(value,cell=>typeof cell==='string'&&symbols.has(cell));}
function validPosition(cell:CellPosition):boolean {return!!cell&&Number.isInteger(cell.reel)&&cell.reel>=0&&cell.reel<CONFIG.reels&&Number.isInteger(cell.row)&&cell.row>=0&&cell.row<CONFIG.rows;}
function validPositions(value:unknown):value is CellPosition[] {return Array.isArray(value)&&value.length<=CONFIG.reels*CONFIG.rows&&value.every(validPosition)&&new Set(value.map(cell=>`${cell.reel}:${cell.row}`)).size===value.length;}
function validTier(value:unknown):boolean {return value===null||(typeof value==='string'&&Object.hasOwn(CONFIG.bonuses,value));}
function validUpgrades(value:unknown):boolean {return Array.isArray(value)&&value.length<=3&&value.every(upgrade=>['infectious','bomb','shots'].includes(upgrade))&&new Set(value).size===value.length;}
function validWilds(value:unknown):boolean {
  return Array.isArray(value)&&value.length<=CONFIG.reels*CONFIG.rows&&value.every(wild=>wild&&isId(wild.id)&&validPosition(wild)&&Number.isInteger(wild.multiplier)&&wild.multiplier>=1&&wild.multiplier<=CONFIG.positionMultiplierLimit&&wild.steps===0)&&new Set(value.map(wild=>`${wild.reel}:${wild.row}`)).size===value.length;
}
function validWin(value:unknown):boolean {
  if(!value||typeof value!=='object')return false;const win=value as SpinPresentation['wins'][number];
  return(PAYING_SYMBOLS as readonly string[]).includes(win.symbol)&&Number.isInteger(win.count)&&win.count>=CONFIG.minimumPayCount&&win.count<=CONFIG.reels*CONFIG.rows&&validPositions(win.cells)&&win.cells.length===win.count&&isMoney(win.payoutCents)&&Number.isFinite(win.payMultiplier)&&win.payMultiplier>0&&Number.isSafeInteger(win.positionMultiplier)&&win.positionMultiplier>=1&&win.positionMultiplier<=CONFIG.reels*CONFIG.rows*CONFIG.positionMultiplierLimit&&Number.isInteger(win.reels)&&win.reels>=1&&win.reels<=CONFIG.reels&&win.weightedWays===win.positionMultiplier;
}
/** Verify every persisted modifier against the board it actually saw, before it can resume. */
function validateCascadeStep(step:CascadeStep,view:SpinPresentation,paidBefore:number):void {
  const grid=step.grid.map(column=>column.slice());
  const multipliers=step.positionMultipliers.map(column=>column.slice());
  const removed=new Set<string>();
  const upgrades=view.tier?view.upgrades:[];
  let modifierIndex=0,shots=0;
  function modifier(kind:ModifierEvent['kind'],source:CellPosition,targets:CellPosition[],factor:number,extra:Partial<ModifierEvent>={}):void {
    const actual=step.modifiers[modifierIndex++];
    if(!actual||actual.kind!==kind||!same(actual.source,source)||!same(actual.targets,targets)||actual.factor!==factor||!same(actual.gridAfter,grid)||!same(actual.positionMultipliersAfter,multipliers))fail();
    if((kind==='xways'||kind==='infectious')&&actual.symbol!==extra.symbol)fail();
    if(kind==='bomb'&&actual.radius!==extra.radius)fail();
    if(kind==='shot'&&actual.shotsAdded!==extra.shotsAdded)fail();
  }
  const ways:CellPosition[]=[];
  for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='xways'||grid[reel][row]==='infectious')ways.push({reel,row});
  let revealedSymbol:string|undefined;
  for(const source of ways){
    const actual=step.modifiers[modifierIndex];
    if(!actual||![2,4,8].includes(actual.factor)||!isPaying(actual.symbol??''))fail();
    if(revealedSymbol!==undefined&&actual.symbol!==revealedSymbol)fail();
    revealedSymbol=actual.symbol;
    const kind=grid[source.reel][source.row]==='infectious'?'infectious':'xways';
    grid[source.reel][source.row]=actual.symbol!;
    // Future badges remain unrevealed. A later reveal may compound an earlier source.
    const matches=grid.flatMap((column,reel)=>column.flatMap((symbol,row)=>symbol===revealedSymbol?[{reel,row}]:[]));
    let targets:CellPosition[];
    if(kind==='infectious')targets=matches;
    else targets=[source];
    for(const target of targets)multipliers[target.reel][target.row]=boost(multipliers[target.reel][target.row],actual.factor);
    modifier(kind,source,targets,actual.factor,{symbol:actual.symbol});
  }
  for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='shot'){
    const source={reel,row};
    if(!view.tier)fail();
    const award=upgrades.includes('shots')?2:1;
    shots+=award;removed.add(cellKey(source));modifier('shot',source,[source],award,{shotsAdded:award});
  }
  if(!same(step.resolvedGrid,grid)||!same(step.resolvedPositionMultipliers,multipliers))fail();
  const evaluated=evaluateScatterPays(grid,multipliers,view.lockedBetCents);
  const expectedPaid=settledPayout(evaluated.payoutCents,paidBefore,view.lockedBetCents*CONFIG.capMultiplier);
  let unallocated=expectedPaid;
  const expectedWins=evaluated.wins.map(win=>{const paid=Math.min(win.payoutCents,unallocated);unallocated-=paid;return{...win,payoutCents:paid};});
  if(step.payoutCents!==expectedPaid||!same(step.wins,expectedWins))fail();
  for(const win of evaluated.wins)for(const cell of win.cells){
    if(removed.has(cellKey(cell)))continue;
    removed.add(cellKey(cell));multipliers[cell.reel][cell.row]=boost(multipliers[cell.reel][cell.row],2);
  }
  for(let reel=0;reel<CONFIG.reels;reel++)for(let row=0;row<CONFIG.rows;row++)if(grid[reel][row]==='bomb'){
    const source={reel,row};const radius=upgrades.includes('bomb')?2:1;const targets:CellPosition[]=[];
    removed.add(cellKey(source));multipliers[reel][row]=boost(multipliers[reel][row],2);
    for(let targetReel=Math.max(0,reel-radius);targetReel<=Math.min(CONFIG.reels-1,reel+radius);targetReel++)for(let targetRow=Math.max(0,row-radius);targetRow<=Math.min(CONFIG.rows-1,row+radius);targetRow++){
      const target={reel:targetReel,row:targetRow};
      if(!isPaying(grid[targetReel][targetRow])||removed.has(cellKey(target)))continue;
      targets.push(target);removed.add(cellKey(target));multipliers[targetReel][targetRow]=boost(multipliers[targetReel][targetRow],2);
    }
    modifier('bomb',source,targets,2,{radius});
  }
  const expectedRemoved=[...removed].map(positionKey=>{const[reel,row]=positionKey.split(':').map(Number);return{reel,row};});
  if(modifierIndex!==step.modifiers.length||shots!==step.shotsAdded||!same(step.removed,expectedRemoved)||!same(step.positionMultipliersAfter,multipliers))fail();
  if(step.refilledGrid){
    if(!removed.size||!step.refilledSymbolSizes)fail();
    for(let reel=0;reel<CONFIG.reels;reel++){
      const survivors=grid[reel].filter((_symbol,row)=>!removed.has(`${reel}:${row}`));
      const vacancies=CONFIG.rows-survivors.length;
      if(!same(step.refilledGrid[reel].slice(vacancies),survivors))fail();
    }
  }else if(step.refilledSymbolSizes)fail();
}
function validatePresentation(view:SpinPresentation):void {
  if(!view||!isId(view.id)||!validChoice(view.choice)||view.kind!=='spin'||!validGrid(view.grid)||!validGrid(view.initialGrid)||!validGrid(view.finalGrid)||!validNumbers(view.positionMultipliers)||!validNumbers(view.initialPositionMultipliers)||!validNumbers(view.finalPositionMultipliers)||!validSizes(view.symbolSizes)||!validSizes(view.initialSymbolSizes)||!validSizes(view.finalSymbolSizes)||!validFrames(view.frames)||!validWilds(view.wilds)||!validUpgrades(view.upgrades)||!Array.isArray(view.wins)||!view.wins.every(validWin)||!Array.isArray(view.cascadeSteps)||view.cascadeSteps.length<1||!Array.isArray(view.events)||!view.events.every(event=>typeof event==='string')||!validTier(view.tier)||!validTier(view.bonusAwarded)||view.upgradedTo!==null)fail();
  [view.payoutCents,view.roundTotalCents,view.roundCostCents,view.lockedBetCents,view.shotsAdded,view.chainTotalCents,view.capOffsetCents].forEach(assertMoney);
  for(const field of ['roundComplete','maxWin','intro','retrigger'] as const)if(typeof view[field]!=='boolean')fail();
  const cap=view.lockedBetCents*CONFIG.capMultiplier;
  if(!(CONFIG.betsCents as readonly number[]).includes(view.lockedBetCents)||view.roundCostCents!==roundPriceCents(view.lockedBetCents,view.choice,view.choice.kind==='extra'?quoteExtraSpinCostCents(view.lockedBetCents,view.initialPositionMultipliers):undefined)||view.chainTotalCents!==view.roundTotalCents+view.capOffsetCents||view.chainTotalCents>cap||view.payoutCents>view.roundTotalCents||!same(view.grid,view.initialGrid)||!same(view.positionMultipliers,view.initialPositionMultipliers)||!same(view.frames,view.initialPositionMultipliers.map(column=>column.map(value=>value>1)))||view.energyUsed!==maximum(view.initialPositionMultipliers)||view.energyAfter!==maximum(view.finalPositionMultipliers)||view.effectiveSymbols!==CONFIG.reels*CONFIG.rows||!Number.isInteger(view.scatters)||view.scatters!==countScatters(view.finalGrid)||view.retrigger!==(view.shotsAdded>0)||view.maxWin!==(view.chainTotalCents===cap)||(view.maxWin&&!view.roundComplete))fail();
  for(const wild of view.wilds)if(view.initialGrid[wild.reel][wild.row!]!=='wild'||wild.multiplier!==view.initialPositionMultipliers[wild.reel][wild.row!])fail();
  if(view.wilds.length!==view.initialGrid.flat().filter(symbol=>symbol==='wild').length)fail();
  const tier=view.tier??view.bonusAwarded;
  if(view.upgrades.length!==(tier?CONFIG.bonuses[tier].upgradesCount:0))fail();
  if(view.choice.kind==='extra'){
    if(view.tier!==null||view.bonusAwarded!==null||view.capOffsetCents<1)fail();
  }else if(view.capOffsetCents!==0)fail();
  if(view.tier){
    if(view.bonusAwarded!==null||(view.choice.kind==='buy'&&view.choice.bonus!==view.tier)||view.choice.kind==='extra')fail();
  }else{
    if(view.choice.kind!=='mode'&&view.choice.kind!=='extra')fail();
    const expectedTier=view.choice.kind==='mode'&&!view.maxWin&&view.scatters>=3?BONUS_ORDER[Math.min(2,view.scatters-3)]:null;
    if(view.bonusAwarded!==expectedTier||view.intro)fail();
  }
  let total=0,shots=0;const flattened:SpinPresentation['wins']=[];
  for(let index=0;index<view.cascadeSteps.length;index++){
    const step=view.cascadeSteps[index];
    if(!step||step.index!==index||!validGrid(step.grid)||!validGrid(step.resolvedGrid)||!validNumbers(step.positionMultipliers)||!validNumbers(step.resolvedPositionMultipliers)||!validNumbers(step.positionMultipliersAfter)||!validSizes(step.symbolSizes)||!validSizes(step.resolvedSymbolSizes)||!validSizes(step.symbolSizesAfter)||(step.refilledGrid&&!validGrid(step.refilledGrid))||(step.refilledSymbolSizes&&!validSizes(step.refilledSymbolSizes))||!Array.isArray(step.wins)||!step.wins.every(validWin)||!validPositions(step.removed)||!Array.isArray(step.modifiers)||!isMoney(step.payoutCents)||!isMoney(step.shotsAdded))fail();
    if(!same(step.grid,index===0?view.initialGrid:view.cascadeSteps[index-1].refilledGrid)||!same(step.positionMultipliers,index===0?view.initialPositionMultipliers:view.cascadeSteps[index-1].positionMultipliersAfter))fail();
    for(const modifier of step.modifiers){
      if(!modifier||!['xways','infectious','bomb','shot'].includes(modifier.kind)||!validPosition(modifier.source)||!validPositions(modifier.targets)||!Number.isInteger(modifier.factor)||modifier.factor<0||modifier.factor>8||!validGrid(modifier.gridAfter)||!validNumbers(modifier.positionMultipliersAfter))fail();
      if((modifier.kind==='xways'||modifier.kind==='infectious')&&(![2,4,8].includes(modifier.factor)||!(PAYING_SYMBOLS as readonly string[]).includes(modifier.symbol??'')))fail();
      if(modifier.kind==='bomb'&&(modifier.factor!==2||![1,2].includes(modifier.radius??0)))fail();
      if(modifier.kind==='shot'&&(!isMoney(modifier.shotsAdded)||modifier.shotsAdded!==modifier.factor))fail();
    }
    validateCascadeStep(step,view,view.chainTotalCents-view.payoutCents+total);
    for(const board of [step.grid,step.resolvedGrid,step.refilledGrid])if(board){
      const infectious=view.tier&&view.upgrades.includes('infectious');
      if(infectious&&board.some(column=>column.includes('xways')))fail();
      if(view.tier||view.choice.kind==='extra'){
        if(board.some(column=>column.includes('scatter')))fail();
      }else if(board.some(column=>column.filter(symbol=>symbol==='scatter').length>1||column.includes('shot')))fail();
    }
    if(index<view.cascadeSteps.length-1&&!step.refilledGrid)fail();
    total+=step.payoutCents;shots+=step.shotsAdded;flattened.push(...step.wins);
  }
  const last=view.cascadeSteps[view.cascadeSteps.length-1];
  if(total!==view.payoutCents||shots!==view.shotsAdded||!same(flattened,view.wins)||!same(last.resolvedGrid,view.finalGrid)||!same(last.positionMultipliersAfter,view.finalPositionMultipliers)||last.refilledGrid||(!view.maxWin&&last.removed.length!==0))fail();
  const expectedEvents:string[]=[];
  if(view.maxWin)expectedEvents.push('maximum-win');
  if(view.shotsAdded)expectedEvents.push('extra-shot');
  if(view.cascadeSteps.some(step=>step.modifiers.some(modifier=>modifier.kind==='xways'||modifier.kind==='infectious')))expectedEvents.push('xways');
  if(view.cascadeSteps.some(step=>step.modifiers.some(modifier=>modifier.kind==='bomb')))expectedEvents.push('bomb');
  if(view.payoutCents>0)expectedEvents.push('win');
  if(view.bonusAwarded)expectedEvents.push('bonus-trigger');
  if(view.tier&&view.roundComplete)expectedEvents.push('bonus-end');
  if(!same(view.events,expectedEvents))fail();
}
export function validateSession(value:unknown):Session {
  if(!value||typeof value!=='object')fail();const session=value as Session;
  if(session.version!==CONFIG.schemaVersion||!Number.isInteger(session.rngState)||session.rngState<1||session.rngState>0xffffffff||!isMoney(session.roundSequence)||!Array.isArray(session.history)||session.history.length>CONFIG.historyLimit)fail();
  if((session.activeRound!==null&&(!session.activeRound||typeof session.activeRound!=='object'))||(session.presentation!==null&&(!session.presentation||typeof session.presentation!=='object'))||(session.extraSpinOffer!==undefined&&session.extraSpinOffer!==null&&(!session.extraSpinOffer||typeof session.extraSpinOffer!=='object')))fail();
  assertMoney(session.balanceCents);assertMoney(session.betCents);
  if(!(CONFIG.betsCents as readonly number[]).includes(session.betCents)||!Object.hasOwn(CONFIG.prices,session.selectedMode)||!['idle','presenting-base','presenting-bonus','bonus-pending','presenting-complete'].includes(session.phase))fail();
  if((session.phase==='idle'&&(session.activeRound||session.presentation))||(session.phase==='bonus-pending'&&(!session.activeRound||session.presentation))||(session.phase.startsWith('presenting-')&&!session.presentation))fail();
  if(session.activeRound){
    const round=session.activeRound;if(round.configVersion!==CONFIG.version)throw new Error('CONFIG_VERSION_MISMATCH');
    [round.betCents,round.costCents,round.payoutCents,round.capCents,round.spinsRemaining,round.spinIndex,round.shotsAwarded,round.capOffsetCents].forEach(assertMoney);
    if(!isId(round.id)||!isId(round.sourceRoundId)||round.sourceRoundId!==round.id||round.capOffsetCents!==0||!validChoice(round.choice)||round.choice.kind==='extra'||!(CONFIG.betsCents as readonly number[]).includes(round.betCents)||round.betCents!==session.betCents||round.costCents!==roundPriceCents(round.betCents,round.choice)||round.capCents!==round.betCents*CONFIG.capMultiplier||round.payoutCents+round.capOffsetCents>=round.capCents||!round.tier||!Object.hasOwn(CONFIG.bonuses,round.tier)||!validNumbers(round.positionMultipliers)||round.energy!==maximum(round.positionMultipliers)||!validUpgrades(round.upgrades)||round.upgrades.length!==CONFIG.bonuses[round.tier].upgradesCount||!validFrames(round.frames)||!same(round.frames,round.positionMultipliers.map(column=>column.map(value=>value>1)))||!Array.isArray(round.wilds)||round.wilds.length!==0||round.retriggers!==0||round.spinsRemaining<1||round.spinIndex<1||round.extraInitialMultipliers!==undefined)fail();
    if(round.choice.kind==='buy'&&round.tier!==round.choice.bonus)fail();
    const consumed=round.spinIndex-(round.choice.kind==='mode'?1:0);
    if(round.spinsRemaining!==CONFIG.bonuses[round.tier].spins+round.shotsAwarded-consumed)fail();
  }
  if(session.presentation){
    const view=session.presentation;validatePresentation(view);
    if(view.roundComplete){
      if(session.activeRound||session.phase!=='presenting-complete')fail();
      const history=session.history[0];if(!history||view.id!==`${history.id}:${history.spins}`||!same(view.choice,history.choice)||view.lockedBetCents!==history.betCents||view.roundCostCents!==history.costCents||view.roundTotalCents!==history.payoutCents||view.maxWin!==history.maxWin||view.capOffsetCents!==history.capOffsetCents||view.tier!==history.bonusTier||!same(view.upgrades,history.bonusUpgrades)||view.shotsAdded>history.shotsAwarded)fail();
      if(view.intro!==(!!view.tier&&history.spins===(view.choice.kind==='mode'?2:1)))fail();
    }else{
      const round=session.activeRound;if(!round||view.id!==`${round.id}:${round.spinIndex}`||!same(view.choice,round.choice)||view.lockedBetCents!==round.betCents||view.roundCostCents!==round.costCents||view.roundTotalCents!==round.payoutCents||view.capOffsetCents!==round.capOffsetCents||!same(view.finalPositionMultipliers,round.positionMultipliers)||!same(view.upgrades,round.upgrades))fail();
      if(view.intro!==(!!view.tier&&round.spinIndex===(view.choice.kind==='mode'?2:1)))fail();
      if(session.phase==='presenting-base'){if(view.tier!==null||view.bonusAwarded!==round.tier)fail();}
      else if(session.phase==='presenting-bonus'){if(view.tier!==round.tier||view.bonusAwarded!==null)fail();}
      else fail();
    }
  }
  for(const entry of session.history){
    if(!entry||!isId(entry.id)||!isId(entry.sourceRoundId)||!validChoice(entry.choice)||!(CONFIG.betsCents as readonly number[]).includes(entry.betCents)||!isMoney(entry.costCents)||!isMoney(entry.payoutCents)||!isMoney(entry.capOffsetCents)||entry.payoutCents+entry.capOffsetCents>entry.betCents*CONFIG.capMultiplier||!isMoney(entry.spins)||entry.spins<1||!validTier(entry.bonusTier)||!validUpgrades(entry.bonusUpgrades)||!isMoney(entry.shotsAwarded)||typeof entry.maxWin!=='boolean'||entry.maxWin!==(entry.payoutCents+entry.capOffsetCents===entry.betCents*CONFIG.capMultiplier))fail();
    if(entry.bonusTier){
      if(entry.choice.kind==='extra'||entry.bonusUpgrades.length!==CONFIG.bonuses[entry.bonusTier].upgradesCount||(entry.choice.kind==='buy'&&entry.choice.bonus!==entry.bonusTier))fail();
      const availableSpins=CONFIG.bonuses[entry.bonusTier].spins+entry.shotsAwarded+(entry.choice.kind==='mode'?1:0);
      if(entry.maxWin?entry.spins>availableSpins:entry.spins!==availableSpins)fail();
    }else if(entry.choice.kind==='buy'||entry.choice.kind==='lucky'||entry.bonusUpgrades.length||entry.shotsAwarded!==0||entry.spins!==1)fail();
    if(entry.choice.kind==='extra'){
      if(entry.spins!==1||entry.sourceRoundId===entry.id||entry.capOffsetCents<1||!validNumbers(entry.extraInitialMultipliers)||entry.costCents!==quoteExtraSpinCostCents(entry.betCents,entry.extraInitialMultipliers))fail();
    }else if(entry.sourceRoundId!==entry.id||entry.capOffsetCents!==0||entry.extraInitialMultipliers!==undefined||entry.costCents!==roundPriceCents(entry.betCents,entry.choice))fail();
  }
  if(new Set(session.history.map(entry=>entry.id)).size!==session.history.length||session.activeRound&&session.history.some(entry=>entry.id===session.activeRound!.id))fail();
  for(let index=0;index<session.history.length-1;index++){
    const entry=session.history[index],previous=session.history[index+1];
    if(entry.choice.kind==='extra'&&(entry.sourceRoundId!==previous.sourceRoundId||entry.betCents!==previous.betCents||entry.capOffsetCents!==previous.capOffsetCents+previous.payoutCents||previous.maxWin||previous.bonusTier!==null||(previous.choice.kind!=='mode'&&previous.choice.kind!=='extra')))fail();
  }
  if(session.extraSpinOffer){
    const offer=session.extraSpinOffer;const history=session.history[0];
    if(session.activeRound||!isId(offer.sourceRoundId)||!history||offer.sourceRoundId!==history.sourceRoundId||!isMoney(offer.alreadyPaidCents)||offer.alreadyPaidCents!==history.capOffsetCents+history.payoutCents||offer.alreadyPaidCents>=offer.betCents*CONFIG.capMultiplier||(history.choice.kind!=='mode'&&history.choice.kind!=='extra')||history.bonusTier!==null||history.maxWin||offer.betCents!==history.betCents||!validNumbers(offer.positionMultipliers)||offer.costCents!==quoteExtraSpinCostCents(offer.betCents,offer.positionMultipliers)||offer.costCents>history.payoutCents||(session.presentation&&!same(offer.positionMultipliers,session.presentation.finalPositionMultipliers)))fail();
  }
  return session;
}
export function saveSession(session:Session,storage:StorageLike=browserStorage()):void {validateSession(session);storage.setItem(STORAGE_KEY,JSON.stringify(session));}
export function loadSession(storage:StorageLike=browserStorage(),seed?:number):Session {
  const stored=storage.getItem(STORAGE_KEY);return stored?validateSession(JSON.parse(stored)):createSession(seed);
}
/** Caller retains its previous state if persistence throws; no unsaved debit reaches the UI. */
export function commitSession(_current:Session,candidate:Session,storage:StorageLike=browserStorage()):Session {saveSession(candidate,storage);return candidate;}
