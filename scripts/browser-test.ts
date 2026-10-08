import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { CONFIG, PAYING_SYMBOLS, STORAGE_KEY, createSession, startRound, playCompleteRound, advanceRound, dismissPresentation, selectBet, setMode, type BonusTier, type BonusUpgrade, type Grid, type Mode, type RoundChoice, type Session, type SpinPresentation } from '../src/engine';
import { t } from '../src/i18n';

interface MotionCell { reel: number; row: number; symbol: string; startY: number; y: number; targetY: number; progress: number; rotation: number; sourceRow?: number }
interface MotionView { kind: 'landing' | 'cascade'; elapsedMs: number; durationMs: number; previousAlpha?: number; cells: MotionCell[] }
interface MotionFrame extends MotionView { cascade: number; paints: {symbol: string; x: number; y: number; rotation: number}[] }
interface AtlasCell { x: number; y: number; width: number; height: number }
interface AtlasManifest { image: string; width: number; height: number; cells: Record<string, AtlasCell>; scenes?: AtlasManifest }

declare global {
  interface Window {
    __slot: {
      snapshot(): Session;
      busy(): boolean;
      reset(seed: number, balance?: number): void;
      skip(): void;
      setTurbo(turbo: boolean): void;
      presentation(): SpinPresentation | null;
      board(): {grid: Grid; positionMultipliers: number[][]; cascade: number; motion?: MotionView | null; modifier?: {kind: string; progress: number; phase?: 'opening'|'revealed'|'applying'; revealedSymbol?: string; source: {reel:number;row:number}; targets: {reel:number;row:number}[]; visualTargets: {reel:number;row:number}[]} | null};
      bonusPresentation(): {phase: string; tier: BonusTier; triggerScatters: number; awardedUpgrades: BonusUpgrade[]; startedAt: number; wheelStartedAt?: number; finishedAt?: number} | null;
    };
    __animationPhases?: string[];
    __animationFormulas?: string[];
    __boardCounts?: {actual: string; expected: string; phase: string}[];
    __restoreCanvasSpy?: () => void;
    __phaseTimings?: {phase: string; time: number}[];
    __stopPhaseObserver?: () => void;
    __bonusTrace?: {kind: 'trigger' | 'wheel'; phase: string; tier: string; time: number; spinning?: string}[];
    __stopBonusObserver?: () => void;
    __motionTrace?: MotionFrame[];
    __paintedArt?: string[];
    __paintedArtURLs?: string[];
    __restoreImageSpy?: () => void;
    __atlasCells?: Record<string, AtlasCell>;
    __beerTrace?: {kind: string; x:number; y:number; progress:number; phase?:string; source:string; radius?:number; alpha:number; symbol?:string; time:number; frame:number; boardPositionMultipliers?:number[][]; boardGrid?:Grid; energy?:string}[];
    __restoreBeerSpy?: () => void;
  }
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const atlasManifest: AtlasManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'public/art-v3/manifest.json'), 'utf8'));
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
const timingEvidence: Record<string, unknown> = {};
const desktopViewports = [{width:1280,height:720},{width:1440,height:720},{width:1440,height:800},{width:1440,height:1000},{width:1920,height:1080}];

function watch(page: Page, name: string) {
  page.on('pageerror', error => runtimeErrors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`${name}: ${message.text()}`); });
  page.on('request', request => {
    if (request.resourceType() === 'image' && !request.url().startsWith(baseURL) && !request.url().startsWith('data:')) externalImages.push(request.url());
  });
  page.on('response', response => {
    if (response.url().startsWith(baseURL) && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    if (/\/(art-v2|art-v3|fonts)\//.test(response.url()) && response.ok()) assets.add(new URL(response.url()).pathname);
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseURL) && !request.failure()?.errorText.includes('ERR_ABORTED')) failedRequests.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
}
async function shot(page: Page, name: string) {
  const file = `v${CONFIG.schemaVersion}-${name}.png`;
  // Capture the real presentation. Disabling animations can fast-forward a CSS
  // wheel and fire its completion event, defeating both timing and staging checks.
  await page.screenshot({ path: resolve(output, file), fullPage: true, animations: 'allow' });
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
  await page.addInitScript(cells => {window.__atlasCells = cells;}, atlasManifest.cells);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slot);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(cells => {window.__atlasCells = cells;}, atlasManifest.cells);
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
async function declineOffer(page: Page) {
  if ((await snapshot(page)).extraSpinOffer) {
    await page.locator('#extra-dismiss').click();
    await page.waitForFunction(() => !window.__slot.snapshot().extraSpinOffer);
  }
}
async function reset(page: Page, seed: number, balance: number = CONFIG.initialBalanceCents) {
  await page.keyboard.press('Escape');
  if (await page.locator('#autoplay.active').count()) await page.locator('#autoplay').click();
  await finish(page);
  await declineOffer(page);
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
async function euro(page: Page, selector: string, cents: number, language?: 'bg' | 'en') {
  const actualLanguage = language ?? (await page.locator('html').getAttribute('lang') === 'bg' ? 'bg' : 'en');
  assert.equal(amount(await page.locator(selector).textContent(), actualLanguage), cents, `${selector} shows the accounted euro amount`);
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
function uninterruptedAutoplaySeed(rounds: number) {
  for (let seed = 1; seed <= 5_000; seed++) {
    let current = createSession(seed), uninterrupted = true;
    for (let round = 0; round < rounds; round++) {
      current = playCompleteRound(current, {kind: 'mode', mode: 'standard'});
      if (current.extraSpinOffer || current.history[0].spins !== 1) { uninterrupted = false; break; }
    }
    if (uninterrupted) { fixtures[`autoplay-${rounds}-without-offer`] = seed; return seed; }
  }
  throw new Error(`No natural ${rounds}-round autoplay fixture without a required offer decision`);
}
async function observeVisualPhases(page: Page) {
  await page.evaluate(() => {
    window.__stopPhaseObserver?.();
    window.__phaseTimings = [];
    const canvas = document.getElementById('reels')!;
    const observer = new MutationObserver(() => {
      const phase = canvas.dataset.animation;
      if (phase && window.__phaseTimings!.at(-1)?.phase !== phase) window.__phaseTimings!.push({phase, time: performance.now()});
    });
    observer.observe(canvas, {attributes: true, attributeFilter: ['data-animation']});
    window.__stopPhaseObserver = () => observer.disconnect();
  });
}
async function phaseDurations(page: Page) {
  const trace = await page.evaluate(() => window.__phaseTimings ?? []);
  return trace.slice(0, -1).map((event, index) => ({phase: event.phase, duration: trace[index + 1].time - event.time}));
}
async function observeArtworkAndDrops(page: Page) {
  await page.evaluate(() => {
    window.__restoreImageSpy?.(); window.__motionTrace = []; window.__paintedArt = []; window.__paintedArtURLs = [];
    const original = CanvasRenderingContext2D.prototype.drawImage;
    window.__restoreImageSpy = () => { CanvasRenderingContext2D.prototype.drawImage = original; delete window.__restoreImageSpy; };
    CanvasRenderingContext2D.prototype.drawImage = function(image: CanvasImageSource, ...args: number[]) {
      if (this.canvas.id === 'reels' && image instanceof HTMLImageElement && /\/art-v[23]\//.test(image.src)) {
        if (!window.__paintedArtURLs!.includes(image.src)) window.__paintedArtURLs!.push(image.src);
        const symbol = /\/art-v3\/symbol-atlas\.png/.test(image.src) ? Object.entries(window.__atlasCells ?? {}).find(([, cell]) => args.length === 8 && Math.abs(args[0] - cell.x) < .01 && Math.abs(args[1] - cell.y) < .01 && Math.abs(args[2] - cell.width) < .01 && Math.abs(args[3] - cell.height) < .01)?.[0] ?? 'unknown-atlas-crop' : new URL(image.src).pathname.split('/').at(-1)!.replace(/\.(svg|png)$/, '');
        const matrix = this.getTransform();
        const paintedX = matrix.e / (this.canvas.width / 1040), paintedY = matrix.f / (this.canvas.height / 730);
        if (paintedX >= 34 && paintedX <= 1006 && paintedY >= 48 && paintedY <= 698 && !window.__paintedArt!.includes(symbol)) window.__paintedArt!.push(symbol);
        const board = window.__slot.board(), motion = board.motion;
        if (motion) {
          let frame = window.__motionTrace!.at(-1);
          if (!frame || frame.kind !== motion.kind || frame.elapsedMs !== motion.elapsedMs || frame.cascade !== board.cascade) {
            frame = {...motion, cells: motion.cells.map(cell => ({...cell})), cascade: board.cascade, paints: []};
            window.__motionTrace!.push(frame);
          }
          // Every paying-symbol atlas crop and feature SVG shares the translated origin.
          // Read the actual canvas transform to independently verify the motion diagnostics.
          frame.paints.push({symbol, x: paintedX, y: paintedY, rotation: Math.atan2(matrix.b / (this.canvas.height / 730), matrix.a / (this.canvas.width / 1040))});
        }
      }
      (original as (...parameters: unknown[]) => void).apply(this, [image, ...args]);
    };
  });
}
async function assertDrops(page: Page, view: SpinPresentation, label: string) {
  const trace = await page.evaluate(() => window.__motionTrace ?? []);
  const renderedURLs = await page.evaluate(() => window.__paintedArtURLs ?? []);
  assert.ok(renderedURLs.length > 0 && renderedURLs.every(url => new URL(url).searchParams.get('v') === '5.4'), 'the actual canvas loads the revised artwork through versioned asset URLs');
  const landing = trace.filter(frame => frame.kind === 'landing');
  assert.ok(landing.length >= (label === "turbo" ? 7 : 15), `real ${label} landing frames are observed`);
  assert.ok(landing[0].durationMs <= (label === 'turbo' ? 850 : 1500), 'configured fall completes faster than the prior version');
  const boardTop = 48, cellWidth = 162;
  const visual = (symbol: string) => symbol === 'infectious' ? 'infectious-upgraded' : symbol;
  for (const frame of trace) {
    assert.equal(frame.cells.length, 30, 'each committed destination has exactly one moving symbol');
    for (const cell of frame.cells) {
      assert.ok(Number.isFinite(cell.y) && cell.progress >= 0 && cell.progress <= 1);
      assert.ok(Math.abs(cell.rotation) <= .056, 'fall wobble stays subtle');
      if(cell.progress === 1)assert.ok(Math.abs(cell.rotation)<.00001,'settled symbols are upright');
      assert.ok(cell.startY <= cell.y + .001 && cell.y <= cell.targetY + .001, `the symbol only falls toward its destination: ${JSON.stringify(cell)}`);
      const expected = frame.kind === 'landing' ? view.initialGrid : view.cascadeSteps[frame.cascade].refilledGrid;
      assert.equal(cell.symbol, expected?.[cell.reel]?.[cell.row], 'the painted identity is the committed destination symbol throughout its fall');
      assert.ok(frame.paints.some(paint => paint.symbol === visual(cell.symbol) && Math.abs(paint.x - (34 + (cell.reel + .5) * cellWidth)) < .01 && Math.abs(paint.y - cell.y) < .01 && Math.abs(paint.rotation - cell.rotation)<.001), `the actual canvas paints this cell at the diagnosed position: ${JSON.stringify(cell)}`);
      if (frame.kind === 'landing' || (cell.sourceRow ?? -1) < 0) assert.ok(cell.startY < boardTop, 'new symbols enter from above the board');
      else {
        const step = view.cascadeSteps[frame.cascade];
        assert.ok(!step.removed.some(removed => removed.reel === cell.reel && removed.row === cell.sourceRow));
        assert.equal(cell.symbol, step.resolvedGrid[cell.reel][cell.sourceRow!], 'a surviving symbol keeps its real pre-collapse identity');
        assert.ok(cell.sourceRow! <= cell.row, 'surviving symbols only move downward');
      }
    }
  }
  const groups = new Map<string, MotionFrame[]>();
  for (const frame of trace) {
    const key = `${frame.kind}:${frame.cascade}`;
    const frames = groups.get(key) ?? []; frames.push(frame); groups.set(key, frames);
  }
  for (const frames of groups.values()) for (let index = 1; index < frames.length; index++) {
    for (let cell = 0; cell < 30; cell++) {
      assert.equal(frames[index].cells[cell].symbol, frames[index - 1].cells[cell].symbol, 'no reel strip or symbol cycle appears during a drop');
      assert.ok(frames[index].cells[cell].y + .001 >= frames[index - 1].cells[cell].y, 'motion never wraps, teleports or falls from below');
    }
  }
  assert.ok(trace.some(frame=>frame.cells.some(cell=>Math.abs(cell.rotation)>.01)),'actual falling symbols have damped angular movement');
  const cascading = trace.filter(frame => frame.kind === 'cascade');
  assert.ok(cascading.length >= (label === "turbo" ? 4 : 8), 'the same top-down motion is observed during a real refill');
  timingEvidence[`${label}-top-down-drops`] = {frames: trace.length, landingFrames: landing.length, cascadeFrames: cascading.length, durationMs: landing[0].durationMs, samples: [landing[0], landing[Math.floor(landing.length / 2)], landing.at(-1), cascading[0], cascading.at(-1)]};
  await page.evaluate(() => window.__restoreImageSpy?.());
}
async function observeBeerEffects(page: Page) {
  await page.evaluate(() => {
    window.__restoreBeerSpy?.(); window.__beerTrace = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    const arc = CanvasRenderingContext2D.prototype.arc;
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    const spy = {frame: 0, record(context: CanvasRenderingContext2D, kind: string, radius?: number, symbol?: string) {
      const modifier = window.__slot.board().modifier;
      if (context.canvas.id !== 'reels' || !modifier || !['xways', 'infectious'].includes(modifier.kind)) return;
      const matrix = context.getTransform();
      const board = kind === 'grid-symbol' ? window.__slot.board() : undefined;
      window.__beerTrace!.push({kind, x: matrix.e / (context.canvas.width / 1040), y: matrix.f / (context.canvas.height / 730), progress: modifier.progress, phase: modifier.phase, source: `${modifier.source.reel}:${modifier.source.row}`, alpha: context.globalAlpha, radius, symbol, time: performance.now(), frame: spy.frame, boardPositionMultipliers: board?.positionMultipliers, boardGrid: board?.grid, energy: board ? document.getElementById('energy')?.textContent ?? '' : undefined});
    }};
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (text === 'SG') spy.record(this, 'bottle');
      if (/^×\d+$/.test(text)) spy.record(this, 'factor-label', undefined, text);
      return (fillText as (...args: unknown[]) => void).apply(this, [text, ...args]);
    };
    CanvasRenderingContext2D.prototype.arc = function(...args) {
      if (this.fillStyle === '#fff0cb') spy.record(this, 'foam', args[2]);
      if (this.fillStyle === '#d79a36') spy.record(this, 'spill', args[2]);
      return arc.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.ellipse = function(...args) {
      if (this.fillStyle === '#d79a36') spy.record(this, 'spill', args[2]);
      return ellipse.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function(image: CanvasImageSource, ...args: number[]) {
      const modifier = window.__slot.board().modifier;
      if (modifier && ['xways', 'infectious'].includes(modifier.kind) && image instanceof HTMLImageElement && /\/art-v[23]\//.test(image.src)) {
        const symbol = /\/art-v3\/symbol-atlas\.png/.test(image.src) ? Object.entries(window.__atlasCells ?? {}).find(([, cell]) => args.length === 8 && Math.abs(args[0] - cell.x) < .01 && Math.abs(args[1] - cell.y) < .01 && Math.abs(args[2] - cell.width) < .01 && Math.abs(args[3] - cell.height) < .01)?.[0] ?? 'unknown-atlas-crop' : new URL(image.src).pathname.split('/').at(-1)!.replace(/\.(svg|png)$/, '');
        const matrix = this.getTransform(), x = matrix.e / (this.canvas.width / 1040), y = matrix.f / (this.canvas.height / 730);
        const isGridCenter = Array.from({length: 6}, (_, reel) => 34 + (reel + .5) * 162).some(cx => Math.abs(cx - x) < .01) && Array.from({length: 5}, (_, row) => 48 + (row + .5) * 130).some(cy => Math.abs(cy - y) < .01);
        if (isGridCenter) {
          if (Math.abs(x - (34 + (modifier.source.reel + .5) * 162)) < .01 && Math.abs(y - (48 + (modifier.source.row + .5) * 130)) < .01) spy.frame++;
          spy.record(this, 'grid-symbol', undefined, symbol);
        }
        else if (x >= 34 && x <= 1006 && y >= 48 && y <= 698) spy.record(this, 'moving-symbol', undefined, symbol);
      }
      return (drawImage as (...args: unknown[]) => void).apply(this, [image, ...args]);
    };
    window.__restoreBeerSpy = () => { CanvasRenderingContext2D.prototype.fillText = fillText; CanvasRenderingContext2D.prototype.arc = arc; CanvasRenderingContext2D.prototype.ellipse = ellipse; CanvasRenderingContext2D.prototype.drawImage = drawImage; delete window.__restoreBeerSpy; };
  });
}
async function assertBonusCounter(page: Page, remaining: number, language: 'en' | 'bg', tier?: BonusTier) {
  const counter = page.locator('#bonus-spin-counter');
  await counter.waitFor({state: 'visible'});
  assert.equal(await page.locator('#bonus-spins-count').textContent(), String(remaining), 'the prominent counter shows visually remaining bonus spins');
  assert.equal(await counter.getAttribute('aria-label'), t('bonusSpinsCounter', {count: remaining}, language));
  assert.equal(await counter.locator('[data-i18n="bonusSpinsRemaining"]').textContent(), t('bonusSpinsRemaining', {}, language));
  if (tier) assert.equal(await counter.getAttribute('data-tier'), tier);
  const bounds = await counter.boundingBox(), viewport = page.viewportSize()!;
  assert.ok(bounds && bounds.width >= 100 && bounds.height >= 25 && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `bonus remaining counter is visible inside the viewport: ${JSON.stringify(bounds)}`);
  const layering = await counter.evaluate(element => {
    const box = element.getBoundingClientRect(), center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!center && (center === element || element.contains(center));
  });
  assert.ok(layering, 'bonus counter stays visibly above the game and completion overlays');
}
async function observeBonusPresentation(page: Page) {
  await page.evaluate(() => {
    window.__stopBonusObserver?.(); window.__bonusTrace = [];
    const observer = new MutationObserver(() => {
      const canvas = document.getElementById('reels')!;
      const wheel = document.getElementById('bonus-wheel');
      for (const event of [
        canvas.dataset.triggerPhase ? {kind: 'trigger' as const, phase: canvas.dataset.triggerPhase, tier: canvas.dataset.bonusTrigger!} : null,
        wheel ? {kind: 'wheel' as const, phase: wheel.dataset.phase!, tier: wheel.dataset.tier!, spinning: wheel.dataset.spinning} : null,
      ]) {
        if (!event) continue;
        const previous = window.__bonusTrace!.filter(old => old.kind === event.kind).at(-1);
        if (!previous || previous.phase !== event.phase || previous.tier !== event.tier) window.__bonusTrace!.push({...event, time: performance.now()});
      }
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-trigger-phase','data-phase','data-spinning']});
    window.__stopBonusObserver = () => observer.disconnect();
  });
}
async function assertReadyWheel(page: Page, tier: BonusTier, upgrades: BonusUpgrade[], turbo: boolean, scenario = 'desktop') {
  const wheel = page.locator('#bonus-wheel');
  await wheel.waitFor({state: 'visible', timeout: 25_000});
  assert.equal(await wheel.getAttribute('data-tier'), tier);
  assert.equal(Number(await wheel.getAttribute('data-pointers')), upgrades.length);
  assert.deepEqual((await wheel.getAttribute('data-awarded-upgrades'))!.split(',').sort(), upgrades.slice().sort());
  const before = await snapshot(page);
  assert.deepEqual(before.activeRound?.upgrades.slice().sort(), upgrades.slice().sort());
  assert.ok(await page.locator('#spin').isDisabled(), 'the upgrade decision cannot start another paid round');
  if (tier === 'december') {
    assert.equal(await wheel.getAttribute('data-spinning'), 'false');
    assert.equal(await wheel.getAttribute('data-phase'), 'ready');
    assert.match(await wheel.getAttribute('class') ?? '', /sg-wheel-stationary/);
    const still = await wheel.locator('.sg-wheel-dial').evaluate(element => ({animation: getComputedStyle(element).animationName, transition: getComputedStyle(element).transitionDuration, transform: getComputedStyle(element).transform}));
    assert.equal(still.animation, 'none');
    assert.ok(still.transition.split(',').every(duration => Number.parseFloat(duration) === 0), `December has no rotating transition: ${JSON.stringify(still)}`);
  } else {
    assert.equal(await wheel.getAttribute('data-spinning'), 'true');
    assert.ok(await wheel.locator('.sg-wheel-continue').isDisabled());
    assert.equal(await wheel.locator('.sg-wheel-awards').getAttribute('aria-hidden'), 'true', 'the awards are revealed after the actual stop');
  }
  await page.waitForFunction(() => document.getElementById('bonus-wheel')?.dataset.phase === 'ready', undefined, {timeout: 12_000});
  assert.equal(await wheel.getAttribute('data-spinning'), 'false');
  assert.ok(await wheel.locator('.sg-wheel-continue').isEnabled());
  assert.equal(await wheel.locator('.sg-wheel-awards').getAttribute('aria-hidden'), 'false');
  assert.deepEqual(await wheel.locator('.sg-wheel-pointer').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.upgrade).sort()), upgrades.slice().sort());
  assert.deepEqual(await wheel.locator('.sg-wheel-awards [data-award]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.award).sort()), upgrades.slice().sort());
  // Check the actual final geometry, rather than trusting award labels alone.
  const geometry = await wheel.evaluate(element => {
    const dial = element.querySelector<HTMLElement>('.sg-wheel-dial')!;
    const dialMatrix = new DOMMatrixReadOnly(getComputedStyle(dial).transform);
    return {rotation: Math.atan2(dialMatrix.b, dialMatrix.a) * 180 / Math.PI, pointers: [...element.querySelectorAll<HTMLElement>('.sg-wheel-pointer')].map(pointer => {
      const pointerMatrix = new DOMMatrixReadOnly(getComputedStyle(pointer).transform);
      return {upgrade: pointer.dataset.upgrade!, angle: Math.atan2(pointerMatrix.b, pointerMatrix.a) * 180 / Math.PI};
    })};
  });
  const sectorOrder: BonusUpgrade[] = ['infectious', 'bomb', 'shots'];
  for (const pointer of geometry.pointers) {
    const sector = sectorOrder.indexOf(pointer.upgrade as BonusUpgrade) * 120 + 60;
    const difference = ((pointer.angle - geometry.rotation - sector) % 360 + 360) % 360;
    const error = Math.min(difference, 360 - difference);
    assert.ok(error < 2, `pointer ${pointer.upgrade} lands on its selected sector: ${JSON.stringify(geometry)}`);
  }
  assert.deepEqual(await snapshot(page), before, 'the visible wheel does not draw RNG, settle another spin or change the committed awards');
  const trace = await page.evaluate(() => window.__bonusTrace ?? []);
  timingEvidence[`${scenario}-wheel-${tier}-${turbo ? 'turbo' : 'normal'}`] = {trace, geometry};
  const spinning = trace.find(event => event.kind === 'wheel' && event.tier === tier && event.phase === 'spinning');
  const ready = trace.find(event => event.kind === 'wheel' && event.tier === tier && event.phase === 'ready');
  if (tier === 'december') assert.equal(spinning, undefined, 'all three December awards are stationary');
  else {
    assert.ok(spinning && ready, `the real wheel transition was observed: ${JSON.stringify(trace)}`);
    assert.ok(ready.time - spinning.time >= (turbo ? 2500 : 3600), 'wheel outcomes remain readable in normal and turbo play');
  }
  await noOverflow(page);
  await shot(page, `${scenario}-${tier}-${turbo ? 'turbo' : 'normal'}-wheel-result`);
  await wheel.locator('.sg-wheel-continue').click();
  await wheel.waitFor({state: 'detached'});
}
async function browserSourceHashes() {
  const files = ['index.html', 'scripts/browser-test.ts'];
  async function visit(directory: string) {
    for (const entry of await readdir(resolve(repositoryRoot, directory), {withFileTypes: true})) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(file);
      else if (/\.(ts|css|svg|png|json)$/.test(entry.name)) files.push(file);
    }
  }
  await visit('src'); await visit('public/art-v2');
  if (existsSync(resolve(repositoryRoot, 'public/art-v3'))) await visit('public/art-v3');
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash('sha256').update(await readFile(resolve(repositoryRoot, file))).digest('hex')])));
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

const initialSourceHashes = await browserSourceHashes();
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

  await check(`Desktop renders the original 6 × 5 illustrated board, ${PAYING_SYMBOLS.length} distinct atlas symbols and local fonts`, desktop, async () => {
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
    const artwork = ['wild', 'scatter', 'xways', 'infectious', 'infectious-upgraded', 'bomb', 'shot', 'couple', 'party-shuttle'];
    const decoded = await desktop.evaluate(async ids => Promise.all(ids.map(async id => {
      const image = new Image(); image.src = `/art-v2/${id}.svg`; await image.decode();
      return { id, width: image.naturalWidth, height: image.naturalHeight };
    })), artwork);
    assert.ok(decoded.every(image => image.width > 100 && image.height > 100), JSON.stringify(decoded));
    assert.deepEqual(Object.keys(atlasManifest.cells).sort(), [...PAYING_SYMBOLS].sort(), 'the atlas manifest maps every regular paying symbol exactly once');
    const illustrations = await desktop.evaluate(async manifests => Promise.all(manifests.map(async manifest => {
      const image = new Image(); image.src = `/art-v3/${manifest.image}?v=5.4`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      const cells = Object.entries(manifest.cells).map(([symbol, cell]) => {
        ctx.clearRect(0, 0, 100, 100); ctx.drawImage(image, cell.x, cell.y, cell.width, cell.height, 0, 0, 100, 100);
        const pixels = ctx.getImageData(0, 0, 100, 100).data, colors = new Set<string>(); let opaque = 0, pixelHash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
          for (let channel = 0; channel < 4; channel++) pixelHash = Math.imul(pixelHash ^ pixels[index + channel], 16777619) >>> 0;
          if (pixels[index + 3] > 128) { opaque++; colors.add(`${pixels[index]}:${pixels[index + 1]}:${pixels[index + 2]}`); }
        }
        return {symbol, colors: colors.size, opaquePixels: opaque, pixelHash};
      });
      return {width: image.naturalWidth, height: image.naturalHeight, cells};
    })), [atlasManifest, atlasManifest.scenes!]);
    const illustrated = illustrations[0], scenes = illustrations[1];
    assert.equal(illustrated.width, atlasManifest.width); assert.equal(illustrated.height, atlasManifest.height);
    assert.ok(illustrated.cells.every(cell => cell.colors > 40 && cell.opaquePixels > 500), `each paying-symbol crop contains distinct detailed visible artwork: ${JSON.stringify(illustrated)}`);
    assert.equal(new Set(illustrated.cells.map(cell => cell.pixelHash)).size, PAYING_SYMBOLS.length, 'every regular symbol has different actual atlas pixels');
    assert.ok(assets.has(`/art-v3/${atlasManifest.image}`), 'the real original symbol atlas is served locally');
    assert.equal(scenes.width, atlasManifest.scenes!.width); assert.equal(scenes.height, atlasManifest.scenes!.height);
    assert.deepEqual(Object.keys(atlasManifest.scenes!.cells).sort(), ['base', 'december', 'dorm', 'friday']);
    assert.ok(scenes.cells.every(cell => cell.colors > 100 && cell.opaquePixels > 9000), 'each original painted Studentski Grad scene is fully visible and detailed');
    assert.equal(new Set(scenes.cells.map(cell => cell.pixelHash)).size, 4, 'all four scene tiles contain different real artwork');
    assert.ok(assets.has(`/art-v3/${atlasManifest.scenes!.image}`), 'the real original scene atlas is served locally');
    timingEvidence.illustratedAtlas = illustrated; timingEvidence.sceneAtlas = scenes;
    for (const font of ['Manrope', 'Oswald']) assert.ok(assets.has(`/fonts/${font}.ttf`));
    await euro(desktop, '#balance', CONFIG.initialBalanceCents, 'bg');
    for (const viewport of desktopViewports) {
      await desktop.setViewportSize(viewport);
      await noOverflow(desktop);
      for (const id of ['reels','spin','features','balance','win','bet']) {
        const box = await desktop.locator(`#${id}`).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${id} fits ${viewport.width} × ${viewport.height}: ${JSON.stringify(box)}`);
      }
      const board = await desktop.locator('#reels').boundingBox();
      assert.ok(board && board.width >= 610, `the game board remains prominent even on short desktop screens: ${JSON.stringify(board)}`);
      if (viewport.width === 1440 && viewport.height === 720) await shot(desktop, 'desktop-720-controls');
    }
    await desktop.setViewportSize({width:1440,height:1000});
    await noOverflow(desktop); await shot(desktop, 'desktop-bulgarian');
  });

  await check('English/Bulgarian settings and euro formatting persist through a reload', desktop, async () => {
    assert.match(await desktop.locator('.notice-poster small').textContent() ?? '', /59/);
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
    for (const key of ['render.scatterpay']) {
      const translated = t(key, {}, 'en');
      assert.notEqual(translated, key, `${key} has an English translation`);
      assert.ok(painted.includes(translated), `the canvas actually paints ${translated}`);
    }
    assert.ok(painted.some(text => /BLOCK 59/.test(text)), 'the English canvas uses Block 59');
    assert.ok(painted.every(text => !/(?:BLOCK|БЛОК)\s*42/.test(text)), 'no old Block 42 canvas label remains');
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
      const row = desktop.locator('.sg-paytable tbody tr').nth(i), symbol = PAYING_SYMBOLS[i];
      const values = await row.locator('td').allTextContents();
      assert.deepEqual(values.map(value => Number(value.replace('×', '').replaceAll(',', ''))), CONFIG.paytable[symbol].map(value => value / CONFIG.payoutDenominator));
      const painted = row.locator(`svg[data-art-symbol="${symbol}"]`), cell = atlasManifest.cells[symbol];
      assert.equal(await painted.getAttribute('viewBox'), `0 0 ${cell.width} ${cell.height}`, 'paytable art clips exactly one regular atlas cell');
      const displayScale = Number(await painted.locator('image').getAttribute('width')) / atlasManifest.width;
      assert.ok(displayScale >= 1 && displayScale <= 1.3, 'paytable zoom uses the transparent margins while preserving one selected cell');
      assert.ok(Math.abs(Number(await painted.locator('image').getAttribute('x')) - (-cell.x * displayScale - (displayScale - 1) * cell.width / 2)) < .01);
      assert.ok(Math.abs(Number(await painted.locator('image').getAttribute('y')) - (-cell.y * displayScale - (displayScale - 1) * cell.height / 2)) < .01);
      assert.equal(await painted.locator('image').getAttribute('href'), `/art-v3/${atlasManifest.image}?v=5.4`, 'paytable art matches the actual reel illustration');
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
    await declineOffer(desktop);
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
      for (const step of p.cascadeSteps) {
        assert.ok(step.modifiers.every(event => event.kind !== 'infectious' || event.targets.length >= 1));
      }
      if (mode === 'hunt') assert.ok(p.initialGrid[1].includes('scatter'), 'xBet guarantees an invitation on reel two');
      await finish(desktop);
      const settled = await snapshot(desktop); paidRound(settled, Math.round(20 * price));
      assert.deepEqual(settled, playCompleteRound(setMode(createSession(seed), mode), {kind: 'mode', mode}));
    });
  }

  for (const [tier, price, spins, upgrades] of [['dorm',70,7,1], ['friday',200,8,2], ['december',600,10,3]] as const) {
    await check(`${tier} buy lands ${upgrades + 2} invitations, shows ${upgrades} exact wheel awards and charges one ${price}× debit`, desktop, async () => {
      const seed = naturalSeed(`buy-${tier}`, {kind: 'buy', bonus: tier}, p => !p.maxWin);
      await reset(desktop, seed);
      const turbo = tier !== 'dorm';
      await desktop.evaluate(value => window.__slot.setTurbo(value), turbo);
      await observeBonusPresentation(desktop); await buy(desktop, tier);
      const first = await snapshot(desktop), p = first.presentation!;
      assert.equal(p.tier, tier); assert.equal(p.intro, true);
      assert.equal(p.upgrades.length, upgrades); assert.equal(new Set(p.upgrades).size, upgrades);
      for (const step of p.cascadeSteps) for (const grid of [step.grid, step.refilledGrid].filter(Boolean) as Grid[]) {
        if(p.upgrades.includes('infectious'))assert.equal(grid.flat().includes('xways'), false, 'the perk guarantees all badges upgraded');
      }
      assert.equal(p.roundCostCents, 20 * price);
      assert.equal(first.activeRound?.spinsRemaining, spins - 1 + p.shotsAdded);
      assert.ok(p.initialPositionMultipliers.every(column => column.every(value => value === 1)));
      await desktop.waitForFunction(expected => document.getElementById('reels')?.dataset.triggerPhase === 'landed' && Number(document.getElementById('reels')?.dataset.triggerScatters) === expected, upgrades + 2, {timeout: 12_000});
      const staged = await desktop.evaluate(() => ({board: window.__slot.board(), state: window.__slot.bonusPresentation()}));
      assert.equal(staged.board.grid.length, 6); assert.ok(staged.board.grid.every(column => column.length === 5));
      assert.equal(staged.board.grid.flat().filter(symbol => symbol === 'scatter').length, upgrades + 2, 'the purchased invitation receipt really lands on the canvas');
      assert.equal(staged.state?.triggerScatters, upgrades + 2);
      assert.deepEqual(staged.state?.awardedUpgrades.slice().sort(), p.upgrades.slice().sort());
      assert.deepEqual(await snapshot(desktop), first, 'purchased scatter staging changes no money, committed board or RNG');
      await assertBonusCounter(desktop, spins, 'en', tier);
      await shot(desktop, `bonus-${tier}-landed-invitations`);
      await assertReadyWheel(desktop, tier, p.upgrades, turbo);
      assert.equal(await desktop.locator('.night-stage').getAttribute('data-scene'), tier);
      const sceneArt = desktop.locator(`.scene-layer svg[data-art-scene="${tier}"]`), sceneCell = atlasManifest.scenes!.cells[tier];
      assert.equal(await sceneArt.getAttribute('viewBox'), `0 0 ${sceneCell.width} ${sceneCell.height}`, 'each bonus displays exactly its original painted scene tile');
      assert.equal(await sceneArt.locator('image').getAttribute('x'), String(-sceneCell.x));
      assert.equal(await sceneArt.locator('image').getAttribute('y'), String(-sceneCell.y));
      assert.equal(await sceneArt.locator('image').getAttribute('href'), `/art-v3/${atlasManifest.scenes!.image}?v=5.4`);
      assert.equal(await desktop.locator('.upgrade-tag.unlocked').count(), upgrades);
      const intro = await desktop.evaluate(() => window.__slot.bonusPresentation());
      assert.equal(intro?.phase, 'result');
      await assertBonusCounter(desktop, spins - 1, 'en', tier);
      await finish(desktop);
      assert.ok(await desktop.locator('#bonus-spin-counter').isHidden(), 'remaining spins hide when the paid bonus is complete');
      const settled = await snapshot(desktop); paidRound(settled, 20 * price);
      assert.deepEqual(settled, playCompleteRound(createSession(seed), {kind: 'buy', bonus: tier}));
      assert.ok(settled.history[0].spins >= spins || settled.history[0].maxWin);
    });
  }

  await check('Bought invitations vary across receipt IDs on distinct reels, and a pending receipt reload keeps its exact landing and accounting', desktop, async () => {
    const evidence: {tier: BonusTier; layouts: {id: string; cells: {reel: number; row: number}[]}[]; freshSessionLayouts: {id: string; cells: {reel: number; row: number}[]}[]; reloaded?: {id: string; cells: {reel: number; row: number}[]}}[] = [];
    for (const tier of ['dorm', 'friday', 'december'] as const) {
      await reset(desktop, fixtures[`buy-${tier}`]);
      const tierEvidence: typeof evidence[number] = {tier, layouts: [], freshSessionLayouts: []};
      for (let purchase = 0; purchase < 6; purchase++) {
        if (purchase >= 4) await reset(desktop, fixtures[`buy-${tier}`] + purchase);
        await declineOffer(desktop);
        const prior = await snapshot(desktop);
        await features(desktop, 'buys'); await desktop.locator(`[data-action="buy-${tier}"]`).click();
        await euro(desktop, '.sg-debit dd', prior.betCents * CONFIG.buyPrices[tier]);
        assert.deepEqual(await snapshot(desktop), prior, 'choosing the tier leaves the previous paid receipt and RNG untouched');
        await desktop.locator('[data-action="confirm"]').click();
        const committed = await snapshot(desktop), view = committed.presentation!;
        assert.deepEqual(committed, startRound(prior, {kind: 'buy', bonus: tier}), 'the purchase commits one ordinary production-RNG bonus receipt before presentation');
        await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.triggerPhase === 'landed', undefined, {timeout: 12_000});
        const landed = await desktop.evaluate(() => window.__slot.board());
        const cells = landed.grid.flatMap((column, reel) => column.flatMap((symbol, row) => symbol === 'scatter' ? [{reel, row}] : []));
        const expectedCount = {dorm: 3, friday: 4, december: 5}[tier];
        assert.equal(cells.length, expectedCount, 'the bought tier lands exactly its advertised physical scatter count');
        assert.ok(landed.grid.flat().every(symbol => symbol === 'scatter' || PAYING_SYMBOLS.includes(symbol as typeof PAYING_SYMBOLS[number])), 'the invitation receipt shows regular fillers without leaking future upgraded badges or other spin features');
        assert.equal(new Set(cells.map(cell => cell.reel)).size, expectedCount, 'each bought invitation lands on a different reel');
        assert.equal(new Set(cells.map(cell => `${cell.reel}:${cell.row}`)).size, expectedCount, 'no duplicate position hides or overwrites an invitation');
        assert.ok(cells.every(cell => cell.reel >= 0 && cell.reel < CONFIG.reels && cell.row >= 0 && cell.row < CONFIG.rows));
        assert.deepEqual(await snapshot(desktop), committed, 'landing positions consume no gameplay RNG, money or settlement writes');
        if (purchase < 4) tierEvidence.layouts.push({id: view.id, cells});
        if (purchase === 0 || purchase >= 4) tierEvidence.freshSessionLayouts.push({id: view.id, cells});
        if (tier === 'dorm' && purchase === 0) {
          const stored = await desktop.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
          assert.deepEqual(stored, committed, 'the pending bonus receipt is already durable when its invitations land');
          await shot(desktop, 'bonus-varied-invitations-before-reload');
          await desktop.reload({waitUntil: 'networkidle'}); await desktop.waitForFunction(() => !!window.__slot);
          assert.deepEqual(await snapshot(desktop), committed, 'reload resumes the same invitation receipt without a second debit or RNG advance');
          await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.triggerPhase === 'landed', undefined, {timeout: 12_000});
          const recoveredLanding = await desktop.evaluate(() => window.__slot.board());
          assert.deepEqual(recoveredLanding.grid, landed.grid, 'a recovered pending receipt lands the identical scattered invitations and filler symbols');
          assert.deepEqual(recoveredLanding.positionMultipliers, landed.positionMultipliers);
          tierEvidence.reloaded = {id: view.id, cells};
        }
        // Skipping the remainder of the landing/wheel and every free spin must
        // settle the same engine receipt as an uninterrupted presentation.
        await finish(desktop);
        assert.deepEqual(await snapshot(desktop), playCompleteRound(prior, {kind: 'buy', bonus: tier}), 'skip and reload preserve the complete pure-engine bonus receipt');
      }
      assert.equal(new Set(tierEvidence.layouts.map(layout => layout.id)).size, 4, 'separate purchases have separate immutable receipt identities');
      assert.ok(new Set(tierEvidence.layouts.map(layout => JSON.stringify(layout.cells))).size >= 3, 'the bought scatter positions vary across purchases instead of repeating a hard-coded pattern');
      assert.ok(new Set(tierEvidence.layouts.map(layout => layout.cells.map(cell => cell.reel).join(','))).size >= 2, 'purchases vary the selected reels');
      assert.ok(new Set(tierEvidence.layouts.map(layout => layout.cells.map(cell => cell.row).join(','))).size >= 2, 'purchases vary the selected rows');
      assert.equal(new Set(tierEvidence.freshSessionLayouts.map(layout => layout.id)).size, 1, 'first purchases in different seeded sessions exercise the same round-one receipt ID');
      assert.ok(new Set(tierEvidence.freshSessionLayouts.map(layout => JSON.stringify(layout.cells))).size >= 2, 'fresh sessions with different recorded bonus boards vary the scatter layout even when their receipt IDs match');
      evidence.push(tierEvidence);
    }
    timingEvidence.boughtInvitationLayouts = evidence;
  });

  let counterSeed = 0;
  for (let seed = 1; seed <= 10_000; seed++) {
    const begun = startRound(createSession(seed), {kind: 'buy', bonus: 'dorm'});
    if (!begun.presentation!.shotsAdded || begun.presentation!.maxWin) continue;
    const complete = playCompleteRound(createSession(seed), {kind: 'buy', bonus: 'dorm'});
    if (complete.history[0].spins <= 11 && !complete.history[0].maxWin) { counterSeed = seed; fixtures['bonus-counter-with-shot'] = seed; break; }
  }
  assert.ok(counterSeed, 'a bounded natural bonus with a shot supplies the remaining-counter fixture');
  await check('Bonus remaining spins consume the first spin, add visible shots and show zero on the final spin', desktop, async () => {
    await reset(desktop, counterSeed); await observeBonusPresentation(desktop); await buy(desktop, 'dorm');
    const committed = await snapshot(desktop), first = committed.presentation!;
    assert.ok(first.shotsAdded > 0);
    await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.triggerPhase === 'landed');
    await assertBonusCounter(desktop, CONFIG.bonuses.dorm.spins, 'en', 'dorm');
    await assertReadyWheel(desktop, 'dorm', first.upgrades, true, 'counter');
    const baseline = Math.max(0, committed.activeRound!.spinsRemaining - first.shotsAdded);
    await assertBonusCounter(desktop, baseline, 'en', 'dorm');
    await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.animation === 'shot' && !document.getElementById('bonus-spins-added')!.hidden);
    const shotView = await desktop.evaluate(() => ({count: Number(document.getElementById('bonus-spins-count')!.textContent), added: Number(document.getElementById('bonus-spins-added')!.textContent!.replace('+', ''))}));
    assert.ok(shotView.added > 0 && shotView.added <= first.shotsAdded);
    assert.equal(shotView.count, baseline + shotView.added, 'remaining counter adds only the replayed shot award');
    await assertBonusCounter(desktop, shotView.count, 'en', 'dorm');
    await shot(desktop, 'desktop-bonus-spins-shot');
    await desktop.evaluate(async () => {
      const deadline = performance.now() + 25_000;
      while (!window.__slot.snapshot().presentation?.roundComplete) {
        if (performance.now() > deadline) throw new Error('The bounded counter fixture did not reach its final spin');
        window.__slot.skip(); await new Promise(resolve => setTimeout(resolve, 20));
      }
    });
    const final = await snapshot(desktop);
    assert.equal(final.activeRound, null); assert.equal(final.presentation!.tier, 'dorm'); assert.equal(final.presentation!.roundComplete, true);
    await assertBonusCounter(desktop, 0, 'en', 'dorm');
    await desktop.waitForFunction(() => document.getElementById('round-overlay')?.hidden === false);
    await assertBonusCounter(desktop, 0, 'en', 'dorm');
    await shot(desktop, 'desktop-bonus-spins-complete');
    await finish(desktop);
    assert.ok(await desktop.locator('#bonus-spin-counter').isHidden(), 'base play has no stale bonus spins');
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(counterSeed), {kind:'buy',bonus:'dorm'}), 'counter updates consume no extra RNG or money');
    timingEvidence.bonusRemainingCounter = {seed: counterSeed, awarded: CONFIG.bonuses.dorm.spins, firstConsumed: baseline, shownAfterShot: shotView.count, added: shotView.added, final: 0};
  });

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
  await check('Three natural invitations show the same exact one-pointer wheel before the seven-spin bonus', desktop, async () => {
    await reset(desktop, scatterSeed); await observeBonusPresentation(desktop); await desktop.locator('#spin').click();
    const first = await snapshot(desktop);
    assert.equal(first.presentation?.bonusAwarded, 'dorm'); assert.equal(first.presentation?.scatters, 3);
    assert.equal(first.activeRound?.spinsRemaining, 7); assert.equal(first.activeRound?.upgrades.length, 1);
    await assertReadyWheel(desktop, 'dorm', first.activeRound!.upgrades, true);
    const intro = await desktop.evaluate(() => window.__slot.bonusPresentation());
    assert.equal(intro?.tier, 'dorm'); assert.equal(intro?.triggerScatters, 3);
    assert.deepEqual(intro?.awardedUpgrades, first.activeRound!.upgrades);
    await finish(desktop); const settled = await snapshot(desktop); paidRound(settled, 20);
    assert.deepEqual(settled, playCompleteRound(createSession(scatterSeed), {kind: 'mode', mode: 'standard'}));
  });

  for(const [tier,count] of [['friday',4],['december',5]] as const){
    const seed=naturalSeed(`natural-${tier}-invitations`,{kind:'mode',mode:'standard'},p=>p.bonusAwarded===tier&&p.scatters===count);
    await check(`${count} natural invitations award the ${tier} wheel and complete without a purchase debit`,desktop,async()=>{
      await reset(desktop,seed);await desktop.evaluate(()=>window.__slot.setTurbo(true));await observeBonusPresentation(desktop);
      await desktop.locator('#spin').click();const committed=await snapshot(desktop);
      assert.equal(committed.presentation!.bonusAwarded,tier);assert.equal(committed.activeRound!.upgrades.length,count-2);
      await assertReadyWheel(desktop,tier,committed.activeRound!.upgrades,true);
      await finish(desktop);paidRound(await snapshot(desktop),20);
      assert.deepEqual(await snapshot(desktop),playCompleteRound(createSession(seed),{kind:'mode',mode:'standard'}));
    });
  }

  const sourceOnlySeed = naturalSeed('normal-source-only-emitter-with-visible-matches', {kind:'mode', mode:'standard'}, p => {
    if (p.bonusAwarded || !p.initialGrid.flat().includes('xways') || p.payoutCents >= 400 || p.cascadeSteps.length > 3) return false;
    const firstNormal = p.cascadeSteps[0].modifiers[0];
    return firstNormal?.kind === 'xways' && firstNormal.gridAfter!.flat().filter(symbol => symbol === firstNormal.symbol).length > 2;
  });
  await check('Normal xWays reveals and boosts its own position even with visible matches, without upgraded throws or return flights', desktop, async () => {
    await reset(desktop, sourceOnlySeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await observeArtworkAndDrops(desktop); await observeBeerEffects(desktop); await desktop.locator('#spin').click();
    const before = await snapshot(desktop), view = before.presentation!;
    assert.equal(view.tier, null); assert.equal(view.upgrades.includes('infectious'), false);
    const event = view.cascadeSteps[0].modifiers.find(event => event.kind === 'xways')!;
    assert.equal(view.initialGrid[event.source.reel][event.source.row], 'xways');
    assert.deepEqual(event.targets, [event.source], 'a normal badge boosts only its own position');
    assert.ok(event.gridAfter!.flat().filter(symbol => symbol === event.symbol).length > 2, 'source-only payouts are exercised with several matching regular symbols present');
    for (let reel = 0; reel < CONFIG.reels; reel++) for (let row = 0; row < CONFIG.rows; row++) {
      const previous = view.cascadeSteps[0].positionMultipliers[reel][row];
      assert.equal(event.positionMultipliersAfter![reel][row], reel === event.source.reel && row === event.source.row ? Math.min(CONFIG.positionMultiplierLimit, previous * event.factor) : previous);
    }
    await desktop.waitForFunction(expected => {
      const modifier = window.__slot.board().modifier;
      return modifier?.kind === 'xways' && modifier.source.reel === expected.reel && modifier.source.row === expected.row;
    }, event.source);
    assert.ok(await desktop.evaluate(() => window.__paintedArt?.includes('xways')), 'the actual board paints the normal speaker asset on its own destination');
    const source = `${event.source.reel}:${event.source.row}`;
    const visualTargets = await desktop.evaluate(() => window.__slot.board().modifier!.visualTargets);
    assert.deepEqual(visualTargets, [], 'matching symbols elsewhere never become normal xWays beer recipients');
    await desktop.waitForFunction(source => (window.__beerTrace ?? []).some(effect => effect.kind === 'foam' && effect.source === source), source);
    await desktop.waitForFunction(expected => {
      const board = window.__slot.board();
      return board.modifier?.kind === 'xways' && board.modifier.source.reel === expected.source.reel && board.modifier.source.row === expected.source.row && board.modifier.progress >= .9 && JSON.stringify(board.grid) === JSON.stringify(expected.gridAfter) && JSON.stringify(board.positionMultipliers) === JSON.stringify(expected.positionMultipliersAfter);
    }, event, {timeout: 15_000});
    assert.equal(await desktop.locator('#energy').innerText(), Math.max(...event.positionMultipliersAfter!.flat()).toLocaleString('en-GB'), 'the highest-multiplier display follows the revealed source boost before its animation finishes');
    assert.deepEqual(await snapshot(desktop), before, 'opening the normal badge does not change committed RNG or awards');
    const effects = (await desktop.evaluate(() => window.__beerTrace ?? [])).filter(effect => effect.source === source);
    assert.equal(effects.filter(effect => effect.kind === 'bottle').length, 0, 'normal xWays has no outbound, source-loop or return beer bottles');
    assert.equal(effects.filter(effect => effect.kind === 'moving-symbol').length, 0, 'no symbol ghost moves between the badge and matching regular symbols');
    const sourceCenter = {x: 34 + (event.source.reel + .5) * 162, y: 48 + (event.source.row + .5) * 130};
    const sourcePaints = effects.filter(effect => effect.kind === 'grid-symbol' && Math.abs(effect.x - sourceCenter.x) < .01 && Math.abs(effect.y - sourceCenter.y) < .01);
    const badge = sourcePaints.find(effect => effect.symbol === 'xways'), revealed = sourcePaints.find(effect => effect.symbol === event.symbol);
    assert.ok(badge && revealed && badge.progress < revealed.progress, 'the real canvas opens the landed badge into its recorded paying symbol at the same cell');
    let preReveal = view.cascadeSteps[0].grid;
    for (const previous of view.cascadeSteps[0].modifiers) { if (previous === event) break; preReveal = previous.gridAfter ?? preReveal; }
    const matches = preReveal.flatMap((column, reel) => column.flatMap((symbol, row) => symbol === event.symbol ? [{reel, row}] : []));
    assert.ok(matches.length >= 2, 'the local reveal runs with at least two matching cells elsewhere');
    for (const target of matches) {
      const x = 34 + (target.reel + .5) * 162, y = 48 + (target.row + .5) * 130;
      const paints = effects.filter(effect => effect.kind === 'grid-symbol' && Math.abs(effect.x - x) < .01 && Math.abs(effect.y - y) < .01);
      assert.ok(paints.length >= 5 && paints.every(effect => effect.symbol === event.symbol), 'matching regular symbols retain their own artwork through the normal reveal');
      assert.equal(event.positionMultipliersAfter![target.reel][target.row], view.cascadeSteps[0].positionMultipliers[target.reel][target.row], 'matching symbols receive no normal xWays multiplier');
    }
    const foam = effects.filter(effect => effect.kind === 'foam');
    assert.ok(foam.some(effect => (effect.radius ?? 0) >= 10 && effect.alpha >= .5), 'the source reveal has a substantial readable local impact');
    assert.ok(foam.every(effect => Math.abs(effect.x - sourceCenter.x) < .01 && Math.abs(effect.y - sourceCenter.y) < .01), 'normal reveal impact art stays at the source, never at matching cells');
    timingEvidence.normalLocalReveal = {source: event.source, visibleMatches: matches, visualTargets, recordedPaidTargets: event.targets, actualBottles: 0, sourceImpactRadius: Math.max(...foam.map(effect => effect.radius ?? 0)), returningSymbols: 0, sourceBadgeProgress: badge.progress, sourceRevealProgress: revealed.progress};
    await finish(desktop); await desktop.evaluate(() => {window.__restoreBeerSpy?.(); window.__restoreImageSpy?.();});
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(sourceOnlySeed), {kind:'mode',mode:'standard'}));
    // Capture the same receipt separately so image encoding cannot consume the
    // active modifier window used above to verify the source boost and panel.
    await reset(desktop, sourceOnlySeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await desktop.locator('#spin').click();
    assert.deepEqual(await snapshot(desktop), before, 'the local-hit screenshot replays the exact committed receipt');
    await desktop.waitForFunction(source => {
      const modifier = window.__slot.board().modifier;
      return modifier?.kind === 'xways' && `${modifier.source.reel}:${modifier.source.row}` === source && modifier.phase === 'applying' && modifier.progress < .8;
    }, source);
    await shot(desktop, 'desktop-source-only-emitter'); await finish(desktop);
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(sourceOnlySeed), {kind:'mode',mode:'standard'}));
  });

  const isolatedSeed = naturalSeed('normal-local-reveal-with-no-external-match', {kind:'mode', mode:'standard'}, p => {
    if (p.bonusAwarded || p.payoutCents >= 400 || p.cascadeSteps.length > 3) return false;
    const first = p.cascadeSteps[0].modifiers[0];
    return first?.kind === 'xways' && !p.cascadeSteps[0].grid.flat().includes(first.symbol!);
  });
  await check('Normal xWays with no visible match reveals locally without inventing a beer recipient or return flight', desktop, async () => {
    await reset(desktop, isolatedSeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await observeBeerEffects(desktop); await desktop.locator('#spin').click();
    const before = await snapshot(desktop), event = before.presentation!.cascadeSteps[0].modifiers[0];
    await desktop.waitForFunction(source => {
      const modifier = window.__slot.board().modifier;
      return modifier?.kind === 'xways' && `${modifier.source.reel}:${modifier.source.row}` === source && modifier.progress >= .85;
    }, `${event.source.reel}:${event.source.row}`);
    const modifier = await desktop.evaluate(() => window.__slot.board().modifier!);
    assert.deepEqual(modifier.visualTargets, [], 'no outward cell is invented when the revealed type has no visible match');
    assert.deepEqual(modifier.targets, [event.source], 'only the normal source is a recorded award target');
    const effects = (await desktop.evaluate(() => window.__beerTrace ?? [])).filter(effect => effect.source === `${event.source.reel}:${event.source.row}`);
    assert.equal(effects.filter(effect => effect.kind === 'bottle').length, 0, 'a no-match reveal has no source loop or outward/return bottle');
    assert.equal(effects.filter(effect => effect.kind === 'moving-symbol').length, 0, 'a no-match reveal has no returning symbol ghost');
    const foam = effects.filter(effect => effect.kind === 'foam');
    assert.ok(foam.some(effect => (effect.radius ?? 0) >= 10 && effect.alpha >= .5), 'the local reveal still has a substantial readable splash');
    assert.ok(foam.every(effect => Math.abs(effect.x - (34 + (event.source.reel + .5) * 162)) < .01 && Math.abs(effect.y - (48 + (event.source.row + .5) * 130)) < .01), 'all local impact art stays at the one normal award cell');
    assert.deepEqual(await snapshot(desktop), before, 'local reveal and splash leave RNG and committed awards unchanged');
    timingEvidence.normalNoMatchBeer = {source: event.source, visualTargets: modifier.visualTargets, actualBottles: 0, sourceImpactRadius: Math.max(...foam.map(effect => effect.radius ?? 0))};
    await finish(desktop); await desktop.evaluate(() => window.__restoreBeerSpy?.());
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(isolatedSeed), {kind:'mode',mode:'standard'}));
  });

  const boostedSourceSeed = naturalSeed('normal-already-boosted-source-reveal', {kind: 'mode', mode: 'frames'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.cascadeSteps.length <= 3 && p.cascadeSteps[0].modifiers[0]?.kind === 'xways');
  await check('Normal xWays on an already boosted source shows its actual new position multiplier at the local reveal', desktop, async () => {
    await reset(desktop, boostedSourceSeed); await selectMode(desktop, 'frames');
    await desktop.evaluate(() => window.__slot.setTurbo(false)); await observeBeerEffects(desktop); await desktop.locator('#spin').click();
    const committed = await snapshot(desktop), view = committed.presentation!, event = view.cascadeSteps[0].modifiers[0];
    const oldMultiplier = view.initialPositionMultipliers[event.source.reel][event.source.row], newMultiplier = event.positionMultipliersAfter![event.source.reel][event.source.row];
    assert.ok(oldMultiplier > 1); assert.equal(newMultiplier, Math.min(CONFIG.positionMultiplierLimit, oldMultiplier * event.factor!));
    await desktop.waitForFunction(expected => {
      const board = window.__slot.board(), modifier = board.modifier;
      return modifier?.kind === 'xways' && modifier.source.reel === expected.source.reel && modifier.source.row === expected.source.row && modifier.progress >= .85 && JSON.stringify(board.grid) === JSON.stringify(expected.gridAfter) && JSON.stringify(board.positionMultipliers) === JSON.stringify(expected.positionMultipliersAfter);
    }, event);
    const effects = (await desktop.evaluate(() => window.__beerTrace ?? [])).filter(effect => effect.source === `${event.source.reel}:${event.source.row}`);
    const labels = effects.filter(effect => effect.kind === 'factor-label' && effect.progress >= .3 && Math.abs(effect.x - (34 + (event.source.reel + .5) * 162)) < .01 && Math.abs(effect.y - (48 + (event.source.row + .5) * 130)) < .01);
    assert.ok(labels.length >= 5 && labels.every(label => label.symbol === `×${newMultiplier}`), 'the actual source pop-up shows the new total, rather than mistaking its raw ×2/×4/×8 factor for the resulting position boost');
    assert.equal(await desktop.locator('#energy').innerText(), Math.max(...event.positionMultipliersAfter!.flat()).toLocaleString('en-GB'));
    assert.equal(effects.filter(effect => effect.kind === 'bottle' || effect.kind === 'moving-symbol').length, 0, 'an already boosted normal badge still has no upgraded throws or return flight');
    assert.deepEqual(await snapshot(desktop), committed);
    timingEvidence.normalBoostedSource = {source: event.source, oldMultiplier, factor: event.factor, newMultiplier, actualLabelFrames: labels.length};
    await finish(desktop); await desktop.evaluate(() => window.__restoreBeerSpy?.());
    assert.deepEqual(await snapshot(desktop), playCompleteRound(setMode(createSession(boostedSourceSeed), 'frames'), {kind: 'mode', mode: 'frames'}));
  });

  const sharedSeed = naturalSeed('shared-badge-reveal-on-one-drop', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.cascadeSteps.length <= 3 && p.payoutCents < 400 && p.cascadeSteps[0].modifiers.filter(event => event.kind === 'xways').length >= 2 && new Set(p.cascadeSteps[0].modifiers.filter(event => event.kind === 'xways').map(event => event.factor)).size >= 2);
  await check('Multiple normal badges on one drop share one revealed symbol and visibly boost their own exact sources', desktop, async () => {
    await reset(desktop, sharedSeed); await observeBeerEffects(desktop); await desktop.locator('#spin').click();
    const before = await snapshot(desktop), view = before.presentation!;
    const events = view.cascadeSteps[0].modifiers.filter(event => event.kind === 'xways' || event.kind === 'infectious');
    assert.ok(events.length >= 2); assert.equal(new Set(events.map(event => event.symbol)).size, 1, 'the drop chooses one common revealed paying symbol');
    assert.ok(new Set(events.map(event => event.factor)).size >= 2, 'badge multiplier factors can differ even when their revealed symbol is shared');
    let revealed = view.initialGrid.map(column => [...column]);
    for (const event of events) {
      assert.equal(revealed[event.source.reel][event.source.row], event.kind === 'infectious' ? 'infectious' : 'xways', 'later badges remain concealed until their own reveal');
      await desktop.waitForFunction(expected => {
        const modifier = window.__slot.board().modifier;
        return modifier?.kind === expected.kind && modifier.source.reel === expected.source.reel && modifier.source.row === expected.source.row;
      }, event, {timeout: 15_000});
      const visualTargets = await desktop.evaluate(() => window.__slot.board().modifier!.visualTargets);
      assert.deepEqual(visualTargets, event.kind === 'xways' ? [] : event.targets, 'normal badges reveal locally; upgraded beer recipients use only recorded targets, without leaking later badge reveals');
      revealed[event.source.reel][event.source.row] = event.symbol!;
      assert.deepEqual(event.gridAfter, revealed, 'each event reveals only its own badge using the shared symbol');
      assert.ok(event.targets.every(target => revealed[target.reel][target.row] === event.symbol), 'a badge never multiplies a different revealed symbol');
      if (event.kind === 'xways') assert.deepEqual(event.targets, [event.source], 'normal badges boost only their source');
      await desktop.waitForFunction(expected => {
        const board = window.__slot.board();
        const normalRevealed = expected.kind !== 'xways' || board.modifier?.kind === 'xways' && board.modifier.source.reel === expected.source.reel && board.modifier.source.row === expected.source.row && board.modifier.progress >= .9;
        return normalRevealed && JSON.stringify(board.grid) === JSON.stringify(expected.gridAfter) && JSON.stringify(board.positionMultipliers) === JSON.stringify(expected.positionMultipliersAfter);
      }, event, {timeout: 15_000});
      assert.deepEqual(await snapshot(desktop), before, 'visual badge resolution leaves the full committed receipt and RNG unchanged');
      if (event.kind === 'xways') {
        assert.equal(await desktop.locator('#energy').innerText(), Math.max(...event.positionMultipliersAfter!.flat()).toLocaleString('en-GB'), 'each normal source boost updates the visible highest multiplier during its own reveal');
        const effects = (await desktop.evaluate(() => window.__beerTrace ?? [])).filter(effect => effect.source === `${event.source.reel}:${event.source.row}`);
        assert.equal(effects.filter(effect => effect.kind === 'bottle' || effect.kind === 'moving-symbol').length, 0, 'each normal badge remains a local reveal when several badges share one drop');
        for (const later of events.slice(events.indexOf(event) + 1)) {
          const paints = effects.filter(effect => effect.kind === 'grid-symbol' && Math.abs(effect.x - (34 + (later.source.reel + .5) * 162)) < .01 && Math.abs(effect.y - (48 + (later.source.row + .5) * 130)) < .01);
          assert.ok(paints.length && paints.every(effect => effect.symbol === (later.kind === 'infectious' ? 'infectious-upgraded' : 'xways')), 'the real canvas keeps every later badge concealed throughout the earlier normal reveal');
        }
      }
    }
    await finish(desktop); await desktop.evaluate(() => window.__restoreBeerSpy?.());
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(sharedSeed), {kind:'mode',mode:'standard'}));
  });

  const naturalInfectionSeed = naturalSeed('natural-upgraded-base-beer-throws', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.cascadeSteps.length <= 3 && p.cascadeSteps[0].modifiers.some(event => event.kind === 'infectious' && event.targets.length >= 3));

  const revealInfectionSeed = naturalSeed('upgraded-reveal-before-beer', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.cascadeSteps.length <= 3 && p.cascadeSteps[0].modifiers[0]?.kind === 'infectious' && p.cascadeSteps[0].modifiers[0].targets.length >= 3);
  for (const [kind, seed, badge] of [['xways', sourceOnlySeed, 'xways'], ['infectious', revealInfectionSeed, 'infectious-upgraded']] as const) for (const turbo of [false, true]) {
    const speed = turbo ? 'Turbo' : 'Normal';
    await check(`${kind === 'xways' ? 'Normal' : 'Upgraded'} xWays visibly reveals before its boost or beer throws at ${speed} speed`, desktop, async () => {
      await reset(desktop, seed); await desktop.evaluate(value => window.__slot.setTurbo(value), turbo);
      await observeBeerEffects(desktop); await desktop.locator('#spin').click();
      const committed = await snapshot(desktop), view = committed.presentation!, step = view.cascadeSteps[0], event = step.modifiers[0];
      assert.equal(event.kind, kind); assert.equal(view.tier, null);
      const source = `${event.source.reel}:${event.source.row}`, x = 34 + (event.source.reel + .5) * 162, y = 48 + (event.source.row + .5) * 130;
      const oldSourceMultiplier = step.positionMultipliers[event.source.reel][event.source.row], newSourceMultiplier = event.positionMultipliersAfter![event.source.reel][event.source.row];
      assert.ok(newSourceMultiplier > oldSourceMultiplier, 'the natural fixture has a real source multiplier change');
      await desktop.waitForFunction(expected => {
        const board = window.__slot.board(), modifier = board.modifier;
        const paintedBoosts = (window.__beerTrace ?? []).filter(frame => frame.source === expected.source && frame.kind === 'grid-symbol' && Math.abs(frame.x - expected.x) < .01 && Math.abs(frame.y - expected.y) < .01 && frame.symbol === expected.symbol && JSON.stringify(frame.boardPositionMultipliers) === JSON.stringify(expected.positionMultipliersAfter));
        return modifier?.kind === expected.kind && `${modifier.source.reel}:${modifier.source.row}` === expected.source && modifier.progress >= .93 && JSON.stringify(board.grid) === JSON.stringify(expected.gridAfter) && JSON.stringify(board.positionMultipliers) === JSON.stringify(expected.positionMultipliersAfter) && paintedBoosts.length >= 2;
      }, {kind, source, x, y, symbol: event.symbol, gridAfter: event.gridAfter, positionMultipliersAfter: event.positionMultipliersAfter}, {timeout: 20_000});
      const trace = (await desktop.evaluate(() => window.__beerTrace ?? [])).filter(effect => effect.source === source);
      const sourceFrames = trace.filter(effect => effect.kind === 'grid-symbol' && Math.abs(effect.x - x) < .01 && Math.abs(effect.y - y) < .01);
      const landed = sourceFrames.find(frame => frame.symbol === badge);
      const activeEffects = trace.filter(effect => ['bottle', 'foam', 'spill'].includes(effect.kind) || effect.kind === 'factor-label' && Math.abs(effect.x - x) < .01 && Math.abs(effect.y - y) < .01);
      assert.ok(activeEffects.length > 0, 'the completed second phase visibly applies the settled effect');
      const firstEffectTime = Math.min(...activeEffects.map(effect => effect.time));
      const revealOnly = sourceFrames.filter(frame => frame.phase === 'revealed' && frame.symbol === event.symbol && frame.time < firstEffectTime && JSON.stringify(frame.boardPositionMultipliers) === JSON.stringify(step.positionMultipliers));
      const boosted = sourceFrames.filter(frame => frame.symbol === event.symbol && JSON.stringify(frame.boardPositionMultipliers) === JSON.stringify(event.positionMultipliersAfter));
      assert.ok(landed && revealOnly.length >= 2 && boosted.length >= 2, `the actual canvas paints landed badge, revealed regular symbol with old values, and the final boosted symbol: ${JSON.stringify({landed: !!landed, revealOnlyFrames: revealOnly.length, boostedFrames: boosted.length})}`);
      const firstReveal = revealOnly[0], lastReveal = revealOnly.at(-1)!, firstBoost = boosted[0];
      assert.ok(landed.time < firstReveal.time && lastReveal.time < firstBoost.time, 'the revealed paying symbol is a separate visible phase before any applied boost');
      assert.ok(lastReveal.time - firstReveal.time >= (turbo ? 60 : 100), 'the reveal-only interval spans readable browser frames at both speeds');
      assert.ok(revealOnly.every(frame => JSON.stringify(frame.boardGrid) === JSON.stringify(event.gridAfter)), 'the reveal publishes its actual regular symbol while retaining every old multiplier');
      assert.ok(revealOnly.every(frame => frame.energy === Math.max(...step.positionMultipliers.flat()).toLocaleString('en-GB')), 'the highest-multiplier panel keeps the old value throughout reveal');
      assert.ok(activeEffects.every(effect => effect.time > lastReveal.time), 'beer throws, impacts and the source boost label begin only after the visible reveal-only phase');
      assert.ok(activeEffects.every(effect => effect.phase === 'applying'), 'opening and reveal phases never emit beer effects or a premature source boost label');
      if (kind === 'xways') {
        assert.deepEqual(event.targets, [event.source]);
        assert.equal(trace.filter(effect => effect.kind === 'bottle').length, 0, 'the normal reveal still has no upgraded outbound beer');
        assert.ok(trace.filter(effect => effect.kind === 'foam').every(effect => Math.abs(effect.x - x) < .01 && Math.abs(effect.y - y) < .01), 'the normal boost has one local hit');
      } else {
        assert.ok(trace.some(effect => effect.kind === 'bottle'), 'upgraded beer travels only after its badge has revealed');
        for (const target of event.targets) assert.ok(trace.some(effect => effect.kind === 'foam' && Math.abs(effect.x - (34 + (target.reel + .5) * 162)) < .01 && Math.abs(effect.y - (48 + (target.row + .5) * 130)) < .01), 'every recorded upgraded target receives its second-phase impact');
      }
      assert.equal(await desktop.locator('#energy').innerText(), Math.max(...event.positionMultipliersAfter!.flat()).toLocaleString('en-GB'), 'the highest-multiplier panel catches up when the boost completes');
      assert.deepEqual(await snapshot(desktop), committed, 'both visual phases consume no RNG and create no award');
      timingEvidence[`${kind}-${speed.toLowerCase()}-reveal-before-boost`] = {source: event.source, symbol: event.symbol, factor: event.factor, oldSourceMultiplier, newSourceMultiplier, revealedAtProgress: firstReveal.progress, revealOnlyDurationMs: Math.round(lastReveal.time - firstReveal.time), firstEffectProgress: Math.min(...activeEffects.map(effect => effect.progress)), boostedAtProgress: firstBoost.progress, recordedTargets: event.targets, actualBottles: trace.filter(effect => effect.kind === 'bottle').length, revealOnlyFrames: revealOnly.length};
      await finish(desktop); await desktop.evaluate(() => window.__restoreBeerSpy?.());
      assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(seed), {kind:'mode',mode:'standard'}), 'skipping the remainder settles the identical pure-engine receipt');
    });
  }

  await check('Reload during either xWays reveal preserves its receipt and skips to the identical complete outcome', desktop, async () => {
    const evidence = [];
    for (const [kind, seed] of [['xways', sourceOnlySeed], ['infectious', revealInfectionSeed]] as const) {
      await reset(desktop, seed); await desktop.evaluate(() => window.__slot.setTurbo(false));
      await desktop.locator('#spin').click(); const committed = await snapshot(desktop), event = committed.presentation!.cascadeSteps[0].modifiers[0];
      await desktop.waitForFunction(expected => {
        const modifier = window.__slot.board().modifier;
        return modifier?.kind === expected.kind && modifier.phase === 'revealed' && modifier.source.reel === expected.source.reel && modifier.source.row === expected.source.row;
      }, {kind, source: event.source}, {timeout: 20_000});
      assert.deepEqual(await snapshot(desktop), committed, 'the visible reveal is a replay of the already persisted receipt');
      assert.deepEqual(await desktop.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY), committed);
      await desktop.reload({waitUntil: 'networkidle'}); await desktop.waitForFunction(() => !!window.__slot);
      assert.deepEqual(await snapshot(desktop), committed, 'reloading the revealed badge neither rerolls nor applies a second charge');
      await finish(desktop);
      assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(seed), {kind:'mode',mode:'standard'}));
      evidence.push({kind, source: event.source, receiptId: committed.presentation!.id, rngState: committed.rngState, balanceCents: committed.balanceCents});
    }
    timingEvidence.revealReload = evidence;
  });

  await check('A rare base-game upgraded speaker throws beer to every recorded target without changing settlement', desktop, async () => {
    await reset(desktop,naturalInfectionSeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await observeArtworkAndDrops(desktop); await observeBeerEffects(desktop);await desktop.locator('#spin').click();
    const committed=await snapshot(desktop),view=committed.presentation!;
    const event=view.cascadeSteps[0].modifiers.find(event=>event.kind==='infectious')!;
    assert.equal(view.tier,null);assert.equal(view.upgrades.includes('infectious'),false);
    // Measure uninterrupted playback. A full-page screenshot can block Chromium's
    // main thread across several RAF frames, altering the lifetime being measured.
    await desktop.waitForFunction(()=>!window.__slot.busy(),undefined,{timeout:25000});
    const trace=await desktop.evaluate(()=>window.__beerTrace??[]),source=`${event.source.reel}:${event.source.row}`;
    assert.ok(trace.some(p=>p.kind==='bottle'&&p.source===source),'actual canvas paints thrown beer bottles');
    const splashDurations = [];
    for (const target of event.targets) {
      const hits = trace.filter(p => p.kind === 'foam' && p.source === source && Math.abs(p.x - (34 + (target.reel + .5) * 162)) < .01 && Math.abs(p.y - (48 + (target.row + .5) * 130)) < .01);
      assert.ok(hits.some(hit => (hit.radius ?? 0) >= 10 && hit.alpha >= .5), 'every recorded target receives a large, opaque foam impact');
      const visible = hits.filter(hit => hit.alpha > .25), visibleFrames = [...new Set(visible.map(hit => hit.frame))].length;
      const highOpacityDurationMs = visible.at(-1)!.time - visible[0].time, totalDurationMs = hits.at(-1)!.time - hits[0].time;
      const duration = {target, visibleFrames, highOpacityDurationMs: Math.round(highOpacityDurationMs), totalDurationMs: Math.round(totalDurationMs)};
      splashDurations.push(duration);
      assert.ok(visibleFrames >= 2 && highOpacityDurationMs >= 20 && totalDurationMs >= 60, `each staggered splash stays visible across real canvas frames after its own impact: ${JSON.stringify(duration)}`);
      assert.ok(trace.some(p => p.kind === 'spill' && p.source === source && Math.abs(p.x - (34 + (target.reel + .5) * 162)) < .01 && Math.abs(p.y - (48 + (target.row + .5) * 130)) < .01), 'every multiplier target receives visible amber beer as well as foam');
    }
    assert.deepEqual(await snapshot(desktop),playCompleteRound(createSession(naturalInfectionSeed),{kind:'mode',mode:'standard'}),'visual throws consume no RNG or extra money');
    timingEvidence.beerThrows={targets:event.targets,actualBottles:trace.filter(p=>p.kind==='bottle').length,actualImpacts:trace.filter(p=>p.kind==='foam').length,splashDurations};
    await desktop.evaluate(()=>{window.__restoreBeerSpy?.();window.__restoreImageSpy?.();});
    // Replay the identical natural receipt for documentation after its timing and
    // settlement checks have completed, so image encoding cannot distort those checks.
    await reset(desktop, naturalInfectionSeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await desktop.locator('#spin').click();
    const replayed = await snapshot(desktop);
    assert.deepEqual(replayed, committed, 'the screenshot replay starts from the exact same persisted RNG and award');
    await desktop.waitForFunction(source => {
      const modifier = window.__slot.board().modifier;
      return modifier?.kind === 'infectious' && `${modifier.source.reel}:${modifier.source.row}` === source && modifier.progress >= .53 && modifier.progress < .76;
    }, source);
    await shot(desktop, 'desktop-natural-infection-beer');
    await finish(desktop);
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(naturalInfectionSeed), {kind:'mode',mode:'standard'}), 'documentation capture and skipping preserve the same complete receipt');
  });

  const perkSeed = naturalSeed('bonus-perk-upgrades-every-badge', {kind:'buy',bonus:'dorm'}, p => p.upgrades.includes('infectious') && p.cascadeSteps.some(step => step.modifiers.some(event => event.kind === 'infectious')));
  await check('The infection wheel perk guarantees upgraded badges on initial bonus grids and every refill', desktop, async () => {
    await reset(desktop, perkSeed); await observeBonusPresentation(desktop); await observeArtworkAndDrops(desktop); await buy(desktop, 'dorm');
    const begun = await snapshot(desktop), view = begun.presentation!;
    assert.deepEqual(view.upgrades, ['infectious']);
    await assertReadyWheel(desktop, 'dorm', view.upgrades, true);
    await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.animation === 'infectious', undefined, {timeout: 20_000});
    assert.ok(await desktop.evaluate(() => window.__paintedArt?.includes('infectious-upgraded')), 'the bonus board really paints the perk-selected upgraded speaker');
    await shot(desktop, 'desktop-perk-upgraded-emitter');
    let pure = startRound(createSession(perkSeed), {kind:'buy',bonus:'dorm'});
    for (;;) {
      const spin = pure.presentation!;
      assert.ok(spin.upgrades.includes('infectious'));
      for (const step of spin.cascadeSteps) {
        for (const grid of [step.grid, step.refilledGrid].filter(Boolean) as Grid[]) assert.equal(grid.flat().includes('xways'), false, 'the perk never permits a normal badge on a bonus drop or refill');
        assert.equal(step.modifiers.some(event => event.kind === 'xways'), false);
        for (const event of step.modifiers.filter(event => event.kind === 'infectious')) {
          const matches = event.gridAfter!.flatMap((column, reel) => column.flatMap((symbol, row) => symbol === event.symbol ? [{reel, row}] : []));
          assert.deepEqual(event.targets, matches, 'each upgraded reveal infects all its currently visible matching symbols');
        }
      }
      pure = dismissPresentation(pure);
      if (!pure.activeRound) break;
      pure = advanceRound(pure);
    }
    await finish(desktop); await desktop.evaluate(() => window.__restoreImageSpy?.()); assert.deepEqual(await snapshot(desktop), pure);
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
  await check('Centered Extra modal blurs/inerts the game, blocks paid spins and accepts one disclosed quote', desktop, async () => {
    await reset(desktop, extraSeed); await desktop.locator('#spin').click(); await finish(desktop);
    const before = await snapshot(desktop), offer = before.extraSpinOffer!;
    assert.ok(offer && offer.costCents > 0);
    assert.ok(await desktop.locator('#extra-offer').isVisible());
    assert.equal(await desktop.locator('#extra-offer').getAttribute('role'), 'dialog');
    assert.equal(await desktop.locator('#extra-offer').getAttribute('aria-modal'), 'true');
    const modal = await desktop.evaluate(() => {
      const dialog = document.querySelector('.extra-dialog')!.getBoundingClientRect();
      const shell = document.querySelector<HTMLElement>('.game-shell')!;
      return {inert: shell.inert, blur: getComputedStyle(shell).filter, insideInertShell: !!document.getElementById('extra-offer')?.closest('[inert]'), x: dialog.x + dialog.width / 2, y: dialog.y + dialog.height / 2, viewportX: innerWidth / 2, viewportY: innerHeight / 2};
    });
    assert.ok(modal.inert && /blur\([1-9]/.test(modal.blur), `the board remains visible, blurred and inert: ${JSON.stringify(modal)}`);
    assert.equal(modal.insideInertShell, false, 'the modal buttons remain outside the inert game');
    assert.ok(Math.abs(modal.x - modal.viewportX) < 3 && Math.abs(modal.y - modal.viewportY) < 3, `Extra is centered in the viewport: ${JSON.stringify(modal)}`);
    assert.ok(await desktop.locator('#spin').isDisabled());
    assert.match(await desktop.locator('#extra-dismiss').innerText(), /DECLINE|NO, THANKS/i);
    await euro(desktop, '#extra-spin', offer.costCents);
    await euro(desktop, '#extra-price', offer.costCents);
    assert.match(await desktop.locator('#extra-description').innerText(), /RETAINED MULTIPLIERS · NO NEW BONUS/);
    await desktop.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        document.getElementById('spin')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        document.dispatchEvent(new KeyboardEvent('keydown', {code: 'Space', bubbles: true}));
        window.__slot.skip();
      }
    });
    await desktop.waitForTimeout(250);
    assert.deepEqual(await snapshot(desktop), before, 'paid-spin shortcuts and presentation skip cannot dismiss or charge through the offer');
    for (let tab = 0; tab < 4; tab++) {
      await desktop.keyboard.press('Tab');
      assert.ok(await desktop.evaluate(() => !!document.activeElement?.closest('#extra-offer')), 'focus stays inside the mandatory offer');
    }
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
    assert.equal(await desktop.locator('.game-shell').evaluate(element => (element as HTMLElement).inert), false);
    assert.ok(await desktop.locator('#spin').isEnabled(), 'the next paid spin is available only after declining');
  });

  await check('Autoplay stops at a mandatory Extra decision and takes no hidden subsequent debit', desktop, async () => {
    await reset(desktop, extraSeed); await desktop.locator('#settings').click();
    await desktop.locator('#sg-autoplay-count').selectOption('10'); await desktop.locator('[data-action="autoplay"]').click();
    await finish(desktop);
    const offered = await snapshot(desktop);
    assert.ok(offered.extraSpinOffer); paidRound(offered, 20);
    assert.ok(await desktop.locator('#extra-offer').isVisible());
    await desktop.waitForTimeout(1200);
    assert.deepEqual(await snapshot(desktop), offered, 'an unanswered offer freezes the next autoplay debit and RNG draw');
    assert.equal(await desktop.locator('#autoplay.active').count(), 0);
    await declineOffer(desktop);
  });

  const animationSeed = naturalSeed('normal-animation', {kind: 'mode', mode: 'standard'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.cascadeSteps.length <= 4 && p.cascadeSteps.some(step => step.wins.length && step.refilledGrid) && p.cascadeSteps.some(step => step.modifiers.some(event => event.kind === 'bomb' || event.kind === 'xways')) && p.cascadeSteps.some(step => step.index > 0 && step.wins.length && matchingCount(step.resolvedGrid) !== matchingCount(p.initialGrid)));
  await check('Normal animation shows locked euro awards/current match counts; skipping changes no result', desktop, async () => {
    await reset(desktop, animationSeed); await desktop.evaluate(() => {
      window.__slot.setTurbo(false); window.__animationPhases = [];
      const canvas = document.getElementById('reels')!;
      new MutationObserver(() => { const phase = canvas.dataset.animation; if (phase) window.__animationPhases!.push(phase); }).observe(canvas, {attributes: true, attributeFilter: ['data-animation']});
    });
    await observeFormulaAndCount(desktop);
    await observeVisualPhases(desktop);
    await observeArtworkAndDrops(desktop);
    await desktop.locator('#spin').click();
    const animated = (await presentation(desktop))!;
    await desktop.waitForFunction(() => document.getElementById('reels')?.dataset.animation === 'cascade');
    await shot(desktop, 'desktop-cascade');
    await desktop.waitForFunction(() => !window.__slot.busy(), undefined, {timeout: 20_000});
    const phases = await desktop.evaluate(() => window.__animationPhases!);
    for (const phase of ['spin', 'win', 'clear', 'cascade', 'idle']) assert.ok(phases.includes(phase), `${phase} appears in ${JSON.stringify(phases)}`);
    assert.ok(phases.includes('bomb') || phases.includes('xways'));
    await assertFormulasAndCount(desktop, animated, 'en');
    await assertDrops(desktop, animated, 'normal');
    const normalDurations = await phaseDurations(desktop);
    timingEvidence.normalReels = normalDurations;
    for (const [phase, minimum] of [['spin', 1200], ['win', 600], ['cascade', 550]] as const) {
      const observed = normalDurations.filter(item => item.phase === phase);
      assert.ok(observed.length && observed.every(item => item.duration >= minimum), `normal ${phase} remains readable: ${JSON.stringify(observed)}`);
    }
    assert.deepEqual(await presentation(desktop), animated, 'animation leaves the recorded outcome immutable');
    const normal = await snapshot(desktop);
    await reset(desktop, animationSeed); await desktop.locator('#spin').click(); await finish(desktop);
    assert.deepEqual(await snapshot(desktop), normal);
    const fractionalSeed = naturalSeed('fractional-base-award', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.payoutCents < 400 && p.cascadeSteps.length <= 4 && p.wins.some(win => win.payMultiplier === .15 && win.positionMultiplier > 1) && p.cascadeSteps.some(step => step.index > 0 && step.wins.length && matchingCount(step.resolvedGrid) !== matchingCount(p.initialGrid)));
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
    await declineOffer(desktop);
    await desktop.locator('#language').click();
  });

  await check('Turbo keeps real reel stops, wins and cascades readable without changing RNG or settlement', desktop, async () => {
    await reset(desktop, animationSeed); await observeVisualPhases(desktop); await observeArtworkAndDrops(desktop);
    await desktop.locator('#spin').click();
    const view = (await presentation(desktop))!;
    await desktop.waitForFunction(() => !window.__slot.busy(), undefined, {timeout: 20_000});
    const durations = await phaseDurations(desktop);
    timingEvidence.turboReels = durations;
    await assertDrops(desktop, view, 'turbo');
    for (const [phase, minimum] of [['spin', 600], ['win', 230], ['cascade', 330]] as const) {
      const observed = durations.filter(item => item.phase === phase);
      assert.ok(observed.length && observed.every(item => item.duration >= minimum), `turbo ${phase} remains readable: ${JSON.stringify(observed)}`);
    }
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(animationSeed), {kind: 'mode', mode: 'standard'}));
  });

  await check('Autoplay is bounded and stopping completes only the currently running paid round', desktop, async () => {
    await reset(desktop, 116292); await desktop.locator('#settings').click();
    assert.deepEqual(await desktop.locator('#sg-autoplay-count option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), ['10','25','50','100']);
    await desktop.locator('#sg-autoplay-count').selectOption('10'); await desktop.locator('[data-action="autoplay"]').click();
    await desktop.waitForFunction(() => window.__slot.snapshot().roundSequence === 1);
    if (await desktop.locator('#autoplay.active').count()) await desktop.locator('#autoplay').click();
    await finish(desktop); await desktop.waitForTimeout(250);
    paidRound(await snapshot(desktop), 20); assert.equal(await desktop.locator('#autoplay.active').count(), 0);
  });

  await check('Ten autoplay rounds create ten balanced receipts and stop automatically', desktop, async () => {
    await reset(desktop, uninterruptedAutoplaySeed(10)); await desktop.locator('#settings').click();
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

  const specialArtSeed = naturalSeed('landed-wild-and-invitation', {kind:'mode',mode:'standard'}, p => !p.bonusAwarded && p.payoutCents === 0 && p.cascadeSteps.length === 1 && p.cascadeSteps[0].modifiers.length === 0 && p.initialGrid.flat().includes('wild') && p.initialGrid.flat().includes('scatter'));
  await check('Prominent original Wild and invitation artwork appears on a naturally landed desktop board', desktop, async () => {
    await reset(desktop, specialArtSeed); await desktop.evaluate(() => window.__slot.setTurbo(false));
    await desktop.locator('#spin').click();
    await desktop.waitForFunction(() => !window.__slot.busy(), undefined, {timeout: 12_000});
    const view = (await presentation(desktop))!;
    const board = await desktop.evaluate(() => window.__slot.board().grid);
    assert.deepEqual(board, view.initialGrid); assert.ok(board.flat().includes('wild') && board.flat().includes('scatter'));
    assert.deepEqual(await snapshot(desktop), playCompleteRound(createSession(specialArtSeed), {kind:'mode',mode:'standard'}));
    await shot(desktop, 'desktop-wild-invitation-artwork');
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
    await euro(mobile, '#balance', complete.balanceCents); await declineOffer(mobile); await mobile.locator('#settings').tap();
    await mobile.locator('[data-action="language-bg"]').tap(); assert.equal(await mobile.locator('html').getAttribute('lang'), 'bg');
    await mobile.locator('[data-action="close"]').tap(); await euro(mobile, '#balance', complete.balanceCents, 'bg');
    assert.match(await mobile.locator('h1').innerText(), /СТУДЕНТСКИ\s*ГРАД/); await shot(mobile, 'mobile-bulgarian');
  });
  await check('Mobile invitation landing and two-pointer wheel preserve exact bonus awards and touch access', mobile, async () => {
    await reset(mobile, fixtures['buy-friday']); await observeBonusPresentation(mobile); await buy(mobile, 'friday');
    const before = await snapshot(mobile);
    await mobile.waitForFunction(() => document.getElementById('reels')?.dataset.triggerPhase === 'landed', undefined, {timeout: 12_000});
    assert.equal(await mobile.evaluate(() => window.__slot.board().grid.flat().filter(symbol => symbol === 'scatter').length), 4);
    await assertBonusCounter(mobile, CONFIG.bonuses.friday.spins, 'bg', 'friday');
    await shot(mobile, 'mobile-landed-invitations');
    await assertReadyWheel(mobile, 'friday', before.presentation!.upgrades, true, 'mobile');
    await assertBonusCounter(mobile, CONFIG.bonuses.friday.spins - 1, 'bg', 'friday');
    await shot(mobile, 'mobile-bulgarian-bonus-spins');
    await finish(mobile);
    assert.deepEqual(await snapshot(mobile), playCompleteRound(createSession(fixtures['buy-friday']), {kind:'buy',bonus:'friday'}));
    assert.ok(await mobile.locator('#bonus-spin-counter').isHidden());
  });
  await check('Mobile English bonus remaining counter stays prominent while free spins are playing', mobile, async () => {
    await mobile.locator('#settings').tap(); await mobile.locator('[data-action="language-en"]').tap(); await mobile.locator('[data-action="close"]').tap();
    await reset(mobile, fixtures['buy-friday']); await observeBonusPresentation(mobile); await buy(mobile, 'friday');
    const first = (await snapshot(mobile)).presentation!;
    await mobile.waitForFunction(() => document.getElementById('reels')?.dataset.triggerPhase === 'landed');
    await assertBonusCounter(mobile, CONFIG.bonuses.friday.spins, 'en', 'friday');
    await assertReadyWheel(mobile, 'friday', first.upgrades, true, 'mobile-english');
    await assertBonusCounter(mobile, CONFIG.bonuses.friday.spins - 1, 'en', 'friday');
    await noOverflow(mobile); await shot(mobile, 'mobile-english-bonus-spins');
    await finish(mobile);
    assert.deepEqual(await snapshot(mobile), playCompleteRound(createSession(fixtures['buy-friday']), {kind:'buy',bonus:'friday'}));
  });
  await check('Mobile Wild and invitation artwork stays visible within the larger reel board', mobile, async () => {
    await reset(mobile, specialArtSeed); await mobile.locator('#spin').tap();
    await mobile.waitForFunction(() => !window.__slot.busy(), undefined, {timeout: 12_000});
    const board = await mobile.evaluate(() => window.__slot.board().grid);
    assert.ok(board.flat().includes('wild') && board.flat().includes('scatter'));
    assert.deepEqual(await snapshot(mobile), playCompleteRound(createSession(specialArtSeed), {kind:'mode',mode:'standard'}));
    await noOverflow(mobile); await shot(mobile, 'mobile-wild-invitation-artwork');
  });
  await check('No browser errors, broken local assets or external image downloads occur', desktop, async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(externalImages, []);
  });

  const sourceHashes = await browserSourceHashes();
  assert.deepEqual(sourceHashes, initialSourceHashes, 'UI, rules and original artwork must stay frozen throughout the browser validation');
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), configVersion: CONFIG.version, configurationParameters: CONFIG, mathematics: {payingSymbols: PAYING_SYMBOLS, paytable: CONFIG.paytable, payoutDenominator: CONFIG.payoutDenominator, modePrices: CONFIG.prices, buyPrices: CONFIG.buyPrices, luckyDrawPrice: CONFIG.luckyDrawPrice, luckyDrawProbabilities: CONFIG.luckyDrawProbabilities, symbolWeights: CONFIG.symbolWeights, modes: CONFIG.modes, bonuses: CONFIG.bonuses, initialPositionMultipliers: CONFIG.initialPositionMultipliers, payThresholds: CONFIG.payThresholds, capMultiplier: CONFIG.capMultiplier, positionMultiplierLimit: CONFIG.positionMultiplierLimit, extraQuoteDenominator: CONFIG.extraQuoteDenominator}, sourceHashes, timingEvidence, baseURL, browser: browserDescription, viewports: [...desktopViewports.map(({width,height}) => `${width}×${height} desktop`),'390×844 touch mobile'], fixtures, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results, runtimeErrors, failedRequests, externalImages, assets: [...assets], screenshots}, null, 2));
  process.stdout.write(`${results.filter(result => result.passed).length}/${results.length} browser checks passed. Results and screenshots: ${output}\n`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await ownedServer?.close(); }
}
