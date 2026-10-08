import './menus.css';
import { symbolArtworkMarkup } from './render/art-v2';
import { CONFIG, PAYING_SYMBOLS, roundPriceCents } from './engine/config';
import type { BonusTier, Mode, RoundChoice, Session, SymbolId } from './engine/types';
import { formatEuroCents, t, type Language } from './i18n';

export type MenuLanguage = Language;
export type DialogName = 'features' | 'paytable' | 'rules' | 'history' | 'settings';
export interface DialogOptions {
  getSession: () => Session;
  getLanguage: () => MenuLanguage;
  getAudio: () => { muted: boolean; volume: number };
  getSpeed: () => 'normal' | 'turbo';
  getAutoplay: () => number;
  isBusy?: () => boolean;
  onSelectMode: (mode: Mode) => void;
  onBuy: (tier: BonusTier) => void | Promise<void>;
  onLucky?: () => void | Promise<void>;
  onExtra?: () => void | Promise<void>;
  /** Retained for existing hosts; Day 1024 selects an ordinary spin mode. */
  onGod: () => void | Promise<void>;
  onLanguage: (language: MenuLanguage) => void;
  onAudio: (settings: { muted: boolean; volume: number }) => void;
  onSpeed: (speed: 'normal' | 'turbo') => void;
  onAutoplay: (rounds: number) => void;
  onStopAutoplay: () => void;
  onRefill: () => void;
}

const MODES: Mode[] = ['standard', 'hunt', 'frames', 'wild', 'god'];
const TIERS: BonusTier[] = ['dorm', 'friday', 'december'];
const INITIAL_MULTIPLIER: Record<Mode, number> = { standard: 1, hunt: 1, frames: 2, wild: 64, god: 1024 };
const UPGRADE_IDS = ['infectious', 'bomb', 'shots'] as const;
function escape(value: unknown): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

/** Native, keyboard-accessible controls; the host engine owns the ledger. */
export class Dialogs {
  private overlay: HTMLDivElement;
  private previousFocus: HTMLElement | null = null;
  private current: DialogName | null = null;
  private featureTab: 'boosters' | 'buys' = 'boosters';
  private confirmation: RoundChoice | null = null;
  private acting = false;
  private error = '';
  private keyListener = (event: KeyboardEvent) => this.onKey(event);

  constructor(private options: DialogOptions) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'sg-overlay';
    this.overlay.hidden = true;
    this.overlay.addEventListener('click', event => {
      if (event.target === this.overlay) { this.close(); return; }
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target && this.overlay.contains(target)) this.action(target.dataset.action!, target);
    });
    this.overlay.addEventListener('input', event => this.input(event.target as HTMLInputElement));
    document.body.append(this.overlay);
    document.addEventListener('keydown', this.keyListener);
  }

  get isOpen(): boolean { return this.current !== null; }
  open(dialog: DialogName): void {
    if (!this.current) this.previousFocus = document.activeElement as HTMLElement | null;
    this.current = dialog;
    this.confirmation = null;
    this.error = '';
    this.overlay.hidden = false;
    document.body.classList.add('sg-modal-open');
    this.render(true);
    requestAnimationFrame(() => this.overlay.querySelector<HTMLButtonElement>('.sg-close')?.focus());
  }
  close(): void {
    if (this.acting) return;
    this.current = null;
    this.confirmation = null;
    this.overlay.hidden = true;
    document.body.classList.remove('sg-modal-open');
    this.previousFocus?.focus();
  }
  refresh(): void { if (this.current) this.render(); }
  destroy(): void {
    document.removeEventListener('keydown', this.keyListener);
    document.body.classList.remove('sg-modal-open');
    this.overlay.remove();
  }

  private get lang(): MenuLanguage { return this.options.getLanguage(); }
  private l(bg: string, en: string): string { return this.lang === 'bg' ? bg : en; }
  private tr(key: string): string { return t(key, {}, this.lang); }
  private money(cents: number): string { return formatEuroCents(cents, this.lang); }
  private number(value: number): string {
    return new Intl.NumberFormat(this.lang === 'bg' ? 'bg-BG' : 'en-IE', { maximumFractionDigits: 6 }).format(value);
  }
  private symbol(symbol: SymbolId | 'couple'): string {
    const id = symbol === 'vip' ? 'scatter' : symbol;
    return symbolArtworkMarkup(id, this.tr(`symbol.${id}`), `sg-symbol sg-symbol-${id}`);
  }
  private get busy(): boolean {
    const session = this.options.getSession();
    return this.acting || !!this.options.isBusy?.() || !!session.activeRound || !!session.presentation;
  }
  private choiceName(choice: RoundChoice): string {
    if (choice.kind === 'lucky') return this.tr('bonus.lucky');
    if (choice.kind === 'extra') return this.tr('extraSpin');
    return this.tr(choice.kind === 'buy' ? `bonus.${choice.bonus}` : `mode.${choice.mode}`);
  }
  private price(choice: RoundChoice): number {
    const session = this.options.getSession();
    return choice.kind === 'extra' ? session.extraSpinOffer?.costCents ?? 0 : roundPriceCents(session.betCents, choice);
  }

  private render(resetScroll = false): void {
    if (!this.current) return;
    const focusedAction = this.overlay.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.action : undefined;
    const scrollTop = resetScroll ? 0 : this.overlay.querySelector('.sg-dialog-body')?.scrollTop ?? 0;
    const titles: Record<DialogName, [string, string]> = {
      features: ['КАКВА Е ВЕЧЕРТА?', 'WHAT KIND OF NIGHT?'], paytable: ['ТАБЛИЦА НА ПЕЧАЛБИТЕ', 'THE PAYTABLE'],
      rules: ['ПРАВИЛАТА НА КУПОНА', 'PARTY RULES'], history: ['СНОЩИ КАКВО СТАНА?', 'WHAT HAPPENED LAST NIGHT?'],
      settings: ['ПО ТВОЯ ВКУС', 'MAKE IT YOURS'],
    };
    const body = this.confirmation ? this.confirmationView() : {
      features: () => this.features(), paytable: () => this.paytable(), rules: () => this.rules(), history: () => this.history(), settings: () => this.settings(),
    }[this.current]();
    this.overlay.innerHTML = `<section class="sg-dialog ${this.current === 'features' || this.current === 'paytable' ? 'sg-dialog-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sg-dialog-title">
      <header class="sg-dialog-header"><div><span class="sg-eyebrow">${this.l('БЛОК 59 / СТУДЕНТСКИ ГРАД', 'BLOCK 59 / STUDENTSKI GRAD')}</span><h2 id="sg-dialog-title">${this.confirmation ? this.l('ПРЕДИ ДА ПРОДЪЛЖИШ', 'BEFORE YOU CONTINUE') : this.l(...titles[this.current])}</h2></div><button class="sg-close" data-action="close" aria-label="${this.tr('close')}">×</button></header>
      <div class="sg-dialog-body">${body}${this.error ? `<p class="sg-error" role="alert">${escape(this.error)}</p>` : ''}</div>
      <footer class="sg-dialog-footer">${this.l('ВИРТУАЛНИ ДЕМО ЕВРО · БЕЗ ИСТИНСКИ ПАРИ', 'VIRTUAL DEMO EUROS · NO REAL MONEY')}</footer>
    </section>`;
    const bodyElement = this.overlay.querySelector('.sg-dialog-body');
    if (bodyElement) bodyElement.scrollTop = scrollTop;
    if (focusedAction) this.overlay.querySelector<HTMLButtonElement>(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }

  private features(): string {
    const session = this.options.getSession();
    return `<div class="sg-feature-intro"><p>${this.l('Тридесет клетки. Осем еднакви. Още една нощ.', 'Thirty positions. Eight matching. One more night.')}</p><span class="sg-bet-chip">${this.tr('baseBet')} <b>${this.money(session.betCents)}</b></span></div>
      <div class="sg-tabs" role="tablist" aria-label="${this.l('Вид функция', 'Feature type')}"><button role="tab" aria-selected="${this.featureTab === 'boosters'}" data-action="tab-boosters">${this.tr('boosters')}</button><button role="tab" aria-selected="${this.featureTab === 'buys'}" data-action="tab-buys">${this.tr('bonusBuy')}</button></div>
      ${this.featureTab === 'boosters' ? `<div class="sg-mode-list">${MODES.map(mode => this.modeRow(mode)).join('')}</div><p class="sg-small-note">${this.l('Избираш един режим. Цената се удържа при СПИН; всички печалби използват базовия залог. Множителите на Ден 2 / 64 / 1024 са върху всяка клетка от началото на рунда.', 'Choose one mode. Its cost is debited when you press SPIN; every payout uses the base bet. Day 2 / 64 / 1024 begin with the stated multiplier on every position.')}</p>` : `<div class="sg-buy-grid">${TIERS.map(tier => this.bonusCard(tier)).join('')}${this.luckyCard()}</div><div class="sg-upgrade-strip">${UPGRADE_IDS.map(id => `<span>${this.symbol(id === 'shots' ? 'shot' : id)}<b>${this.tr(`upgrade.${id}`)}</b></span>`).join('')}</div><p class="sg-small-note">${this.l('Колелото показва едно надграждане с една стрелка или две различни с две стрелки. В най-големия бонус колелото е неподвижно: получаваш и трите. Покупката първо спуска 3, 4 или 5 покани. Възможна е нулева печалба.', 'The wheel awards one upgrade with one pointer or two distinct upgrades with two pointers. The largest bonus keeps the wheel still and awards all three. A purchase first drops 3, 4 or 5 invitations. A zero payout is possible.')}</p>`}
      ${this.busy ? `<p class="sg-busy-note">${this.l('Изчакай текущият рунд да приключи.', 'Wait for the current round to finish.')}</p>` : ''}`;
  }

  private modeRow(mode: Mode): string {
    const session = this.options.getSession();
    const cost = this.price({ kind: 'mode', mode });
    const active = session.selectedMode === mode;
    const symbol: SymbolId = mode === 'hunt' ? 'scatter' : mode === 'standard' ? 'coffee' : 'xways';
    const badge = mode === 'hunt' ? 'xBet' : mode === 'standard' ? '01' : `${INITIAL_MULTIPLIER[mode]}×`;
    return `<article class="sg-mode-row sg-card-${mode} ${active ? 'sg-card-active' : ''}"><div class="sg-mode-art">${this.symbol(symbol)}<span>${badge}</span></div><div class="sg-mode-copy"><h3>${this.tr(`mode.${mode}`)}</h3><p>${this.tr(`mode.${mode}.description`)}</p></div><div class="sg-mode-price"><b>${this.money(cost)}</b><small>${this.number(CONFIG.prices[mode])}× ${this.tr('bet').toLocaleLowerCase(this.lang === 'bg' ? 'bg-BG' : 'en-IE')}</small></div><button class="sg-card-button" data-action="mode-${mode}" ${this.busy || cost > session.balanceCents || active ? 'disabled' : ''}>${active ? this.tr('selected') : cost > session.balanceCents ? this.l('НИСЪК БАЛАНС', 'LOW BALANCE') : this.tr('select')}</button></article>`;
  }

  private bonusCard(tier: BonusTier): string {
    const session = this.options.getSession();
    const bonus = CONFIG.bonuses[tier];
    const cost = this.price({ kind: 'buy', bonus: tier });
    const index = TIERS.indexOf(tier);
    return `<article class="sg-feature-card sg-card-${tier}"><div class="sg-card-art">${this.symbol((['male', 'dj', 'couple'] as const)[index])}<span class="sg-stamp">${bonus.spins} ${this.l('СПИНА', 'SPINS')}</span></div><div class="sg-card-copy"><span class="sg-card-number">${this.l('НОЩ', 'NIGHT')} 0${index + 1}</span><h3>${this.tr(`bonus.${tier}`)}</h3><p>${this.tr(`bonus.${tier}.description`)}</p><div class="sg-upgrade-count"><b>${bonus.upgradesCount}</b><span>${bonus.upgradesCount === 1 ? this.l('СТРЕЛКА · СЛУЧАЙНО НАДГРАЖДАНЕ', 'POINTER · RANDOM UPGRADE') : bonus.upgradesCount === 2 ? this.l('СТРЕЛКИ · РАЗЛИЧНИ НАДГРАЖДАНИЯ', 'POINTERS · DISTINCT UPGRADES') : this.l('НАДГРАЖДАНИЯ · ВСИЧКИ АКТИВНИ', 'UPGRADES · ALL ACTIVE')}</span></div><div class="sg-card-price"><span>${this.number(CONFIG.buyPrices[tier])}× ${this.tr('bet').toLocaleLowerCase(this.lang === 'bg' ? 'bg-BG' : 'en-IE')}</span><strong>${this.money(cost)}</strong></div><button class="sg-card-button" data-action="buy-${tier}" ${this.busy || cost > session.balanceCents ? 'disabled' : ''}>${cost > session.balanceCents ? this.l('НИСЪК БАЛАНС', 'LOW BALANCE') : this.tr('bonusBuy')}</button></div></article>`;
  }

  private luckyCard(): string {
    const cost = this.price({ kind: 'lucky' });
    const balance = this.options.getSession().balanceCents;
    return `<article class="sg-feature-card sg-card-lucky"><div class="sg-card-art">${this.symbol('scatter')}<span class="sg-stamp">${this.l('СЛУЧАЕН БОНУС', 'RANDOM BONUS')}</span></div><div class="sg-card-copy"><span class="sg-card-number">${this.l('ЖРЕБИЙ', 'THE DRAW')}</span><h3>${this.tr('bonus.lucky')}</h3><p>${this.l('Получаваш един от трите бонуса с неговите спинове и надграждания.', 'Receive one of the three bonuses with its spins and upgrades.')}</p><ul class="sg-lucky-odds">${TIERS.map((tier, index) => `<li><span>${this.tr(`bonus.${tier}`)}</span><b>${this.number(CONFIG.luckyDrawProbabilities[index] * 100)}%</b></li>`).join('')}</ul><div class="sg-card-price"><span>${this.number(CONFIG.luckyDrawPrice)}× ${this.tr('bet').toLocaleLowerCase(this.lang === 'bg' ? 'bg-BG' : 'en-IE')}</span><strong>${this.money(cost)}</strong></div><button class="sg-card-button" data-action="lucky" ${this.busy || cost > balance || !this.options.onLucky ? 'disabled' : ''}>${cost > balance ? this.l('НИСЪК БАЛАНС', 'LOW BALANCE') : this.tr('bonusBuy')}</button></div></article>`;
  }

  private confirmationView(): string {
    const choice = this.confirmation!;
    const session = this.options.getSession();
    const multiplier = choice.kind === 'buy' ? CONFIG.buyPrices[choice.bonus] : choice.kind === 'mode' ? CONFIG.prices[choice.mode] : choice.kind === 'lucky' ? CONFIG.luckyDrawPrice : this.price(choice) / session.betCents;
    const cost = this.price(choice);
    const selecting = choice.kind === 'mode';
    return `<div class="sg-confirmation"><span class="sg-eyebrow">${selecting ? this.l('СЛЕДВАЩ ПЛАТЕН РУНД', 'NEXT PAID ROUND') : this.l('ЕДНОКРАТНА ПОКУПКА', 'ONE-TIME PURCHASE')}</span><h3>${escape(this.choiceName(choice))}</h3>${choice.kind === 'lucky' ? `<p>${this.tr('bonus.lucky.description')}</p>` : ''}<p>${selecting ? this.l('Изборът не тегли сума. Натисни СПИН, за да започнеш рунда на тази цена.', 'Selecting does not debit your balance. Press SPIN to start a round at this price.') : this.l('Точната сума ще се удържи веднъж при потвърждение.', 'This exact amount will be debited once when you confirm.')}</p><dl class="sg-confirm-ledger"><div><dt>${this.tr('baseBet')}</dt><dd>${this.money(session.betCents)}</dd></div><div><dt>${this.l('Множител на цената', 'Price multiplier')}</dt><dd>${this.number(multiplier)}×</dd></div><div class="sg-debit"><dt>${selecting ? this.l('Цена на следващия рунд', 'Next round cost') : this.l('ТОЧНО УДЪРЖАНЕ', 'EXACT DEBIT')}</dt><dd>${this.money(cost)}</dd></div><div><dt>${this.l('Баланс след плащането', 'Balance after the debit')}</dt><dd>${this.money(session.balanceCents - cost)}</dd></div></dl><p class="sg-small-note">${this.l('Максимум за целия рунд:', 'Maximum for the entire round:')} <b>${this.money(session.betCents * CONFIG.capMultiplier)}</b>. ${this.l('Печалбите използват базовия залог. Възможен е резултат 0 €.', 'Payouts use the base bet. A €0 return is possible.')}</p><div class="sg-confirm-buttons"><button class="sg-secondary-button" data-action="back" ${this.acting ? 'disabled' : ''}>${this.tr('back')}</button><button class="sg-primary-button" data-action="confirm" ${this.busy || cost > session.balanceCents ? 'disabled' : ''}>${this.acting ? this.l('ИЗЧАКАЙ…', 'PLEASE WAIT…') : selecting ? this.tr('select') : `${this.tr('confirm')} · ${this.money(cost)}`}</button></div></div>`;
  }

  private paytable(): string {
    const thresholds = CONFIG.payThresholds;
    const headings = thresholds.map((count, index) => `${count}${thresholds[index + 1] ? `–${thresholds[index + 1] - 1}` : '+'}`);
    return `<p class="sg-table-status">${this.tr('paytable.status')}</p><p class="sg-lead">${this.tr('boardSize')} · ${this.tr('scatterThreshold')}</p><p class="sg-small-note">${this.tr('paytable.intro')} ${this.l('Броим физически клетки. Печалбата не зависи от барабана или реда.', 'We count physical positions. The reel or row does not restrict a win.')}</p><div class="sg-paytable-scroll"><table class="sg-paytable"><thead><tr><th>${this.l('СИМВОЛ', 'SYMBOL')}</th>${headings.map(heading => `<th>${heading}</th>`).join('')}</tr></thead><tbody>${PAYING_SYMBOLS.map(symbol => `<tr><th><span>${this.symbol(symbol)}<b>${this.tr(`symbol.${symbol}`)}</b></span></th>${CONFIG.paytable[symbol].map(pay => `<td>${this.number(pay / CONFIG.payoutDenominator)}×</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="sg-small-note">${this.tr('rules.wildMath')}</p><div class="sg-special-symbols">${this.special('wild', this.tr('paytable.wild'))}${this.special('xways', this.l('Купонният говорител разкрива плащащ символ и множител 2× / 4× / 8×. Усилва собствената си клетка. Всички говорители от едно падане разкриват един и същ символ.', 'The party speaker reveals a paying symbol and a 2× / 4× / 8× factor. It boosts its own position. All speakers on one drop reveal the same symbol.'))}${this.special('bomb', this.l('Удвоява множителите в зона 3 × 3; 5 × 5 с надграждането.', 'Doubles position multipliers in a 3 × 3 area; 5 × 5 with the upgrade.'))}${this.special('infectious', this.l('Заразени говорители могат да паднат и без надграждане, но са редки. Надграждането гарантира само заразени говорители. Те изпращат своя множител към всички видими клетки със същия разкрит символ. Всички говорители от едно падане разкриват един и същ символ. Wild, покани и още неразкрити говорители са защитени.', 'Rare infectious speakers can appear naturally. The bonus upgrade guarantees all speakers infectious. They send their multiplier to every visible position with the revealed symbol. All speakers on one drop reveal the same symbol. Wilds, invitations and unrevealed speakers are protected.'))}${this.special('scatter', this.tr('rules.scatter'))}${this.special('shot', this.tr('rules.retrigger'))}</div><button class="sg-link-button" data-action="rules">${this.l('ВИЖ ПРАВИЛАТА →', 'READ THE RULES →')}</button>`;
  }
  private special(symbol: SymbolId, copy: string): string { return `<article>${this.symbol(symbol)}<div><h3>${this.tr(`symbol.${symbol}`)}</h3><p>${copy}</p></div></article>`; }

  private rules(): string {
    return `<div class="sg-rules"><p class="sg-lead">${this.l('Утре съм на лекции. Днес — тези правила.', 'Lectures tomorrow. These rules tonight.')}</p>
      ${this.rule('01', this.tr('rules.ways.title'), this.tr('rules.ways'))}
      ${this.rule('02', this.tr('rules.notes.title'), `${this.tr('rules.notes')} ${this.tr('rules.wildMath')}`)}
      <div class="sg-rule-example"><span>${this.l('ПРИМЕР', 'EXAMPLE')}</span><b>2× + 4× + 8× = 14×</b><p>${this.l('Осем еднакви символа, три с тези множители: печалбата от таблицата се умножава по 14. Петте клетки без множител не добавят 1×.', 'Eight matching symbols, three with these multipliers: the paytable award is multiplied by 14. The five unmarked positions do not add 1×.')}</p></div>
      ${this.rule('03', this.tr('rules.wild.title'), this.tr('rules.wild'))}
      ${this.rule('04', this.l('БОМБА И ЗАРАЗЕН КУПОН', 'BOMB AND PARTY INFECTION'), this.l('Бомбата премахва плащащите символи в зона 3 × 3, или 5 × 5 с надграждането, и удвоява множителите на техните клетки. Wild и поканите са изключени. Нормалният говорител усилва собствената си клетка. Всички говорители от едно падане разкриват един и същ плащащ символ. Заразени говорители могат да паднат и без надграждане, но са редки. Надграждането гарантира само заразени говорители, които изпращат множителя към всички видими съвпадащи клетки.', 'A bomb removes paying symbols in a 3 × 3 area, or 5 × 5 with the upgrade, and doubles their position multipliers. Wilds and invitations are excluded. A normal speaker boosts its own position. All speakers on one drop reveal the same paying symbol. Rare infectious speakers can appear naturally. The bonus upgrade guarantees all speakers infectious, which send their multiplier to every visible matching position.'))}
      ${this.rule('05', this.tr('rules.scatter.title'), `${this.tr('rules.scatter')} ${this.tr('rules.party')}`)}
      <div class="sg-bonus-rule-grid">${TIERS.map((tier, index) => `<article><span>${index + 3}${index === 2 ? '+' : ''} ${this.l('ПОКАНИ', 'INVITATIONS')}</span><h3>${this.tr(`bonus.${tier}`)}</h3><b>${CONFIG.bonuses[tier].spins} ${this.l('СПИНА', 'SPINS')}</b><p>${this.tr(`bonus.${tier}.description`)}</p></article>`).join('')}</div>
      ${this.rule('06', this.tr('rules.retrigger.title'), this.tr('rules.retrigger'))}
      ${this.rule('07', this.tr('rules.accounting.title'), this.tr('rules.accounting'))}
      ${this.rule('08', this.tr('rules.cap.title'), `${this.tr('rules.cap')} ${this.tr('rules.random')}`)}
      ${this.rule('09', this.tr('rules.extra.title'), this.tr('rules.extra'))}
      <p class="sg-small-note">${this.tr('demoNotice')}</p></div>`;
  }
  private rule(number: string, title: string, copy: string): string { return `<section class="sg-rule"><span class="sg-rule-number">${number}</span><div><h3>${title}</h3><p>${copy}</p></div></section>`; }

  private history(): string {
    const history = this.options.getSession().history;
    const stakes = history.reduce((sum, entry) => sum + entry.costCents, 0);
    const wins = history.reduce((sum, entry) => sum + entry.payoutCents, 0);
    return `<div class="sg-history-summary"><div><span>${this.l('РУНДОВЕ', 'ROUNDS')}</span><b>${history.length}</b></div><div><span>${this.l('ПЛАТЕНО', 'PAID')}</span><b>${this.money(stakes)}</b></div><div><span>${this.l('ИЗПЛАТЕНО', 'SETTLED')}</span><b>${this.money(wins)}</b></div></div>${history.length ? `<div class="sg-history-scroll"><table class="sg-history-table"><thead><tr><th>${this.l('РУНД / РЕЖИМ', 'ROUND / MODE')}</th><th>${this.tr('baseBet')}</th><th>${this.l('ПЛАТЕНО', 'PAID')}</th><th>${this.tr('win')}</th></tr></thead><tbody>${history.map(entry => `<tr><td><b>${escape(this.choiceName(entry.choice))}</b><small>#${escape(entry.id)} · ${entry.spins} ${this.l('спина', 'spins')}${entry.maxWin ? ` · ${this.tr('maxWin')}` : ''}</small></td><td>${this.money(entry.betCents)}</td><td>${this.money(entry.costCents)}</td><td class="${entry.payoutCents > 0 ? 'sg-positive' : ''}">${this.money(entry.payoutCents)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="sg-empty-history">${this.symbol('book')}<p>${this.tr('historyEmpty')}</p></div>`}<p class="sg-small-note">${this.l(`Дневникът пази последните ${CONFIG.historyLimit} завършени рунда. Бонусните спинове са част от първоначалния платен рунд.`, `The log keeps the last ${CONFIG.historyLimit} completed rounds. Bonus spins belong to their original paid round.`)}</p>`;
  }

  private settings(): string {
    const audio = this.options.getAudio();
    const speed = this.options.getSpeed();
    const autoplay = this.options.getAutoplay();
    return `<div class="sg-settings"><section class="sg-setting-row"><div><h3>${this.l('Език / Language', 'Language / Език')}</h3><p>${this.l('Целият интерфейс на твоя език.', 'The whole interface in your language.')}</p></div><div class="sg-segmented"><button data-action="language-bg" aria-pressed="${this.lang === 'bg'}">БЪЛГАРСКИ</button><button data-action="language-en" aria-pressed="${this.lang === 'en'}">ENGLISH</button></div></section>
      <section class="sg-setting-row"><div><h3>${this.tr('sound')}</h3><p>${this.l('Оригинални звуци и клубен ритъм.', 'Original sounds and a club rhythm.')}</p></div><button class="sg-toggle ${!audio.muted ? 'sg-toggle-on' : ''}" data-action="mute" aria-pressed="${!audio.muted}">${audio.muted ? this.tr('soundOff') : this.tr('soundOn')}</button></section><div class="sg-volume"><label for="sg-volume">${this.tr('volume')} <b id="sg-volume-value">${Math.round(audio.volume * 100)}%</b></label><input id="sg-volume" name="volume" type="range" min="0" max="100" step="1" value="${Math.round(audio.volume * 100)}" aria-label="${this.tr('volume')}"></div>
      <section class="sg-setting-row"><div><h3>${this.tr('speed')}</h3><p>${this.l('Скоростта не променя резултата.', 'Speed does not change outcomes.')}</p></div><div class="sg-segmented"><button data-action="speed-normal" aria-pressed="${speed === 'normal'}">${this.tr('normal')}</button><button data-action="speed-turbo" aria-pressed="${speed === 'turbo'}">${this.tr('turbo')}</button></div></section>
      <section class="sg-autoplay"><h3>${this.tr('autoplay')}</h3><p>${this.tr('autoplayLimit')}</p>${autoplay ? `<div class="sg-autoplay-active"><strong>${autoplay}</strong> ${this.l('остават', 'remaining')}<button class="sg-primary-button" data-action="stop-autoplay">${this.l('СПРИ АВТО', 'STOP AUTO')}</button></div>` : `<div class="sg-autoplay-controls"><label for="sg-autoplay-count" class="sg-sr-only">${this.tr('autoplaySpins')}</label><select id="sg-autoplay-count">${[10, 25, 50, 100].filter(count => count <= CONFIG.autoplayLimit).map(count => `<option value="${count}">${count} ${this.l('РУНДА', 'ROUNDS')}</option>`).join('')}</select><button class="sg-primary-button" data-action="autoplay" ${this.busy ? 'disabled' : ''}>${this.l('СТАРТ АВТО', 'START AUTO')}</button></div>`}</section>
      <section class="sg-setting-row sg-refill"><div><h3>${this.l('Стипендията дойде', 'The scholarship arrived')}</h3><p>${this.l('Добави към виртуалния баланс:', 'Add to your virtual balance:')} ${this.money(CONFIG.refillCents)}.</p></div><button class="sg-secondary-button" data-action="refill" ${this.busy ? 'disabled' : ''}>${this.l('ДОПЪЛНИ', 'REFILL')}</button></section></div>`;
  }

  private action(action: string, element: HTMLElement): void {
    if ((element as HTMLButtonElement).disabled) return;
    if (action === 'close') { this.close(); return; }
    if (action === 'back') { this.confirmation = null; this.error = ''; this.render(true); return; }
    if (action === 'rules') { this.open('rules'); return; }
    if (action.startsWith('tab-')) { this.featureTab = action === 'tab-buys' ? 'buys' : 'boosters'; this.render(true); return; }
    if (action.startsWith('mode-')) {
      const mode = action.slice(5) as Mode;
      if (this.busy || !MODES.includes(mode)) return;
      if (mode === 'standard') { this.options.onSelectMode(mode); this.refresh(); return; }
      this.confirmation = { kind: 'mode', mode }; this.render(true); return;
    }
    if (action.startsWith('buy-')) {
      const tier = action.slice(4) as BonusTier;
      if (!this.busy && TIERS.includes(tier)) { this.confirmation = { kind: 'buy', bonus: tier }; this.render(true); }
      return;
    }
    if (action === 'lucky' && !this.busy && this.options.onLucky) { this.confirmation = { kind: 'lucky' }; this.render(true); return; }
    if (action === 'confirm') { void this.confirm(); return; }
    if (action.startsWith('language-')) { this.options.onLanguage(action.slice(9) as MenuLanguage); this.refresh(); return; }
    if (action === 'mute') { const audio = this.options.getAudio(); this.options.onAudio({ ...audio, muted: !audio.muted }); this.refresh(); return; }
    if (action.startsWith('speed-')) { this.options.onSpeed(action.slice(6) as 'normal' | 'turbo'); this.refresh(); return; }
    if (action === 'autoplay') {
      if (this.busy) return;
      const count = Number(this.overlay.querySelector<HTMLSelectElement>('#sg-autoplay-count')?.value ?? 10);
      this.options.onAutoplay(Math.max(1, Math.min(CONFIG.autoplayLimit, count))); this.close(); return;
    }
    if (action === 'stop-autoplay') { this.options.onStopAutoplay(); this.refresh(); return; }
    if (action === 'refill' && !this.busy) { this.options.onRefill(); this.refresh(); }
  }
  private async confirm(): Promise<void> {
    if (!this.confirmation || this.busy) return;
    const choice = this.confirmation;
    if (this.price(choice) > this.options.getSession().balanceCents) { this.error = this.tr('insufficient'); this.render(); return; }
    if (choice.kind === 'mode') { this.options.onSelectMode(choice.mode); this.close(); return; }
    this.acting = true;
    this.render();
    try {
      const result = choice.kind === 'buy' ? this.options.onBuy(choice.bonus) : choice.kind === 'lucky' ? this.options.onLucky?.() : this.options.onExtra?.();
      this.acting = false;
      this.close();
      await result;
    } catch (error) {
      this.acting = false;
      this.error = error instanceof Error ? error.message : this.l('Рундът не можа да започне.', 'The round could not start.');
      this.current = 'features'; this.overlay.hidden = false; document.body.classList.add('sg-modal-open'); this.render();
    }
  }
  private input(input: HTMLInputElement): void {
    if (input.name !== 'volume') return;
    const volume = Math.max(0, Math.min(1, Number(input.value) / 100));
    this.options.onAudio({ ...this.options.getAudio(), volume });
    const label = this.overlay.querySelector('#sg-volume-value');
    if (label) label.textContent = `${Math.round(volume * 100)}%`;
  }
  private onKey(event: KeyboardEvent): void {
    if (!this.current) return;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && (document.activeElement as HTMLElement)?.getAttribute('role') === 'tab') {
      event.preventDefault(); this.featureTab = this.featureTab === 'boosters' ? 'buys' : 'boosters'; this.render(true);
      this.overlay.querySelector<HTMLButtonElement>(`[data-action="tab-${this.featureTab}"]`)?.focus(); return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.overlay.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(element => !element.hidden);
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !this.overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !this.overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
}
