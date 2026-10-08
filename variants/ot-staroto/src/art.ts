import characters from '../public/art/characters.png?url&inline';
import yard from '../public/art/ruse-yard.png?url&inline';
import bottle from '../public/art/bottle.svg?url&inline';
import cash from '../public/art/cash.svg?url&inline';
import chain from '../public/art/chain.svg?url&inline';
import cassette from '../public/art/cassette.svg?url&inline';
import sneaker from '../public/art/sneaker.svg?url&inline';
import crown from '../public/art/crown.svg?url&inline';
import wild from '../public/art/wild.svg?url&inline';
import scatter from '../public/art/scatter.svg?url&inline';
import car from '../public/art/car.svg?url&inline';
import type { Character, SymbolId, Tier } from './types';

const columns: Record<Character, number> = { left: 0, middle: 1, right: 2 };
const width = 1862, height = 845, cellWidth = width / 3;
const svgURL = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const fullBodies = {} as Record<Character, string>;
const portraits = {} as Record<Character, string>;
for (const character of ['left', 'middle', 'right'] as const) {
  const x = columns[character] * cellWidth;
  // Layout crops from the original transparent atlas; the source PNG stays intact.
  fullBodies[character] = svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cellWidth} ${height}"><image href="${characters}" x="${-x}" width="${width}" height="${height}"/></svg>`);
  portraits[character] = svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 410"><image href="${characters}" x="${-x - cellWidth / 2 + 225}" width="${width}" height="${height}"/></svg>`);
}
const symbols: Record<SymbolId, string> = { bottle, cash, chain, cassette, sneaker, crown, wild, scatter, ...portraits };
export const sceneURL = (_tier: Tier | null = null): string => yard;
export const characterURL = (character: Character): string => fullBodies[character];
export const symbolURL = (symbol: SymbolId): string => symbols[symbol];
export const carURL = car;
