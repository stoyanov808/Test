import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createSession, startRound } from '../src/engine/engine';
import type { Session, BonusTier } from '../src/engine/types';

declare global {
  interface Window {
    __slot: {
      snapshot(): Session;
      busy(): boolean;
      reset(seed: number, balance?: number): void;
      skip(): void;
      setTurbo(turbo: boolean): void;
    };
  }
}

const baseURL = process.env.SLOT_BASE_URL ?? 'http://127.0.0.1:5173';
const output = resolve('test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results: { name: string; passed: boolean; durationMs: number; error?: string }[] = [];
const runtimeErrors: string[] = [];
const failedRequests: string[] = [];
const assets = new Set<string>();
const screenshots: string[] = [];

function watch(page: Page, name: string) {
  page.on('pageerror', error => runtimeErrors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`${name}: ${message.text()}`); });
  page.on('response', response => {
    if (response.url().startsWith(baseURL) && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    if (/\/(art|fonts)\//.test(response.url()) && response.ok()) assets.add(new URL(response.url()).pathname);
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseURL) && !request.failure()?.errorText.includes('ERR_ABORTED')) failedRequests.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
}
async function shot(page: Page, name: string) {
  const file = `${name}.png`;
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
async function finish(page: Page) {
  // Skip visual delays only; the application's production pump still advances and settles every spin.
  await page.evaluate(async () => {
    const deadline = performance.now() + 15_000;
    while (window.__slot.busy() || window.__slot.snapshot().presentation || window.__slot.snapshot().activeRound) {
      if (performance.now() > deadline) throw new Error(`Round did not finish: ${JSON.stringify(window.__slot.snapshot())}`);
      window.__slot.skip();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
}
async function reset(page: Page, seed: number, balance = 1_000_000) {
  await page.keyboard.press('Escape');
  // Stop a queued autoplay series before resetting a fixture.
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
async function buy(page: Page, tier: BonusTier) {
  await features(page, 'buys');
  await page.locator(`[data-action="buy-${tier}"]`).click();
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
  assert.equal(amount(await page.locator(selector).textContent(), language), cents, `${selector} must show the accounted euro amount`);
}
function paidRound(session: Session, cost: number, initialBalance = 1_000_000) {
  assert.equal(session.roundSequence, 1, 'one user action creates one paid round');
  assert.equal(session.history.length, 1, 'a completed round has one receipt');
  assert.equal(session.history[0].costCents, cost);
  assert.equal(session.balanceCents, initialBalance - cost + session.history[0].payoutCents, 'balance = starting balance − one debit + settled payout');
  assert.equal(session.phase, 'idle');
  assert.equal(session.activeRound, null);
  assert.equal(session.presentation, null);
}
async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.page <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
}

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const desktop = await desktopContext.newPage();
desktop.setDefaultTimeout(10_000);
watch(desktop, 'desktop');
await load(desktop);

await check('Desktop loads original artwork, fonts and a nonempty 5 × 4 canvas', desktop, async () => {
  assert.equal(await desktop.locator('html').getAttribute('lang'), 'bg');
  assert.match(await desktop.locator('#reels').getAttribute('aria-label') ?? '', /четири реда/);
  assert.match(await desktop.locator('#ways').innerText(), /1\s*024/);
  const drawing = await desktop.locator('#reels').evaluate(canvas => {
    const image = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height);
    const colors = new Set<string>();
    for (let p = 0; p < image.data.length; p += 400) colors.add(`${image.data[p]}:${image.data[p + 1]}:${image.data[p + 2]}`);
    return { width: image.width, height: image.height, colors: colors.size, fonts: document.fonts.check('16px "Grad Text"') && document.fonts.check('16px "Grad Display"'), loadedFonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family) };
  });
  assert.ok(drawing.width > 300 && drawing.height > 200 && drawing.colors > 40, JSON.stringify(drawing));
  assert.ok(drawing.fonts, 'both locally served fonts loaded');
  assert.equal(drawing.loadedFonts.length, 2, 'both registered font faces finished loading');
  for (const asset of ['/art/symbols.png', '/art/scenes.png', '/fonts/Manrope.ttf', '/fonts/Oswald.ttf']) assert.ok(assets.has(asset), `${asset} was successfully served`);
  const decodedArtwork = await desktop.evaluate(async () => Promise.all(['/art/symbols.png', '/art/scenes.png'].map(async path => {
    const image = new Image();
    image.src = path;
    await image.decode();
    return { path, width: image.naturalWidth, height: image.naturalHeight };
  })));
  assert.ok(decodedArtwork.every(image => image.width >= 512 && image.height >= 512), `Both atlases decode successfully: ${JSON.stringify(decodedArtwork)}`);
  await euro(desktop, '#balance', 1_000_000, 'bg');
  await noOverflow(desktop);
  await shot(desktop, 'desktop-bulgarian');
});

await check('Language setting switches the complete menus and euro amounts and persists on reload', desktop, async () => {
  await desktop.locator('#settings').click();
  await desktop.locator('[data-action="language-en"]').click();
  assert.equal(await desktop.locator('html').getAttribute('lang'), 'en');
  assert.equal(await desktop.locator('#sg-dialog-title').innerText(), 'MAKE IT YOURS');
  assert.match(await desktop.locator('.sg-dialog-body').innerText(), /The whole interface in your language/);
  await close(desktop);
  assert.equal(await desktop.locator('h1').innerText(), 'STUDENTSKI GRAD');
  await euro(desktop, '#balance', 1_000_000);
  await euro(desktop, '#spin-cost', 20);
  await desktop.reload({ waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => !!window.__slot);
  assert.equal(await desktop.locator('html').getAttribute('lang'), 'en');
  await shot(desktop, 'desktop-english');
});

await check('All 11 symbols, three payout lengths, feature rules and keyboard focus are available', desktop, async () => {
  await desktop.locator('#paytable').click();
  assert.equal(await desktop.locator('.sg-pay-symbol').count(), 8);
  assert.equal(await desktop.locator('.sg-special-symbols article').count(), 3);
  assert.equal(await desktop.locator('.sg-pay-values span').count(), 24);
  assert.deepEqual(await desktop.locator('.sg-pay-symbol').first().locator('.sg-pay-values b').allTextContents(), ['0.003×', '0.03×', '1.6×']);
  assert.deepEqual(await desktop.locator('.sg-pay-symbol').nth(4).locator('.sg-pay-values b').allTextContents(), ['0.006×', '0.06×', '3.2×']);
  await shot(desktop, 'desktop-paytable');
  await desktop.locator('[data-action="rules"]').click();
  assert.equal(await desktop.locator('.sg-rule').count(), 8);
  const rules = await desktop.locator('.sg-dialog-body').innerText();
  for (const text of ['weighted ways', 'Persistent sticky frames', 'retriggers', '20,000×', 'integer euro cents', 'recovered after a reload']) assert.ok(rules.includes(text), `Rules describe ${text}`);
  await desktop.keyboard.press('Shift+Tab');
  assert.ok(await desktop.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'modal keeps keyboard focus inside');
  await close(desktop);
  assert.equal(await desktop.evaluate(() => document.activeElement?.id), 'paytable', 'closing restores the initiating control');
});

await check('Standard spin and repeated click/space input debit only one paid round', desktop, async () => {
  await reset(desktop, 1849027);
  await desktop.locator('#spin').click();
  assert.ok(await desktop.evaluate(() => window.__slot.busy()));
  const presented = await snapshot(desktop);
  assert.equal(presented.presentation?.grid.length, 5);
  assert.ok(presented.presentation?.grid.every(column => column.length === 4));
  await desktop.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      document.getElementById('spin')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    }
  });
  assert.equal((await snapshot(desktop)).roundSequence, 1);
  await finish(desktop);
  const settled = await snapshot(desktop);
  paidRound(settled, 20);
  await euro(desktop, '#balance', settled.balanceCents);
  await desktop.locator('#history').click();
  assert.equal(await desktop.locator('.sg-history-table tbody tr').count(), 1);
  await euro(desktop, '.sg-history-table tbody td:nth-child(3)', 20);
  await close(desktop);
});

for (const [mode, multiplier] of [['hunt', 2], ['frames', 6], ['wild', 25]] as const) {
  await check(`${mode} booster confirms its exact price, selects without charging, and executes its modifier`, desktop, async () => {
    await reset(desktop, 1440981);
    await features(desktop, 'boosters');
    await desktop.locator(`[data-action="mode-${mode}"]`).click();
    await euro(desktop, '.sg-debit dd', 20 * multiplier);
    assert.match(await desktop.locator('.sg-confirmation').innerText(), /Selecting does not debit/);
    assert.equal((await snapshot(desktop)).balanceCents, 1_000_000);
    await desktop.locator('[data-action="confirm"]').click();
    assert.equal((await snapshot(desktop)).selectedMode, mode);
    assert.equal((await snapshot(desktop)).balanceCents, 1_000_000);
    await euro(desktop, '#spin-cost', 20 * multiplier);
    await desktop.locator('#spin').click();
    const p = (await snapshot(desktop)).presentation!;
    assert.equal(p.roundCostCents, 20 * multiplier);
    if (mode === 'hunt') assert.ok(p.grid[0].includes('scatter'));
    if (mode === 'frames') assert.ok(p.frames.every(column => column.every(Boolean)));
    if (mode === 'wild') { assert.equal(p.wilds.length, 1); assert.ok(p.grid[p.wilds[0].reel].every(symbol => symbol === 'wild')); }
    await finish(desktop);
    paidRound(await snapshot(desktop), 20 * multiplier);
  });
}

for (const [tier, multiplier, spins, energy, wilds] of [['dorm', 100, 8, 1, 0], ['friday', 300, 10, 3, 1], ['december', 1000, 12, 5, 2]] as const) {
  await check(`${tier} purchase debits its disclosed cost once and plays the intended bonus and scene`, desktop, async () => {
    await reset(desktop, 812791);
    await features(desktop, 'buys');
    await desktop.locator(`[data-action="buy-${tier}"]`).click();
    await euro(desktop, '.sg-debit dd', 20 * multiplier);
    assert.equal((await snapshot(desktop)).roundSequence, 0);
    assert.equal((await snapshot(desktop)).balanceCents, 1_000_000);
    await desktop.locator('[data-action="confirm"]').click();
    const first = await snapshot(desktop);
    assert.equal(first.presentation?.tier, tier);
    assert.equal(first.presentation?.energyUsed, energy);
    assert.equal(first.presentation?.wilds.length, wilds);
    assert.equal(first.presentation?.roundCostCents, 20 * multiplier);
    assert.equal(first.activeRound?.spinsRemaining, spins - 1);
    assert.equal(await desktop.locator('.night-stage').getAttribute('data-scene'), tier);
    if (tier === 'december') assert.ok(first.presentation!.frames.every(column => column.every(Boolean)));
    await shot(desktop, `bonus-${tier}-intro`);
    await finish(desktop);
    paidRound(await snapshot(desktop), 20 * multiplier);
  });
}

await check('Reload during a purchased bonus restores the same outcome without a second debit or payout', desktop, async () => {
  const seed = 723901;
  await reset(desktop, seed);
  await buy(desktop, 'friday');
  await finish(desktop);
  const uninterrupted = await snapshot(desktop);
  await reset(desktop, seed);
  await buy(desktop, 'friday');
  const before = await snapshot(desktop);
  assert.ok(before.activeRound && before.presentation?.intro, 'reload occurs while the first bonus presentation is active');
  const stored = await desktop.evaluate(() => JSON.parse(localStorage.getItem('studentski-grad-session-v1')!));
  assert.equal(stored.balanceCents, before.balanceCents);
  await desktop.reload({ waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => !!window.__slot);
  const recovered = await snapshot(desktop);
  assert.equal(recovered.balanceCents, before.balanceCents, 'already settled outcome is not settled a second time on reload');
  assert.equal(recovered.rngState, before.rngState);
  assert.equal(recovered.presentation?.id, before.presentation?.id);
  assert.equal(recovered.activeRound?.id, before.activeRound?.id);
  await finish(desktop);
  const resumed = await snapshot(desktop);
  assert.deepEqual(resumed, uninterrupted, 'reload produces exactly the same completed accounting, receipts and RNG state');
  paidRound(resumed, 6_000);
});

await check('Autoplay offers bounded counts and stop allows only the already running round to finish', desktop, async () => {
  await reset(desktop, 116292);
  await desktop.locator('#settings').click();
  assert.deepEqual(await desktop.locator('#sg-autoplay-count option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), ['10', '25', '50', '100']);
  await desktop.locator('#sg-autoplay-count').selectOption('10');
  await desktop.locator('[data-action="autoplay"]').click();
  await desktop.waitForFunction(() => window.__slot.snapshot().roundSequence === 1);
  await desktop.locator('#autoplay').click();
  await finish(desktop);
  await desktop.waitForTimeout(650);
  const stopped = await snapshot(desktop);
  paidRound(stopped, 20);
  assert.equal(await desktop.locator('#autoplay').getAttribute('class'), 'icon-button auto-button');
});

await check('A bounded autoplay series finishes exactly ten paid rounds and balances every receipt', desktop, async () => {
  await reset(desktop, 511389);
  await desktop.locator('#settings').click();
  await desktop.locator('#sg-autoplay-count').selectOption('10');
  await desktop.locator('[data-action="autoplay"]').click();
  await desktop.evaluate(async () => {
    const deadline = performance.now() + 20_000;
    while (window.__slot.snapshot().roundSequence < 10 || window.__slot.busy()) {
      if (performance.now() > deadline) throw new Error('Bounded autoplay did not terminate');
      window.__slot.skip();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
  await desktop.waitForTimeout(650);
  const ended = await snapshot(desktop);
  assert.equal(ended.roundSequence, 10);
  assert.equal(ended.history.length, 10);
  const costs = ended.history.reduce((sum, receipt) => sum + receipt.costCents, 0);
  const payouts = ended.history.reduce((sum, receipt) => sum + receipt.payoutCents, 0);
  assert.equal(costs, 200);
  assert.equal(ended.balanceCents, 1_000_000 - costs + payouts);
  assert.equal(ended.activeRound, null);
  assert.equal(ended.presentation, null);
  assert.equal(await desktop.locator('#autoplay.active').count(), 0);
});

// Find reproducible natural outcomes; these fixtures call the production RNG, never alter its results.
const godSeeds: { success: number; failure: number } = { success: 0, failure: 0 };
for (let seed = 1; seed < 100_000 && (!godSeeds.success || !godSeeds.failure); seed++) {
  const view = startRound(createSession(seed), { kind: 'mode', mode: 'god' }).presentation!;
  if (view.vipLocked!.every(Boolean)) godSeeds.success ||= seed;
  if (view.vipLocked!.some(Boolean) && !view.vipLocked!.every(Boolean)) godSeeds.failure ||= seed;
}
assert.ok(godSeeds.success && godSeeds.failure, 'a natural success and partial failure fixture are available');
for (const outcome of ['failure', 'success'] as const) {
  await check(`God Mode ${outcome} uses five positions and three real attempts and settles the disclosed result`, desktop, async () => {
    await reset(desktop, godSeeds[outcome]);
    await features(desktop, 'boosters');
    await desktop.locator('[data-action="mode-god"]').click();
    await euro(desktop, '.sg-debit dd', 20_000);
    assert.match(await desktop.locator('.sg-god-facts').innerText(), /4\.8%/);
    assert.match(await desktop.locator('.sg-zero-note').innerText(), /95\.2%.*zero payout/);
    assert.match(await desktop.locator('.sg-zero-note').innerText(), /Three independent chances at each of five positions/);
    await euro(desktop, '.sg-god-facts > div:nth-child(2) b', 400_000);
    await shot(desktop, `god-${outcome}-confirmation`);
    await desktop.locator('[data-action="confirm"]').click();
    const began = await snapshot(desktop);
    const p = began.presentation!;
    assert.equal(p.kind, 'vip');
    assert.equal(p.vipAttempts!.length, 3);
    assert.ok(p.vipAttempts!.every(row => row.length === 5));
    assert.equal(p.vipLocked!.length, 5);
    for (let reel = 0; reel < 5; reel++) assert.equal(p.vipLocked![reel], p.vipAttempts!.some(row => row[reel]), `VIP position ${reel + 1} follows its real attempts`);
    const payout = outcome === 'success' ? 400_000 : 0;
    assert.equal(p.payoutCents, payout);
    assert.equal(p.vipLocked!.every(Boolean), outcome === 'success');
    assert.equal(began.balanceCents, 1_000_000 - 20_000 + payout);
    if (outcome === 'success') {
      await desktop.evaluate(() => window.__slot.skip());
      await desktop.locator('.round-overlay.maximum:not([hidden])').waitFor();
      await shot(desktop, 'god-success-maximum');
    } else {
      await desktop.waitForTimeout(240);
      await shot(desktop, 'god-failure-attempts');
    }
    await finish(desktop);
    const complete = await snapshot(desktop);
    paidRound(complete, 20_000);
    assert.equal(complete.history[0].payoutCents, payout);
    assert.equal(complete.history[0].spins, 1, 'God has no hidden free spins or extra payouts');
  });
}

await check('Insufficient balance disables expensive buys and God Mode without charging', desktop, async () => {
  await reset(desktop, 527103, 100);
  await features(desktop, 'boosters');
  assert.ok(await desktop.locator('[data-action="mode-god"]').isDisabled());
  assert.ok(await desktop.locator('[data-action="mode-wild"]').isDisabled());
  await desktop.locator('[data-action="tab-buys"]').click();
  for (const tier of ['dorm', 'friday', 'december']) assert.ok(await desktop.locator(`[data-action="buy-${tier}"]`).isDisabled());
  await close(desktop);
  assert.equal((await snapshot(desktop)).balanceCents, 100);
  assert.equal((await snapshot(desktop)).roundSequence, 0);
});

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mobileContext.addInitScript(() => localStorage.setItem('studentski-grad-preferences-v1', JSON.stringify({ language: 'en', turbo: true, muted: true, volume: .38 })));
const mobile = await mobileContext.newPage();
mobile.setDefaultTimeout(10_000);
watch(mobile, 'mobile');
await load(mobile);
await check('390 × 844 mobile layout has no overflow and reachable touch controls', mobile, async () => {
  await noOverflow(mobile);
  for (const id of ['spin', 'features', 'bet-minus', 'bet-plus', 'autoplay', 'turbo']) {
    const box = await mobile.locator(`#${id}`).boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${id} requires a 44px touch target: ${JSON.stringify(box)}`);
    assert.ok(box!.x >= 0 && box!.x + box!.width <= 391, `${id} stays inside the viewport`);
  }
  await shot(mobile, 'mobile-english');
  await mobile.locator('#features').tap();
  await mobile.locator('[data-action="tab-buys"]').tap();
  await noOverflow(mobile);
  await shot(mobile, 'mobile-bonus-menu');
  await mobile.locator('[data-action="buy-dorm"]').tap();
  await euro(mobile, '.sg-debit dd', 2_000);
  await shot(mobile, 'mobile-bonus-confirmation');
  await mobile.locator('[data-action="back"]').tap();
  assert.equal((await snapshot(mobile)).roundSequence, 0, 'back from a buy confirmation does not charge');
  await mobile.locator('[data-action="close"]').tap();
  await mobile.locator('#rules').tap();
  assert.equal(await mobile.locator('.sg-rule').count(), 8);
  await mobile.locator('.sg-dialog-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert.ok(await mobile.locator('.sg-small-note').last().isVisible());
  await noOverflow(mobile);
  await mobile.locator('[data-action="close"]').tap();
});
await check('Mobile touch spin and language setting work with euro accounting', mobile, async () => {
  await reset(mobile, 771299);
  await mobile.locator('#spin').tap();
  await finish(mobile);
  const complete = await snapshot(mobile);
  paidRound(complete, 20);
  await euro(mobile, '#balance', complete.balanceCents);
  await mobile.locator('#settings').tap();
  await mobile.locator('[data-action="language-bg"]').tap();
  assert.equal(await mobile.locator('html').getAttribute('lang'), 'bg');
  await mobile.locator('[data-action="close"]').tap();
  await euro(mobile, '#balance', complete.balanceCents, 'bg');
  assert.equal(await mobile.locator('h1').innerText(), 'СТУДЕНТСКИ ГРАД');
  await shot(mobile, 'mobile-bulgarian');
});
await check('Browser emits no runtime errors or failed local asset requests', desktop, async () => {
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(failedRequests, []);
});

await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ baseURL, browser: 'System Chromium', viewports: ['1440×1000 desktop', '390×844 touch mobile'], godSeeds, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results, runtimeErrors, failedRequests, assets: [...assets], screenshots }, null, 2));
await browser.close();
process.stdout.write(`${results.filter(result => result.passed).length}/${results.length} browser checks passed. Results and screenshots: ${output}\n`);
if (results.some(result => !result.passed)) process.exitCode = 1;
