// Every sound is synthesized here, music included. No audio files.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  /** Set up on the first tap, once there's an audio context to play into. */
  music: Music | null = null;
  private musicWanted = true;

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
      this.music = new Music(this.ctx, this.master, this.noiseBuf);
      this.music.setOn(this.musicWanted);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  get musicOn(): boolean {
    return this.musicWanted;
  }

  setMusic(on: boolean): void {
    this.musicWanted = on;
    this.music?.setOn(on);
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
    this.noise(0.7, 0.5, 220, 0.5);
    this.tone(80, 35, 0.5, 'square', 0.16);
  }
  /** A ride or a shell. */
  pickup(shield: boolean): void {
    if (shield) [880, 1320, 1760].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.12, i * 0.05));
    else {
      this.noise(0.9, 0.3, 1200, 0.5);
      this.tone(200, 900, 0.8, 'sine', 0.16);
    }
  }
  rideEnd(): void {
    this.noise(0.25, 0.18, 2400, 0.7);
    this.tone(900, 500, 0.2, 'sine', 0.1);
  }
  shieldBreak(): void {
    this.noise(0.3, 0.35, 3200, 1.5);
    this.tone(1500, 300, 0.3, 'triangle', 0.16);
  }
  die(lava = false): void {
    if (lava) {
      // A plop and a long sizzle.
      this.tone(220, 50, 0.4, 'sine', 0.3);
      this.noise(1.1, 0.4, 3500, 0.4);
      return;
    }
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

// ---------- Music: one loop per zone, crossfaded as you climb ----------

/**
 * One zone's loop, four bars of sixteen steps. Pattern strings have one character per step:
 * bass `x` plays the chord root, `o` an octave up, `5` the fifth; arp digits pick a chord tone
 * (0 root, 1 third, 2 fifth, 3 octave); drums `x` hit; `.` rests.
 */
interface Song {
  /** MIDI note of the key. */
  root: number;
  /** Semitones of the scale's seven steps. */
  scale: number[];
  /** Chord root per bar, as a scale step. */
  prog: number[];
  bass: string;
  bassWave: OscillatorType;
  arp: string;
  arpWave: OscillatorType;
  /** Octaves above the bass. */
  arpOct: number;
  /** Sustained chord under each bar. */
  pad: boolean;
  kick: string;
  snare: string;
  hat: string;
}

const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** In ZONES order. Each climbs in drive and density, so the music gets busier as you go up. */
const SONGS: Song[] = [
  {
    // Magma Chamber: slow, heavy, low.
    root: 38, scale: PHRYGIAN, prog: [0, 1, 0, -2],
    bass: 'x.....x...x.....', bassWave: 'sawtooth',
    arp: '....2.......1...', arpWave: 'triangle', arpOct: 2, pad: true,
    kick: 'x.........x.....', snare: '........x.......', hat: '................',
  },
  {
    // Crystal Caves: glassy arpeggios.
    root: 40, scale: DORIAN, prog: [0, 3, 5, 4],
    bass: 'x.......x.......', bassWave: 'triangle',
    arp: '0.1.2.3.2.1.0.2.', arpWave: 'sine', arpOct: 2, pad: true,
    kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.',
  },
  {
    // Fossil Beds: dusty plucks and a shaker.
    root: 33, scale: MINOR, prog: [0, 5, 3, 4],
    bass: 'x..x..x.x..x..5.', bassWave: 'square',
    arp: '0..2..1...2..3..', arpWave: 'square', arpOct: 2, pad: false,
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
  },
  {
    // Ice Cap: airy and wide.
    root: 42, scale: LYDIAN, prog: [0, 1, 4, 3],
    bass: 'x...............', bassWave: 'sine',
    arp: '3...2...1...2...', arpWave: 'sine', arpOct: 2, pad: true,
    kick: 'x.......x.......', snare: '............x...', hat: '....x.......x...',
  },
  {
    // Crater Rim: driving eighths.
    root: 36, scale: HARMONIC, prog: [0, 5, 3, 4],
    bass: 'x.x.x.x.o.x.x.5.', bassWave: 'sawtooth',
    arp: '0.2.1.2.0.2.3.2.', arpWave: 'square', arpOct: 2, pad: false,
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
  },
  {
    // Ash Clouds: everything going at once.
    root: 38, scale: HARMONIC, prog: [0, 1, 5, 4],
    bass: 'xxo.xxo.xxo.x5o5', bassWave: 'sawtooth',
    arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
    kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
  },
];

const BPM = 104;
const STEP_S = 60 / BPM / 4;
const MUSIC_VOL = 0.32;
const FADE_S = 3.5;

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Music {
  private bus: GainNode;
  private zoneBus: GainNode[] = [];
  /** Zones that are playing or fading out, and when each fade-out ends. */
  private live = new Map<number, number>();
  private zone = -1;
  private step = 0;
  private next = 0;
  private timer = 0;
  private on = true;
  private playing = false;

  constructor(private ctx: AudioContext, master: GainNode, private noiseBuf: AudioBuffer) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(master);
    for (let i = 0; i < SONGS.length; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.zoneBus.push(g);
    }
  }

  setOn(on: boolean): void {
    this.on = on;
    this.level();
  }

  /** Start or keep playing, crossfading to this zone if it's a new one. */
  play(zone: number): void {
    const z = Math.max(0, Math.min(SONGS.length - 1, zone));
    if (this.playing && z === this.zone) return;
    if (!this.playing) {
      this.playing = true;
      this.next = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 40);
    }
    if (z !== this.zone) {
      const now = this.ctx.currentTime;
      if (this.zone >= 0) {
        const old = this.zoneBus[this.zone].gain;
        old.cancelScheduledValues(now);
        old.setValueAtTime(old.value, now);
        old.linearRampToValueAtTime(0, now + FADE_S);
        this.live.set(this.zone, now + FADE_S);
      }
      const g = this.zoneBus[z].gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(1, now + (this.zone >= 0 ? FADE_S : 0.05));
      this.live.set(z, Infinity);
      this.zone = z;
    }
    this.level();
  }

  /** Fade everything out and stop scheduling notes (pause, run over). */
  stop(fade = 0.6): void {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + fade);
    // Start fresh next time, from the top of the loop.
    for (const g of this.zoneBus) {
      g.gain.cancelScheduledValues(now + fade);
      g.gain.setValueAtTime(0, now + fade + 0.01);
    }
    this.live.clear();
    this.zone = -1;
    this.step = 0;
  }

  private level(): void {
    const now = this.ctx.currentTime;
    const v = this.on && this.playing ? MUSIC_VOL : 0;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(v, now + 0.4);
  }

  private schedule(): void {
    const ahead = this.ctx.currentTime + 0.2;
    // After a stall (a background tab), skip ahead instead of firing a burst of old notes.
    if (this.next < this.ctx.currentTime - 0.5) this.next = this.ctx.currentTime + 0.05;
    while (this.next < ahead) {
      for (const [z, end] of this.live) {
        if (end < this.next) this.live.delete(z);
        else if (this.on) this.playStep(SONGS[z], this.zoneBus[z], this.step, this.next);
      }
      this.step = (this.step + 1) % 64;
      this.next += STEP_S;
    }
  }

  private playStep(s: Song, out: GainNode, step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const chord = s.prog[bar];
    const note = (deg: number, oct: number) => {
      const k = ((deg % 7) + 7) % 7;
      return s.root + s.scale[k] + 12 * (Math.floor(deg / 7) + oct);
    };

    const b = s.bass[i];
    if (b !== '.') {
      const n = note(chord + (b === '5' ? 4 : 0), b === 'o' ? 1 : 0);
      this.voice(midiHz(n), t, STEP_S * 1.8, s.bassWave, 0.3, 700, out);
    }
    const a = s.arp[i];
    if (a !== '.') {
      const tone = [0, 2, 4, 7][Number(a)] ?? 0;
      this.voice(midiHz(note(chord + tone, s.arpOct)), t, STEP_S * 2.2, s.arpWave, s.arpWave === 'sine' ? 0.16 : 0.07, 3200, out);
    }
    if (s.pad && i === 0) {
      for (const d of [0, 2, 4]) this.voice(midiHz(note(chord + d, 1)), t, STEP_S * 16, 'triangle', 0.045, 1400, out, 0.5);
    }
    if (s.kick[i] === 'x') this.kick(t, out);
    if (s.snare[i] === 'x') this.hiss(t, 0.14, 0.22, 1800, 0.8, out);
    if (s.hat[i] === 'x') this.hiss(t, 0.035, 0.08, 8500, 0.9, out);
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number, out: GainNode, attack = 0.01): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, out: GainNode): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.25);
  }

  private hiss(t: number, dur: number, vol: number, freq: number, q: number, out: GainNode): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
