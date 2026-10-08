import symbolAtlas from '../public/art/symbols-premium.png?url&inline';
import leftAtlas from '../public/art/character-left-actions.png?url&inline';
import middleAtlas from '../public/art/character-middle-actions.png?url&inline';
import rightAtlas from '../public/art/character-right-actions.png?url&inline';
import yard from '../public/art/ruse-yard.png?url&inline';
import wild from '../public/art/wild-premium.svg?url&inline';
import scatter from '../public/art/scatter-premium.svg?url&inline';
import max from '../public/art/max.svg?url&inline';
import car from '../public/art/getaway-car.png?url&inline';
import coin from '../public/art/coin.svg?url&inline';
import collector from '../public/art/collector.svg?url&inline';
import multiplier from '../public/art/coin-multiplier.svg?url&inline';
import globalCoin from '../public/art/coin-global.svg?url&inline';
import type { Character, Coin, Regular, SymbolId, Tier } from './types';

export type CharacterPose = 'idle' | 'reveal' | 'action' | 'recoil';
export interface ArtSprite {
  url: string; sx: number; sy: number; width: number; height: number;
  /** Consistent body width and foot anchor prevent action arms shrinking a character. */
  referenceWidth?: number; anchorX?: number;
}
const svgURL = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const atlases: Record<Character, string> = { left: leftAtlas, middle: middleAtlas, right: rightAtlas };
const sprite = (url: string, rect: readonly number[], referenceWidth?: number, anchorX?: number): ArtSprite => ({ url, sx: rect[0], sy: rect[1], width: rect[2], height: rect[3], referenceWidth, anchorX });

// Tight display windows into the intact 1225×1284 PNG. No source pixels are edited.
const symbolRects: Record<Regular, readonly number[]> = {
  bottle: [98, 66, 225, 378], cash: [434, 153, 352, 268], chain: [850, 138, 330, 287],
  cassette: [29, 539, 367, 274], sneaker: [433, 516, 357, 307], crown: [832, 498, 367, 315],
  lighter: [43, 856, 324, 355], dice: [463, 943, 311, 266], ring: [854, 921, 318, 296],
};
// Four articulated drawings per 1536×1024 atlas, in idle/reveal/action/recoil order.
// Crops exclude detached throw tokens: the receipt-driven projectile is drawn by the renderer.
const bodyRects: Record<Character, Record<CharacterPose, readonly number[]>> = {
  left: { idle: [205, 12, 405, 499], reveal: [950, 30, 510, 484], action: [110, 522, 648, 480], recoil: [945, 526, 475, 480] },
  middle: { idle: [265, 22, 355, 498], reveal: [905, 72, 412, 449], action: [155, 522, 680, 476], recoil: [916, 522, 460, 480] },
  right: { idle: [302, 1, 355, 512], reveal: [968, 8, 330, 505], action: [231, 524, 497, 488], recoil: [925, 509, 365, 511] },
};
const anchors: Record<Character, Record<CharacterPose, number>> = {
  left: { idle: 200, reveal: 240, action: 270, recoil: 235 },
  middle: { idle: 180, reveal: 206, action: 250, recoil: 230 },
  right: { idle: 180, reveal: 164, action: 286, recoil: 184 },
};
const characterSprites = {} as Record<Character, Record<CharacterPose, ArtSprite>>;
for (const character of ['left', 'middle', 'right'] as const) {
  characterSprites[character] = {} as Record<CharacterPose, ArtSprite>;
  for (const pose of ['idle', 'reveal', 'action', 'recoil'] as const) {
    characterSprites[character][pose] = sprite(atlases[character], bodyRects[character][pose], character === 'left' ? 405 : 355, anchors[character][pose]);
  }
}
const portraits: Record<Character, ArtSprite> = {
  left: sprite(leftAtlas, [275, 12, 240, 230]), middle: sprite(middleAtlas, [312, 25, 240, 220]), right: sprite(rightAtlas, [326, 2, 250, 230]),
};
const sprites = {} as Record<SymbolId, ArtSprite>;
for (const regular of Object.keys(symbolRects) as Regular[]) sprites[regular] = sprite(symbolAtlas, symbolRects[regular]);
Object.assign(sprites, portraits, { wild: sprite(wild, [0, 0, 360, 360]), scatter: sprite(scatter, [0, 0, 360, 360]), max: sprite(max, [0, 0, 360, 360]) });
const dimensions = new Map<string, readonly [number, number]>([[symbolAtlas, [1225, 1284]], [leftAtlas, [1536, 1024]], [middleAtlas, [1536, 1024]], [rightAtlas, [1536, 1024]], [wild, [360, 360]], [scatter, [360, 360]], [max, [360, 360]]]);
const cropURL = (value: ArtSprite): string => {
  const [width, height] = dimensions.get(value.url)!;
  return svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${value.width} ${value.height}"><image href="${value.url}" x="${-value.sx}" y="${-value.sy}" width="${width}" height="${height}"/></svg>`);
};
// URL caches are created lazily once. Canvas uses raw atlas sprites and never decodes duplicates.
const symbolURLs = new Map<SymbolId, string>();
const frameURLs = new Map<string, string>();
export const sceneURL = (_tier: Tier | null = null): string => yard;
export const symbolSprite = (symbol: SymbolId): ArtSprite => sprites[symbol];
export const characterSprite = (character: Character, pose: CharacterPose = 'idle'): ArtSprite => characterSprites[character][pose];
export const symbolURL = (symbol: SymbolId): string => {
  let value = symbolURLs.get(symbol);
  if (!value) { value = cropURL(sprites[symbol]); symbolURLs.set(symbol, value); }
  return value;
};
export const characterFrameURL = (character: Character, pose: CharacterPose): string => {
  const key = `${character}:${pose}`;
  let value = frameURLs.get(key);
  if (!value) { value = cropURL(characterSprites[character][pose]); frameURLs.set(key, value); }
  return value;
};
export const characterURL = (character: Character): string => characterFrameURL(character, 'idle');
const coinURLs: Record<Coin['kind'], string> = { value: coin, collector, multiplier, global: globalCoin, empty: svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"/>') };
export const coinURL = (kind: Coin['kind']): string => coinURLs[kind];
export const carURL = car;
