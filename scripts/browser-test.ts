import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { CONFIG, PAYING_SYMBOLS, STORAGE_KEY, createSession, startRound, playCompleteRound, selectBet, setMode, type BonusTier, type Grid, type Mode, type RoundChoice, type Session, type SpinPresentation } from '../src/engine';
import { t } from '../src/i18n';

declare global {
  interface Window {
    __slot: {
      snapshot(): Session;
      busy(): boolean;
      reset(seed: number, balance?: number): void;
      skip(): void;
      setTurbo(turbo: boolean): void;
      presentation(): SpinPresentation | null;
      board(): {grid: Grid; positionMultipliers: number[][]; cascade: number};
    };
    __animationPhases?: string[];
    __animationFormulas?: string[];
    __boardCounts?: {actual: string; expected: string; phase: string}[];
    __restoreCanvasSpy?: () => void;
  }
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(repositoryRoot, 'test-results');
await mkdir(output, { recursive: true });
let baseURL = process.env.SLOT_BASE_URL ?? '';
// Linux cloud images may supply Chromium. Windows/macOS use Playwright's installed browser.
const systemChromium = process.platform === 'linux' && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
const executablePath = process.env.CHROMIUM_PATH || systemChromium;
const browserDescription = executablePath ? `System Chromium (${executablePath})` : 'Playwright-managed Chromium';
let browser: Browser | undefined;
let ownedServer: ViteDevServer | undefined;
const results: { name: string; passed: boolean; durationMs: number; error?: string }[] = [];
const runtimeErrors: string[] = [], failedRequests: string[] = [], externalImages: string[] = [], screenshots: string[] = [];
const assets = new Set<string>();
const fixtures: Record<string, number> = {};
const desktopViewports = [{width:1280,height:720},{width:1440,height:720},{width:1440,height:800},{width:1440,height:1000},{width:1920,height:1080}];

function watch(page: Page, name: string) {
  page.on('pageerror', error => runtimeErrors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`${name}: ${message.text()}`); });
  page.on('request', request => {
    if (request.resourceType() === 'image' && !request.url().startsWith(baseURL) && !request.url().startsWith('data:')) externalImages.push(request.url());
  });
  page.on('response', response => {
    if (response.url().startsWith(baseURL) && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    if (/\/(art-v2|fonts)\//.test(response.url()) && response.ok()) assets.add(new URL(response.url()).pathname);
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseURL) && !request.failure()?.errorText.includes('ERR_ABORTED')) failedRequests.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
}
async function shot(page: Page, name: string) {
  const file = `v2-${name}.png`;
  await page.screenshot({ path: resolve(output, file), fullPage: true, animations: 'disabled' });
  screenshots.push(file);
}
async function check(name: string, page: Page, action: () => Promise<void>) {
  const started = performance.now();
  try {
    await action();
    results.push({ name, passed: true, durationMs: Math.round(performance.now() - started) });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    results.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: detail });
    process.stdout.write(`FAIL ${name}: ${detail}\n`);
    await shot(page, `failure-${results.length}`).catch(() => {});
  }
}
async function load(page: Page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slot);
  await page.evaluate(() => document.fonts.ready);
}
async function snapshot(page: Page): Promise<Session> { return page.evaluate(() => window.__slot.snapshot()); }
async function presentation(page: Page): Promise<SpinPresentation | null> { return page.evaluate(() => window.__slot.presentation()); }
async function finish(page: Page) {
  // Skip visual delays; production code still settles each free spin and writes every outcome.
  await page.evaluate(async () => {
    const deadline = performance.now() + 30_000;
    while (window.__slot.busy() || window.__slot.snapshot().presentation || window.__slot.snapshot().activeRound) {
      if (performance.now() > deadline) throw new Error(`Round did not finish: ${JSON.stringify(window.__slot.snapshot())}`);
      window.__slot.skip();
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  });
  assert.equal(await page.locator('#error-toast:not([hidden])').count(), 0, 'settlement must not show an application error');
}
async function reset(page: Page, seed: number, balance: number = CONFIG.initialBalanceCents) {
  await page.keyboard.press('Escape');
  if (await page.locator('#autoplay.active').count()) await page.locator('#autoplay').click();
  await finish(page);
  await page.evaluate(({ seed, balance }) => { window.__slot.reset(seed, balance); window.__slot.setTurbo(true); }, { seed, balance });
}
async function close(page: Page) {
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-overlay:not([hidden])').count(), 0);
}
async function features(page: Page, tab: 'boosters' | 'buys') {
  await page.locator('#features').click();
  await page.locator(`[data-action="tab-${tab}"]`).click();
}
async function selectMode(page: Page, mode: Mode) {
  if (mode === 'standard') return;
  await features(page, 'boosters');
  await page.locator(`[data-action="mode-${mode}"]`).click();
  await euro(page, '.sg-debit dd', Math.round(CONFIG.defaultBetCents * CONFIG.prices[mode]));
  assert.match(await page.locator('.sg-confirmation').innerText(), /Selecting does not debit/);
  assert.equal((await snapshot(page)).balanceCents, CONFIG.initialBalanceCents);
  await page.locator('[data-action="confirm"]').click();
  assert.equal((await snapshot(page)).selectedMode, mode);
  assert.equal((await snapshot(page)).balanceCents, CONFIG.initialBalanceCents);
}
async function buy(page: Page, tier: BonusTier) {
  await features(page, 'buys');
  await page.locator(`[data-action="buy-${tier}"]`).click();
  await euro(page, '.sg-debit dd', CONFIG.defaultBetCents * CONFIG.buyPrices[tier]);
  assert.equal((await snapshot(page)).roundSequence, 0, 'opening confirmation does not charge');
  await page.locator('[data-action="confirm"]').click();
  assert.equal(await page.locator('.sg-overlay:not([hidden])').count(), 0);
}
function amount(text: string | null, language: 'bg' | 'en' = 'en') {
  assert.ok(text?.includes('€'), `Expected a euro amount: ${text}`);
  let value = text!.replace(/[^\d,.-]/g, '');
  value = language === 'bg' ? value.replace(',', '.') : value.replaceAll(',', '');
  return Math.round(Number(value) * 100);
}
async function euro(page: Page, selector: string, cents: number, language: 'bg' | 'en' = 'en') {
  assert.equal(amount(await page.locator(selector).textContent(), language), cents, `${selector} shows the accounted euro amount`);
}
function paidRound(session: Session, cost: number, initialBalance: number = CONFIG.initialBalanceCents) {
  assert.equal(session.roundSequence, 1, 'one action creates one paid round');
  assert.equal(session.history.length, 1, 'one receipt for the complete paid round');
  assert.equal(session.history[0].costCents, cost);
  assert.equal(session.balanceCents, initialBalance - cost + session.history[0].payoutCents, 'exactly one debit and the settled payout');
  assert.equal(session.phase, 'idle');
  assert.equal(session.activeRound, null);
  assert.equal(session.presentation, null);
}
async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.page <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
}
function naturalSeed(name: string, choice: RoundChoice, accepts: (view: SpinPresentation, session: Session) => boolean, limit = 100_000) {
  for (let seed = 1; seed <= limit; seed++) {
    const started = startRound(createSession(seed), choice);
    if (accepts(started.presentation!, started)) { fixtures[name] = seed; return seed; }
  }
  throw new Error(`No natural production-RNG fixture found for ${name}`);
}
function matchingCount(grid: Grid) { return Math.max(...PAYING_SYMBOLS.map(symbol => grid.flat().filter(cell => cell === symbol || cell === 'wild').length)); }
async function observeFormulaAndCount(page: Page) {
  await page.evaluate(symbols => {
    window.__restoreCanvasSpy?.(); window.__animationFormulas = []; window.__boardCounts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    window.__restoreCanvasSpy = () => { CanvasRenderingContext2D.prototype.fillText = original; delete window.__restoreCanvasSpy; };
    CanvasRenderingContext2D.prototype.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
      if (text.includes('€') && /[=→]/.test(text)) {
        if (!window.__animationFormulas!.includes(text)) window.__animationFormulas!.push(text);
        const grid = window.__slot.board().grid;
        const expected = `${Math.max(...symbols.map(symbol => grid.flat().filter(cell => cell === symbol || cell === 'wild').length))}/8`;
        window.__boardCounts!.push({actual: document.getElementById('ways')!.textContent!, expected, phase: document.getElementById('reels')!.dataset.animation!});
      }
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  }, PAYING_SYMBOLS);
}
async function assertFormulasAndCount(page: Page, view: SpinPresentation, language: 'en' | 'bg') {
  const rendered = await page.evaluate(() => ({formulas: window.__animationFormulas!, counts: window.__boardCounts!}));
  const format = (euros: number, maximumFractionDigits = 2) => new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-IE', {style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits}).format(euros);
  const normalize = (value: string) => value.replace(/\s+/g, ' ');
  const expected = view.wins.map(win => `${format(view.lockedBetCents * win.payMultiplier / 100, 4)} × ${win.positionMultiplier} = ${format(win.payoutCents / 100)}`);
  assert.deepEqual([...new Set(rendered.formulas.map(normalize))].sort(), [...new Set(expected.map(normalize))].sort(), 'the canvas paints the locked base-bet euro award × position sum = recorded payout');
  assert.ok(rendered.counts.length > 0, 'the win frame is observed');
  assert.ok(rendered.counts.every(count => count.actual === count.expected), `header counts follow the renderer grid: ${JSON.stringify(rendered.counts)}`);
  assert.ok(rendered.counts.some(count => count.actual !== `${matchingCount(view.initialGrid)}/8`), 'a later winning board updates the count from the first landed grid');
  await page.evaluate(() => window.__restoreCanvasSpy?.());
}

try {
  if (!baseURL) {
    // Own the server directly, using an available port and its actual resolved URL.
    ownedServer = await createServer({ root: repositoryRoot, server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await ownedServer.listen();
    baseURL = ownedServer.resolvedUrls?.local[0] ?? '';
    assert.ok(baseURL, 'the owned Vite server exposes its actual loopback URL');
  }
  process.stdout.write(`Browser checks against ${baseURL}\n`);
  browser = await chromium.launch({ executablePath, headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktop = await desktopContext.newPage();
  desktop.setDefaultTimeout(12_000);
  watch(desktop, 'desktop');
  await load(desktop);

  await check(`Desktop renders the original 6 × 5 SVG board, ${PAYING_SYMBOLS.length} paying symbols and local fonts`, desktop, async () => {
    assert.equal(await desktop.locator('html').getAttribute('lang'), 'bg');
    assert.match(await desktop.locator('#reels').getAttribute('aria-label') ?? '', /Шест барабана, пет реда/);
    assert.match(await desktop.locator('#board-counter').innerText(), /8\+/);
    const drawing = await desktop.locator('#reels').evaluate(canvas => {
      const image = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height);
      const colors = new Set<string>();
      for (let p = 0; p < image.data.length; p += 400) colors.add(`${image.data[p]}:${image.data[p + 1]}:${image.data[p + 2]}`);
      return { width: image.width, height: image.height, colors: colors.size, loadedFonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family) };
    });
    assert.ok(drawing.width > 300 && drawing.height > 200 && drawing.colors > 40, JSON.stringify(drawing));
    assert.equal(drawing.loadedFonts.length, 2, 'both local font faces loaded');
    const artwork = [...PAYING_SYMBOLS, 'wild', 'scatter', 'xways', 'infectious', 'bomb', 'shot', 'couple', 'party-shuttle', 'scene-base', 'scene-dorm', 'scene-friday', 'scene-december'];
    const decoded = await desktop.evaluate(async ids => Promise.all(ids.map(async id => {
      const image = new Image(); image.src = `/art-v2/${id}.svg`; await image.decode();
      return { id, width: image.naturalWidth, height: image.naturalHeight };
    })), artwork);
    assert.ok(decoded.every(image => image.width > 100 && image.height > 100), JSON.stringify(decoded));
    for (const id of PAYING_SYMBOLS) assert.ok(assets.has(`/art-v2/${id}.svg`), `${id} served successfully`);
    for (const font of ['Manrope', 'Oswald']) assert.ok(assets.has(`/fonts/${font}.ttf`));
    await euro(desktop, '#balance', CONFIG.initialBalanceCents, 'bg');
    for (const viewport of desktopViewports) {
      await desktop.setViewportSize(viewport);
      await noOverflow(desktop);
      for (const id of ['reels','spin','features','balance','win','bet']) {
        const box = await desktop.locator(`#${id}`).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${id} fits ${viewport.width} × ${viewport.height}: ${JSON.stringify(box)}`);
      }
      if (viewport.width === 1440 && viewport.height === 720) await shot(desktop, 'desktop-720-controls');
    }
    await desktop.setViewportSize({width:1440,height:1000});
    await noOverflow(desktop); await shot(desktop, 'desktop-bulgarian');
  });

  await check('English/Bulgarian settings and euro formatting persist through a reload', desktop, async () => {
    await desktop.locator('#settings').click();
    await desktop.locator('[data-action="language-en"]').click();
    assert.equal(await desktop.locator('html').getAttribute('lang'), 'en');
    assert.match(await desktop.locator('.sg-dialog-body').innerText(), /The whole interface in your language/);
    await close(desktop);
    assert.match(await desktop.locator('h1').innerText(), /STUDENTSKI\s*GRAD/);
    const painted = await desktop.evaluate(async () => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      const texts: string[] = [];
      CanvasRenderingContext2D.prototype.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
        texts.push(text);
        if (maxWidth === undefined) original.call(this, text, x, y);
        else original.call(this, text, x, y, maxWidth);
      };
      try { await new Promise(resolve => setTimeout(resolve, 200)); return texts; }
      finally { CanvasRenderingContext2D.prototype.fillText = original; }
    });
    for (const key of ['render.scatterpay', 'render.position']) {
      const translated = t(key, {}, 'en');
      assert.notEqual(translated, key, `${key} has an English translation`);
      assert.ok(painted.includes(translated), `the canvas actually paints ${translated}`);
    }
    assert.ok(painted.every(text => !/[А-Яа-я]/.test(text)), `English board labels: ${JSON.stringify(painted)}`);
    await euro(desktop, '#balance', CONFIG.initialBalanceCents);
    await euro(desktop, '#spin-cost', CONFIG.defaultBetCents);
    await desktop.reload({ waitUntil: 'networkidle' }); await desktop.waitForFunction(() => !!window.__slot);
    assert.equal(await desktop.locator('html').getAttribute('lang'), 'en');
    await shot(desktop, 'desktop-english');
  });

  await check(`Paytable lists ${PAYING_SYMBOLS.length} physical-count awards and complete translated rules`, desktop, async () => {
    await desktop.locator('#paytable').click();
    assert.equal(await desktop.locator('.sg-paytable tbody tr').count(), PAYING_SYMBOLS.length);
    assert.equal(await desktop.locator('.sg-paytable tbody td').count(), PAYING_SYMBOLS.length * CONFIG.payThresholds.length);
    assert.deepEqual(await desktop.locator('.sg-paytable thead th').allTextContents(), ['SYMBOL', '8–9', '10–11', '12+']);
    for (let i = 0; i < PAYING_SYMBOLS.length; i++) {
      const values = await desktop.locator('.sg-paytable tbody tr').nth(i).locator('td').allTextContents();
      assert.deepEqual(values.map(value => Number(value.replace('×', '').replaceAll(',', ''))), CONFIG.paytable[PAYING_SYMBOLS[i]].map(value => value / CONFIG.payoutDenominator));
    }
    assert.equal(await desktop.locator('.sg-special-symbols article').count(), 6);
    await shot(desktop, 'desktop-paytable');
    await desktop.locator('[data-action="rules"]').click();
    assert.equal(await desktop.locator('.sg-rule').count(), 9);
    const rules = await desktop.locator('.sg-dialog-body').innerText();
    for (const text of ['Eight or more', 'do not need to touch', '8192', '3 / 4 / 5+', '7 / 8 / 10', 'Position', 'extra', '30,000', 'euro cents']) assert.ok(rules.toLowerCase().includes(text.toLowerCase()), `Rules explain ${text}`);
    await desktop.keyboard.press('Shift+Tab');
    assert.ok(await desktop.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    await close(desktop);
    assert.equal(await desktop.evaluate(() => document.activeElement?.id), 'paytable');
    await desktop.locator('#language').click(); await desktop.locator('#rules').click();
    assert.match(await desktop.locator('.sg-dialog-body').innerText(), /Осем или повече/);
    assert.match(await desktop.locator('.sg-dialog-body').innerText(), /Множител/);
    await close(desktop); await desktop.locator('#language').click();
  });

  const anywhereSeed = naturalSeed('anywhere-win', {kind: 'mode', mode: 'standard'}, p => !p.bonusAwarded && p.wins.some(win => win.count >= 8 && win.cells.some(cell => cell.reel >= 4)));
  await check('Scatter wins include reels five/six and repeated clicks debit one complete round', desktop, async () => {
    await reset(desktop, anywhereSeed);
    await desktop.locator('#spin').click();
    const p = (await snapshot(desktop)).presentation!;
    assert.equal(p.initialGrid.length, 6); assert.ok(p.initialGrid.every(column => column.length === 5));
    assert.ok(p.wins.some(win => win.count >= 8 && win.cells.some(cell => cell.reel >= 4)));
    await desktop.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        document.getElementById('spin')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        document.dispatchEvent(new KeyboardEvent('keydown', {code: 'Space', bubbles: true}));
      }
    });
    assert.equal((await snapshot(desktop)).roundSequence, 1);
    await finish(desktop);
    const settled = await snapshot(desktop); paidRound(settled, 20);
    assert.deepEqual(settled, playCompleteRound(createSession(anywhereSeed), {kind: 'mode', mode: 'standard'}));
    await euro(desktop, '#balance', settled.balanceCents);
    await desktop.locator('#history').click();
    assert.equal(await desktop.locator('.sg-history-table tbody tr').count(), 1);
    await euro(desktop, '.sg-history-table tbody td:nth-child(3)', 20); await close(desktop);
  });

  for (const [mode, price, multiplier] of [['standard',1,1], ['hunt',2,1], ['frames',2.8,2], ['wild',90,64], ['god',3000,1024]] as const) {
    await check(`${mode} charges ${price}× and starts every position at ${multiplier}×`, desktop, async () => {
      const seed = 94411;
      await reset(desktop, seed); await selectMode(desktop, mode);
      await euro(desktop, '#spin-cost', Math.round(20 * price));
      await desktop.locator('#spin').click();
      const p = (await snapshot(desktop)).presentation!;
      assert.equal(p.kind, 'spin', 'all five modes use scatter/cascade mathematics');
      assert.equal(p.roundCostCents, Math.round(20 * price));
      assert.ok(p.initialPositionMultipliers.every(column => column.every(value => value === multiplier)));
      if (mode === 'hunt') assert.ok(p.initialGrid[1].includes('scatter'), 'xBet guarantees an invitation on reel two');
      await finish(desktop);
      const settled = await snapshot(desktop); paidRound(settled, Math.round(20 * price));
      assert.deepEqual(settled, playCompleteRound(setMode(createSession(seed), mode), {kind: 'mode', mode}));
    });
  }

  for (const [tier, price, spins, upgrades] of [['dorm',70,7,1], ['friday',200,8,2], ['december',600,10,3]] as const) {
    await check(`${tier} buy has ${spins} spins, ${upgrades} distinct random upgrades and one ${price}× debit`, desktop, async () => {
      const seed = naturalSeed(`buy-${tier}`, {kind: 'buy', bonus: tier}, p => !p.maxWin);
      await reset(desktop, seed); await buy(desktop, tier);
      const first = await snapshot(desktop), p = first.presentation!;
      assert.equal(p.tier, tier); assert.equal(p.intro, true);
      assert.equal(p.upgrades.length, upgrades); assert.equal(new Set(p.upgrades).size, upgrades);
      assert.equal(p.roundCostCents, 20 * price);
      assert.equal(first.activeRound?.spinsRemaining, spins - 1 + p.shotsAdded);
      assert.ok(p.initialPositionMultipliers.every(column => column.every(value => value === 1)));
      assert.equal(await desktop.locator('.night-stage').getAttribute('data-scene'), tier);
      assert.equal(await desktop.locator('.upgrade-tag.unlocked').count(), upgrades);
      assert.equal(await desktop.locator('.awarded-upgrades > div').count(), upgrades, 'the bonus intro presents each awarded upgrade');
      assert.match(await desktop.locator('.shuttle-arrival img').getAttribute('src') ?? '', /\/art-v2\/party-shuttle\.svg$/);
      await shot(desktop, `bonus-${tier}-intro`);
      await finish(desktop);
      const settled = await snapshot(desktop); paidRound(settled, 20 * price);
      assert.deepEqual(settled, playCompleteRound(createSession(seed), {kind: 'buy', bonus: tier}));
      assert.ok(settled.history[0].spins >= spins || settled.history[0].maxWin);
    });
  }

  await check('Bonus Wild occurrences come from each random grid and are not a fixed allowance', desktop, async () => {
    const counts = new Set<number>();
    for (const wanted of [0, 2]) {
      const seed = naturalSeed(`bonus-wilds-${wanted}`, {kind: 'buy', bonus: 'friday'}, p => p.initialGrid.flat().filter(symbol => symbol === 'wild').length === wanted);
      await reset(desktop, seed); await buy(desktop, 'friday');
      const p = (await snapshot(desktop)).presentation!;
      assert.equal(p.wilds.length, wanted); counts.add(p.wilds.length);
      assert.ok(p.wilds.every(wild => p.initialGrid[wild.reel][wild.row!] === 'wild'));
      await finish(desktop);
    }
    assert.deepEqual([...counts], [0, 2]);
  });

  const scatterSeed = naturalSeed('natural-three-invitations', {kind: 'mode', mode: 'standard'}, p => p.scatters === 3 && p.bonusAwarded === 'dorm');
  await check('Three naturally landed invitations start the seven-spin first-tier bonus', desktop, async () => {
    await reset(desktop, scatterSeed); await desktop.locator('#spin').click();
    const first = await snapshot(desktop);
    assert.equal(first.presentation?.bonusAwarded, 'dorm'); assert.equal(first.presentation?.scatters, 3);
    assert.equal(first.activeRound?.spinsRemaining, 7); assert.equal(first.activeRound?.upgrades.length, 1);
    await finish(desktop); const settled = await snapshot(desktop); paidRound(settled, 20);
    assert.deepEqual(settled, playCompleteRound(createSession(scatterSeed), {kind: 'mode', mode: 'standard'}));
  });

  for (const tier of ['dorm', 'friday', 'december'] as const) {
    await check(`Lucky Draw visibly discloses 50/25/25 odds and naturally selects ${tier}`, desktop, async () => {
      const seed = naturalSeed(`lucky-${tier}`, {kind: 'lucky'}, p => p.tier === tier);
      await reset(desktop, seed); await features(desktop, 'buys');
      assert.deepEqual(await desktop.locator('.sg-lucky-odds b').allTextContents(), ['50%', '25%', '25%']);
      const cost = CONFIG.defaultBetCents * CONFIG.luckyDrawPrice;
      await desktop.locator('[data-action="lucky"]').click(); await euro(desktop, '.sg-debit dd', cost);
      assert.match(await desktop.locator('.sg-confirmation').innerText(), /Dorm 50%, Friday 25%, 8 December 25%/);
      await desktop.locator('[data-action="confirm"]').click();
      assert.equal((await snapshot(desktop)).presentation?.tier, tier);
      await finish(desktop); const settled = await snapshot(desktop); paidRound(settled, cost);
      assert.deepEqual(settled, playCompleteRound(createSession(seed), {kind: 'lucky'}));
    });
  }

  await check('Reload during a purchased bonus preserves its exact RNG, receipt and one debit/payout', desktop, async () => {
    const seed = 723901;
    await reset(desktop, seed); await buy(desktop, 'friday'); await finish(desktop);
    const uninterrupted = await snapshot(desktop);
    await reset(desktop, seed); await buy(desktop, 'friday');
    const before = await snapshot(desktop);
    assert.ok(before.activeRound && before.presentation?.intro);
    const stored = await desktop.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    assert.deepEqual(stored, before, 'every paid outcome is stored before animation');
    await desktop.reload({waitUntil: 'networkidle'}); await desktop.waitForFunction(() => !!window.__slot);
    const recovered = await snapshot(desktop);
    assert.equal(recovered.balanceCents, before.balanceCents); assert.equal(recovered.rngState, before.rngState);
    assert.equal(recovered.presentation?.id, before.presentation?.id);
    await finish(desktop); const resumed = await snapshot(desktop);
    assert.deepEqual(resumed, uninterrupted); paidRound(resumed, 4000);
  });

  const extraSeed = naturalSeed('extra-offer', {kind: 'mode', mode: 'standard'}, (_p, s) => !!s.extraSpinOffer);
  await check('Extra offer discloses its price, retains multipliers and charges once without triggering a bonus', desktop, async () => {
    await reset(desktop, extraSeed); await desktop.locator('#spin').click(); await finish(desktop);
    const before = await snapshot(desktop), offer = before.extraSpinOffer!;
    assert.ok(offer && offer.costCents > 0);
    assert.ok(await desktop.locator('#extra-offer').isVisible());
    await euro(desktop, '#extra-spin', offer.costCents);
    assert.match(await desktop.locator('#extra-description').innerText(), /RETAINED MULTIPLIERS · NO NEW BONUS/);
    await shot(desktop, 'desktop-extra-offer'); await desktop.locator('#extra-spin').click();
    const begun = await snapshot(desktop), p = begun.presentation!;
    assert.equal(begun.roundSequence, 2); assert.equal(p.roundCostCents, offer.costCents);
    assert.deepEqual(p.initialPositionMultipliers, offer.positionMultipliers);
    assert.equal(p.bonusAwarded, null); assert.equal(p.tier, null); assert.equal(begun.activeRound, null);
    assert.equal(begun.balanceCents, before.balanceCents - offer.costCents + p.payoutCents);
    assert.ok(p.chainTotalCents <= 20 * CONFIG.capMultiplier);
    await desktop.locator('#extra-spin').dispatchEvent('click');
    assert.equal((await snapshot(desktop)).roundSequence, 2);
    await finish(desktop); const settled = await snapshot(desktop);
    assert.deepEqual(settled, playCompleteRound(before, {kind: 'extra'}));
    assert.equal(settled.history.length, 2);
    assert.equal(settled.history[0].capOffsetCents, offer.alreadyPaidCents);
  });

  await check('Declining an extra offer leaves balance, RNG and completed accounting untouched', desktop, async () => {
    await reset(desktop, extraSeed); await desktop.locator('#spin').click(); await finish(desktop);
    const before = await snapshot(desktop);
    await desktop.locator('#extra-dismiss').click(); const after = await snapshot(desktop);
    assert.deepEqual(after, {...before, extraSpinOffer: null});
    assert.ok(await desktop.locator('#extra-offer').isHidden());
  });

  const animationSeed = naturalSeed('normal-animation', {kind: 'mode', mode: 'standard'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.cascadeSteps.some(step => step.wins.length && step.refilledGrid) && p.cascadeSteps.some(step => step.modifiers.some(event => event.kind === 'bomb' || event.kind === 'xways')) && p.cascadeSteps.some(step => step.index > 0 && step.wins.length && matchingCount(step.resolvedGrid) !== matchingCount(p.initialGrid)));
  await check('Normal animation shows locked euro awards/current match counts; skipping changes no result', desktop, async () => {
    await reset(desktop, animationSeed); await desktop.evaluate(() => {
      window.__slot.setTurbo(false); window.__animationPhases = [];
      const canvas = document.getElementById('reels')!;
      new MutationObserver(() => { const phase = canvas.dataset.animation; if (phase) window.__animationPhases!.push(phase); }).observe(canvas, {attributes: true, attributeFilter: ['data-animation']});
    });
    await observeFormulaAndCount(desktop);
    await desktop.locator('#spin').click();
    const animated = (await presentation(desktop))!;
    await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.animation === 'cascade');
    await shot(desktop, 'desktop-cascade');
    await desktop.waitForFunction(() => !window.__slot.busy(), undefined, {timeout: 20_000});
    const phases = await desktop.evaluate(() => window.__animationPhases!);
    for (const phase of ['spin', 'win', 'clear', 'cascade', 'idle']) assert.ok(phases.includes(phase), `${phase} appears in ${JSON.stringify(phases)}`);
    assert.ok(phases.includes('bomb') || phases.includes('xways'));
    await assertFormulasAndCount(desktop, animated, 'en');
    assert.deepEqual(await presentation(desktop), animated, 'animation leaves the recorded outcome immutable');
    const normal = await snapshot(desktop);
    await reset(desktop, animationSeed); await desktop.locator('#spin').click(); await finish(desktop);
    assert.deepEqual(await snapshot(desktop), normal);
    const fractionalSeed = naturalSeed('fractional-base-award', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.wins.some(win => win.payMultiplier === .15 && win.positionMultiplier > 1) && p.cascadeSteps.some(step => step.index > 0 && step.wins.length && matchingCount(step.resolvedGrid) !== matchingCount(p.initialGrid)));
    await reset(desktop, fractionalSeed); await desktop.locator('#language').click();
    assert.equal(await desktop.locator('html').getAttribute('lang'), 'bg');
    await desktop.locator('#bet').selectOption('10'); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await observeFormulaAndCount(desktop); await desktop.locator('#spin').click();
    const fractionalView = (await presentation(desktop))!;
    await desktop.waitForFunction(() => window.__animationFormulas?.length);
    await shot(desktop, 'desktop-bulgarian-win-formula');
    await desktop.waitForFunction(() => !window.__slot.busy(), undefined, {timeout:20_000});
    await assertFormulasAndCount(desktop, fractionalView, 'bg');
    assert.equal(fractionalView.lockedBetCents, 10);
    assert.deepEqual(await snapshot(desktop), playCompleteRound(selectBet(createSession(fractionalSeed),10), {kind:'mode',mode:'standard'}));
    await desktop.locator('#language').click();
  });

  await check('Autoplay is bounded and stopping completes only the currently running paid round', desktop, async () => {
    await reset(desktop, 116292); await desktop.locator('#settings').click();
    assert.deepEqual(await desktop.locator('#sg-autoplay-count option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), ['10','25','50','100']);
    await desktop.locator('#sg-autoplay-count').selectOption('10'); await desktop.locator('[data-action="autoplay"]').click();
    await desktop.waitForFunction(() => window.__slot.snapshot().roundSequence === 1);
    await desktop.locator('#autoplay').click(); await finish(desktop); await desktop.waitForTimeout(250);
    paidRound(await snapshot(desktop), 20); assert.equal(await desktop.locator('#autoplay.active').count(), 0);
  });

  await check('Ten autoplay rounds create ten balanced receipts and stop automatically', desktop, async () => {
    await reset(desktop, 511389); await desktop.locator('#settings').click();
    await desktop.locator('#sg-autoplay-count').selectOption('10'); await desktop.locator('[data-action="autoplay"]').click();
    await desktop.evaluate(async () => {
      const deadline = performance.now() + 30_000;
      while (window.__slot.snapshot().roundSequence < 10 || window.__slot.busy()) {
        if (performance.now() > deadline) throw new Error('Autoplay did not terminate');
        window.__slot.skip(); await new Promise(resolve => setTimeout(resolve, 15));
      }
    });
    await desktop.waitForTimeout(250); const ended = await snapshot(desktop);
    assert.equal(ended.roundSequence, 10); assert.equal(ended.history.length, 10);
    const costs = ended.history.reduce((sum, receipt) => sum + receipt.costCents, 0), payouts = ended.history.reduce((sum, receipt) => sum + receipt.payoutCents, 0);
    assert.equal(costs, 200); assert.equal(ended.balanceCents, CONFIG.initialBalanceCents - costs + payouts);
    assert.equal(ended.activeRound, null); assert.equal(ended.presentation, null); assert.equal(await desktop.locator('#autoplay.active').count(), 0);
  });

  await check('Low balance disables unaffordable buys/modes without taking a debit', desktop, async () => {
    await reset(desktop, 527103, 100); await features(desktop, 'boosters');
    for (const mode of ['wild','god']) assert.ok(await desktop.locator(`[data-action="mode-${mode}"]`).isDisabled());
    await desktop.locator('[data-action="tab-buys"]').click();
    for (const tier of ['dorm','friday','december']) assert.ok(await desktop.locator(`[data-action="buy-${tier}"]`).isDisabled());
    assert.ok(await desktop.locator('[data-action="lucky"]').isDisabled());
    await close(desktop); assert.equal((await snapshot(desktop)).balanceCents, 100); assert.equal((await snapshot(desktop)).roundSequence, 0);
  });

  const mobileContext = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await mobileContext.addInitScript(() => localStorage.setItem('studentski-grad-preferences-v1', JSON.stringify({language: 'en', turbo: true, muted: true, volume: .38})));
  const mobile = await mobileContext.newPage(); mobile.setDefaultTimeout(12_000); watch(mobile, 'mobile'); await load(mobile);
  await check('390 × 844 touch layout has no overflow and accessible 44px controls/bonus menus', mobile, async () => {
    await noOverflow(mobile);
    for (const id of ['spin','features','bet-minus','bet-plus','autoplay','turbo']) {
      const box = await mobile.locator(`#${id}`).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${id} requires a 44px touch target: ${JSON.stringify(box)}`);
      assert.ok(box.x >= 0 && box.x + box.width <= 391, `${id} is inside the viewport`);
    }
    await shot(mobile, 'mobile-english');
    await mobile.locator('#features').tap(); await mobile.locator('[data-action="tab-buys"]').tap();
    await noOverflow(mobile); await shot(mobile, 'mobile-bonus-menu');
    await mobile.locator('[data-action="buy-dorm"]').tap(); await euro(mobile, '.sg-debit dd', 1400);
    await shot(mobile, 'mobile-bonus-confirmation'); await mobile.locator('[data-action="back"]').tap();
    assert.equal((await snapshot(mobile)).roundSequence, 0);
    await mobile.locator('[data-action="close"]').tap(); await mobile.locator('#rules').tap();
    assert.equal(await mobile.locator('.sg-rule').count(), 9);
    await mobile.locator('.sg-dialog-body').evaluate(element => {element.scrollTop = element.scrollHeight;});
    assert.ok(await mobile.locator('.sg-small-note').last().isVisible()); await noOverflow(mobile); await mobile.locator('[data-action="close"]').tap();
    await reset(mobile, extraSeed); await mobile.locator('#spin').tap(); await finish(mobile);
    await noOverflow(mobile);
    for (const id of ['extra-spin','extra-dismiss']) {
      const box = await mobile.locator(`#${id}`).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${id} requires a 44px touch target: ${JSON.stringify(box)}`);
      assert.ok(box.x >= 0 && box.x + box.width <= 391, `${id} is inside the mobile viewport`);
    }
    await shot(mobile, 'mobile-extra-offer'); await mobile.locator('#extra-dismiss').tap();
  });
  await check('Mobile touch spin settles the same engine outcome and Bulgarian euro settings work', mobile, async () => {
    await reset(mobile, anywhereSeed); await mobile.locator('#spin').tap(); await finish(mobile);
    const complete = await snapshot(mobile); paidRound(complete, 20);
    assert.deepEqual(complete, playCompleteRound(createSession(anywhereSeed), {kind: 'mode', mode: 'standard'}));
    await euro(mobile, '#balance', complete.balanceCents); await mobile.locator('#settings').tap();
    await mobile.locator('[data-action="language-bg"]').tap(); assert.equal(await mobile.locator('html').getAttribute('lang'), 'bg');
    await mobile.locator('[data-action="close"]').tap(); await euro(mobile, '#balance', complete.balanceCents, 'bg');
    assert.match(await mobile.locator('h1').innerText(), /СТУДЕНТСКИ\s*ГРАД/); await shot(mobile, 'mobile-bulgarian');
  });
  await check('No browser errors, broken local assets or external image downloads occur', desktop, async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(externalImages, []);
  });

  const sourceFiles = ['src/engine/config.ts','src/engine/engine.ts','src/engine/evaluator.ts','src/engine/persistence.ts','src/main.ts','src/render/renderer.ts','src/style.css','scripts/browser-test.ts'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(resolve(repositoryRoot, file))).digest('hex')])));
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), configVersion: CONFIG.version, mathematics: {payingSymbols: PAYING_SYMBOLS, paytable: CONFIG.paytable, payoutDenominator: CONFIG.payoutDenominator, modePrices: CONFIG.prices, buyPrices: CONFIG.buyPrices, luckyDrawPrice: CONFIG.luckyDrawPrice, luckyDrawProbabilities: CONFIG.luckyDrawProbabilities, symbolWeights: CONFIG.symbolWeights, modes: CONFIG.modes, bonuses: CONFIG.bonuses, initialPositionMultipliers: CONFIG.initialPositionMultipliers, payThresholds: CONFIG.payThresholds, capMultiplier: CONFIG.capMultiplier, positionMultiplierLimit: CONFIG.positionMultiplierLimit, extraQuoteDenominator: CONFIG.extraQuoteDenominator}, sourceHashes, baseURL, browser: browserDescription, viewports: [...desktopViewports.map(({width,height}) => `${width}×${height} desktop`),'390×844 touch mobile'], fixtures, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results, runtimeErrors, failedRequests, externalImages, assets: [...assets], screenshots}, null, 2));
  process.stdout.write(`${results.filter(result => result.passed).length}/${results.length} browser checks passed. Results and screenshots: ${output}\n`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await ownedServer?.close(); }
}
