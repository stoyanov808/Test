import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { CONFIG, createSession, startRound, playCompleteRound, dismissPresentation, advanceRound, setMode, type Session, type SpinPresentation, type RoundChoice, type CellPosition, type ModifierEvent, type Grid } from '../src/engine';

/** Capture settled production outcomes; never substitute a board, award or RNG. */
type Board = {
  grid: Grid; positionMultipliers: number[][]; cascade: number;
  modifier: {kind: string; progress: number; phase?: string; revealedSymbol?: string; source: CellPosition; targets: CellPosition[]; visualTargets: CellPosition[]} | null;
};
type GateSpec =
  | {kind: 'modifier'; modifier: 'xways' | 'infectious'; source: CellPosition; cascade: number; progress: number; phase: 'revealed' | 'applying'}
  | {kind: 'wheel'; tier: string}
  | {kind: 'win'; presentationId: string; cascade: number}
  | {kind: 'overlay'; max: boolean; cents: number}
  | {kind: 'extra'};
interface GalleryWindow {
  __slot: {snapshot(): Session; busy(): boolean; reset(seed: number, balance?: number): void; skip(): void; setTurbo(value: boolean): void; board(): Board};
  __gallery: {arm(spec: GateSpec): void; resume(): void; hit: boolean; paused: boolean};
}
interface Example {
  id: string; title: string; seed: number; choice: RoundChoice; language?: 'bg' | 'en'; gate: GateSpec;
  event?: {presentationId: string; cascade: number; event: ModifierEvent; beforeGrid: Grid; beforeMultipliers: number[][]};
  fastForwardToPresentation?: string; skipToOffer?: boolean;
}

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'docs/screenshots/gallery');
await mkdir(directory, {recursive: true});
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const errors: string[] = [], badRequests: string[] = [], externalImages: string[] = [];
const screenshotRecords: Record<string, unknown>[] = [];
let baseURL = process.env.SLOT_BASE_URL ?? '';
let ownedServer: ViteDevServer | undefined, browser: Browser | undefined;

function pureRound(example: Example) {
  const initial = example.choice.kind === 'mode' ? setMode(createSession(example.seed), example.choice.mode) : createSession(example.seed);
  const presentations: SpinPresentation[] = [];
  let session = startRound(initial, example.choice);
  for (;;) {
    presentations.push(structuredClone(session.presentation!));
    session = dismissPresentation(session);
    if (!session.activeRound) break;
    session = advanceRound(session);
  }
  assert.deepEqual(session, playCompleteRound(initial, example.choice));
  const history = session.history[0];
  assert.equal(session.balanceCents, initial.balanceCents - history.costCents + history.payoutCents);
  assert.ok(history.payoutCents <= CONFIG.capMultiplier * history.betCents);
  return {initial, complete: session, presentations, history};
}
function findEvent(seed: number, kind: 'xways' | 'infectious', factor: number, source: CellPosition, cascade: number) {
  const presentation = startRound(createSession(seed), {kind: 'mode', mode: 'standard'}).presentation!;
  const step = presentation.cascadeSteps[cascade];
  let beforeGrid = structuredClone(step.grid), beforeMultipliers = structuredClone(step.positionMultipliers);
  for (const event of step.modifiers.filter(event => event.kind !== 'bomb')) {
    if (event.kind === kind && event.factor === factor && event.source.reel === source.reel && event.source.row === source.row) return {presentationId: presentation.id, cascade, event: structuredClone(event), beforeGrid, beforeMultipliers};
    if (event.gridAfter) beforeGrid = structuredClone(event.gridAfter);
    if (event.positionMultipliersAfter) beforeMultipliers = structuredClone(event.positionMultipliersAfter);
  }
  throw new Error(`Production fixture no longer contains ${kind} ×${factor} at ${source.reel}:${source.row}`);
}
const normal2 = findEvent(1, 'xways', 2, {reel: 4, row: 0}, 1);
const normal4 = findEvent(1, 'xways', 4, {reel: 1, row: 2}, 0);
const normal8 = findEvent(1, 'xways', 8, {reel: 0, row: 1}, 0);
const upgraded = findEvent(55, 'infectious', 4, {reel: 3, row: 0}, 0);
const normalExample = (id: string, title: string, event: typeof normal2, phase: 'revealed' | 'applying'): Example => ({
  id, title, seed: 1, choice: {kind: 'mode', mode: 'standard'}, event,
  gate: {kind: 'modifier', modifier: 'xways', source: event.event.source, cascade: event.cascade, progress: phase === 'revealed' ? .36 : .67, phase},
});
const examples: Example[] = [
  normalExample('normal-2-reveal', 'Normal xWays: revealed symbol before the local boost', normal2, 'revealed'),
  normalExample('normal-2-boost', 'Normal xWays: one local ×2 beer/foam impact', normal2, 'applying'),
  normalExample('normal-4-boost', 'Normal xWays: ×4 local variation', normal4, 'applying'),
  normalExample('normal-8-boost', 'Normal xWays: ×8 local variation', normal8, 'applying'),
  {id: 'upgraded-reveal', title: 'Upgraded xWays: reveal before beer transmission', seed: 55, choice: {kind: 'mode', mode: 'standard'}, event: upgraded, gate: {kind: 'modifier', modifier: 'infectious', source: upgraded.event.source, cascade: 0, progress: .36, phase: 'revealed'}},
  {id: 'upgraded-spread', title: 'Naturally upgraded xWays: beer spreading to recorded book targets', seed: 55, choice: {kind: 'mode', mode: 'standard'}, event: upgraded, gate: {kind: 'modifier', modifier: 'infectious', source: upgraded.event.source, cascade: 0, progress: .79, phase: 'applying'}},
  ...(['dorm', 'friday', 'december'] as const).map(tier => ({id: `${tier}-wheel`, title: `${tier[0].toUpperCase() + tier.slice(1)} wheel: ${CONFIG.bonuses[tier].upgradesCount} distinct guaranteed upgrade(s)`, seed: 1, choice: {kind: 'buy', bonus: tier} as RoundChoice, gate: {kind: 'wheel', tier} as GateSpec})),
  {id: 'december-growth', title: 'December bonus: persistent ×256 positions and a recorded scatter-win award', seed: 3, choice: {kind: 'buy', bonus: 'december'}, gate: {kind: 'win', presentationId: 'round-1:4', cascade: 0}, fastForwardToPresentation: 'round-1:4'},
  {id: 'day64-large-win', title: 'Day 64: legitimate €138.24 award on a €0.20 base stake', seed: 27, choice: {kind: 'mode', mode: 'wild'}, gate: {kind: 'overlay', max: false, cents: 13824}},
  {id: 'extra-spin-offer', title: 'Optional Extra Spin: €3.09 quote after a €5.12 base-round award', seed: 55, choice: {kind: 'mode', mode: 'standard'}, gate: {kind: 'extra'}, skipToOffer: true},
  {id: 'max-win-bg', title: 'Bulgarian max-win screen: actual 30,000× cap', seed: 3, language: 'bg', choice: {kind: 'mode', mode: 'god'}, gate: {kind: 'overlay', max: true, cents: 600000}},
  {id: 'max-win-en', title: 'English max-win screen: actual 30,000× cap', seed: 3, language: 'en', choice: {kind: 'mode', mode: 'god'}, gate: {kind: 'overlay', max: true, cents: 600000}},
];

/** Hold actual app frames for a screenshot; no engine state or DOM is rewritten. */
async function installCaptureGate(page: Page) {
  const setup = () => {
    const w = window as unknown as GalleryWindow;
    const request = window.requestAnimationFrame.bind(window);
    let spec: GateSpec | null = null, freezeAfter = -1, countedAmountObserved = false;
    const waiting: FrameRequestCallback[] = [];
    function matches() {
      if (!spec || !w.__slot) return false;
      const board = w.__slot.board(), session = w.__slot.snapshot();
      if (spec.kind === 'modifier') {
        const event = board.modifier;
        return !!event && event.kind === spec.modifier && event.source.reel === spec.source.reel && event.source.row === spec.source.row && board.cascade === spec.cascade && event.phase === spec.phase && event.progress >= spec.progress;
      }
      if (spec.kind === 'wheel') {
        const wheel = document.getElementById('bonus-wheel');
        return wheel?.dataset.tier === spec.tier && wheel.dataset.phase === 'ready';
      }
      if (spec.kind === 'win') return session.presentation?.id === spec.presentationId && board.cascade === spec.cascade && document.getElementById('reels')?.dataset.animation === 'win';
      if (spec.kind === 'extra') return !!session.extraSpinOffer && !document.getElementById('extra-offer')?.hidden && document.body.classList.contains('extra-modal-open');
      const overlay = document.getElementById('round-overlay');
      if (!overlay || overlay.hidden || overlay.classList.contains('maximum') !== spec.max) return false;
      const text = overlay.querySelector('.overlay-amount')?.textContent ?? '';
      let value = text.replace(/[^\d,.-]/g, '');
      value = document.documentElement.lang === 'bg' ? value.replace(',', '.') : value.replaceAll(',', '');
      const cents = Math.round(Number(value) * 100);
      // The overlay inserts its final amount before starting its real count-up.
      // Wait until that count has actually begun and then reached the receipt.
      if (cents < spec.cents) countedAmountObserved = true;
      return countedAmountObserved && cents === spec.cents;
    }
    w.__gallery = {
      hit: false, paused: false,
      arm(next) {spec = next; freezeAfter = -1; countedAmountObserved = false; this.hit = false; this.paused = false;},
      resume() {spec = null; freezeAfter = -1; this.hit = false; this.paused = false; for (const callback of waiting.splice(0)) request(callback);},
    };
    window.requestAnimationFrame = callback => request(time => {
      if (freezeAfter >= 0 && time > freezeAfter) {w.__gallery.paused = true; waiting.push(callback); return;}
      callback(time);
      if (spec && !w.__gallery.hit && matches()) {
        w.__gallery.hit = true;
        // Allow the renderer to paint the revealed/boosted snapshot in the next
        // two actual frames before holding subsequent animation callbacks.
        freezeAfter = time + 34;
      }
    });
  };
  // tsx keeps names on nested functions with a small __name helper. Keep that
  // helper inside this capture-only closure when serializing it into Chromium.
  await page.addInitScript({content: `(() => {const __name = value => value; (${setup.toString()})();})()`});
}
async function complete(page: Page) {
  await page.evaluate(async () => {
    const w = window as unknown as GalleryWindow;
    w.__gallery.resume();
    const deadline = performance.now() + 60000;
    while (w.__slot.busy() || w.__slot.snapshot().presentation || w.__slot.snapshot().activeRound) {
      if (performance.now() > deadline) throw new Error('Gallery round did not finish');
      w.__slot.skip(); await new Promise(resolve => setTimeout(resolve, 15));
    }
  });
}
async function language(page: Page, value: 'bg' | 'en') {
  if (await page.locator('html').getAttribute('lang') === value) return;
  await page.locator('#settings').click(); await page.locator(`[data-action="language-${value}"]`).click(); await page.keyboard.press('Escape');
}
async function start(page: Page, example: Example) {
  if (example.choice.kind === 'buy') {
    await page.locator('#features').click(); await page.locator('[data-action="tab-buys"]').click();
    await page.locator(`[data-action="buy-${example.choice.bonus}"]`).click(); await page.locator('[data-action="confirm"]').click();
  } else if (example.choice.kind === 'mode') {
    if (example.choice.mode !== 'standard') {
      await page.locator('#features').click(); await page.locator('[data-action="tab-boosters"]').click();
      await page.locator(`[data-action="mode-${example.choice.mode}"]`).click(); await page.locator('[data-action="confirm"]').click();
    }
    await page.locator('#spin').click();
  } else throw new Error('Gallery fixtures use ordinary modes or bonus buys');
}
async function sourceHashes() {
  const files = ['index.html', 'package.json', 'scripts/capture-gallery.ts'];
  async function walk(relative: string) {
    for (const entry of await readdir(resolve(root, relative), {withFileTypes: true})) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (/\.(ts|css|svg|png|json|md)$/.test(entry.name)) files.push(file);
    }
  }
  await walk('src'); await walk('public/art-v2'); await walk('public/art-v3');
  const hashes: Record<string, string> = {};
  for (const file of files.sort()) hashes[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
  return hashes;
}
try {
  if (!baseURL) {
    ownedServer = await createServer({root, server: {host: '127.0.0.1', port: 0, strictPort: false}});
    await ownedServer.listen(); baseURL = ownedServer.resolvedUrls?.local[0] ?? ''; assert.ok(baseURL);
  }
  const systemChromium = process.platform === 'linux' && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || systemChromium, headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  const page = await context.newPage(); page.setDefaultTimeout(15000); await installCaptureGate(page);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.url().startsWith(baseURL) && response.status() >= 400) badRequests.push(`${response.status()} ${response.url()}`);});
  page.on('request', request => {if (request.resourceType() === 'image' && !request.url().startsWith(baseURL) && !request.url().startsWith('data:')) externalImages.push(request.url());});
  await page.goto(baseURL, {waitUntil: 'networkidle'}); await page.waitForFunction(() => !!(window as unknown as GalleryWindow).__slot); await page.evaluate(() => document.fonts.ready);
  for (const example of examples) {
    const pure = pureRound(example);
    await complete(page);
    if (await page.locator('#extra-offer:not([hidden]) #extra-dismiss').count()) await page.locator('#extra-dismiss').click();
    await language(page, example.language ?? 'en');
    await page.evaluate(seed => {const w = window as unknown as GalleryWindow; w.__slot.reset(seed); w.__slot.setTurbo(false);}, example.seed);
    await page.evaluate(spec => (window as unknown as GalleryWindow).__gallery.arm(spec), example.gate);
    await start(page, example);
    if (example.fastForwardToPresentation || example.skipToOffer) {
      await page.evaluate(async ({id, offer}) => {
        const w = window as unknown as GalleryWindow, deadline = performance.now() + 60000;
        while (offer ? !w.__slot.snapshot().extraSpinOffer || w.__slot.busy() : w.__slot.snapshot().presentation?.id !== id) {
          if (performance.now() > deadline) throw new Error('Gallery target presentation did not arrive');
          w.__slot.skip(); await new Promise(resolve => setTimeout(resolve, 15));
        }
      }, {id: example.fastForwardToPresentation, offer: example.skipToOffer});
    }
    // Observe with timers: default RAF polling would itself be paused by the
    // frame hold, potentially missing a gate that already reached its target.
    await page.waitForFunction(() => (window as unknown as GalleryWindow).__gallery.hit, undefined, {timeout: 90000, polling: 50});
    await page.waitForTimeout(85);
    const captured = await page.evaluate(() => {
      const w = window as unknown as GalleryWindow;
      return {session: w.__slot.snapshot(), board: w.__slot.board(), language: document.documentElement.lang, animation: document.getElementById('reels')?.dataset.animation, overlay: document.getElementById('round-overlay')?.hidden ? null : document.getElementById('round-overlay')?.innerText, overlayAmount: document.querySelector('#round-overlay .overlay-amount')?.textContent ?? null, celebrationArtwork: [...document.querySelectorAll('.night-celebration :is(img,svg)')].map(element => ({opacity: Number(getComputedStyle(element).opacity), scale: getComputedStyle(element).scale})), wheel: document.getElementById('bonus-wheel') ? {tier: document.getElementById('bonus-wheel')!.dataset.tier, phase: document.getElementById('bonus-wheel')!.dataset.phase, upgrades: document.getElementById('bonus-wheel')!.dataset.upgrades, pointers: document.getElementById('bonus-wheel')!.dataset.pointers} : null};
    });
    if (example.event) {
      const {event, beforeMultipliers} = example.event;
      assert.equal(captured.board.grid[event.source.reel][event.source.row], event.symbol, 'real source artwork has revealed its settled paying type');
      if (example.gate.kind === 'modifier' && example.gate.phase === 'revealed') assert.deepEqual(captured.board.positionMultipliers, beforeMultipliers, 'reveal screenshot precedes every multiplier application');
      else if (event.kind === 'xways') assert.deepEqual(captured.board.positionMultipliers, event.positionMultipliersAfter, 'normal screenshot has the exact single-source settled boost');
      assert.deepEqual(captured.board.modifier?.visualTargets, event.kind === 'infectious' ? event.targets : [], 'only the recorded upgraded targets receive outbound beer');
    }
    if (example.gate.kind === 'overlay' && example.gate.max) {
      assert.equal(pure.history.maxWin, true); assert.equal(pure.history.payoutCents, pure.history.betCents * CONFIG.capMultiplier);
      assert.equal(captured.session.presentation?.maxWin, true); assert.equal(captured.session.presentation?.chainTotalCents, pure.history.payoutCents);
    }
    if (example.gate.kind === 'overlay') {
      let amount = (captured.overlayAmount ?? '').replace(/[^\d,.-]/g, '');
      amount = captured.language === 'bg' ? amount.replace(',', '.') : amount.replaceAll(',', '');
      assert.equal(Math.round(Number(amount) * 100), example.gate.cents, 'the visible count-up has reached the exact actual settled euro amount before the screenshot');
      assert.equal(example.gate.cents, pure.history.payoutCents);
      assert.equal(captured.celebrationArtwork.length, 3);
      assert.ok(captured.celebrationArtwork.every(art => art.opacity === 1 && (art.scale === '1' || art.scale === 'none')), 'all actual celebration portraits and toast finish their CSS entrance');
    }
    const png = `${example.id}.png`;
    await page.screenshot({path: resolve(directory, png), fullPage: true, animations: 'allow'});
    const pngHash = createHash('sha256').update(await readFile(resolve(directory, png))).digest('hex');
    await complete(page);
    const completed = await page.evaluate(() => (window as unknown as GalleryWindow).__slot.snapshot());
    assert.deepEqual(completed, pure.complete, 'every captured replay completes to the unmodified pure production-engine receipt');
    screenshotRecords.push({id: example.id, title: example.title, file: png, sha256: pngHash, seed: example.seed, choice: example.choice, language: captured.language, betCents: pure.history.betCents, costCents: pure.history.costCents, payoutCents: pure.history.payoutCents, payoutBaseBetMultiple: pure.history.payoutCents / pure.history.betCents, maxWin: pure.history.maxWin, capCents: pure.history.betCents * CONFIG.capMultiplier, spins: pure.history.spins, bonusTier: pure.history.bonusTier, bonusUpgrades: pure.history.bonusUpgrades, shotsAwarded: pure.history.shotsAwarded, engineReceiptVerified: true, engineReceipt: pure.history, engineInitialBalanceCents: pure.initial.balanceCents, engineFinalBalanceCents: pure.complete.balanceCents, engineFinalRngState: pure.complete.rngState, capture: {presentationId: captured.session.presentation?.id ?? null, animation: captured.animation, cascade: captured.board.cascade, modifier: captured.board.modifier, highestPositionMultiplier: Math.max(...captured.board.positionMultipliers.flat()), wheel: captured.wheel, overlay: captured.overlay, overlayAmount: example.gate.kind === 'overlay' ? captured.overlayAmount : null, celebrationArtwork: example.gate.kind === 'overlay' ? captured.celebrationArtwork : [], extraSpinOffer: captured.session.extraSpinOffer ?? null}, ...(example.event ? {recordedModifier: example.event.event, priorPositionMultipliers: example.event.beforeMultipliers} : {}), ...(example.fastForwardToPresentation || example.skipToOffer ? {intermediateVisualDelaysSkipped: true} : {})});
    process.stdout.write(`CAPTURE ${png} — seed ${example.seed}; debit ${pure.history.costCents}c; award ${pure.history.payoutCents}c; exact engine receipt verified\n`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(badRequests, []); assert.deepEqual(externalImages, []);
  const receipt = {presentationVersion: packageJson.version, configVersion: CONFIG.version, schemaVersion: CONFIG.schemaVersion, capturedAt: new Date().toISOString(), viewport: {width:1440,height:1000,deviceScaleFactor:1}, method: 'Actual application, real UI purchases and production seeded engine; read-only animation-frame holds for screenshots. No boards, payouts, cap flags or overlays are injected. Selected seeds demonstrate possibilities, not frequency or RTP.', capBaseBetMultiple: CONFIG.capMultiplier, accountingVerified: true, runtimeErrors: errors, failedLocalRequests: badRequests, externalImageRequests: externalImages, assetProvenance: [{path:'public/art-v3/README.md', description:'Original OpenAI-generated painted raster symbols and Studentski Grad scenes; no publisher sprites or downloaded photographs.'}, {path:'public/art-v2/README.md', description:'Original authored SVG feature signs and vectors.'}], sourceHashes: await sourceHashes(), screenshots: screenshotRecords};
  await writeFile(resolve(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await browser?.close(); await ownedServer?.close();
}
