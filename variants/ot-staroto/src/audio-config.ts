/**
 * Developer-owned audio. Replace files under public/audio and update this map.
 * Paths are relative to public/audio, so deployment under a subdirectory works.
 * All durations are seconds; gain is relative to the player's volume setting.
 */
export type AudioCue = 'drop' | 'cascade' | 'reveal' | 'coin' | 'shot' | 'feature' | 'bonus' | 'win' | 'max' | 'scatter' | 'music';

export interface AudioCueConfig {
  file: string;
  gain: number;
  rate: number;
  duration: number;
  /** Prevent a dense symbol batch from stacking dozens of identical attacks. */
  cooldownMs: number;
  fallback?: AudioCue;
}

export const AUDIO_CUES: Readonly<Record<AudioCue, AudioCueConfig>> = {
  drop:    { file: 'drop.wav',    gain: .45, rate: 1, duration: .23, cooldownMs: 45 },
  cascade: { file: 'cascade.wav', gain: .48, rate: 1, duration: .38, cooldownMs: 75, fallback: 'drop' },
  reveal:  { file: 'reveal.wav',  gain: .48, rate: 1, duration: .42, cooldownMs: 65, fallback: 'drop' },
  coin:    { file: 'coin.wav',    gain: .48, rate: 1, duration: .58, cooldownMs: 55, fallback: 'reveal' },
  shot:    { file: 'shot.wav',    gain: .7,  rate: 1, duration: .42, cooldownMs: 60, fallback: 'drop' },
  feature: { file: 'feature.wav', gain: .58, rate: 1, duration: 1.2, cooldownMs: 180, fallback: 'coin' },
  bonus:   { file: 'bonus.wav',   gain: .65, rate: 1, duration: 2.6, cooldownMs: 500, fallback: 'feature' },
  win:     { file: 'win.wav',     gain: .56, rate: 1, duration: 2.0, cooldownMs: 260, fallback: 'coin' },
  max:     { file: 'max.wav',     gain: .7,  rate: 1, duration: 3.6, cooldownMs: 600, fallback: 'win' },
  scatter: { file: 'scatter.wav', gain: .56, rate: 1, duration: .8, cooldownMs: 80, fallback: 'feature' },
  music:   { file: 'yard-loop.wav', gain: .19, rate: 1, duration: 12, cooldownMs: 0 },
};

export const AUDIO_MAX_EFFECT_VOICES = 12;
export const AUDIO_MAX_SAME_CUE_VOICES = 4;

/** Never use an absolute /audio URL: the game can live below a project path. */
export function audioFileURL(file: string) {
  const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
  return `${base}audio/${file}`;
}
