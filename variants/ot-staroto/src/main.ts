import './style.css';
import oswaldURL from '../public/Oswald.ttf?url&inline';
import { AudioDirector, type AudioSlot } from './audio';
import { characterURL } from './art';
import { CONFIG, TIER_ORDER, BONUS_NAMES, TIER_CHARACTERS, costCents, createSession, playRound, acknowledgeRound, deserializeSession } from './engine';
import { GameRenderer } from './renderer';
import type { Character, Choice, Round, Session, Tier } from './types';

type Language = 'bg' | 'en';
const SESSION_KEY = 'ot-staroto-session-v1';
const SETTINGS_KEY = 'ot-staroto-settings-v1';
const CHARACTERS: Character[] = ['left', 'middle', 'right'];
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
const audio = new AudioDirector();

try {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
  language = settings.language === 'en' ? 'en' : 'bg'; turbo = settings.turbo === true;
  audio.muted = settings.muted === true;
  if (typeof settings.volume === 'number') audio.volume = Math.max(0, Math.min(1, settings.volume));
  audio.defaultMusic = settings.defaultMusic !== false;
} catch { /* Preferences remain usable when browser storage is unavailable. */ }

let startupWarning = '';
let session: Session;
function freshSession() {
  const seed = new Uint32Array(1);
  try { crypto.getRandomValues(seed); } catch { seed[0] = Date.now() >>> 0; }
  return createSession(seed[0]);
}
try {
  const raw = localStorage.getItem(SESSION_KEY);
  session = raw ? deserializeSession(raw) ?? freshSession() : freshSession();
  if (raw && !deserializeSession(raw)) startupWarning = 'invalid';
} catch { session = freshSession(); startupWarning = 'storage'; }
displayedBalance = session.balanceCents;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell" id="game-shell">
    <header class="masthead"><div class="edition">РУСЕНСКИ ДВОР · RUSE YARD</div><h1>ОТ СТАРОТО</h1><div class="header-controls"><button id="language" class="small-button" aria-label="Change language">EN</button><button id="settings" class="small-button" aria-label="Settings">☰</button></div></header>
    <section class="stage" aria-label="Slot game"><canvas id="game" width="1240" height="900" tabindex="0" role="img" aria-label="Six reels, five rows"></canvas><div class="bonus-status" id="bonus-status" hidden><span id="bonus-name"></span><strong><span id="remaining">0</span><small id="remaining-label"></small></strong></div><div class="multiplier-status"><small id="global-label"></small><strong id="global">×1</strong></div><div class="cast-status" id="cast-status" aria-live="polite"></div></section>
    <section class="hud" aria-label="Game controls"><div class="meter"><small id="balance-label"></small><strong id="balance">€0.00</strong></div><label class="meter stake"><small id="stake-label"></small><select id="bet" aria-label="Bet"></select></label><div class="meter win-meter"><small id="win-label"></small><strong id="win">€0.00</strong></div><button id="spin" class="spin-button">▶︎</button><button id="turbo" class="small-button" aria-pressed="false">≫</button><button id="mute" class="small-button" aria-pressed="false">♪</button></section>
    <nav class="feature-bar"><button id="buy" class="feature-button"></button><label class="xbet-control"><span>X BET</span><select id="xbet" aria-label="Guaranteed character"></select></label><button id="god" class="feature-button danger"></button></nav>
    <footer><span id="demo-label"></span><button id="rules" class="text-button"></button><button id="history" class="text-button"></button></footer>
  </main><div id="toast" role="status" aria-live="polite" hidden></div><dialog id="modal" aria-labelledby="modal-title"></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const modal = $<HTMLDialogElement>('modal');
const canvas = $<HTMLCanvasElement>('game');
const renderer = new GameRenderer(canvas, {
  onUpdate(view) {
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
renderer.setLanguage(language);
void fontReady.then(() => renderer.setLanguage(language)).catch(() => {});

function euros(cents: number) { return new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100); }
function characterName(character: Character) { return character === 'left' ? t('Дивият', 'The Wild One') : character === 'middle' ? t('Стрелецът', 'The Shooter') : t('Събирачът', 'The Collector'); }
function featureName(choice: Choice) { return choice.kind === 'buy' ? BONUS_NAMES[choice.tier] : choice.kind === 'god' ? 'GOD SPIN' : choice.kind === 'xbet' ? `X BET · ${characterName(choice.character)}` : t('Завъртане', 'Spin'); }
function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language, turbo, muted: audio.muted, volume: audio.volume, defaultMusic: audio.defaultMusic })); } catch { /* Non-financial preferences work for this tab. */ }
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
  $('buy').textContent = t('КУПИ БОНУС', 'BUY BONUS'); $('god').textContent = `GOD · ${CONFIG.godCost.toLocaleString()}×`;
  $('rules').textContent = t('ПРАВИЛА', 'RULES'); $('history').textContent = t('ИСТОРИЯ', 'HISTORY');
  $('demo-label').textContent = t('ВИРТУАЛНИ КРЕДИТИ · МАКС. 19 999×', 'VIRTUAL CREDITS · MAX. 19,999×');
  $('spin').setAttribute('aria-label', t('Завърти', 'Spin'));
  $('settings').setAttribute('aria-label', t('Настройки', 'Settings'));
  $('turbo').setAttribute('aria-label', t('Турбо', 'Turbo')); $('turbo').setAttribute('aria-pressed', String(turbo));
  $('mute').setAttribute('aria-label', audio.muted ? t('Включи звука', 'Unmute') : t('Изключи звука', 'Mute')); $('mute').setAttribute('aria-pressed', String(audio.muted)); $('mute').textContent = audio.muted ? '♩̸' : '♪';
  const bets = $<HTMLSelectElement>('bet');
  bets.innerHTML = CONFIG.betsCents.map(bet => `<option value="${bet}"${bet === session.betCents ? ' selected' : ''}>${euros(bet)}</option>`).join('');
  const xbet = $<HTMLSelectElement>('xbet'); const selected = xbet.value;
  xbet.innerHTML = `<option value="off">${t('ИЗКЛ.', 'OFF')}</option>` + CHARACTERS.map(character => `<option value="${character}">${characterName(character)} · ${costCents(100, { kind: 'xbet', character }) / 100}×</option>`).join('');
  if (['left', 'middle', 'right'].includes(selected)) xbet.value = selected;
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
function closeButton() { return `<button id="dialog-close" class="dialog-close" aria-label="${t('Затвори', 'Close')}">×</button>`; }
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
  return tier === 'ruse' ? t('Дивият хвърля лепкави Wild символи.', 'The Wild One throws sticky Wilds.') : tier === 'lux' ? t('Събирачът бележи печелившите полета и разкрива монети.', 'The Collector marks winning cells and reveals coins.') : tier === 'edge' ? t('Стрелецът създава Wild символи; повторен изстрел удвоява.', 'The Shooter creates Wilds; repeat shots double them.') : t('И тримата. Всички три ефекта в един бонус.', 'All three characters. All three effects in one bonus.');
}
function confirmChoice(choice: Choice) {
  const cost = costCents(session.betCents, choice);
  openDialog(`<h2 id="modal-title">${textSafe(featureName(choice))}</h2><p>${choice.kind === 'god' ? t('Колата пристига. Ако изстрелите улучат MAX WIN: 19 999×.', 'The car arrives. Hit the MAX WIN target for 19,999×.') : choice.kind === 'buy' ? tierDescription(choice.tier) : t('Гарантирано пада избраният герой.', 'The chosen character is guaranteed to land.')}</p><div class="confirm-price">${euros(cost)}</div><p class="fine">${t('Залог', 'Bet')}: ${euros(session.betCents)} · ${t('Виртуални кредити', 'Virtual credits')}</p><div class="dialog-actions"><button id="confirm-cancel">${t('ОТКАЗ', 'CANCEL')}</button><button id="confirm-play" class="primary" data-focus>${t('ИГРАЙ', 'PLAY')}</button></div>`);
  $('confirm-cancel').addEventListener('click', closeDialog);
  $('confirm-play').addEventListener('click', () => { closeDialog(); void start(choice); });
}
async function start(choice: Choice) {
  if (busy || session.pending) return;
  busy = true; updateHUD();
  try { await audio.unlock(); } catch { /* Audio failure cannot block play. */ }
  const previous = session;
  let next: Session;
  try { next = playRound(previous, choice); saveSession(next); }
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
  return new Promise<void>(resolve => {
    const ratio = round.payoutCents / round.betCents;
    let frame = 0; let completed = false; let tier = 0; const started = performance.now();
    // Slow enough to read, short enough that ordinary wins do not stall play.
    const duration = turbo ? Math.min(2700, 650 + Math.log2(1 + ratio) * 110) : Math.min(6500, 1300 + Math.log2(1 + ratio) * 260);
    openDialog(`<div class="win-scene" id="win-scene"><button id="win-mute" class="dialog-close" aria-label="${t('Звук', 'Sound')}">${audio.muted ? '♩̸' : '♪'}</button><h2 id="modal-title">${t('ПЕЧАЛБА', 'WIN')}</h2><div class="win-cast">${CHARACTERS.map(character => `<img class="win-person ${character}" src="${characterURL(character)}" alt="${characterName(character)}">`).join('')}</div><div class="muzzle-flashes"><i></i><i></i><i></i></div><strong id="win-counter">${euros(0)}</strong><span class="win-ratio" id="win-ratio">0×</span><div class="escape-car" aria-hidden="true"><svg viewBox="0 0 360 160"><path d="M30 105 45 68 98 64 140 26 246 26 286 69 330 82 339 115 20 115Z" fill="#ddd" stroke="#171717" stroke-width="8"/><path d="m122 63 30-27h47v29zm90-27h25l29 27h-54z" fill="#111"/><circle cx="82" cy="119" r="24" fill="#111" stroke="#eee" stroke-width="8"/><circle cx="284" cy="119" r="24" fill="#111" stroke="#eee" stroke-width="8"/><path d="M226 19v-22m5 14 25-25m-8 35 38-9" stroke="#ed3028" stroke-width="10"/></svg></div><button id="win-continue" class="primary" data-focus>${t('ПРЕСКОЧИ', 'SKIP')}</button></div>`, 'win-dialog');
    void audio.cue('win');
    function paint(value: number) {
      const reached = value / round.betCents;
      const nextTier = reached >= 1000 ? 4 : reached >= 500 ? 3 : reached >= 100 ? 2 : 1;
      if (nextTier !== tier) { tier = nextTier; $('win-scene').dataset.tier = String(tier); if (tier > 1) void audio.cue(tier >= 4 ? 'shot' : 'feature'); }
      $('win-counter').textContent = euros(value); $('win-ratio').textContent = `${(value / round.betCents).toLocaleString(language === 'bg' ? 'bg-BG' : 'en-IE', { maximumFractionDigits: 2 })}×`;
    }
    function finish() {
      if (completed) { activeCounter = null; cancelAnimationFrame(frame); closeDialog(); resolve(); return; }
      completed = true; cancelAnimationFrame(frame); paint(round.payoutCents);
      if (round.maxWin) { $('win-scene').classList.add('max-win'); $('modal-title').textContent = 'MAX WIN · 19 999×'; void audio.cue('max'); }
      $('win-continue').textContent = t('ПРОДЪЛЖИ', 'CONTINUE');
    }
    function tick(now: number) {
      const progress = Math.min(1, (now - started) / duration);
      const gates = [0, ...[100, 500, 1000].filter(value => value < ratio), ratio];
      // Give every reached celebration a readable interval, including a max win.
      const position = progress * (gates.length - 1);
      const section = Math.min(gates.length - 2, Math.floor(position));
      const amount = (gates[section] + (gates[section + 1] - gates[section]) * (position - section)) * round.betCents;
      paint(Math.min(round.payoutCents, Math.floor(amount)));
      if (progress === 1) finish(); else frame = requestAnimationFrame(tick);
    }
    activeCounter = finish;
    $('win-mute').addEventListener('click', () => { audio.setMuted(!audio.muted); persistSettings(); updateHUD(); $('win-mute').textContent = audio.muted ? '♩̸' : '♪'; });
    $('win-continue').addEventListener('click', finish);
    frame = requestAnimationFrame(tick);
  });
}

function showRules() {
  const rows = Object.entries(CONFIG.paytable).map(([symbol, values]) => `<tr><td>${symbolName(symbol)}</td><td>${values[8]}×</td><td>${values[10]}×</td><td>${values[12]}×</td></tr>`).join('');
  openDialog(`${closeButton()}<h2 id="modal-title">${t('ПРАВИЛА НА ДВОРА', 'YARD RULES')}</h2><div class="rules-copy"><p>${t(`6 барабана × 5 реда. 8 или повече еднакви символа навсякъде печелят, включително поне ${CONFIG.minimumNaturalSymbols} обикновени символа от същия вид; Wild замества останалите. Печелившите символи изчезват и нови падат отгоре.`, `6 reels × 5 rows. Eight or more matching symbols anywhere pay, including at least ${CONFIG.minimumNaturalSymbols} regular symbols of that type; Wild substitutes for the rest. Winning symbols leave and new ones drop from above.`)}</p><table><thead><tr><th>${t('СИМВОЛ', 'SYMBOL')}</th><th>8–9</th><th>10–11</th><th>12+</th></tr></thead><tbody>${rows}</tbody></table><p>${t('Дивият хвърля Wild символи. В Русенско Варено неговите Wild символи остават до края на бонуса. Стрелецът стреля в случайни полета; повторно попадение в Wild удвоява множителя му. Сумата от видимите Wild множители образува глобален множител, минимум ×1; в неговия бонус изстрелите се нулират между завъртанията.', 'The Wild One throws Wilds, which remain throughout Русенско Варено. The Shooter targets cells; a repeat hit doubles a Wild multiplier. Visible Wild multipliers sum into a global multiplier of at least ×1; his bonus resets shots between spins.')}</p><p>${t('Героите и Scatter символите падат само при първоначалното падане; максимум един Scatter на барабан. Събирачът изчаква изчистването на печелившите символи, бележи полетата им и разкрива монети върху тях: 1–500×, събирач, множител или глобален множител за монетите. Само ОТ СТАРОТО позволява и тримата герои в един бонус.', 'Characters and Scatters land only in the initial drop, with at most one Scatter per reel. The Collector waits for winning symbols to clear, marks their cells and reveals coins on them: 1–500× values, collectors, multipliers or a global coin multiplier. Only ОТ СТАРОТО permits all three characters together in a bonus.')}</p><p>${t('В основната игра 3 / 4 / 5 / 6 Scatter символа задействат Русенско Варено / ЛУКС / Ръба са обажда / ОТ СТАРОТО: 10 завъртания или 15 в супер бонуса. В бонус 2 Scatter добавят 2 завъртания; 3–5 добавят 5; 6 добавят 10. 4 / 5 / 6 надграждат до ЛУКС / Ръба са обажда / ОТ СТАРОТО, без да понижават активен по-висок бонус.', 'In the base game, 3 / 4 / 5 / 6 Scatters trigger Русенско Варено / ЛУКС / Ръба са обажда / ОТ СТАРОТО: 10 spins, or 15 in the super bonus. In a bonus, 2 Scatters add 2 spins, 3–5 add 5 and 6 add 10. 4 / 5 / 6 upgrade to ЛУКС / Ръба са обажда / ОТ СТАРОТО without downgrading an active higher tier.')}</p><p>${t('X BET гарантира избрания герой. GOD SPIN плаща 19 999× само ако изстрелът улучи MAX WIN. Лимитът за целия рунд е 19 999× основния залог. Това е прототип с виртуални кредити; възвръщаемостта не е сертифицирана.', 'X BET guarantees the chosen character. GOD SPIN pays 19,999× only when a shot hits MAX WIN. The whole-round cap is 19,999× the base bet. This is a virtual-credit prototype; return is not certified.')}</p></div>`); bindClose();
}
function symbolName(symbol: string) {
  const names: Record<string, [string, string]> = { bottle: ['Бутилка', 'Bottle'], cash: ['Пари', 'Cash'], chain: ['Ланец', 'Chain'], cassette: ['Касетка', 'Cassette'], sneaker: ['Кец', 'Sneaker'], crown: ['Корона', 'Crown'] };
  return names[symbol] ? t(...names[symbol]) : symbol;
}
function showHistory() {
  openDialog(`${closeButton()}<h2 id="modal-title">${t('ПОСЛЕДНИ РУНДОВЕ', 'RECENT ROUNDS')}</h2><div class="history-list">${session.history.slice().reverse().slice(0, 12).map(round => `<article><strong>#${round.id} · ${textSafe(featureName(round.choice))}</strong><span>${t('Цена', 'Cost')} ${euros(round.costCents)} → <b>${euros(round.payoutCents)}</b></span></article>`).join('') || `<p>${t('Още няма рундове.', 'No rounds yet.')}</p>`}</div>`); bindClose();
}

function showSettings() {
  const slots: AudioSlot[] = ['music', 'shot', 'win', 'feature'];
  const slotName = (slot: AudioSlot) => slot === 'music' ? t('Музика', 'Music') : slot === 'shot' ? t('Изстрели', 'Shots') : slot === 'win' ? t('Печалба', 'Win') : t('Ефекти', 'Features');
  const refreshAudio = () => { if (modal.open && document.getElementById('volume')) showSettings(); };
  const audioError = (message: string) => { const target = document.getElementById('audio-error'); if (target && modal.open) target.textContent = message; else toast(message); };
  openDialog(`${closeButton()}<h2 id="modal-title">${t('НАСТРОЙКИ', 'SETTINGS')}</h2><div class="settings-body"><label>${t('Език', 'Language')}<select id="settings-language"><option value="bg"${language === 'bg' ? ' selected' : ''}>Български</option><option value="en"${language === 'en' ? ' selected' : ''}>English</option></select></label><label>${t('Сила на звука', 'Volume')}<input id="volume" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}"></label><label class="checkbox-label"><input id="default-music" type="checkbox"${audio.defaultMusic ? ' checked' : ''}>${t('Синтезирана музика, когато няма избран файл', 'Synth music when no local music is selected')}</label><p class="fine">${t('Твоите аудио файлове остават само в този браузър. До 50 MB на файл.', 'Your audio files stay in this browser. Up to 50 MB per file.')}</p><div class="audio-slots">${slots.map(slot => `<div class="audio-slot"><strong>${slotName(slot)}</strong><span id="file-${slot}">${textSafe(audio.trackName(slot) ?? t('Вграден синтезатор', 'Bundled synth'))}</span><label class="file-button">${t('ИЗБЕРИ', 'CHOOSE')}<input data-audio="${slot}" type="file" accept="audio/*" aria-label="${slotName(slot)}"></label><button data-remove="${slot}"${audio.trackName(slot) ? '' : ' disabled'}>${t('МАХНИ', 'REMOVE')}</button></div>`).join('')}</div><p id="audio-error" role="status"></p><div class="settings-actions"><button id="reset-audio">${t('ИЗЧИСТИ АУДИОТО', 'RESET AUDIO')}</button><button id="reset-credits">${t('НОВИ ВИРТУАЛНИ КРЕДИТИ', 'RESET VIRTUAL CREDITS')}</button></div></div>`);
  bindClose();
  $('settings-language').addEventListener('change', event => { language = (event.target as HTMLSelectElement).value as Language; persistSettings(); updateHUD(); showSettings(); });
  $('volume').addEventListener('input', event => { audio.setVolume(Number((event.target as HTMLInputElement).value) / 100); persistSettings(); });
  $('default-music').addEventListener('change', event => { audio.setDefaultMusic((event.target as HTMLInputElement).checked); persistSettings(); });
  modal.querySelectorAll<HTMLInputElement>('[data-audio]').forEach(input => input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return; input.disabled = true;
    try { await audioReady; await audio.upload(input.dataset.audio as AudioSlot, file); refreshAudio(); }
    catch (error) {
      const reason = error instanceof Error ? error.message : '';
      audioError(reason === 'size' ? t('Избери непразен файл до 50 MB.', 'Choose a nonempty file up to 50 MB.') : reason === 'decode' ? t('Този файл не може да се прочете като аудио.', 'This file could not be decoded as audio.') : t('Не можем да запазим файла. Разреши съхранение в браузъра.', 'The file could not be saved. Enable browser storage.'));
      input.disabled = false; input.value = '';
    }
  }));
  modal.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.addEventListener('click', async () => {
    try { await audioReady; await audio.remove(button.dataset.remove as AudioSlot); refreshAudio(); }
    catch { audioError(t('Аудио съхранението е недостъпно.', 'Audio storage is unavailable.')); }
  }));
  $('reset-audio').addEventListener('click', async () => { try { await audioReady; await audio.reset(); refreshAudio(); } catch { audioError(t('Аудио съхранението е недостъпно.', 'Audio storage is unavailable.')); } });
  $('reset-credits').addEventListener('click', () => {
    openDialog(`<h2 id="modal-title">${t('НОВА ИГРА?', 'NEW GAME?')}</h2><p>${t('Виртуалният баланс и историята ще бъдат нулирани.', 'Virtual balance and history will be reset.')}</p><div class="dialog-actions"><button id="reset-cancel">${t('ОТКАЗ', 'CANCEL')}</button><button id="reset-confirm" class="primary">${t('НОВА ИГРА', 'NEW GAME')}</button></div>`);
    $('reset-cancel').addEventListener('click', showSettings);
    $('reset-confirm').addEventListener('click', () => { try { saveSession(freshSession()); displayedBalance = session.balanceCents; renderer.setIdle(); $('win').textContent = euros(0); $('bonus-status').hidden = true; $('global').textContent = '×1'; $('cast-status').textContent = ''; updateHUD(); closeDialog(); } catch (error) { toast(error instanceof Error ? error.message : String(error)); } });
  });
}

$('spin').addEventListener('click', () => {
  const selected = $<HTMLSelectElement>('xbet').value;
  if (selected !== 'off') confirmChoice({ kind: 'xbet', character: selected as Character }); else void start({ kind: 'spin' });
});
$('buy').addEventListener('click', showBuyMenu); $('god').addEventListener('click', () => confirmChoice({ kind: 'god' }));
$('settings').addEventListener('click', showSettings); $('rules').addEventListener('click', showRules); $('history').addEventListener('click', showHistory);
$('language').addEventListener('click', () => { language = language === 'bg' ? 'en' : 'bg'; persistSettings(); updateHUD(); });
$('turbo').addEventListener('click', () => { turbo = !turbo; persistSettings(); updateHUD(); });
$('mute').addEventListener('click', () => { audio.setMuted(!audio.muted); void audio.unlock().catch(() => {}); persistSettings(); updateHUD(); });
$('bet').addEventListener('change', event => { try { saveSession({ ...session, betCents: Number((event.target as HTMLSelectElement).value) }); updateHUD(); } catch (error) { toast(error instanceof Error ? error.message : String(error)); updateHUD(); } });
canvas.addEventListener('click', () => { if (busy) renderer.skip(); });
window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test((event.target as HTMLElement)?.tagName ?? '')) return;
  event.preventDefault();
  if (activeCounter) activeCounter(); else if (busy) renderer.skip(); else if (!modal.open) $('spin').click();
});
const audioReady = audio.initialize().catch(() => { /* Default cues remain available if local audio storage is blocked. */ });
updateHUD();
const lastSpin = session.history.at(-1)?.spins.at(-1);
renderer.setIdle(lastSpin?.finalGrid, lastSpin?.finalWildMultipliers, lastSpin?.marks);
if (startupWarning) toast(startupWarning === 'invalid' ? t('Старият запис не може да бъде прочетен. Започната е нова виртуална игра.', 'The previous save could not be read. A new virtual game has started.') : t('Разреши локално съхранение, за да играеш.', 'Enable browser storage to play.'));
if (session.pending) {
  displayedBalance = session.balanceCents - session.pending.payoutCents;
  void replay(session.pending);
}

if (import.meta.env.DEV) {
  (window as Window & { __ruse?: unknown }).__ruse = {
    snapshot: () => structuredClone({ ...session, busy, displayedBalance, language, turbo }),
    reset: (seed?: number, balance?: number) => {
      if (busy) throw new Error('Round in progress');
      saveSession(createSession(seed, balance)); displayedBalance = session.balanceCents; renderer.setIdle(); updateHUD();
    },
    skip: () => activeCounter ? activeCounter() : renderer.skip(),
    board: () => renderer.inspect(),
  };
}
