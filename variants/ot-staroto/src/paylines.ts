/** Transcribed from the user's Le Zeus Game Info chart on 9 October 2026.
 * Each path contains one zero-based row index per reel, left to right.
 * Numbering follows the supplied diagrams: seven, seven, then five paths.
 * Reference and transcription: docs/LE-ZEUS-REFERENCE.md. */
export const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4, 4],
  [0, 1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1, 2],
  [2, 3, 2, 3, 2, 3],
  [3, 4, 3, 4, 3, 4],
  [1, 0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2, 1],
  [3, 2, 3, 2, 3, 2],
  [4, 3, 4, 3, 4, 3],
  [0, 1, 2, 2, 1, 0],
  [1, 2, 3, 3, 2, 1],
  [2, 3, 4, 4, 3, 2],
  [4, 3, 2, 2, 3, 4],
  [3, 2, 1, 1, 2, 3],
  [2, 1, 0, 0, 1, 2],
];
export const PAYLINE_REFERENCE_READY = true;
