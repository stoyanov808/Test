import symbolAtlas from '../public/art/symbols-ink.png?url&inline';
import leftPreparation from '../public/art/character-left-motion-a.png?url&inline';
import leftAction from '../public/art/character-left-motion-b.png?url&inline';
import middlePreparation from '../public/art/character-middle-motion-a.png?url&inline';
import middleAction from '../public/art/character-middle-motion-b.png?url&inline';
import rightPreparation from '../public/art/character-right-motion-a.png?url&inline';
import rightAction from '../public/art/character-right-motion-b.png?url&inline';
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
export type CharacterAnimation = 'feature' | 'win';
export interface ArtSprite {
  url: string; sx: number; sy: number; width: number; height: number;
  /** Body dimensions and the foot anchor stay stable when an arm extends. */
  referenceWidth?: number; referenceHeight?: number; anchorX?: number; anchorY?: number;
  /** Source-window coordinates of the release palm or revolver barrel. */
  attachmentX?: number; attachmentY?: number;
}
const svgURL = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const sprite = (url: string, rect: readonly number[]): ArtSprite => ({ url, sx: rect[0], sy: rect[1], width: rect[2], height: rect[3] });

// These display windows keep the original 1254×1254 illustration intact.
// Thick ivory/black prop drawings share the characters' flat ink language.
const symbolRects: Record<Regular, readonly number[]> = {
  bottle: [70, 8, 295, 430], cash: [414, 65, 440, 364], chain: [873, 66, 365, 360],
  cassette: [10, 470, 425, 344], sneaker: [431, 444, 416, 379], crown: [864, 463, 385, 364],
  lighter: [23, 812, 365, 415], dice: [445, 841, 365, 377], ring: [875, 881, 346, 332],
};

// Eight separately illustrated key drawings: idle, anticipation, preparation,
// wind-up/aim, release, follow-through/recoil, recovery and settle.
// Two generously spaced 1536×1024 sheets per character keep hands and shoes
// inside each display window. No source pixels are edited or pose copies made.
const atlases: Record<Character, readonly [string, string]> = {
  left: [leftPreparation, leftAction], middle: [middlePreparation, middleAction], right: [rightPreparation, rightAction],
};
const bodyRects: Record<Character, readonly (readonly number[])[]> = {
  left: [[212, 21, 374, 484], [919, 37, 436, 468], [206, 536, 458, 463], [943, 517, 444, 481],
    [148, 30, 519, 458], [869, 30, 536, 458], [158, 534, 500, 465], [941, 502, 385, 497]],
  middle: [[280, 24, 301, 463], [935, 51, 336, 436], [271, 524, 375, 455], [935, 529, 371, 450],
    [237, 33, 464, 470], [931, 10, 396, 494], [241, 535, 484, 459], [984, 513, 327, 482]],
  right: [[324, 15, 329, 483], [896, 27, 335, 471], [329, 511, 346, 495], [897, 506, 346, 500],
    [202, 12, 466, 501], [881, 15, 490, 499], [246, 509, 427, 504], [921, 524, 428, 489]],
};
// Horizontal body anchors are expressed in the intact source atlas. Each frame
// has its own foot baseline; gestures cannot shift the actor or shrink its body.
const bodyAnchors: Record<Character, readonly number[]> = {
  left: [396, 1115, 415, 1120, 370, 1090, 385, 1135],
  middle: [438, 1103, 445, 1105, 425, 1130, 450, 1160],
  right: [488, 1070, 508, 1090, 462, 1170, 482, 1120],
};
const footBaselines: Record<Character, readonly number[]> = {
  left: [499, 499, 993, 992, 482, 482, 993, 993],
  middle: [481, 481, 973, 973, 497, 498, 988, 989],
  right: [492, 492, 1000, 1000, 507, 508, 1007, 1007],
};
const bodySizes: Record<Character, readonly [number, number]> = { left: [360, 485], middle: [290, 482], right: [330, 492] };
const releasePoints: Record<Character, readonly [number, number]> = { left: [645, 177], middle: [600, 178], right: [219, 169] };
const animationSprites = {} as Record<Character, readonly ArtSprite[]>;
for (const character of ['left', 'middle', 'right'] as const) {
  animationSprites[character] = bodyRects[character].map((rect, index) => {
    const value: ArtSprite = { ...sprite(atlases[character][Math.floor(index / 4)], rect), referenceWidth: bodySizes[character][0], referenceHeight: bodySizes[character][1], anchorX: bodyAnchors[character][index] - rect[0], anchorY: footBaselines[character][index] - rect[1] };
    if (index === 4) { value.attachmentX = releasePoints[character][0] - rect[0]; value.attachmentY = releasePoints[character][1] - rect[1]; }
    return value;
  });
}
const poseIndex: Record<CharacterPose, number> = { idle: 0, reveal: 3, action: 4, recoil: 6 };
const portraits: Record<Character, ArtSprite> = {
  left: sprite(leftPreparation, [304, 21, 196, 198]), middle: sprite(middlePreparation, [324, 24, 201, 190]), right: sprite(rightPreparation, [362, 15, 202, 200]),
};
const sprites = {} as Record<SymbolId, ArtSprite>;
for (const regular of Object.keys(symbolRects) as Regular[]) sprites[regular] = sprite(symbolAtlas, symbolRects[regular]);
Object.assign(sprites, portraits, { wild: sprite(wild, [0, 0, 360, 360]), scatter: sprite(scatter, [0, 0, 360, 360]), max: sprite(max, [0, 0, 360, 360]) });
const dimensions = new Map<string, readonly [number, number]>([
  [symbolAtlas, [1254, 1254]], ...Object.values(atlases).flatMap(pair => pair.map(url => [url, [1536, 1024]] as const)),
  [wild, [360, 360]], [scatter, [360, 360]], [max, [360, 360]],
]);
const cropURL = (value: ArtSprite): string => {
  const [width, height] = dimensions.get(value.url)!;
  return svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${value.width} ${value.height}"><image href="${value.url}" x="${-value.sx}" y="${-value.sy}" width="${width}" height="${height}"/></svg>`);
};
// Canvas callers use the six raw atlases directly and share their decodes.
// Cropped URL compatibility is lazy; it is not used to warm all 24 frames.
const symbolURLs = new Map<SymbolId, string>();
const frameURLs = new Map<string, string>();
export const sceneURL = (_tier: Tier | null = null): string => yard;
export const symbolSprite = (symbol: SymbolId): ArtSprite => sprites[symbol];
export const characterFrameCount = (character: Character): number => animationSprites[character].length;
export const characterFrameSprite = (character: Character, index: number): ArtSprite => animationSprites[character][Math.max(0, Math.min(7, Math.floor(index)))];
export const characterAnimationSprites = (character: Character, _animation: CharacterAnimation = 'feature'): readonly ArtSprite[] => animationSprites[character];
export const characterAnimationSprite = (character: Character, progress: number, _animation: CharacterAnimation = 'feature'): ArtSprite => characterFrameSprite(character, Math.floor(Math.max(0, Math.min(1, progress)) * 8));
export const characterSprite = (character: Character, pose: CharacterPose = 'idle'): ArtSprite => characterFrameSprite(character, poseIndex[pose]);
export const symbolURL = (symbol: SymbolId): string => {
  let value = symbolURLs.get(symbol);
  if (!value) { value = cropURL(sprites[symbol]); symbolURLs.set(symbol, value); }
  return value;
};
export const characterAnimationFrameURL = (character: Character, index: number): string => {
  const normalized = Math.max(0, Math.min(7, Math.floor(index))), key = `${character}:${normalized}`;
  let value = frameURLs.get(key);
  if (!value) { value = cropURL(characterFrameSprite(character, normalized)); frameURLs.set(key, value); }
  return value;
};
export const characterFrameURL = (character: Character, pose: CharacterPose): string => characterAnimationFrameURL(character, poseIndex[pose]);
export const characterURL = (character: Character): string => characterFrameURL(character, 'idle');
const coinURLs: Record<Coin['kind'], string> = { value: coin, collector, multiplier, global: globalCoin, empty: svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"/>') };
export const coinURL = (kind: Coin['kind']): string => coinURLs[kind];
export const carURL = car;
