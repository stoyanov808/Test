import './menus.css';
import { CONFIG, PAYING_SYMBOLS } from './engine/config';
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
  onGod: () => void | Promise<void>;
  onLanguage: (language: MenuLanguage) => void;
  onAudio: (settings: { muted: boolean; volume: number }) => void;
  onSpeed: (speed: 'normal' | 'turbo') => void;
  onAutoplay: (rounds: number) => void;
  onStopAutoplay: () => void;
  onRefill: () => void;
}

const SYMBOLS: SymbolId[] = ['book', 'coffee', 'noodles', 'doner', 'female', 'male', 'dj', 'couple', 'wild', 'scatter', 'vip'];
const SYMBOL_NAMES: Record<SymbolId, [string, string]> = {
  book: ['Забравеният учебник', 'The forgotten textbook'], coffee: ['Кафе преди лекция', 'Pre-lecture coffee'],
  noodles: ['Нудъли в общака', 'Dorm-room noodles'], doner: ['Дюнер в 04:00', 'The 04:00 doner'],
  female: ['Звездата на курса', 'The course star'], male: ['Последният изпит', 'One last exam'],
  dj: ['Студентът DJ', 'The student DJ'], couple: ['Купонджийската двойка', 'The party couple'],
  wild: ['ПИЯНИЯТ КОЛЕГА', 'THE DRUNK CLASSMATE'], scatter: ['ПОКАНА ЗА КУПОН', 'PARTY INVITATION'], vip: ['VIP ПРОПУСК', 'VIP PASS'],
};
const MODE_NAMES: Record<Mode, [string, string]> = {
  standard: ['Обикновен спин', 'Standard spin'], hunt: ['Търсим купона', 'Party search'],
  frames: ['Сесията почака', 'Exams can wait'], wild: ['Още едно и тръгвам', 'One more, then I’m off'],
  god: ['БОГЪТ НА СТУДЕНТСКИ', 'GOD OF STUDENTSKI'],
};
const BONUS_NAMES: Record<BonusTier, [string, string]> = {
  dorm: ['КУПОН В ОБЩАКА', 'DORM PARTY'], friday: ['ПЕТЪК В СТУДЕНТСКИ', 'FRIDAY IN STUDENTSKI'], december: ['8 ДЕКЕМВРИ', '8 DECEMBER'],
};
function escape(value: unknown): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

/** Accessible native-DOM menus around the canvas game. All account changes stay in the host engine. */
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
      if (event.target === this.overlay) this.close();
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target && this.overlay.contains(target)) this.action(target.dataset.action!, target);
    });
    this.overlay.addEventListener('change', event => this.change(event.target as HTMLInputElement));
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
    this.resetScroll();
    this.overlay.hidden = false;
    document.body.classList.add('sg-modal-open');
    this.render();
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
  private resetScroll(): void {
    const body = this.overlay.querySelector('.sg-dialog-body');
    if (body) body.scrollTop = 0;
  }
  private l(bg: string, en: string): string { return this.lang === 'bg' ? bg : en; }
  private names(names: [string, string]): string { return names[this.lang === 'bg' ? 0 : 1]; }
  private money(cents: number): string {
    return formatEuroCents(cents, this.lang);
  }
  private number(number: number): string {
    return new Intl.NumberFormat(this.lang === 'bg' ? 'bg-BG' : 'en-IE', { maximumFractionDigits: 6 }).format(number);
  }
  private symbol(symbol: SymbolId, extraClass = ''): string {
    const index = SYMBOLS.indexOf(symbol);
    return `<span class="sg-symbol sg-symbol-${symbol} ${extraClass}" role="img" aria-label="${escape(t(`symbol.${symbol}`, {}, this.lang))}" style="--sx:${(index % 4) * 100 / 3}%;--sy:${Math.floor(index / 4) * 50}%"></span>`;
  }
  private get busy(): boolean {
    const session = this.options.getSession();
    return this.acting || !!this.options.isBusy?.() || !!session.activeRound || !!session.presentation;
  }
  private choiceName(choice: RoundChoice): string {
    return t(choice.kind === 'buy' ? `bonus.${choice.bonus}` : `mode.${choice.mode}`, {}, this.lang);
  }

  private render(): void {
    if (!this.current) return;
    const focusedAction = this.overlay.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.action : undefined;
    const scrollTop = this.overlay.querySelector('.sg-dialog-body')?.scrollTop ?? 0;
    const titles: Record<DialogName, [string, string]> = {
      features: ['ВЕЧЕРТА Е ТВОЯ', 'THE NIGHT IS YOURS'], paytable: ['КОЙ КОЛКО СТРУВА', 'THE PAYTABLE'],
      rules: ['ПРАВИЛАТА НА КУПОНА', 'PARTY RULES'], history: ['СНОЩИ КАКВО СТАНА?', 'WHAT HAPPENED LAST NIGHT?'],
      settings: ['ПО ТВОЯ ВКУС', 'MAKE IT YOURS'],
    };
    const body = this.confirmation ? this.confirmationView() : {
      features: () => this.features(), paytable: () => this.paytable(), rules: () => this.rules(), history: () => this.history(), settings: () => this.settings(),
    }[this.current]();
    this.overlay.innerHTML = `<section class="sg-dialog ${this.current === 'features' ? 'sg-dialog-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sg-dialog-title">
      <header class="sg-dialog-header"><div><span class="sg-eyebrow">${this.l('СТУДЕНТСКИ ГРАД / УТРЕ СЪМ НА ЛЕКЦИИ', 'STUDENTSKI GRAD / LECTURES TOMORROW')}</span><h2 id="sg-dialog-title">${this.confirmation ? this.l('ПОСЛЕДНО?', 'ONE LAST CHECK?') : this.names(titles[this.current])}</h2></div><button class="sg-close" data-action="close" aria-label="${this.l('Затвори', 'Close')}">×</button></header>
      <div class="sg-dialog-body">${body}${this.error ? `<p class="sg-error" role="alert">${escape(this.error)}</p>` : ''}</div>
      <footer class="sg-dialog-footer"><span class="sg-demo-dot"></span>${this.l('ВИРТУАЛНИ ДЕМО ЕВРО · БЕЗ ИСТИНСКИ ПАРИ', 'VIRTUAL DEMO EUROS · NO REAL MONEY')}</footer>
    </section>`;
    const bodyElement = this.overlay.querySelector('.sg-dialog-body');
    if (bodyElement) bodyElement.scrollTop = scrollTop;
    if (focusedAction) this.overlay.querySelector<HTMLButtonElement>(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }

  private features(): string {
    const session = this.options.getSession();
    const modes: Mode[] = ['hunt', 'frames', 'wild', 'god'];
    return `<div class="sg-feature-intro"><p>${this.l('Стипендията дойде. Планът за вечерта?', 'The scholarship arrived. What’s the plan?')}</p><span class="sg-bet-chip">${this.l('БАЗОВ ЗАЛОГ', 'BASE BET')} <b>${this.money(session.betCents)}</b></span></div>
      <div class="sg-tabs" role="tablist" aria-label="${this.l('Вид функция', 'Feature type')}"><button role="tab" aria-selected="${this.featureTab === 'boosters'}" data-action="tab-boosters">${this.l('БУСТЕРИ', 'BOOSTERS')}</button><button role="tab" aria-selected="${this.featureTab === 'buys'}" data-action="tab-buys">${this.l('КУПИ БОНУС', 'BUY BONUS')}</button></div>
      ${this.featureTab === 'boosters' ? `<div class="sg-standard-row"><div><b>${this.names(MODE_NAMES.standard)}</b><span>1× · ${this.money(session.betCents)} ${this.l('на спин', 'per spin')}</span></div><button class="sg-pill-button" data-action="mode-standard" ${this.busy || session.selectedMode === 'standard' ? 'disabled' : ''}>${session.selectedMode === 'standard' ? this.l('ИЗБРАН', 'SELECTED') : this.l('ИЗБЕРИ', 'SELECT')}</button></div><div class="sg-feature-grid">${modes.map(mode => this.modeCard(mode)).join('')}</div><p class="sg-small-note">${this.l('Един бустер в даден момент. Цената е общата цена на следващия платен рунд. Печалбите се изчисляват от базовия залог.', 'One booster at a time. The price is the total cost of the next paid round. Payouts use the base bet.')}</p>` : `<div class="sg-feature-grid sg-buy-grid">${(['dorm', 'friday', 'december'] as BonusTier[]).map(tier => this.bonusCard(tier)).join('')}</div><p class="sg-small-note">${this.l('Покупката е отделен рунд. Цената на избрания бустер не се добавя. Няма допълнителна такса за безплатните спинове.', 'Each purchase is a separate round. The selected booster’s price is not added. Free spins have no extra charge.')}</p>`}
      ${this.busy ? `<p class="sg-busy-note">${this.l('Изчакай текущият рунд да приключи.', 'Wait for the current round to finish.')}</p>` : ''}`;
  }

  private modeCard(mode: Mode): string {
    const session = this.options.getSession();
    const descriptions: Record<Mode, [string, string]> = {
      standard: ['', ''], hunt: ['Една сигурна покана на първи барабан. Повече шанс да откриеш купона.', 'One guaranteed invitation on reel one. More chances to find the party.'],
      frames: ['Бележки върху всяка допустима клетка. Всеки печеливш символ се удвоява.', 'Sticky notes on every eligible cell. Every winning symbol doubles.'],
      wild: ['Един сигурен висок Wild. Залита, запълва барабана и вдига множителя.', 'One guaranteed tall Wild. It stumbles, fills its reel and boosts its multiplier.'],
      god: ['Пет VIP пропуска. Три опита за всеки. Всичките пет — или нула.', 'Five VIP passes. Three chances for each. All five — or zero.'],
    };
    const cost = session.betCents * CONFIG.prices[mode];
    const active = mode !== 'god' && session.selectedMode === mode;
    const symbols: Record<Mode, SymbolId> = { standard: 'book', hunt: 'scatter', frames: 'book', wild: 'wild', god: 'vip' };
    const disabled = this.busy || cost > session.balanceCents || active;
    return `<article class="sg-feature-card sg-card-${mode} ${active ? 'sg-card-active' : ''}"><div class="sg-card-art">${this.symbol(symbols[mode])}${mode === 'frames' ? '<span class="sg-note sg-note-one">×2</span><span class="sg-note sg-note-two">×2</span>' : ''}${mode === 'wild' ? '<span class="sg-stamp">×1 → ×3</span>' : ''}${mode === 'hunt' ? '<span class="sg-stamp">1 SCATTER</span>' : ''}${mode === 'god' ? '<span class="sg-stamp">20 000×</span>' : ''}</div><div class="sg-card-copy"><span class="sg-card-number">${mode === 'god' ? 'VIP' : `0${(['hunt', 'frames', 'wild'] as Mode[]).indexOf(mode) + 1}`}</span><h3>${this.names(MODE_NAMES[mode])}</h3><p>${this.names(descriptions[mode])}</p>${mode === 'god' ? `<small class="sg-risk">${this.l('Успех 4,8% · Възможна печалба 0 €', 'Success 4.8% · A €0 return is possible')}</small>` : ''}<div class="sg-card-price"><span><b>${CONFIG.prices[mode].toLocaleString(this.lang === 'bg' ? 'bg-BG' : 'en-IE')}×</b> ${this.l('залог', 'bet')}</span><strong>${this.money(cost)}</strong></div><button class="sg-card-button" data-action="mode-${mode}" ${disabled ? 'disabled' : ''}>${active ? this.l('АКТИВЕН', 'ACTIVE') : cost > session.balanceCents ? this.l('НЕДОСТАТЪЧЕН БАЛАНС', 'LOW BALANCE') : mode === 'god' ? this.l('ВЛЕЗ В VIP', 'ENTER VIP') : this.l('ИЗБЕРИ БУСТЕР', 'SELECT BOOSTER')}</button></div></article>`;
  }

  private bonusCard(tier: BonusTier): string {
    const session = this.options.getSession();
    const bonus = CONFIG.bonuses[tier];
    const cost = session.betCents * CONFIG.buyPrices[tier];
    const index = ['dorm', 'friday', 'december'].indexOf(tier);
    const descriptions: Record<BonusTier, [string, string]> = {
      dorm: ['Лепкави бележки, които остават. Учебниците могат да почакат.', 'Sticky notes that stay. The textbooks can wait.'],
      friday: ['Бележки и един постоянен движещ се Wild. Нощта започва.', 'Sticky notes and one persistent moving Wild. The night begins.'],
      december: ['Всички клетки с бележки и два постоянни Wild-а. Големият студентски празник.', 'Frames on every cell and two persistent Wilds. The biggest student celebration.'],
    };
    return `<article class="sg-feature-card sg-card-${tier}"><div class="sg-card-art sg-bonus-art">${this.symbol((['male', 'dj', 'couple'] as SymbolId[])[index])}<span class="sg-stamp">${bonus.spins} ${this.l('СПИНА', 'SPINS')}</span><span class="sg-bonus-energy">${bonus.energy}×</span></div><div class="sg-card-copy"><span class="sg-card-number">${this.l('КУПОН', 'PARTY')} 0${index + 1}</span><h3>${this.names(BONUS_NAMES[tier])}</h3><p>${this.names(descriptions[tier])}</p><small>${this.l('Начален градус', 'Starting party energy')}: ${bonus.energy}× · ${this.l('до', 'up to')} ${CONFIG.partyLimit}×</small><div class="sg-card-price"><span><b>${CONFIG.buyPrices[tier].toLocaleString(this.lang === 'bg' ? 'bg-BG' : 'en-IE')}×</b> ${this.l('залог', 'bet')}</span><strong>${this.money(cost)}</strong></div><button class="sg-card-button" data-action="buy-${tier}" ${this.busy || cost > session.balanceCents ? 'disabled' : ''}>${cost > session.balanceCents ? this.l('НЕДОСТАТЪЧЕН БАЛАНС', 'LOW BALANCE') : this.l('КУПИ БОНУС', 'BUY BONUS')}</button></div></article>`;
  }

  private confirmationView(): string {
    const choice = this.confirmation!;
    const session = this.options.getSession();
    const multiplier = choice.kind === 'buy' ? CONFIG.buyPrices[choice.bonus] : CONFIG.prices[choice.mode];
    const cost = session.betCents * multiplier;
    const god = choice.kind === 'mode' && choice.mode === 'god';
    const selecting = choice.kind === 'mode' && !god;
    return `<div class="sg-confirmation"><div class="sg-confirm-art">${this.symbol(god ? 'vip' : choice.kind === 'buy' ? 'scatter' : choice.mode === 'wild' ? 'wild' : choice.mode === 'frames' ? 'book' : 'scatter')}</div><span class="sg-eyebrow">${selecting ? this.l('СЛЕДВАЩ ПЛАТЕН РУНД', 'NEXT PAID ROUND') : this.l('ЕДНОКРАТНА ПОКУПКА', 'ONE-TIME PURCHASE')}</span><h3>${this.choiceName(choice)}</h3><p>${selecting ? this.l('Изборът не тегли сума. Натисни СПИН, за да започнеш рунда на тази цена.', 'Selecting does not debit your balance. Press SPIN to start a round at this price.') : this.l('Точната сума ще се удържи веднъж при потвърждение.', 'This exact amount will be debited once when you confirm.')}</p><dl class="sg-confirm-ledger"><div><dt>${this.l('Базов залог', 'Base bet')}</dt><dd>${this.money(session.betCents)}</dd></div><div><dt>${this.l('Множител на цената', 'Price multiplier')}</dt><dd>${this.number(multiplier)}×</dd></div><div class="sg-debit"><dt>${selecting ? this.l('Цена на следващия рунд', 'Next round cost') : this.l('ТОЧНО УДЪРЖАНЕ', 'EXACT DEBIT')}</dt><dd>${this.money(cost)}</dd></div><div><dt>${this.l('Баланс след платения рунд', 'Balance after the paid round')}</dt><dd>${this.money(session.balanceCents - cost)}</dd></div></dl>${god ? `<div class="sg-god-facts"><div><b>4${this.lang === 'bg' ? ',' : '.'}8%</b><span>${this.l('Шанс за всичките 5', 'Chance to collect all 5')}</span></div><div><b>${this.money(session.betCents * CONFIG.capMultiplier)}</b><span>${this.l('Печалба при успех', 'Payout on success')}</span></div></div><p class="sg-zero-note">${this.l('95,2% шанс за нулева печалба. Три независими опита на всяка от петте позиции. Няма други печалби или безплатни спинове.', '95.2% chance of a zero payout. Three independent chances at each of five positions. No other payouts or free spins.')}</p>` : `<p class="sg-small-note">${this.l('Печалбите използват заключения базов залог. Максимум за целия рунд:', 'Payouts use the locked base bet. Maximum for the entire round:')} <b>${this.money(session.betCents * CONFIG.capMultiplier)}</b>. ${choice.kind === 'buy' ? this.l('Бустерите не се добавят към покупката.', 'Booster charges are not added to this purchase.') : ''}</p>`}<div class="sg-confirm-buttons"><button class="sg-secondary-button" data-action="back" ${this.acting ? 'disabled' : ''}>${this.l('НАЗАД', 'BACK')}</button><button class="sg-primary-button" data-action="confirm" ${this.busy || cost > session.balanceCents ? 'disabled' : ''}>${this.acting ? this.l('ИЗЧАКАЙ…', 'PLEASE WAIT…') : selecting ? this.l('ИЗБЕРИ', 'SELECT') : `${this.l('ПОТВЪРДИ', 'CONFIRM')} · ${this.money(cost)}`}</button></div></div>`;
  }

  private paytable(): string {
    return `<p class="sg-lead">${CONFIG.reels} ${this.l('барабана', 'reels')} × ${CONFIG.rows} ${this.l('реда', 'rows')}. ${this.number(CONFIG.rows ** CONFIG.reels)} ${this.l('начални начина да спечелиш.', 'initial ways to win.')}</p><p class="sg-small-note">${this.l('Три или повече последователни барабана отляво. Всяка стойност е множител на базовия залог за един претеглен начин. Плаща се само най-дългата поредица за символа.', 'Three or more consecutive reels from the left. Each value is a base-bet multiplier per weighted way. Only the longest matching sequence for each symbol pays.')}</p><div class="sg-paytable-grid">${PAYING_SYMBOLS.map(symbol => `<article class="sg-pay-symbol">${this.symbol(symbol)}<div><h3>${this.names(SYMBOL_NAMES[symbol])}</h3><div class="sg-pay-values">${CONFIG.paytable[symbol].map((value, index) => `<span><small>${index + 3} ${this.l('БАРАБАНА', 'REELS')}</small><b>${this.number(value / CONFIG.payoutDenominator)}×</b></span>`).join('')}</div></div></article>`).join('')}</div><div class="sg-special-symbols"><article>${this.symbol('wild')}<h3>${this.names(SYMBOL_NAMES.wild)}</h3><p>${this.l('Заменя осемте плащащи символа. Не заменя Scatter или VIP и няма собствено плащане. Бележка удвоява и Wild-а.', 'Substitutes for the eight paying symbols. Does not replace Scatter or VIP and has no payout of its own. A sticky frame doubles a Wild too.')}</p></article><article>${this.symbol('scatter')}<h3>${this.names(SYMBOL_NAMES.scatter)}</h3><p>${this.l('3 / 4 / 5 покани отключват 8 / 10 / 12 спина. По една на барабан, броена веднъж. Не се разделя и няма плащане.', '3 / 4 / 5 invitations trigger 8 / 10 / 12 spins. At most one per reel, counted once. Never splits and has no payout.')}</p></article><article>${this.symbol('vip')}<h3>${this.names(SYMBOL_NAMES.vip)}</h3><p>${this.l('Пет събрани пропуска дават максимум 20 000×. VIP е отделна функция, не обикновен плащащ символ. Никога не се разделя.', 'Five collected passes award the 20,000× maximum. VIP is a separate feature, not an ordinary paying symbol. Never splits.')}</p></article></div><button class="sg-link-button" data-action="rules">${this.l('ВИЖ ТОЧНИТЕ ПРАВИЛА →', 'SEE THE EXACT RULES →')}</button>`;
  }

  private rules(): string {
    const p = CONFIG.god.opportunityProbability;
    return `<div class="sg-rules"><p class="sg-lead">${this.l('Утре съм на лекции. Днес — тези правила.', 'Lectures tomorrow. These rules tonight.')}</p>
      ${this.rule('01', `${this.number(CONFIG.rows ** CONFIG.reels)} ${this.l('начина', 'ways')}`, `${t('rules.ways', {}, this.lang)} ${this.l('Всеки от осемте плащащи символа плаща за най-дългата си поредица.', 'Each of the eight paying symbols pays for its longest sequence.')}`)}
      ${this.rule('02', this.l('Лепкави бележки × Пияният колега', 'Sticky notes × The drunk classmate'), this.l('Бележката разделя плащащ символ или Wild на 2 еднакви копия. Scatter и VIP са изключени. На всеки барабан се събират копията на съответния символ плюс копията на Wild × неговия множител. Сборовете на последователните барабани се умножават: това са претеглените начини. Множителите на Wild на различни барабани се умножават естествено; не се събират.', 'A frame splits a paying symbol or Wild into 2 identical copies. Scatter and VIP are excluded. On each reel, add copies of the matching symbol plus Wild copies × that Wild’s multiplier. Multiply these reel totals across consecutive matching reels to get weighted ways. Wild multipliers on different reels multiply naturally; they are not added.'))}
      <div class="sg-rule-example"><span>${this.l('ПРИМЕР ЗА ЕДИН БАРАБАН', 'ONE-REEL EXAMPLE')}</span><b>1 + (2 × 3) = 7</b><p>${this.l('Един обикновен символ + един Wild с бележка при ×3 = 7 претеглени копия на този барабан.', 'One normal symbol + one framed Wild at ×3 = 7 weighted copies on this reel.')}</p></div>
      ${this.rule('03', this.l('Как Wild залита', 'How a Wild stumbles'), this.l(`Високият Wild започва частично видим при ×1. Една или две случайни стъпки го запълват до четирите клетки; всяка стъпка вдига множителя с 1 до ×${CONFIG.wildMultiplierLimit}. В бонусите Wild остава между спиновете, заема случаен барабан и запазва достигнатия множител. При максимума може да се мести без допълнителни стъпки. Двата Wild-а използват различни барабани.`, `A tall Wild begins partly visible at ×1. One or two random steps fill all four cells; each step adds 1 to its multiplier up to ×${CONFIG.wildMultiplierLimit}. In bonuses a Wild persists between spins, occupies a random reel and keeps its multiplier. At the limit it can move without additional nudge steps. Two Wilds use different reels.`))}
      ${this.rule('04', this.l('Градус на купона', 'Party energy'), this.l(`Текущият множител умножава печалбата от бонусния спин. След спин с положителна печалба се вдига с 1, до ${CONFIG.partyLimit}×. След спин без печалба не се променя. При надграждане се запазва точно натрупаният градус; началните стойности 1× / 3× / 5× важат само при първо влизане в бонуса.`, `The current party multiplier applies to a bonus spin’s winnings. After a positive win it rises by 1, up to ${CONFIG.partyLimit}×. A losing spin does not change it. Upgrades preserve the exact accumulated energy; starting values of 1× / 3× / 5× apply only when first entering a bonus.`))}
      <div class="sg-bonus-rule-grid">${(['dorm', 'friday', 'december'] as BonusTier[]).map((tier, index) => `<article><span>${index + 3} ${this.l('ПОКАНИ', 'INVITATIONS')}</span><h3>${this.names(BONUS_NAMES[tier])}</h3><b>${CONFIG.bonuses[tier].spins} ${this.l('спина', 'spins')} · ${CONFIG.bonuses[tier].energy}×</b><p>${index === 0 ? this.l('Запазващи се бележки. Общежитие, тонколони и лампички.', 'Persistent sticky frames. Dorm room, speakers and fairy lights.') : index === 1 ? this.l('Бележки + 1 постоянен Wild. Улицата оживява.', 'Frames + 1 persistent Wild. The nightlife street comes alive.') : this.l('Всички допустими клетки с бележки + 2 постоянни Wild-а. Сцена и конфети.', 'Every eligible cell framed + 2 persistent Wilds. A stage and confetti.')}</p></article>`).join('')}</div>
      ${this.rule('05', this.l('Покани, надграждане и край', 'Invitations, upgrades and an end'), this.l(`Scatter се брои веднъж на оригинална клетка; максимум един на барабан. В бонус 2 или повече покани дават +${CONFIG.retriggerSpins} спина и едно ниво нагоре, когато е възможно. Има максимум ${CONFIG.retriggerLimit} повторни активации за целия платен рунд: общо до +${CONFIG.retriggerLimit * CONFIG.retriggerSpins} спина. Бележките, Wild прогресът и градусът се запазват. При най-високото ниво се добавят само спиновете.`, `A Scatter is counted once per original cell, with at most one per reel. In a bonus, 2 or more invitations award +${CONFIG.retriggerSpins} spins and upgrade one tier where possible. At most ${CONFIG.retriggerLimit} retriggers are allowed per paid round: up to +${CONFIG.retriggerLimit * CONFIG.retriggerSpins} spins in total. Frames, Wild progress and party energy are preserved. At the highest tier only the extra spins are added.`))}
      ${this.rule('06', this.l('БОГЪТ НА СТУДЕНТСКИ', 'GOD OF STUDENTSKI'), this.l(`Еднократна цена 1 000× базовия залог. Пет позиции, по една на барабан. Всяка незаключена позиция има 3 независими възможности за VIP; успехите остават заключени. Всичките 5 плащат 20 000×. Непълна колекция плаща 0. Няма други плащания или бонус спинове. Успех: 4,8%. Теоретична възвръщаемост: 96%.`, `One-time price: 1,000× the base bet. Five positions, one per reel. Each unlocked position gets 3 independent opportunities to reveal a VIP; collected passes stay locked. All 5 pay 20,000×. An incomplete collection pays 0. No other payouts or free spins. Success: 4.8%. Theoretical return: 96%.`))}
      <div class="sg-formula"><small>${this.l('ВЕРОЯТНОСТ НА ЕДИН ОПИТ', 'PER-OPPORTUNITY PROBABILITY')}</small><code>p = 1 − (1 − 0.048^(1/5))^(1/3)</code><b>p ≈ ${this.number(p * 100)}%</b><code>[1 − (1 − p)³]⁵ = 0.048</code><p>${this.l(`Стандартният VIP шанс е ${this.number(CONFIG.standardVipProbability * 100)}% на платен рунд — 48 000 пъти по-рядко от God Mode. Тези изрични вероятности не зависят от баланса или предишни загуби.`, `The Standard VIP chance is ${this.number(CONFIG.standardVipProbability * 100)}% per paid round — 48,000 times rarer than God Mode. These explicit probabilities do not depend on balance or previous losses.`)}</p></div>
      ${this.rule('07', this.l('Цена, евро и закръгляне', 'Price, euros and rounding'), this.l(`Сметките използват цели евроцентове. Всички печалби на един спин се събират с точна фиксирана аритметика, множителът се прилага и общата сума се закръгля до най-близкия цент веднъж: точно половин цент се закръгля нагоре. Базовият залог се заключва при първото плащане. Бустерите са взаимно изключващи се; покупка на бонус не добавя цена на бустер.`, `Accounting uses integer euro cents. All payouts on one spin are summed with exact fixed-point arithmetic, the multiplier is applied and the total is rounded to the nearest cent once: exactly half a cent rounds up. The base bet is locked at the initial debit. Boosters are mutually exclusive; bonus purchases do not add a booster charge.`))}
      ${this.rule('08', this.l('20 000× за целия рунд', '20,000× for the entire round'), this.l(`Максимумът включва задействащия спин, всички безплатни спинове и повторни активации. При достигането му се изплаща само оставащата сума до 20 000× заключения базов залог и рундът приключва. Купени функции и вече определени резултати се съхраняват локално и се възстановяват след презареждане. Скоростта на анимациите не влияе върху резултатите.`, `The cap includes the triggering spin, all free spins and retriggers. Once reached, only the amount remaining up to 20,000× the locked base bet is settled, and the round ends. Purchased features and resolved outcomes are saved locally and recovered after a reload. Animation speed never affects outcomes.`))}
      <p class="sg-small-note">${this.l('Това е демо с виртуални евро. Няма депозити, тегления или реални парични награди. Наблюдаваната възвръщаемост от симулациите е публикувана в документацията; 96% за останалите режими е цел за калибрация, а не обещана измерена стойност.', 'This is a demo with virtual euros. No deposits, withdrawals or real cash prizes. Measured simulation returns are published in the documentation; 96% for other modes is a calibration target, not a promised measured result.')}</p></div>`;
  }
  private rule(number: string, title: string, copy: string): string { return `<section class="sg-rule"><span class="sg-rule-number">${number}</span><div><h3>${title}</h3><p>${copy}</p></div></section>`; }

  private history(): string {
    const history = this.options.getSession().history;
    const stakes = history.reduce((sum, entry) => sum + entry.costCents, 0);
    const wins = history.reduce((sum, entry) => sum + entry.payoutCents, 0);
    return `<p class="sg-lead">${this.l('Паметта на купона е точна до цент.', 'The party remembers every cent.')}</p><div class="sg-history-summary"><div><span>${this.l('Рундове в дневника', 'Rounds in this log')}</span><b>${history.length}</b></div><div><span>${this.l('Реално платени залози', 'Actual stakes paid')}</span><b>${this.money(stakes)}</b></div><div><span>${this.l('Изплатени печалби', 'Payouts settled')}</span><b>${this.money(wins)}</b></div></div>${history.length ? `<div class="sg-history-scroll"><table class="sg-history-table"><thead><tr><th>${this.l('РУНД / РЕЖИМ', 'ROUND / MODE')}</th><th>${this.l('ЗАЛОГ', 'BASE BET')}</th><th>${this.l('ПЛАТЕНО', 'PAID')}</th><th>${this.l('ПЕЧАЛБА', 'WON')}</th></tr></thead><tbody>${history.map(entry => `<tr><td><b>${this.choiceName(entry.choice)}</b><small>#${escape(entry.id)} · ${entry.spins} ${this.l('спина', 'spins')}${entry.maxWin ? ' · MAX WIN' : ''}</small></td><td>${this.money(entry.betCents)}</td><td>${this.money(entry.costCents)}</td><td class="${entry.payoutCents > 0 ? 'sg-positive' : ''}">${this.money(entry.payoutCents)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="sg-empty-history">${this.symbol('book')}<h3>${this.l('Още е рано.', 'The night is young.')}</h3><p>${this.l('Приключените рундове ще се появят тук. Бонусните спинове са част от платения рунд.', 'Completed rounds will appear here. Bonus spins belong to their original paid round.')}</p></div>`}<p class="sg-small-note">${this.l(`Дневникът пази последните ${CONFIG.historyLimit} завършени рунда. „Платено“ включва действителната обща цена на бустера или покупката.`, `The log keeps the last ${CONFIG.historyLimit} completed rounds. “Paid” includes the actual total booster or purchase price.`)}</p>`;
  }

  private settings(): string {
    const audio = this.options.getAudio();
    const speed = this.options.getSpeed();
    const autoplay = this.options.getAutoplay();
    return `<div class="sg-settings"><section class="sg-setting-row"><div><h3>${this.l('Език / Language', 'Language / Език')}</h3><p>${this.l('Целият интерфейс на твоя език.', 'The whole interface in your language.')}</p></div><div class="sg-segmented"><button data-action="language-bg" aria-pressed="${this.lang === 'bg'}">БЪЛГАРСКИ</button><button data-action="language-en" aria-pressed="${this.lang === 'en'}">ENGLISH</button></div></section>
      <section class="sg-setting-row"><div><h3>${this.l('Звукът на квартала', 'Sound of the neighbourhood')}</h3><p>${this.l('Оригинални звуци, клубен бас и купон.', 'Original sounds, club bass and party layers.')}</p></div><button class="sg-toggle ${!audio.muted ? 'sg-toggle-on' : ''}" data-action="mute" aria-pressed="${!audio.muted}"><span></span>${audio.muted ? this.l('ИЗКЛЮЧЕН', 'OFF') : this.l('ВКЛЮЧЕН', 'ON')}</button></section><div class="sg-volume"><label for="sg-volume">${this.l('Сила на звука', 'Volume')} <b id="sg-volume-value">${Math.round(audio.volume * 100)}%</b></label><input id="sg-volume" name="volume" type="range" min="0" max="100" step="1" value="${Math.round(audio.volume * 100)}" aria-label="${this.l('Сила на звука', 'Volume')}"></div>
      <section class="sg-setting-row"><div><h3>${this.l('Скорост', 'Speed')}</h3><p>${this.l('Едни и същи вероятности при всяка скорост.', 'The same probabilities at every speed.')}</p></div><div class="sg-segmented"><button data-action="speed-normal" aria-pressed="${speed === 'normal'}">${this.l('НОРМАЛНА', 'NORMAL')}</button><button data-action="speed-turbo" aria-pressed="${speed === 'turbo'}">TURBO</button></div></section>
      <section class="sg-autoplay"><div><h3>${this.l('Автоматични рундове', 'Autoplay rounds')}</h3><p>${this.l('Ограничена серия. Спира при недостатъчен баланс. Можеш да спреш по всяко време.', 'A bounded series. Stops if the balance is too low. You can stop at any time.')}</p></div>${autoplay ? `<div class="sg-autoplay-active"><strong>${autoplay}</strong> ${this.l('остават', 'remaining')}<button class="sg-primary-button" data-action="stop-autoplay">${this.l('СПРИ АВТО', 'STOP AUTO')}</button></div>` : `<div class="sg-autoplay-controls"><label for="sg-autoplay-count" class="sg-sr-only">${this.l('Брой автоматични рундове', 'Number of autoplay rounds')}</label><select id="sg-autoplay-count">${[10, 25, 50, 100].filter(count => count <= CONFIG.autoplayLimit).map(count => `<option value="${count}">${count} ${this.l('РУНДА', 'ROUNDS')}</option>`).join('')}</select><button class="sg-primary-button" data-action="autoplay" ${this.busy ? 'disabled' : ''}>${this.l('СТАРТ АВТО', 'START AUTO')}</button></div>`}</section>
      <section class="sg-setting-row sg-refill"><div><h3>${this.l('Стипендията дойде', 'The scholarship arrived')}</h3><p>${this.l('Добави виртуални евро към баланса:', 'Add virtual euros to your balance:')} ${this.money(CONFIG.refillCents)}.</p></div><button class="sg-secondary-button" data-action="refill" ${this.busy ? 'disabled' : ''}>${this.l('ДОПЪЛНИ', 'REFILL')}</button></section></div>`;
  }

  private action(action: string, element: HTMLElement): void {
    if ((element as HTMLButtonElement).disabled) return;
    if (action === 'close') { this.close(); return; }
    if (action === 'back') { this.confirmation = null; this.error = ''; this.resetScroll(); this.render(); return; }
    if (action === 'rules') { this.open('rules'); return; }
    if (action.startsWith('tab-')) { this.featureTab = action === 'tab-buys' ? 'buys' : 'boosters'; this.resetScroll(); this.render(); return; }
    if (action.startsWith('mode-')) {
      const mode = action.slice(5) as Mode;
      if (this.busy) return;
      if (mode === 'standard') { this.options.onSelectMode(mode); this.refresh(); return; }
      this.confirmation = { kind: 'mode', mode }; this.resetScroll(); this.render(); return;
    }
    if (action.startsWith('buy-')) { if (!this.busy) { this.confirmation = { kind: 'buy', bonus: action.slice(4) as BonusTier }; this.resetScroll(); this.render(); } return; }
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
    const session = this.options.getSession();
    const cost = session.betCents * (choice.kind === 'buy' ? CONFIG.buyPrices[choice.bonus] : CONFIG.prices[choice.mode]);
    if (cost > session.balanceCents) { this.error = this.l('Недостатъчен виртуален баланс.', 'Insufficient virtual balance.'); this.render(); return; }
    if (choice.kind === 'mode' && choice.mode !== 'god') { this.options.onSelectMode(choice.mode); this.close(); return; }
    this.acting = true;
    this.render();
    try {
      const result = choice.kind === 'buy' ? this.options.onBuy(choice.bonus) : this.options.onGod();
      // The host starts an animation immediately; the menu must release the canvas.
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
  private change(_input: HTMLInputElement): void { /* Range inputs commit through input; selects are read on explicit start. */ }
  private onKey(event: KeyboardEvent): void {
    if (!this.current) return;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && (document.activeElement as HTMLElement)?.getAttribute('role') === 'tab') {
      event.preventDefault();
      this.featureTab = this.featureTab === 'boosters' ? 'buys' : 'boosters';
      this.render();
      this.overlay.querySelector<HTMLButtonElement>(`[data-action="tab-${this.featureTab}"]`)?.focus();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.overlay.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(element => !element.hidden);
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !this.overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !this.overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
}
