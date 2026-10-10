import './style.css';
import oswaldURL from '../public/Oswald.ttf?url&inline';
import { AudioDirector } from './audio';
import { characterURL, characterAnimationSprites, characterFrameSprite, characterReleaseFrame, sceneURL, carURL } from './art';
import { CONFIG, TIER_ORDER, BONUS_NAMES, TIER_CHARACTERS, costCents, createSession, playRound, playFixtureRound, acknowledgeRound, deserializeSession, PAYLINES, PAYLINE_REFERENCE_READY, settledLegacyWallet } from './engine';
import { GameRenderer } from './renderer';
import type { Character, Choice, Round, Session, Tier } from './types';

type Language = 'bg' | 'en';
const SESSION_KEY = 'ot-staroto-session-v5';
const LEGACY_SESSION_KEYS = ['ot-staroto-session-v4', 'ot-staroto-session-v3', 'ot-staroto-session-v2', 'ot-staroto-session-v1'];
const SETTINGS_KEY = 'ot-staroto-settings-v1';
const CHARACTERS: Character[] = ['left', 'middle', 'right'];
const icon = (name: 'spin' | 'menu' | 'buy' | 'god' | 'turbo' | 'sound' | 'muted' | 'close') => {
  const paths = {
    spin: '<path d="M28 10a16 16 0 1 0 9 21M28 10h10v10"/><path d="m18 15 12 9-12 9Z" fill="currentColor" stroke="none"/>',
    menu: '<path d="M9 13h30M9 24h30M9 35h30"/>',
    buy: '<path d="M8 18h32v22H8zM5 12h38v8H5zM24 12v28"/><path d="M24 12C5 13 13-4 24 12c11-16 19 1 0 0Z"/>',
    god: '<path d="m14 9 22 3-5 8-17-3-3 19-8-3 5-22ZM16 9l1-5 21 3-2 5M12 21l9 2 2-6"/><path d="m40 12 4-5m-2 13 5 1"/>',
    turbo: '<path d="m7 10 15 14L7 38Zm20 0 15 14-15 14Z" fill="currentColor" stroke="none"/>',
    sound: '<path d="M7 19h8l10-9v28L15 29H7zM32 17a10 10 0 0 1 0 14m5-22a21 21 0 0 1 0 30"/>',
    muted: '<path d="M7 19h8l10-9v28L15 29H7zM33 18l10 12m0-12L33 30"/>',
    close: '<path d="m13 13 22 22m0-22L13 35"/>',
  };
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const fontReady = new FontFace('RuseInk', `url(${oswaldURL})`).load().then(font => { document.fonts.add(font); });
void fontReady.catch(() => {});
const t = (bg: string, en: string) => language === 'bg' ? bg : en;
const textSafe = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
let language: Language = 'bg';
let turbo = false;
let busy = false;
let displayedBalance = 0;
let messageTimer = 0;
let activeCounter: (() => void) | null = null;
let selectedXbet: 'off' | 'boost' | Character = 'off';
// A physical key remains disarmed until keyup, even when a round ends while held.
let spaceHeld = false;
let fixtureMode = false;
const audio = new AudioDirector();

try {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
  language = settings.language === 'en' ? 'en' : 'bg'; turbo = settings.turbo === true;
  audio.muted = settings.muted === true;
  if (typeof settings.volume === 'number') audio.volume = Math.max(0, Math.min(1, settings.volume));
  audio.defaultMusic = settings.defaultMusic !== false;
  if (settings.selectedXbet === 'boost' || CHARACTERS.includes(settings.selectedXbet as Character)) selectedXbet = settings.selectedXbet as typeof selectedXbet;
} catch { /* Preferences remain usable when browser storage is unavailable. */ }

let startupWarning = '';
let session: Session;
function freshSession(balanceCents?: number) {
  const seed = new Uint32Array(1);
  try { crypto.getRandomValues(seed); } catch { seed[0] = Date.now() >>> 0; }
  return createSession(seed[0], balanceCents);
}
try {
  const raw = localStorage.getItem(SESSION_KEY);
  const restored = raw ? deserializeSession(raw) : null;
  session = restored ?? freshSession();
  if (raw && !restored) startupWarning = 'invalid';
  if (!raw) {
    // Receipts from previous mathematics cannot be replayed in version 5.
    // Keep the original bytes untouched; only a settled virtual wallet may carry.
    const legacyRaw = LEGACY_SESSION_KEYS.map(key => localStorage.getItem(key)).find(value => value !== null);
    if (legacyRaw) {
      let legacy: Record<string, unknown> | null = null;
      try { const value = JSON.parse(legacyRaw); if (value && typeof value === 'object' && !Array.isArray(value)) legacy = value; } catch { /* Preserve unreadable legacy bytes as well. */ }
      const settledWallet = settledLegacyWallet(legacyRaw);
      if (settledWallet) {
        session = { ...freshSession(settledWallet.balanceCents), betCents: settledWallet.betCents };
        // Commit the new ledger once, so a reload cannot re-import or reseed it.
        // A write failure retains the carried wallet for this tab and the old bytes.
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); startupWarning = 'legacy-wallet'; }
        catch { startupWarning = 'legacy-storage'; }
      } else startupWarning = legacy?.pending ? 'legacy-pending' : 'legacy-invalid';
    }
  }
} catch { session = freshSession(); startupWarning = 'storage'; }
displayedBalance = session.balanceCents;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell" id="game-shell">
    <section class="stage" aria-label="Slot game">
      <canvas id="game" width="1240" height="900" tabindex="0" role="img" aria-label="${CONFIG.reels} reels, ${CONFIG.rows} rows, fixed paylines"></canvas>
      <header class="scene-topbar"><h1 class="sr-only">ОТ СТАРОТО</h1><span class="edition">ОТ СТАРОТО <b>·</b> THE OLD CREW</span><div class="header-controls"><button id="language" class="small-button language-button" aria-label="Change language">EN</button><button id="settings" class="small-button" aria-label="Settings">${icon('menu')}</button></div></header>
      <div class="bonus-status" id="bonus-status" hidden><span id="bonus-name"></span><strong><span id="remaining">0</span><small id="remaining-label"></small></strong></div>
      <div class="multiplier-status"><small id="global-label"></small><strong id="global">×1</strong></div>
      <div class="cast-status" id="cast-status" aria-live="polite"></div>
      <div class="control-floor">
        <nav class="feature-bar" aria-label="Features"><button id="buy" class="feature-button"><span id="buy-label"></span></button><label class="xbet-control"><span>X BET</span><select id="xbet" aria-label="Bet feature"></select><small id="xbet-hint"></small></label><button id="god" class="feature-button danger"></button></nav>
        <section class="hud" aria-label="Game controls"><div class="meter"><small id="balance-label"></small><strong id="balance">€0.00</strong></div><label class="meter stake"><small id="stake-label"></small><select id="bet" aria-label="Bet"></select><span id="round-cost" class="round-cost"></span></label><div class="meter win-meter"><small id="win-label"></small><strong id="win">€0.00</strong></div></section>
        <div class="spin-controls"><button id="spin" class="spin-button">${icon('spin')}</button><div class="quick-controls"><button id="turbo" class="small-button" aria-pressed="false">${icon('turbo')}</button><button id="mute" class="small-button" aria-pressed="false">${icon('sound')}</button></div></div>
      </div>
      <footer><span id="demo-label"></span><div class="footer-links"><button id="rules" class="text-button"></button><button id="history" class="text-button"></button></div></footer>
    </section>
  </main><div id="toast" role="status" aria-live="polite" hidden></div><dialog id="modal" aria-labelledby="modal-title"></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const modal = $<HTMLDialogElement>('modal');
const canvas = $<HTMLCanvasElement>('game');
const backgroundURLs = new Map<string, string>();
function sceneBackground(tier: Tier | null = null) {
  const source = sceneURL(tier);
  let url = backgroundURLs.get(source);
  if (!url) {
    // Chromium limits a CSS custom property's token length. Give the intact
    // bundled scene a short object URL rather than a multi-megabyte data URL.
    if (source.startsWith('data:') && source.slice(0, source.indexOf(',')).includes(';base64')) {
      const separator = source.indexOf(',');
      const mime = source.slice(5, source.indexOf(';'));
      const binary = atob(source.slice(separator + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    } else url = source;
    backgroundURLs.set(source, url);
  }
  return url;
}
document.documentElement.style.setProperty('--scene-background', `url("${sceneBackground()}")`);
let fitRendererViewport: ((top: number, height: number) => void) | null = null;
function fitGameWindow() {
  const stage = document.querySelector<HTMLElement>('.stage')!;
  const width = stage.clientWidth, height = stage.clientHeight;
  const portrait = window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
  const compact = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
  const reserve = portrait ? 190 : compact ? 72 : 100;
  const header = portrait ? 58 : compact ? 32 : height > 950 ? 100 : 90;
  // Scale the artwork uniformly around the actual board, rather than shrinking
  // it to fit unused scene margins. Every cell remains clear of the controls.
  const scale = Math.min(portrait ? (width - 16) / 840 : width / 1440, Math.max(1, height - reserve - header) / 630);
  const boardTop = portrait ? header + Math.max(0, height - reserve - header - 630 * scale) / 2 : header;
  const top = boardTop - 170 * scale;
  stage.style.setProperty('--canvas-width', `${1240 * scale}px`);
  stage.style.setProperty('--canvas-height', `${900 * scale}px`);
  stage.style.setProperty('--canvas-top', `${top}px`);
  stage.dataset.artScale = String(scale);
  const visibleHeaderTop = Math.max(0, -top / scale);
  fitRendererViewport?.(visibleHeaderTop, Math.max(0, 170 - visibleHeaderTop));
}
new ResizeObserver(fitGameWindow).observe(document.querySelector('.stage')!);
window.addEventListener('resize', fitGameWindow);
fitGameWindow();

const renderer = new GameRenderer(canvas, {
  background: 'transparent',
  onUpdate(view) {
    document.documentElement.style.setProperty('--scene-background', `url("${sceneBackground(view.tier)}")`);
    $('game-shell').dataset.tier = view.tier ?? 'base';
    $('global').textContent = `×${view.global.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-IE')}`;
    $('bonus-status').hidden = view.tier === null;
    $('bonus-name').textContent = view.tier ? BONUS_NAMES[view.tier] : '';
    $('remaining').textContent = String(view.remaining);
    $('win').textContent = euros(view.totalCents);
    const present = view.tier ? TIER_CHARACTERS[view.tier] : view.spin?.presentCharacters ?? [];
    $('cast-status').innerHTML = present.map(character => `<span class="cast-dot ${character}" title="${characterName(character)}">${characterName(character)}</span>`).join('');
  },
  onSound(cue) { void audio.cue(cue); },
});
fitRendererViewport = (top, height) => renderer.setViewportHeader(top, height);
fitGameWindow();
// Each win actor draws intact atlas windows into a canvas. Every action sheet
// shares one browser decode; the 48 individual poses are never duplicated.
const winAtlasImages = new Map<string, HTMLImageElement>();
function winAtlas(url: string) {
  let image = winAtlasImages.get(url);
  if (!image) { image = new Image(); image.src = url; winAtlasImages.set(url, image); }
  return image;
}
const warmWinDrawings = () => { for (const character of CHARACTERS) winAtlas(characterFrameSprite(character, 0).url); };
if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warmWinDrawings, { timeout: 1500 }); else globalThis.setTimeout(warmWinDrawings, 100);
renderer.setLanguage(language);
void fontReady.then(() => renderer.setLanguage(language)).catch(() => {});

function euros(cents: number) { return new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100); }
function characterName(character: Character) { return character === 'left' ? t('Дивият', 'The Wild One') : character === 'middle' ? t('Стрелецът', 'The Shooter') : t('Събирачът', 'The Collector'); }
function featureName(choice: Choice) { return choice.kind === 'boost' ? t('X BET · 5× ШАНС ЗА БОНУС', 'X BET · 5× BONUS CHANCE') : choice.kind === 'buy' ? BONUS_NAMES[choice.tier] : choice.kind === 'god' ? 'GOD SPIN' : choice.kind === 'xbet' ? `X BET · ${characterName(choice.character)}` : t('Завъртане', 'Spin'); }
function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language, turbo, muted: audio.muted, volume: audio.volume, defaultMusic: audio.defaultMusic, selectedXbet })); } catch { /* Non-financial preferences work for this tab. */ }
}
function saveSession(next: Session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); }
  catch { throw new Error(t('Не можем да запазим играта. Разреши локалното съхранение; кредитите не са променени.', 'The game could not be saved. Enable browser storage; credits were not changed.')); }
  session = next;
}
function toast(message: string) {
  $('toast').textContent = message; $('toast').hidden = false; clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function updateHUD() {
  $('balance').textContent = euros(displayedBalance);
  $('language').textContent = language === 'bg' ? 'EN' : 'BG';
  $('balance-label').textContent = t('БАЛАНС', 'BALANCE'); $('stake-label').textContent = t('ЗАЛОГ', 'BET'); $('win-label').textContent = t('ПЕЧАЛБА', 'WIN');
  $('remaining-label').textContent = t('ОСТАВАТ', 'REMAINING'); $('global-label').textContent = t('МНОЖИТЕЛ', 'MULTIPLIER');
  $('buy').innerHTML = `${icon('buy')}<span>${t('КУПИ БОНУС', 'BUY BONUS')}</span>`; $('god').innerHTML = `${icon('god')}<span>GOD <small>${CONFIG.godCost.toLocaleString()}×</small></span>`;
  $('rules').textContent = t('ПРАВИЛА', 'RULES'); $('history').textContent = t('ИСТОРИЯ', 'HISTORY');
  $('demo-label').textContent = t('ВИРТУАЛНИ КРЕДИТИ · МАКС. 19 999×', 'VIRTUAL CREDITS · MAX. 19,999×');
  $('spin').setAttribute('aria-label', t('Завърти', 'Spin'));
  $('settings').setAttribute('aria-label', t('Настройки', 'Settings'));
  $('turbo').setAttribute('aria-label', t('Турбо', 'Turbo')); $('turbo').setAttribute('aria-pressed', String(turbo));
  $('mute').setAttribute('aria-label', audio.muted ? t('Включи звука', 'Unmute') : t('Изключи звука', 'Mute')); $('mute').setAttribute('aria-pressed', String(audio.muted)); $('mute').innerHTML = icon(audio.muted ? 'muted' : 'sound');
  $('buy').setAttribute('aria-label', t('Купи бонус', 'Buy bonus')); $('god').setAttribute('aria-label', `GOD SPIN · ${euros(costCents(session.betCents, { kind: 'god' }))}`);
  $('bet').setAttribute('aria-label', t('Основен залог', 'Base bet')); $('xbet').setAttribute('aria-label', t('Усилване на залога', 'Bet feature'));
  $('game-shell').dataset.busy = String(busy);
  const bets = $<HTMLSelectElement>('bet');
  bets.innerHTML = CONFIG.betsCents.map(bet => `<option value="${bet}"${bet === session.betCents ? ' selected' : ''}>${euros(bet)}</option>`).join('');
  const xbet = $<HTMLSelectElement>('xbet');
  xbet.innerHTML = `<option value="off">${t('ИЗКЛ.', 'OFF')}</option><option value="boost">${t('5× шанс за бонус · 3×', '5× bonus chance · 3×')}</option>` + CHARACTERS.map(character => `<option value="${character}">${characterName(character)} · ${costCents(100, { kind: 'xbet', character }) / 100}×</option>`).join('');
  xbet.value = selectedXbet;
  const nextChoice: Choice = selectedXbet === 'boost' ? { kind: 'boost' } : selectedXbet === 'off' ? { kind: 'spin' } : { kind: 'xbet', character: selectedXbet };
  $('round-cost').textContent = selectedXbet === 'off' ? '' : `${t('ЦЕНА', 'COST')} ${euros(costCents(session.betCents, nextChoice))}`;
  $('xbet-hint').textContent = selectedXbet === 'boost' ? t('5× шанс · цена 3× залога', '5× chance · costs 3× bet') : selectedXbet === 'off' ? '' : t('Потвърди за един рунд', 'Confirm for one round');
  $('spin').setAttribute('aria-label', `${t('Завърти', 'Spin')} · ${euros(costCents(session.betCents, nextChoice))}`);
  for (const id of ['spin', 'buy', 'god', 'bet', 'xbet', 'settings', 'language', 'rules', 'history']) ($<HTMLButtonElement | HTMLSelectElement>(id)).disabled = busy;
  document.documentElement.lang = language; renderer.setLanguage(language);
}
function openDialog(html: string, className = '') {
  modal.className = className; modal.innerHTML = html;
  $('game-shell').classList.add('dialog-open');
  if (!modal.open) modal.showModal();
  modal.querySelector<HTMLButtonElement>('[data-focus]')?.focus();
}
function closeDialog() { modal.close(); modal.innerHTML = ''; modal.className = ''; $('game-shell').classList.remove('dialog-open'); }
function closeButton() { return `<button id="dialog-close" class="dialog-close" aria-label="${t('Затвори', 'Close')}">${icon('close')}</button>`; }
function bindClose() { $('dialog-close')?.addEventListener('click', closeDialog); }
modal.addEventListener('cancel', event => {
  if (busy) { event.preventDefault(); activeCounter?.(); }
  else $('game-shell').classList.remove('dialog-open');
});
modal.addEventListener('close', () => $('game-shell').classList.remove('dialog-open'));

function showBuyMenu() {
  openDialog(`${closeButton()}<h2 id="modal-title">${t('ИЗБЕРИ СВОЯТА БАНДА', 'CHOOSE YOUR CREW')}</h2><p class="dialog-intro">${t('Всеки бонус има своя характер.', 'Each bonus brings its own character.')}</p><div class="buy-grid">${TIER_ORDER.map(tier => `<button class="buy-card ${tier}" data-tier="${tier}"><div class="buy-cast">${TIER_CHARACTERS[tier].map(character => `<img src="${characterURL(character)}" alt="">`).join('')}</div><strong>${BONUS_NAMES[tier]}</strong><span>${tierDescription(tier)}</span><b>${euros(costCents(session.betCents, { kind: 'buy', tier }))} <small>(${costCents(100, { kind: 'buy', tier }) / 100}×)</small></b></button>`).join('')}</div>`);
  bindClose(); modal.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach(button => button.addEventListener('click', () => confirmChoice({ kind: 'buy', tier: button.dataset.tier as Tier })));
}
function tierDescription(tier: Tier) {
  return tier === 'ruse' ? t('Дивият хвърля лепкави Wild символи.', 'The Wild One throws sticky Wilds.') : tier === 'lux' ? t('Събирачът бележи печелившите полета и разкрива монети.', 'The Collector marks winning cells and reveals coins.') : tier === 'edge' ? t('Разгръщащи се Wild барабани. Всеки остава до края на бонуса с героя и общия си множител. Последващо попадение го подсилва. Възможни са няколко.', 'Expanding Wild reels. Every reel remains for the bonus with its Shooter and reel total. A follow-up hit boosts it. Multiple reels can expand.') : t('И тримата. Всички три ефекта в един бонус. Разгънатите Wild барабани остават до края.', 'All three characters. All three effects in one bonus. Expanded Wild reels remain until it ends.');
}
function confirmChoice(choice: Choice) {
  const cost = costCents(session.betCents, choice);
  openDialog(`<h2 id="modal-title">${textSafe(featureName(choice))}</h2><p>${choice.kind === 'god' ? t('MAX WIN пада като символ в решетката. Бандата стреля по случайни символи; попадение в MAX WIN задейства 19 999×.', 'MAX WIN lands as a grid symbol. The crew shoots at random symbols; hitting MAX WIN triggers 19,999×.') : choice.kind === 'buy' ? tierDescription(choice.tier) : t('Гарантирано пада избраният герой.', 'The chosen character is guaranteed to land.')}</p><div class="confirm-price">${euros(cost)}</div><p class="fine">${t('Залог', 'Bet')}: ${euros(session.betCents)} · ${t('Виртуални кредити', 'Virtual credits')}</p><div class="dialog-actions"><button id="confirm-cancel">${t('ОТКАЗ', 'CANCEL')}</button><button id="confirm-play" class="primary" data-focus>${t('ИГРАЙ', 'PLAY')}</button></div>`);
  $('confirm-cancel').addEventListener('click', closeDialog);
  $('confirm-play').addEventListener('click', () => { closeDialog(); void start(choice); });
}
async function start(choice: Choice) {
  if (busy || session.pending) return;
  busy = true; updateHUD();
  try { await audio.unlock(); } catch { /* Audio failure cannot block play. */ }
  const previous = session;
  let next: Session;
  try { next = import.meta.env.DEV && fixtureMode ? playFixtureRound(previous, choice) : playRound(previous, choice); saveSession(next); }
  catch (error) { busy = false; updateHUD(); toast(error instanceof Error ? error.message : t('Недостатъчен баланс.', 'Insufficient balance.')); return; }
  displayedBalance = previous.balanceCents - next.pending!.costCents;
  $('win').textContent = euros(0);
  await replay(next.pending!);
}
async function replay(round: Round) {
  busy = true; updateHUD();
  try { await renderer.play(round, turbo); }
  catch (error) { toast(t('Представянето беше прекъснато. Записаният резултат е запазен.', 'Presentation was interrupted. Your recorded result is safe.')); console.error(error); }
  displayedBalance = session.balanceCents; updateHUD();
  await showWin(round);
  try { saveSession(acknowledgeRound(session)); }
  catch (error) {
    openDialog(`<h2 id="modal-title">${t('РЕЗУЛТАТЪТ Е ЗАПАЗЕН', 'RESULT IS SAVED')}</h2><p>${t('Не успяхме да приключим записа. Опитай отново, за да продължиш.', 'The final save did not finish. Retry to continue.')}</p><button id="retry-save" class="primary" data-focus>${t('ОПИТАЙ ОТНОВО', 'RETRY')}</button>`);
    $('retry-save').addEventListener('click', () => {
      try { saveSession(acknowledgeRound(session)); closeDialog(); busy = false; updateHUD(); }
      catch (retryError) { toast(retryError instanceof Error ? retryError.message : String(retryError)); }
    });
    return;
  }
  busy = false; updateHUD();
}

async function showWin(round: Round) {
  if (round.payoutCents <= 0) return;
  // Keep locale work out of the animation loop, including ordinary HUD wins.
  const locale = language === 'bg' ? 'bg-BG' : 'en-IE';
  const moneyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  const ratioFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const money = (cents: number) => moneyFormat.format(cents / 100);
  if (round.payoutCents < round.betCents * 20 && round.choice.kind !== 'buy' && !round.triggerTier) {
    // Small wins stay on the integrated HUD so a short tumble never opens a modal.
    return new Promise<void>(resolve => {
      let frame = 0; let settled = false; const started = performance.now();
      const win = $('win');
      const duration = turbo ? 220 : 520;
      const finish = () => { if (settled) return; settled = true; cancelAnimationFrame(frame); win.textContent = money(round.payoutCents); win.classList.remove('counting'); activeCounter = null; resolve(); };
      win.classList.add('counting'); activeCounter = finish;
      const tick = (now: number) => { const progress = Math.min(1, (now - started) / duration); win.textContent = money(Math.floor(round.payoutCents * (1 - (1 - progress) ** 3))); if (progress === 1) finish(); else frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    });
  }
  await Promise.allSettled([...new Set(CHARACTERS.flatMap(character => characterAnimationSprites(character).map(sprite => sprite.url)))].concat(sceneURL()).map(url => winAtlas(url).decode()));
  return new Promise<void>(resolve => {
    const ratio = round.payoutCents / round.betCents;
    let frame = 0; let completed = false; let closed = false; let tier = 0; const started = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Slow enough to read, short enough that ordinary wins do not stall play.
    const duration = turbo ? Math.min(2700, 650 + Math.log2(1 + ratio) * 110) : Math.min(6500, 1300 + Math.log2(1 + ratio) * 260);
    openDialog(`<div class="win-scene" id="win-scene"><button id="win-mute" class="dialog-close" aria-label="${t('Звук', 'Sound')}">${icon(audio.muted ? 'muted' : 'sound')}</button><span class="win-kicker">ОТ СТАРОТО · THE OLD CREW</span><h2 id="modal-title">${t('ПЕЧАЛБА', 'WIN')}</h2><div class="win-cast"><canvas class="win-speaker" id="win-speaker" data-original-background="true" aria-hidden="true"></canvas>${CHARACTERS.map(character => `<canvas class="win-person ${character}" data-character="${character}" data-frame="-1" role="img" aria-label="${characterName(character)}"></canvas>`).join('')}<div class="muzzle-flashes" aria-hidden="true"><i data-character="left"></i><i data-character="middle"></i><i data-character="right"></i></div></div><div class="win-impact" aria-hidden="true"></div><div class="win-streaks" aria-hidden="true">${Array.from({ length: 12 }, (_, index) => `<i style="--i:${index}"></i>`).join('')}</div><div class="win-counter-row"><strong id="win-counter">${money(0)}</strong></div><span class="win-ratio" id="win-ratio">0×</span><div class="escape-car" aria-hidden="true"><img src="${carURL}" alt=""><i class="tyre-smoke"></i></div><button id="win-continue" class="primary" data-focus>${t('ПРЕСКОЧИ', 'SKIP')}</button></div>`, 'win-dialog');
    const scene = $('win-scene'), cast = modal.querySelector<HTMLElement>('.win-cast')!;
    const title = $('modal-title'), counter = $('win-counter'), ratioLabel = $('win-ratio');
    const continueButton = $('win-continue'), muteButton = $('win-mute');
    const impact = modal.querySelector<HTMLElement>('.win-impact')!;
    const cabinet = $<HTMLCanvasElement>('win-speaker'), backdrop = winAtlas(sceneURL());
    let layoutDirty = true, castHeight = 0, castWidth = 0, leftShiftStarted = Infinity;
    const tierAnimations: Animation[] = [];
    const actors = CHARACTERS.map((character, index) => {
      const image = modal.querySelector<HTMLCanvasElement>(`.win-person.${character}`)!;
      const flash = modal.querySelector<HTMLElement>(`.muzzle-flashes [data-character="${character}"]`)!;
      const sprites = characterAnimationSprites(character);
      const facing = character === 'left' ? 1 : -1;
      let leftReach = 0, rightReach = 0, lowerReach = 0;
      for (const sprite of sprites) {
        const origin = character === 'right' ? sprite.seatAnchorX ?? sprite.anchorX ?? sprite.width / 2 : sprite.anchorX ?? sprite.width / 2;
        const reference = sprite.referenceHeight ?? sprite.height;
        leftReach = Math.max(leftReach, (facing > 0 ? origin : sprite.width - origin) / reference);
        rightReach = Math.max(rightReach, (facing > 0 ? sprite.width - origin : origin) / reference);
        lowerReach = Math.max(lowerReach, (sprite.height - (sprite.seatAnchorY ?? sprite.anchorY ?? sprite.height)) / reference);
      }
      return {
        character, index, image, flash, ink: image.getContext('2d')!, sprites, facing,
        releaseFrame: characterReleaseFrame(character), leftReach, rightReach, lowerReach,
        entered: Infinity, timeline: { origin: Infinity, phase: 0, interval: 1850 },
        frameIndex: -1, drawnFrame: -1, layoutVersion: -1, physicalHeight: 0, anchorPosition: 0,
        flashWidth: 0, flashHeight: 0, flashActive: false,
      };
    });
    let layoutVersion = 0;
    const resizeObserver = new ResizeObserver(() => { layoutDirty = true; });
    // These can move the cast in the centred flex scene, even without a window resize.
    for (const node of [scene, cast, title]) resizeObserver.observe(node);
    if (backdrop.complete && backdrop.naturalWidth) {
      cabinet.width = 266; cabinet.height = 425;
      const ink = cabinet.getContext('2d')!; ink.beginPath();
      for (const [pointIndex, [x, y]] of [[1318, 409], [1502, 390], [1584, 398], [1584, 641], [1474, 680], [1474, 808], [1318, 757]].entries()) {
        if (pointIndex === 0) ink.moveTo(x - 1318, y - 390); else ink.lineTo(x - 1318, y - 390);
      }
      ink.closePath(); ink.clip(); ink.drawImage(backdrop, 1318, 390, 266, 425, 0, 0, 266, 425); cabinet.dataset.drawn = 'true';
    }
    void audio.cue('win');
    function paint(value: number) {
      const reached = value / round.betCents;
      const nextTier = reached >= 1000 ? 4 : reached >= 500 ? 3 : reached >= 100 ? 2 : 1;
      if (nextTier !== tier) {
        tier = nextTier; scene.dataset.tier = String(tier); layoutDirty = true;
        title.textContent = tier >= 4 ? t('БАНДАТА Е ТУК', 'THE CREW IS HERE') : tier === 3 ? t('НА РЪБА', 'ON THE EDGE') : tier === 2 ? t('ГОЛЯМА ПЕЧАЛБА', 'BIG WIN') : t('ПЕЧАЛБА', 'WIN');
        if (tier >= 2 && leftShiftStarted === Infinity) leftShiftStarted = performance.now();
        if (tier > 1) {
          void audio.cue(tier >= 4 ? 'shot' : 'feature');
          // Restart compositor effects without the remove/read/add layout barrier.
          for (const animation of tierAnimations) animation.cancel();
          tierAnimations.length = 0;
          tierAnimations.push(impact.animate([{ opacity: .9 }, { opacity: 0 }], { duration: reducedMotion ? 0 : 500, easing: 'ease-out' }));
          tierAnimations.push(cast.animate([
            { transform: 'translate(0,0)', offset: 0 }, { transform: 'translate(3px,2px)', offset: .17 },
            { transform: 'translate(-2px,-1px)', offset: .34 }, { transform: 'translate(1px,1px)', offset: .55 },
            { transform: 'translate(0,0)', offset: 1 },
          ], { duration: reducedMotion ? 0 : 380, easing: 'ease-out' }));
        }
      }
      counter.textContent = money(value); ratioLabel.textContent = `${ratioFormat.format(value / round.betCents)}×`;
    }
    function finish() {
      if (completed) {
        closed = true; activeCounter = null; cancelAnimationFrame(frame); resizeObserver.disconnect();
        for (const animation of tierAnimations) animation.cancel();
        closeDialog(); resolve(); return;
      }
      completed = true; paint(round.payoutCents);
      if (round.maxWin) { scene.classList.add('max-win'); title.textContent = 'MAX WIN · 19 999×'; void audio.cue('max'); }
      continueButton.textContent = t('ПРОДЪЛЖИ', 'CONTINUE'); layoutDirty = true;
    }
    function measureActorLayout() {
      castHeight = cast.clientHeight; castWidth = cast.clientWidth;
      const sceneWidth = scene.clientWidth;
      const castRect = cast.getBoundingClientRect(), sceneRect = scene.getBoundingClientRect();
      // Gather every DOM measurement together, before this frame writes geometry.
      const measurements = actors.map(actor => ({ anchor: actor.image.offsetLeft, flashWidth: actor.flash.offsetWidth, flashHeight: actor.flash.offsetHeight }));
      for (const [index, actor] of actors.entries()) {
        const measurement = measurements[index];
        actor.anchorPosition = measurement.anchor; actor.flashWidth = measurement.flashWidth; actor.flashHeight = measurement.flashHeight;
        let physicalHeight = castHeight;
        if (actor.character === 'right' && actor.lowerReach > 0) physicalHeight = Math.min(physicalHeight, (castHeight * .32 - 5) / actor.lowerReach);
        const anchor = castRect.left + measurement.anchor;
        // Include both ends of the transform-only 50% → 47% tier movement.
        const minimumAnchor = anchor - (actor.character === 'left' && tier >= 2 ? castWidth * .03 : 0);
        if (actor.leftReach > 0) physicalHeight = Math.min(physicalHeight, (minimumAnchor - sceneRect.left - 6) / actor.leftReach);
        if (actor.rightReach > 0) physicalHeight = Math.min(physicalHeight, (sceneRect.right - anchor - 6) / actor.rightReach);
        actor.physicalHeight = Math.max(0, physicalHeight);
      }
      scene.style.setProperty('--win-scene-width', `${sceneWidth}px`);
      layoutDirty = false; layoutVersion += 1;
    }
    function animateActors(now: number) {
      const elapsed = now - started;
      if (layoutDirty) measureActorLayout();
      const cabinetScale = castHeight * .31 / 425;
      for (const actor of actors) {
        const { character, index, image, flash, facing, sprites } = actor;
        const visible = character === 'left' || character === 'middle' && tier >= 2 || character === 'right' && tier >= 3;
        if (!visible) continue;
        if (actor.entered === Infinity) { actor.entered = now; actor.timeline.origin = now + index * 47; }
        const interval = tier >= 4 ? 1150 : tier >= 3 ? 1450 : 1850;
        const timeline = actor.timeline;
        if (interval !== timeline.interval) {
          // Preserve fractional progress when a higher win tier changes tempo.
          timeline.phase = (timeline.phase + Math.max(0, now - timeline.origin) / timeline.interval) % 1;
          timeline.origin = Math.max(now, timeline.origin); timeline.interval = interval;
        }
        const phase = reducedMotion ? 0 : (timeline.phase + Math.max(0, now - timeline.origin) / interval) % 1;
        // Absolute elapsed time keeps the authored cycle identical at 60/120/144 Hz.
        const frameIndex = reducedMotion ? 0 : Math.min(sprites.length - 1, Math.floor(phase / .62 * (sprites.length - 1)));
        const geometry = sprites[frameIndex];
        const atlas = winAtlas(geometry.url);
        const poseChanged = actor.frameIndex !== frameIndex;
        if (atlas.complete && atlas.naturalWidth && actor.drawnFrame !== frameIndex) {
          if (image.width !== geometry.width) image.width = geometry.width;
          if (image.height !== geometry.height) image.height = geometry.height;
          actor.ink.clearRect(0, 0, image.width, image.height);
          actor.ink.drawImage(atlas, geometry.sx, geometry.sy, geometry.width, geometry.height, 0, 0, geometry.width, geometry.height);
          image.dataset.frame = String(frameIndex); actor.drawnFrame = frameIndex;
        }
        const anchorX = character === 'right' ? geometry.seatAnchorX ?? geometry.anchorX ?? geometry.width / 2 : geometry.anchorX ?? geometry.width / 2;
        const anchor = anchorX / geometry.width * 100;
        const actorScale = actor.physicalHeight / (geometry.referenceHeight ?? sprites[0].height);
        const foot = character === 'right' ? geometry.seatAnchorY ?? geometry.anchorY ?? geometry.height : geometry.anchorY ?? geometry.height;
        const layoutChanged = actor.layoutVersion !== layoutVersion;
        if (poseChanged || layoutChanged) {
          image.style.height = `${actorScale * geometry.height}px`;
          image.style.bottom = `${(character === 'right' ? castHeight * .32 : 0) - (geometry.height - foot) * actorScale}px`;
          image.style.transformOrigin = `${anchor}% ${foot / geometry.height * 100}%`;
          actor.frameIndex = frameIndex; actor.layoutVersion = layoutVersion;
          if (character === 'right') {
            cabinet.style.width = `${266 * cabinetScale}px`; cabinet.style.height = `${425 * cabinetScale}px`;
            cabinet.style.left = `${actor.anchorPosition}px`; cabinet.style.top = `${castHeight * .68}px`;
            cabinet.dataset.actorFrame = String(frameIndex);
          }
        }
        const enter = reducedMotion ? 1 : Math.min(1, (now - actor.entered) / 460);
        const settle = 1 - (1 - enter) ** 3;
        const breathing = reducedMotion ? 0 : Math.sin(elapsed / 380 + index * 1.9) * 1.4;
        const releaseAt = actor.releaseFrame / (sprites.length - 1) * .62;
        const recoilProgress = (phase - releaseAt) / (.62 * 3 / (sprites.length - 1));
        const recoil = reducedMotion || recoilProgress < 0 || recoilProgress > 1 ? 0 : Math.sin(recoilProgress * Math.PI) * 3;
        const shiftProgress = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - leftShiftStarted) / 320));
        const tierShift = character === 'left' && tier >= 2 ? -castWidth * .03 * (1 - (1 - shiftProgress) ** 3) : 0;
        const enterX = (1 - settle) * (index === 1 ? 95 : -75) + tierShift, enterY = (1 - settle) * 60 + breathing + recoil;
        const actorZoom = .96 + settle * .04;
        image.style.transform = `translate(calc(${-anchor}% + ${enterX}px),${enterY}px) scale(${facing * actorZoom},${actorZoom})`;
        if (character === 'right') {
          cabinet.style.transform = `translate(${enterX - 76 * cabinetScale}px,${enterY - 16 * cabinetScale}px)`;
          cabinet.style.opacity = String(enter);
          image.dataset.seat = `${actor.anchorPosition + enterX},${castHeight * .68 + enterY}`;
        }
        const attachmentX = geometry.attachmentX ?? anchorX, attachmentY = geometry.attachmentY ?? foot;
        const flashActive = !reducedMotion && tier >= 4 && frameIndex === actor.releaseFrame;
        const flashX = actor.anchorPosition + enterX + (attachmentX - anchorX) * actorScale * facing * actorZoom - actor.flashWidth / 2;
        const flashY = (character === 'right' ? castHeight * .68 : castHeight) + enterY + (attachmentY - foot) * actorScale * actorZoom - actor.flashHeight / 2;
        if (flashActive) flash.style.transform = `translate(${flashX}px,${flashY}px) scale(.7)`;
        if (flashActive !== actor.flashActive) { flash.dataset.active = String(flashActive); actor.flashActive = flashActive; }
      }
    }
    function tick(now: number) {
      if (closed) return;
      if (!completed) {
        const progress = Math.min(1, (now - started) / duration);
        const gates = [0, ...[100, 500, 1000].filter(value => value < ratio), ratio];
        // Give every reached celebration a readable interval, including a max win.
        const position = progress * (gates.length - 1);
        const section = Math.min(gates.length - 2, Math.floor(position));
        const amount = (gates[section] + (gates[section + 1] - gates[section]) * (position - section)) * round.betCents;
        paint(Math.min(round.payoutCents, Math.floor(amount)));
        if (progress === 1) finish();
      }
      animateActors(now);
      frame = requestAnimationFrame(tick);
    }
    activeCounter = finish;
    muteButton.addEventListener('click', () => { audio.setMuted(!audio.muted); persistSettings(); updateHUD(); muteButton.innerHTML = icon(audio.muted ? 'muted' : 'sound'); });
    continueButton.addEventListener('click', finish);
    frame = requestAnimationFrame(tick);
  });
}

function paylineChart() {
  if (!PAYLINE_REFERENCE_READY) return `<p class="payline-reference-notice">${t('Точната схема на печелившите линии очаква предоставената референция.', 'The exact payline chart is waiting for the supplied reference.')}</p>`;
  const columnWidth = 20, rowHeight = 17, margin = 6;
  const width = CONFIG.reels * columnWidth + margin * 2;
  const height = CONFIG.rows * rowHeight + margin * 2;
  return `<section class="payline-section" aria-labelledby="payline-heading"><h3 id="payline-heading">${t('ПЕЧЕЛИВШИ ЛИНИИ', 'PAYLINES')} · ${PAYLINES.length}</h3><div class="payline-chart">${PAYLINES.map((line, index) => {
    const cells = Array.from({ length: CONFIG.reels * CONFIG.rows }, (_, position) => {
      const reel = Math.floor(position / CONFIG.rows), row = position % CONFIG.rows;
      return `<rect x="${margin + reel * columnWidth + 1}" y="${margin + row * rowHeight + 1}" width="${columnWidth - 2}" height="${rowHeight - 2}" rx="1" class="${line[reel] === row ? 'line-cell active' : 'line-cell'}"/>`;
    }).join('');
    const points = line.map((row, reel) => `${margin + reel * columnWidth + columnWidth / 2},${margin + row * rowHeight + rowHeight / 2}`).join(' ');
    return `<figure class="payline-diagram" data-payline="${index + 1}"><figcaption>${t('ЛИНИЯ', 'LINE')} ${index + 1}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${t('Линия', 'Line')} ${index + 1}: ${line.map(row => row + 1).join(', ')}">${cells}<polyline points="${points}"/></svg></figure>`;
  }).join('')}</div></section>`;
}
function showRules() {
  const counts = [3, 4, 5, 6] as const;
  const rows = Object.entries(CONFIG.paytable).map(([symbol, values]) => `<tr><td>${symbolName(symbol)}</td>${counts.map(count => `<td>${values[count]}×</td>`).join('')}</tr>`).join('') + `<tr class="wild-paytable-row"><td>Wild</td><td>—</td><td>—</td><td>—</td><td>${CONFIG.wildLinePay}×</td></tr>`;
  const lineCount = PAYLINE_REFERENCE_READY ? String(PAYLINES.length) : t('очаквана схема', 'chart pending');
  openDialog(`${closeButton()}<h2 id="modal-title">${t('ПРАВИЛА НА БАНДАТА', 'CREW RULES')}</h2><div class="rules-copy"><p>${t(`${CONFIG.reels} барабана × ${CONFIG.rows} реда · ${lineCount} фиксирани печеливши линии. Три или повече еднакви символа на последователни барабани от най-левия печелят по линия. Всяка линия изплаща само най-дългото си съвпадение и трябва да съдържа поне ${CONFIG.minimumNaturalSymbols} обикновен символ от същия вид; активните Wild символи заместват останалите. Всяка печеливша линия се изплаща отделно. Общите печеливши полета се изчистват само веднъж и нови символи падат отгоре.`, `${CONFIG.reels} reels × ${CONFIG.rows} rows · ${lineCount} fixed paylines. Three or more matching symbols on consecutive reels from the leftmost reel pay on a line. Each line pays only its longest match and must contain at least ${CONFIG.minimumNaturalSymbols} regular symbol of that type; active Wilds substitute for the rest. Every winning line pays separately. Shared winning cells clear only once, then new symbols drop from above.`)}</p><p>${t(`Изключение: шест активни Wild символа по една линия изплащат една Wild печалба ${CONFIG.wildLinePay}× основния залог, преди глобалния множител. Три, четири или пет Wild символа без обикновен символ не изплащат отделна Wild печалба.`, `Exception: six active Wilds on a line pay one Wild award of ${CONFIG.wildLinePay}× the base bet, before the global multiplier. Three, four or five Wilds without a regular symbol do not pay a separate Wild award.`)}</p><table class="paytable"><caption>${t('Печалба по линия × основния залог, преди глобалния множител', 'Line award × base bet, before the global multiplier')}</caption><thead><tr><th>${t('СИМВОЛ', 'SYMBOL')}</th>${counts.map(count => `<th>${count}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${paylineChart()}<p>${t('Дивият хвърля Wild символи. В Русенско Варено и ОТ СТАРОТО неговите Wild символи остават до края на бонуса. След участие в печелившо съвпадение почиват за останалите падания и се активират отново при следващото завъртане.', 'The Wild One throws Wilds. His Wilds remain throughout Русенско Варено and ОТ СТАРОТО. After contributing to a winning batch, they rest for the remaining tumbles and reactivate on the next spin.')}</p><p>${t('Стрелецът е рядък разгръщащ се Wild: когато падне, целият му барабан става Wild с разкрит множител. В едно завъртане могат да паднат няколко Стрелци и да разгърнат различни барабани. Множителят се прилага върху Wild символите на неговия барабан; съществуващите Wild множители там също се умножават. Първо се разгръщат всички барабани със Стрелец, след което всеки Стрелец има шанс за последващи изстрели по случайни обикновени или Wild символи. Попадение в обикновен символ го превръща в еднократен Wild ×1; повторно попадение в обикновен Wild удвоява множителя на това поле.', 'The Shooter is a rare expanding Wild: when he lands, his whole reel becomes Wild with a revealed multiplier. Multiple Shooters can land in one spin and expand different reels. His multiplier applies to the Wilds on his own reel, multiplying existing Wild values there as well. All Shooter reels expand first, then each Shooter has a chance to fire follow-up shots at random regular or Wild symbols. A regular symbol becomes a single-use ×1 Wild; a repeat hit on an ordinary Wild doubles that cell’s multiplier.')}</p><p>${t('В бонус всеки разгънат Wild барабан остава лепкав до края на бонуса още от разгръщането — не е нужен изстрел. Героят остава върху осветения барабан; табелката на последния ред показва сумата от всичките му пет множителя, включително почиващите Wild символи. След участие в печелившо съвпадение лепкавите Wild символи почиват за останалите падания и се активират отново при следващото безплатно завъртане. Няколко барабана могат да останат едновременно. Попадение в разгрънат Wild барабан удвоява множителите на всичките му пет полета и обновява общата му стойност. В основната игра разгръщането и усилването са само за текущия рунд; Wild символите се изчистват при печалба и не се пренасят в следващ рунд или задействан бонус. Сумата от всички активни Wild множители образува глобалния множител, минимум ×1. Почиващите Wild символи са включени в табелката на барабана, но не и в текущия глобален множител.', 'During a bonus, every expanded Wild reel stays sticky from the moment it expands until the bonus ends; no shot is needed. The Shooter remains on the highlighted reel, and the last-row plate shows the sum of all five retained cell multipliers, including resting Wilds. After contributing to a winning batch, sticky Wilds rest for the remaining tumbles and reactivate on the next free spin. Multiple reels can remain together. A hit on an expanded Wild reel doubles all five cell multipliers and updates its reel total. In the base game, expansion and boosts apply to the current round only: winning Wilds clear and do not carry to another round or a triggered bonus. All active Wild multipliers sum into the global multiplier, with a minimum of ×1. Resting Wilds remain in their reel-total plate but are excluded from the current global multiplier.')}</p><p>${t('Героите и Scatter символите падат само при първоначалното падане; максимум един Scatter на барабан. Събирачът изчаква печелившите падания, бележи изчистените печеливши полета и разкрива монети върху тях. Когато монетната функция се задейства, всяко отбелязано поле разкрива стойност, събирач или множител — няма празно разкриване. Първо се разкриват всички стойности и ефекти. След това се прилагат множителите и новите събирачи прибират стойностите. Събраните монети изчезват, събирачите остават, а освободените отбелязани полета се разкриват отново. Нов събирач прибира и предишните събирачи. Накрая се изплащат само останалите стойности, без двойно изплащане. Само ОТ СТАРОТО позволява и тримата герои в един бонус.', 'Characters and Scatters land only in the initial drop, with at most one Scatter per reel. The Collector waits for winning tumbles, marks cleared winning cells and reveals coins on those marks. When the coin feature triggers, every marked cell reveals a value, collector or modifier; there are no empty reveals. All values and effects reveal first. Modifiers apply next, then new collectors collect the values. Collected coins leave, collectors remain, and cleared marked positions reveal again. A new collector also collects previous collectors. Only the terminal values are paid, without paying collected coins twice. Only ОТ СТАРОТО permits all three characters together in a bonus.')}</p><p>${t('В основната игра 3 / 4 / 5 / 6 Scatter символа задействат Русенско Варено / ЛУКС / Ръба са обажда / ОТ СТАРОТО: 10 завъртания или 15 в супер бонуса. В бонус 2 Scatter добавят 2 завъртания; 3–5 добавят 5; 6 добавят 10. 4 / 5 / 6 надграждат до ЛУКС / Ръба са обажда / ОТ СТАРОТО, без да понижават активен по-висок бонус.', 'In the base game, 3 / 4 / 5 / 6 Scatters trigger Русенско Варено / ЛУКС / Ръба са обажда / ОТ СТАРОТО: 10 spins, or 15 in the super bonus. In a bonus, 2 Scatters add 2 spins, 3–5 add 5 and 6 add 10. 4 / 5 / 6 upgrade to ЛУКС / Ръба са обажда / ОТ СТАРОТО without downgrading an active higher tier.')}</p><p>${t('X BET · 5× ШАНС увеличава шанса за задействане на бонус пет пъти срещу цена 3× основния залог. Избраното усилване се прилага при всяко ново завъртане. Останалите X BET опции гарантират избрания герой само за потвърдения рунд. При GOD SPIN MAX WIN е символ в решетката. Бандата стреля по случайни полета и само попадение в него плаща 19 999×. Лимитът за целия рунд е 19 999× основния залог. Това е прототип с виртуални кредити.', 'X BET · 5× CHANCE increases the full bonus-trigger chance fivefold for a cost of 3× the base bet. The selected boost applies to each new spin. Other X BET choices guarantee the chosen character for the confirmed round only. In GOD SPIN, MAX WIN is a symbol in the grid. The crew shoots at random cells; only a hit on that symbol pays 19,999×. The whole-round cap is 19,999× the base bet. This is a virtual-credit prototype.')}</p><p>${t(`Теоретична възвръщаемост: ${(CONFIG.targetRtp * 100).toFixed(1)}% за всеки предлаган платен режим, спрямо цялата му цена. Това е дългосрочно очакване, а не гаранция за всяка игра или серия. Усилването на бонуса променя шанса от 1 на ${CONFIG.bonusTriggerDenominator} до 1 на ${CONFIG.boostedBonusTriggerDenominator}.`, `Theoretical return: ${(CONFIG.targetRtp * 100).toFixed(1)}% for every offered paid mode, measured against its full cost. This is a long-term expectation, not a guarantee for a session or sequence. The bonus boost changes the trigger chance from 1 in ${CONFIG.bonusTriggerDenominator} to 1 in ${CONFIG.boostedBonusTriggerDenominator}.`)}</p></div>`); bindClose();
}

function symbolName(symbol: string) {
  const names: Record<string, [string, string]> = { bottle: ['Бутилка', 'Bottle'], cash: ['Пари', 'Cash'], chain: ['Ланец', 'Chain'], cassette: ['Касетка', 'Cassette'], sneaker: ['Кец', 'Sneaker'], crown: ['Корона', 'Crown'], lighter: ['Запалка', 'Lighter'], dice: ['Зарове', 'Dice'], ring: ['Пръстен', 'Ring'] };
  return names[symbol] ? t(...names[symbol]) : symbol;
}
function showHistory() {
  openDialog(`${closeButton()}<h2 id="modal-title">${t('ПОСЛЕДНИ РУНДОВЕ', 'RECENT ROUNDS')}</h2><div class="history-list">${session.history.slice().reverse().slice(0, 12).map(round => `<article><strong>#${round.id} · ${textSafe(featureName(round.choice))}</strong><span>${t('Цена', 'Cost')} ${euros(round.costCents)} → <b>${euros(round.payoutCents)}</b></span></article>`).join('') || `<p>${t('Още няма рундове.', 'No rounds yet.')}</p>`}</div>`); bindClose();
}

function showSettings() {
  openDialog(`${closeButton()}<h2 id="modal-title">${t('НАСТРОЙКИ', 'SETTINGS')}</h2><div class="settings-body"><label>${t('Език', 'Language')}<select id="settings-language"><option value="bg"${language === 'bg' ? ' selected' : ''}>Български</option><option value="en"${language === 'en' ? ' selected' : ''}>English</option></select></label><label>${t('Сила на звука', 'Volume')}<input id="volume" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}"></label><label class="checkbox-label"><input id="default-music" type="checkbox"${audio.defaultMusic ? ' checked' : ''}>${t('Музика', 'Music')}</label><div class="settings-actions"><button id="reset-credits">${t('НОВИ ВИРТУАЛНИ КРЕДИТИ', 'RESET VIRTUAL CREDITS')}</button></div></div>`);
  bindClose();
  $('settings-language').addEventListener('change', event => { language = (event.target as HTMLSelectElement).value as Language; persistSettings(); updateHUD(); showSettings(); });
  $('volume').addEventListener('input', event => { audio.setVolume(Number((event.target as HTMLInputElement).value) / 100); persistSettings(); });
  $('default-music').addEventListener('change', event => { audio.setDefaultMusic((event.target as HTMLInputElement).checked); persistSettings(); });
  $('reset-credits').addEventListener('click', () => {
    openDialog(`<h2 id="modal-title">${t('НОВА ИГРА?', 'NEW GAME?')}</h2><p>${t('Виртуалният баланс и историята ще бъдат нулирани.', 'Virtual balance and history will be reset.')}</p><div class="dialog-actions"><button id="reset-cancel">${t('ОТКАЗ', 'CANCEL')}</button><button id="reset-confirm" class="primary">${t('НОВА ИГРА', 'NEW GAME')}</button></div>`);
    $('reset-cancel').addEventListener('click', showSettings);
    $('reset-confirm').addEventListener('click', () => { try { saveSession(freshSession()); fixtureMode = false; displayedBalance = session.balanceCents; renderer.setIdle(); $('win').textContent = euros(0); $('bonus-status').hidden = true; $('global').textContent = '×1'; $('cast-status').textContent = ''; updateHUD(); closeDialog(); } catch (error) { toast(error instanceof Error ? error.message : String(error)); } });
  });
}

function requestSpin() {
  if (busy || session.pending || modal.open) return;
  if (selectedXbet === 'boost') void start({ kind: 'boost' });
  else if (selectedXbet === 'off') void start({ kind: 'spin' });
  else confirmChoice({ kind: 'xbet', character: selectedXbet });
}
$('spin').addEventListener('click', requestSpin);
$('buy').addEventListener('click', showBuyMenu); $('god').addEventListener('click', () => confirmChoice({ kind: 'god' }));
$('settings').addEventListener('click', showSettings); $('rules').addEventListener('click', showRules); $('history').addEventListener('click', showHistory);
$('language').addEventListener('click', () => { language = language === 'bg' ? 'en' : 'bg'; persistSettings(); updateHUD(); });
$('turbo').addEventListener('click', () => { turbo = !turbo; persistSettings(); updateHUD(); });
$('mute').addEventListener('click', () => { audio.setMuted(!audio.muted); void audio.unlock().catch(() => {}); persistSettings(); updateHUD(); });
$('bet').addEventListener('change', event => { try { saveSession({ ...session, betCents: Number((event.target as HTMLSelectElement).value) }); updateHUD(); } catch (error) { toast(error instanceof Error ? error.message : String(error)); updateHUD(); } });
$('xbet').addEventListener('change', event => { selectedXbet = (event.target as HTMLSelectElement).value as typeof selectedXbet; persistSettings(); updateHUD(); });
function editableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return !!element && (/INPUT|SELECT|TEXTAREA/.test(element.tagName) || element.isContentEditable);
}
// Never skip a paid round from the board or keyboard. Space is one deliberate action
// per release; prevent native button activation as well as OS auto-repeat.
window.addEventListener('keydown', event => {
  if (event.code === 'Enter' && event.repeat && (event.target as HTMLElement)?.closest?.('button')) { event.preventDefault(); return; }
  if (event.code !== 'Space' || editableTarget(event.target)) return;
  event.preventDefault();
  if (event.repeat || spaceHeld) return;
  spaceHeld = true;
  const button = (event.target as HTMLElement)?.closest?.('button');
  if (modal.open) { if (button && modal.contains(button) && !button.disabled) button.click(); return; }
  if (busy) return;
  if (button) { if (!button.disabled) button.click(); }
  else requestSpin();
}, { capture: true });
window.addEventListener('keyup', event => {
  if (event.code !== 'Space') return;
  if (!editableTarget(event.target)) event.preventDefault();
  spaceHeld = false;
}, { capture: true });
// A lost keyup cannot leave the interface locked after tabbing away. OS repeat
// remains blocked even after blur, so returning while held never starts a round.
window.addEventListener('blur', () => { spaceHeld = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) spaceHeld = false; });
void audio.initialize().catch(() => { /* Sound failure cannot block a paid round. */ });
updateHUD();
const lastSpin = session.history.at(-1)?.spins.at(-1);
renderer.setIdle(lastSpin?.finalGrid, lastSpin?.finalWildMultipliers, lastSpin?.marks, lastSpin?.inactiveWilds, lastSpin?.finalExpandedReels);
$('global').textContent = `×${renderer.inspect().global.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-IE')}`;
$('win').textContent = euros(session.history.at(-1)?.payoutCents ?? 0);
if (startupWarning) {
  const notices: Record<string, [string, string]> = {
    invalid: ['Записът не може да бъде прочетен. Започната е нова виртуална игра.', 'The save could not be read. A new virtual game has started.'],
    storage: ['Разреши локално съхранение, за да играеш.', 'Enable browser storage to play.'],
    'legacy-wallet': ['Нова версия с лепкави бонус барабани. Виртуалният баланс е прехвърлен; старите рундове са запазени отделно и не са преизчислени.', 'New sticky-bonus-reel version. Your virtual balance was carried over; previous rounds remain preserved separately and have not been reinterpreted.'],
    'legacy-storage': ['Старият запис е запазен. Разреши локално съхранение, за да запазим прехвърления виртуален баланс.', 'The previous save is preserved. Enable browser storage to save the carried virtual balance.'],
    'legacy-pending': ['Нова виртуална игра. Незавършеният рунд от старата версия е запазен отделно.', 'A new virtual game has started. The unfinished round from the previous version is preserved separately.'],
    'legacy-invalid': ['Нова виртуална игра. Старият запис е запазен отделно и не е променен.', 'A new virtual game has started. The previous save is preserved separately and unchanged.'],
  };
  toast(t(...notices[startupWarning]));
}
if (session.pending) {
  displayedBalance = session.balanceCents - session.pending.payoutCents;
  void replay(session.pending);
}

if (import.meta.env.DEV) {
  (window as Window & { __ruse?: unknown }).__ruse = {
    snapshot: () => structuredClone({ ...session, busy, displayedBalance, language, turbo, selectedXbet, spaceHeld }),
    reset: (seed?: number, balance?: number) => {
      if (busy) throw new Error('Round in progress');
      fixtureMode = typeof seed === 'number';
      saveSession(createSession(seed, balance)); displayedBalance = session.balanceCents; renderer.setIdle(); updateHUD();
    },
    skip: () => activeCounter ? activeCounter() : renderer.skip(),
    board: () => renderer.inspect(),
  };
}
