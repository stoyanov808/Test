import type { SymbolId } from '../engine/types';

/** All artwork is original SVG path geometry in public/art-v2; no image atlas. */
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
export const ART_SYMBOL_IDS = [...SYMBOLS, 'bomb', 'xways', 'infectious', 'shot', 'wild-tall'] as const;
export type SceneName = 'base' | 'dorm' | 'friday' | 'december';
const assetBase = `${import.meta.env.BASE_URL}art-v2/`;
export function symbolAssetUrl(symbol: string): string { return `${assetBase}${symbol}.svg`; }
export const SCENE_URLS: Record<SceneName, string> = {
  base: `${assetBase}scene-base.svg`, dorm: `${assetBase}scene-dorm.svg`,
  friday: `${assetBase}scene-friday.svg`, december: `${assetBase}scene-december.svg`,
};

const sceneImages = new Map<SceneName, HTMLImageElement>();
export function getSceneImage(tier: string | null = 'base'): HTMLImageElement {
  const name: SceneName = tier === 'dorm' || tier === 'friday' || tier === 'december' ? tier : 'base';
  let loaded = sceneImages.get(name);
  if (!loaded) {
    loaded = new Image(); loaded.decoding = 'async'; loaded.src = SCENE_URLS[name];
    sceneImages.set(name, loaded);
  }
  return loaded;
}

export function drawScene(ctx: CanvasRenderingContext2D, tier: string | null, x: number, y: number, width: number, height: number): void {
  const scene = getSceneImage(tier);
  if (!scene.complete || !scene.naturalWidth) return;
  const scale = Math.max(width / scene.naturalWidth, height / scene.naturalHeight);
  const sw = width / scale, sh = height / scale;
  ctx.drawImage(scene, (scene.naturalWidth - sw) / 2, (scene.naturalHeight - sh) / 2, sw, sh, x, y, width, height);
}

/** A shared cache avoids decoding individual vector files for every reel. */
const symbolImages = new Map<string, HTMLImageElement>();
function imageFor(symbol: string): HTMLImageElement {
  const name = symbol in SYMBOL_LABELS || symbol === 'wild-tall' ? symbol : 'book';
  let image = symbolImages.get(name);
  if (!image) {
    image = new Image(); image.decoding = 'async'; image.src = symbolAssetUrl(name);
    symbolImages.set(name, image);
  }
  return image;
}

export class SymbolArtwork {
  readonly image = imageFor('book');
  readonly whenReady: Promise<void>;
  ready = false;
  constructor() {
    this.whenReady = Promise.all(ART_SYMBOL_IDS.map(id => new Promise<void>(resolve => {
      const image = imageFor(id);
      if (image.complete) { resolve(); return; }
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))).then(() => { this.ready = true; });
  }
  draw(ctx: CanvasRenderingContext2D, symbol: string, cx: number, cy: number, width: number, height: number, _time = 0): void {
    const image = imageFor(symbol);
    if (!image.complete || !image.naturalWidth) return;
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
