export type AudioSlot = 'music' | 'shot' | 'win' | 'feature';
export type SoundCue = 'drop' | 'shot' | 'win' | 'feature' | 'bonus' | 'max' | 'coin' | 'scatter' | 'cascade' | string;
export interface AudioTrack { slot: AudioSlot; name: string; blob: Blob }

const SLOTS: AudioSlot[] = ['music', 'shot', 'win', 'feature'];
const LIMIT = 50 * 1024 * 1024;

/** Local files stay in this browser. There is no network upload. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: AudioBufferSourceNode[] = [];
  private database: IDBDatabase | null = null;
  private tracks = new Map<AudioSlot, AudioTrack>();
  private buffers = new Map<AudioSlot, AudioBuffer>();
  private music: HTMLAudioElement | null = null;
  private musicURL: string | null = null;
  private timer: number | null = null;
  private step = 0;
  volume = .45;
  muted = false;
  defaultMusic = true;

  async initialize() {
    if (!('indexedDB' in window)) return;
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ot-staroto-local-audio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'slot' });
      request.onerror = () => reject(new Error('Audio storage unavailable'));
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<AudioTrack[]>((resolve, reject) => {
      const request = this.database!.transaction('tracks').objectStore('tracks').getAll();
      request.onsuccess = () => resolve(request.result as AudioTrack[]);
      request.onerror = () => reject(new Error('Audio storage unavailable'));
    });
    records.filter(track => SLOTS.includes(track.slot) && track.blob instanceof Blob).forEach(track => this.tracks.set(track.slot, track));
    this.syncMusic();
  }

  trackName(slot: AudioSlot) { return this.tracks.get(slot)?.name ?? null; }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.syncGain();
    }
    if (this.context.state !== 'running') await this.context.resume();
    this.syncMusic();
  }

  private async store(slot: AudioSlot, record: AudioTrack | null) {
    if (!this.database) throw new Error('Audio storage unavailable');
    await new Promise<void>((resolve, reject) => {
      const transaction = this.database!.transaction('tracks', 'readwrite');
      const object = transaction.objectStore('tracks');
      if (record) object.put(record); else object.delete(slot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Audio storage unavailable'));
      transaction.onabort = () => reject(new Error('Audio storage unavailable'));
    });
  }

  async upload(slot: AudioSlot, file: File) {
    if (!file.size || file.size > LIMIT) throw new Error('size');
    await this.unlock();
    let buffer: AudioBuffer;
    try { buffer = await this.context!.decodeAudioData(await file.arrayBuffer()); }
    catch { throw new Error('decode'); }
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('decode');
    const record: AudioTrack = { slot, name: file.name, blob: file };
    await this.store(slot, record);
    this.tracks.set(slot, record);
    this.buffers.set(slot, buffer);
    if (slot === 'music') this.replaceMusic();
  }

  async remove(slot: AudioSlot) {
    await this.store(slot, null);
    this.tracks.delete(slot);
    this.buffers.delete(slot);
    if (slot === 'music') this.replaceMusic();
  }

  async reset() { for (const slot of SLOTS) await this.remove(slot); }

  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); this.syncGain(); this.syncMusic(); }
  setMuted(muted: boolean) { this.muted = muted; this.syncGain(); this.syncMusic(); }
  setDefaultMusic(enabled: boolean) { this.defaultMusic = enabled; this.syncMusic(); }

  private syncGain() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, .012);
  }

  private replaceMusic() {
    this.music?.pause();
    this.music = null;
    if (this.musicURL) URL.revokeObjectURL(this.musicURL);
    this.musicURL = null;
    this.syncMusic();
  }

  private syncMusic() {
    if (!this.context || this.context.state !== 'running') return;
    const track = this.tracks.get('music');
    if (track && !this.music) {
      this.musicURL = URL.createObjectURL(track.blob);
      this.music = new Audio(this.musicURL);
      this.music.loop = true;
    }
    if (this.music) {
      this.music.volume = this.muted ? 0 : this.volume * .65;
      if (this.muted) this.music.pause(); else void this.music.play().catch(() => {});
    }
    const synth = !track && this.defaultMusic && !this.muted;
    if (synth && this.timer === null) {
      this.timer = window.setInterval(() => {
        const notes = [65.41, 65.41, 77.78, 65.41, 58.27, 58.27, 77.78, 87.31];
        this.tone(notes[this.step % notes.length], .2, 'triangle', .035);
        if (this.step % 2) this.noise(.045, .015);
        this.step++;
      }, 350);
    } else if (!synth && this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gain: number, endFrequency?: number) {
    if (!this.context || this.muted) return;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, this.context.currentTime + duration);
    volume.gain.setValueAtTime(gain, this.context.currentTime);
    volume.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
    oscillator.connect(volume).connect(this.master!);
    oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }

  private noise(duration: number, gain: number) {
    if (!this.context || this.muted) return;
    const count = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, count, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    // Audio noise has no connection to the game's random generator.
    for (let index = 0; index < count; index++) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const volume = this.context.createGain();
    volume.gain.value = gain;
    source.buffer = buffer; source.connect(volume).connect(this.master!); source.start();
  }

  async cue(cue: SoundCue) {
    if (!this.context || this.muted) return;
    const slot: AudioSlot = cue === 'shot' || cue === 'max' ? 'shot' : cue === 'win' || cue === 'coin' ? 'win' : 'feature';
    const track = this.tracks.get(slot);
    if (track) {
      try {
        let buffer = this.buffers.get(slot);
        if (!buffer) { buffer = await this.context.decodeAudioData(await track.blob.arrayBuffer()); this.buffers.set(slot, buffer); }
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        gain.gain.value = 1;
        if (this.voices.length >= 6) this.voices.shift()?.stop();
        this.voices.push(source);
        source.onended = () => { this.voices = this.voices.filter(voice => voice !== source); };
        source.buffer = buffer; source.connect(gain).connect(this.master!); source.start();
        // An uploaded full song must not become a minutes-long effect.
        source.stop(this.context.currentTime + Math.min(buffer.duration, slot === 'win' ? 8 : 3));
        return;
      } catch { /* Fall back to a short bundled synth cue. */ }
    }
    if (cue === 'shot' || cue === 'max') { this.noise(.13, .16); this.tone(125, .16, 'square', .09, 36); }
    else if (cue === 'win' || cue === 'coin') { this.tone(523, .2, 'sine', .1); window.setTimeout(() => this.tone(784, .22, 'sine', .08), 70); }
    else if (cue === 'bonus' || cue === 'feature') { [196, 246.94, 293.66].forEach((note, index) => window.setTimeout(() => this.tone(note, .28, 'triangle', .12), index * 80)); }
    else { this.noise(.035, .035); this.tone(cue === 'scatter' ? 440 : 92, .09, 'triangle', .055); }
  }
}
