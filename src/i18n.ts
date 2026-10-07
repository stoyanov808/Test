import { CONFIG } from './engine/config';

export type Language = 'bg' | 'en';
export type TranslationParams = Record<string, string | number>;

// Keep both languages beside each other when wording or rules change.
const messages: Record<string, readonly [string, string]> = {
  title: ['СТУДЕНТСКИ ГРАД', 'STUDENTSKI GRAD'], subtitle: ['Утре съм на лекции.', 'I have lectures tomorrow.'],
  location: ['СОФИЯ · СТУДЕНТСКИ ГРАД', 'SOFIA · STUDENTSKI GRAD'],
  demo: ['ДЕМО · ВИРТУАЛНИ ЕВРО', 'DEMO · VIRTUAL EUROS'], virtualEuro: ['ВИРТУАЛНИ ЕВРО', 'VIRTUAL EUROS'],
  demoNotice: ['Игра с виртуални евро. Няма истински залози или парични награди.', 'Play with virtual euros. No real wagers or cash prizes.'],
  creditsAreEuro: ['Всички суми са виртуални евро (€).', 'All amounts are virtual euros (€).'],
  balance: ['БАЛАНС', 'BALANCE'], bet: ['ЗАЛОГ', 'BET'], baseBet: ['БАЗОВ ЗАЛОГ', 'BASE BET'], spinCost: ['ЦЕНА НА СПИН', 'SPIN COST'],
  win: ['ПЕЧАЛБА', 'WIN'], roundWin: ['ПЕЧАЛБА ОТ РУНДА', 'ROUND WIN'], totalWin: ['ОБЩА ПЕЧАЛБА', 'TOTAL WIN'],
  spin: ['СПИН', 'SPIN'], spinning: ['ВЪРТИ СЕ…', 'SPINNING…'], stop: ['СТОП', 'STOP'], stopAutoplay: ['СПРИ АВТОСПИН', 'STOP AUTOPLAY'],
  ready: ['Още едно и тръгвам.', 'One more and I’m leaving.'], busy: ['Купонът още върви…', 'The party is still going…'],
  selectedMode: ['РЕЖИМ', 'MODE'], features: ['КУПОНЪТ', 'THE PARTY'], featureMenu: ['ИЗБЕРИ КУПОНА', 'CHOOSE THE PARTY'],
  boosters: ['БУСТЕРИ', 'BOOSTERS'], bonusBuy: ['КУПИ БОНУС', 'BUY BONUS'], buy: ['КУПИ', 'BUY'], select: ['ИЗБЕРИ', 'SELECT'], selected: ['ИЗБРАН', 'SELECTED'], activate: ['АКТИВИРАЙ', 'ACTIVATE'],
  normal: ['НОРМАЛНО', 'NORMAL'], turbo: ['ТУРБО', 'TURBO'], speed: ['СКОРОСТ', 'SPEED'], autoplay: ['АВТОСПИН', 'AUTOPLAY'], autoplaySpins: ['Брой спинове', 'Number of spins'],
  autoplayStart: ['СТАРТ АВТОСПИН', 'START AUTOPLAY'], autoplayRemaining: ['Остават {count} спина', '{count} spins remaining'], autoplayStopped: ['Автоспинът е спрян.', 'Autoplay stopped.'],
  autoplayLimit: ['До {autoplayLimit} платени спина. Спира при недостатъчен баланс.', 'Up to {autoplayLimit} paid spins. Stops with insufficient balance.'],
  paytable: ['ПЕЧАЛБИ', 'PAYTABLE'], rules: ['ПРАВИЛА', 'RULES'], help: ['КАК СЕ ИГРАЕ', 'HOW TO PLAY'], history: ['ИСТОРИЯ', 'HISTORY'], settings: ['НАСТРОЙКИ', 'SETTINGS'],
  language: ['ЕЗИК', 'LANGUAGE'], sound: ['ЗВУК', 'SOUND'], volume: ['СИЛА НА ЗВУКА', 'VOLUME'], mute: ['БЕЗ ЗВУК', 'MUTE'], unmute: ['ВКЛЮЧИ ЗВУКА', 'ENABLE SOUND'], soundOn: ['ВКЛЮЧЕН', 'ON'], soundOff: ['ИЗКЛЮЧЕН', 'OFF'],
  refill: ['ДОБАВИ ДЕМО ЕВРО', 'ADD DEMO EUROS'], refillDone: ['Стипендията дойде!', 'The scholarship arrived!'], refillInfo: ['Добавя {amount} виртуални евро към демо баланса.', 'Adds {amount} virtual euros to the demo balance.'],
  close: ['ЗАТВОРИ', 'CLOSE'], back: ['НАЗАД', 'BACK'], confirm: ['ПОТВЪРДИ', 'CONFIRM'], cancel: ['ОТКАЗ', 'CANCEL'], continue: ['ПРОДЪЛЖИ', 'CONTINUE'],
  start: ['ДА ЗАПОЧВА КУПОНЪТ', 'LET’S START THE PARTY'], skip: ['ПРОПУСНИ', 'SKIP'], skipAnimation: ['Докосни за пропускане', 'Tap to skip'],
  confirmation: ['ПОТВЪРДИ ПОКУПКАТА', 'CONFIRM PURCHASE'], exactDebit: ['От баланса ще бъдат приспаднати точно {amount}.', 'Exactly {amount} will be deducted from your balance.'],
  confirmBet: ['Заключен базов залог: {amount}', 'Locked base bet: {amount}'], confirmFeature: ['Избран купон: {feature}', 'Selected party: {feature}'], balanceAfter: ['Баланс след покупката: {amount}', 'Balance after purchase: {amount}'],
  price: ['ЦЕНА', 'PRICE'], cost: ['СТОЙНОСТ', 'COST'], baseBetMultiplier: ['{multiplier}× базов залог', '{multiplier}× base bet'], insufficient: ['Недостатъчен демо баланс.', 'Insufficient demo balance.'],
  featureLocked: ['Залогът и режимът са заключени до края на рунда.', 'Bet and mode are locked until the round ends.'], recovered: ['Купонът продължава. Запазеният рунд е възстановен.', 'The party continues. Your saved round was restored.'],
  error: ['Неуспешна операция. Опитай отново.', 'Could not complete the action. Try again.'], loading: ['Приготвяме купона…', 'Getting the party ready…'],
  freeSpins: ['БЕЗПЛАТНИ СПИНОВЕ', 'FREE SPINS'], freeSpinsLeft: ['ОСТАВАТ {count}', '{count} REMAINING'], bonusTotal: ['Печалба от купона', 'Party win'], bonusComplete: ['КУПОНЪТ ПРИКЛЮЧИ', 'PARTY OVER'],
  bonusIntro: ['{spins} БЕЗПЛАТНИ СПИНА', '{spins} FREE SPINS'], bonusUpgrade: ['КУПОНЪТ СЕ ВДИГА!', 'THE PARTY LEVELS UP!'], retrigger: ['КУПОНЪТ ПРОДЪЛЖАВА', 'THE PARTY CONTINUES'],
  shots: ['ДОПЪЛНИТЕЛНИ СПИНОВЕ', 'EXTRA SPINS'], shotsLeft: ['{count} ДОПЪЛНИТЕЛНИ СПИНА', '{count} EXTRA SPINS'], extraShots: ['+2 ДОПЪЛНИТЕЛНИ СПИНА', '+2 EXTRA SPINS'],
  tumble: ['ПАДАНЕ', 'TUMBLE'], tumbleCount: ['ПАДАНЕ {count}', 'TUMBLE {count}'],
  positionMultiplier: ['МНОЖИТЕЛ НА КЛЕТКАТА', 'POSITION MULTIPLIER'], globalMultiplier: ['МНОЖИТЕЛИ НА КЛЕТКИТЕ', 'POSITION MULTIPLIERS'],
  highestMultiplier: ['НАЙ-ВИСОК МНОЖИТЕЛ', 'HIGHEST MULTIPLIER'], persistentMultipliers: ['ЗАПАЗЕНИ МНОЖИТЕЛИ', 'PERSISTENT MULTIPLIERS'],
  bonusUpgrades: ['НАДГРАЖДАНИЯ', 'UPGRADES'], cascadeCount: ['{count} ПАДАНИЯ', '{count} TUMBLES'],
  scatterThreshold: ['8+ НАВСЯКЪДЕ', '8+ ANYWHERE'], matchedSymbols: ['{count} ЕДНАКВИ СИМВОЛА', '{count} MATCHING SYMBOLS'],
  seriesWin: ['ПЕЧАЛБА ОТ СЕРИЯТА', 'SERIES WIN'], boardSize: ['6 БАРАБАНА × 5 РЕДА', '6 REELS × 5 ROWS'],
  partyMeter: ['МНОЖИТЕЛИ НА КЛЕТКИТЕ', 'POSITION MULTIPLIERS'], partyMultiplier: ['Начален множител {multiplier}×', 'Starting multiplier {multiplier}×'],
  energyHint: ['След печалба множителите на клетките се удвояват.', 'After a win, the winning position multipliers double.'], energyBaseHint: ['Печелившите клетки оставят множител за следващото падане.', 'Winning positions leave a multiplier for the next tumble.'],
  stickyNotes: ['ЗАПАЗЕНИ МНОЖИТЕЛИ', 'PERSISTENT MULTIPLIERS'], wildNudge: ['ДИВ СИМВОЛ', 'WILD SYMBOL'], split: ['xWays', 'xWays'],
  waysLabel: ['СИМВОЛИ', 'SYMBOLS'], ways: ['{count} СИМВОЛА', '{count} SYMBOLS'], initialWays: ['6 × 5 · SCATTER ПЕЧАЛБИ', '6 × 5 · SCATTER PAYS'],
  symbolsRequired: ['8+ ЕДНАКВИ СИМВОЛА', '8+ MATCHING SYMBOLS'], clusterWin: ['{count} СИМВОЛА · {amount}', '{count} SYMBOLS · {amount}'],
  nightStarts: ['НОЩТА ЗАПОЧВА ТУК', 'THE NIGHT STARTS HERE'], exploreFeatures: ['ВЛЕЗ В КУПОНА', 'JOIN THE PARTY'], studentskiNights: ['НОЩИТЕ НА СТУДЕНТСКИ', 'STUDENTSKI NIGHTS'],
  partyContinues: ['Купонът продължава.', 'The party continues.'], nextSpinMessage: ['Още едно и тръгвам.', 'One more and I’m leaving.'], neighborhoodYours: ['СТУДЕНТСКИ Е ТВОЙ!', 'STUDENTSKI IS YOURS!'],
  maxWin: ['СТУДЕНТСКИ Е ТВОЙ!', 'STUDENTSKI IS YOURS!'], bigWin: ['Стипендията дойде!', 'The scholarship arrived!'], megaWin: ['РЕКТОРЪТ ЧЕРПИ!', 'THE RECTOR IS BUYING!'],
  historyEmpty: ['Още няма завършени рундове. Купонът те чака.', 'No completed rounds yet. The party is waiting.'], historyTime: ['ЧАС', 'TIME'], historyMode: ['РЕЖИМ', 'MODE'], historyStake: ['ПЛАТЕНО', 'PAID'], historyWin: ['ПЕЧАЛБА', 'WIN'], historyRound: ['РУНД', 'ROUND'],
  historyRounds: ['Последните {count} завършени рунда', 'Last {count} completed rounds'], historyNet: ['НЕТЕН РЕЗУЛТАТ', 'NET RESULT'],
  'mode.standard': ['Обикновен спин', 'Normal spin'], 'mode.hunt': ['Търсим купона · xBet', 'Find the party · xBet'],
  'mode.frames': ['Ден 2 · 2×', 'Day 2 · 2×'], 'mode.notes': ['Ден 2 · 2×', 'Day 2 · 2×'], 'mode.wild': ['Ден 64 · 64×', 'Day 64 · 64×'], 'mode.god': ['Ден 1024 · 1024×', 'Day 1024 · 1024×'],
  'mode.standard.description': ['Обикновен спин с печалби от 8+ еднакви символа навсякъде.', 'Normal spin with payouts for 8+ matching symbols anywhere.'],
  'mode.hunt.description': ['Гарантирана покана на втория барабан и по-висок шанс за бонус.', 'A guaranteed invitation on reel two and an increased bonus chance.'],
  'mode.frames.description': ['Всяка клетка започва с множител 2×.', 'Every position starts with a 2× multiplier.'], 'mode.notes.description': ['Всяка клетка започва с множител 2×.', 'Every position starts with a 2× multiplier.'],
  'mode.wild.description': ['Всяка клетка започва с множител 64×.', 'Every position starts with a 64× multiplier.'], 'mode.god.description': ['Всяка клетка започва с множител 1024×.', 'Every position starts with a 1024× multiplier.'],
  'bonus.dorm': ['КУПОН В ОБЩАКА', 'DORM PARTY'], 'bonus.friday': ['ПЕТЪК В СТУДЕНТСКИ', 'FRIDAY IN STUDENTSKI'], 'bonus.december': ['8 ДЕКЕМВРИ', '8 DECEMBER'],
  'bonus.lucky': ['ЩАСТЛИВ ЖРЕБИЙ', 'LUCKY DRAW'],
  'bonus.lucky.description': ['Един случаен бонус: общак 50%, петък 25%, 8 декември 25%.', 'One randomly selected bonus: Dorm 50%, Friday 25%, 8 December 25%.'],
  luckyDraw: ['ЩАСТЛИВ ЖРЕБИЙ', 'LUCKY DRAW'],
  extraSpin: ['ОЩЕ ЕДИН СПИН', 'EXTRA SPIN'],
  bonusScattersLanding: ['Поканите пристигат…', 'The party invitations are landing…'],
  extraOffer: ['Още един спин за {amount}. Множителите на клетките се запазват; този спин не отключва бонус.', 'One extra spin for {amount}. Position multipliers are retained; this spin cannot trigger a bonus.'],
  extraRetained: ['ЗАПАЗЕНИ МНОЖИТЕЛИ · БЕЗ НОВ БОНУС', 'RETAINED MULTIPLIERS · NO NEW BONUS'],
  extraQuote: ['ТОЧНА ЦЕНА: {amount}', 'EXACT COST: {amount}'],
  'rules.extra.title': ['ОЩЕ ЕДИН ПЛАТЕН СПИН', 'ONE EXTRA PAID SPIN'],
  'rules.extra': ['След платен базов или допълнителен спин може да получиш оферта, когато последната печалба покрива показаната цена. Цената зависи от запазените множители. При приемане тя се удържа веднъж; базовият залог и множителите се запазват, но този спин не може да отключи бонус. Смяна на залога или режима отменя офертата.', 'After a paid base or extra spin, an offer can appear when the last win covers its displayed cost. The cost depends on the retained multipliers. Accepting debits that cost once, retains the base bet and position multipliers, and cannot trigger a bonus. Changing the bet or mode clears the offer.'],
  'paytable.status': ['Печалби по потвърдената публична таблица на Duck Hunters, с оригинални символи на Студентски град.', 'Verified public Duck Hunters paytable, with original Studentski Grad symbols.'],
  'bonus.dorm.description': ['7 спина и едно случайно надграждане. Множителите се запазват.', '7 spins and one random upgrade. Position multipliers persist.'],
  'bonus.friday.description': ['8 спина и две различни случайни надграждания. Множителите се запазват.', '8 spins and two distinct random upgrades. Position multipliers persist.'],
  'bonus.december.description': ['10 спина и трите надграждания. Множителите се запазват.', '10 spins and all three upgrades. Position multipliers persist.'],
  'upgrade.infectious': ['ЗАРАЗЕН КУПОН', 'PARTY INFECTION'], 'upgrade.bomb': ['КОНФЕТИ БОМБА', 'CONFETTI BOMB'], 'upgrade.shots': ['ДВОЕН ДОПЪЛНИТЕЛЕН СПИН', 'DOUBLE EXTRA SPIN'],
  'upgrade.infectious.description': ['Всички купонни говорители в бонуса стават заразени: при разкриване усилват всички видими клетки със същия символ.', 'All party speakers in the bonus become infectious: on reveal they boost every visible position with the same symbol.'],
  'upgrade.bomb.description': ['Зоната на бомбата се увеличава от 3 × 3 на 5 × 5.', 'The bomb area grows from 3 × 3 to 5 × 5.'],
  'upgrade.shots.description': ['Всеки символ „Още един“ добавя 2 спина вместо 1.', 'Each “One more” symbol awards 2 spins instead of 1.'],
  'upgrade.none': ['БЕЗ НАДГРАЖДАНИЯ', 'NO UPGRADES'],
  'symbol.book': ['Учебник', 'Textbook'], 'symbol.coffee': ['Кафе', 'Coffee'], 'symbol.noodles': ['Бързи спагети', 'Instant noodles'], 'symbol.doner': ['Дюнер', 'Döner'],
  'symbol.beer': ['Бира', 'Beer'], 'symbol.bouncer': ['Охраната', 'The bouncer'],
  'symbol.female': ['Стилната колежка', 'The stylish classmate'], 'symbol.male': ['Колегата преди изпит', 'The exhausted student'], 'symbol.dj': ['Студентът DJ', 'Student DJ'], 'symbol.couple': ['Купонджийската двойка', 'The party couple'],
  'symbol.wild': ['WILD', 'WILD'], 'symbol.scatter': ['ПОКАНА ЗА КУПОН', 'PARTY INVITATION'], 'symbol.vip': ['ПОКАНА ЗА КУПОН', 'PARTY INVITATION'],
  'symbol.xways': ['КУПОНЕН ГОВОРИТЕЛ', 'PARTY SPEAKER'], 'symbol.infectious': ['ЗАРАЗЕН КУПОН', 'PARTY INFECTION'], 'symbol.bomb': ['КОНФЕТИ БОМБА', 'CONFETTI BOMB'], 'symbol.shot': ['ОЩЕ ЕДИН СПИН', 'ONE MORE SPIN'],
  'rules.ways.title': ['SCATTER ПЕЧАЛБИ', 'SCATTER PAYS'],
  'rules.ways': ['6 барабана × 5 реда. Осем или повече еднакви символа плащат навсякъде по решетката; няма изискване за съседни клетки или поредица отляво. Wild замества плащащ символ. Печелившите символи изчезват, останалите падат и нови запълват празните клетки.', '6 reels × 5 rows. Eight or more matching symbols pay anywhere on the grid; they do not need to touch or start on the left. Wild substitutes for a paying symbol. Winning symbols disappear, remaining symbols fall and new symbols refill the empty positions.'],
  'rules.notes.title': ['МНОЖИТЕЛИ НА КЛЕТКИТЕ', 'POSITION MULTIPLIERS'],
  'rules.notes': ['След печалба клетките с печеливши символи оставят множител 2×. Следваща печалба на същото място го удвоява, до 8192×. Множителят остава на мястото си при падане на символите. В бонуса се запазва и между спиновете.', 'After a win, winning positions leave a 2× multiplier. Another win on the same position doubles it, up to 8192×. A position multiplier stays in place when symbols fall. During a bonus it also persists between spins.'],
  'rules.wild.title': ['WILD И xWays', 'WILD AND xWays'],
  'rules.wild': ['Wild замества плащащ символ. Купонният говорител разкрива плащащ символ и множител ×2, ×4 или ×8 и усилва собствената си клетка. Всички говорители от едно падане разкриват един и същ символ. С надграждането в бонуса всички говорители стават заразени и усилват всички видими съвпадащи клетки. Още неразкритите говорители не са цели. Броят за печалба е броят физически клетки със символа.', 'Wild substitutes for a paying symbol. The party speaker reveals a paying symbol and a ×2, ×4 or ×8 factor, then boosts its own position. All speakers on one drop reveal the same symbol. Rare infectious speakers can appear naturally. The bonus upgrade guarantees all speakers infectious, which boost every visible matching position. Unrevealed speakers are protected. Wins count physical matching positions.'],
  'rules.wildMath': ['Множителите над 1× на участващите клетки се събират и умножават печалбата за съответния символ. Клетки без множител не добавят 1× към този сбор. Ако няма множители, печалбата е по таблицата.', 'Multipliers above 1× on participating positions are added together and multiply that symbol’s award. Positions without a multiplier do not add 1× to this sum. With no multipliers, the award is the paytable value.'],
  'rules.party.title': ['ЗАПАЗЕН ПРОГРЕС', 'PERSISTENT PROGRESS'], 'rules.party': ['В бонуса множителите на клетките се пазят през всички спинове и надграждания.', 'During a bonus, position multipliers persist through all spins and upgrades.'],
  'rules.scatter.title': ['ПОКАНИ И БОНУСИ', 'INVITATIONS AND BONUSES'],
  'rules.scatter': ['3 / 4 / 5+ покани отключват 7 / 8 / 10 спина с 1 / 2 / 3 различни случайни надграждания. Поканите са отделни от деветте плащащи символа.', '3 / 4 / 5+ invitations trigger 7 / 8 / 10 spins with 1 / 2 / 3 distinct random upgrades. Invitations are separate from the nine paying symbols.'],
  'rules.retrigger.title': ['ОЩЕ ЕДИН СПИН', 'ONE MORE SPIN'], 'rules.retrigger': ['Символът „Още един“ в бонуса добавя един спин, или два с надграждането за допълнителни спинове. Надгражданията се избират при влизане; бонусът не се сменя от нови покани.', 'The “One more” symbol during a bonus adds one spin, or two with the extra-spins upgrade. Upgrades are chosen on entry; new invitations do not change the bonus tier.'],
  'rules.accounting.title': ['ЗАЛОГ, ЦЕНА И ПЛАЩАНЕ', 'BET, COST AND ACCOUNTING'],
  'rules.accounting': ['Печалбите използват базовия залог. Цената е действително удържаната сума. Базовият залог се заключва за целия рунд. Покупката на бонус не добавя цена на бустер. Сумите се пазят в евроцентове.', 'Payouts use the base bet. Cost is the amount actually debited. The base bet locks for the entire round. Bonus buys do not add a booster charge. Amounts are stored as euro cents.'],
  'rules.cap.title': ['МАКСИМАЛНА ПЕЧАЛБА', 'MAXIMUM WIN'], 'rules.cap': ['Максималната печалба за целия платен рунд е 30 000× базовия залог, включително всички падания, бонус спинове и повторни активирания.', 'The maximum win for an entire paid round is 30,000× the base bet, including all tumbles, bonus spins and retriggers.'],
  'rules.random.title': ['ДЕМО РЕЗУЛТАТИ', 'DEMO OUTCOMES'], 'rules.random': ['Резултатът не зависи от баланса, предишни загуби или скоростта на анимацията. Автоспинът е ограничен. Платените функции се запазват при презареждане.', 'Outcomes do not depend on balance, previous losses or animation speed. Autoplay is bounded. Purchased features survive reloads.'],
  'paytable.intro': ['Печалба за броя еднакви символи навсякъде като множител на базовия залог.', 'Award for the count of matching symbols anywhere, as a multiple of the base bet.'],
  'paytable.reels': ['{count} СИМВОЛА', '{count} SYMBOLS'], 'paytable.wild': ['Замества плащащите символи', 'Substitutes for paying symbols'], 'paytable.scatter': ['3 / 4 / 5+ покани активират бонус', '3 / 4 / 5+ invitations trigger a bonus'],
  'render.block': ['БЛОК 59 / СТУДЕНТСКИ', 'BLOCK 59 / STUDENTSKI'], 'render.lecture': ['ЛЕКЦИЯ: 08:00', 'LECTURE: 08:00'], 'render.tagline': ['Утре съм на лекции.', 'I have lectures tomorrow.'], 'render.demo': ['ДЕМО · ВИРТУАЛНИ ЕВРО', 'DEMO · VIRTUAL EUROS'],
  'render.maxwin': ['СТУДЕНТСКИ Е ТВОЙ!', 'STUDENTSKI IS YOURS!'], 'render.god': ['ДЕН 1024', 'DAY 1024'],
  'render.scatterpay': ['8+ ЕДНАКВИ НАВСЯКЪДЕ', '8+ MATCHING ANYWHERE'],
  'render.position': ['ПОЗИЦИИ', 'POSITIONS'], 'render.cascade': ['КАСКАДА', 'CASCADE'],
  'render.matching': ['ЕДНАКВИ СИМВОЛА', 'MATCHING SYMBOLS'], 'render.extrashot': ['СПИН', 'SPIN'],
  'render.bigwin': ['ГОЛЯМА ВЕЧЕР!', 'A BIG NIGHT!'], 'render.win': ['НАЗДРАВЕ!', 'CHEERS!'],
  'event.lecture': ['Лекция: 08:00. Купон: сега.', 'Lecture: 08:00. Party: now.'], 'event.doner': ['Последният дюнер е най-сладък.', 'The last döner tastes the best.'],
  'event.notes': ['Множителите останаха. Купонът продължава.', 'The multipliers stayed. The party continues.'], 'event.wild': ['Още един див символ.', 'One more wild symbol.'], 'event.scholarship': ['Стипендията дойде!', 'The scholarship arrived!'], 'event.friday': ['Петък няма последна спирка.', 'Friday has no last stop.'], 'event.december': ['8 декември. Лекциите почиват.', '8 December. Lectures take the night off.'],
};

export const dictionaries: Record<Language, Record<string, string>> = {
  bg: Object.fromEntries(Object.entries(messages).map(([key, pair]) => [key, pair[0]])),
  en: Object.fromEntries(Object.entries(messages).map(([key, pair]) => [key, pair[1]])),
};
export function t(key: string, params: TranslationParams = {}, language: Language = 'bg'): string {
  const text = dictionaries[language][key] ?? dictionaries.bg[key] ?? key;
  const configured: TranslationParams = { autoplayLimit: CONFIG.autoplayLimit, ...params };
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(configured[name] ?? match));
}
export function createTranslator(language: Language): (key: string, params?: TranslationParams) => string {
  return (key, params = {}) => t(key, params, language);
}
/** Receives euros; integer accounting values use formatEuroCents instead. */
export function formatEuro(value: number, language: Language = 'bg'): string {
  return new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}
export function formatEuroCents(cents: number, language: Language = 'bg'): string { return formatEuro(cents / 100, language); }
export const symbolLabels = (language: Language) => Object.fromEntries(
  ['book', 'coffee', 'noodles', 'doner', 'beer', 'female', 'male', 'dj', 'couple', 'bouncer', 'wild', 'scatter', 'xways', 'infectious', 'bomb', 'shot'].map(id => [id, t(`symbol.${id}`, {}, language)]),
);
export const modeLabels = (language: Language) => Object.fromEntries(
  ['standard', 'hunt', 'frames', 'notes', 'wild', 'god'].map(id => [id, t(`mode.${id}`, {}, language)]),
);
export const bonusLabels = (language: Language) => Object.fromEntries(
  ['dorm', 'friday', 'december'].map(id => [id, t(`bonus.${id}`, {}, language)]),
);
