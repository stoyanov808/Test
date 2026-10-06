/** Original, procedurally composed soundtrack. No samples, network assets or autoplay. */
export type AudioTier = 'base' | 'dorm' | 'friday' | 'december' | 'vip';

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private ambience: GainNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private road: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private tier: AudioTier = 'base';
  private muted = false;
  private volume = 0.45;
  private nextBeat = 0;
  private beat = 0;
  private nudgeStep = 0;
  private destroyed = false;

  /** Call directly from a pointer/key handler. Construction and settings stay silent. */
  async unlock(): Promise<void> {
    if (this.destroyed) return;
    if (!this.context) {
      const Ctor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 16;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.008;
      limiter.release.value = 0.16;
      this.master.connect(limiter);
      limiter.connect(context.destination);
      this.music = context.createGain();
      this.music.gain.value = 0.35;
      this.music.connect(this.master);
      this.ambience = context.createGain();
      this.ambience.gain.value = 0.035;
      this.ambience.connect(this.master);

      const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = noise.getChannelData(0);
      // Pinkish noise: street air, distant cars, paper, snare and hats share this source.
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        low = low * 0.965 + (Math.random() * 2 - 1) * 0.035;
        data[i] = low * 3.2;
      }
      this.noise = noise;
      this.roadFilter = context.createBiquadFilter();
      this.roadFilter.type = 'lowpass';
      this.roadFilter.frequency.value = 850;
      this.roadFilter.Q.value = 0.6;
      this.road = context.createBufferSource();
      this.road.buffer = noise;
      this.road.loop = true;
      this.road.connect(this.roadFilter);
      this.roadFilter.connect(this.ambience);
      this.road.start();
      this.nextBeat = context.currentTime + 0.06;
      this.applyTier();
      this.timer = setInterval(() => this.scheduleMusic(), 80);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.scheduleMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  setTier(tier: AudioTier | number): void {
    this.tier = typeof tier === 'number'
      ? (['base', 'dorm', 'friday', 'december'][Math.max(0, Math.min(3, tier))] as AudioTier)
      : tier;
    this.applyTier();
  }

  private applyVolume(): void {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.025);
  }

  private applyTier(): void {
    if (!this.context || !this.music || !this.ambience || !this.roadFilter) return;
    const time = this.context.currentTime;
    const mix = { base: 0.25, dorm: 0.40, friday: 0.50, december: 0.62, vip: 0.28 };
    this.music.gain.setTargetAtTime(mix[this.tier], time, 0.45);
    this.ambience.gain.setTargetAtTime(this.tier === 'base' ? 0.06 : 0.025, time, 0.55);
    this.roadFilter.frequency.setTargetAtTime(this.tier === 'base' ? 850 : 400, time, 0.6);
  }

  private tone(frequency: number, time: number, duration: number, amplitude = 0.1,
    type: OscillatorType = 'sine', destination?: AudioNode, endFrequency?: number): void {
    if (!this.context || !this.master) return;
    const context = this.context;
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(Math.max(15, frequency), time);
    if (endFrequency !== undefined) source.frequency.exponentialRampToValueAtTime(Math.max(15, endFrequency), time + duration);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(amplitude, time + Math.min(0.012, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(envelope);
    envelope.connect(destination || this.master);
    this.sources.add(source);
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  private hiss(time: number, duration: number, amplitude: number, frequency: number,
    type: BiquadFilterType = 'highpass', destination?: AudioNode): void {
    if (!this.context || !this.master || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.85;
    envelope.gain.setValueAtTime(amplitude, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination || this.master);
    this.sources.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    source.start(time, (this.beat % 16) * 0.11);
    source.stop(time + duration + 0.02);
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.music || this.destroyed) return;
    const music = this.music;
    // A background tab never queues a backlog of stale beats when it returns.
    if (this.nextBeat < context.currentTime - 0.2) this.nextBeat = context.currentTime + 0.03;
    const bpm = { base: 104, dorm: 112, friday: 122, december: 130, vip: 92 }[this.tier];
    const step = 60 / bpm / 2;
    while (this.nextBeat < context.currentTime + 0.18) {
      const time = this.nextBeat;
      const b = this.beat % 32;
      const root = [55, 65.406, 49, 58.27][Math.floor(b / 8)];
      if (b % 4 === 0 || (this.tier !== 'base' && this.tier !== 'vip' && b % 2 === 0)) {
        this.tone(115, time, 0.18, 0.22, 'sine', this.music, 40);
      }
      if (b % 2 === 0) {
        this.tone(root, time + 0.025, step * 1.6, this.tier === 'base' ? 0.11 : 0.15, 'triangle', this.music);
      }
      if (this.tier !== 'base' && this.tier !== 'vip') {
        this.hiss(time, 0.045, 0.12, 6500, 'highpass', this.music);
        if (b % 4 === 2) {
          this.hiss(time, 0.12, 0.17, 1500, 'bandpass', this.music);
          this.tone(190, time, 0.075, 0.045, 'triangle', this.music, 130);
        }
      }
      if (this.tier === 'friday' || this.tier === 'december') {
        const riff = [4, 0, 7, 12, 4, 7, 2, 0];
        const pitch = root * 4 * Math.pow(2, riff[b % 8] / 12);
        if (b % 2 === 1 || this.tier === 'december') this.tone(pitch, time, step * 0.74, 0.045, 'triangle', this.music);
      }
      if (this.tier === 'december' && b % 8 === 0) {
        [0, 3, 7].forEach(semitones => this.tone(root * 4 * Math.pow(2, semitones / 12), time, step * 3, 0.035, 'sine', music));
        this.hiss(time, 0.3, 0.14, 5400, 'highpass', this.music);
      }
      if (this.tier === 'vip' && b % 4 === 0) this.tone(root * 8, time, 0.8, 0.08, 'sine', this.music);
      this.nextBeat += step;
      this.beat++;
    }
  }

  /** All cues synthesize their own sound; game RNG is never used by the soundtrack. */
  cue(name: string, value?: number): void {
    if (!this.context || this.context.state !== 'running' || this.destroyed) return;
    const t = this.context.currentTime + 0.008;
    const cue = name.replace(/[-_ ]/g, '').toLowerCase();
    if (cue === 'reeltick' || cue === 'tick') {
      this.hiss(t, 0.016, 0.14, 3800, 'bandpass');
    } else if (cue === 'reelstop' || cue === 'stop') {
      this.nudgeStep = 0;
      this.tone(160 + (value ?? 1) * 18, t, 0.09, 0.16, 'triangle', undefined, 72);
      this.hiss(t, 0.05, 0.12, 1600, 'bandpass');
    } else if (cue === 'spin' || cue === 'reelstart') {
      this.hiss(t, 0.22, 0.13, 1100, 'bandpass');
      this.tone(140, t, 0.18, 0.10, 'sine', undefined, 330);
    } else if (cue === 'split' || cue === 'notes') {
      this.hiss(t, 0.07, 0.24, 2200, 'bandpass');
      this.hiss(t + 0.08, 0.09, 0.22, 4200, 'highpass');
      this.tone(700, t + 0.03, 0.08, 0.045, 'sine', undefined, 1100);
    } else if (cue === 'stumble' || cue === 'wild' || cue === 'nudge') {
      const pitch = 180 * Math.pow(2, Math.min(12, Math.max(0, (value ?? ++this.nudgeStep) - 1)) / 12);
      this.tone(pitch * 0.7, t, 0.18, 0.14, 'triangle', undefined, pitch);
      this.tone(pitch * 2, t + 0.15, 0.12, 0.06, 'sine');
      this.hiss(t + 0.08, 0.04, 0.10, 1400, 'bandpass');
    } else if (cue === 'win' || cue === 'chord') {
      [261.626, 329.628, 391.995, 523.251].forEach((f, i) => this.tone(f, t + i * 0.04, 0.55, 0.075, 'sine'));
    } else if (cue === 'bigwin' || cue === 'largewin') {
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(261.626 * Math.pow(2, n / 12), t + i * 0.11, 0.65, 0.075, 'triangle'));
      this.hiss(t, 0.9, 0.09, 4000, 'highpass');
    } else if (cue === 'bonus' || cue === 'transition' || cue === 'bonustransition' || cue === 'upgrade') {
      this.tone(110, t, 0.8, 0.12, 'triangle', undefined, 880);
      [293.665, 369.994, 440, 587.33].forEach((f, i) => this.tone(f, t + 0.30 + i * 0.08, 0.75, 0.09, 'sine'));
      this.hiss(t + 0.35, 0.5, 0.13, 5000, 'highpass');
    } else if (cue === 'vipreveal' || cue === 'reveal') {
      this.tone(220, t, 0.26, 0.12, 'sine', undefined, 660);
      this.hiss(t, 0.13, 0.11, 2400, 'bandpass');
    } else if (cue === 'viplock' || cue === 'lock') {
      this.tone(920, t, 0.26, 0.10, 'sine');
      this.tone(1380, t + 0.035, 0.32, 0.06, 'sine');
      this.tone(130, t, 0.07, 0.09, 'triangle', undefined, 60);
    } else if (cue === 'vipsuccess' || cue === 'maxwin' || cue === 'success') {
      [0, 7, 12, 16, 19, 24, 28, 31].forEach((n, i) => this.tone(196 * Math.pow(2, n / 12), t + i * 0.12, 1.0, 0.09, 'triangle'));
      [196, 246.942, 293.665, 392].forEach(f => this.tone(f, t + 0.78, 1.7, 0.10, 'sine'));
      this.hiss(t + 0.72, 1.1, 0.2, 5500, 'highpass');
    } else if (cue === 'vipmiss') {
      this.tone(120, t, 0.11, 0.055, 'triangle', undefined, 70);
      this.hiss(t, 0.045, 0.045, 600, 'bandpass');
    } else if (cue === 'fail' || cue === 'vipfail') {
      this.tone(220, t, 0.45, 0.10, 'triangle', undefined, 110);
    } else if (cue === 'click' || cue === 'button') {
      this.tone(620, t, 0.04, 0.04, 'sine');
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.road) {
      try { this.road.stop(); } catch { /* Already stopped. */ }
      this.road.disconnect();
    }
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Finished sources remove themselves. */ }
      source.disconnect();
    }
    this.sources.clear();
    this.master?.disconnect();
    this.music?.disconnect();
    this.ambience?.disconnect();
    this.roadFilter?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
