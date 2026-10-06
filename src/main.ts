import './style.css';
import './menus.css';
import { CONFIG, createSession, startRound, advanceRound, dismissPresentation, refillDemo, selectBet, setMode, loadSession, commitSession, roundPriceCents } from './engine';
import type { Session, SpinPresentation, BonusTier, RoundChoice, Grid } from './engine/types';
import { SlotRenderer } from './render';
import { AudioDirector } from './audio';
import { createTranslator, formatEuro, type Language } from './i18n';
import { Dialogs } from './menus';

type Preferences = { language: Language; turbo: boolean; muted: boolean; volume: number };
const PREF_KEY = 'studentski-grad-preferences-v1';
let prefs: Preferences = { language: 'bg', turbo: false, muted: false, volume: .38 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { /* retain defaults */ }
if (!['bg', 'en'].includes(prefs.language)) prefs.language = 'bg';
let startupError: string | null = null;
let session: Session;
try { session = loadSession(localStorage); }
catch (e) { session = createSession(); startupError = e instanceof Error ? e.message : String(e); }
let busy = false;
let autoplay = 0;
let lastWin = session.presentation?.payoutCents ?? session.history[0]?.payoutCents ?? 0;
let currentScene: BonusTier | null = null;
let skipOverlay: (() => void) | null = null;
let eventMessage = '';
let presentedEnergy: number | null = null;
const tr = (key: string, params?: Record<string, string | number>) => createTranslator(prefs.language)(key, params);
const money = (cents: number) => formatEuro(cents / 100, prefs.language);
const icon = (name: string) => ({
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8q5 4 0 8M19 5q8 7 0 14" fill="none"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none"/><path d="M12 10v7M12 6v1" fill="none"/>',
  gear: '<path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z" fill="none"/><circle cx="12" cy="12" r="3" fill="none"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-7L3 8M3 3v5h5M12 7v5l4 2" fill="none"/>',
  turbo: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  spin: '<path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" fill="none"/>',
  cards: '<rect x="3" y="5" width="15" height="16" rx="2" fill="none"/><path d="m8 2 13 3-3 14M8 13l3-4 3 4-3 4z" fill="none"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none"/>',
  minus: '<path d="M5 12h14" fill="none"/>',
}[name] || '') as string;
const svg = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell">
    <header class="masthead">
      <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><span>СГ</span></div>
      <div class="brand-copy"><div class="eyebrow" data-i18n="location">СОФИЯ · СЛЕД ПОЛУНОЩ</div><h1 data-i18n="title">СТУДЕНТСКИ ГРАД</h1><p data-i18n="subtitle">„Утре съм на лекции.“</p></div>
      <div class="header-actions"><span class="demo-badge" data-i18n="demo">ВИРТУАЛНО ДЕМО</span><button class="language-button" id="language" aria-label="Change language">BG <span>/ EN</span></button><button class="icon-button" id="sound">${svg('sound')}</button><button class="icon-button" id="settings">${svg('gear')}</button></div>
    </header>
    <section class="night-stage" aria-label="Slot game">
      <div class="scene-layer" aria-hidden="true"></div><div class="scene-shade" aria-hidden="true"></div><div class="rain" aria-hidden="true"></div>
      <div class="stage-inner">
        <section class="reel-section">
          <div class="reel-heading"><div><span class="status-dot"></span><span id="scene-label">УТРЕ СЪМ НА ЛЕКЦИИ</span></div><div class="ways-badge"><strong id="ways">1 024</strong> <span data-i18n="waysLabel">НАЧИНА</span></div></div>
          <div class="reel-bezel"><span class="bezel-screw top-left"></span><span class="bezel-screw top-right"></span><canvas id="reels" role="img" aria-label="Five reels, four rows"></canvas><span class="bezel-screw bottom-left"></span><span class="bezel-screw bottom-right"></span><div class="reel-edge" aria-hidden="true"></div></div>
          <div class="event-strip" aria-live="polite"><span class="event-star">✦</span><span id="event-message"></span><span class="event-code">СГ / 01</span></div>
        </section>
        <aside class="night-notes">
          <div class="energy-card"><div class="energy-heading"><span data-i18n="partyMeter">ГРАДУС НА КУПОНА</span><span class="live-dot"></span></div><div class="energy-number"><strong id="energy">1</strong><span>×</span><div><small data-i18n="globalMultiplier">ОБЩ МНОЖИТЕЛ</small><b id="spins-left"></b></div></div><div id="energy-bars" class="energy-bars"></div><p id="energy-hint"></p></div>
          <div class="lecture-poster"><span class="tape"></span><small>УНИВЕРСИТЕТ / ОБЯВА</small><strong>Лекция: 08:00</strong><div class="poster-line"></div><p>Утре съм на лекции.</p><b>КУПОН: СЕГА.</b><span class="poster-scribble">сесията почака ↗</span></div>
          <div class="mode-note"><span data-i18n="selectedMode">ИЗБРАН РЕЖИМ</span><strong id="mode-label"></strong><p id="mode-description"></p><button class="text-link" id="mode-open"><span data-i18n="exploreFeatures">ВИЖ БУСТЕРИТЕ</span> ↗</button></div>
          <div class="neighborhood-stamp">СТУДЕНТСКИ<br><span>02:47</span><small>НОЩТА Е МЛАДА</small></div>
        </aside>
      </div>
      <div class="round-overlay" id="round-overlay" hidden></div>
    </section>
    <section class="control-desk">
      <div class="money-cell balance-cell"><label data-i18n="balance">БАЛАНС</label><strong id="balance"></strong><button class="refill-link" id="refill" data-i18n="refill">Стипендията дойде +</button></div>
      <div class="bet-cell"><label data-i18n="bet">ЗАЛОГ</label><div class="bet-stepper"><button id="bet-minus" aria-label="Decrease bet">${svg('minus')}</button><select id="bet" aria-label="Base bet"></select><button id="bet-plus" aria-label="Increase bet">${svg('plus')}</button></div><small><span id="spin-cost-label" data-i18n="spinCost">ЦЕНА НА СПИН</span> <b id="spin-cost"></b></small></div>
      <div class="money-cell win-cell"><label data-i18n="win">ПЕЧАЛБА</label><strong id="win"></strong><small id="round-win"></small></div>
      <button id="features" class="feature-button">${svg('cards')}<span data-i18n="featureMenu">ТЪРСИМ КУПОНА</span><b>↗</b></button>
      <div class="spin-group"><button id="turbo" class="icon-button speed-button">${svg('turbo')}</button><button id="spin" class="spin-button">${svg('spin')}<span data-i18n="spin">СПИН</span></button><button id="autoplay" class="icon-button auto-button">${svg('play')}<span id="auto-count">AUTO</span></button></div>
    </section>
    <footer class="bottom-bar"><div class="footer-links"><button id="paytable">${svg('cards')}<span data-i18n="paytable">СИМВОЛИ</span></button><button id="rules">${svg('info')}<span data-i18n="rules">ПРАВИЛА</span></button><button id="history">${svg('history')}<span data-i18n="history">ИСТОРИЯ</span></button></div><p data-i18n="demoNotice">Виртуални евро. Истински студентски истории.</p><span class="edition">VOL. 01 / 5 × 4</span></footer>
    <div id="error-toast" class="error-toast" role="alert" hidden></div>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new AudioDirector();
audio.setMuted(prefs.muted); audio.setVolume(prefs.volume);
const renderer = new SlotRenderer(el<HTMLCanvasElement>('reels'), { translate: key => tr(key), onEvent: name => audio.cue(name) });
const initialGrid: Grid = Array.from({length: CONFIG.reels}, (_, c) => Array.from({length: CONFIG.rows}, (_, r) => (['book','female','coffee','noodles','male','doner','dj','couple'] as const)[(c * 3 + r) % 8]));
renderer.render(session.presentation ?? {grid: initialGrid});

function savePreferences() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* audio/language still work */ } }
function mutate(candidate: Session) { session = commitSession(session, candidate, localStorage); update(); }
function announce(message: string) { eventMessage = message; el('event-message').textContent = message; }
function error(message: string) {
  const friendly: Record<string,string> = {INSUFFICIENT_BALANCE:tr('insufficient'),ROUND_ACTIVE:tr('featureLocked'),PRESENTATION_PENDING:tr('busy'),INVALID_BET:tr('error'),INVALID_CHOICE:tr('error')};
  el('error-toast').textContent = friendly[message] ?? tr('error'); el('error-toast').hidden = false; setTimeout(() => {el('error-toast').hidden = true}, 5000);
}
function safe(action: () => void) { try { action(); } catch(e) { autoplay = 0; error(e instanceof Error ? e.message : String(e)); update(); } }
function setScene(tier: BonusTier | null) {
  currentScene = tier; renderer.setScene(tier); audio.setTier(tier ?? 'base');
  document.querySelector('.night-stage')!.setAttribute('data-scene', tier ?? 'base');
  el('scene-label').textContent = tier ? tr(`bonus.${tier}`) : tr('subtitle').replace(/[„“]/g, '').toUpperCase();
}
const dialogs = new Dialogs({
  getSession: () => session, getLanguage: () => prefs.language,
  onSelectMode: mode => safe(() => {if (busy) return; mutate(setMode(session, mode)); announce(tr(`mode.${mode}`));}),
  onBuy: bonus => play({kind:'buy',bonus}), onGod: () => play({kind:'mode',mode:'god'}),
  onLanguage: language => {prefs.language = language; savePreferences(); updateLanguage();},
  onAudio: settings => {prefs.muted = settings.muted; prefs.volume = settings.volume; audio.setMuted(prefs.muted); audio.setVolume(prefs.volume); void audio.unlock(); savePreferences(); update();},
  getAudio: () => ({muted:prefs.muted,volume:prefs.volume}), getSpeed: () => prefs.turbo ? 'turbo' : 'normal',
  onSpeed: speed => {prefs.turbo = speed === 'turbo'; savePreferences(); update();},
  getAutoplay: () => autoplay, onAutoplay: count => {autoplay = Math.max(0,Math.min(CONFIG.autoplayLimit,Math.floor(count))); update(); if (!busy && autoplay) playAuto();},
  onStopAutoplay: () => {autoplay = 0; update();}, onRefill: () => safe(() => {if (!busy) {mutate(refillDemo(session)); announce(tr('refillDone')); audio.cue('win');}}),
  isBusy: () => busy || session.phase !== 'idle' || startupError !== null,
});

function updateLanguage() {
  document.documentElement.lang = prefs.language;
  document.title = `${tr('title')} · ${tr('subtitle')}`;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => {node.textContent = tr(node.dataset.i18n!)});
  el('language').innerHTML = prefs.language === 'bg' ? 'BG <span>/ EN</span>' : 'EN <span>/ BG</span>';
  el('settings').setAttribute('aria-label',tr('settings')); el('sound').setAttribute('aria-label',tr('sound'));
  el('turbo').setAttribute('aria-label',tr('turbo')); el('autoplay').setAttribute('aria-label',tr('autoplay'));
  el('reels').setAttribute('aria-label', prefs.language === 'bg' ? 'Пет барабана, четири реда. 1 024 начални начина.' : 'Five reels, four rows. 1,024 initial ways.');
  el<HTMLSelectElement>('bet').innerHTML = CONFIG.betsCents.map(bet=>`<option value="${bet}">${money(bet)}</option>`).join('');
  setScene(currentScene); update(); dialogs.refresh();
  announce(tr('ready'));
}
function update() {
  const locked = busy || session.phase !== 'idle' || startupError !== null;
  el('balance').textContent = money(session.balanceCents); el('win').textContent = money(lastWin);
  el<HTMLSelectElement>('bet').value = String(session.betCents);
  const paidChoice = session.activeRound?.choice ?? session.presentation?.choice;
  const actualCost = session.activeRound?.costCents ?? session.presentation?.roundCostCents;
  el('spin-cost').textContent = money(actualCost ?? roundPriceCents(session.betCents, {kind:'mode',mode:session.selectedMode}));
  el('spin-cost-label').textContent = paidChoice?.kind === 'buy' || session.presentation?.tier ? (prefs.language === 'bg' ? 'ЦЕНА НА РУНДА' : 'ROUND COST') : tr('spinCost');
  const modeKey = paidChoice?.kind === 'buy' ? `bonus.${paidChoice.bonus}` : `mode.${paidChoice?.mode ?? session.selectedMode}`;
  el('mode-label').textContent = tr(modeKey);
  el('mode-description').textContent = tr(`${modeKey}.description`);
  el('round-win').textContent = session.activeRound ? `${tr('totalWin')} ${money(session.activeRound.payoutCents)}` : tr('virtualEuro');
  const energy = presentedEnergy ?? session.presentation?.energyUsed ?? session.activeRound?.energy ?? 1;
  el('energy').textContent = String(energy);
  el('energy-bars').innerHTML = Array.from({length:10},(_,i)=>`<i class="${i < Math.ceil(energy / CONFIG.partyLimit * 10) ? 'lit':''}"></i>`).join('');
  el('spins-left').textContent = session.activeRound?.tier ? `${session.activeRound.spinsRemaining} ${tr('freeSpins')}` : tr('nightStarts');
  el('energy-hint').textContent = session.activeRound?.tier ? tr('energyHint') : tr('energyBaseHint');
  ['bet','bet-minus','bet-plus','refill','features','mode-open'].forEach(id=>(el(id) as HTMLButtonElement).disabled = locked);
  el<HTMLButtonElement>('spin').disabled = locked;
  el('spin').classList.toggle('spinning',locked);
  el('spin').setAttribute('aria-label',tr('spin'));
  el('turbo').classList.toggle('active',prefs.turbo);
  el('sound').classList.toggle('muted',prefs.muted);
  el('sound').setAttribute('aria-pressed',String(prefs.muted));
  el('turbo').setAttribute('aria-pressed',String(prefs.turbo));
  el('autoplay').classList.toggle('active',autoplay > 0);
  el('auto-count').textContent = autoplay > 0 ? String(autoplay) : 'AUTO';
  el('autoplay').innerHTML = `${svg(autoplay > 0 ? 'stop' : 'play')}<span id="auto-count">${autoplay > 0 ? autoplay : 'AUTO'}</span>`;
}
function displayWays(p: SpinPresentation) {
  const ways = p.grid.reduce((product,column,c)=>product*column.reduce((sum,s,r)=>sum+(p.frames[c]?.[r] && s !== 'scatter' && s !== 'vip' ? 2 : 1),0),1);
  el('ways').textContent = new Intl.NumberFormat(prefs.language === 'bg' ? 'bg-BG':'en-GB').format(ways);
}
function overlay(title: string, detail: string, amount?: number, max = false, duration = 1600): Promise<void> {
  return new Promise(resolve => {
    const box = el('round-overlay');
    box.classList.toggle('maximum',max);
    box.innerHTML = `<div class="overlay-inner"><span class="overlay-kicker">${max ? '20 000×' : tr('studentskiNights')}</span><h2>${title}</h2>${amount === undefined ? '' : `<strong class="overlay-amount">${money(amount)}</strong>`}<p>${detail}</p><button class="overlay-continue">${tr('continue')} ↗</button></div>`;
    box.hidden = false;
    let done = false;
    const finish = () => {if(done)return;done=true;box.hidden=true;skipOverlay=null;resolve();};
    skipOverlay=finish; box.querySelector('button')!.addEventListener('click',finish,{once:true});
    if(amount !== undefined) {
      const amountNode = box.querySelector<HTMLElement>('.overlay-amount')!;
      const started = performance.now(); const countDuration = prefs.turbo ? 450 : Math.min(2200,duration*.65);
      const count = (now: number) => {if(done)return;const progress=Math.min(1,(now-started)/countDuration);amountNode.textContent=money(Math.round(amount*(1-(1-progress)**3)));if(progress<1)requestAnimationFrame(count);};
      requestAnimationFrame(count);
    }
    setTimeout(finish, prefs.turbo ? Math.min(duration,800) : duration);
  });
}
async function present(p: SpinPresentation) {
  presentedEnergy = p.energyUsed; update();
  if (p.intro && p.tier) {
    setScene(p.tier); audio.cue('bonus');
    await overlay(tr(`bonus.${p.tier}`), `${CONFIG.bonuses[p.tier].spins} ${tr('freeSpins')} · ${tr('baseBet')} ${money(p.lockedBetCents)}`,undefined,false,2200);
  } else if (p.tier !== currentScene && p.kind === 'spin') setScene(p.tier);
  if (p.kind === 'vip') {audio.setTier('vip'); await renderer.animateVip(p,prefs.turbo);}
  else await renderer.animateSpin(p,prefs.turbo);
  displayWays(p); lastWin=p.payoutCents; presentedEnergy=p.energyAfter; update();
  if (p.retrigger) announce(`${tr('retrigger')} · ${p.upgradedTo ? tr(`bonus.${p.upgradedTo}`) : tr('partyContinues')}`);
  else if (p.payoutCents > 0) announce(`${tr('win')} ${money(p.payoutCents)}${p.energyUsed > 1 ? ` · ${p.energyUsed}×` : ''}`);
  else announce(p.kind === 'vip' ? tr('vipFailure') : tr('nextSpinMessage'));
  if (p.upgradedTo) {setScene(p.upgradedTo); audio.cue('bonus'); await overlay(tr('bonusUpgrade'),tr(`bonus.${p.upgradedTo}`),undefined,false,1500);}
  if (p.maxWin) {
    audio.cue('vip-success'); renderer.celebrate(CONFIG.capMultiplier,true);
    document.querySelector('.night-stage')!.classList.add('max-celebration');
    await overlay(tr('maxWin'),tr('neighborhoodYours'),p.roundTotalCents,true,6500);
    document.querySelector('.night-stage')!.classList.remove('max-celebration');
  } else if (p.payoutCents >= 20*p.lockedBetCents) {
    audio.cue('bigWin'); renderer.celebrate(p.payoutCents/p.lockedBetCents);
    await overlay(tr(p.payoutCents>=100*p.lockedBetCents ? 'megaWin':'bigWin'),tr('refillDone'),p.payoutCents,false,Math.min(4500,1800+p.payoutCents/p.lockedBetCents*7));
  }
  if (p.roundComplete && p.tier && !p.maxWin) {
    await overlay(tr('bonusComplete'),tr(`bonus.${p.tier}`),p.roundTotalCents,false,2300);
  }
}
async function pump() {
  if (busy) return;
  busy=true; update();
  try {
    while (session.presentation || session.activeRound) {
      if (session.presentation) {await present(session.presentation); presentedEnergy=null; mutate(dismissPresentation(session));}
      else if (session.activeRound) mutate(advanceRound(session));
    }
  } catch(e) {autoplay=0; error(e instanceof Error?e.message:String(e));}
  finally {busy=false;update();}
  if (autoplay>0) {setTimeout(playAuto,prefs.turbo?100:550);}
  else if (!session.activeRound && !session.presentation) {setScene(null);}
}
function play(choice: RoundChoice = {kind:'mode',mode:session.selectedMode}) {
  if(busy || session.activeRound || session.presentation || startupError) return;
  safe(()=>{void audio.unlock();mutate(startRound(session,choice));void pump();});
}
function playAuto() {if(busy || !autoplay)return;autoplay--;update();if(session.selectedMode==='god'){autoplay=0;dialogs.open('features');return;}play();}

el('spin').addEventListener('click',()=>{if(session.selectedMode==='god')dialogs.open('features');else play();});
el('features').addEventListener('click',()=>dialogs.open('features')); el('mode-open').addEventListener('click',()=>dialogs.open('features'));
for(const name of ['paytable','rules','history','settings'] as const) el(name).addEventListener('click',()=>dialogs.open(name));
el('language').addEventListener('click',()=>{prefs.language=prefs.language==='bg'?'en':'bg';savePreferences();updateLanguage();});
el('sound').addEventListener('click',()=>{prefs.muted=!prefs.muted;audio.setMuted(prefs.muted);void audio.unlock();savePreferences();update();});
el('turbo').addEventListener('click',()=>{prefs.turbo=!prefs.turbo;savePreferences();update();});
el('autoplay').addEventListener('click',()=>{if(autoplay){autoplay=0;update();announce(tr('autoplayStopped'));}else dialogs.open('settings');});
el('bet').addEventListener('change',()=>safe(()=>mutate(selectBet(session,Number(el<HTMLSelectElement>('bet').value)))));
for(const [id,direction] of [['bet-minus',-1],['bet-plus',1]] as const) el(id).addEventListener('click',()=>safe(()=>{
  const index=CONFIG.betsCents.indexOf(session.betCents as never);const next=Math.max(0,Math.min(CONFIG.betsCents.length-1,index+direction));mutate(selectBet(session,CONFIG.betsCents[next]));
}));
el('refill').addEventListener('click',()=>safe(()=>{if(!busy){mutate(refillDemo(session));announce(tr('refillDone'));audio.cue('win');}}));
document.addEventListener('pointerdown',()=>{void audio.unlock();},{once:true});
document.addEventListener('keydown',event=>{
  if(event.code!=='Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test((event.target as HTMLElement).tagName) || dialogs.isOpen)return;
  event.preventDefault();if(busy){renderer.skip();skipOverlay?.();}else play();
});
el('reels').addEventListener('click',()=>{if(busy){renderer.skip();skipOverlay?.();}});
window.addEventListener('beforeunload',()=>audio.destroy());
updateLanguage();
if(startupError) {
  const box = el('round-overlay'); box.hidden = false;
  const bg = prefs.language === 'bg';
  box.innerHTML = `<div class="overlay-inner recovery"><span class="overlay-kicker">${tr('demo')}</span><h2>${bg?'Запазеният купон не се зареди':'Your saved party could not load'}</h2><p>${bg?'Запазените данни са непроменени. Можеш да ги изтеглиш, да опиташ отново или изрично да започнеш ново демо.':'Your saved data has not been changed. Download a copy, retry, or explicitly start a new demo.'}</p><div class="recovery-actions"><button id="save-download" class="overlay-continue">${bg?'ИЗТЕГЛИ ЗАПИСА':'DOWNLOAD SAVE'}</button><button id="save-retry" class="overlay-continue">${bg?'ОПИТАЙ ОТНОВО':'RETRY'}</button><button id="save-reset" class="overlay-continue">${bg?'НОВО ДЕМО':'NEW DEMO'}</button></div></div>`;
  el('save-download').onclick = () => safe(() => {
    const raw = localStorage.getItem('studentski-grad-session-v1') ?? '{}';
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([raw],{type:'application/json'}));link.download='studentski-grad-save.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
  el('save-retry').onclick = () => window.location.reload();
  el('save-reset').onclick = () => safe(() => {
    const raw = localStorage.getItem('studentski-grad-session-v1');
    if(raw) localStorage.setItem(`studentski-grad-backup-${Date.now()}`,raw);
    mutate(createSession());startupError=null;box.hidden=true;update();announce(tr('ready'));
  });
} else if(session.presentation || session.activeRound) {announce(tr('recovered'));void pump();}
if(import.meta.env.DEV) {
  (window as unknown as {__slot:unknown}).__slot={snapshot:()=>structuredClone(session),busy:()=>busy, reset:(seed:number,balance?:number)=>{if(busy)throw new Error('Busy');mutate(createSession(seed,balance));lastWin=0;renderer.render({grid:initialGrid});update();},skip:()=>{renderer.skip();skipOverlay?.();},setTurbo:(value:boolean)=>{prefs.turbo=value;update();}};
}
