// Every sound is synthesized here, music included. No audio files.

import { OVER_SONGS, SUMMIT_SONG, TITLE_SONGS, ZONE_SONGS, onPass, type Song } from './songs';

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
  /** A low growl under the floor: the warning before a surge. */
  rumble(): void {
    this.tone(70, 38, 1.6, 'sawtooth', 0.2);
    this.tone(55, 30, 1.8, 'square', 0.1, 0.15);
    this.noise(1.7, 0.25, 160, 0.6);
  }
  /** The lava lunges up. */
  surge(): void {
    this.noise(1.0, 0.35, 700, 0.4);
    this.tone(120, 520, 0.9, 'sine', 0.14);
  }
  /** A crust ledge giving way. */
  melt(): void {
    this.noise(0.5, 0.22, 4200, 0.5);
    this.tone(300, 90, 0.3, 'sine', 0.1);
  }
  /** The summit eruption: a boom and a rising fanfare. */
  fanfare(): void {
    this.tone(110, 40, 0.8, 'square', 0.25);
    this.noise(1.2, 0.4, 500, 0.4);
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, f, 0.5, 'triangle', 0.14, 0.4 + i * 0.12));
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
  /**
   * Laury's babble: one high little chirp per syllable, pitched by its vowel, so she sounds like
   * she's chattering along without saying real words. `rise`: the end of a question or exclamation.
   */
  voice(vowel: string, rise: boolean): void {
    const k = 'aeiouy'.indexOf(vowel.toLowerCase());
    const f = 640 * [1, 1.19, 1.33, 0.89, 1.06, 1.26][Math.max(0, k)] * (0.96 + Math.random() * 0.08);
    const to = rise ? f * 1.5 : f * 1.12;
    this.tone(f, to, rise ? 0.12 : 0.07, 'triangle', 0.11);
    this.tone(f * 2, to * 2, rise ? 0.1 : 0.05, 'sine', 0.035);
  }
}

// ---------- Music: songs per zone and per screen, crossfaded ----------

const MUSIC_VOL = 0.32;
/** Crossfade between zones and screens, seconds. */
const FADE_S = 2.5;
/** How many times a song loops (A and B passes each count) before the next one for that cue takes over. */
const ZONE_LOOPS = 4;
/** The title and run-over screens rotate more slowly: people sit on them less. */
const SCREEN_LOOPS = 8;

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** What should be playing: the title theme, the run-over theme, or a zone's songs. */
export type MusicCue = 'title' | 'over' | 'summit' | `zone${number}`;

interface Track {
  cue: MusicCue;
  song: Song;
  /** The song with its B section swapped in (the same song when it has none). */
  songB: Song;
  bus: GainNode;
  step: number;
  next: number;
  loops: number;
  /** Passes through the four bars so far: odd passes play the B section. */
  pass: number;
  /** When it has faded out and stops being scheduled. */
  until: number;
}

export class Music {
  private out: GainNode;
  /** Muffles everything while paused. */
  private muffle: BiquadFilterNode;
  private tracks: Track[] = [];
  private current: Track | null = null;
  private timer = 0;
  private on = true;
  private ducked = false;
  /** A throbbing layer on top of the song while the lava surges. */
  pulse = false;
  /** Songs not yet played for each cue: every song gets a turn before any repeats. */
  private bags = new Map<string, Song[]>();
  /** The last song played for each cue, so a refilled bag doesn't start with it. */
  private lastPick = new Map<string, Song>();

  constructor(private ctx: AudioContext, master: GainNode, private noiseBuf: AudioBuffer) {
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.muffle.connect(this.out).connect(master);
  }

  setOn(on: boolean): void {
    this.on = on;
    this.level();
  }

  /** What's playing, for headless checks: cue, song, and whether it's muffled. */
  get state(): { cue: string; song: string; ducked: boolean; fading: number } | null {
    if (!this.current) return null;
    return { cue: this.current.cue, song: this.current.song.name, ducked: this.ducked, fading: this.tracks.length - 1 };
  }

  /** Crossfade to what this cue wants, unless it's already playing. */
  play(cue: MusicCue): void {
    if (this.current?.cue === cue) return;
    this.switchTo(cue, this.pick(cue));
  }

  /** Muffled and quieter while paused. */
  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    const now = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(now);
    this.muffle.frequency.setValueAtTime(this.muffle.frequency.value, now);
    this.muffle.frequency.exponentialRampToValueAtTime(on ? 600 : 20000, now + 0.35);
    this.level();
  }

  private pick(cue: MusicCue): Song {
    if (cue === 'summit') return SUMMIT_SONG;
    // The theme greets you the first time; after that the title shuffles like everything else.
    if (cue === 'title' && !this.lastPick.has(cue)) {
      this.lastPick.set(cue, TITLE_SONGS[0]);
      return TITLE_SONGS[0];
    }
    const list = cue === 'title' ? TITLE_SONGS : cue === 'over' ? OVER_SONGS : ZONE_SONGS[Math.max(0, Math.min(ZONE_SONGS.length - 1, Number(cue.slice(4)) || 0))];
    const last = this.lastPick.get(cue);
    let bag = this.bags.get(cue);
    if (!bag?.length) {
      bag = list.length > 1 ? list.filter((s) => s !== last) : [...list];
      this.bags.set(cue, bag);
    }
    const song = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
    this.lastPick.set(cue, song);
    return song;
  }

  private switchTo(cue: MusicCue, song: Song): void {
    const now = this.ctx.currentTime;
    const first = !this.current;
    if (this.current) {
      const g = this.current.bus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FADE_S);
      this.current.until = now + FADE_S;
    }
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + (first ? 0.3 : FADE_S));
    bus.connect(this.muffle);
    const loops = cue.startsWith('zone') ? ZONE_LOOPS : cue === 'summit' ? Infinity : SCREEN_LOOPS;
    const t: Track = { cue, song, songB: onPass(song, 1), bus, step: 0, next: now + 0.05, loops, pass: 0, until: Infinity };
    this.tracks.push(t);
    this.current = t;
    if (!this.timer) this.timer = window.setInterval(() => this.schedule(), 40);
    this.level();
  }

  private level(): void {
    const now = this.ctx.currentTime;
    const v = this.on && this.current ? MUSIC_VOL * (this.ducked ? 0.6 : 1) : 0;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(v, now + 0.4);
  }

  private schedule(): void {
    const now = this.ctx.currentTime;
    const ahead = now + 0.2;
    for (const t of [...this.tracks]) {
      // After a stall (a background tab), skip ahead instead of firing a burst of old notes.
      if (t.next < now - 0.5) t.next = now + 0.05;
      while (t.next < ahead) {
        if (t.next > t.until) {
          this.tracks.splice(this.tracks.indexOf(t), 1);
          window.setTimeout(() => t.bus.disconnect(), 3000);
          break;
        }
        if (this.on) this.playStep(t.pass % 2 ? t.songB : t.song, t.bus, t.step, t.next);
        t.step = (t.step + 1) % 64;
        t.next += 60 / t.song.bpm / 4;
        if (t.step === 0) t.pass++;
        // A song that has looped enough hands over to another song for the same cue.
        if (t.step === 0 && t === this.current && --t.loops <= 0) {
          this.switchTo(t.cue, this.pick(t.cue));
        }
      }
    }
  }

  private playStep(s: Song, out: GainNode, step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const stepS = 60 / s.bpm / 4;
    const chord = s.prog[bar];
    const note = (deg: number, oct: number) => {
      const k = ((deg % 7) + 7) % 7;
      return s.root + s.scale[k] + 12 * (Math.floor(deg / 7) + oct);
    };

    const b = s.bass[i];
    if (b !== '.') {
      const n = note(chord + (b === '5' ? 4 : 0), b === 'o' ? 1 : 0);
      this.voice(midiHz(n), t, stepS * 1.8, s.bassWave, 0.3, 700, out);
    }
    const a = s.arp[i];
    if (a !== '.') {
      const tone = [0, 2, 4, 7][Number(a)] ?? 0;
      this.voice(midiHz(note(chord + tone, s.arpOct)), t, stepS * 2.2, s.arpWave, s.arpWave === 'sine' ? 0.16 : 0.07, 3200, out);
    }
    if (s.lead) {
      const c = s.lead[step];
      if (c >= '0' && c <= '9') {
        let len = 1;
        while (s.lead[(step + len) % 64] === '-' && len < 16) len++;
        const wave = s.leadWave ?? 'square';
        this.voice(midiHz(note(Number(c), s.leadOct ?? 2)), t, stepS * len * 0.95, wave, wave === 'square' ? 0.06 : 0.14, 2600, out, 0.015);
      }
    }
    if (s.pad && i === 0) {
      for (const d of [0, 2, 4]) this.voice(midiHz(note(chord + d, 1)), t, stepS * 16, 'triangle', 0.045, 1400, out, 0.5);
    }
    if (this.pulse && out === this.current?.bus) {
      if (i % 4 === 0) this.voice(midiHz(s.root + s.scale[((chord % 7) + 7) % 7] - 24), t, stepS * 3, 'sawtooth', 0.14, 380, out);
      if (i % 4 === 2) this.hiss(t, 0.08, 0.1, 5200, 1.2, out);
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
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
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

