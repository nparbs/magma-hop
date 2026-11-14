// Every sound is synthesized here. No audio files.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** Browsers only allow sound after a tap or key. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf || this.muted) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Pitch climbs gently with height so you can hear progress. */
  bounce(meters: number): void {
    const base = 320 + Math.min(500, meters * 0.12);
    this.tone(base, base * 1.6, 0.11, 'sine', 0.22);
  }
  ice(): void {
    this.tone(1400, 2200, 0.08, 'triangle', 0.12);
    this.tone(1800, 2600, 0.08, 'triangle', 0.08, 0.04);
  }
  spring(): void {
    this.tone(260, 1300, 0.35, 'square', 0.12);
    this.tone(390, 1900, 0.3, 'sine', 0.15, 0.02);
  }
  crumble(): void {
    this.noise(0.25, 0.3, 500, 0.8);
  }
  fake(): void {
    this.noise(0.3, 0.2, 1800, 0.5);
    this.tone(500, 200, 0.25, 'sine', 0.1);
  }
  stomp(): void {
    this.tone(180, 60, 0.18, 'square', 0.2);
    this.noise(0.12, 0.25, 900, 1);
  }
  warn(): void {
    this.noise(0.5, 0.06, 3000, 4);
  }
  strike(): void {
    this.noise(0.9, 0.55, 300, 0.4);
    this.tone(90, 40, 0.6, 'sawtooth', 0.2);
  }
  die(): void {
    this.tone(600, 80, 0.7, 'sawtooth', 0.18);
    this.noise(0.5, 0.35, 700, 0.6);
  }
  zone(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.35, 'triangle', 0.12, i * 0.09));
  }
  best(): void {
    [784, 1175].forEach((f, i) => this.tone(f, f, 0.3, 'sine', 0.14, i * 0.1));
  }
  click(): void {
    this.tone(700, 900, 0.05, 'sine', 0.1);
  }
}
