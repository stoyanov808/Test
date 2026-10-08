import type { SymbolId } from '../engine/types';

/** Original Studentski Grad illustrations; regular symbols use the painted v3 atlas. */
export const ART_PALETTE = {
  ink: '#111916', paper: '#eee8ce', ochre: '#d9a23b', rust: '#bd503d',
  mint: '#78c5a0', skin: '#bd9370', shadow: '#413d31', grey: '#7b8373',
} as const;

export const SYMBOL_LABELS: Record<string, string> = {
  book: 'КОНСПЕКТ', coffee: 'КАФЕ', noodles: 'БЪРЗА ВЕЧЕРЯ', doner: 'ДЮНЕР', beer: 'БИРА',
  female: 'КОЛЕЖКАТА', male: 'СЕСИЯТА', dj: 'DJ', couple: 'ДВОЙКАТА', bouncer: 'ОХРАНАТА',
  wild: 'ПИЯНИЯТ КОЛЕГА', scatter: 'ПОКАНА ЗА КУПОН', vip: 'VIP ПРОПУСК',
  bomb: 'КУПОННА БОМБА', xways: 'ДВОЕН СИМВОЛ', infectious: 'ЗАРАЗЕН КУПОН', shot: 'ТОЧЕН УДАР',
};

export const SYMBOLS: SymbolId[] = ['book', 'coffee', 'noodles', 'doner', 'beer', 'female', 'male', 'dj', 'bouncer', 'wild', 'scatter', 'vip'];
export const ART_SYMBOL_IDS = [...SYMBOLS, 'bomb', 'xways', 'infectious', 'infectious-upgraded', 'shot', 'wild-tall'] as const;
export type SceneName = 'base' | 'dorm' | 'friday' | 'december';
const featureAssetBase = `${import.meta.env.BASE_URL}art-v2/`;
const paintedAssetBase = `${import.meta.env.BASE_URL}art-v3/`;
export const ART_REVISION = '5.2';
// Transparent gutters protect tile borders; this scale restores full reel legibility.
const SYMBOL_DISPLAY_SCALE = 1.2;
export const ATLAS_SYMBOL_IDS = ['book', 'coffee', 'noodles', 'doner', 'beer', 'female', 'male', 'dj', 'bouncer'] as const;
export const SYMBOL_ATLAS_SIZE = { width: 1254, height: 1254, columns: 3, rows: 3 } as const;
export const SCENE_ATLAS_SIZE = { width: 1254, height: 1254, columns: 2, rows: 2 } as const;
export function symbolAtlasUrl(): string { return `${paintedAssetBase}symbol-atlas.png?v=${ART_REVISION}`; }
export function sceneAtlasUrl(): string { return `${paintedAssetBase}scene-atlas.png?v=${ART_REVISION}`; }
/** Feature icons retain their strong, recognisable vector silhouettes. */
export function symbolAssetUrl(symbol: string): string { return `${featureAssetBase}${symbol}.svg?v=${ART_REVISION}`; }

export interface AtlasCell { symbol: string; index: number; column: number; row: number; x: number; y: number; width: number; height: number }
/** Exact source pixels also recorded in public/art-v3/manifest.json. */
export function symbolAtlasCell(symbol: string): AtlasCell | null {
  const index = (ATLAS_SYMBOL_IDS as readonly string[]).indexOf(symbol);
  if (index < 0) return null;
  const column = index % 3, row = Math.floor(index / 3);
  const width = SYMBOL_ATLAS_SIZE.width / 3, height = SYMBOL_ATLAS_SIZE.height / 3;
  return { symbol, index, column, row, x: column * width, y: row * height, width, height };
}
const SCENE_IDS: SceneName[] = ['base', 'dorm', 'friday', 'december'];
export function sceneAtlasCell(tier: string | null = 'base'): AtlasCell {
  const index = Math.max(0, SCENE_IDS.indexOf(tier as SceneName)), symbol = SCENE_IDS[index];
  const column = index % 2, row = Math.floor(index / 2);
  const width = SCENE_ATLAS_SIZE.width / 2, height = SCENE_ATLAS_SIZE.height / 2;
  return { symbol, index, column, row, x: column * width, y: row * height, width, height };
}
export const SCENE_URLS: Record<SceneName, string> = {
  base: sceneAtlasUrl(), dorm: sceneAtlasUrl(), friday: sceneAtlasUrl(), december: sceneAtlasUrl(),
};

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
/** One clipped vector viewport references the local PNG; the bitmap is never duplicated. */
export function symbolArtworkMarkup(symbol: string, label = '', className = '', decorative = false): string {
  const cell = symbolAtlasCell(symbol), classAttribute = escapeAttribute(className);
  const accessibility = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escapeAttribute(label)}"`;
  if (!cell) return `<img class="${classAttribute}" src="${escapeAttribute(symbolAssetUrl(symbol))}" ${decorative ? 'alt=""' : `alt="${escapeAttribute(label)}"`} width="88" height="88" draggable="false">`;
  const gutterX = (SYMBOL_DISPLAY_SCALE - 1) * cell.width / 2, gutterY = (SYMBOL_DISPLAY_SCALE - 1) * cell.height / 2;
  return `<svg class="${classAttribute}" data-art-symbol="${escapeAttribute(symbol)}" ${accessibility} width="88" height="88" viewBox="0 0 ${cell.width} ${cell.height}" overflow="hidden"><image href="${escapeAttribute(symbolAtlasUrl())}" x="${-cell.x * SYMBOL_DISPLAY_SCALE - gutterX}" y="${-cell.y * SYMBOL_DISPLAY_SCALE - gutterY}" width="${SYMBOL_ATLAS_SIZE.width * SYMBOL_DISPLAY_SCALE}" height="${SYMBOL_ATLAS_SIZE.height * SYMBOL_DISPLAY_SCALE}" preserveAspectRatio="none"/></svg>`;
}
/** Slice only the selected tile. A clipped SVG viewport cannot expose its neighbours. */
export function sceneBackdropMarkup(tier: string | null = 'base'): string {
  const cell = sceneAtlasCell(tier);
  return `<svg data-art-scene="${cell.symbol}" aria-hidden="true" viewBox="0 0 ${cell.width} ${cell.height}" preserveAspectRatio="xMidYMid slice" overflow="hidden"><image href="${escapeAttribute(sceneAtlasUrl())}" x="${-cell.x}" y="${-cell.y}" width="${SCENE_ATLAS_SIZE.width}" height="${SCENE_ATLAS_SIZE.height}" preserveAspectRatio="none"/></svg>`;
}

let sceneImage: HTMLImageElement | undefined;
export function getSceneImage(_tier: string | null = 'base'): HTMLImageElement {
  if (!sceneImage) {
    sceneImage = new Image(); sceneImage.decoding = 'async'; sceneImage.src = sceneAtlasUrl();
  }
  return sceneImage;
}
export function drawScene(ctx: CanvasRenderingContext2D, tier: string | null, x: number, y: number, width: number, height: number): void {
  const scene = getSceneImage(tier);
  if (!scene.complete || !scene.naturalWidth) return;
  const cell = sceneAtlasCell(tier), scale = Math.max(width / cell.width, height / cell.height);
  const sw = width / scale, sh = height / scale;
  ctx.drawImage(scene, cell.x + (cell.width - sw) / 2, cell.y + (cell.height - sh) / 2, sw, sh, x, y, width, height);
}

let paintedSymbols: HTMLImageElement | undefined;
export function getSymbolAtlasImage(): HTMLImageElement {
  if (!paintedSymbols) {
    paintedSymbols = new Image(); paintedSymbols.decoding = 'async'; paintedSymbols.src = symbolAtlasUrl();
  }
  return paintedSymbols;
}
/** Shared decoded images avoid repeating bitmap and vector decoding on every reel. */
const featureImages = new Map<string, HTMLImageElement>();
function imageFor(symbol: string): HTMLImageElement {
  if (symbolAtlasCell(symbol)) return getSymbolAtlasImage();
  const name = symbol in SYMBOL_LABELS || symbol === 'wild-tall' || symbol === 'infectious-upgraded' ? symbol : 'book';
  if (name === 'book') return getSymbolAtlasImage();
  let image = featureImages.get(name);
  if (!image) {
    image = new Image(); image.decoding = 'async'; image.src = symbolAssetUrl(name);
    featureImages.set(name, image);
  }
  return image;
}

export class SymbolArtwork {
  readonly image = getSymbolAtlasImage();
  readonly whenReady: Promise<void>;
  ready = false;
  constructor() {
    const images = [...new Set(ART_SYMBOL_IDS.map(id => imageFor(id)))];
    this.whenReady = Promise.all(images.map(image => new Promise<void>(resolve => {
      const decoded = () => { void image.decode().catch(() => undefined).finally(resolve); };
      if (image.complete) { decoded(); return; }
      image.addEventListener('load', decoded, { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))).then(() => { this.ready = images.every(image => image.complete && image.naturalWidth > 0); });
  }
  draw(ctx: CanvasRenderingContext2D, symbol: string, cx: number, cy: number, width: number, height: number, _time = 0): void {
    const image = imageFor(symbol);
    if (!image.complete || !image.naturalWidth) return;
    const cell = symbolAtlasCell(symbol) ?? (image === this.image ? symbolAtlasCell('book') : null);
    if (cell) {
      const scale = Math.min(width / cell.width, height / cell.height) * SYMBOL_DISPLAY_SCALE, dw = cell.width * scale, dh = cell.height * scale;
      ctx.drawImage(image, cell.x, cell.y, cell.width, cell.height, cx - dw / 2, cy - dh / 2, dw, dh);
      return;
    }
    const scale = Math.min(width / 220, height / 240);
    ctx.drawImage(image, cx - 110 * scale, cy - 120 * scale, 220 * scale, 240 * scale);
  }
  drawWildPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time = 0): void {
    const image = imageFor('wild');
    if (!image.complete || !image.naturalWidth) return;
    ctx.drawImage(image, 45, 5, 120, 130, cx - size / 2, cy - size * 130 / 240, size, size * 130 / 120);
  }
  drawTallWild(ctx: CanvasRenderingContext2D, cx: number, cy: number, width: number, height: number): void {
    const image = imageFor('wild-tall');
    if (!image.complete || !image.naturalWidth) return;
    ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
  }
}

let previewArtwork: SymbolArtwork | undefined;
export function drawSymbolPreview(canvas: HTMLCanvasElement, symbol: string): void {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  previewArtwork ??= new SymbolArtwork();
  const dpr = Math.min(window.devicePixelRatio || 1, 2), size = 112;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
  previewArtwork.draw(ctx, symbol, size / 2, size / 2, 104, 104);
  const image = imageFor(symbol);
  if (!image.complete) image.addEventListener('load', () => drawSymbolPreview(canvas, symbol), { once: true });
}
