import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHTTPServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { CONFIG, TIER_ORDER, TIER_CHARACTERS, acknowledgeRound, costCents, createSession, playRound } from '../src/engine';
import type { Character, Choice, Feature, Round, Session, Tier } from '../src/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tailOnly = process.argv.includes('--tail-only');
const output = join(root, 'test-results');
const shots = join(root, 'docs/screenshots');
const require = createRequire(import.meta.url);
const rich = 100_000_000;
const checks: { name: string; details?: unknown }[] = [];
const captures: { file: string; sha256: string; seed: number; choice: Choice; costCents: number; payoutCents: number; maxWin: boolean; note: string }[] = [];
const failures: string[] = [];
const jsErrors: string[] = [];
const externalRequests: string[] = [];
const productionRequests: string[] = [];
let directFileLaunch: { attempted: boolean; verified: boolean; limitation?: string } = { attempted: false, verified: false };
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
  const paths = [...await files(join(root, 'src')), ...await files(join(root, 'public')), join(root, 'package.json'), join(root, 'vite.config.ts'), join(root, 'scripts/standalone.mjs'), fileURLToPath(import.meta.url)].filter(path => !path.endsWith('/README.md'));
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [relative(root, path), sha(await readFile(path))])));
}
type Gate = { stage?: string; kind?: string; character?: Character; min?: number; max?: number; tier?: number; afterSpin?: number; repeated?: boolean; labelPrefix?: string };
async function probe(context: BrowserContext, local = false) {
  await context.addInitScript(() => {
    const w = window as any;
    const p: any = w.__probe = { gate: null, held: false, queue: [] as any[], frames: [] as any[], images: [] as any[], draws: [] as any[] };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value: string) {
      const record = { prefix: String(value).slice(0, 65), length: String(value).length, width: 0, height: 0, loaded: false, failed: false };
      p.images.push(record);
      this.addEventListener('load', () => { record.loaded = true; record.width = this.naturalWidth; record.height = this.naturalHeight; });
      this.addEventListener('error', () => { record.failed = true; });
      descriptor.set!.call(this, value);
    }});
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: any[]) {
      const img = args[0];
      if (img instanceof HTMLImageElement && p.draws.length < 1000) p.draws.push({ prefix: img.src.slice(0, 65), width: img.naturalWidth, height: img.naturalHeight, loaded: img.complete && img.naturalWidth > 0 });
      return (originalDraw as any).apply(this, args);
    } as typeof originalDraw;
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window); const cancelled = new Set<number>();
    window.cancelAnimationFrame = handle => { cancelled.add(handle); caf(handle); };
    window.requestAnimationFrame = callback => {
      let handle = 0; handle = raf(now => {
      if (cancelled.has(handle)) return;
      if (p.held) { p.queue.push({ callback, now, handle }); return; }
      callback(now);
      const b = w.__ruse?.board?.();
      if (b && p.frames.length < 6000) p.frames.push({ ...b, at: performance.now(), uiRemaining: document.getElementById('remaining')?.textContent });
      const g = p.gate;
      if (!g) return;
      const effect = b?.effect;
      const tier = Number(document.getElementById('win-scene')?.dataset.tier ?? 0);
      const firstMoving = b?.movingCells?.find((cell: any) => !cell.stationary);
      const match = (!g.stage || b?.stage === g.stage) && (!g.kind || effect?.kind === g.kind) && (!g.character || effect?.character === g.character) && (g.min === undefined || effect?.progress >= g.min) && (g.max === undefined || effect?.progress <= g.max) && (!g.tier || tier === g.tier) && (g.repeated === undefined || effect?.repeated === g.repeated) && (!g.labelPrefix || effect?.label?.startsWith(g.labelPrefix)) && (g.afterSpin === undefined || firstMoving?.sourceRow < 0 && b.remaining <= g.afterSpin);
      if (match) p.held = true;
      }); return handle;
    };
    p.release = function () { p.gate = null; p.held = false; const queue = p.queue.splice(0); for (const item of queue) if (!cancelled.has(item.handle)) window.requestAnimationFrame(item.callback); };
  });
  context.on('page', page => {
    page.on('pageerror', error => jsErrors.push(`${local ? 'file' : 'dev'}: ${error.message}`));
    page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`${local ? 'file' : 'dev'}: ${request.url().slice(0, 200)} ${request.failure()?.errorText}`); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${local ? 'file' : 'dev'}: HTTP ${response.status()} ${response.url().slice(0, 200)}`); });
    page.on('request', request => {
      const url = request.url();
      if (local && /^https?:/.test(url)) productionRequests.push(url);
      if (/^https?:/.test(url) && !/^http:\/\/127\.0\.0\.1:/.test(url)) externalRequests.push(url);
    });
  });
}
async function ready(page: Page) {
  await page.locator('#game').waitFor();
  await page.waitForFunction(() => { const p = (window as any).__probe; return p.images.length >= 12 && p.images.every((img: any) => img.loaded || img.failed); }, undefined, { timeout: 30000, polling: 50 });
  const assets = await page.evaluate(() => ({ images: (window as any).__probe.images, draws: (window as any).__probe.draws, dom: [...document.images].map(img => ({ complete: img.complete, width: img.naturalWidth })) }));
  assert.equal(assets.images.filter((img: any) => img.failed).length, 0, JSON.stringify(assets.images.filter((img: any) => img.failed)));
  assert.ok(assets.draws.some((img: any) => img.width > 1000 && img.height > 500), 'Painted PNG yard is loaded');
  return assets;
}
async function snapshot(page: Page): Promise<Session & { busy: boolean; displayedBalance: number; language: string; turbo: boolean }> {
  return page.evaluate(() => (window as any).__ruse.snapshot());
}
async function reset(page: Page, seed: number) {
  await page.evaluate(({ seed, balance }) => { (window as any).__probe.release(); (window as any).__probe.frames = []; (window as any).__ruse.reset(seed, balance); }, { seed, balance: rich });
  await page.locator('#xbet').selectOption('off');
}
async function gate(page: Page, condition: Gate) {
  await page.evaluate(condition => { const p = (window as any).__probe; p.release(); p.gate = condition; }, condition);
}
async function held(page: Page) { await page.waitForFunction(() => (window as any).__probe.held, undefined, { timeout: 45000, polling: 40 }); }
async function release(page: Page) { await page.evaluate(() => (window as any).__probe.release()); }
async function choose(page: Page, choice: Choice) {
  if (choice.kind === 'buy') { await page.locator('#buy').click(); await page.locator(`[data-tier="${choice.tier}"]`).click(); await page.locator('#confirm-play').click(); }
  else if (choice.kind === 'xbet') { await page.locator('#xbet').selectOption(choice.character); await page.locator('#spin').click(); await page.locator('#confirm-play').click(); }
  else if (choice.kind === 'god') { await page.locator('#god').click(); await page.locator('#confirm-play').click(); }
  else await page.locator('#spin').click();
  await page.waitForFunction(() => (window as any).__ruse.snapshot().busy, undefined, { polling: 20 });
}
async function finish(page: Page, expected: Session, label: string) {
  await release(page);
  // Skipping presentation cannot alter the committed ledger. A win needs Skip, then Continue.
  await page.evaluate(() => (window as any).__ruse.skip());
  for (let count = 0; count < 5; count++) {
    if (!(await snapshot(page)).busy) break;
    await page.waitForFunction(() => !(window as any).__ruse.snapshot().busy || !!document.getElementById('win-continue'), undefined, { timeout: 20000, polling: 40 });
    if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click();
  }
  await page.waitForFunction(() => !(window as any).__ruse.snapshot().busy, undefined, { timeout: 20000, polling: 40 });
  const actual = await snapshot(page); const { busy, displayedBalance, language, turbo, ...session } = actual;
  assert.deepEqual(session, acknowledgeRound(expected), `${label}: full receipt, RNG and credits`);
  assert.equal(displayedBalance, expected.balanceCents);
  const board = await page.evaluate(() => (window as any).__ruse.board()); const final = expected.pending!.spins.at(-1);
  assert.equal(board.totalCents, expected.pending!.payoutCents);
  if (final) { assert.deepEqual(board.grid, final.finalGrid); assert.deepEqual(board.wildMultipliers, final.finalWildMultipliers); assert.deepEqual(board.marks, final.marks); assert.equal(board.remaining, final.spinsRemainingAfter); }
  pass(`${label}: exact engine receipt, painted final grid, credits and RNG after skip`, { costCents: expected.pending!.costCents, payoutCents: expected.pending!.payoutCents, finalRng: expected.rngState });
}
async function capture(page: Page, name: string, seed: number, receipt: Round, note: string) {
  const path = join(shots, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  captures.push({ file: `docs/screenshots/${name}.png`, sha256: sha(await readFile(path)), seed, choice: receipt.choice, costCents: receipt.costCents, payoutCents: receipt.payoutCents, maxWin: receipt.maxWin, note });
}
function expected(seed: number, choice: Choice) { return playRound(createSession(seed, rich), choice); }
function find(choice: Choice, predicate: (round: Round) => boolean, limit = 3000) {
  for (let seed = 1; seed <= limit; seed++) { const session = expected(seed, choice); if (predicate(session.pending!)) return { seed, session }; }
  throw new Error(`No honest fixture found for ${JSON.stringify(choice)} within ${limit} seeds`);
}
function features(round: Round): Feature[] { return round.spins.flatMap(spin => spin.cascades.flatMap(cascade => cascade.features)); }
function wav() {
  const samples = 2205; const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(22050, 24); buffer.writeUInt32LE(44100, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) buffer.writeInt16LE(Math.round(Math.sin(index / 22050 * 440 * Math.PI * 2) * 4000), 44 + index * 2);
  return buffer;
}

async function development(page: Page, url: string) {
  await page.goto(url); const assets = await ready(page);
  await page.waitForFunction(() => !!(window as any).__ruse);
  await page.screenshot({ path: join(shots, 'base.png'), fullPage: true });
  pass('Canvas loads all authored symbols, three character crops and the painted yard', { assets: assets.images.length, successfulImages: assets.images.filter((img: any) => img.loaded).length });
  const canvas = page.locator('#game'); const box = (await canvas.boundingBox())!;
  assert.ok(box.width > 750 && box.height > 500, 'Desktop reel stage occupies the display');
  const before = await canvas.screenshot();
  for (let reel = 0; reel < 6; reel++) for (let row = 0; row < 5; row++) await page.mouse.move(box.x + (200 + (reel + .5) * 140) / 1240 * box.width, box.y + (154 + (row + .5) * 126) / 900 * box.height);
  const after = await canvas.screenshot(); assert.equal(sha(after), sha(before));
  assert.equal(await canvas.getAttribute('title'), null); assert.equal(await canvas.evaluate(el => getComputedStyle(el).cursor), 'default');
  pass('All 30 grid boxes are non-hoverable: no pixel changes, title or pointer cursor');
  await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'), 'en'); assert.equal(await page.locator('#balance-label').textContent(), 'BALANCE');
  assert.match((await page.locator('#balance').textContent())!, /€10,000\.00/);
  await page.reload(); await ready(page); assert.equal((await snapshot(page)).language, 'en');
  await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'), 'bg'); assert.match((await page.locator('#balance').textContent())!, /€/);
  pass('BG / EN setting persists across reload and all displayed credits use EUR');
  await page.locator('#turbo').click(); assert.equal((await snapshot(page)).turbo, true);

  if (!tailOnly) {
  const doubleClick = expected(42, { kind: 'spin' }); await reset(page, 42); await gate(page, { stage: 'drop' });
  await page.locator('#spin').click({ clickCount: 2 }); await held(page);
  assert.deepEqual((await snapshot(page)).pending, doubleClick.pending);
  pass('Two immediate Spin clicks create one committed round and one debit');
  await finish(page, doubleClick, 'Rapid double-click spin');

  for (const character of ['left', 'middle', 'right'] as Character[]) {
    const fixture = find({ kind: 'xbet', character }, round => features(round).some(f => f.character === character && (character !== 'right' || f.coins.length > 0)));
    await reset(page, fixture.seed); await gate(page, { kind: 'reveal', character, min: .12, max: .8 });
    await choose(page, { kind: 'xbet', character }); await held(page);
    const pending = (await snapshot(page)).pending!;
    assert.deepEqual(pending, fixture.session.pending); assert.ok(pending.spins[0].initialGrid.flat().includes(character));
    assert.equal((await snapshot(page)).displayedBalance, rich - costCents(20, { kind: 'xbet', character }));
    pass(`${character} xBet guarantees its badge, charges its own configured price and reveals before acting`);
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
    await release(page); await gate(page, { kind: character === 'left' ? 'wild' : character === 'middle' ? 'shot' : 'coin', character, min: .72, max: .99 }); await held(page);
    const board = await page.evaluate(() => (window as any).__ruse.board());
    const receiptFeatures = features(pending).filter(f => f.character === character);
    assert.ok(receiptFeatures.some(f => (character === 'right' ? f.coins.map(c => c.cell) : f.hits.map(h => h.cell)).some(cell => cell.reel === board.effect.target.reel && cell.row === board.effect.target.row)), 'Visible impact target comes from immutable receipt');
    if (character !== 'right') { assert.equal(board.grid[board.effect.target.reel][board.effect.target.row], 'wild'); assert.equal(board.wildMultipliers[board.effect.target.reel][board.effect.target.row], board.effect.value); }
    if (character === 'left') assert.ok(receiptFeatures.every(f => f.coins.length === 0), 'Left has Wild throws only');
    if (character === 'right') assert.ok(receiptFeatures.every(f => f.hits.length === 0), 'Right owns coin reveals');
    await capture(page, `character-${character}-impact`, fixture.seed, pending, 'Actual recorded Wild throw / shot / coin target after reveal.');
    pass(`${character} impact follows its recorded targets and exclusive feature role`);
    await finish(page, fixture.session, `${character} xBet`);
  }

  for (const tier of TIER_ORDER) {
    const seed = 37; const session = expected(seed, { kind: 'buy', tier });
    await reset(page, seed); await page.locator('#buy').click();
    assert.equal(await page.locator('[data-tier]').count(), 4);
    const card = page.locator(`[data-tier="${tier}"]`); assert.match((await card.textContent())!, new RegExp(`${CONFIG.buyCosts[tier]}×`));
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

  const repeated = find({ kind: 'xbet', character: 'middle' }, round => features(round).some(f => f.character === 'middle' && f.hits.some(hit => hit.repeated)));
  await reset(page, repeated.seed); await gate(page, { kind: 'shot', character: 'middle', min: .72, max: .98, repeated: true }); await choose(page, { kind: 'xbet', character: 'middle' });
  await held(page); const repeatedBoard = await page.evaluate(() => (window as any).__ruse.board());
  assert.ok(repeatedBoard.effect.value >= 2); assert.equal(repeatedBoard.wildMultipliers[repeatedBoard.effect.target.reel][repeatedBoard.effect.target.row], repeatedBoard.effect.value);
  pass('A repeated recorded shot visibly doubles its existing Wild multiplier');
  await capture(page, 'repeated-shot', repeated.seed, repeated.session.pending!, 'Repeated shooter impact displays the doubled recorded Wild multiplier.');
  await finish(page, repeated.session, 'Repeated-shooter fixture');

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
  await reset(page, threshold.seed); await choose(page, { kind: 'buy', tier: 'old' }); await page.evaluate(() => (window as any).__ruse.skip());
  for (const tier of [2, 3, 4]) {
    await gate(page, { tier }); await held(page);
    const displayed = await page.locator('#win-ratio').textContent(); const ratio = Number(displayed!.replace(/[×\s]/g, '').replace(',', '.'));
    assert.ok(ratio >= (tier === 2 ? 100 : tier === 3 ? 500 : 1000));
    assert.equal(await page.locator('.win-person').count(), 3);
    const visible = await page.locator('.win-person').evaluateAll(images => images.map(img => ({ opacity: Number(getComputedStyle(img).opacity), complete: (img as HTMLImageElement).complete, width: (img as HTMLImageElement).naturalWidth })));
    assert.ok(visible.every(img => img.complete && img.width > 0));
    await capture(page, `win-${tier === 2 ? 100 : tier === 3 ? 500 : 1000}`, threshold.seed, threshold.session.pending!, `Actual count-up crossing ${tier === 2 ? 100 : tier === 3 ? 500 : 1000}×; CSS cutscene escalation is driven by the counted amount.`);
    pass(`Count-up genuinely crosses ${tier === 2 ? 100 : tier === 3 ? 500 : 1000}× and advances its cutscene stage`, { ratio, visible });
    await release(page);
  }
  await finish(page, threshold.session, 'Large recorded win count-up');
  }

  const god = find({ kind: 'god' }, round => round.maxWin);
  await reset(page, god.seed); await gate(page, { kind: 'god', min: .44, max: .95 }); await choose(page, { kind: 'god' }); await held(page);
  assert.equal((await snapshot(page)).pending!.payoutCents, 20 * 19999);
  pass('God Mode uses recorded hit shots to award exactly 19,999×, with its actual car-entry cutscene');
  await capture(page, 'god-shot', god.seed, god.session.pending!, 'Real God shot trajectory; payout comes from the engine hit receipt.');
  await page.evaluate(() => { const p = (window as any).__probe; p.release(); p.gate = { tier: 4 }; (window as any).__ruse.skip(); });
  await held(page); await page.locator('#win-continue').click();
  assert.match((await page.locator('#modal-title').textContent())!, /MAX WIN/); assert.equal(await page.locator('#win-scene').evaluate(el => el.classList.contains('max-win')), true);
  assert.match((await page.locator('#win-counter').textContent())!, /3\s?999[,\.]80/);
  await capture(page, 'max-win', god.seed, god.session.pending!, 'Settled genuine 19,999× max receipt: €3,999.80 on a €0.20 base bet.');
  pass('Max-win cutscene shows the exact capped EUR amount and remains until Continue');
  await finish(page, god.session, 'God maximum win');

  await reset(page, 8); await page.locator('#settings').click();
  await page.locator('#settings-language').selectOption('en');
  await page.locator('#volume').evaluate(element => { const input = element as HTMLInputElement; input.value = '31'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#default-music').uncheck();
  await page.locator('input[data-audio="shot"]').setInputFiles({ name: 'test-shot.wav', mimeType: 'audio/wav', buffer: wav() });
  await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'test-shot.wav', undefined, { timeout: 15000, polling: 50 });
  assert.equal(await page.locator('[data-remove="shot"]').isEnabled(), true);
  await page.locator('#dialog-close').click(); await page.locator('#mute').click(); await page.reload(); await ready(page); await page.locator('#settings').click();
  await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'test-shot.wav', undefined, { polling: 50 });
  assert.equal(await page.locator('#volume').inputValue(), '31'); assert.equal(await page.locator('#default-music').isChecked(), false); assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
  pass('Uploaded real WAV, volume, mute and synth setting persist via local IndexedDB / preferences');
  await page.screenshot({ path: join(shots, 'local-audio-settings.png'), fullPage: true });
  await page.locator('[data-remove="shot"]').click(); await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'Bundled synth', undefined, { polling: 50 });
  await page.locator('#dialog-close').click(); await page.reload(); await ready(page); await page.locator('#settings').click(); assert.equal(await page.locator('[data-remove="shot"]').isDisabled(), true);
  pass('Removing local audio deletes its stored track across reload'); await page.locator('#dialog-close').click();

  await page.setViewportSize({ width: 400, height: 840 }); await page.screenshot({ path: join(shots, 'mobile.png'), fullPage: true });
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: document.getElementById('game')!.getBoundingClientRect().width, buttons: ['spin', 'buy', 'god', 'settings'].map(id => { const b = document.getElementById(id)!.getBoundingClientRect(); return { id, width: b.width, x: b.x, right: b.right }; }) }));
  assert.ok(size.scroll <= size.width + 1); assert.ok(size.canvas > 350); assert.ok(size.buttons.every(b => b.width >= 30 && b.x >= -1 && b.right <= 401));
  pass('400×840 mobile layout retains large reels and reachable controls without horizontal overflow', size);
}

async function production(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const file = join(root, 'release/PLAY.html');
  if (!existsSync(file)) throw new Error('Run npm run build before browser checks: release/PLAY.html is required');
  const html = await readFile(file, 'utf8'); assert.ok(html.length > 100000); assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)="(?:https?:|\.\/assets)/.test(html));
  const context = await browser.newContext({ viewport: { width: 1300, height: 1050 } }); await probe(context, true); let page = await context.newPage();
  let staticServer: ReturnType<typeof createHTTPServer> | undefined;
  try {
  directFileLaunch.attempted = true;
  try { await page.goto(pathToFileURL(file).href); directFileLaunch.verified = true; }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    directFileLaunch.limitation = 'Cloud Chromium managed policy blocks file:// navigation (ERR_BLOCKED_BY_ADMINISTRATOR). The exact self-contained HTML is checked over a private static loopback server; direct file-origin launch remains unverified in this environment.';
    for (let index = failures.length - 1; index >= 0; index--) if (failures[index].includes('file: file:') && failures[index].includes('ERR_BLOCKED_BY_ADMINISTRATOR')) failures.splice(index, 1);
    staticServer = createHTTPServer((request, response) => {
      if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); }
      else if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); }
      else { response.writeHead(404); response.end(); }
    });
    await new Promise<void>(ok => staticServer!.listen(0, '127.0.0.1', ok));
    await page.close(); page = await context.newPage();
    await page.goto(`http://127.0.0.1:${(staticServer.address() as { port: number }).port}/`);
    console.log(`LIMITATION: ${directFileLaunch.limitation}`);
  }
  await ready(page); assert.equal(await page.evaluate(() => '__ruse' in window), false);
  pass('Exact self-contained PLAY.html loads all inline art and has no development hooks', directFileLaunch);
  const seed = 42; const initial = createSession(seed, rich);
  await page.evaluate(session => { localStorage.setItem('ot-staroto-session-v1', JSON.stringify(session)); localStorage.setItem('ot-staroto-settings-v1', JSON.stringify({ language: 'en', turbo: true, muted: true })); }, initial);
  await page.reload(); await ready(page);
  const choice: Choice = { kind: 'buy', tier: 'ruse' }; const settled = playRound(initial, choice);
  await page.locator('#buy').click(); await page.locator('[data-tier="ruse"]').click(); await page.locator('#confirm-play').click();
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending, undefined, { polling: 20 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), settled);
  await page.reload(); await ready(page); await page.locator('#game').click();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending || !!document.getElementById('win-continue'), undefined, { timeout: 20000, polling: 40 });
    if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click();
    else break;
  }
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending, undefined, { polling: 40 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), acknowledgeRound(settled));
  await page.reload(); await ready(page); assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), acknowledgeRound(settled));
  pass('Standalone purchased bonus survives pending reload, charges once and settles exact engine credits / RNG');
  const next = playRound(acknowledgeRound(settled), { kind: 'spin' }); await page.locator('#spin').click(); await page.locator('#game').click();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending || !!document.getElementById('win-continue'), undefined, { timeout: 20000, polling: 40 });
    if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click(); else break;
  }
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), acknowledgeRound(next));
  pass('Standalone base game remains playable after bought-bonus reload and settlement');
  const xbet = playRound(acknowledgeRound(next), { kind: 'xbet', character: 'left' });
  await page.locator('#xbet').selectOption('left'); await page.locator('#spin').click(); await page.locator('#confirm-play').click();
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending, undefined, { polling: 20 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), xbet);
  await page.locator('#game').click();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ot-staroto-session-v1')!).pending || !!document.getElementById('win-continue'), undefined, { timeout: 20000, polling: 40 });
    if (await page.locator('#win-continue').count()) await page.locator('#win-continue').click(); else break;
  }
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ot-staroto-session-v1')!)), acknowledgeRound(xbet));
  pass('Standalone xBet guarantees its selected character and settles exact cents and RNG');
  await page.locator('#settings').click();
  await page.locator('input[data-audio="shot"]').setInputFiles({ name: 'offline-shot.wav', mimeType: 'audio/wav', buffer: wav() });
  await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'offline-shot.wav', undefined, { polling: 50 });
  await page.locator('#dialog-close').click(); await page.reload(); await ready(page); await page.locator('#settings').click();
  await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'offline-shot.wav', undefined, { polling: 50 });
  await page.locator('[data-remove="shot"]').click(); await page.waitForFunction(() => document.getElementById('file-shot')?.textContent === 'Bundled synth', undefined, { polling: 50 });
  await page.locator('#dialog-close').click();
  pass('Standalone decodes a local WAV and retains / removes it through IndexedDB across reload');
  assert.ok(productionRequests.every(url => new URL(url).pathname === '/'), 'Standalone does not request separate art, CSS, JavaScript, fonts or audio');
  await page.screenshot({ path: join(shots, 'standalone.png'), fullPage: true });
  } finally { await context.close(); if (staticServer?.listening) await new Promise<void>(ok => staticServer!.close(() => ok())); }
}

await mkdir(output, { recursive: true }); await mkdir(shots, { recursive: true });
const productionOnly = process.argv.includes('--production-only');
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1180 } }); await probe(context); const page = await context.newPage(); await development(page, url); await context.close();
  }
  await production(browser);
  assert.deepEqual(jsErrors, [], 'No JavaScript page errors'); assert.deepEqual(failures, [], 'No failed image / font / audio requests'); assert.deepEqual(externalRequests, [], 'No external network dependencies');
  pass('No JavaScript errors, asset failures or external network requests; standalone requires no secondary resources');
  const source = await sourceHashes();
  if (!tailOnly) assert.deepEqual(source, initialSourceHashes, 'Source must stay frozen throughout verified browser checks');
  const report = { capturedAt: new Date().toISOString(), variant: 'ot-staroto', mode: productionOnly ? 'production-only' : tailOnly ? 'tail-diagnostic' : 'full', checksPassed: checks.length, checks, sourceHashes: source, captures, jsErrors, assetFailures: failures, externalRequests, production: { path: 'release/PLAY.html', sha256: sha(await readFile(join(root, 'release/PLAY.html'))), directFileLaunch, requests: productionRequests } };
  await writeFile(join(output, productionOnly ? 'production-browser.json' : tailOnly ? 'browser-tail.json' : 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  if (!productionOnly && !tailOnly) await writeFile(join(root, 'docs/browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verified ${checks.length} browser checks; ${captures.length} documented receipt screenshots.`);
} catch (error) {
  await writeFile(join(output, 'browser-failure.json'), JSON.stringify({ checksPassed: checks.length, checks, error: error instanceof Error ? error.stack : String(error), jsErrors, assetFailures: failures, externalRequests, serverOutput: serverOutput.slice(-4000) }, null, 2));
  throw error;
} finally { await browser.close(); server?.kill(); }
