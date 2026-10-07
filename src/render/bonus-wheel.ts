import type { BonusTier, BonusUpgrade } from '../engine/types';
import type { Language } from '../i18n';

const UPGRADES: BonusUpgrade[] = ['infectious', 'bomb', 'shots'];
const ICONS: Record<BonusUpgrade, string> = { infectious: 'infectious-upgraded', bomb: 'bomb', shots: 'shot' };
const SECTOR_COLORS = ['#397c77', '#bd593c', '#71568a'];
let currentSkip: (() => void) | null = null;

export interface BonusWheelOptions {
  tier: BonusTier;
  upgrades: BonusUpgrade[];
  spins: number;
  language: Language;
  translate: (key: string) => string;
  turbo?: boolean;
  onTick?: () => void;
}

function escape(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }
function at(angle: number, radius: number) { return { x: 240 + Math.cos(angle * Math.PI / 180) * radius, y: 240 + Math.sin(angle * Math.PI / 180) * radius }; }
function sector(index: number) {
  const a = at(index * 120, 220), b = at((index + 1) * 120, 220);
  return `<path d="M240 240L${a.x} ${a.y}A220 220 0 0 1 ${b.x} ${b.y}Z" fill="${SECTOR_COLORS[index]}" stroke="#241d28" stroke-width="6"/>`;
}

/** Skips only the presentation; the engine has already committed the awarded perks. */
export function skipBonusWheel() { currentSkip?.(); }

/** A wheel replay of engine-selected upgrades. It never draws a random result. */
export function showBonusWheel(options: BonusWheelOptions): Promise<void> {
  currentSkip?.();
  const selected = [...options.upgrades];
  if (selected.length !== ({ dorm: 1, friday: 2, december: 3 })[options.tier] || new Set(selected).size !== selected.length) return Promise.reject(new Error('Invalid bonus wheel awards'));
  const tr = options.translate, copy = (bg: string, en: string) => options.language === 'bg' ? bg : en;
  const assetBase = `${import.meta.env.BASE_URL}art-v2/`;
  const firstIndex = UPGRADES.indexOf(selected[0]);
  const topAngle = -90;
  const finalAngle = options.tier === 'december' ? 0 : ((topAngle - (firstIndex * 120 + 60)) % 360 + 360) % 360 + 360 * 5;
  const pointerAngles = options.tier === 'december'
    ? selected.map(upgrade => UPGRADES.indexOf(upgrade) * 120 + 60)
    : selected.map(upgrade => topAngle + ((UPGRADES.indexOf(upgrade) - firstIndex + 3) % 3) * 120);
  const previousFocus = document.activeElement as HTMLElement | null;
  const gameShell = document.querySelector<HTMLElement>('.game-shell');
  const previousInert = gameShell?.inert ?? false;
  const overlay = document.createElement('div');
  overlay.id = 'bonus-wheel'; overlay.className = 'sg-wheel-overlay';
  overlay.dataset.tier = options.tier; overlay.dataset.pointers = String(selected.length); overlay.dataset.upgrades = selected.join(','); overlay.dataset.awardedUpgrades = selected.join(','); overlay.dataset.spinning = String(options.tier !== 'december'); overlay.dataset.phase = options.tier === 'december' ? 'ready' : 'spinning';
  overlay.innerHTML = `<section class="sg-wheel-dialog" role="dialog" aria-modal="true" aria-labelledby="sg-wheel-title" aria-describedby="sg-wheel-detail" tabindex="-1">
    <header><span class="sg-wheel-kicker">${copy('ВЕЧЕРТА ЗАПОЧВА', 'THE NIGHT STARTS HERE')}</span><h2 id="sg-wheel-title">${escape(tr(`bonus.${options.tier}`))}</h2><p id="sg-wheel-detail">${options.spins} ${escape(tr('freeSpins'))} · ${copy('КОЛЕЛО НА КУПОНА', 'PARTY WHEEL')}</p></header>
    <div class="sg-wheel-stage"><div class="sg-wheel-dial" style="--wheel-end:${finalAngle}deg"><svg viewBox="0 0 480 480" role="img" aria-label="${escape(copy('Колело с три различни надграждания', 'Wheel with three distinct upgrades'))}"><circle cx="240" cy="240" r="232" fill="#b18346" stroke="#201c28" stroke-width="10"/>${UPGRADES.map((upgrade, index) => {
      const icon = at(index * 120 + 60, 137);
      const label = upgrade === 'shots' ? `<tspan x="${icon.x}" y="${icon.y + 73}">${copy('ДВОЕН', 'DOUBLE')}</tspan><tspan x="${icon.x}" dy="20">${copy('ДОП. СПИН', 'EXTRA SPIN')}</tspan>` : escape(tr(`upgrade.${upgrade}`));
      return `${sector(index)}<g class="sg-wheel-sector-content" style="transform-origin:${icon.x}px ${icon.y}px"><image href="${assetBase}${ICONS[upgrade]}.svg" x="${icon.x - 57}" y="${icon.y - 62}" width="114" height="124"/><text x="${icon.x}" y="${icon.y + 77}" text-anchor="middle" fill="#fff1cf" stroke="#201c28" stroke-width="4" paint-order="stroke" font-family="Grad Display,Arial,sans-serif" font-size="17" font-weight="800">${label}</text></g>`;
    }).join('')}<circle cx="240" cy="240" r="225" fill="none" stroke="#fff1cf" stroke-width="3"/><g class="sg-wheel-sector-content" style="transform-origin:240px 240px"><circle cx="240" cy="240" r="38" fill="#e4a442" stroke="#201c28" stroke-width="7"/><text x="240" y="249" text-anchor="middle" fill="#201c28" font-family="Grad Display,Arial,sans-serif" font-size="29" font-weight="900">SG</text></g></svg></div>
    ${selected.map((upgrade, index) => `<span class="sg-wheel-pointer" data-upgrade="${upgrade}" style="--pointer-angle:${pointerAngles[index]}deg" aria-label="${escape(tr(`upgrade.${upgrade}`))}"><i></i></span>`).join('')}
    </div>
    <div class="sg-wheel-awards" aria-live="polite" aria-hidden="${options.tier !== 'december'}">${selected.map(upgrade => `<div data-award="${upgrade}"><img src="${assetBase}${ICONS[upgrade]}.svg" alt=""><b>${escape(tr(`upgrade.${upgrade}`))}</b><span>${copy('АКТИВНО', 'ACTIVE')}</span></div>`).join('')}</div>
    <p class="sg-wheel-message">${options.tier === 'december' ? copy('Всички три надграждания са твои. Няма нужда от завъртане.', 'All three upgrades are yours. The wheel stays still.') : selected.length === 2 ? copy('Две стрелки. Две различни надграждания.', 'Two pointers. Two distinct upgrades.') : copy('Една стрелка. Едно гарантирано надграждане.', 'One pointer. One guaranteed upgrade.')}</p>
    <button class="sg-wheel-continue" ${options.tier === 'december' ? '' : 'disabled'}>${escape(tr('continue'))} <span aria-hidden="true">→</span></button>
  </section>`;
  document.body.append(overlay); document.body.classList.add('sg-wheel-open'); if (gameShell) gameShell.inert = true;
  const dialog = overlay.querySelector<HTMLElement>('.sg-wheel-dialog')!, dial = overlay.querySelector<HTMLElement>('.sg-wheel-dial')!, button = overlay.querySelector<HTMLButtonElement>('.sg-wheel-continue')!;
  dialog.focus();
  return new Promise(resolve => {
    let finished = false, landed = options.tier === 'december';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const land = () => {
      if (finished || landed && options.tier !== 'december') return;
      // Commit the exact stopping angle before enabling the player's next action.
      // The timer is a fallback; a delayed animation frame must not leave the
      // wheel visually in motion while its awards are already marked ready.
      dial.style.transition = 'none';
      dial.style.transform = `rotate(${finalAngle}deg)`;
      landed = true; overlay.dataset.spinning = 'false'; overlay.dataset.phase = 'ready'; overlay.classList.add('sg-wheel-landed');
      overlay.querySelector('.sg-wheel-awards')!.setAttribute('aria-hidden', 'false');
      dial.querySelectorAll<SVGGElement>('.sg-wheel-sector-content').forEach(group => { group.style.transform = `rotate(${-finalAngle}deg)`; });
      button.disabled = false; button.focus(); options.onTick?.();
    };
    const finish = () => {
      if (finished) return;
      land(); finished = true; if (timer) clearTimeout(timer);
      document.removeEventListener('keydown', keydown, true); overlay.remove(); document.body.classList.remove('sg-wheel-open'); currentSkip = null;
      if (gameShell) gameShell.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus(); resolve();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') { event.preventDefault(); if (button.disabled) dialog.focus(); else button.focus(); }
      if (event.key === 'Escape' || event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation(); if (landed) finish(); }
    };
    currentSkip = finish;
    document.addEventListener('keydown', keydown, true); button.addEventListener('click', finish);
    if (options.tier === 'december') { overlay.classList.add('sg-wheel-stationary'); land(); }
    else {
      const duration = options.turbo ? 2900 : 4100;
      dial.style.transition = `transform ${duration}ms cubic-bezier(.12,.68,.12,1)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (finished) return;
        dial.style.transform = `rotate(${finalAngle}deg)`;
        timer = setTimeout(land, duration + 100);
      }));
    }
  });
}
