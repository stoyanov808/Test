import { CONFIG } from './config';
import { assertMoney } from './accounting';
import { createSession } from './engine';
import type { RoundChoice, Session, StorageLike } from './types';

export const STORAGE_KEY='studentski-grad-session-v1';
const browserStorage=():StorageLike=>globalThis.localStorage;
function validChoice(choice:RoundChoice):boolean {return !!choice&&(choice.kind==='mode'?Object.hasOwn(CONFIG.prices,choice.mode):choice.kind==='buy'&&Object.hasOwn(CONFIG.buyPrices,choice.bonus));}
export function validateSession(value:unknown):Session {
  if (!value || typeof value!=='object') throw new Error('INVALID_SAVE');
  const session=value as Session;
  if (session.version!==CONFIG.schemaVersion || !Number.isInteger(session.rngState) || session.rngState<1 || session.rngState>0xffffffff || !Number.isSafeInteger(session.roundSequence) || session.roundSequence<0 || !Array.isArray(session.history)) throw new Error('INVALID_SAVE');
  assertMoney(session.balanceCents);assertMoney(session.betCents);
  if (!(CONFIG.betsCents as readonly number[]).includes(session.betCents) || !Object.hasOwn(CONFIG.prices,session.selectedMode)) throw new Error('INVALID_SAVE');
  if (!['idle','presenting-base','presenting-bonus','bonus-pending','presenting-vip','presenting-complete'].includes(session.phase)) throw new Error('INVALID_SAVE');
  if ((session.phase==='idle'&&(session.activeRound||session.presentation)) || (session.phase==='bonus-pending'&&(!session.activeRound||session.presentation)) || (session.phase.startsWith('presenting-')&&!session.presentation)) throw new Error('INVALID_SAVE');
  if (session.activeRound) {
    const round=session.activeRound;
    if(round.configVersion!==CONFIG.version)throw new Error('CONFIG_VERSION_MISMATCH');
    [round.betCents,round.costCents,round.payoutCents,round.capCents,round.spinsRemaining].forEach(assertMoney);
    if(!validChoice(round.choice)||!(CONFIG.betsCents as readonly number[]).includes(round.betCents)||round.capCents!==round.betCents*CONFIG.capMultiplier||round.payoutCents>round.capCents||!Number.isInteger(round.retriggers)||round.retriggers<0||round.retriggers>CONFIG.retriggerLimit||!Number.isInteger(round.energy)||round.energy<1||round.energy>CONFIG.partyLimit||round.frames.length!==CONFIG.reels||round.frames.some(column=>column.length!==CONFIG.rows||column.some(frame=>typeof frame!=='boolean')))throw new Error('INVALID_SAVE');
    if(!Array.isArray(round.wilds)||round.wilds.some(wild=>!Number.isInteger(wild.reel)||wild.reel<0||wild.reel>=CONFIG.reels||!Number.isInteger(wild.multiplier)||wild.multiplier<1||wild.multiplier>CONFIG.wildMultiplierLimit)||new Set(round.wilds.map(wild=>wild.reel)).size!==round.wilds.length)throw new Error('INVALID_SAVE');
  }
  return session;
}
export function saveSession(session:Session,storage:StorageLike=browserStorage()):void {validateSession(session);storage.setItem(STORAGE_KEY,JSON.stringify(session));}
export function loadSession(storage:StorageLike=browserStorage(),seed?:number):Session {
  const stored=storage.getItem(STORAGE_KEY);return stored?validateSession(JSON.parse(stored)):createSession(seed);
}
/** Caller retains `current` if this throws: no unpersisted debit reaches the UI. */
export function commitSession(_current:Session,candidate:Session,storage:StorageLike=browserStorage()):Session {saveSession(candidate,storage);return candidate;}
