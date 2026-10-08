import './style.css';
import './menus.css';
import { CONFIG, PAYING_SYMBOLS, STORAGE_KEY, createSession, loadSession, commitSession, startRound, advanceRound, dismissPresentation, selectBet, setMode, refillDemo, declineExtraSpin, roundPriceCents, type Session, type RoundChoice, type SpinPresentation, type BonusTier, type Grid, type NumberGrid } from './engine';
import { SlotRenderer } from './render';
import { sceneBackdropMarkup, symbolArtworkMarkup, symbolAssetUrl } from './render/art-v2';
import { showBonusWheel, skipBonusWheel } from './render/bonus-wheel';
import { AudioDirector } from './audio';
import { createTranslator, formatEuro, type Language } from './i18n';
import { Dialogs } from './menus';

type Preferences = { language: Language; turbo: boolean; muted: boolean; volume: number };
const PREF_KEY = 'studentski-grad-preferences-v1';
let prefs: Preferences = { language: 'bg', turbo: false, muted: false, volume: .38 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { /* defaults */ }
if (!['bg', 'en'].includes(prefs.language)) prefs.language = 'bg';
let startupError: string | null = null;
let session: Session;
try { session = loadSession(localStorage); }
catch (e) { session = createSession(); startupError = e instanceof Error ? e.message : String(e); }
let busy = false, autoplay = 0;
let lastWin = session.presentation?.payoutCents ?? session.history[0]?.payoutCents ?? 0;
let currentScene: BonusTier | null = null;
let skipOverlay: (() => void) | null = null;
let extraModalOpen = false;
let extraReturnFocus: HTMLElement | null = null;
let bonusPresentationState: {phase: string; tier: BonusTier; triggerScatters: number; awardedUpgrades: string[]; startedAt: number; wheelStartedAt?: number; finishedAt?: number} | null = null;
let lastPresentation: SpinPresentation | null = session.presentation;
// The engine has settled this spin already. Reveal additional spins with their
// recorded shot animation instead of displaying future awards during the drop.
let bonusSpinCounter: { id: string; tier: BonusTier; remaining: number; shotsShown: number } | null = null;
const tr = (key: string, params?: Record<string, string | number>) => createTranslator(prefs.language)(key, params);
const copy = (bg: string, en: string) => prefs.language === 'bg' ? bg : en;
const money = (cents: number) => formatEuro(cents / 100, prefs.language);
const icon = (name: string) => ({
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8q5 4 0 8M19 5q8 7 0 14" fill="none"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none"/><path d="M12 10v7M12 6v1" fill="none"/>',
  gear: '<path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z" fill="none"/><circle cx="12" cy="12" r="3" fill="none"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-7L3 8M3 3v5h5M12 7v5l4 2" fill="none"/>',
  turbo: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  spin: '<path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" fill="none"/>',
  cards: '<rect x="3" y="5" width="15" height="16" rx="2" fill="none"/><path d="m8 2 13 3-3 14M8 13l3-4 3 4-3 4z" fill="none"/>',
  play: '<path d="m8 4 12 8-12 8z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none"/>', minus: '<path d="M5 12h14" fill="none"/>',
  arrow: '<path d="M5 19 19 5M7 5h12v12" fill="none"/>',
}[name] || '') as string;
const svg = (name: string) => `<svg viewBox='0 0 24 24' aria-hidden='true'>${icon(name)}</svg>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class='game-shell'>
    <header class='masthead'>
      <a class='mini-brand' href='#' aria-label='Studentski Grad'><b>СГ</b><span data-i18n='title'>СТУДЕНТСКИ ГРАД</span></a>
      <div class='header-actions'><span class='demo-badge' data-i18n='demo'>ВИРТУАЛНО ДЕМО</span><button class='language-button' id='language' aria-label='Change language'>BG / EN</button><button class='icon-button' id='sound'>${svg('sound')}</button><button class='icon-button' id='settings'>${svg('gear')}</button></div>
    </header>
    <section class='night-stage' data-scene='base' aria-label='Slot game'>
      <div class='scene-layer' aria-hidden='true'>${sceneBackdropMarkup('base')}</div><div class='scene-shade' aria-hidden='true'></div>
      <div class='stage-inner'>
        <aside class='story-rail'>
          <div class='game-logo'><span class='logo-tag' data-i18n='location'>СОФИЯ · СЛЕД ПОЛУНОЩ</span><h1><span id="title-top">СТУДЕНТСКИ</span><strong id="title-bottom">ГРАД</strong></h1><p data-i18n='subtitle'>„Утре съм на лекции.“</p><i aria-hidden='true'>★</i></div>
          <div class='street-sign'><b id='scene-label'></b><span data-i18n='scatterThreshold'>8+ НАВСЯКЪДЕ</span></div>
          <div class='notice-poster'><small>БЛОК 59 / СОФИЯ</small><b id='poster-headline'></b><p id='poster-body'></p><span>08:00 → ∞</span></div>
          <div class='mode-note'><small data-i18n='selectedMode'></small><strong id='mode-label'></strong><p id='mode-description'></p><button class='text-link' id='mode-open' data-i18n='exploreFeatures'></button></div>
        </aside>
        <section class='reel-section'>
          <div class='reel-heading'><span class='edition'>VOL. 05 / <b>6 × 5</b></span><div class='bonus-spin-counter' id='bonus-spin-counter' role='status' aria-live='polite' aria-atomic='true' hidden><strong id='bonus-spins-count'></strong><span data-i18n='bonusSpinsRemaining'></span><b id='bonus-spins-added' hidden></b></div><span class='ways-badge' id='board-counter'><strong id='ways'>8+</strong> <span data-i18n='scatterThreshold'></span></span></div>
          <div class='reel-bezel'><canvas id='reels' role='img' aria-label='Six reels, five rows. Eight matching symbols anywhere.'></canvas></div>
          <div class='event-strip' aria-live='polite'><span class='event-star'>✦</span><span id='event-message'></span><span id='cascade-counter'></span></div>
        </section>
        <aside class='upgrade-rail'>
          <div class='multiplier-sign'><small data-i18n='highestMultiplier'></small><strong><span id='energy'>1</span>×</strong><span id='spins-left'></span><p id='energy-hint'></p></div>
          <div id='upgrade-list' class='upgrade-list'></div>
          <div class='threshold-note'><b>8+</b><span id='threshold-note'></span></div>
          <div class='chalk-mark'>СГ <span>02:47</span></div>
        </aside>
      </div>
      <div class='round-overlay' id='round-overlay' hidden></div>
    </section>
    <section class='control-desk'>
      <div class='money-cell balance-cell'><label data-i18n='balance'></label><strong id='balance'></strong><button class='refill-link' id='refill' data-i18n='refill'></button></div>
      <div class='bet-cell'><label data-i18n='bet'></label><div class='bet-stepper'><button id='bet-minus' aria-label='Decrease bet'>${svg('minus')}</button><select id='bet' aria-label='Base bet'></select><button id='bet-plus' aria-label='Increase bet'>${svg('plus')}</button></div><small><span id='spin-cost-label' data-i18n='spinCost'></span> <b id='spin-cost'></b></small></div>
      <div class='money-cell win-cell'><label data-i18n='win'></label><strong id='win'></strong><small id='round-win'></small></div>
      <button id='features' class='feature-button'>${svg('cards')}<span data-i18n='featureMenu'></span><b>${svg('arrow')}</b></button>
      <div class='spin-group'><button id='turbo' class='icon-button speed-button'>${svg('turbo')}</button><button id='spin' class='spin-button'>${svg('spin')}<span data-i18n='spin'></span></button><button id='autoplay' class='icon-button auto-button'>${svg('play')}<span id='auto-count'>AUTO</span></button></div>
    </section>
    <footer class='bottom-bar'><div class='footer-links'><button id='paytable'>${svg('cards')}<span data-i18n='paytable'></span></button><button id='rules'>${svg('info')}<span data-i18n='rules'></span></button><button id='history'>${svg('history')}<span data-i18n='history'></span></button></div><p data-i18n='demoNotice'></p><span class='edition'>30 000× MAX</span></footer>
    <div id='error-toast' class='error-toast' role='alert' hidden></div>
  </main>
  <div class='extra-offer' id='extra-offer' role='dialog' aria-modal='true' aria-labelledby='extra-title' aria-describedby='extra-description' hidden>
    <div class='extra-dialog'>
      <span class='extra-kicker' data-i18n='studentskiNights'></span>
      <img class='extra-art' src='${symbolAssetUrl('xways')}' alt=''>
      <h2 id='extra-title'></h2><p id='extra-description'></p>
      <strong id='extra-price'></strong><small id='extra-quote-label'></small>
      <div class='extra-actions'><button id='extra-dismiss'></button><button id='extra-spin'></button></div>
    </div>
  </div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new AudioDirector();
audio.setMuted(prefs.muted); audio.setVolume(prefs.volume);
const initialGrid: Grid = Array.from({length: CONFIG.reels}, (_, c) => Array.from({length: CONFIG.rows}, (_, r) => PAYING_SYMBOLS[(c * 3 + r) % PAYING_SYMBOLS.length]));
const initialMultipliers: NumberGrid = Array.from({length: CONFIG.reels}, () => Array(CONFIG.rows).fill(1));
let shownGrid = session.presentation?.finalGrid ?? initialGrid;
let shownMultipliers = session.presentation?.finalPositionMultipliers ?? initialMultipliers;
const renderer = new SlotRenderer(el<HTMLCanvasElement>('reels'), {
  translate: key => tr(key),
  formatMoney: (euros, maximumFractionDigits = 2) => new Intl.NumberFormat(prefs.language === 'bg' ? 'bg-BG' : 'en-IE', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits}).format(euros),
  onEvent: (name, value) => {
    audio.cue(name, value);
    if (name === 'shot' && value && bonusSpinCounter && session.presentation?.tier && !session.presentation.maxWin) {
      const added = Math.min(value, session.presentation.shotsAdded - bonusSpinCounter.shotsShown);
      bonusSpinCounter.remaining += added; bonusSpinCounter.shotsShown += added; update();
    }
  },
  onStep: step => { shownGrid = step.grid; shownMultipliers = step.positionMultipliers; el('cascade-counter').textContent = step.cascade ? tr('cascadeCount', {count: step.cascade}) : ''; update(); },
});
renderer.render(session.presentation ?? { grid: initialGrid, positionMultipliers: initialMultipliers });
function savePreferences() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* retain settings for this session */ } }
function mutate(candidate: Session) { session = commitSession(session, candidate, localStorage); update(); }
function announce(message: string) { el('event-message').textContent = message; }
function error(message: string) {
  const friendly: Record<string, string> = { INSUFFICIENT_BALANCE: tr('insufficient'), ROUND_ACTIVE: tr('featureLocked'), PRESENTATION_PENDING: tr('busy'), INVALID_BET: tr('error'), INVALID_CHOICE: tr('error') };
  el('error-toast').textContent = friendly[message] ?? `${tr('error')} · ${message}`;
  el('error-toast').hidden = false;
  setTimeout(() => { el('error-toast').hidden = true; }, 6000);
}
function safe(action: () => void) { try { action(); } catch (e) { autoplay = 0; error(e instanceof Error ? e.message : String(e)); update(); } }
function setScene(tier: BonusTier | null) {
  currentScene = tier; renderer.setScene(tier); audio.setTier(tier ?? 'base');
  document.querySelector('.night-stage')!.setAttribute('data-scene', tier ?? 'base');
  document.querySelector('.scene-layer')!.innerHTML = sceneBackdropMarkup(tier);
  el('scene-label').textContent = tier ? tr(`bonus.${tier}`) : tr('subtitle').replace(/[„“]/g, '');
}
const dialogs = new Dialogs({
  getSession: () => session, getLanguage: () => prefs.language,
  onSelectMode: mode => safe(() => { if (busy || session.extraSpinOffer) return; mutate(setMode(session, mode)); announce(tr(`mode.${mode}`)); }),
  onBuy: bonus => play({kind: 'buy', bonus}), onGod: () => play({kind: 'mode', mode: 'god'}),
  onLucky: () => play({kind: 'lucky'}), onExtra: () => play({kind: 'extra'}),
  onLanguage: language => { prefs.language = language; savePreferences(); updateLanguage(); },
  onAudio: settings => { prefs.muted = settings.muted; prefs.volume = settings.volume; audio.setMuted(prefs.muted); audio.setVolume(prefs.volume); void audio.unlock(); savePreferences(); update(); },
  getAudio: () => ({muted: prefs.muted, volume: prefs.volume}), getSpeed: () => prefs.turbo ? 'turbo' : 'normal',
  onSpeed: speed => { prefs.turbo = speed === 'turbo'; savePreferences(); update(); },
  getAutoplay: () => autoplay, onAutoplay: count => { autoplay = Math.max(0, Math.min(CONFIG.autoplayLimit, Math.floor(count))); update(); if (!busy && autoplay) playAuto(); },
  onStopAutoplay: () => { autoplay = 0; update(); }, onRefill: () => safe(() => { if (!busy) { mutate(refillDemo(session)); announce(tr('refillDone')); audio.cue('win'); } }),
  isBusy: () => busy || session.phase !== 'idle' || !!session.extraSpinOffer || startupError !== null,
});
function updateLanguage() {
  document.documentElement.lang = prefs.language;
  document.title = `${tr('title')} · ${tr('subtitle')}`;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n!); });
  el('title-top').textContent = copy('СТУДЕНТСКИ', 'STUDENTSKI');
  el('title-bottom').textContent = copy('ГРАД', 'GRAD');
  el('language').textContent = prefs.language === 'bg' ? 'BG / EN' : 'EN / BG';
  for (const id of ['settings', 'sound', 'turbo', 'autoplay']) el(id).setAttribute('aria-label', tr(id));
  el('reels').setAttribute('aria-label', copy('Шест барабана, пет реда. Осем еднакви символа навсякъде печелят.', 'Six reels, five rows. Eight matching symbols anywhere win.'));
  el('bet').setAttribute('aria-label', tr('bet'));
  el('bet-minus').setAttribute('aria-label', copy('Намали залога', 'Decrease bet'));
  el('bet-plus').setAttribute('aria-label', copy('Увеличи залога', 'Increase bet'));
  el<HTMLSelectElement>('bet').innerHTML = CONFIG.betsCents.map(bet => `<option value='${bet}'>${money(bet)}</option>`).join('');
  el('poster-headline').textContent = copy('СЕСИЯТА ПОЧАКА.', 'EXAMS CAN WAIT.');
  el('poster-body').textContent = copy('Лекция: 08:00.\nПоследният автобус мина.', 'Lecture: 08:00.\nThe last bus is gone.');
  el('threshold-note').textContent = copy('ЕДНАКВИ СИМВОЛА\nНАВСЯКЪДЕ В ПОЛЕТО', 'MATCHING SYMBOLS\nANYWHERE ON THE BOARD');
  setScene(currentScene); update(); dialogs.refresh();
  announce(tr('ready'));
}
function update() {
  const locked = busy || session.phase !== 'idle' || startupError !== null;
  const offerOpen = !locked && !!session.extraSpinOffer;
  const controlsLocked = locked || offerOpen;
  el('balance').textContent = money(session.balanceCents); el('win').textContent = money(lastWin);
  el<HTMLSelectElement>('bet').value = String(session.betCents);
  const paidChoice = session.activeRound?.choice ?? session.presentation?.choice;
  const actualCost = session.activeRound?.costCents ?? session.presentation?.roundCostCents;
  el('spin-cost').textContent = money(actualCost ?? roundPriceCents(session.betCents, {kind: 'mode', mode: session.selectedMode}));
  el('spin-cost-label').textContent = paidChoice && paidChoice.kind !== 'mode' || session.presentation?.tier ? copy('ЦЕНА НА РУНДА', 'ROUND COST') : tr('spinCost');
  const modeKey = paidChoice?.kind === 'buy' ? `bonus.${paidChoice.bonus}` : paidChoice?.kind === 'lucky' ? 'bonus.lucky' : paidChoice?.kind === 'extra' ? 'extraSpin' : `mode.${paidChoice?.mode ?? session.selectedMode}`;
  el('mode-label').textContent = tr(modeKey); el('mode-description').textContent = paidChoice?.kind === 'extra' ? tr('extraRetained') : tr(`${modeKey}.description`);
  el('round-win').textContent = session.activeRound ? `${tr('totalWin')} ${money(session.activeRound.payoutCents)}` : tr('virtualEuro');
  const matrix = busy ? shownMultipliers : session.activeRound?.positionMultipliers ?? shownMultipliers;
  const highest = Math.max(1, ...matrix.flat());
  el('energy').textContent = highest.toLocaleString(prefs.language === 'bg' ? 'bg-BG' : 'en-GB');
  const bonusCounter = visibleBonusSpinCounter();
  el('bonus-spin-counter').hidden = !bonusCounter;
  if (bonusCounter) {
    const count = String(bonusCounter.remaining);
    if (el('bonus-spins-count').textContent !== count) el('bonus-spins-count').textContent = count;
    const label = tr('bonusSpinsCounter', {count: bonusCounter.remaining});
    if (el('bonus-spin-counter').getAttribute('aria-label') !== label) el('bonus-spin-counter').setAttribute('aria-label', label);
    el('bonus-spin-counter').dataset.tier = bonusCounter.tier;
    el('bonus-spins-added').hidden = !bonusCounter.shotsShown;
    const added = `+${bonusCounter.shotsShown}`;
    if (el('bonus-spins-added').textContent !== added) el('bonus-spins-added').textContent = added;
    el('bonus-spins-added').setAttribute('aria-label', tr('shotsLeft', {count: bonusCounter.shotsShown}));
  }
  el('spins-left').textContent = bonusCounter ? tr('freeSpinsLeft', {count: bonusCounter.remaining}) : copy('МНОЖИТЕЛ НА ПОЗИЦИЯ', 'POSITION MULTIPLIER');
  el('energy-hint').textContent = bonusCounter ? tr('persistentMultipliers') : copy('Печалба → ×2 → ×4 → ×8…', 'Win → ×2 → ×4 → ×8…');
  const selectionPending = !!(session.presentation?.intro || session.presentation?.bonusAwarded);
  const upgrades = selectionPending && bonusPresentationState?.phase !== 'result' ? [] : session.activeRound?.upgrades ?? lastPresentation?.upgrades ?? [];
  el('upgrade-list').innerHTML = (['infectious', 'bomb', 'shots'] as const).map((kind, i) => `<div class='upgrade-tag ${upgrades.includes(kind) ? 'unlocked' : ''}' data-upgrade='${kind}'><b>${['×', '✦', '+2'][i]}</b><span>${tr(`upgrade.${kind}`)}</span><small>${upgrades.includes(kind) ? copy('АКТИВНО', 'ACTIVE') : copy('ПОДОБРЕНИЕ', 'UPGRADE')}</small></div>`).join('');
  const dominant = Math.max(0, ...PAYING_SYMBOLS.map(symbol => shownGrid.flat().filter(cell => cell === symbol || cell === 'wild').length));
  el('ways').textContent = `${dominant}/8`;
  ['bet', 'bet-minus', 'bet-plus', 'refill', 'features', 'mode-open'].forEach(id => (el(id) as HTMLButtonElement).disabled = controlsLocked);
  el<HTMLButtonElement>('spin').disabled = controlsLocked || session.balanceCents < roundPriceCents(session.betCents, {kind: 'mode', mode: session.selectedMode});
  el('spin').classList.toggle('spinning', locked); el('spin').setAttribute('aria-label', tr('spin'));
  el('turbo').classList.toggle('active', prefs.turbo); el('turbo').setAttribute('aria-pressed', String(prefs.turbo));
  el('sound').classList.toggle('muted', prefs.muted); el('sound').setAttribute('aria-pressed', String(prefs.muted));
  el('autoplay').classList.toggle('active', autoplay > 0);
  el('autoplay').innerHTML = `${svg(autoplay > 0 ? 'stop' : 'play')}<span id='auto-count'>${autoplay > 0 ? autoplay : 'AUTO'}</span>`;
  const offer = session.extraSpinOffer;
  el('extra-offer').hidden = !offerOpen;
  syncExtraModal(offerOpen);
  if (offer) {
    el('extra-title').textContent = tr('extraSpin');
    el('extra-description').textContent = `${tr('extraRetained')} · ${tr('baseBet')} ${money(offer.betCents)}`;
    el('extra-price').textContent = money(offer.costCents);
    el('extra-quote-label').textContent = tr('extraQuote', {amount: money(offer.costCents)});
    el('extra-spin').textContent = `${copy('КУПИ СПИН', 'BUY SPIN')} · ${money(offer.costCents)}`;
    el('extra-dismiss').textContent = copy('НЕ, БЛАГОДАРЯ', 'NO, THANKS');
    el<HTMLButtonElement>('extra-spin').disabled = locked || session.balanceCents < offer.costCents;
    el('extra-dismiss').setAttribute('aria-label', copy('Откажи допълнителния спин', 'Decline the extra spin'));
  }
}
function visibleBonusSpinCounter() {
  const view = session.presentation;
  if (view?.tier) {
    if (bonusSpinCounter?.id === view.id) return bonusSpinCounter;
    return {tier: view.tier, remaining: view.intro ? CONFIG.bonuses[view.tier].spins : Math.max(0, (session.activeRound?.spinsRemaining ?? 0) - view.shotsAdded), shotsShown: 0};
  }
  if (view?.bonusAwarded) return bonusSpinCounter?.id === view.id ? bonusSpinCounter : null;
  return session.activeRound?.tier ? {tier: session.activeRound.tier, remaining: session.activeRound.spinsRemaining, shotsShown: 0} : null;
}
function syncExtraModal(show: boolean) {
  if (show === extraModalOpen) return;
  extraModalOpen = show;
  document.body.classList.toggle('extra-modal-open', show);
  document.querySelector<HTMLElement>('.game-shell')!.inert = show;
  if (show) {
    autoplay = 0;
    extraReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => { if (extraModalOpen) el('extra-dismiss').focus(); });
  } else {
    const target = extraReturnFocus?.isConnected ? extraReturnFocus : el('spin');
    extraReturnFocus = null;
    queueMicrotask(() => { if (!extraModalOpen && !busy) target.focus(); });
  }
}
function overlay(title: string, detail: string, amount?: number, max = false, duration = 1600, artwork = ''): Promise<void> {
  return new Promise(resolve => {
    const box = el('round-overlay'); box.classList.toggle('maximum', max);
    box.innerHTML = `<div class='overlay-inner ${artwork ? 'illustrated' : ''}'><span class='overlay-kicker'>${max ? '30 000×' : tr('studentskiNights')}</span>${artwork}<h2>${title}</h2>${amount === undefined ? '' : `<strong class='overlay-amount'>${money(amount)}</strong>`}<p>${detail}</p><button class='overlay-continue'>${tr('continue')} ${svg('arrow')}</button></div>`;
    box.hidden = false;
    let done = false;
    const finish = () => { if (done) return; done = true; box.hidden = true; skipOverlay = null; resolve(); };
    skipOverlay = finish; box.querySelector('button')!.addEventListener('click', finish, {once: true});
    if (amount !== undefined) {
      const node = box.querySelector<HTMLElement>('.overlay-amount')!;
      const started = performance.now(), countDuration = prefs.turbo ? 850 : Math.min(2600, duration * .7);
      const count = (now: number) => { if (done) return; const progress = Math.min(1, (now - started) / countDuration); node.textContent = money(Math.round(amount * (1 - (1 - progress) ** 3))); if (progress < 1) requestAnimationFrame(count); };
      requestAnimationFrame(count);
    }
    setTimeout(finish, prefs.turbo ? Math.max(1200, Math.min(duration, 2000)) : Math.max(2400, duration));
  });
}
function winIllustration(): string {
  return `<div class='night-celebration' aria-hidden='true'><span></span>${symbolArtworkMarkup('male', '', 'win-friends win-friends-male', true)}${symbolArtworkMarkup('female', '', 'win-friends win-friends-female', true)}${symbolArtworkMarkup('beer', '', 'win-toast', true)}</div>`;
}
async function present(p: SpinPresentation) {
  lastPresentation = p;
  bonusSpinCounter = p.tier ? {id: p.id, tier: p.tier, remaining: p.intro ? CONFIG.bonuses[p.tier].spins : Math.max(0, (session.activeRound?.spinsRemaining ?? 0) - p.shotsAdded), shotsShown: 0} : null;
  shownGrid = p.initialGrid; shownMultipliers = p.initialPositionMultipliers; update();
  if (p.intro && p.tier) {
    const purchased = p.choice.kind === 'buy' || p.choice.kind === 'lucky';
    bonusPresentationState = {phase: purchased ? 'scatter-landing' : 'wheel', tier: p.tier, triggerScatters: ({dorm: 3, friday: 4, december: 5})[p.tier], awardedUpgrades: p.upgrades.slice(), startedAt: performance.now()};
    document.querySelector<HTMLElement>('.night-stage')!.dataset.bonusPhase = bonusPresentationState.phase;
    if (purchased) {
      announce(tr('bonusScattersLanding'));
      await renderer.playBonusTrigger(p.tier, prefs.turbo);
    }
    bonusPresentationState.phase = 'wheel'; bonusPresentationState.wheelStartedAt = performance.now();
    document.querySelector<HTMLElement>('.night-stage')!.dataset.bonusPhase = 'wheel';
    audio.cue('bonus');
    await showBonusWheel({tier: p.tier, upgrades: p.upgrades, spins: CONFIG.bonuses[p.tier].spins, language: prefs.language, translate: tr, turbo: prefs.turbo, onTick: () => audio.cue('upgrade')});
    bonusPresentationState.phase = 'result'; bonusPresentationState.finishedAt = performance.now();
    document.querySelector<HTMLElement>('.night-stage')!.dataset.bonusPhase = 'result';
    setScene(p.tier); update();
  } else if (p.tier !== currentScene) setScene(p.tier);
  if (bonusSpinCounter && p.tier) {
    bonusSpinCounter.remaining = Math.max(0, (session.activeRound?.spinsRemaining ?? 0) - p.shotsAdded); update();
  }
  await renderer.animateSpin(p, prefs.turbo);
  if (p.tier && bonusSpinCounter) { bonusSpinCounter.remaining = session.activeRound?.spinsRemaining ?? 0; bonusSpinCounter.shotsShown = p.shotsAdded; }
  else if (p.bonusAwarded) bonusSpinCounter = {id: p.id, tier: p.bonusAwarded, remaining: session.activeRound?.spinsRemaining ?? CONFIG.bonuses[p.bonusAwarded].spins, shotsShown: 0};
  shownGrid = p.finalGrid; shownMultipliers = p.finalPositionMultipliers;
  lastWin = p.payoutCents;
  el('cascade-counter').textContent = p.cascadeSteps.length > 1 ? tr('cascadeCount', {count: p.cascadeSteps.length - 1}) : '';
  update();
  if (p.shotsAdded) announce(`${tr('win')} ${money(p.payoutCents)} · +${p.shotsAdded} ${tr('freeSpins')}`);
  else if (p.payoutCents > 0) announce(`${tr('win')} ${money(p.payoutCents)} · ${p.wins.map(win => `${win.count} × ${tr(`symbol.${win.symbol}`)}`).join(' / ')}`);
  else announce(tr('nextSpinMessage'));
  if (p.maxWin) {
    audio.cue('max-win'); renderer.celebrate(CONFIG.capMultiplier, true);
    await overlay(tr('maxWin'), tr('neighborhoodYours'), p.chainTotalCents, true, 5000, winIllustration());
  } else if (p.payoutCents >= 20 * p.lockedBetCents) {
    audio.cue('bigWin'); renderer.celebrate(p.payoutCents / p.lockedBetCents);
    await overlay(tr(p.payoutCents >= 100 * p.lockedBetCents ? 'megaWin' : 'bigWin'), tr('subtitle'), p.payoutCents, false, 2200, winIllustration());
  }
  if (p.roundComplete && p.tier && !p.maxWin) await overlay(tr('bonusComplete'), tr(`bonus.${p.tier}`), p.roundTotalCents, false, 1800);
}
async function pump() {
  if (busy) return;
  busy = true; update();
  try {
    while (session.presentation || session.activeRound) {
      if (session.presentation) { await present(session.presentation); mutate(dismissPresentation(session)); }
      else if (session.activeRound) mutate(advanceRound(session));
    }
  } catch (e) { autoplay = 0; error(e instanceof Error ? e.message : String(e)); }
  finally { busy = false; update(); }
  if (session.extraSpinOffer) { autoplay = 0; update(); }
  else if (autoplay > 0) setTimeout(playAuto, prefs.turbo ? 500 : 1100);
  else if (!session.activeRound && !session.presentation) setScene(null);
}
function play(choice: RoundChoice = {kind: 'mode', mode: session.selectedMode}) {
  if (busy || session.activeRound || session.presentation || startupError || session.extraSpinOffer && choice.kind !== 'extra') return;
  safe(() => { void audio.unlock(); bonusPresentationState = null; bonusSpinCounter = null; mutate(startRound(session, choice)); void pump(); });
}
function playAuto() { if (session.extraSpinOffer) { autoplay = 0; update(); return; } if (busy || !autoplay) return; autoplay--; update(); play(); }
el('spin').addEventListener('click', () => play());
el('features').addEventListener('click', () => dialogs.open('features')); el('mode-open').addEventListener('click', () => dialogs.open('features'));
for (const name of ['paytable', 'rules', 'history', 'settings'] as const) el(name).addEventListener('click', () => dialogs.open(name));
el('language').addEventListener('click', () => { prefs.language = prefs.language === 'bg' ? 'en' : 'bg'; savePreferences(); updateLanguage(); });
el('sound').addEventListener('click', () => { prefs.muted = !prefs.muted; audio.setMuted(prefs.muted); void audio.unlock(); savePreferences(); update(); });
el('turbo').addEventListener('click', () => { prefs.turbo = !prefs.turbo; savePreferences(); update(); });
el('autoplay').addEventListener('click', () => { if (autoplay) { autoplay = 0; update(); announce(tr('autoplayStopped')); } else dialogs.open('settings'); });
el('bet').addEventListener('change', () => safe(() => mutate(selectBet(session, Number(el<HTMLSelectElement>('bet').value)))));
for (const [id, direction] of [['bet-minus', -1], ['bet-plus', 1]] as const) el(id).addEventListener('click', () => safe(() => {
  const index = CONFIG.betsCents.indexOf(session.betCents as never);
  const next = Math.max(0, Math.min(CONFIG.betsCents.length - 1, index + direction));
  mutate(selectBet(session, CONFIG.betsCents[next]));
}));
el('refill').addEventListener('click', () => safe(() => { if (!busy) { mutate(refillDemo(session)); announce(tr('refillDone')); audio.cue('win'); } }));
el('extra-spin').addEventListener('click', () => play({kind: 'extra'}));
el('extra-dismiss').addEventListener('click', () => safe(() => { if (!busy) mutate(declineExtraSpin(session)); }));
document.addEventListener('pointerdown', () => { void audio.unlock(); }, {once: true});
document.addEventListener('keydown', event => {
  if (extraModalOpen) {
    if (event.key === 'Escape') { event.preventDefault(); safe(() => mutate(declineExtraSpin(session))); }
    if (event.key === 'Tab') {
      const accept = el<HTMLButtonElement>('extra-spin'), decline = el('extra-dismiss');
      if (event.shiftKey && document.activeElement === decline) { event.preventDefault(); (accept.disabled ? decline : accept).focus(); }
      else if (!event.shiftKey && (document.activeElement === accept || accept.disabled)) { event.preventDefault(); decline.focus(); }
    }
    if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
    return;
  }
  if (event.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test((event.target as HTMLElement).tagName) || dialogs.isOpen) return;
  event.preventDefault(); if (busy) { renderer.skip(); skipOverlay?.(); skipBonusWheel(); } else play();
});
el('reels').addEventListener('click', () => { if (busy) { renderer.skip(); skipOverlay?.(); skipBonusWheel(); } });
window.addEventListener('beforeunload', () => audio.destroy());
updateLanguage();
if (startupError) {
  const box = el('round-overlay'); box.hidden = false;
  box.innerHTML = `<div class='overlay-inner recovery'><span class='overlay-kicker'>${tr('demo')}</span><h2>${copy('Записът не се зареди', 'Your save could not load')}</h2><p>${copy('Запазените данни са непроменени. Изтегли копие, опитай отново или започни ново демо.', 'Your saved data is unchanged. Download a copy, retry, or explicitly start a new demo.')}</p><div class='recovery-actions'><button id='save-download' class='overlay-continue'>${copy('ИЗТЕГЛИ ЗАПИСА', 'DOWNLOAD SAVE')}</button><button id='save-retry' class='overlay-continue'>${copy('ОПИТАЙ ОТНОВО', 'RETRY')}</button><button id='save-reset' class='overlay-continue'>${copy('НОВО ДЕМО', 'NEW DEMO')}</button></div></div>`;
  el('save-download').onclick = () => safe(() => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([raw], {type: 'application/json'}));
    link.download = 'studentski-grad-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  el('save-retry').onclick = () => window.location.reload();
  el('save-reset').onclick = () => safe(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(`studentski-grad-backup-${Date.now()}`, raw);
    mutate(createSession()); startupError = null; box.hidden = true; update(); announce(tr('ready'));
  });
} else if (session.presentation || session.activeRound) { announce(tr('recovered')); void pump(); }
if (import.meta.env.DEV) {
  (window as unknown as {__slot: unknown}).__slot = {
    snapshot: () => structuredClone(session), busy: () => busy,
    reset: (seed: number, balance?: number) => { if (busy) throw new Error('Busy'); bonusSpinCounter = null; mutate(createSession(seed, balance)); lastWin = 0; lastPresentation = null; shownGrid = initialGrid; shownMultipliers = initialMultipliers; renderer.render({grid: initialGrid, positionMultipliers: initialMultipliers}); update(); },
    skip: () => { renderer.skip(); skipOverlay?.(); skipBonusWheel(); }, setTurbo: (value: boolean) => { prefs.turbo = value; update(); },
    presentation: () => lastPresentation,
    bonusPresentation: () => bonusPresentationState ? structuredClone(bonusPresentationState) : null,
    board: () => renderer.snapshot(),
  };
}
