import actorAtlas1 from '../public/art/character-left-motion-c.png?url&inline';
import actorAtlas3 from '../public/art/character-left-motion-d.png?url&inline';
import actorAtlas5 from '../public/art/character-middle-motion-c.png?url&inline';
import actorAtlas7 from '../public/art/character-middle-motion-d.png?url&inline';
import actorAtlas8 from '../public/art/character-right-seated-a.png?url&inline';
import actorAtlas9 from '../public/art/character-right-seated-b.png?url&inline';
import actorAtlas10 from '../public/art/character-right-seated-c.png?url&inline';
import actorAtlas11 from '../public/art/character-right-seated-d.png?url&inline';
import frameMetadata from './character-frames.json';
import symbolAtlas from '../public/art/symbols-ink.png?url&inline';
import leftPreparation from '../public/art/character-left-motion-a.png?url&inline';
import leftAction from '../public/art/character-left-motion-b.png?url&inline';
import middlePreparation from '../public/art/character-middle-motion-a.png?url&inline';
import middleAction from '../public/art/character-middle-motion-b.png?url&inline';
import rightPreparation from '../public/art/character-right-motion-a.png?url&inline';

import club from '../public/art/student-club-ink.png?url&inline';
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
  /** Pelvis contact, relative to the source window, for seated LUX poses. */
  seatAnchorX?: number; seatAnchorY?: number;
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

// Sixteen distinct drawings per actor; LUX uses a wholly seated sequence.
// Metadata selects complete source windows without modifying raster pixels.
const atlasURLs: Record<string, string> = {
  'public/art/character-left-motion-a.png': leftPreparation,
  'public/art/character-left-motion-c.png': actorAtlas1,
  'public/art/character-left-motion-b.png': leftAction,
  'public/art/character-left-motion-d.png': actorAtlas3,
  'public/art/character-middle-motion-a.png': middlePreparation,
  'public/art/character-middle-motion-c.png': actorAtlas5,
  'public/art/character-middle-motion-b.png': middleAction,
  'public/art/character-middle-motion-d.png': actorAtlas7,
  'public/art/character-right-seated-a.png': actorAtlas8,
  'public/art/character-right-seated-b.png': actorAtlas9,
  'public/art/character-right-seated-c.png': actorAtlas10,
  'public/art/character-right-seated-d.png': actorAtlas11,
};
const animationSprites = {} as Record<Character, readonly ArtSprite[]>;
for (const character of ['left', 'middle', 'right'] as const) {
  animationSprites[character] = frameMetadata.frames[character].map(({ atlasRelativePath, ...geometry }) => ({ url: atlasURLs[atlasRelativePath], ...geometry }));
}
const poseIndex: Record<CharacterPose, number> = { idle: 0, reveal: 6, action: 8, recoil: 12 };
const portraits: Record<Character, ArtSprite> = {
  left: sprite(leftPreparation, [304, 21, 196, 198]), middle: sprite(middlePreparation, [324, 24, 201, 190]), right: sprite(rightPreparation, [362, 15, 202, 200]),
};
const sprites = {} as Record<SymbolId, ArtSprite>;
for (const regular of Object.keys(symbolRects) as Regular[]) sprites[regular] = sprite(symbolAtlas, symbolRects[regular]);
Object.assign(sprites, portraits, { wild: sprite(wild, [0, 0, 360, 360]), scatter: sprite(scatter, [0, 0, 360, 360]), max: sprite(max, [0, 0, 360, 360]) });
const dimensions = new Map<string, readonly [number, number]>([
  [symbolAtlas, [1254, 1254]], ...Object.entries(frameMetadata.dimensions).map(([file, size]) => [atlasURLs[file], size as [number, number]] as const),
  [rightPreparation, [1536, 1024]], [wild, [360, 360]], [scatter, [360, 360]], [max, [360, 360]],
]);
const cropURL = (value: ArtSprite): string => {
  const [width, height] = dimensions.get(value.url)!;
  return svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${value.width} ${value.height}"><image href="${value.url}" x="${-value.sx}" y="${-value.sy}" width="${width}" height="${height}"/></svg>`);
};
// Canvas callers share raw atlas decodes; cropped URL compatibility stays lazy.
const symbolURLs = new Map<SymbolId, string>();
const frameURLs = new Map<string, string>();
export const sceneURL = (_tier: Tier | null = null): string => club;
export const symbolSprite = (symbol: SymbolId): ArtSprite => sprites[symbol];
export const characterReleaseFrame = (_character: Character): number => frameMetadata.releaseFrame;
export const characterFrameCount = (character: Character): number => animationSprites[character].length;
export const characterFrameSprite = (character: Character, index: number): ArtSprite => animationSprites[character][Math.max(0, Math.min(characterFrameCount(character) - 1, Math.floor(index)))];
export const characterAnimationSprites = (character: Character, _animation: CharacterAnimation = 'feature'): readonly ArtSprite[] => animationSprites[character];
export const characterAnimationSprite = (character: Character, progress: number, _animation: CharacterAnimation = 'feature'): ArtSprite => characterFrameSprite(character, Math.floor(Math.max(0, Math.min(1, progress)) * characterFrameCount(character)));
export const characterSprite = (character: Character, pose: CharacterPose = 'idle'): ArtSprite => characterFrameSprite(character, poseIndex[pose]);
export const symbolURL = (symbol: SymbolId): string => {
  let value = symbolURLs.get(symbol);
  if (!value) { value = cropURL(sprites[symbol]); symbolURLs.set(symbol, value); }
  return value;
};
export const characterAnimationFrameURL = (character: Character, index: number): string => {
  const normalized = Math.max(0, Math.min(characterFrameCount(character) - 1, Math.floor(index))), key = `${character}:${normalized}`;
  let value = frameURLs.get(key);
  if (!value) { value = cropURL(characterFrameSprite(character, normalized)); frameURLs.set(key, value); }
  return value;
};
export const characterFrameURL = (character: Character, pose: CharacterPose): string => characterAnimationFrameURL(character, poseIndex[pose]);
export const characterURL = (character: Character): string => characterFrameURL(character, 'idle');
const coinURLs: Record<Coin['kind'], string> = { value: coin, collector, multiplier, global: globalCoin, empty: svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"/>') };
export const coinURL = (kind: Coin['kind']): string => coinURLs[kind];
export const carURL = car;
