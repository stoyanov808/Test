import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import type { Character } from '../src/types';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRootOption = process.argv.find(argument => argument.startsWith('--app-root='));
const root = appRootOption ? resolve(appRootOption.slice('--app-root='.length)) : projectRoot;
const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const winOnly = process.argv.includes('--win-only');
const output = join(projectRoot, winOnly ? `test-results/native-fps-win-${baseline ? 'baseline' : 'current'}.json` : baseline ? 'test-results/native-fps-baseline.json' : 'docs/research/v5-fps-validation.json');
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
async function files(path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) result.push(...(entry.isDirectory() ? await files(join(path, entry.name)) : [join(path, entry.name)]));
  return result;
}
async function hashes() {
  return Object.fromEntries(await Promise.all((await files(join(root, 'src'))).sort().map(async file => [relative(root, file), sha(await readFile(file))])));
}
const initialHashes = await hashes();
const art = JSON.parse(await readFile(join(root, 'src/character-frames.json'), 'utf8'));
const crops = Object.fromEntries(Object.entries(art.frames).flatMap(([character, frames]: [string, any]) => frames.map((frame: any, index: number) => [[frame.sx, frame.sy, frame.width, frame.height].join(','), { character, index }])));
const packageInfo = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const vite = await import(require.resolve('vite'));
const server = await vite.createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null } });
await server.listen();
const address = server.httpServer!.address() as { port: number };
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}), headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
const errors: string[] = [], failures: string[] = [];
context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(request.url()); }); });
const install = ({ crops }: any) => {
  const w = window as any, nativeRAF = window.requestAnimationFrame.bind(window);
  const state = w.__nativeFPS = { phase: '', samples: [] as any[], vsync: [] as any[], reads: 0, readMs: 0, gameClears: 0, castClears: 0, draws: 0, paint: { poses: [] as any[], symbol: null as any }, imageRecords: [] as any[], longTasks: [] as any[] };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value: string) { state.imageRecords.push(this); src.set!.call(this, value); } });
  const rectangle = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { const start = performance.now(); const result = rectangle.call(this); state.reads++; state.readMs += performance.now() - start; return result; };
  for (const [prototype, name] of [[HTMLElement.prototype, 'offsetWidth'], [HTMLElement.prototype, 'offsetHeight'], [HTMLElement.prototype, 'offsetLeft'], [Element.prototype, 'clientWidth'], [Element.prototype, 'clientHeight']] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor?.get) Object.defineProperty(prototype, name, { ...descriptor, get() { const start = performance.now(); const value = descriptor.get!.call(this); state.reads++; state.readMs += performance.now() - start; return value; } });
  }
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<typeof clear>) {
    if (this.canvas.id === 'game') { state.gameClears++; state.paint = { poses: [], symbol: null }; }
    if (this.canvas.id === 'character-stage') state.castClears++;
    return clear.apply(this, args);
  };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: any[]) {
    state.draws++;
    if (args.length === 9 && (this.canvas.id === 'game' || this.canvas.id === 'character-stage')) {
      const pose = crops[args.slice(1, 5).join(',')];
      if (pose) { const m = this.getTransform(); state.paint.poses.push({ ...pose, canvas: this.canvas.id, alpha: this.globalAlpha, transform: [m.a, m.b, m.c, m.d, m.e, m.f] }); }
      else if (this.canvas.id === 'game' && args[0] instanceof HTMLImageElement && args[0].naturalWidth === 1254 && !state.paint.symbol) { const m = this.getTransform(); state.paint.symbol = [m.a, m.b, m.c, m.d, m.e, m.f]; }
    }
    return (draw as any).apply(this, args);
  } as typeof draw;
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (state.phase) state.longTasks.push({ phase: state.phase, start: entry.startTime, duration: entry.duration }); }).observe({ entryTypes: ['longtask'] }); } catch { /* Browser may not expose long tasks. */ }
  const sampleVsync = (now: number) => { if (state.phase) state.vsync.push({ phase: state.phase, now }); nativeRAF(sampleVsync); };
  nativeRAF(sampleVsync);
  window.requestAnimationFrame = callback => nativeRAF(now => {
    const phase = state.phase, start = performance.now(), reads = state.reads, readMs = state.readMs, game = state.gameClears, cast = state.castClears, draws = state.draws;
    callback(now);
    if (phase) {
      const workMs = performance.now() - start;
      const win = document.getElementById('win-scene');
      const actors = win ? [...win.querySelectorAll<HTMLCanvasElement>('.win-person')].map(actor => ({ character: actor.dataset.character, index: actor.dataset.frame, transform: actor.style.transform })) : [];
      state.samples.push({ phase, now, workMs, reads: state.reads - reads, readMs: state.readMs - readMs, gameDraws: state.gameClears - game, castDraws: state.castClears - cast, drawCalls: state.draws - draws, paint: { ...state.paint, poses: [...state.paint.poses] }, winActors: actors });
    }
  });
};
await context.addInitScript({ content: `window.__name = target => target; (${install.toString()})(${JSON.stringify({ crops })});` });
const page = await context.newPage();
let raw: any;
try {
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForFunction(() => { const w = window as any; return w.__ruse && w.__nativeFPS.imageRecords.length >= 12 && w.__nativeFPS.imageRecords.every((image: HTMLImageElement) => image.complete && image.naturalWidth > 0); }, undefined, { timeout: 30000 });
  const phase = (name: string) => page.evaluate(name => { (window as any).__nativeFPS.phase = name; }, name);
  await phase('display-calibration'); await page.waitForTimeout(1500);
  for (const turbo of (winOnly ? [] : [false, true])) for (const character of ['left', 'middle', 'right'] as Character[]) {
    await phase('');
    await page.evaluate(() => (window as any).__ruse.reset(1, 100_000_000));
    if ((await page.evaluate(() => (window as any).__ruse.snapshot().turbo)) !== turbo) await page.locator('#turbo').click();
    await page.locator('#xbet').selectOption(character);
    await phase(`${turbo ? 'turbo' : 'normal'}-${character}`);
    await page.locator('#spin').click(); await page.locator('#confirm-play').click();
    await page.waitForTimeout(turbo ? 1900 : 2500);
    // The selected badge may resolve after another genuinely dealt character.
    // Observe its actual Canvas source drawing; no renderer inspector or paid
    // outcome modification is needed to cover the intended feature action.
    await page.waitForFunction(({ phaseName, character }) => (window as any).__nativeFPS.samples.some((sample: any) => sample.phase === phaseName && sample.paint.poses.some((pose: any) => pose.character === character && pose.index >= 8)), { phaseName: `${turbo ? 'turbo' : 'normal'}-${character}`, character }, { timeout: 30000, polling: 50 });
    await page.waitForTimeout(1000);
    await phase('');
    await page.evaluate(() => (window as any).__ruse.skip());
    for (let attempts = 0; attempts < 5; attempts++) {
      if (!(await page.evaluate(() => (window as any).__ruse.snapshot().busy))) break;
      await page.waitForFunction(() => !(window as any).__ruse.snapshot().busy || !!document.getElementById('win-continue'), undefined, { timeout: 20000 });
      if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click();
    }
  }
  await page.evaluate(() => (window as any).__ruse.reset(23, 100_000_000));
  if (await page.evaluate(() => (window as any).__ruse.snapshot().turbo)) await page.locator('#turbo').click();
  await page.locator('#buy').click(); await page.locator('.buy-card[data-tier="old"]').click(); await page.locator('#confirm-play').click();
  await page.waitForFunction(() => (window as any).__nativeFPS.gameClears > 5 && (window as any).__ruse.snapshot().busy);
  await page.waitForTimeout(100);
  await page.evaluate(() => (window as any).__ruse.skip());
  await page.locator('#win-scene').waitFor({ timeout: 30000 });
  await phase('win-scene'); await page.waitForTimeout(7000); await phase('');
  raw = await page.evaluate(() => ({ ...((window as any).__nativeFPS), imageRecords: undefined, environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } } }));
  assert.deepEqual(await hashes(), initialHashes, 'App source remains frozen throughout the native FPS measurement');
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
} finally { await context.close(); await browser.close(); await server.close(); }
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return { count: values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? 0 };
}
const phases = [...new Set<string>(raw.vsync.map((frame: any) => frame.phase))];
const summary = phases.map(name => {
  const frames = raw.samples.filter((sample: any) => sample.phase === name && (sample.gameDraws || sample.castDraws || sample.winActors.length));
  const uniqueTimes = [...new Set<number>(frames.map((sample: any) => sample.now))].sort((a, b) => a - b);
  const intervals = uniqueTimes.slice(1).map((time, index) => time - uniqueTimes[index]);
  const vsync = raw.vsync.filter((sample: any) => sample.phase === name).map((sample: any) => sample.now);
  const ticks = vsync.slice(1).map((time: number, index: number) => time - vsync[index]);
  const poseProgress = Object.fromEntries((['left', 'middle', 'right'] as const).map(character => {
    const seen = frames.flatMap((sample: any) => name === 'win-scene' ? sample.winActors.filter((actor: any) => actor.character === character && Number(actor.index) >= 0).map((actor: any) => Number(actor.index)) : sample.paint.poses.filter((pose: any) => pose.character === character).map((pose: any) => pose.index));
    return [character, { sourcePoseIndices: [...new Set<number>(seen)].sort((a, b) => a - b), sourcePoseChanges: seen.slice(1).filter((index: number, position: number) => index !== seen[position]).length }];
  }));
  return { name, nativeDisplayIntervalsMs: distribution(ticks), actualAnimatedFrameIntervalsMs: distribution(intervals), observedAnimatedFPS: intervals.length ? intervals.length * 1000 / intervals.reduce((sum, time) => sum + time, 0) : null, callbackWorkMs: distribution(frames.map((sample: any) => sample.workMs)), geometryReadsPerCallback: distribution(frames.map((sample: any) => sample.reads)), geometryReadWorkMs: distribution(frames.map((sample: any) => sample.readMs)), callbackWorkOverBudget: frames.filter((sample: any) => sample.workMs > 1000 / 60).length, gapsOver25Ms: intervals.filter(value => value > 25).length, totalActualDraws: frames.reduce((sum: number, sample: any) => sum + sample.gameDraws + sample.castDraws, 0), poseProgress };
});
const report = { modelVersion: 5, presentationVersion: packageInfo.version, measuredAt: new Date().toISOString(), mode: `${baseline ? 'native-fps-baseline' : 'native-fps-current'}${winOnly ? '-win-diagnostic' : ''}`, ...(baseline ? { baselineCommit: '40d6ac35e6073c3cdc7ad1d177906577e6a21fb3' } : {}), targetHz: 60, targetFrameBudgetMs: 1000 / 60, method: 'Unmodified native RAF timestamps and performance.now; no presentation pause, controlled clock, screenshots or per-RAF renderer inspection. Canvas draws, source-pose selections and existing DOM geometry reads are observed. The independent native RAF sampler establishes this headless browser scheduling cadence. Paid feature cases begin at confirmation and retain any scheduling gaps, wait for their selected actor to visibly reach its authored release pose or later, then record another one second. The Old bonus win case uses a genuine seed23 receipt and skips only preceding board presentation. This measures callbacks and draw submissions, not physical monitor presentation or a guarantee for every device. Sixteen authored PNG source poses remain discrete; continuous motion is rendered between pose changes.', sourceHashes: initialHashes, scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), environment: raw.environment, summary, samples: raw.samples, nativeDisplaySamples: raw.vsync, longTasks: raw.longTasks, jsErrors: errors, requestFailures: failures };
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: relative(projectRoot, output), summary: summary.map(phase => ({ name: phase.name, fps: phase.observedAnimatedFPS, displayIntervalP95Ms: phase.nativeDisplayIntervalsMs.p95, callbackP95Ms: phase.callbackWorkMs.p95, geometryReadsP95: phase.geometryReadsPerCallback.p95, gapsOver25Ms: phase.gapsOver25Ms, poseProgress: phase.poseProgress })) }, null, 2));
