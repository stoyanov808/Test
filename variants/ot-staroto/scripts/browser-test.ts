import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHTTPServer } from 'node:http';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { CONFIG, PAYLINES, PAYLINE_REFERENCE_READY, TIER_ORDER, TIER_CHARACTERS, acknowledgeRound, costCents, createSession, deserializeSession, evaluate, playFixtureRound, playRound } from '../src/engine';
import type { Cell, Character, Choice, Feature, Grid, Round, Session, Tier } from '../src/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tailOnly = process.argv.includes('--tail-only');
const animationOnly = process.argv.includes('--animation-only');
const output = join(root, 'test-results');
const publishedShots = join(root, 'docs/screenshots');
const shots = join(output, 'v5-2-browser-screenshots');
const authoredFrameCount = 16;
const authoredPoseClockStepMs = 1000 / 240;
const normalSpeedAnimations: { character: Character; seed: number; actionKind: string; observedFrames: number[]; actionSpanMs: number; paintedSamples: number }[] = [];
let authoredFrames: { character: Character; index: number; sx: number; sy: number; width: number; height: number; atlasPath: string; atlasSha256: string; seatAnchorX?: number; seatAnchorY?: number }[] = [];
const require = createRequire(import.meta.url);
const rich = 100_000_000;
const checks: { name: string; details?: unknown }[] = [];
const captures: { file: string; sha256: string; seed: number; choice: Choice; costCents: number; payoutCents: number; maxWin: boolean; note: string }[] = [];
const presentationCaptures: { file: string; sha256: string; viewport: { width: number; height: number } | null; note: string }[] = [];
const failures: string[] = [];
const jsErrors: string[] = [];
const externalRequests: string[] = [];
const productionRequests: string[] = [];
const productionReceipts: { choice: Choice; sequence: number; costCents: number; payoutCents: number; sha256: string; outcome: Round['outcome']; selection: 'fresh-ui-csprng' | 'node-csprng-precommitted-reload' }[] = [];
let productionMultiShooterReplay: { description: string; attemptedFreshSelections: number; ledgerSha256: string; roundSha256: string; expandedReels: number[]; entropyCallsAfterReload: number; paintedPersistence?: { remaining: number; reels: number[]; totals: number[]; ordinaryDescent: unknown[]; paintedFrame: unknown }[] } | undefined;
let paylineReference: { path: string; sha256: string; sourceImplementationSha256: string; paths: number[][] };
let productionBundleHashes: Record<string, string> = {};
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let server: ReturnType<typeof spawn> | undefined;
let serverOutput = '';

function pass(name: string, details?: unknown) {
  checks.push({ name, ...(details === undefined ? {} : { details }) }); console.log(`PASS ${checks.length}: ${name}`);
}
async function port() {
  const socket = createServer(); await new Promise<void>((ok, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', ok); });
  const number = (socket.address() as { port: number }).port;
  await new Promise<void>(ok => socket.close(() => ok())); return number;
}
async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path)); else found.push(path);
  }
  return found;
}
async function sourceHashes() {
  const paths = [...await files(join(root, 'src')), ...await files(join(root, 'public')), join(root, 'package.json'), join(root, 'vite.config.ts'), join(root, 'scripts/standalone.mjs'), join(root, 'docs/research/le-zeus-payline-chart.json'), join(root, 'docs/art/art-validation.json'), fileURLToPath(import.meta.url)].filter(path => !path.endsWith('/README.md'));
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [relative(root, path), sha(await readFile(path))])));
}
type Gate = { stage?: string; kind?: string; character?: Character; min?: number; max?: number; tier?: number; afterSpin?: number; repeated?: boolean; labelPrefix?: string; coinWave?: number; collectionConsumesCollector?: boolean; godShot?: number; inactiveMin?: number; inactiveReel?: number; midDrop?: boolean; characterFrame?: number; activeCastMin?: number; expandedMin?: number; expansionReel?: number; activeLine?: number; columnShot?: boolean; sticky?: boolean; shotIndex?: number; shotSource?: Cell; lockedReel?: number; shooterReel?: number; shooterMin?: number; shooterSticky?: boolean; productionRemaining?: number; productionReels?: number[]; productionTotals?: number[]; productionDrop?: boolean; productionAnimatingShooter?: boolean };
async function probe(context: BrowserContext, productionRuntime = false) {
  const installProbe = () => {
    const w = window as any;
    const wallNow = performance.now.bind(performance); let pausedTime = 0; let p: any;
    Object.defineProperty(performance, 'now', { value: () => p?.poseClock ? p.poseClock.time : (p?.held && p.pausedAt !== null ? p.pausedAt : wallNow()) - pausedTime });
    p = w.__probe = { gate: null, held: false, pausedAt: null, queue: [] as any[], authoredFrameCount: w.__probePoseConfig.authoredFrameCount, middleFrames: w.__probePoseConfig.middleFrames, frames: [] as any[], images: [] as any[], draws: [] as any[], paint: { texts: [] as any[], sprites: [] as any[] }, audioDecodes: [] as any[], audioStarts: [] as any[], entropyCalls: [] as any[] };
    const imageSources = new WeakMap<HTMLImageElement, any>();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value: string) {
      const record: any = { prefix: String(value).slice(0, 65), length: String(value).length, width: 0, height: 0, loaded: false, failed: false, hashing: false };
      imageSources.set(this, record);
      if (String(value).startsWith('data:image/png;base64,')) {
        record.hashing = true;
        const bytes = Uint8Array.from(atob(String(value).slice('data:image/png;base64,'.length)), character => character.charCodeAt(0));
        void crypto.subtle.digest('SHA-256', bytes).then(digest => {
          record.sourceSha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); record.hashing = false;
        }, error => { record.hashError = String(error); record.hashing = false; });
      }
      p.images.push(record);
      this.addEventListener('load', () => { record.loaded = true; record.width = this.naturalWidth; record.height = this.naturalHeight; });
      this.addEventListener('error', () => { record.failed = true; });
      descriptor.set!.call(this, value);
    }});
    const originalClear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof originalClear>) {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') p.paint = { texts: p.paint.texts.filter((text: any) => text.canvas !== this.canvas.id), sprites: p.paint.sprites.filter((sprite: any) => sprite.canvas !== this.canvas.id) };
      return originalClear.apply(this, args);
    };
    const originalText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof originalText>) {
      if (this.canvas.id === 'game') p.paint.texts.push({ canvas: this.canvas.id, text: args[0], x: args[1], y: args[2] });
      return originalText.apply(this, args);
    };
    const canvasClips = new WeakMap<CanvasRenderingContext2D, { active: any[]; stack: any[][]; path: any[] }>();
    const clipState = (context: CanvasRenderingContext2D) => {
      let state = canvasClips.get(context);
      if (!state) { state = { active: [], stack: [], path: [] }; canvasClips.set(context, state); }
      return state;
    };
    const originalSave = CanvasRenderingContext2D.prototype.save;
    CanvasRenderingContext2D.prototype.save = function () {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') { const state = clipState(this); state.stack.push(structuredClone(state.active)); }
      return originalSave.call(this);
    };
    const originalRestore = CanvasRenderingContext2D.prototype.restore;
    CanvasRenderingContext2D.prototype.restore = function () {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') { const state = clipState(this); state.active = state.stack.pop() ?? []; }
      return originalRestore.call(this);
    };
    const originalBeginPath = CanvasRenderingContext2D.prototype.beginPath;
    CanvasRenderingContext2D.prototype.beginPath = function () {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') clipState(this).path = [];
      return originalBeginPath.call(this);
    };
    const originalRect = CanvasRenderingContext2D.prototype.rect;
    CanvasRenderingContext2D.prototype.rect = function (...args: Parameters<typeof originalRect>) {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') {
        const matrix = this.getTransform();
        clipState(this).path.push({ rect: args, matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f } });
      }
      return originalRect.apply(this, args);
    };
    const originalClip = CanvasRenderingContext2D.prototype.clip;
    CanvasRenderingContext2D.prototype.clip = function (this: CanvasRenderingContext2D, ...args: any[]) {
      if (this.canvas.id === 'game' || this.canvas.id === 'character-stage') {
        const state = clipState(this);
        // Record every clip invocation, including a polygon or Path2D whose
        // rectangle list is empty. An empty clip stack must mean no clipping.
        state.active.push({ paths: structuredClone(state.path), opaquePath: args[0] instanceof Path2D });
      }
      return (originalClip as any).apply(this, args);
    } as typeof originalClip;
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: any[]) {
      const img = args[0];
      if (img instanceof HTMLImageElement && p.draws.length < 30000) p.draws.push({ prefix: img.src.slice(0, 100), width: img.naturalWidth, height: img.naturalHeight, loaded: img.complete && img.naturalWidth > 0, crop: args.length === 9 ? args.slice(1, 5) : null, at: performance.now() });
      if ((this.canvas.id === 'game' || this.canvas.id === 'character-stage') && img instanceof HTMLImageElement && args.length === 9) {
        const physicalMatrix = this.getTransform();
        const rectangle = this.canvas.getBoundingClientRect(), gameRectangle = document.getElementById('game')!.getBoundingClientRect();
        const physicalScale = this.canvas.width / rectangle.width, logicalScale = gameRectangle.width / 1240;
        const matrix = { a: physicalMatrix.a / physicalScale / logicalScale, b: physicalMatrix.b / physicalScale / logicalScale, c: physicalMatrix.c / physicalScale / logicalScale, d: physicalMatrix.d / physicalScale / logicalScale,
          e: (rectangle.left + physicalMatrix.e / physicalScale - gameRectangle.left) / logicalScale, f: (rectangle.top + physicalMatrix.f / physicalScale - gameRectangle.top) / logicalScale };
        const destination = args.slice(5, 9);
        const [dx, dy, width, height] = destination;
        const corners = [[dx, dy], [dx + width, dy], [dx, dy + height], [dx + width, dy + height]].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }));
        p.paint.sprites.push({ canvas: this.canvas.id, sourceSha256: imageSources.get(img)?.sourceSha256, crop: args.slice(1, 5), destination, bounds: { left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)) }, clips: structuredClone(clipState(this).active), imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, matrix, physicalMatrix: { a: physicalMatrix.a, b: physicalMatrix.b, c: physicalMatrix.c, d: physicalMatrix.d, e: physicalMatrix.e, f: physicalMatrix.f }, loaded: img.complete && img.naturalWidth > 0 });
      }
      return (originalDraw as any).apply(this, args);
    } as typeof originalDraw;
    const random = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function (this: Crypto, array: any) { const result = (random as any).call(this, array); p.entropyCalls.push({ bytes: array.byteLength, at: performance.now() }); return result; } as typeof Crypto.prototype.getRandomValues;
    const audioPrototype = window.AudioContext?.prototype;
    if (audioPrototype) {
      const decode = audioPrototype.decodeAudioData;
      audioPrototype.decodeAudioData = function (bytes: ArrayBuffer, ...callbacks: any[]) {
        const record: any = { bytes: bytes.byteLength, decoded: false }; p.audioDecodes.push(record);
        const result = (decode as any).call(this, bytes, ...callbacks);
        result.then((buffer: AudioBuffer) => { record.decoded = true; record.duration = buffer.duration; record.channels = buffer.numberOfChannels; record.sampleRate = buffer.sampleRate; }, (error: Error) => { record.error = error.message; });
        return result;
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: any[]) { p.audioStarts.push({ duration: this.buffer?.duration, loop: this.loop, at: performance.now() }); return (start as any).apply(this, args); };
    }
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window); const cancelled = new Set<number>();
    window.cancelAnimationFrame = handle => { cancelled.add(handle); caf(handle); };
    window.requestAnimationFrame = callback => {
      let handle = 0; handle = raf(now => {
      if (cancelled.has(handle)) return;
      if (p.held) { p.queue.push({ callback, now, handle }); return; }
      if (p.poseClock && p.poseClock.nativeFrame !== now) {
        p.poseClock.nativeFrame = now; p.poseClock.time += w.__probePoseConfig.authoredPoseClockStepMs;
      }
      callback(p.poseClock ? p.poseClock.time : now - pausedTime);
      const b = w.__ruse?.board?.();
      if (b && p.frames.length < 6000) p.frames.push({ ...b, at: performance.now(), uiRemaining: document.getElementById('remaining')?.textContent });
      const g = p.gate;
      if (!g) return;
      if (g.productionRemaining !== undefined) {
        p.productionPaintFrames ??= [];
        if (p.productionPaintFrames.length < 600) p.productionPaintFrames.push({ remaining: document.getElementById('remaining')?.textContent, paint: structuredClone(p.paint) });
      }
      const effect = b?.effect;
      const tier = Number(document.getElementById('win-scene')?.dataset.tier ?? 0);
      const firstMoving = b?.movingCells?.find((cell: any) => !cell.stationary);
      const productionPaintMatches = g.productionRemaining === undefined || Number(document.getElementById('remaining')?.textContent) === g.productionRemaining && g.productionReels.every((reel: number, index: number) => {
        const x = 200 + (reel + .5) * 140;
        return p.paint.texts.some((text: any) => text.text === 'REEL TOTAL' && Math.abs(text.x - x) < .01 && text.y > 674)
          && p.paint.texts.some((text: any) => text.text === `×${g.productionTotals[index].toLocaleString('en-IE')}` && Math.abs(text.x - x) < .01 && text.y > 674)
          && p.paint.sprites.some((sprite: any) => sprite.canvas === 'game' && sprite.loaded && (g.productionAnimatingShooter ? p.middleFrames : p.middleFrames.slice(0, 1)).some((frame: any) => frame.crop === sprite.crop.join(',') && frame.sha256 === sprite.sourceSha256) && sprite.matrix.a < 0 && Math.abs(sprite.matrix.e - x) < .01 && Math.abs(sprite.matrix.f - (170 + 126 * 4.06)) < .01);
      }) && (!g.productionDrop || p.paint.sprites.some((sprite: any) => sprite.loaded && sprite.imageWidth === 1254 && sprite.imageHeight === 1254 && sprite.matrix.f > 170 && sprite.matrix.f < 220 && Array.from({ length: 6 }, (_, reel) => reel).filter(reel => !g.productionReels.includes(reel)).some(reel => Math.abs(sprite.matrix.e - (200 + (reel + .5) * 140)) < 8)));
      const match = (!g.stage || b?.stage === g.stage) && (!g.kind || effect?.kind === g.kind) && (!g.character || effect?.character === g.character) && (g.min === undefined || effect?.progress >= g.min) && (g.max === undefined || effect?.progress <= g.max) && (!g.tier || tier === g.tier) && (g.repeated === undefined || effect?.repeated === g.repeated) && (!g.labelPrefix || effect?.label?.startsWith(g.labelPrefix)) && (g.afterSpin === undefined || firstMoving?.sourceRow < 0 && b.remaining <= g.afterSpin) && (g.coinWave === undefined || b?.coinWave === g.coinWave) && (g.collectionConsumesCollector === undefined || !!b?.collection?.sources?.some((coin: any) => coin.kind === 'collector') === g.collectionConsumesCollector) && (g.godShot === undefined || effect?.shot === g.godShot) && (g.inactiveMin === undefined || b?.inactiveWilds?.length >= g.inactiveMin) && (g.inactiveReel === undefined || b?.inactiveWilds?.some((cell: any) => cell.reel === g.inactiveReel)) && (!g.midDrop || b?.movingCells?.some((cell: any) => cell.progress >= .4 && cell.progress <= .8)) && (g.activeCastMin === undefined || b?.activeCharacters?.length >= g.activeCastMin) && (g.characterFrame === undefined || b?.characterFrames?.some((frame: any) => frame.character === g.character && frame.index === g.characterFrame && frame.count === p.authoredFrameCount)) && (g.expandedMin === undefined || b?.expandedReels?.length >= g.expandedMin) && (g.expansionReel === undefined || effect?.source?.reel === g.expansionReel) && (g.activeLine === undefined || b?.activeLine === g.activeLine) && (g.columnShot === undefined || (effect?.boostedReel !== undefined) === g.columnShot) && (g.sticky === undefined || effect?.sticky === g.sticky) && (g.shotIndex === undefined || effect?.shot === g.shotIndex) && (!g.shotSource || effect?.source?.reel === g.shotSource.reel && effect?.source?.row === g.shotSource.row) && (g.lockedReel === undefined || b?.lockedReels?.includes(g.lockedReel)) && (g.shooterMin === undefined || b?.shooterReels?.length >= g.shooterMin) && (g.shooterReel === undefined || b?.shooterReels?.some((reel: any) => reel.reel === g.shooterReel && (g.shooterSticky === undefined || reel.sticky === g.shooterSticky))) && productionPaintMatches;
      if (match) { p.held = true; p.pausedAt = wallNow(); }
      }); return handle;
    };
    p.release = function (keepPoseClock = false) {
      p.gate = null;
      if (p.poseClock && !keepPoseClock) { pausedTime = wallNow() - p.poseClock.time; p.poseClock = null; }
      else if (!p.poseClock && p.held && p.pausedAt !== null) pausedTime += wallNow() - p.pausedAt;
      p.pausedAt = null; p.held = false;
      const queue = p.queue.splice(0); for (const item of queue) if (!cancelled.has(item.handle)) window.requestAnimationFrame(item.callback);
    };
    p.setGate = function (condition: any) {
      p.release(true);
      if (condition.characterFrame !== undefined && !p.poseClock) p.poseClock = { time: wallNow() - pausedTime, nativeFrame: null };
      else if (condition.characterFrame === undefined && p.poseClock) { pausedTime = wallNow() - p.poseClock.time; p.poseClock = null; }
      p.gate = condition;
    };
  };
  // TSX preserves inferred function names in serialized closures with this helper.
  await context.addInitScript({ content: `window.__name = function (target) { return target; }; window.__probePoseConfig = ${JSON.stringify({ authoredFrameCount, authoredPoseClockStepMs, middleFrames: authoredFrames.filter(frame => frame.character === 'middle').map(frame => ({ crop: [frame.sx, frame.sy, frame.width, frame.height].join(','), sha256: frame.atlasSha256 })) })}; (${installProbe.toString()})();` });
  context.on('page', page => {
    page.on('pageerror', error => jsErrors.push(`${productionRuntime ? 'production' : 'dev'}: ${error.message}`));
    page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`${productionRuntime ? 'production' : 'dev'}: ${request.url().slice(0, 200)} ${request.failure()?.errorText}`); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${productionRuntime ? 'production' : 'dev'}: HTTP ${response.status()} ${response.url().slice(0, 200)}`); });
    page.on('request', request => {
      const url = request.url();
      if (productionRuntime && /^https?:/.test(url)) productionRequests.push(url);
      if (/^https?:/.test(url) && !/^http:\/\/127\.0\.0\.1:/.test(url)) externalRequests.push(url);
    });
  });
}
async function ready(page: Page) {
  await page.locator('#game').waitFor();
  await page.waitForFunction(() => { const p = (window as any).__probe; return p.images.length >= 12 && p.images.every((img: any) => (img.loaded || img.failed) && !img.hashing); }, undefined, { timeout: 30000, polling: 50 });
  const assets = await page.evaluate(() => ({ images: (window as any).__probe.images, draws: (window as any).__probe.draws, dom: [...document.images].map(img => ({ complete: img.complete, width: img.naturalWidth })), sceneBackground: getComputedStyle(document.getElementById('game-shell')!).backgroundImage !== 'none' }));
  assert.equal(assets.images.filter((img: any) => img.failed).length, 0, JSON.stringify(assets.images.filter((img: any) => img.failed)));
  assert.ok(assets.images.some((img: any) => img.width === 1672 && img.height === 941 && img.loaded) && assets.sceneBackground, 'The new ink student-club scene is decoded and fills the full-window stage background');
  assert.ok(assets.draws.some((img: any) => img.loaded && img.crop), 'The canvas paints loaded authored sprite crops');
  return assets;
}
async function snapshot(page: Page): Promise<Session & { busy: boolean; displayedBalance: number; language: string; turbo: boolean; selectedXbet: string; spaceHeld: boolean }> {
  return page.evaluate(() => (window as any).__ruse.snapshot());
}
async function reset(page: Page, seed: number) {
  await page.evaluate(({ seed, balance }) => { (window as any).__probe.release(); (window as any).__probe.frames = []; (window as any).__ruse.reset(seed, balance); }, { seed, balance: rich });
  await page.locator('#xbet').selectOption('off');
}
async function gate(page: Page, condition: Gate) {
  await page.evaluate(condition => (window as any).__probe.setGate(condition), condition);
}
async function held(page: Page) {
  try { await page.waitForFunction(() => (window as any).__probe.held, undefined, { timeout: 45000, polling: 40 }); }
  catch (error) {
    await writeFile(join(output, 'gate-failure.json'), JSON.stringify(await page.evaluate(() => {
      const probe = (window as any).__probe;
      return { gate: probe.gate, held: probe.held, board: (window as any).__ruse?.board(), paint: probe.paint, frames: probe.frames.map((frame: any) => ({ at: frame.at, stage: frame.stage, effect: frame.effect, characterFrames: frame.characterFrames })) };
    }), null, 2) + '\n');
    throw error;
  }
}
async function release(page: Page) { await page.evaluate(() => (window as any).__probe.release()); }
async function choose(page: Page, choice: Choice) {
  if (choice.kind === 'buy') { await page.locator('#buy').click(); await page.locator(`.buy-card[data-tier="${choice.tier}"]`).click(); await page.locator('#confirm-play').click(); }
  else if (choice.kind === 'boost') { await page.locator('#xbet').selectOption('boost'); await page.locator('#spin').click(); }
  else if (choice.kind === 'xbet') { await page.locator('#xbet').selectOption(choice.character); await page.locator('#spin').click(); await page.locator('#confirm-play').click(); }
  else if (choice.kind === 'god') { await page.locator('#god').click(); await page.locator('#confirm-play').click(); }
  else { await page.locator('#xbet').selectOption('off'); await page.locator('#spin').click(); }
  await page.waitForFunction(() => (window as any).__ruse.snapshot().busy, undefined, { polling: 20 });
}
async function finish(page: Page, expected: Session, label: string) {
  auditReceipt(expected.pending!);
  await release(page);
  // Skipping presentation cannot alter the committed ledger. A win needs Skip, then Continue.
  await page.evaluate(() => (window as any).__ruse.skip());
  for (let count = 0; count < 5; count++) {
    if (!(await snapshot(page)).busy) break;
    await page.waitForFunction(() => !(window as any).__ruse.snapshot().busy || !!document.getElementById('win-continue'), undefined, { timeout: 180000, polling: 40 });
    if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click();
  }
  await page.waitForFunction(() => !(window as any).__ruse.snapshot().busy, undefined, { timeout: 20000, polling: 40 });
  const actual = await snapshot(page); const { busy, displayedBalance, language, turbo, selectedXbet, spaceHeld, ...session } = actual;
  assert.deepEqual(session, acknowledgeRound(expected), `${label}: full receipt, RNG and credits`);
  assert.equal(displayedBalance, expected.balanceCents);
  const board = await page.evaluate(() => (window as any).__ruse.board()); const final = expected.pending!.spins.at(-1);
  assert.equal(board.totalCents, expected.pending!.payoutCents);
  if (final) {
    assert.deepEqual(board.grid, final.finalGrid); assert.deepEqual(board.wildMultipliers, final.finalWildMultipliers); assert.deepEqual(board.inactiveWilds, final.inactiveWilds); assert.deepEqual(board.marks, final.marks); assert.equal(board.remaining, final.spinsRemainingAfter);
    const inactive = new Set(final.inactiveWilds.map(cell => `${cell.reel}:${cell.row}`));
    const activeGlobal = Math.max(1, final.finalGrid.reduce((sum, column, reel) => sum + column.reduce((subtotal, symbol, row) => subtotal + (symbol === 'wild' && !inactive.has(`${reel}:${row}`) ? final.finalWildMultipliers[reel][row] || 1 : 0), 0), 0));
    assert.equal(board.global, activeGlobal, `${label}: final multiplier reflects active Wilds only`);
  }
  pass(`${label}: exact engine receipt, painted final grid, credits and RNG after skip`, { costCents: expected.pending!.costCents, payoutCents: expected.pending!.payoutCents, finalRng: expected.rngState });
}
async function capture(page: Page, name: string, seed: number, receipt: Round, note: string) {
  const path = join(shots, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  captures.push({ file: `docs/screenshots/${name}.png`, sha256: sha(await readFile(path)), seed, choice: receipt.choice, costCents: receipt.costCents, payoutCents: receipt.payoutCents, maxWin: receipt.maxWin, note });
}
async function presentationCapture(page: Page, name: string, note: string) {
  const path = join(shots, `${name}.png`); await page.screenshot({ path, fullPage: true });
  presentationCaptures.push({ file: `docs/screenshots/${name}.png`, sha256: sha(await readFile(path)), viewport: page.viewportSize(), note });
}
/** Check actual Canvas draw state against the read-only staging description.
 * The path probe records active clips and transformed source-crop corners;
 * inspection alone cannot establish that the painted actor is uncut. */
async function assertCharacterStaging(page: Page, required?: Character) {
  const observed = await page.evaluate(() => {
    const rectangle = (element: Element) => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, width: box.width, height: box.height }; };
    const shell = document.getElementById('game-shell')!;
    const characterCanvas = document.getElementById('character-stage')!;
    return { board: (window as any).__ruse.board(), paint: (window as any).__probe.paint, canvas: rectangle(document.getElementById('game')!), shell: rectangle(shell), characterCanvas: rectangle(characterCanvas), characterPointerEvents: getComputedStyle(characterCanvas).pointerEvents, backgroundSize: getComputedStyle(shell).backgroundSize, backgroundPosition: getComputedStyle(shell).backgroundPosition };
  });
  const staging = observed.board.characterStaging;
  assert.ok(Array.isArray(staging), 'Renderer exposes independent outside-cast staging');
  assert.equal(observed.characterPointerEvents, 'none', 'The separate foreground Canvas cannot intercept game input');
  const scale = observed.canvas.width / 1240;
  const visible = { left: (observed.characterCanvas.left - observed.canvas.left) / scale, top: (observed.characterCanvas.top - observed.canvas.top) / scale,
    right: (observed.characterCanvas.left + observed.characterCanvas.width - observed.canvas.left) / scale, bottom: (observed.characterCanvas.top + observed.characterCanvas.height - observed.canvas.top) / scale };
  for (const edge of ['left', 'right', 'top', 'bottom']) assert.ok(Math.abs(observed.board.characterViewport[edge] - visible[edge as keyof typeof visible]) < .05, 'The exposed character viewport follows the actual independent foreground Canvas bounds');
  if (required) assert.ok(staging.some((actor: any) => actor.character === required), `${required} is independently staged outside the intentional expanded-reel avatars`);
  for (const actor of staging) {
    const frame = authoredFrames.find(frame => frame.character === actor.character && frame.index === actor.index);
    assert.ok(frame, `Actual ${actor.character} source frame ${actor.index} belongs to the 16-pose sheet`);
    const crop = [frame.sx, frame.sy, frame.width, frame.height].join(',');
    const painted = observed.paint.sprites.find((sprite: any) => sprite.canvas === 'character-stage' && sprite.loaded && sprite.sourceSha256 === frame.atlasSha256 && sprite.crop.join(',') === crop && Math.abs(sprite.matrix.e - actor.anchor.x) < .02 && Math.abs(sprite.matrix.f - actor.anchor.y) < .02);
    assert.ok(painted, `Canvas actually paints the independently staged ${actor.character} frame ${actor.index}: ${JSON.stringify({ actor, crops: observed.paint.sprites.filter((sprite: any) => sprite.crop.join(',') === crop) })}`);
    assert.deepEqual(painted.clips, [], `${actor.character} is drawn in the foreground without a board or rail clip`);
    assert.equal(actor.separate, true);
    for (const edge of ['left', 'right', 'top', 'bottom']) assert.ok(Math.abs(painted.bounds[edge] - actor.bounds[edge]) < .02, `The painted ${actor.character} ${edge} bound matches the renderer's fitted staging`);
    assert.equal(actor.canvas, 'character-stage');
    assert.ok(painted.bounds.left >= visible.left - .05 && painted.bounds.right <= visible.right + .05 && painted.bounds.top >= visible.top - .05 && painted.bounds.bottom <= visible.bottom + .05, `${actor.character}'s complete action drawing remains within the actual full-window foreground Canvas`);
    if (actor.character === 'right') {
      assert.equal(typeof frame.seatAnchorX, 'number'); assert.equal(typeof frame.seatAnchorY, 'number');
      const [dx, dy, width, height] = painted.destination;
      const x = dx + frame.seatAnchorX! * width / frame.width, y = dy + frame.seatAnchorY! * height / frame.height;
      const m = painted.matrix;
      const actualPelvis = { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
      assert.ok(Math.hypot(actualPelvis.x - actor.seatContact.x, actualPelvis.y - actor.seatContact.y) < .05, 'The actual Canvas transform places the source drawing pelvis on the speaker top');
    }
  }
  if (staging.some((actor: any) => actor.character === 'right')) {
    const right = staging.find((actor: any) => actor.character === 'right');
    const seat = right.speakerSeat;
    assert.ok(seat, 'LUX stays attached to the speaker already painted in the original background');
    assert.deepEqual(seat.source, { x: 1394, y: 406 });
    assert.equal(seat.originalBackground, true);
    assert.ok(Math.hypot(right.seatContact.x - seat.contact.x, right.seatContact.y - seat.contact.y) < .05, 'The separately animated LUX pelvis stays on the original speaker top');
    if (seat.relocated) {
      const sourceWindow = seat.sourceWindow;
      assert.deepEqual(sourceWindow, { x: 1318, y: 390, width: 266, height: 425 });
      assert.ok(observed.paint.sprites.some((sprite: any) => sprite.loaded && sprite.imageWidth === 1672 && sprite.imageHeight === 941 && sprite.crop.join(',') === [sourceWindow.x, sourceWindow.y, sourceWindow.width, sourceWindow.height].join(',')), 'Portrait paints the same original background speaker crop underneath LUX');
      const scale = (seat.speakerBounds.right - seat.speakerBounds.left) / sourceWindow.width;
      assert.ok(Math.hypot(seat.contact.x - (seat.speakerBounds.left + (1394 - sourceWindow.x) * scale), seat.contact.y - (seat.speakerBounds.top + (406 - sourceWindow.y) * scale)) < .05, 'The portrait seat follows the original top point in the relocated original speaker crop');
    } else {
      assert.ok(observed.backgroundSize.split(',').every((size: string) => size.trim() === 'cover'), 'Every scene background layer uses the same cover sizing');
      assert.ok(observed.backgroundPosition.split(',').every((position: string) => position.trim() === '50% 50%'), 'Every scene background layer centers the original illustration');
      const cover = Math.max(observed.shell.width / 1672, observed.shell.height / 941);
      const screen = { x: observed.shell.left + (observed.shell.width - 1672 * cover) / 2 + 1394 * cover, y: observed.shell.top + (observed.shell.height - 941 * cover) / 2 + 406 * cover };
      const logical = { x: (screen.x - observed.canvas.left) * 1240 / observed.canvas.width, y: (screen.y - observed.canvas.top) * 900 / observed.canvas.height };
      assert.ok(Math.hypot(seat.contact.x - logical.x, seat.contact.y - logical.y) < .05, 'The desktop seat follows the actual CSS cover projection of the existing background speaker');
    }
  }
  return { staging, speakerSeat: staging.find((actor: any) => actor.character === 'right')?.speakerSeat ?? null };
}
async function assertPaintedCharacterFrame(page: Page, character: Character, index: number) {
  const source = authoredFrames.find(frame => frame.character === character && frame.index === index)!;
  const crops = await page.evaluate(() => (window as any).__probe.paint.sprites.filter((sprite: any) => sprite.loaded).map((sprite: any) => ({ crop: sprite.crop.join(','), sha256: sprite.sourceSha256 })));
  assert.ok(crops.some((painted: any) => painted.crop === [source.sx, source.sy, source.width, source.height].join(',') && painted.sha256 === source.atlasSha256), `The current Canvas paint actually draws ${character} authored frame ${index} from its SHA-verified source atlas, independently of the inspection frame counter`);
}
async function recordNormalSpeedAnimation(page: Page, character: Character, seed: number, actionKind: string) {
  const sampled = await page.evaluate(({ character, actionKind }) => {
    const probe = (window as any).__probe;
    return { controlled: !!probe.poseClock, frames: probe.frames.filter((frame: any) => frame.effect?.character === character && frame.effect.kind === actionKind).map((frame: any) => ({ at: frame.at, index: frame.characterFrames.find((pose: any) => pose.character === character)?.index })) };
  }, { character, actionKind });
  assert.equal(sampled.controlled, false, 'Natural-speed action evidence uses the native browser clock');
  assert.ok(sampled.frames.length >= 2, 'The natural-speed actor action has several genuinely painted samples');
  normalSpeedAnimations.push({ character, seed, actionKind, observedFrames: [...new Set<number>(sampled.frames.map((frame: any) => frame.index))].sort((a, b) => a - b), actionSpanMs: sampled.frames.at(-1).at - sampled.frames[0].at, paintedSamples: sampled.frames.length });
}
function expected(seed: number, choice: Choice) { return playFixtureRound(createSession(seed, rich), choice); }
function find(choice: Choice, predicate: (round: Round) => boolean, limit = 3000) {
  for (let seed = 1; seed <= limit; seed++) { const session = expected(seed, choice); if (predicate(session.pending!)) return { seed, session }; }
  throw new Error(`No honest fixture found for ${JSON.stringify(choice)} within ${limit} seeds`);
}
function features(round: Round): Feature[] { return round.spins.flatMap(spin => spin.cascades.flatMap(cascade => cascade.features)); }
const cellKey = (cell: Cell) => `${cell.reel}:${cell.row}`;
const cellKeys = (cells: Cell[]) => cells.map(cellKey).sort();
function expansions(round: Round) { return features(round).filter(feature => feature.character === 'middle' && feature.phase === 'expand'); }
function shotFeatures(round: Round) { return features(round).filter(feature => feature.character === 'middle' && feature.phase === 'shots'); }
/** Independent structural checks use the displayed path, not the evaluator's
 * result, to detect a skipped reel, duplicate line, or uncovered marked cell. */
function auditReceipt(round: Round) {
  for (let index = 1; index < round.spins.length; index++) {
    const previous = round.spins[index - 1], spin = round.spins[index];
    if (!previous.tier || !spin.tier) continue;
    for (const reel of previous.finalExpandedReels) {
      assert.ok(spin.initialExpandedReels.includes(reel), 'Every bonus Shooter stays expanded on the next free spin without requiring a follow-up hit');
      assert.ok(spin.initialGrid[reel].every(symbol => symbol === 'wild'));
      assert.deepEqual(spin.initialWildMultipliers[reel], previous.finalWildMultipliers[reel], 'The full retained reel carries the last recorded values into the next free spin');
    }
  }
  for (const spin of round.spins) for (const cascade of spin.cascades) {
    assert.equal(new Set(cascade.wins.map(win => win.line)).size, cascade.wins.length, 'A payline awards only its longest run once per batch');
    const inactive = new Set(cascade.inactiveWilds.map(cellKey));
    for (const win of cascade.wins) {
      const path = PAYLINES[win.line - 1]; assert.ok(path);
      assert.ok(win.count >= 3 && win.count <= 6); assert.equal(win.cells.length, win.count);
      assert.deepEqual(win.cells, path.slice(0, win.count).map((row, reel) => ({ reel, row })), 'Winning paths start at the leftmost reel without gaps');
      const values = win.cells.map(cell => cascade.resolvedGrid[cell.reel][cell.row]);
      assert.ok(values.every((value, index) => value === win.symbol || value === 'wild' && !inactive.has(cellKey(win.cells[index]))));
      if (win.symbol === 'wild') { assert.equal(win.count, 6); assert.equal(win.baseMultiplier, CONFIG.wildLinePay); }
      else {
        assert.ok(values.includes(win.symbol), 'Substitution awards a real matching regular symbol');
        assert.equal(win.baseMultiplier, CONFIG.paytable[win.symbol][win.count as 3 | 4 | 5 | 6]);
      }
      if (win.count < 6) {
        const cell = { reel: win.count, row: path[win.count] }, value = cascade.resolvedGrid[cell.reel][cell.row];
        assert.ok(value !== win.symbol && (value !== 'wild' || inactive.has(cellKey(cell))), 'A shorter award cannot coexist with an uncounted continuing match');
      }
    }
    const removable = cascade.wins.flatMap(win => win.cells).filter(cell => !cascade.stickyWilds[cell.reel][cell.row]);
    assert.deepEqual(cellKeys(cascade.removed), [...new Set(removable.map(cellKey))].sort(), 'Shared payline cells clear once, and sticky Wilds stay');
    let previousGrid = cascade.grid.map(column => [...column]);
    let previousMultipliers = cascade.wildMultipliers.map(column => [...column]);
    const stickyShooterReels = new Set<number>(spin.tier ? spin.initialExpandedReels : []);
    const initialExpansions = cascade.features.filter(feature => feature.phase === 'expand');
    const firstShots = cascade.features.findIndex(feature => feature.phase === 'shots');
    if (firstShots >= 0) assert.ok(initialExpansions.every(feature => cascade.features.indexOf(feature) < firstShots), 'All dropped Shooters expand before any optional shots');
    for (const feature of cascade.features) {
      if (feature.character === 'middle' && feature.phase === 'expand') {
        assert.equal(feature.expandedReel, feature.source.reel);
        assert.ok(feature.expansionMultiplier && feature.expansionMultiplier >= 1);
        assert.deepEqual(feature.targets, Array.from({ length: 5 }, (_, row) => ({ reel: feature.source.reel, row })));
        assert.deepEqual(feature.hits.map(hit => hit.cell), feature.targets);
        for (const hit of feature.hits) { assert.equal(feature.gridAfter[hit.cell.reel][hit.cell.row], 'wild'); assert.equal(feature.wildMultipliersAfter[hit.cell.reel][hit.cell.row], hit.multiplier); }
        if (spin.tier) {
          stickyShooterReels.add(feature.source.reel);
          for (const hit of feature.hits) assert.ok(cascade.stickyWilds[hit.cell.reel][hit.cell.row] >= hit.multiplier, 'Bonus expansion itself makes every row sticky, independently of optional shots');
        }
        assert.equal(feature.coins.length, 0);
      }
      if (feature.phase === 'shots') {
        assert.equal(feature.character, 'middle'); assert.ok((feature.shotEvents?.length ?? 0) >= 1 && feature.shotEvents!.length <= 3);
        assert.deepEqual(feature.targets, feature.shotEvents!.map(shot => shot.target));
        assert.deepEqual(feature.hits, feature.shotEvents!.flatMap(shot => shot.hits));
        for (const shot of feature.shotEvents!) {
          const value = previousGrid[shot.target.reel][shot.target.row];
          assert.ok(value === 'wild' || Object.hasOwn(CONFIG.paytable, value), 'Shots target dealt regular symbols or Wilds');
          if (shot.expandedReel !== undefined) {
            assert.equal(shot.expandedReel, shot.target.reel); assert.ok(cascade.expandedReels.includes(shot.expandedReel));
            assert.deepEqual(shot.hits.map(hit => hit.cell), Array.from({ length: 5 }, (_, row) => ({ reel: shot.expandedReel!, row })));
            assert.equal(shot.sticky, !!spin.tier);
          } else { assert.equal(shot.hits.length, 1); assert.deepEqual(shot.hits[0].cell, shot.target); assert.equal(shot.sticky, false); }
          for (const hit of shot.hits) {
            const wasWild = previousGrid[hit.cell.reel][hit.cell.row] === 'wild';
            assert.equal(hit.repeated, wasWild);
            assert.equal(hit.multiplier, wasWild ? (previousMultipliers[hit.cell.reel][hit.cell.row] || 1) * 2 : 1);
            previousGrid[hit.cell.reel][hit.cell.row] = 'wild'; previousMultipliers[hit.cell.reel][hit.cell.row] = hit.multiplier;
            if (shot.sticky) { stickyShooterReels.add(hit.cell.reel); assert.ok(cascade.stickyWilds[hit.cell.reel][hit.cell.row] >= hit.multiplier, 'Later recorded shots can further double a sticky Wild'); }
          }
        }
        assert.deepEqual(previousGrid, feature.gridAfter); assert.deepEqual(previousMultipliers, feature.wildMultipliersAfter);
      }
      if (feature.character === 'right') {
        for (const wave of feature.coinWaves) {
          assert.ok(wave.coins.every(coin => coin.kind !== 'empty'));
          assert.equal(new Set([...wave.existingCollectors, ...wave.coins].map(coin => cellKey(coin.cell))).size, feature.targets.length);
          assert.deepEqual(cellKeys([...wave.existingCollectors, ...wave.coins].map(coin => coin.cell)), cellKeys(feature.targets), 'Every marked cell reveals a coin or effect, including each repeat');
        }
      }
      previousGrid = feature.gridAfter.map(column => [...column]); previousMultipliers = feature.wildMultipliersAfter.map(column => [...column]);
    }
    for (const reel of stickyShooterReels) for (let row = 0; row < 5; row++) {
      assert.equal(cascade.resolvedGrid[reel][row], 'wild');
      assert.equal(cascade.stickyWilds[reel][row], cascade.resolvedWildMultipliers[reel][row], 'The whole expanded bonus reel retains its final recorded multiplier after all subsequent features');
    }
  }
}
function shooterIdentity(board: any, reel: number, sticky: boolean) {
  const displayed = board.shooterReels.find((record: any) => record.reel === reel);
  assert.ok(displayed, `Reel ${reel + 1} keeps its visible Shooter identity`);
  assert.equal(displayed.character, 'middle'); assert.equal(displayed.avatarVisible, true);
  assert.equal(displayed.sticky, sticky); assert.equal(displayed.multiplierRow, 4, 'The retained total sits in the last row of its own reel');
  assert.deepEqual(displayed.cellMultipliers, board.wildMultipliers[reel]);
  assert.equal(displayed.totalMultiplier, board.wildMultipliers[reel].reduce((sum: number, value: number) => sum + value, 0), 'The displayed reel total sums all five retained values, including temporarily spent Wilds');
  assert.deepEqual(displayed.inactiveRows, board.inactiveWilds.filter((cell: Cell) => cell.reel === reel).map((cell: Cell) => cell.row).sort((a: number, b: number) => a - b));
  return displayed;
}
function lineBoundaryChecks() {
  const grid = (): Grid => Array.from({ length: 6 }, () => Array(5).fill('cash'));
  const multipliers = Array.from({ length: 6 }, () => Array(5).fill(0));
  const line = [0, 0, 0, 0, 0, 0];
  let board = grid(); for (let reel = 0; reel < 6; reel++) board[reel][0] = 'bottle';
  let wins = evaluate(board, multipliers, 100, undefined, [], [line]);
  assert.equal(wins.length, 1); assert.equal(wins[0].count, 6); assert.equal(wins[0].payoutCents, Math.round(100 * CONFIG.paytable.bottle[6]));
  board[3][0] = 'cash'; wins = evaluate(board, multipliers, 100, undefined, [], [line]);
  assert.equal(wins.length, 1); assert.equal(wins[0].count, 3);
  board[1][0] = 'cash'; assert.deepEqual(evaluate(board, multipliers, 100, undefined, [], [line]), []);
  board = grid(); for (let reel = 1; reel < 6; reel++) board[reel][0] = 'bottle';
  assert.deepEqual(evaluate(board, multipliers, 100, undefined, [], [line]), [], 'Right-only matches do not pay');
  board = grid(); for (let reel = 0; reel < 6; reel++) { board[reel][0] = 'wild'; multipliers[reel][0] = 1; }
  wins = evaluate(board, multipliers, 100, undefined, [], [line]);
  assert.equal(wins.length, 1); assert.equal(wins[0].symbol, 'wild'); assert.equal(wins[0].payoutCents, 100 * CONFIG.wildLinePay * 6);
  board[3][0] = 'scatter'; assert.deepEqual(evaluate(board, multipliers, 100, undefined, [], [line]), [], 'Three Wilds alone do not pay several regular-symbol awards');
  pass('Fixed lines pay one longest left-to-right run, stop at a gap, reject right-only runs and award six Wilds once');
}

async function animationDevelopment(page: Page, url: string) {
  await page.goto(url); await ready(page); await page.waitForFunction(() => !!(window as any).__ruse);
  for (const character of ['left', 'middle', 'right'] as Character[]) {
    const fixture = find({ kind: 'xbet', character }, round => features(round).some(feature => feature.character === character && (character === 'left' ? feature.hits.length > 0 : character === 'middle' ? feature.phase === 'expand' : feature.coinWaves.some(wave => wave.coins.length > 0))));
    const kind = character === 'left' ? 'wild' : character === 'middle' ? 'expansion' : 'coin';
    await reset(page, fixture.seed); await gate(page, { kind, character, min: .9, max: .985 }); await choose(page, { kind: 'xbet', character }); await held(page);
    await recordNormalSpeedAnimation(page, character, fixture.seed, kind);
    pass(`Diagnostic ${character}: actual native-clock action history is recorded separately from controlled pose screenshots`, normalSpeedAnimations.at(-1));
    await finish(page, fixture.session, `Diagnostic native-clock ${character} action`);
    await reset(page, fixture.seed); await gate(page, { kind, character, characterFrame: 0 }); await choose(page, { kind: 'xbet', character });
    for (let index = 0; index < authoredFrameCount; index++) {
      if (index) await gate(page, { kind, character, characterFrame: index });
      await held(page); await assertPaintedCharacterFrame(page, character, index); await assertCharacterStaging(page, character === 'middle' ? undefined : character);
      if ([0, 8, 15].includes(index)) await capture(page, `animation-diagnostic-${character}-${index}`, fixture.seed, fixture.session.pending!, 'Diagnostic actual Canvas pose; unpublished until a complete release browser run passes.');
    }
    pass(`Diagnostic ${character}: all 16 source poses paint independently with fitted staging`);
    await finish(page, fixture.session, `Diagnostic ${character} animation`);
  }
  const seed = 37, session = expected(seed, { kind: 'buy', tier: 'old' });
  await reset(page, seed); await gate(page, { stage: 'drop', midDrop: true, activeCastMin: 3 }); await choose(page, { kind: 'buy', tier: 'old' }); await held(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1920, height: 800 }, { width: 400, height: 840 }, { width: 320, height: 720 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(120);
    const cast = await assertCharacterStaging(page, 'right');
    assert.deepEqual(cast.staging.map((actor: any) => actor.character).sort(), ['left', 'middle', 'right']);
    assert.ok(cast.staging.every((actor: any) => actor.scale > .05));
    pass(`Diagnostic ${viewport.width}×${viewport.height}: all three separately painted actors stay visible and LUX is seated`, cast);
    await capture(page, `animation-diagnostic-seat-${viewport.width}x${viewport.height}`, seed, session.pending!, 'Diagnostic source speaker contact and outside-cast draw bounds; this run does not publish release validation.');
  }
  await finish(page, session, 'Diagnostic responsive cast');
}

async function development(page: Page, url: string) {
  await page.goto(url); const assets = await ready(page);
  await page.waitForFunction(() => !!(window as any).__ruse);
  lineBoundaryChecks();
  await presentationCapture(page, 'base', 'Fresh base game and integrated HUD on the desktop viewport.');
  pass('Canvas loads the authored symbols, three sixteen-frame characters and the new ink student-club background', { assets: assets.images.length, successfulImages: assets.images.filter((img: any) => img.loaded).length });
  const canvas = page.locator('#game'); const box = (await canvas.boundingBox())!;
  assert.ok(box.width > 750 && box.height > 500, 'Desktop reel stage occupies the display');
  const before = await canvas.screenshot();
  for (let reel = 0; reel < 6; reel++) for (let row = 0; row < 5; row++) await page.mouse.move(box.x + (200 + (reel + .5) * 140) / 1240 * box.width, box.y + (170 + (row + .5) * 126) / 900 * box.height);
  const after = await canvas.screenshot(); assert.equal(sha(after), sha(before));
  assert.equal(await canvas.getAttribute('title'), null); assert.equal(await canvas.evaluate(el => getComputedStyle(el).cursor), 'default');
  pass('All 30 grid boxes are non-hoverable: no pixel changes, title or pointer cursor');
  await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'), 'en'); assert.equal(await page.locator('#balance-label').textContent(), 'BALANCE');
  assert.match((await page.locator('#balance').textContent())!, /€10,000\.00/);
  await page.reload(); await ready(page); assert.equal((await snapshot(page)).language, 'en');
  await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'), 'bg'); assert.match((await page.locator('#balance').textContent())!, /€/);
  pass('BG / EN setting persists across reload and all displayed credits use EUR');
  await page.locator('#rules').click();
  const bulgarianRules = await page.locator('.rules-copy').textContent();
  assert.match(bulgarianRules!, /всеки разгънат Wild барабан остава лепкав до края на бонуса още от разгръщането/);
  assert.match(bulgarianRules!, /Героят остава върху осветения барабан/);
  assert.match(bulgarianRules!, /табелката на последния ред показва сумата от всичките му пет множителя, включително почиващите Wild/);
  const displayedLines = await page.locator('.payline-diagram').evaluateAll(elements => elements.map(element => {
    const cells = [...element.querySelectorAll<SVGRectElement>('rect.line-cell')];
    const columns = [...new Set(cells.map(cell => cell.x.baseVal.value))].sort((a, b) => a - b);
    const rows = [...new Set(cells.map(cell => cell.y.baseVal.value))].sort((a, b) => a - b);
    return { line: Number((element as HTMLElement).dataset.payline), label: element.querySelector('svg')?.getAttribute('aria-label'), points: element.querySelector('polyline')?.getAttribute('points'), cellCount: cells.length, active: cells.filter(cell => cell.classList.contains('active')).map(cell => ({ reel: columns.indexOf(cell.x.baseVal.value), row: rows.indexOf(cell.y.baseVal.value), x: cell.x.baseVal.value + cell.width.baseVal.value / 2, y: cell.y.baseVal.value + cell.height.baseVal.value / 2 })) };
  }));
  assert.equal(displayedLines.length, PAYLINES.length);
  for (const [index, diagram] of displayedLines.entries()) {
    assert.equal(diagram.line, index + 1); assert.ok(diagram.label?.endsWith(PAYLINES[index].map(row => row + 1).join(', ')));
    assert.equal(diagram.cellCount, 30);
    assert.deepEqual(diagram.active.map(cell => ({ reel: cell.reel, row: cell.row })), PAYLINES[index].map((row, reel) => ({ reel, row })));
    assert.equal(diagram.points, diagram.active.map(cell => `${cell.x},${cell.y}`).join(' '));
  }
  await page.locator('.payline-section').scrollIntoViewIfNeeded();
  await presentationCapture(page, 'exact-payline-chart', 'The supplied and verified fixed-payline chart is shown in the rules; each path uses the same centralized rows as paid receipts.');
  pass('Rules display every verified fixed payline in its exact order and six-row path', { count: PAYLINES.length, rows: PAYLINES });
  await page.locator('#dialog-close').click();
  await page.locator('#language').click(); await page.locator('#rules').click();
  const englishRules = await page.locator('.rules-copy').textContent();
  assert.match(englishRules!, /every expanded Wild reel stays sticky from the moment it expands until the bonus ends; no shot is needed/);
  assert.match(englishRules!, /The Shooter remains on the highlighted reel/);
  assert.match(englishRules!, /last-row plate shows the sum of all five retained cell multipliers, including resting Wilds/);
  pass('BG and EN rules both explain immediate bonus stickiness, the persistent character and the retained five-row total in the last row');
  await page.locator('#dialog-close').click(); await page.locator('#language').click();

  const legacyWallet = JSON.stringify({ version: 4, balanceCents: 1234567, betCents: 50, rngState: 43, sequence: 0, pending: null, history: [] });
  await page.evaluate(raw => { localStorage.setItem('ot-staroto-session-v4', raw); localStorage.removeItem('ot-staroto-session-v5'); }, legacyWallet);
  await page.reload(); await ready(page);
  const migrated = await snapshot(page); assert.equal(migrated.version, 5); assert.equal(migrated.balanceCents, 1234567); assert.equal(migrated.betCents, 50); assert.equal(migrated.sequence, 0); assert.equal(migrated.pending, null); assert.deepEqual(migrated.history, []);
  assert.equal(await page.evaluate(() => localStorage.getItem('ot-staroto-session-v4')), legacyWallet);
  await page.reload(); await ready(page); assert.equal((await snapshot(page)).balanceCents, migrated.balanceCents); assert.equal((await snapshot(page)).rngState, migrated.rngState);
  pass('V4 settled wallet migrates once into V5 with the same credits and stake; original V4 bytes remain intact');
  const legacyPending = JSON.stringify({ ...JSON.parse(legacyWallet), pending: { id: 'preserved-v4-round', costCents: 1500, payoutCents: 420 } });
  await page.evaluate(raw => { localStorage.setItem('ot-staroto-session-v4', raw); localStorage.removeItem('ot-staroto-session-v5'); }, legacyPending);
  await page.reload(); await ready(page);
  assert.equal((await snapshot(page)).version, 5); assert.equal((await snapshot(page)).balanceCents, 1_000_000); assert.equal((await snapshot(page)).pending, null);
  assert.equal(await page.evaluate(() => localStorage.getItem('ot-staroto-session-v4')), legacyPending);
  assert.match((await page.locator('#toast').textContent())!, /Незавършеният|unfinished/i);
  pass('An unfinished V4 receipt remains byte-for-byte intact; V5 starts a separate ledger rather than reinterpreting old mathematics');
  await reset(page, 42);
  await page.locator('#turbo').click(); assert.equal((await snapshot(page)).turbo, true);

  if (!tailOnly) {
  for (const focusSpin of [false, true]) {
    await reset(page, 42); await page.keyboard.up('Space');
    if (focusSpin) await page.locator('#spin').focus(); else await page.locator('#game').focus();
    const one = expected(42, { kind: 'spin' }); await gate(page, { stage: 'drop' });
    await page.keyboard.down('Space'); await held(page);
    for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
    assert.equal((await snapshot(page)).sequence, 1); assert.deepEqual((await snapshot(page)).pending, one.pending);
    const pausedBoard = await page.evaluate(() => (window as any).__ruse.board());
    await page.locator('#game').evaluate(element => { for (let repeat = 0; repeat < 100; repeat++) element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await page.locator('#game').click({ clickCount: 5 });
    assert.deepEqual(await page.evaluate(() => (window as any).__ruse.board()), pausedBoard, 'Trusted pointer clicks cannot finish or advance the active drop');
    assert.equal((await snapshot(page)).busy, true); assert.deepEqual((await snapshot(page)).pending, one.pending);
    await finish(page, one, `Held Space ${focusSpin ? 'on focused Spin button' : 'on game surface'}`);
    for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
    await page.locator('#game').evaluate(element => { for (let repeat = 0; repeat < 100; repeat++) element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await page.locator('#game').click({ clickCount: 5 });
    assert.equal((await snapshot(page)).sequence, 1); assert.equal((await snapshot(page)).pending, null); assert.equal((await snapshot(page)).balanceCents, one.balanceCents);
    pass(`Holding Space ${focusSpin ? 'on focused Spin' : 'over the game'} through 200 repeats and settlement creates only one paid round; 210 board clicks, including trusted pointer clicks, cannot skip or spin`);
    await page.keyboard.up('Space'); await page.locator('#game').focus(); await gate(page, { stage: 'drop' }); await page.keyboard.down('Space'); await held(page);
    const second = playFixtureRound(acknowledgeRound(one), { kind: 'spin' }); assert.deepEqual((await snapshot(page)).pending, second.pending);
    await page.keyboard.up('Space'); await finish(page, second, 'Fresh released Space starts exactly one further round');
  }
  await reset(page, 42); await page.keyboard.up('Space'); await page.locator('#buy').click();
  await page.locator('.buy-card[data-tier="ruse"]').focus(); await page.keyboard.down('Space');
  await page.locator('#confirm-play').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('game-shell')!).filter.includes('blur(5px)'));
  const confirmationFilters = await page.evaluate(() => ({ shell: getComputedStyle(document.getElementById('game-shell')!).filter, backdrop: getComputedStyle(document.querySelector('dialog[open]')!, '::backdrop').backdropFilter }));
  assert.match(confirmationFilters.shell, /blur\(5px\)/); assert.match(confirmationFilters.backdrop, /blur\(3px\)/);
  pass('Purchase confirmation retains the intended board and backdrop blur', confirmationFilters);
  for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
  assert.equal((await snapshot(page)).sequence, 0); assert.equal((await snapshot(page)).pending, null);
  pass('Holding Space on a bonus card cannot carry through its newly opened confirmation or purchase the bonus');
  await page.keyboard.up('Space'); await page.locator('#confirm-play').focus(); await gate(page, { kind: 'scatter' }); await page.keyboard.down('Space'); await held(page);
  for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
  const keyboardBuy = expected(42, { kind: 'buy', tier: 'ruse' }); assert.deepEqual((await snapshot(page)).pending, keyboardBuy.pending); assert.equal((await snapshot(page)).sequence, 1);
  await finish(page, keyboardBuy, 'Deliberate keyboard-confirmed purchase');
  for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
  assert.equal((await snapshot(page)).sequence, 1); assert.equal((await snapshot(page)).pending, null);
  await page.keyboard.up('Space');
  pass('A separate Space press confirms one bonus; held repeats cannot buy or start another round after its win dialog');

  const doubleClick = expected(42, { kind: 'spin' }); await reset(page, 42); await gate(page, { stage: 'drop' });
  await page.locator('#spin').click({ clickCount: 2 }); await held(page);
  assert.deepEqual((await snapshot(page)).pending, doubleClick.pending);
  pass('Two immediate Spin clicks create one committed round and one debit');
  await finish(page, doubleClick, 'Rapid double-click spin');

  const boost = find({ kind: 'boost' }, round => !!round.triggerTier);
  await reset(page, boost.seed); await page.locator('#xbet').selectOption('boost');
  assert.match((await page.locator('#xbet-hint').textContent())!, /5[×x]|5.*(ШАНС|chance)/i);
  assert.match((await page.locator('#round-cost').textContent())!, /0[,\.]60/);
  await gate(page, { kind: 'scatter', min: .08, max: .9 }); await page.locator('#spin').click();
  assert.equal(await page.locator('#confirm-play').count(), 0, 'Selected bonus boost applies immediately to this new paid spin');
  await held(page);
  assert.deepEqual((await snapshot(page)).pending, boost.session.pending); assert.equal(boost.session.pending!.costCents, 60);
  assert.ok(boost.session.pending!.triggerTier); assert.equal((await snapshot(page)).displayedBalance, rich - 60);
  pass('Bonus-chance xBet visibly prices the spin at 3× and its real recorded Scatters award a bonus; advertised trigger chance is 5×', { seed: boost.seed, costCents: 60, tier: boost.session.pending!.triggerTier });
  await capture(page, 'bonus-chance-boost', boost.seed, boost.session.pending!, 'The 3×-cost / 5×-bonus-chance xBet mode stages the honest recorded bonus trigger.');
  await finish(page, boost.session, 'Bonus-chance xBet');

  for (const character of ['left', 'middle', 'right'] as Character[]) {
    const fixture = find({ kind: 'xbet', character }, round => features(round).some(f => f.character === character && (character !== 'right' || f.coinWaves.some(wave => wave.coins.some(coin => coin.kind === 'value')))));
    await reset(page, fixture.seed); await gate(page, { kind: 'reveal', character, min: .12, max: .8 });
    await choose(page, { kind: 'xbet', character }); await held(page);
    const pending = (await snapshot(page)).pending!;
    assert.deepEqual(pending, fixture.session.pending); assert.ok(pending.spins[0].initialGrid.flat().includes(character));
    assert.equal((await snapshot(page)).displayedBalance, rich - costCents(20, { kind: 'xbet', character }));
    pass(`${character} xBet guarantees its badge, charges its own configured price and reveals before acting`);
    const revealStaging = await assertCharacterStaging(page, character);
    pass(`${character} paints its enlarged independent reveal drawing without a board clip${character === 'right' ? ' and stays seated on the original background speaker' : ''}`, revealStaging);
    if (character === 'left') {
      const frames = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.stage === 'drop' && frame.movingCells.length === 30));
      assert.ok(frames.length >= 10, 'Actual painted descent has observable independent frames');
      const planned = frames[0].movingCells;
      assert.ok(new Set(planned.map((cell: any) => cell.start)).size > 10); assert.ok(new Set(planned.map((cell: any) => cell.flight)).size > 10);
      assert.ok(frames.some((frame: any) => frame.movingCells.some((cell: any) => cell.progress > .1 && cell.progress < .9 && Math.abs(cell.rotation) > .005)));
      assert.ok(frames.some((frame: any) => frame.movingCells.some((cell: any) => cell.settleProgress > 0 && cell.settleProgress < 1 && cell.scaleX > 1.01)));
      for (const frame of frames) for (let reel = 0; reel < 6; reel++) {
        const cells = frame.movingCells.filter((cell: any) => cell.reel === reel);
        for (let row = 1; row < cells.length; row++) assert.ok(cells[row].y - cells[row - 1].y >= 126 * .83 - .001, 'Symbols stay ordered during their independent falls');
      }
      pass('Actual canvas descent uses independent timing, restrained rocking and contact squash without symbol overtaking', { frames: frames.length, uniqueStarts: new Set(planned.map((cell: any) => cell.start)).size, uniqueFlights: new Set(planned.map((cell: any) => cell.flight)).size });
    }
    await capture(page, `character-${character}-reveal`, fixture.seed, pending, 'Real xBet source reveal before recorded feature targets.');
    await release(page); await gate(page, { kind: character === 'left' ? 'wild' : character === 'middle' ? 'expansion' : 'coin', character, min: .78, max: .99 }); await held(page);
    const board = await page.evaluate(() => (window as any).__ruse.board());
    const receiptFeatures = features(pending).filter(f => f.character === character);
    assert.ok(receiptFeatures.some(f => (character === 'right' ? f.coinWaves.flatMap(wave => wave.coins.map(coin => coin.cell)) : f.hits.map(h => h.cell)).some(cell => cell.reel === board.effect.target.reel && cell.row === board.effect.target.row)), 'Visible impact target comes from immutable receipt');
    if (character !== 'right') { assert.equal(board.grid[board.effect.target.reel][board.effect.target.row], 'wild'); assert.equal(board.wildMultipliers[board.effect.target.reel][board.effect.target.row], board.effect.value); }
    if (character === 'middle') {
      const expansion = receiptFeatures.find(feature => feature.source.reel === board.effect.source.reel && feature.source.row === board.effect.source.row)!;
      assert.ok(expansion); assert.deepEqual(board.effect.recipients, expansion.targets); assert.equal(board.expansionCells.length, 5);
      assert.ok(board.expansionCells.every((cell: Cell) => cell.reel === expansion.source.reel));
      for (const hit of expansion.hits) { assert.equal(board.grid[hit.cell.reel][hit.cell.row], 'wild'); assert.equal(board.wildMultipliers[hit.cell.reel][hit.cell.row], hit.multiplier); }
      assert.equal(board.effect.kind, 'expansion');
    }
    if (character === 'left') assert.ok(receiptFeatures.every(f => f.coins.length === 0), 'Left has Wild throws only');
    if (character === 'right') assert.ok(receiptFeatures.every(f => f.hits.length === 0), 'Right owns coin reveals');
    await recordNormalSpeedAnimation(page, character, fixture.seed, character === 'left' ? 'wild' : character === 'middle' ? 'expansion' : 'coin');
    await capture(page, `character-${character}-impact`, fixture.seed, pending, 'Actual recorded Wild throw / full-reel expansion / guaranteed coin target after reveal.');
    pass(`${character} impact follows its recorded targets and exclusive feature role`);
    await finish(page, fixture.session, `${character} xBet`);
  }

  const animated = find({ kind: 'xbet', character: 'left' }, round => features(round).some(feature => feature.character === 'left' && feature.hits.length > 0));
  await reset(page, animated.seed); await gate(page, { kind: 'wild', character: 'left', characterFrame: 0 }); await choose(page, { kind: 'xbet', character: 'left' });
  for (let index = 0; index < authoredFrameCount; index++) {
    if (index) await gate(page, { kind: 'wild', character: 'left', characterFrame: index });
    await held(page);
    const frame = await page.evaluate(() => (window as any).__ruse.board().characterFrames.find((frame: any) => frame.character === 'left'));
    assert.equal(frame.index, index); assert.equal(frame.count, authoredFrameCount);
    await assertPaintedCharacterFrame(page, 'left', index);
    await assertCharacterStaging(page, 'left');
    await capture(page, `animation-left-frame-${index + 1}`, animated.seed, animated.session.pending!, `Controlled-clock actual Wild-throw drawing ${index + 1}/${authoredFrameCount}; the payout receipt remains unchanged throughout.`);
  }
  const animationFrames = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'wild').flatMap((frame: any) => frame.characterFrames.filter((pose: any) => pose.character === 'left')));
  assert.deepEqual([...new Set(animationFrames.map((frame: any) => frame.index))].sort((a: any, b: any) => a - b), Array.from({ length: authoredFrameCount }, (_, index) => index));
  pass('The actual Wild throw paints all sixteen independent authored action frames in sequence at the explicitly controlled QA clock', { seed: animated.seed, frames: authoredFrameCount });
  await finish(page, animated.session, 'Sixteen-frame character throw');

  const luxFrames = find({ kind: 'xbet', character: 'right' }, round => features(round).some(feature => feature.character === 'right' && feature.coinWaves.some(wave => wave.coins.length > 0)));
  await reset(page, luxFrames.seed); await gate(page, { kind: 'coin', character: 'right', characterFrame: 0 }); await choose(page, { kind: 'xbet', character: 'right' });
  const seats: unknown[] = [];
  for (let index = 0; index < authoredFrameCount; index++) {
    if (index) await gate(page, { kind: 'coin', character: 'right', characterFrame: index });
    await held(page);
    const frame = await page.evaluate(() => (window as any).__ruse.board().characterFrames.find((frame: any) => frame.character === 'right'));
    assert.equal(frame.index, index); assert.equal(frame.count, authoredFrameCount);
    await assertPaintedCharacterFrame(page, 'right', index);
    seats.push(await assertCharacterStaging(page, 'right'));
    await capture(page, `animation-lux-frame-${index + 1}`, luxFrames.seed, luxFrames.session.pending!, `Controlled-clock actual LUX coin-reveal drawing ${index + 1}/${authoredFrameCount}; his independent pelvis remains in contact with the original background speaker.`);
  }
  const luxPainted = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'coin').flatMap((frame: any) => frame.characterFrames.filter((pose: any) => pose.character === 'right')));
  assert.deepEqual([...new Set(luxPainted.map((frame: any) => frame.index))].sort((a: any, b: any) => a - b), Array.from({ length: authoredFrameCount }, (_, index) => index));
  pass('LUX paints all sixteen independent seated reveal frames at the explicitly controlled QA clock while his separate character stays attached to the original speaker', { seed: luxFrames.seed, frames: authoredFrameCount, seats });
  await finish(page, luxFrames.session, 'Sixteen-frame seated LUX reveal');

  for (const tier of TIER_ORDER) {
    const seed = 37; const session = expected(seed, { kind: 'buy', tier });
    await reset(page, seed); await page.locator('#buy').click();
    assert.equal(await page.locator('.buy-card[data-tier]').count(), 4);
    const card = page.locator(`.buy-card[data-tier="${tier}"]`); assert.match((await card.textContent())!, new RegExp(`${CONFIG.buyCosts[tier]}×`));
    assert.equal(await card.locator('img').count(), TIER_CHARACTERS[tier].length);
    await card.click(); await gate(page, { kind: 'scatter', min: .04, max: .8 }); await page.locator('#confirm-play').click(); await held(page);
    const board = await page.evaluate(() => (window as any).__ruse.board());
    const cells = board.grid.flatMap((column: string[], reel: number) => column.flatMap((symbol, row) => symbol === 'scatter' ? [{ reel, row }] : []));
    assert.equal(cells.length, TIER_ORDER.indexOf(tier) + 3); assert.equal(new Set(cells.map((cell: any) => cell.reel)).size, cells.length);
    assert.equal((await snapshot(page)).displayedBalance, rich - costCents(20, { kind: 'buy', tier }));
    pass(`${tier} buy has the correct cast and cost, then visibly stages ${cells.length} scatters on distinct reels`, cells);
    await capture(page, `bonus-${tier}-scatters`, seed, session.pending!, 'Bought invitations genuinely land before the bonus intro.');
    await release(page); await gate(page, { stage: 'drop' }); await held(page);
    const initial = await page.evaluate(() => ({ board: (window as any).__ruse.board(), hidden: (document.getElementById('bonus-status') as HTMLElement).hidden, remaining: document.getElementById('remaining')!.textContent }));
    assert.equal(initial.hidden, false); assert.equal(initial.remaining, String(tier === 'old' ? 15 : 10));
    assert.deepEqual(initial.board.activeCharacters.sort(), [...TIER_CHARACTERS[tier]].sort());
    pass(`${tier} bonus displays its exact entitlement and visible remaining-spin counter`);
    await capture(page, `bonus-${tier}-counter`, seed, session.pending!, 'Real first free-spin counter and its entitled side characters.');
    await finish(page, session, `${tier} purchased bonus`);
  }

  const expandingFrames = find({ kind: 'xbet', character: 'middle' }, round => expansions(round).length > 0);
  await reset(page, expandingFrames.seed); await gate(page, { kind: 'expansion', character: 'middle', characterFrame: 0 }); await choose(page, { kind: 'xbet', character: 'middle' });
  for (let index = 0; index < authoredFrameCount; index++) {
    if (index) await gate(page, { kind: 'expansion', character: 'middle', characterFrame: index });
    await held(page);
    const frame = await page.evaluate(() => (window as any).__ruse.board().characterFrames.find((frame: any) => frame.character === 'middle'));
    assert.equal(frame.index, index); assert.equal(frame.count, authoredFrameCount);
    await assertPaintedCharacterFrame(page, 'middle', index);
    await assertCharacterStaging(page);
    await capture(page, `animation-expansion-frame-${index + 1}`, expandingFrames.seed, expandingFrames.session.pending!, `Controlled-clock actual full-reel expansion drawing ${index + 1}/${authoredFrameCount} before any optional recorded follow-up shots.`);
  }
  const expansionFrames = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'expansion'));
  assert.ok(expansionFrames.some((frame: any) => frame.expansionCells.length > 0 && frame.expansionCells.length < 5));
  assert.ok(expansionFrames.every((frame: any) => frame.effect.recipients.length === 5 && frame.effect.recipients.every((cell: Cell) => cell.reel === frame.effect.source.reel)));
  assert.deepEqual([...new Set(expansionFrames.flatMap((frame: any) => frame.characterFrames.filter((pose: any) => pose.character === 'middle').map((pose: any) => pose.index)))].sort((a: any, b: any) => a - b), Array.from({ length: authoredFrameCount }, (_, index) => index));
  pass('Shooter expansion paints all sixteen authored frames at the explicitly controlled QA clock and progressively converts exactly five cells on its own reel');
  await finish(page, expandingFrames.session, 'Sixteen-frame full-reel expansion');

  const noFollowUp = find({ kind: 'xbet', character: 'middle' }, round => expansions(round).length > 0 && shotFeatures(round).length === 0);
  await reset(page, noFollowUp.seed); await gate(page, { kind: 'expansion', character: 'middle', min: .82, max: .97 }); await choose(page, { kind: 'xbet', character: 'middle' }); await held(page);
  const noShotBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(noShotBoard.expansionCells.length, 5); assert.equal(noShotBoard.followUpShots.length, 0);
  await capture(page, 'shooter-expands-without-shots', noFollowUp.seed, noFollowUp.session.pending!, 'This genuine dealt Shooter expands its reel, but its recorded optional shooting phase is not awarded.');
  await finish(page, noFollowUp.session, 'Expansion without optional follow-up shots');
  assert.equal(await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'shot').length), 0);
  pass('A genuine Shooter can expand without follow-up shots; the renderer does not invent an unrecorded shooting phase', { seed: noFollowUp.seed });

  const automaticSticky = find({ kind: 'buy', tier: 'edge' }, round => {
    const spin = round.spins[0], next = round.spins[1], first = spin.cascades[0];
    const expander = first.features.find(feature => feature.phase === 'expand');
    return !!next && !!expander && !first.features.some(feature => feature.phase === 'shots')
      && first.wins.some(win => win.cells.some(cell => cell.reel === expander.source.reel))
      && spin.inactiveWilds.some(cell => cell.reel === expander.source.reel)
      && next.initialExpandedReels.includes(expander.source.reel)
      && next.initialGrid.flat().some(symbol => symbol !== 'wild')
      && next.spinsRemainingBefore < spin.spinsRemainingBefore;
  }, 10000);
  const automaticSpin = automaticSticky.session.pending!.spins[0], automaticNext = automaticSticky.session.pending!.spins[1];
  const automaticFeature = automaticSpin.cascades[0].features.find(feature => feature.phase === 'expand')!, automaticReel = automaticFeature.source.reel;
  await reset(page, automaticSticky.seed); await gate(page, { stage: 'win', shooterReel: automaticReel, shooterSticky: true }); await choose(page, { kind: 'buy', tier: 'edge' }); await held(page);
  const automaticBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.ok(automaticBoard.lockedReels.includes(automaticReel));
  assert.ok(automaticSpin.cascades[0].stickyWilds[automaticReel].every(value => value > 0));
  const automaticAvatar = shooterIdentity(automaticBoard, automaticReel, true);
  assert.equal(automaticAvatar.totalMultiplier, automaticFeature.hits.reduce((sum, hit) => sum + hit.multiplier, 0));
  assert.equal(automaticBoard.followUpShots.length, 0, 'No shot is required to keep the bonus Shooter');
  pass('A bonus Shooter becomes sticky immediately on expansion without a follow-up shot; his highlighted reel retains the character and full five-row total', { seed: automaticSticky.seed, reel: automaticReel, totalMultiplier: automaticAvatar.totalMultiplier });
  await capture(page, 'bonus-shooter-immediately-sticky', automaticSticky.seed, automaticSticky.session.pending!, 'This honest bonus expansion has no follow-up shots. Its character remains on the highlighted reel and the retained five-row total is shown in that reel’s last row.');
  await gate(page, { stage: 'clear', inactiveReel: automaticReel, shooterReel: automaticReel, shooterSticky: true }); await held(page);
  const automaticSpent = await page.evaluate(() => (window as any).__ruse.board());
  const automaticSpentAvatar = shooterIdentity(automaticSpent, automaticReel, true);
  assert.ok(automaticSpentAvatar.inactiveRows.length > 0);
  assert.equal(automaticSpentAvatar.totalMultiplier, automaticAvatar.totalMultiplier, 'Spending a Wild does not erase the retained reel total or character');
  pass('A spent bonus Shooter still shows his character and the retained total rather than the reduced active global multiplier');
  await capture(page, 'bonus-shooter-spent-retained-total', automaticSticky.seed, automaticSticky.session.pending!, 'After a paid line the used Wilds rest, but the Shooter character, reel highlight and bottom retained total stay visible.');
  await gate(page, { stage: 'drop', afterSpin: automaticSpin.spinsRemainingBefore - 1, shooterReel: automaticReel, shooterSticky: true, midDrop: true }); await held(page);
  const automaticRearmed = await page.evaluate(() => (window as any).__ruse.board()), automaticRearmedAvatar = shooterIdentity(automaticRearmed, automaticReel, true);
  assert.deepEqual(automaticRearmed.wildMultipliers[automaticReel], automaticNext.initialWildMultipliers[automaticReel]);
  assert.deepEqual(automaticRearmedAvatar.inactiveRows, []);
  assert.equal(automaticRearmedAvatar.totalMultiplier, automaticSpin.finalWildMultipliers[automaticReel].reduce((sum, value) => sum + value, 0));
  const retainedDrops = automaticRearmed.movingCells.filter((cell: any) => cell.reel === automaticReel);
  assert.equal(retainedDrops.length, 5); assert.ok(retainedDrops.every((cell: any) => cell.sticky && cell.stationary && cell.symbol === 'wild'));
  pass('A no-shot expanded bonus Shooter survives the spin boundary with the same stationary five Wilds, persistent character and bottom total');
  await capture(page, 'bonus-shooter-next-spin-persistent', automaticSticky.seed, automaticSticky.session.pending!, 'On the next actual free-spin drop the same highlighted Shooter reel and retained total stay put while the other symbols fall.');
  await finish(page, automaticSticky.session, 'Automatic no-shot bonus Shooter persistence');

  for (const bonus of [false, true]) {
    const choice: Choice = bonus ? { kind: 'buy', tier: 'edge' } : { kind: 'spin' };
    const multi = find(choice, round => new Set(round.spins[0].cascades[0].features.filter(feature => feature.character === 'middle' && feature.phase === 'expand').map(feature => feature.expandedReel)).size >= 2 && (!bonus || !!round.spins[1] && round.spins[1].initialGrid.flat().some(symbol => symbol !== 'wild') && round.spins[1].spinsRemainingBefore < round.spins[0].spinsRemainingBefore), 100000);
    const firstTwo = multi.session.pending!.spins[0].cascades[0].features.filter(feature => feature.character === 'middle' && feature.phase === 'expand').slice(0, 2);
    await reset(page, multi.seed); await gate(page, { kind: 'expansion', character: 'middle', expansionReel: firstTwo[0].source.reel, min: .82, max: .97 }); await choose(page, choice); await held(page);
    const firstExpansion = await page.evaluate(() => (window as any).__ruse.board());
    assert.equal(firstExpansion.expansionCells.length, 5); assert.equal(firstExpansion.expandedReels.length, 0);
    await capture(page, `${bonus ? 'bonus' : 'base'}-first-expanding-reel`, multi.seed, multi.session.pending!, 'The first dropped Shooter expands its own recorded reel before the independently dropped second Shooter acts.');
    await gate(page, { kind: 'expansion', character: 'middle', expansionReel: firstTwo[1].source.reel, expandedMin: 1, min: .82, max: .97 }); await held(page);
    const secondExpansion = await page.evaluate(() => (window as any).__ruse.board());
    assert.equal(secondExpansion.expandedReels.length, 1); assert.equal(secondExpansion.expandedReels[0].reel, firstTwo[0].source.reel);
    assert.notEqual(secondExpansion.effect.source.reel, secondExpansion.expandedReels[0].reel);
    for (const feature of firstTwo) for (const hit of feature.hits) {
      assert.equal(secondExpansion.grid[hit.cell.reel][hit.cell.row], 'wild'); assert.equal(secondExpansion.wildMultipliers[hit.cell.reel][hit.cell.row], hit.multiplier);
    }
    assert.ok(await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'shot').every((frame: any) => frame.expandedReels.length >= 2)), 'Both initial expanders finish before any optional shooting');
    pass(`${bonus ? 'Bought bonus' : 'Base game'} genuinely drops two independent Shooters on different reels and expands both in receipt order`, { seed: multi.seed, reels: firstTwo.map(feature => feature.source.reel), multipliers: firstTwo.map(feature => feature.expansionMultiplier) });
    await capture(page, `${bonus ? 'bonus' : 'base'}-two-expanding-reels`, multi.seed, multi.session.pending!, 'Two genuinely dropped Shooter badges expand two distinct reels in sequence, using their independent recorded factors.');
    await gate(page, { shooterMin: 2 }); await held(page);
    const completedMulti = await page.evaluate(() => (window as any).__ruse.board());
    for (const feature of firstTwo) shooterIdentity(completedMulti, feature.source.reel, bonus);
    pass(`${bonus ? 'Bonus' : 'Base'} independent expanded reels each paint their own Shooter character and their own bottom-row total`);
    await capture(page, `${bonus ? 'bonus' : 'base'}-two-shooter-characters`, multi.seed, multi.session.pending!, 'Both distinct expanded reels retain their own character and a bottom plate summing their own five Wild values.');
    if (bonus) {
      await gate(page, { stage: 'drop', afterSpin: multi.session.pending!.spins[0].spinsRemainingBefore - 1, shooterMin: 2, midDrop: true }); await held(page);
      const persistentMulti = await page.evaluate(() => (window as any).__ruse.board()), next = multi.session.pending!.spins[1];
      for (const feature of firstTwo) {
        assert.ok(next.initialExpandedReels.includes(feature.source.reel));
        shooterIdentity(persistentMulti, feature.source.reel, true);
        assert.deepEqual(persistentMulti.wildMultipliers[feature.source.reel], next.initialWildMultipliers[feature.source.reel]);
      }
      pass('Multiple expanded bonus Shooter characters and full-reel totals all persist together on the next free spin');
      await capture(page, 'bonus-two-shooters-next-spin', multi.seed, multi.session.pending!, 'Both retained Shooter characters and their individual totals survive together into the next real free spin.');
    }
    await finish(page, multi.session, `${bonus ? 'Bonus' : 'Base'} multiple-expanding-reel fixture`);
  }

  const ordinaryShot = find({ kind: 'xbet', character: 'middle' }, round => !round.triggerTier && shotFeatures(round).some(feature => feature.shotEvents!.some(shot => shot.expandedReel === undefined && !shot.hits[0].repeated)), 10000);
  await reset(page, ordinaryShot.seed); await gate(page, { kind: 'shot', character: 'middle', columnShot: false, repeated: false, min: .78, max: .98 }); await choose(page, { kind: 'xbet', character: 'middle' }); await held(page);
  const ordinaryShotBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(ordinaryShotBoard.shooterPhase, 'shots'); assert.equal(ordinaryShotBoard.effect.recipients.length, 1); assert.equal(ordinaryShotBoard.effect.sticky, false);
  assert.equal(ordinaryShotBoard.grid[ordinaryShotBoard.effect.target.reel][ordinaryShotBoard.effect.target.row], 'wild'); assert.equal(ordinaryShotBoard.wildMultipliers[ordinaryShotBoard.effect.target.reel][ordinaryShotBoard.effect.target.row], 1);
  assert.ok(ordinaryShotBoard.expandedReels.length > 0, 'An optional shot follows a completed expansion');
  pass('An optional recorded follow-up shot converts one eligible regular symbol to a single-use Wild after expansion');
  await capture(page, 'optional-shot-regular-wild', ordinaryShot.seed, ordinaryShot.session.pending!, 'The Shooter sometimes follows its reel expansion with a recorded shot; this regular-symbol hit creates one Wild.');
  await finish(page, ordinaryShot.session, 'Optional regular-target shot');

  const repeatedOrdinary = find({ kind: 'xbet', character: 'middle' }, round => !round.triggerTier && shotFeatures(round).some(feature => feature.shotEvents!.some(shot => shot.expandedReel === undefined && shot.hits[0].repeated)), 10000);
  const repeatedFeature = shotFeatures(repeatedOrdinary.session.pending!).find(feature => feature.shotEvents!.some(shot => shot.expandedReel === undefined && shot.hits[0].repeated))!;
  const repeatIndex = repeatedFeature.shotEvents!.findIndex(shot => shot.expandedReel === undefined && shot.hits[0].repeated), repeatShot = repeatedFeature.shotEvents![repeatIndex];
  await reset(page, repeatedOrdinary.seed); await gate(page, { kind: 'shot', character: 'middle', shotSource: repeatedFeature.source, shotIndex: repeatIndex, columnShot: false, repeated: true, min: .3, max: .55 }); await choose(page, { kind: 'xbet', character: 'middle' }); await held(page);
  const beforeRepeat = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(beforeRepeat.grid[repeatShot.target.reel][repeatShot.target.row], 'wild');
  await gate(page, { kind: 'shot', character: 'middle', shotSource: repeatedFeature.source, shotIndex: repeatIndex, columnShot: false, repeated: true, min: .78, max: .98 }); await held(page);
  const afterRepeat = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(afterRepeat.effect.recipients.length, 1); assert.equal(afterRepeat.effect.sticky, false);
  assert.equal(afterRepeat.wildMultipliers[repeatShot.target.reel][repeatShot.target.row], beforeRepeat.wildMultipliers[repeatShot.target.reel][repeatShot.target.row] * 2);
  assert.equal(afterRepeat.wildMultipliers[repeatShot.target.reel][repeatShot.target.row], repeatShot.hits[0].multiplier);
  pass('A repeated shot at an ordinary single-use Wild doubles only its recorded cell and does not lock a reel', { seed: repeatedOrdinary.seed, target: repeatShot.target, multiplier: repeatShot.hits[0].multiplier });
  await capture(page, 'optional-shot-repeated-wild', repeatedOrdinary.seed, repeatedOrdinary.session.pending!, 'A genuine repeated non-column shot doubles its ordinary Wild target while the rest of that reel keeps its recorded state.');
  await finish(page, repeatedOrdinary.session, 'Repeated ordinary-Wild shot');

  const columnBoost = find({ kind: 'xbet', character: 'middle' }, round => !round.triggerTier && shotFeatures(round).some(feature => feature.shotEvents!.some(shot => shot.expandedReel !== undefined)), 10000);
  const boostFeature = shotFeatures(columnBoost.session.pending!).find(feature => feature.shotEvents!.some(shot => shot.expandedReel !== undefined))!;
  const boostIndex = boostFeature.shotEvents!.findIndex(shot => shot.expandedReel !== undefined), boostShot = boostFeature.shotEvents![boostIndex];
  await reset(page, columnBoost.seed); await gate(page, { kind: 'shot', character: 'middle', shotSource: boostFeature.source, shotIndex: boostIndex, columnShot: true, min: .3, max: .55 }); await choose(page, { kind: 'xbet', character: 'middle' }); await held(page);
  const preBoost = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(preBoost.effect.recipients, boostShot.hits.map(hit => hit.cell)); assert.equal(preBoost.lockedReels.length, 0);
  await gate(page, { kind: 'shot', character: 'middle', shotSource: boostFeature.source, shotIndex: boostIndex, columnShot: true, min: .78, max: .98 }); await held(page);
  const postBoost = await page.evaluate(() => (window as any).__ruse.board());
  for (const hit of boostShot.hits) { assert.equal(postBoost.wildMultipliers[hit.cell.reel][hit.cell.row], preBoost.wildMultipliers[hit.cell.reel][hit.cell.row] * 2); assert.equal(postBoost.wildMultipliers[hit.cell.reel][hit.cell.row], hit.multiplier); }
  assert.equal(postBoost.effect.boostedReel, boostShot.expandedReel); assert.equal(postBoost.effect.sticky, false); assert.equal(postBoost.lockedReels.length, 0);
  assert.equal(shooterIdentity(postBoost, boostShot.expandedReel!, false).totalMultiplier, shooterIdentity(preBoost, boostShot.expandedReel!, false).totalMultiplier * 2);
  pass('Hitting an expanded reel doubles all five Wild multipliers atomically; a base-game shot does not lock it', { seed: columnBoost.seed, reel: boostShot.expandedReel, shot: boostIndex });
  await capture(page, 'base-expanded-reel-doubled', columnBoost.seed, columnBoost.session.pending!, 'A recorded base-game follow-up hit doubles the entire expanded Wild reel; it stays transient outside a bonus.');
  await finish(page, columnBoost.session, 'Base expanded-reel shot doubles all rows');
  const baseAfterShooter = playFixtureRound(acknowledgeRound(columnBoost.session), { kind: 'spin' });
  await gate(page, { stage: 'drop', midDrop: true }); await choose(page, { kind: 'spin' }); await held(page);
  const clearedBaseShooter = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(clearedBaseShooter.shooterReels, []); assert.deepEqual(clearedBaseShooter.lockedReels, []);
  assert.ok(baseAfterShooter.pending!.spins[0].initialWildMultipliers.flat().every(value => value === 0));
  pass('A normal-spin Shooter, his character and his reel total clear at the next paid spin instead of becoming sticky');
  await finish(page, baseAfterShooter, 'Base expanded Shooter clears on next paid spin');

  const locked = find({ kind: 'buy', tier: 'edge' }, round => {
    const spin = round.spins[0]; const next = round.spins[1];
    return !!next && next.initialGrid.flat().some(symbol => symbol !== 'wild') && spin.cascades.some(cascade => cascade.features.some(feature => feature.shotEvents?.some(shot => shot.sticky && spin.inactiveWilds.some(cell => cell.reel === shot.expandedReel)))) && next.spinsRemainingBefore < spin.spinsRemainingBefore;
  }, 10000);
  const lockedSpin = locked.session.pending!.spins[0], lockedFeature = lockedSpin.cascades.flatMap(cascade => cascade.features).find(feature => feature.shotEvents?.some(shot => shot.sticky && lockedSpin.inactiveWilds.some(cell => cell.reel === shot.expandedReel)))!;
  const lockIndex = lockedFeature.shotEvents!.findIndex(shot => shot.sticky && lockedSpin.inactiveWilds.some(cell => cell.reel === shot.expandedReel)), lockShot = lockedFeature.shotEvents![lockIndex], lockedReel = lockShot.expandedReel!;
  await reset(page, locked.seed); await gate(page, { kind: 'shot', character: 'middle', shotSource: lockedFeature.source, shotIndex: lockIndex, columnShot: true, sticky: true, min: .78, max: .98 }); await choose(page, { kind: 'buy', tier: 'edge' }); await held(page);
  const lockBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.ok(lockBoard.lockedReels.includes(lockedReel)); assert.deepEqual(lockBoard.effect.recipients, lockShot.hits.map(hit => hit.cell));
  for (const hit of lockShot.hits) assert.equal(lockBoard.wildMultipliers[hit.cell.reel][hit.cell.row], hit.multiplier);
  const shotAvatar = shooterIdentity(lockBoard, lockedReel, true);
  assert.equal(shotAvatar.totalMultiplier, lockShot.hits.reduce((sum, hit) => sum + hit.multiplier, 0));
  pass('A bonus follow-up shot doubles the already-sticky expanded column and updates the visible retained reel total atomically', { seed: locked.seed, reel: lockedReel, totalMultiplier: shotAvatar.totalMultiplier });
  await capture(page, 'bonus-expanded-reel-locked', locked.seed, locked.session.pending!, 'A bonus shot upgrades an already-sticky Shooter reel; the character stays and its bottom total immediately sums all five doubled positions.');
  await gate(page, { stage: 'clear', lockedReel, inactiveReel: lockedReel }); await held(page);
  const lockDimmed = await page.evaluate(() => (window as any).__ruse.board());
  assert.ok(lockDimmed.inactiveWilds.some((cell: Cell) => cell.reel === lockedReel)); assert.ok(lockDimmed.grid[lockedReel].every((symbol: string) => symbol === 'wild'));
  shooterIdentity(lockDimmed, lockedReel, true);
  await capture(page, 'bonus-locked-reel-spent', locked.seed, locked.session.pending!, 'Locked Wilds dim after paying a batch and remain in their reel while ordinary symbols tumble.');
  await gate(page, { stage: 'drop', afterSpin: lockedSpin.spinsRemainingBefore - 1, lockedReel, midDrop: true }); await held(page);
  const rearmedLock = await page.evaluate(() => (window as any).__ruse.board());
  const nextLockedSpin = locked.session.pending!.spins[1];
  assert.ok(nextLockedSpin.initialExpandedReels.includes(lockedReel)); assert.equal(rearmedLock.inactiveWilds.length, 0); assert.ok(rearmedLock.grid[lockedReel].every((symbol: string) => symbol === 'wild'));
  assert.deepEqual(rearmedLock.wildMultipliers[lockedReel], nextLockedSpin.initialWildMultipliers[lockedReel]);
  const lockedDrops = rearmedLock.movingCells.filter((cell: any) => cell.reel === lockedReel); assert.equal(lockedDrops.length, 5); assert.ok(lockedDrops.every((cell: any) => cell.sticky && cell.stationary && cell.symbol === 'wild'));
  shooterIdentity(rearmedLock, lockedReel, true);
  pass('The locked whole reel stays stationary and reactivates its saved multipliers on the next free-spin drop');
  await capture(page, 'bonus-locked-reel-rearmed', locked.seed, locked.session.pending!, 'The next real free spin reactivates the locked reel; each of its five Wilds remains stationary while fresh symbols fall independently.');
  await finish(page, locked.session, 'Whole-reel sticky lock and rearm');

  const noCarry = find({ kind: 'boost' }, round => !!round.triggerTier && round.spins[0].cascades.some(cascade => cascade.features.some(feature => feature.phase === 'shots')), 100000);
  await reset(page, noCarry.seed); await gate(page, { kind: 'shot', character: 'middle', min: .78, max: .98 }); await choose(page, { kind: 'boost' }); await held(page);
  assert.equal((await page.evaluate(() => (window as any).__ruse.board())).lockedReels.length, 0);
  await gate(page, { kind: 'scatter', min: .1, max: .9 }); await held(page); await gate(page, { stage: 'drop', midDrop: true }); await held(page);
  const enteredBonus = await page.evaluate(() => (window as any).__ruse.board()), firstBonusSpin = noCarry.session.pending!.spins[1];
  assert.deepEqual(firstBonusSpin.initialExpandedReels, []); assert.ok(firstBonusSpin.initialWildMultipliers.flat().every(value => value === 0)); assert.deepEqual(enteredBonus.expandedReelIds, []); assert.deepEqual(enteredBonus.lockedReels, []);
  assert.deepEqual(enteredBonus.shooterReels, []);
  pass('A boosted base-game expansion and its shots cannot carry a transient Wild reel into the newly triggered bonus', { seed: noCarry.seed, tier: noCarry.session.pending!.triggerTier });
  await capture(page, 'base-expansion-bonus-reset', noCarry.seed, noCarry.session.pending!, 'A real boosted base round triggers a bonus after shooting; its transient expanded reels and Wild multipliers reset before the first free-spin drop.');
  await finish(page, noCarry.session, 'Natural bonus resets base transient expansions');

  const usefulWild = find({ kind: 'xbet', character: 'middle' }, round => { const cascade = round.spins[0].cascades.find(cascade => cascade.wins.length); return !!cascade && cascade.wins.some(win => win.cells.some(cell => cascade.resolvedGrid[cell.reel][cell.row] === 'wild') && win.cells.filter(cell => cascade.resolvedGrid[cell.reel][cell.row] === win.symbol).length < 3 && win.payoutCents > 0); });
  await reset(page, usefulWild.seed); await gate(page, { stage: 'win' }); await choose(page, { kind: 'xbet', character: 'middle' }); await held(page);
  const wildBoard = await page.evaluate(() => (window as any).__ruse.board());
  const wildCascade = usefulWild.session.pending!.spins[0].cascades.find(cascade => cascade.wins.length)!;
  assert.deepEqual(wildBoard.grid, wildCascade.resolvedGrid); assert.deepEqual(wildBoard.wildMultipliers, wildCascade.resolvedWildMultipliers); assert.equal(wildBoard.global, wildCascade.globalMultiplier);
  assert.deepEqual(wildBoard.winningLines, wildCascade.wins); assert.ok(wildCascade.wins.some(win => win.line === wildBoard.activeLine)); assert.ok(wildBoard.lineProgress >= 0 && wildBoard.lineProgress <= 1);
  pass('Wilds complete a genuine left-to-right paid line with fewer than three natural copies and apply the recorded global multiplier', { seed: usefulWild.seed, wins: wildCascade.wins });
  await capture(page, 'wild-completes-and-pays', usefulWild.seed, usefulWild.session.pending!, 'The highlighted real line starts on the leftmost reel; active Wilds complete the matching sequence and its recorded multiplier pays.');
  await finish(page, usefulWild.session, 'Useful Wild paid-combination fixture');

  const overlap = find({ kind: 'spin' }, round => {
    const cascade = round.spins[0].cascades.find(cascade => cascade.wins.length > 0);
    return !!cascade && cascade.wins.length >= 2 && new Set(cascade.wins.flatMap(win => win.cells).map(cellKey)).size < cascade.wins.reduce((sum, win) => sum + win.cells.length, 0);
  }, 10000);
  await reset(page, overlap.seed); await gate(page, { stage: 'win' }); await choose(page, { kind: 'spin' }); await held(page);
  const overlapBoard = await page.evaluate(() => (window as any).__ruse.board());
  const overlapCascade = overlap.session.pending!.spins[0].cascades.find(cascade => cascade.wins.length)!;
  assert.deepEqual(overlapBoard.winningLines, overlapCascade.wins);
  assert.equal(new Set(overlapCascade.removed.map(cellKey)).size, overlapCascade.removed.length);
  assert.equal(overlapCascade.payoutCents, overlapCascade.features.reduce((sum, feature) => sum + feature.payoutCents, 0) + overlapCascade.wins.reduce((sum, win) => sum + win.payoutCents, 0));
  pass('An actual paid base round awards overlapping lines separately while its shared grid cells clear only once', { seed: overlap.seed, lineAwards: overlapCascade.wins, uniqueRemovedCells: overlapCascade.removed.length });
  await capture(page, 'overlapping-payline-wins', overlap.seed, overlap.session.pending!, 'Several real winning paths share cells; every line awards its own longest match while the shared cells tumble once.');
  await finish(page, overlap.session, 'Overlapping payline awards');

  const sticky = find({ kind: 'buy', tier: 'ruse' }, round => { const index = round.spins.findIndex(spin => spin.inactiveWilds.length > 0); return index >= 0 && index < round.spins.length - 1 && round.spins[index + 1].spinsRemainingBefore === round.spins[index].spinsRemainingBefore - 1; });
  await reset(page, sticky.seed); await gate(page, { stage: 'clear', inactiveMin: 1 }); await choose(page, { kind: 'buy', tier: 'ruse' }); await held(page);
  const dimmed = await page.evaluate(() => (window as any).__ruse.board());
  assert.ok(dimmed.inactiveWilds.every((cell: any) => dimmed.grid[cell.reel][cell.row] === 'wild' && dimmed.wildMultipliers[cell.reel][cell.row] > 0));
  const visibleDimmed = dimmed.inactiveWilds.map((cell: any) => ({ cell, multiplier: dimmed.wildMultipliers[cell.reel][cell.row] }));
  pass('Sticky Wilds visibly become inactive after contributing a winning cascade while retaining their location and multiplier');
  await capture(page, 'sticky-wild-spent', sticky.seed, sticky.session.pending!, 'Sticky Wild positions stay fixed and dim after being used; ordinary symbols refill their free rows.');
  const refillReceipt = sticky.session.pending!.spins.flatMap(spin => spin.cascades).find(cascade => cascade.refilledGrid && JSON.stringify(cascade.resolvedGrid) === JSON.stringify(dimmed.grid) && JSON.stringify(cascade.inactiveWildsAfter) === JSON.stringify(dimmed.inactiveWilds))!;
  assert.ok(refillReceipt, 'A genuine winning cascade precedes the observed clear');
  await release(page); await gate(page, { stage: 'cascade-drop', inactiveMin: 1, midDrop: true }); await held(page);
  const refill = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(refill.grid, refillReceipt.refilledGrid);
  for (const cell of refill.movingCells) {
    assert.equal(cell.symbol, refillReceipt.refilledGrid![cell.reel][cell.row]);
    if (cell.sticky) assert.equal(cell.stationary, true);
    else if (cell.sourceRow >= 0) assert.equal(cell.symbol, refillReceipt.resolvedGrid[cell.reel][cell.sourceRow], 'A falling survivor retains its symbol identity');
  }
  for (let reel = 0; reel < 6; reel++) { const cells = refill.movingCells.filter((cell: any) => cell.reel === reel && !cell.sticky); for (let row = 1; row < cells.length; row++) assert.ok(cells[row].y - cells[row - 1].y >= 126 * .83 - .001); }
  pass('A real tumble preserves each falling survivor identity and ordering while sticky Wild cells stay fixed');
  await capture(page, 'independent-tumble', sticky.seed, sticky.session.pending!, 'Actual receipt-derived survivor motion and independent replacement drops around stationary sticky Wilds.');
  await release(page); await gate(page, { stage: 'drop', afterSpin: dimmed.remaining - 1 }); await held(page);
  const recharged = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(recharged.inactiveWilds, []);
  assert.ok(visibleDimmed.every((entry: any) => recharged.grid[entry.cell.reel][entry.cell.row] === 'wild' && recharged.wildMultipliers[entry.cell.reel][entry.cell.row] === entry.multiplier));
  assert.ok(recharged.movingCells.filter((cell: any) => cell.sticky).every((cell: any) => cell.stationary));
  pass('The next free spin recharges the same sticky Wild cells and multipliers without moving them');
  await capture(page, 'sticky-wild-recharged', sticky.seed, sticky.session.pending!, 'The following free-spin drop reactivates the recorded sticky Wilds at the same positions.');
  await finish(page, sticky.session, 'Sticky Wild spend / recharge fixture');

  const collector = find({ kind: 'xbet', character: 'right' }, round => { const feature = features(round).find(feature => feature.character === 'right'); return !!feature && feature.coinWaves.some(wave => wave.collections.length > 0 && wave.repeat) && feature.coinWaves.some(wave => wave.collections.some(collection => collection.sources.some(coin => coin.kind === 'collector'))); }, 10000);
  const collectorFeature = features(collector.session.pending!).find(feature => feature.character === 'right')!;
  const firstWave = collectorFeature.coinWaves.find(wave => wave.collections.length > 0 && wave.repeat)!;
  await reset(page, collector.seed); await gate(page, { stage: 'coin-reveal-complete', coinWave: firstWave.index }); await choose(page, { kind: 'xbet', character: 'right' }); await held(page);
  const revealed = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(revealed.coinRevealRemaining, 0); assert.equal(revealed.coinPhase, 'revealed');
  assert.equal(revealed.collection, null);
  assert.deepEqual(revealed.coins, [...firstWave.existingCollectors, ...firstWave.coins]);
  assert.ok(firstWave.coins.every(coin => coin.kind !== 'empty'));
  assert.deepEqual(cellKeys(revealed.coins.map((coin: any) => coin.cell)), cellKeys(collectorFeature.targets));
  const framesBeforeCollection = await page.evaluate(() => (window as any).__probe.frames);
  assert.ok(framesBeforeCollection.filter((frame: any) => frame.coinPhase === 'collect').every((frame: any) => frame.coinRevealRemaining === 0));
  pass('Every marked box has a coin or effect and every face reveals before any modifier or collector begins', { seed: collector.seed, wave: firstWave.index, freshReveals: firstWave.coins.length, markedCells: collectorFeature.targets.length });
  await capture(page, 'collector-all-coins-revealed', collector.seed, collector.session.pending!, 'All coin faces are visible before collecting; this exact receipt later replaces a collector.');
  await release(page); await gate(page, { stage: 'coin-clear', coinWave: firstWave.index, min: .8 }); await held(page);
  const cleared = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(cleared.coins, firstWave.retainedCollectors);
  assert.deepEqual(cleared.clearedCoins, firstWave.cleared);
  assert.equal(cleared.coins.filter((coin: any) => coin.kind !== 'collector').length, 0);
  pass('Collection removes all non-collector coins, retains only the recorded collector and then permits a new reveal');
  await capture(page, 'collector-clears-and-stays', collector.seed, collector.session.pending!, 'The collected amount remains at the sole collector; every other marked cell has cleared before reroll.');
  const absorptionWave = collectorFeature.coinWaves.find(wave => wave.collections.some(collection => collection.sources.some(coin => coin.kind === 'collector')))!;
  const nextWave = collectorFeature.coinWaves[firstWave.index + 1];
  await release(page); await gate(page, { stage: 'coin-reveal', coinWave: nextWave.index, min: .15, max: .8 }); await held(page);
  const reroll = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(reroll.coins, nextWave.existingCollectors); assert.equal(reroll.coinRevealRemaining, nextWave.coins.length);
  assert.ok(nextWave.coins.every(coin => coin.kind !== 'empty'));
  assert.deepEqual(cellKeys([...nextWave.existingCollectors, ...nextWave.coins].map(coin => coin.cell)), cellKeys(collectorFeature.targets));
  assert.equal(reroll.collection, null);
  pass('The next reveal starts with only the previously retained collector, while all cleared cells reveal fresh outcomes');
  await capture(page, 'collector-fresh-reroll', collector.seed, collector.session.pending!, 'Only the retained collector is present when the cleared positions begin revealing new coin outcomes.');
  await gate(page, { stage: 'coin-collect', coinWave: absorptionWave.index, min: .4, max: .65, collectionConsumesCollector: true }); await held(page);
  const transit = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(transit.coinTransits.length, transit.collection.sources.length);
  assert.ok(transit.coinTransits.some((coin: any) => coin.progress > 0 && coin.progress < 1));
  assert.ok(transit.coinTransits.every((coin: any) => coin.target.reel === transit.collection.collector.reel && coin.target.row === transit.collection.collector.row && coin.progress >= 0 && coin.progress <= 1 && coin.arrival > .1 && coin.arrival <= .88));
  assert.deepEqual(transit.coinTransits.map((coin: any) => coin.source), transit.collection.sources.map((coin: any) => coin.cell));
  pass('Collector coins travel individually from their actual recorded sources to the new collector with staggered arrival times');
  await capture(page, 'collector-flight', collector.seed, collector.session.pending!, 'Individual recorded coin transfers follow independent curved flights into the newly revealed collector.');
  await gate(page, { stage: 'coin-collect', coinWave: absorptionWave.index, min: .89, max: .999, collectionConsumesCollector: true }); await held(page);
  const absorption = await page.evaluate(() => (window as any).__ruse.board());
  assert.equal(absorption.coinRevealRemaining, 0);
  assert.ok(absorptionWave.collections.some(collection => JSON.stringify(collection) === JSON.stringify(absorption.collection)));
  assert.ok(absorption.collection.sources.some((coin: any) => coin.kind === 'collector'));
  assert.ok(absorption.collection.sources.every((coin: any) => coin.cell.reel !== absorption.collection.collector.reel || coin.cell.row !== absorption.collection.collector.row), 'Collector never collects itself');
  assert.ok(absorption.coins.some((coin: any) => coin.cell.reel === absorption.collection.collector.reel && coin.cell.row === absorption.collection.collector.row && coin.payoutCents === absorption.collection.valueAfterCents));
  assert.ok(absorption.collection.sources.every((source: any) => !absorption.coins.some((coin: any) => coin.cell.reel === source.cell.reel && coin.cell.row === source.cell.row)), 'Collected sources disappear after impact');
  pass('A later collector absorbs the previous collector and its actual accumulated value exactly once');
  await capture(page, 'collector-chain-absorption', collector.seed, collector.session.pending!, 'A newly revealed collector takes the retained collector and new coin values after all fresh reveals.');
  await release(page); await gate(page, { stage: 'coin-award' }); await held(page);
  const awardedCoins = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(awardedCoins.coins, collectorFeature.coins);
  assert.equal(awardedCoins.coins.reduce((sum: number, coin: any) => sum + coin.payoutCents, 0), collectorFeature.payoutCents);
  const collectedFrames = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.coinPhase === 'collect'));
  assert.ok(collectedFrames.length > 0 && collectedFrames.every((frame: any) => frame.coinRevealRemaining === 0));
  pass('The terminal collector and fresh coins award their final recorded sum once; every collection frame follows complete reveals', { payoutCents: collectorFeature.payoutCents });
  await capture(page, 'collector-final-award', collector.seed, collector.session.pending!, 'The final collector total and fresh values sum to the authoritative recorded feature award at €0.20 stake.');
  await finish(page, collector.session, 'Collector reveal / clear / reroll chain');

  const natural = find({ kind: 'spin' }, round => !!round.triggerTier && round.spins.some(spin => spin.addedSpins > 0), 10000);
  await reset(page, natural.seed); await gate(page, { kind: 'scatter', min: .08, max: .95 }); await choose(page, { kind: 'spin' }); await held(page);
  assert.equal((await snapshot(page)).pending!.triggerTier, natural.session.pending!.triggerTier);
  pass('Natural recorded Scatters trigger their genuine bonus without a buy');
  await finish(page, natural.session, 'Natural bonus with retrigger');

  const retrigger = find({ kind: 'buy', tier: 'lux' }, round => round.spins.some(spin => spin.addedSpins > 0));
  await reset(page, retrigger.seed); await gate(page, { kind: 'scatter', min: .08, max: .98 }); await choose(page, { kind: 'buy', tier: 'lux' }); await held(page);
  await release(page); await gate(page, { kind: 'scatter', min: .08, max: .98, labelPrefix: '+' }); await held(page);
  const retriggerBoard = await page.evaluate(() => ({ board: (window as any).__ruse.board(), remaining: document.getElementById('remaining')!.textContent }));
  assert.match(retriggerBoard.board.effect.label, /^\+/); assert.equal(Number(retriggerBoard.remaining), retriggerBoard.board.remaining);
  assert.ok(retrigger.session.pending!.spins.some(spin => spin.spinsRemainingAfter === retriggerBoard.board.remaining && spin.addedSpins > 0));
  pass('A real bonus retrigger shows its added-spin banner and updated remaining counter');
  await capture(page, 'bonus-retrigger', retrigger.seed, retrigger.session.pending!, 'Natural in-bonus Scatter retrigger; visible counter follows the recorded addition.');
  await finish(page, retrigger.session, 'Retrigger fixture');

  // Leave an immutable bought round pending, then reload it: neither debit nor RNG is repeated.
  const pendingSeed = 91; const pendingSession = expected(pendingSeed, { kind: 'buy', tier: 'old' });
  await reset(page, pendingSeed); await gate(page, { stage: 'drop' }); await choose(page, { kind: 'buy', tier: 'old' }); await held(page);
  assert.deepEqual((await snapshot(page)).pending, pendingSession.pending); await page.reload(); await ready(page);
  assert.deepEqual((await snapshot(page)).pending, pendingSession.pending);
  await finish(page, pendingSession, 'Reloaded pending super bonus charged exactly once');
  await page.reload(); await ready(page); assert.equal((await snapshot(page)).balanceCents, pendingSession.balanceCents); assert.equal((await snapshot(page)).pending, null);
  pass('Settled reload retains exact credits and does not replay or double-credit the round');

  const threshold = find({ kind: 'buy', tier: 'old' }, round => round.payoutCents / round.betCents > 1600 && !round.maxWin);
  await reset(page, threshold.seed); await gate(page, { stage: 'drop' }); await choose(page, { kind: 'buy', tier: 'old' }); await held(page);
  // A committed receipt can precede async audio/renderer initialization. Wait
  // for its actual board drop before using the development presentation skip,
  // and install the first count-up gate in the same task as the release.
  await page.evaluate(() => { const p = (window as any).__probe; p.release(); p.gate = { tier: 2 }; (window as any).__ruse.skip(); });
  for (const tier of [2, 3, 4]) {
    if (tier !== 2) await gate(page, { tier }); await held(page);
    const displayed = await page.locator('#win-ratio').textContent(); const ratio = Number(displayed!.replace(/[×\s]/g, '').replace(',', '.'));
    assert.ok(ratio >= (tier === 2 ? 100 : tier === 3 ? 500 : 1000));
    assert.equal(await page.locator('.win-person').count(), 3);
    const visible = await page.locator('.win-person').evaluateAll(actors => actors.map(actor => {
      const canvas = actor as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0; for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) painted++;
      return { opacity: Number(getComputedStyle(actor).opacity), frame: Number((actor as HTMLElement).dataset.frame), width: canvas.width, height: canvas.height, painted };
    }));
    assert.ok(visible[0].painted > 0 && visible[0].frame >= 0 && visible[0].frame < authoredFrameCount, 'The left cast actor is painted from an authored sixteen-frame atlas');
    assert.ok(visible.every(actor => actor.width > 0 && actor.height > 0));
    if (tier === 2) {
      const winFilters = await page.evaluate(() => ({ shell: getComputedStyle(document.getElementById('game-shell')!).filter, backdrop: getComputedStyle(document.querySelector('.win-dialog[open]')!, '::backdrop').backdropFilter }));
      assert.equal(winFilters.shell, 'none'); assert.equal(winFilters.backdrop, 'none');
      pass('Live win animation uses its dark scrim without blurring two full-window layers', winFilters);
    }
    await capture(page, `win-${tier === 2 ? 100 : tier === 3 ? 500 : 1000}`, threshold.seed, threshold.session.pending!, `Actual count-up crossing ${tier === 2 ? 100 : tier === 3 ? 500 : 1000}×; CSS cutscene escalation is driven by the counted amount.`);
    pass(`Count-up genuinely crosses ${tier === 2 ? 100 : tier === 3 ? 500 : 1000}× and advances its cutscene stage`, { ratio, visible });
    await release(page);
  }
  await finish(page, threshold.session, 'Large recorded win count-up');
  }

  const god = find({ kind: 'god' }, round => round.maxWin);
  await reset(page, god.seed); await gate(page, { kind: 'god', godShot: god.session.pending!.godShots.length - 1, min: .72, max: .95 }); await choose(page, { kind: 'god' }); await held(page);
  assert.equal((await snapshot(page)).pending!.payoutCents, 20 * 19999);
  const godBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(godBoard.grid, god.session.pending!.godGrid); assert.deepEqual(godBoard.godGrid, god.session.pending!.godGrid);
  assert.equal(godBoard.grid.flat().filter((symbol: string) => symbol === 'max').length, 1);
  const actualShotFrames = await page.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.effect?.kind === 'god'));
  for (const [index, shot] of god.session.pending!.godShots.entries()) {
    const observed = actualShotFrames.filter((frame: any) => frame.effect.shot === index);
    assert.ok(observed.length > 0, `Shot ${index} was visibly presented`);
    assert.ok(observed.every((frame: any) => frame.effect.target.reel === shot.target.reel && frame.effect.target.row === shot.target.row && frame.effect.hit === shot.hit));
    assert.equal(shot.hit, god.session.pending!.godGrid![shot.target.reel][shot.target.row] === 'max');
  }
  pass('God car fires each recorded random board target; the single MAX symbol awards exactly 19,999× only when hit', { seed: god.seed, shots: god.session.pending!.godShots });
  await capture(page, 'god-shot', god.seed, god.session.pending!, 'Real God shot trajectory; payout comes from the engine hit receipt.');
  await page.evaluate(() => { const p = (window as any).__probe; p.release(); p.gate = { tier: 4 }; (window as any).__ruse.skip(); });
  await held(page); await page.locator('#win-continue').click();
  assert.match((await page.locator('#modal-title').textContent())!, /MAX WIN/); assert.equal(await page.locator('#win-scene').evaluate(el => el.classList.contains('max-win')), true);
  assert.match((await page.locator('#win-counter').textContent())!, /3\s?999[,\.]80/);
  const escapeFrames = await page.locator('.escape-car').evaluate(car => ({ left: getComputedStyle(car).left, frames: car.getAnimations().flatMap(animation => animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes().map(frame => ({ transform: frame.transform, left: frame.left, top: frame.top })) : []) }));
  assert.equal(escapeFrames.left, '0px'); assert.ok(escapeFrames.frames.length >= 4);
  assert.ok(escapeFrames.frames.every(frame => typeof frame.transform === 'string' && frame.transform !== 'none' && frame.left === undefined && frame.top === undefined));
  pass('MAX getaway animation moves through transform keyframes while its layout position stays fixed', escapeFrames);
  await capture(page, 'max-win', god.seed, god.session.pending!, 'Settled genuine 19,999× max receipt: €3,999.80 on a €0.20 base bet.');
  pass('Max-win cutscene shows the exact capped EUR amount and remains until Continue');
  await finish(page, god.session, 'God maximum win');

  const godMiss = find({ kind: 'god' }, round => !round.maxWin);
  await reset(page, godMiss.seed); await gate(page, { kind: 'god', godShot: godMiss.session.pending!.godShots.length - 1, min: .72, max: .95 }); await choose(page, { kind: 'god' }); await held(page);
  const missedBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.deepEqual(missedBoard.grid, godMiss.session.pending!.godGrid);
  assert.ok(godMiss.session.pending!.godShots.every(shot => !shot.hit && godMiss.session.pending!.godGrid![shot.target.reel][shot.target.row] !== 'max'));
  assert.deepEqual(godMiss.session.pending!.spins[0].initialGrid, godMiss.session.pending!.godGrid);
  pass('Missed God shots continue the same dealt board into its ordinary receipt without inventing a MAX hit');
  await capture(page, 'god-miss-board', godMiss.seed, godMiss.session.pending!, 'Recorded misses leave the MAX symbol unhit; the same board then resolves normal symbol wins.');
  await finish(page, godMiss.session, 'God miss same-board settlement');

  await reset(page, 8); await page.locator('#settings').click();
  assert.equal(await page.locator('input[type="file"], [data-audio], [data-remove], #audio-reset').count(), 0);
  await page.waitForFunction(() => (window as any).__probe.audioDecodes.length >= 11 && (window as any).__probe.audioDecodes.every((decode: any) => decode.decoded), undefined, { timeout: 20000, polling: 40 });
  const decoded = await page.evaluate(() => (window as any).__probe.audioDecodes);
  assert.ok(decoded.every((decode: any) => decode.bytes > 44 && decode.duration > 0 && decode.channels > 0));
  assert.ok((await page.evaluate(() => (window as any).__probe.audioStarts)).some((start: any) => !start.loop));
  pass('All eleven filesystem WAV cues genuinely decode in Web Audio and sound effects play; Settings exposes no file uploads or track removal', decoded);
  await page.locator('#settings-language').selectOption('en');
  await page.locator('#volume').evaluate(element => { const input = element as HTMLInputElement; input.value = '31'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#default-music').uncheck();
  await presentationCapture(page, 'filesystem-audio-settings', 'Sound settings offer only volume and music; WAV replacements belong to the source filesystem manifest.');
  await page.locator('#dialog-close').click(); await page.locator('#mute').click(); await page.reload(); await ready(page); await page.locator('#settings').click();
  assert.equal(await page.locator('#volume').inputValue(), '31'); assert.equal(await page.locator('#default-music').isChecked(), false); assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('input[type="file"], [data-audio], [data-remove]').count(), 0);
  assert.equal(await page.evaluate(() => (window as any).__probe.audioStarts.length), 0, 'Reload must not autoplay before a real gesture');
  pass('Volume, mute and music preferences persist across reload without autoplay or user-supplied audio storage');
  await page.locator('#dialog-close').click(); await page.locator('#mute').click();
  await page.waitForFunction(() => (window as any).__probe.audioDecodes.length >= 10 && (window as any).__probe.audioDecodes.every((decode: any) => decode.decoded), undefined, { timeout: 20000, polling: 40 });
  assert.ok((await page.evaluate(() => (window as any).__probe.audioStarts)).every((start: any) => !start.loop));
  await page.locator('#settings').click(); await page.locator('#default-music').check();
  await page.waitForFunction(() => (window as any).__probe.audioStarts.some((start: any) => start.loop), undefined, { timeout: 10000, polling: 40 });
  await page.locator('#dialog-close').click();
  pass('A real unmute gesture decodes filesystem effects; disabled music stays silent until its setting explicitly starts the bundled loop');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 400, height: 840 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const layout = await page.evaluate(() => {
      const rect = (element: Element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; };
      const canvas = rect(document.getElementById('game')!);
      const board = { x: canvas.x + canvas.width * 200 / 1240, y: canvas.y + canvas.height * 170 / 900, width: canvas.width * 840 / 1240, height: canvas.height * 630 / 900 };
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, shell: rect(document.getElementById('game-shell')!), stage: rect(document.querySelector('.stage')!), canvas, board, controls: ['spin', 'buy', 'god', 'settings', 'language', 'bet', 'xbet', 'turbo', 'mute'].map(id => ({ id, ...rect(document.getElementById(id)!) })) };
    });
    assert.ok(layout.scrollWidth <= viewport.width + 1 && layout.scrollHeight <= viewport.height + 1, JSON.stringify(layout));
    for (const area of [layout.shell, layout.stage]) { assert.ok(Math.abs(area.x) <= 1 && Math.abs(area.y) <= 1); assert.ok(Math.abs(area.width - viewport.width) <= 1 && Math.abs(area.height - viewport.height) <= 1); }
    assert.ok(layout.board.x >= -1 && layout.board.y >= -1 && layout.board.x + layout.board.width <= viewport.width + 1 && layout.board.y + layout.board.height <= viewport.height + 1, `Every one of the 30 logical cells remains within the viewport: ${JSON.stringify(layout)}`);
    const minimumControl = 24;
    assert.ok(layout.controls.every(control => control.width >= minimumControl && control.height >= minimumControl && control.x >= -1 && control.y >= -1 && control.right <= viewport.width + 1 && control.bottom <= viewport.height + 1), JSON.stringify(layout));
    assert.ok(layout.controls.every(control => !(control.x < layout.board.x + layout.board.width && control.right > layout.board.x && control.y < layout.board.y + layout.board.height && control.bottom > layout.board.y)), 'The compact HUD does not obscure any reel cell');
    pass(`${viewport.width}×${viewport.height}: the scene fills the whole window, all 30 cells fit and all controls remain reachable without overflow`, layout);
    await presentationCapture(page, viewport.width === 400 ? 'mobile' : viewport.width === 640 ? 'landscape' : viewport.width === 1920 ? 'desktop-full-window' : 'desktop', 'The scene fills its actual window with every reel cell and control visible.');
  }

  const castSeed = 37, castSession = expected(castSeed, { kind: 'buy', tier: 'old' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await reset(page, castSeed); await gate(page, { stage: 'drop', midDrop: true, activeCastMin: 3 }); await choose(page, { kind: 'buy', tier: 'old' }); await held(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1920, height: 800 }, { width: 400, height: 840 }, { width: 320, height: 720 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport);
    // The presentation clock is held, but ResizeObserver must still paint the
    // fitted cast. A direct read-only board inspection does not advance it.
    await page.waitForTimeout(120);
    const cast = await assertCharacterStaging(page, 'right');
    assert.deepEqual(cast.staging.map((actor: any) => actor.character).sort(), ['left', 'middle', 'right']);
    assert.ok(cast.staging.every((actor: any) => actor.scale > .05), 'Every separately animated actor stays visibly painted rather than shrinking to an offscreen fallback');
    pass(`${viewport.width}×${viewport.height}: all three independent bonus characters stay uncut and LUX remains seated on the original speaker`, cast);
    await capture(page, `cast-seating-${viewport.width}x${viewport.height}`, castSeed, castSession.pending!, 'Actual super-bonus cast during an independent symbol drop; full outside-cast drawings are unmasked and LUX is seated on the existing background speaker or a crop of that exact same speaker when it is outside the viewport.');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await finish(page, castSession, 'Responsive seated three-character bonus staging');

  const reducedContext = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await probe(reducedContext); const reducedPage = await reducedContext.newPage();
  try {
    await reducedPage.goto(url); await ready(reducedPage); await reset(reducedPage, 42); await gate(reducedPage, { stage: 'drop', midDrop: true }); await choose(reducedPage, { kind: 'spin' }); await held(reducedPage);
    const reducedFrames = await reducedPage.evaluate(() => (window as any).__probe.frames.filter((frame: any) => frame.stage === 'drop'));
    assert.ok(reducedFrames.some((frame: any) => frame.movingCells.some((cell: any) => cell.progress >= .4 && cell.progress <= .8)));
    assert.ok(reducedFrames.every((frame: any) => frame.movingCells.every((cell: any) => cell.rotation === 0 && cell.scaleX === 1 && cell.scaleY === 1)));
    pass('Reduced-motion setting removes rocking and squash during a real drop while retaining symbol identities');
    await finish(reducedPage, expected(42, { kind: 'spin' }), 'Reduced-motion deterministic settlement');
  } finally { await reducedContext.close(); }
}

async function production(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const directory = join(root, 'dist');
  const file = join(directory, 'index.html');
  if (!existsSync(file)) throw new Error('Run npm run build before browser checks: dist/index.html is required');
  const bytes = new Map<string, Buffer>();
  for (const path of await files(directory)) bytes.set('/' + relative(directory, path).replaceAll('\\', '/'), await readFile(path));
  productionBundleHashes = Object.fromEntries([...bytes].map(([path, value]) => [path.slice(1), sha(value)]));
  const html = bytes.get('/index.html')!;
  assert.ok(html.length > 100);
  const mime: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png', svg: 'image/svg+xml', ttf: 'font/ttf', json: 'application/json', wav: 'audio/wav' };
  const staticServer = createHTTPServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const content = bytes.get(pathname === '/' ? '/index.html' : pathname);
    if (content) { response.writeHead(200, { 'content-type': mime[pathname.split('.').at(-1) ?? 'html'] ?? (pathname === '/' ? mime.html : 'application/octet-stream') }); response.end(content); }
    else if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(ok => staticServer.listen(0, '127.0.0.1', ok));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await probe(context, true); const page = await context.newPage();
  try {
  await page.goto(`http://127.0.0.1:${(staticServer.address() as { port: number }).port}/`);
  await ready(page); assert.equal(await page.evaluate(() => '__ruse' in window), false);
  pass('Production server loads the exact built bundle and all art without development hooks', { bundleFiles: bytes.size, hashes: productionBundleHashes });
  const initial = createSession(42, rich);
  await page.evaluate(session => { localStorage.setItem('ot-staroto-session-v5', JSON.stringify(session)); localStorage.setItem('ot-staroto-settings-v1', JSON.stringify({ language: 'en', turbo: true, muted: true })); }, initial);
  await page.reload(); await ready(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v5')!)) as Promise<Session>;
  const settle = async (receipt: Session) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v5')!).pending || !!document.getElementById('win-continue'), undefined, { timeout: 180000, polling: 40 });
      if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click(); else break;
    }
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v5')!).pending, undefined, { timeout: 180000, polling: 40 });
    assert.deepEqual(await stored(), acknowledgeRound(receipt));
  };
  const assertCommitted = async (before: Session, choice: Choice, entropyBefore: number) => {
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('ot-staroto-session-v5')!).pending, undefined, { polling: 20 });
    const committed = await stored(); const round = committed.pending!;
    assert.deepEqual(deserializeSession(JSON.stringify(committed)), committed, 'Production receipt must independently replay its complete catalog outcome and recorded random draw tape');
    assert.deepEqual(round.choice, choice); assert.equal(round.costCents, costCents(before.betCents, choice)); assert.equal(committed.sequence, before.sequence + 1);
    assert.equal(committed.balanceCents, before.balanceCents - round.costCents + round.payoutCents);
    assert.equal((round.outcome as any)?.source, 'crypto');
    assert.ok(await page.evaluate(() => (window as any).__probe.entropyCalls.length) > entropyBefore, 'The production paid selection draws fresh CSPRNG entropy');
    const tampered = structuredClone(committed); tampered.pending!.payoutCents += 1; tampered.history.at(-1)!.payoutCents += 1;
    assert.equal(deserializeSession(JSON.stringify(tampered)), null, 'A tampered production receipt cannot be accepted on reload');
    auditReceipt(round);
    productionReceipts.push({ choice, sequence: committed.sequence, costCents: round.costCents, payoutCents: round.payoutCents, sha256: sha(JSON.stringify(round)), outcome: round.outcome, selection: 'fresh-ui-csprng' });
    return committed;
  };
  const entropyBeforeBuy = await page.evaluate(() => (window as any).__probe.entropyCalls.length);
  await page.locator('#buy').click(); await page.locator('.buy-card[data-tier="ruse"]').click(); await page.locator('#confirm-play').click();
  const settled = await assertCommitted(initial, { kind: 'buy', tier: 'ruse' }, entropyBeforeBuy);
  await page.reload(); await ready(page); assert.deepEqual(await stored(), settled);
  assert.equal(await page.evaluate(() => (window as any).__probe.entropyCalls.length), 0, 'Pending reload replays the committed draw tape instead of drawing another paid outcome');
  await settle(settled);
  await page.reload(); await ready(page); assert.deepEqual(await stored(), acknowledgeRound(settled));
  pass('Production uses fresh CSPRNG draws, preserves a pending bought receipt across reload without new entropy, then settles its exact validated ledger');

  const entropyBeforeSpin = await page.evaluate(() => (window as any).__probe.entropyCalls.length);
  await page.locator('#spin').focus(); await page.keyboard.down('Space');
  const next = await assertCommitted(acknowledgeRound(settled), { kind: 'spin' }, entropyBeforeSpin);
  for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
  await page.locator('#game').evaluate(element => { for (let repeat = 0; repeat < 100; repeat++) element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const duringRepeatedInput = await stored();
  // A genuine zero-win turbo round can naturally finish during one hundred
  // awaited key events. Both exact ledger states are valid; neither permits
  // an extra sequence, debit, entropy draw or altered receipt.
  assert.deepEqual(duringRepeatedInput, duringRepeatedInput.pending ? next : acknowledgeRound(next));
  await settle(next);
  for (let repeat = 0; repeat < 100; repeat++) await page.keyboard.down('Space');
  assert.deepEqual(await stored(), acknowledgeRound(next)); await page.keyboard.up('Space');
  pass('Production focused-Spin held Space and board clicks preserve the exact committed or naturally settled receipt and cannot create another round after settlement', { settledDuringRepeatedInput: duringRepeatedInput.pending === null });

  const entropyBeforeXbet = await page.evaluate(() => (window as any).__probe.entropyCalls.length);
  await page.locator('#xbet').selectOption('left'); await page.locator('#spin').click(); await page.locator('#confirm-play').click();
  const xbet = await assertCommitted(acknowledgeRound(next), { kind: 'xbet', character: 'left' }, entropyBeforeXbet);
  assert.ok(xbet.pending!.spins[0].initialGrid.flat().includes('left')); await settle(xbet);
  pass('Production character xBet guarantees its selected badge, draws independent entropy and settles its strictly replayed credits');

  const entropyBeforeBoost = await page.evaluate(() => (window as any).__probe.entropyCalls.length);
  await page.locator('#xbet').selectOption('boost'); await page.locator('#spin').click();
  const boosted = await assertCommitted(acknowledgeRound(xbet), { kind: 'boost' }, entropyBeforeBoost);
  assert.equal(boosted.pending!.costCents, 3 * boosted.betCents); await settle(boosted);
  pass('Production bonus-chance xBet charges exactly 3×, uses its separate weighted draw and remains playable after bought, normal and character rounds');

  const entropyBeforeMiddle = await page.evaluate(() => (window as any).__probe.entropyCalls.length);
  await page.locator('#xbet').selectOption('middle'); await page.locator('#spin').click(); await page.locator('#confirm-play').click();
  const middle = await assertCommitted(acknowledgeRound(boosted), { kind: 'xbet', character: 'middle' }, entropyBeforeMiddle);
  assert.ok(middle.pending!.spins[0].initialGrid.flat().includes('middle'));
  assert.ok(expansions(middle.pending!).length > 0); await settle(middle);
  pass('Production Shooter xBet draws fresh UI CSPRNG entropy, genuinely expands its dealt badge and settles the complete independently replayed receipt');

  // Rare-mechanic reload coverage uses a genuine production selection, not a
  // hand-built receipt or the development fixture selector. Selecting in Node
  // lets us avoid waiting through many unrelated live animations. The report
  // records this separately from fresh UI draws and preserves its entire tape.
  let precommitted: Session | undefined; let attemptedFreshSelections = 0;
  for (; attemptedFreshSelections < 1000 && !precommitted;) {
    attemptedFreshSelections++;
    const candidate = playRound(createSession(439, rich), { kind: 'buy', tier: 'edge' });
    const first = candidate.pending!.spins[0].cascades[0], reels = first.features.filter(feature => feature.phase === 'expand').map(feature => feature.expandedReel!);
    const next = candidate.pending!.spins[1];
    if (new Set(reels).size >= 2 && next && next.spinsRemainingBefore < candidate.pending!.spins[0].spinsRemainingBefore && next.initialGrid.some((column, reel) => !reels.includes(reel) && ['bottle', 'cash', 'chain', 'cassette', 'sneaker', 'crown', 'lighter', 'dice', 'ring'].includes(column[0])) && !first.features.some(feature => feature.phase === 'shots')) precommitted = candidate;
  }
  assert.ok(precommitted, 'An honest production CSPRNG receipt must cover two initial expanding Shooters');
  assert.equal(precommitted.pending!.outcome!.source, 'crypto'); auditReceipt(precommitted.pending!);
  assert.deepEqual(deserializeSession(JSON.stringify(precommitted)), precommitted);
  const committedRound = precommitted.pending!, committedReels = committedRound.spins[0].cascades[0].features.filter(feature => feature.phase === 'expand').map(feature => feature.expandedReel!);
  await page.evaluate(session => localStorage.setItem('ot-staroto-session-v5', JSON.stringify(session)), precommitted);
  await page.reload(); await ready(page);
  assert.equal(await page.evaluate(() => '__ruse' in window), false);
  assert.deepEqual(await stored(), precommitted);
  assert.equal(await page.evaluate(() => (window as any).__probe.entropyCalls.length), 0);
  // These production gates inspect only actual canvas draw calls and the public
  // free-spin counter. The production bundle still has no engine/renderer hooks.
  const paintedPersistence: { remaining: number; reels: number[]; totals: number[]; ordinaryDescent: unknown[]; paintedFrame: unknown }[] = [];
  const firstCommitted = committedRound.spins[0], nextCommitted = committedRound.spins[1];
  for (const [index, spin] of [firstCommitted, nextCommitted].entries()) {
    const values = index === 0 ? firstCommitted.cascades[0].resolvedWildMultipliers : nextCommitted.initialWildMultipliers;
    const totals = committedReels.map(reel => values[reel].reduce((sum, value) => sum + value, 0));
    // A zero-win first spin goes directly from the last expansion drawing to
    // settlement. Its real actor may still be in his authored action pose; an
    // idle-only gate would incorrectly reject that honest presentation.
    await gate(page, { productionRemaining: spin.spinsRemainingBefore, productionReels: committedReels, productionTotals: totals, productionDrop: index > 0, productionAnimatingShooter: index === 0 });
    try { await held(page); } catch (error) {
      await writeFile(join(output, 'production-paint-failure.json'), JSON.stringify({ index, expectedRemaining: spin.spinsRemainingBefore, committedReels, totals, precommitted, observed: await page.evaluate(() => ({ remaining: document.getElementById('remaining')?.textContent, language: document.documentElement.lang, paint: (window as any).__probe.paint, gate: (window as any).__probe.gate, frames: (window as any).__probe.productionPaintFrames })) }, null, 2));
      await page.screenshot({ path: join(output, 'production-paint-failure.png'), fullPage: true });
      throw error;
    }
    const paintedFrame = await page.evaluate(() => (window as any).__probe.paint);
    const ordinaryDescent = paintedFrame.sprites.filter((sprite: any) => sprite.loaded && sprite.imageWidth === 1254 && sprite.imageHeight === 1254 && sprite.matrix.f > 170 && sprite.matrix.f < 220 && Array.from({ length: 6 }, (_, reel) => reel).filter(reel => !committedReels.includes(reel)).some(reel => Math.abs(sprite.matrix.e - (200 + (reel + .5) * 140)) < 8));
    if (index > 0) assert.ok(ordinaryDescent.length > 0, 'Actual ordinary-symbol descent in the same painted frame proves the next free spin has started, independently of the earlier counter decrement');
    paintedPersistence.push({ remaining: spin.spinsRemainingBefore, reels: committedReels, totals, ordinaryDescent, paintedFrame });
    assert.equal(await page.evaluate(() => '__ruse' in window), false);
    assert.equal(await page.evaluate(() => (window as any).__probe.entropyCalls.length), 0);
    await presentationCapture(page, `production-sticky-shooters-${index ? 'next-spin' : 'expanded'}`, `Actual production canvas draw calls paint both authored Shooter characters and receipt-derived bottom-row totals${index ? ' while ordinary symbols genuinely descend in the next free spin' : ' as both reels reveal their complete recorded Wild values'}, without development hooks or additional entropy.`);
  }
  pass('Production paints multiple authored Shooter characters and receipt-derived bottom-row totals through the next free-spin boundary without development hooks', { reels: committedReels, beforeRemaining: firstCommitted.spinsRemainingBefore, nextRemaining: nextCommitted.spinsRemainingBefore, totals: paintedPersistence.map(frame => frame.totals) });
  await release(page);
  await settle(precommitted);
  assert.equal(await page.evaluate(() => (window as any).__probe.entropyCalls.length), 0);
  productionMultiShooterReplay = { description: 'A complete pending bought-bonus receipt selected with fresh Node CSPRNG by the same production playRound API, then replayed in the real production browser. This is reload coverage, not a fresh UI selection or a forged fixture.', attemptedFreshSelections, ledgerSha256: sha(JSON.stringify(precommitted)), roundSha256: sha(JSON.stringify(committedRound)), expandedReels: committedReels, entropyCallsAfterReload: 0, paintedPersistence };
  productionReceipts.push({ choice: committedRound.choice, sequence: precommitted.sequence, costCents: committedRound.costCents, payoutCents: committedRound.payoutCents, sha256: sha(JSON.stringify(committedRound)), outcome: committedRound.outcome, selection: 'node-csprng-precommitted-reload' });
  pass('Production replays a genuine precommitted CSPRNG multi-Shooter bonus without development hooks or new entropy and settles its exact ledger', productionMultiShooterReplay);
  await page.locator('#settings').click();
  assert.equal(await page.locator('input[type="file"], [data-audio], [data-remove]').count(), 0);
  await page.locator('#volume').evaluate(element => { const input = element as HTMLInputElement; input.value = '27'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#default-music').uncheck(); await page.locator('#dialog-close').click();
  await page.reload(); await ready(page); await page.locator('#settings').click();
  assert.equal(await page.locator('#volume').inputValue(), '27'); assert.equal(await page.locator('#default-music').isChecked(), false); assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
  await page.locator('#dialog-close').click(); await page.locator('#mute').click();
  await page.waitForFunction(() => (window as any).__probe.audioDecodes.length >= 10 && (window as any).__probe.audioDecodes.every((decode: any) => decode.decoded), undefined, { timeout: 20000, polling: 40 });
  const audioRequests = productionRequests.filter(url => new URL(url).pathname.includes('/audio/'));
  assert.equal(new Set(audioRequests.map(url => new URL(url).pathname)).size, 11);
  pass('Production server serves eleven built filesystem WAV cues, decodes them after interaction and preserves music / volume / mute without uploads', { requests: [...new Set(audioRequests)], decodes: await page.evaluate(() => (window as any).__probe.audioDecodes) });
  assert.ok(productionRequests.every(url => new URL(url).pathname === '/' || new URL(url).pathname === '/favicon.ico' || bytes.has(new URL(url).pathname)), 'Production requests only built files served by the local game server');
  const afterBundleHashes = Object.fromEntries(await Promise.all((await files(directory)).map(async path => [relative(directory, path).replaceAll('\\', '/'), sha(await readFile(path))])));
  assert.deepEqual(afterBundleHashes, productionBundleHashes, 'The built bundle must stay frozen while its server runtime is checked');
  await presentationCapture(page, 'server-production', 'Exact production bundle served over HTTP after a bonus, base spin, xBet, pending reload and filesystem sound preference checks.');
  } finally { await context.close(); await new Promise<void>(ok => staticServer.close(() => ok())); }
}

await mkdir(output, { recursive: true }); await mkdir(shots, { recursive: true });
assert.equal(PAYLINE_REFERENCE_READY, true, 'The exact Le Zeus chart must be supplied and verified before browser release validation');
assert.ok(PAYLINES.length > 0, 'A lines game cannot validate with an empty or guessed chart');
const chartPath = 'docs/research/le-zeus-payline-chart.json';
const chartBytes = await readFile(join(root, chartPath));
const chart = JSON.parse(chartBytes.toString());
assert.equal(chart.provenance.primaryTranscriptionVerified, true); assert.equal(chart.provenance.independentChartReview, 'confirmed');
assert.equal(chart.sourceImplementationSha256, sha(await readFile(join(root, 'src/paylines.ts'))));
assert.deepEqual(PAYLINES, chart.paths.map((path: { rowsZeroBased: number[] }) => path.rowsZeroBased));
paylineReference = { path: chartPath, sha256: sha(chartBytes), sourceImplementationSha256: chart.sourceImplementationSha256, paths: chart.paths.map((path: { rowsZeroBased: number[] }) => path.rowsZeroBased) };
const productionOnly = process.argv.includes('--production-only');
const artValidation = JSON.parse(await readFile(join(root, 'docs/art/art-validation.json'), 'utf8'));
authoredFrames = artValidation.characterFrames;
assert.equal(authoredFrames.length, authoredFrameCount * 3, 'All 48 authored pose crops must be present before animation validation');
for (const character of ['left', 'middle', 'right'] as Character[]) assert.deepEqual(authoredFrames.filter(frame => frame.character === character).map(frame => frame.index), Array.from({ length: authoredFrameCount }, (_, index) => index));
for (const frame of authoredFrames) assert.equal(frame.atlasSha256, sha(await readFile(join(root, frame.atlasPath))), `The authored ${frame.character} frame ${frame.index} atlas matches its independently decoded art-validation SHA`);
const initialSourceHashes = await sourceHashes();
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}), headless: true, args: ['--no-sandbox'] });
try {
  if (!productionOnly) {
    const available = await port(); const url = `http://127.0.0.1:${available}`;
    const viteModule = pathToFileURL(require.resolve('vite')).href;
    const boot = `const {createServer}=await import(${JSON.stringify(viteModule)});const server=await createServer({root:${JSON.stringify(root)},server:{host:'127.0.0.1',port:${available},strictPort:true,hmr:false,watch:null}});await server.listen();`;
    server = spawn(process.execPath, ['--input-type=module', '-e', boot], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout?.on('data', data => { serverOutput += data.toString(); }); server.stderr?.on('data', data => { serverOutput += data.toString(); });
    for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) break; } catch { /* Server is starting. */ } if (attempt === 99) throw new Error(serverOutput); await new Promise(ok => setTimeout(ok, 100)); }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await probe(context); const page = await context.newPage(); await (animationOnly ? animationDevelopment(page, url) : development(page, url)); await context.close();
  }
  if (!animationOnly) await production(browser);
  assert.deepEqual(jsErrors, [], 'No JavaScript page errors'); assert.deepEqual(failures, [], 'No failed image / font / audio requests'); assert.deepEqual(externalRequests, [], 'No external network dependencies');
  pass(animationOnly ? 'No JavaScript errors, asset failures or external network requests in the development animation diagnostic' : 'No JavaScript errors, asset failures or external network requests in development and production servers');
  const source = await sourceHashes();
  if (!tailOnly && !animationOnly) assert.deepEqual(source, initialSourceHashes, 'Source must stay frozen throughout verified browser checks');
  const report = { version: 5, presentationVersion: '5.2.0', paylineChart: PAYLINES, paylineReference, capturedAt: new Date().toISOString(), variant: 'ot-staroto', mode: animationOnly ? 'animation-diagnostic' : productionOnly ? 'production-only' : tailOnly ? 'tail-diagnostic' : 'full', checksPassed: checks.length, checks, animationProbe: { description: 'QA-only requestAnimationFrame gates pause screenshots. Gates for an exact authored pose additionally advance the presentation clock in explicit 4.1667 ms steps to inspect every real source drawing; this controlled-clock coverage is separate from the recorded native-clock actions and production play. Engine receipts and entropy remain unchanged.', authoredActionFrames: authoredFrameCount, authoredPoseClockStepMs, normalSpeedAnimations }, sourceHashes: source, captures, presentationCaptures, jsErrors, assetFailures: failures, externalRequests, ...(!animationOnly ? { production: { path: 'dist/index.html', sha256: sha(await readFile(join(root, 'dist/index.html'))), bundleHashes: productionBundleHashes, requests: productionRequests, receipts: productionReceipts, ...(productionMultiShooterReplay ? { multiShooterReplay: productionMultiShooterReplay } : {}) } } : {}) };
  await writeFile(join(output, animationOnly ? 'browser-animation.json' : productionOnly ? 'production-browser.json' : tailOnly ? 'browser-tail.json' : 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  if (!productionOnly && !tailOnly && !animationOnly) {
    await mkdir(publishedShots, { recursive: true });
    for (const shot of [...captures, ...presentationCaptures]) await copyFile(join(shots, shot.file.split('/').at(-1)!), join(root, shot.file));
    await writeFile(join(root, 'docs/browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
    const currentScreenshots = new Set([...captures, ...presentationCaptures].map(capture => capture.file));
    for (const path of await files(publishedShots)) if (path.endsWith('.png') && !currentScreenshots.has(relative(root, path).replaceAll('\\', '/'))) await unlink(path);
  }
  console.log(`Verified ${checks.length} browser checks; ${captures.length} documented receipt screenshots.`);
} catch (error) {
  await writeFile(join(output, 'browser-failure.json'), JSON.stringify({ checksPassed: checks.length, checks, error: error instanceof Error ? error.stack : String(error), jsErrors, assetFailures: failures, externalRequests, serverOutput: serverOutput.slice(-4000) }, null, 2));
  throw error;
} finally { await browser.close(); server?.kill(); }
