import { AUDIO_CUES, AUDIO_MAX_EFFECT_VOICES, AUDIO_MAX_SAME_CUE_VOICES, audioFileURL, type AudioCue, type AudioCueConfig } from './audio-config';

export type SoundCue = AudioCue | string;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  cue: AudioCue;
}

/** File-backed effects. Only unlock() creates a context, after a user gesture. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private music: Voice | null = null;
  private files = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private requestedAt = new Map<AudioCue, number>();
  private initialization: Promise<void> | null = null;
  private unlocking: Promise<void> | null = null;
  private effectEpoch = 0;
  private musicEpoch = 0;
  volume = .45;
  muted = false;
  defaultMusic = true;

  initialize(): Promise<void> {
    // Fetching does not create/resume an AudioContext or start any sound.
    this.initialization ??= Promise.all(
      [...new Set(Object.values(AUDIO_CUES).map(config => config.file))].map(file => this.loadFile(file)),
    ).then(() => {});
    return this.initialization;
  }

  unlock(): Promise<void> {
    if (this.unlocking) return this.unlocking;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return Promise.resolve();
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
      }
      // Call resume synchronously inside the user gesture, before any fetching.
      const resume = this.context.state === 'running' ? Promise.resolve() : this.context.resume();
      const operation = resume.then(async () => {
        // A first shot requested while unlock is pending waits for this operation.
        await Promise.all(Object.values(AUDIO_CUES).filter(config => config !== AUDIO_CUES.music).map(config => this.loadBuffer(config.file)));
        this.syncGain();
        void this.syncMusic();
      }).catch(() => {
        // A denied gesture or unavailable decoder cannot interrupt the game.
      });
      this.unlocking = operation;
      void operation.finally(() => { if (this.unlocking === operation) this.unlocking = null; });
      return operation;
    } catch {
      return Promise.resolve();
    }
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.syncGain();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.syncGain();
    if (muted) {
      // Pending decodes cannot start a stale shot after mute is selected.
      this.effectEpoch++;
      for (const voice of [...this.voices]) this.stopVoice(voice);
      this.voices = [];
    }
    void this.syncMusic();
  }

  setDefaultMusic(enabled: boolean) {
    this.defaultMusic = enabled;
    void this.syncMusic();
  }

  private syncGain() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, .012);
  }

  private loadFile(file: string): Promise<ArrayBuffer | null> {
    let pending = this.files.get(file);
    if (!pending) {
      pending = fetch(audioFileURL(file), { credentials: 'same-origin' })
        .then(response => response.ok ? response.arrayBuffer() : null)
        .catch(() => null);
      this.files.set(file, pending);
    }
    return pending;
  }

  private loadBuffer(file: string): Promise<AudioBuffer | null> {
    if (!this.context) return Promise.resolve(null);
    let pending = this.buffers.get(file);
    if (!pending) {
      const context = this.context;
      pending = this.loadFile(file).then(async bytes => {
        if (!bytes) return null;
        try { return await context.decodeAudioData(bytes.slice(0)); }
        catch { return null; }
      });
      this.buffers.set(file, pending);
    }
    return pending;
  }

  private async resolveCue(cue: AudioCue, visited = new Set<AudioCue>()): Promise<{ cue: AudioCue; config: AudioCueConfig; buffer: AudioBuffer } | null> {
    if (visited.has(cue)) return null;
    visited.add(cue);
    const config = AUDIO_CUES[cue];
    const buffer = await this.loadBuffer(config.file);
    if (buffer) return { cue, config, buffer };
    return config.fallback ? this.resolveCue(config.fallback, visited) : null;
  }

  private stopVoice(voice: Voice) {
    if (!this.context) return;
    try {
      const time = this.context.currentTime;
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setTargetAtTime(0, time, .006);
      voice.source.stop(time + .025);
    } catch { /* A source can finish between selection and stopping. */ }
  }

  private async syncMusic() {
    const epoch = ++this.musicEpoch;
    const shouldPlay = !this.muted && this.defaultMusic && this.context?.state === 'running';
    if (!shouldPlay) {
      if (this.music) this.stopVoice(this.music);
      this.music = null;
      return;
    }
    if (this.music) return;
    const resolved = await this.resolveCue('music');
    if (!resolved || epoch !== this.musicEpoch || this.muted || !this.defaultMusic || this.context?.state !== 'running' || !this.master) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = resolved.buffer;
    source.loop = true;
    source.playbackRate.value = resolved.config.rate;
    gain.gain.value = resolved.config.gain;
    source.connect(gain).connect(this.master);
    const voice: Voice = { source, gain, cue: 'music' };
    this.music = voice;
    source.onended = () => {
      if (this.music === voice) this.music = null;
      source.disconnect(); gain.disconnect();
    };
    source.start();
  }

  async cue(requested: SoundCue): Promise<void> {
    if (this.muted || !this.context) return;
    const cue: AudioCue = Object.hasOwn(AUDIO_CUES, requested) ? requested as AudioCue : 'drop';
    if (cue === 'music') { await this.syncMusic(); return; }
    const config = AUDIO_CUES[cue];
    const now = performance.now();
    if (now - (this.requestedAt.get(cue) ?? -Infinity) < config.cooldownMs) return;
    this.requestedAt.set(cue, now);
    const epoch = this.effectEpoch;
    if (this.unlocking) await this.unlocking;
    const resolved = await this.resolveCue(cue);
    if (!resolved || epoch !== this.effectEpoch || this.muted || this.context.state !== 'running' || !this.master) return;
    // Clip old attacks gently, keeping dense flips and shot volleys controlled.
    const sameCue = this.voices.filter(voice => voice.cue === cue);
    if (sameCue.length >= AUDIO_MAX_SAME_CUE_VOICES) {
      this.stopVoice(sameCue[0]);
      this.voices = this.voices.filter(voice => voice !== sameCue[0]);
    }
    if (this.voices.length >= AUDIO_MAX_EFFECT_VOICES) this.stopVoice(this.voices.shift()!);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = resolved.buffer;
    source.playbackRate.value = config.rate;
    gain.gain.value = config.gain;
    source.connect(gain).connect(this.master);
    const voice: Voice = { source, gain, cue };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter(active => active !== voice);
      source.disconnect(); gain.disconnect();
    };
    const start = this.context.currentTime;
    source.start(start);
    source.stop(start + Math.min(resolved.buffer.duration / config.rate, config.duration));
  }
}
