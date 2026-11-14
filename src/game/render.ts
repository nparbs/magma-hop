// Draws the world as chunky pixel art. Everything is drawn in code onto a small buffer
// (one art pixel = 2 world units) and blown up without smoothing. No image files.

import {
  BAT_R, HazardKind, Kind, PICKUP_R, PLAYER_H, PickupKind, ROCK_HALF, ROCK_LIVE, ROCK_WARN, Sim, UNITS_PER_METER, WIDTH,
  hazardPos, platX, platY, type Pickup, type Platform,
} from '../sim/sim';
import { ZONES, zoneIndexAt, type Decor, type Zone } from '../sim/zones';
import { hashFrac } from '../sim/rng';

const FONT = '"Jersey 15", system-ui, sans-serif';
/** World units per art pixel. */
const A = 2;
/** Shaft width in art pixels. */
const COL = WIDTH / A;
/** The view is about this tall in world units; tall phones see more. */
const VIEW_H = 660;
const VIEW_MIN = 470;
/** How much lava shows at the bottom of the screen, world units. */
const LAVA_SHOW = 40;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
}

export interface Marker {
  meters: number;
  label: string;
  color: string;
}

// ---------- Color helpers ----------

function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const h = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** How much of zone `i` is showing at this height (fades over 120 m around each border). */
function zoneWeight(i: number, m: number): number {
  const from = ZONES[i].from;
  const to = i + 1 < ZONES.length ? ZONES[i + 1].from : Infinity;
  return (i === 0 ? 1 : clamp01((m - from + 60) / 120)) * (to === Infinity ? 1 : clamp01((to - m + 60) / 120));
}

// ---------- Sprites: rows of characters, one per art pixel ----------

function sprite(rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

const EMBER_PAL = { o: '#7a1e0c', y: '#ffc23a', r: '#ff7a1e', h: '#fff0a0' };
const EMBER = sprite(
  [
    '....ooooo....',
    '..ooyyyyyoo..',
    '.oyhhyyyyyyo.',
    'oyyhyyyyyyyyo',
    'oyyyyyyyyyyyo',
    'oyyyyyyyyyyyo',
    'oyyyyyyyyyyyo',
    'orryyyyyyyrro',
    '.orrrrrrrrro.',
    '..oorrrrroo..',
    '....ooooo....',
  ],
  EMBER_PAL,
);

const BAT_PAL = { o: '#6a2458', p: '#e0492a', e: '#ffe66d', F: '#ff9a3c' };
const BAT = [
  sprite(
    [
      'pp...........pp',
      'ppp..o...o..ppp',
      '.pppoooooooppp.',
      '..ppoeoooeopp..',
      '...pooooooop...',
      '....ooFFFoo....',
      '.....ooooo.....',
    ],
    BAT_PAL,
  ),
  sprite(
    [
      '...............',
      '.....o...o.....',
      '....ooooooo....',
      '.pppoeoooeoppp.',
      'pppoooooooooppp',
      'pp..ooFFFoo..pp',
      'p....ooooo....p',
    ],
    BAT_PAL,
  ),
];

const SHELL = sprite(
  [
    '....w....',
    '...wbw...',
    '..wbbbw..',
    '.wbbwbbw.',
    'wbbwwwbbw',
    '.wbbwbbw.',
    '..wbbbw..',
    '...wbw...',
    '....w....',
  ],
  { w: '#e8fbff', b: '#3fa9d9' },
);

const LAVA = ['#ffe066', '#ff9a1e', '#f0541a', '#b3260f', '#7a120a'];

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /** Screen size in device pixels. */
  w = 0;
  h = 0;
  /** Device pixels per art pixel. */
  px = 2;
  /** Buffer size in art pixels, and the shaft's left edge in it. */
  bw = 0;
  bh = 0;
  ox = 0;
  /** World y at the bottom edge of the screen. */
  camBottom = 0;
  private buf = document.createElement('canvas');
  private b: CanvasRenderingContext2D;
  private lava = 0;
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private squash = 0;
  private springAnim = new Map<number, number>();
  private wind: { x: number; y: number; len: number; sp: number }[] = [];
  private time = 0;
  private face = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.b = this.buf.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.round(window.innerWidth * dpr);
    this.h = Math.round(window.innerHeight * dpr);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    // Whole device pixels per art pixel, so every art pixel is the same size.
    const fit = Math.min(this.w / WIDTH, this.h / VIEW_H) * A;
    let px = Math.max(1, Math.round(fit));
    while (px > 1 && (COL * px > this.w || (this.h / px) * A < VIEW_MIN)) px--;
    this.px = px;
    this.bw = Math.ceil(this.w / px);
    this.bh = Math.ceil(this.h / px);
    this.buf.width = this.bw;
    this.buf.height = this.bh;
    this.ox = Math.floor((this.bw - COL) / 2);
  }

  /** Jump the view straight to where the lava is (new run, teleport). */
  snapCamera(lavaY: number): void {
    this.lava = lavaY;
    this.camBottom = lavaY - LAVA_SHOW;
    this.particles.length = 0;
  }

  private ax(x: number): number {
    return Math.round(this.ox + x / A);
  }
  private ay(y: number): number {
    return Math.round(this.bh - (y - this.camBottom) / A);
  }

  private r(x: number, y: number, w: number, h: number, color: string): void {
    this.b.fillStyle = color;
    this.b.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  private disc(cx: number, cy: number, rad: number, color: string): void {
    this.b.fillStyle = color;
    for (let dy = -rad; dy <= rad; dy++) {
      const half = Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.5);
      this.b.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }

  private ring(cx: number, cy: number, rad: number, color: string, from = 0, to = Math.PI * 2): void {
    this.b.fillStyle = color;
    const step = 0.7 / rad;
    for (let a = from; a < to; a += step) this.b.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 1, 1);
  }

  // ---------- Effects the game asks for ----------

  burst(x: number, y: number, n: number, color: string, speed = 3, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, life: 0, max: 26 + Math.random() * 26,
        color, size: Math.random() < 0.4 ? 2 : 1, grav: 0.15, ...opts,
      });
    }
  }

  private chunks(x: number, y: number, w: number, colors: string[]): void {
    for (let i = 0; i < Math.max(6, w / 8); i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * w, y: y - 4, vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.5,
        life: 0, max: 50 + Math.random() * 20, color: colors[i % colors.length], size: 2 + (i % 2), grav: 0.32,
      });
    }
  }

  onEvent(e: Sim['events'][number], sim: Sim): void {
    const zone = ZONES[zoneIndexAt(e.y / UNITS_PER_METER)];
    switch (e.t) {
      case 'bounce':
        this.squash = 1;
        if (e.kind === Kind.Ice) this.burst(e.x, e.y, 6, '#ffffff', 2, { grav: 0.05 });
        else this.burst(e.x, e.y, 4, zone.plat[0], 1.6, { grav: 0.08, max: 16 });
        break;
      case 'spring':
        this.squash = 1.4;
        this.burst(e.x, e.y, 14, '#ffd84a', 4, { grav: 0.05 });
        this.burst(e.x, e.y, 8, '#e83e6c', 3);
        for (const p of sim.platforms) if (p.spring !== null && Math.abs(platY(p, sim.tick) - e.y) < 1) this.springAnim.set(p.id, 1);
        break;
      case 'crumble':
        this.chunks(e.x, e.y, e.w, ['#c9a27a', '#8a6248', '#4f3628']);
        break;
      case 'fake':
        this.chunks(e.x, e.y, e.w, [zone.plat[1], zone.plat[2], zone.plat[0]]);
        break;
      case 'stomp':
        this.squash = 1.2;
        this.burst(e.x, e.y, 16, '#e0492a', 4);
        this.burst(e.x, e.y, 6, '#ffe66d', 3);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'pickup':
        if (e.kind === PickupKind.Shield) this.burst(e.x, e.y, 16, '#9fe8ff', 3, { grav: 0 });
        else this.burst(e.x, e.y, 20, e.kind === PickupKind.Geyser ? '#dff6ff' : '#ffb84a', 4, { grav: 0.05 });
        this.shake = Math.max(this.shake, 2);
        break;
      case 'rideend':
        this.burst(e.x, e.y, 14, '#ffffff', 3, { grav: 0.02 });
        break;
      case 'shieldbreak':
        this.burst(e.x, e.y + PLAYER_H / 2, 24, '#9fe8ff', 5);
        this.burst(e.x, e.y + PLAYER_H / 2, 10, '#ffffff', 3);
        this.shake = Math.max(this.shake, 4);
        this.flash = 0.5;
        this.flashColor = '#9fe8ff';
        break;
      case 'strike':
        this.shake = Math.max(this.shake, 5);
        break;
      case 'die':
        if (e.cause === 'lava') {
          for (let i = 0; i < 46; i++) {
            this.particles.push({
              x: e.x + (Math.random() - 0.5) * 30, y: sim.lavaY, vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 8,
              life: 0, max: 50 + Math.random() * 30, color: LAVA[i % 3], size: 1 + (i % 3), grav: 0.3,
            });
          }
        } else {
          this.burst(e.x, e.y + PLAYER_H / 2, 36, '#ff7a1e', 6);
          this.burst(e.x, e.y + PLAYER_H / 2, 18, '#ffc23a', 4);
        }
        this.shake = 8;
        this.flash = 0.8;
        this.flashColor = '#ff4d2a';
        break;
    }
  }

  // ---------- The frame ----------

  draw(sim: Sim, alpha: number, prev: { x: number; y: number }, markers: Marker[], dt: number): void {
    const { ctx, b } = this;
    this.time += dt;
    const k = dt * 60;

    // Smoothed player position between ticks.
    let px = sim.x;
    if (Math.abs(sim.x - prev.x) < WIDTH / 2) px = prev.x + (sim.x - prev.x) * alpha;
    const py = prev.y + (sim.y - prev.y) * alpha;
    if (sim.vx > 0.5) this.face = 1;
    else if (sim.vx < -0.5) this.face = -1;

    // The view rides on the lava: it only ever goes up.
    this.lava += (sim.lavaY - this.lava) * (1 - Math.pow(1 - 0.16, k));
    if (this.lava > sim.lavaY) this.lava = sim.lavaY;
    this.camBottom = this.lava - LAVA_SHOW;
    const camM = (this.camBottom + (this.bh * A) / 2) / UNITS_PER_METER;

    this.drawBackdrop(camM);
    this.drawFloor(sim);

    // Clip to the shaft so wrapped copies don't spill into the sides.
    b.save();
    b.beginPath();
    b.rect(this.ox, 0, COL, this.bh);
    b.clip();
    this.drawWind(sim, k);
    this.drawMarkerLines(markers);
    this.drawPlatforms(sim, alpha);
    this.drawPickups(sim);
    this.drawHazards(sim, alpha);
    this.drawRockfalls(sim);
    if (!sim.dead) this.drawPlayer(px, py, sim, k);
    this.drawParticles(k);
    b.restore();

    this.drawLava();
    this.drawSides(camM);

    // Blow the buffer up onto the screen.
    const sh = this.shake > 0.5 ? Math.round(this.shake) : 0;
    const shx = sh ? Math.round((Math.random() - 0.5) * sh) * this.px : 0;
    const shy = sh ? Math.round((Math.random() - 0.5) * sh) * this.px : 0;
    this.shake = Math.max(0, this.shake - 0.5 * k);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (sh) {
      ctx.fillStyle = '#0c0506';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.drawImage(this.buf, shx, shy, this.bw * this.px, this.bh * this.px);
    this.drawMarkerLabels(markers);

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.5;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - 0.06 * k);
    }
  }

  // ---------- Background ----------

  /** The two zones showing at this height and how far between them we are. */
  private blend(m: number): { a: Zone; b: Zone; t: number } {
    const i = zoneIndexAt(m + 60);
    if (i === 0) return { a: ZONES[0], b: ZONES[0], t: 0 };
    const t = clamp01((m - ZONES[i].from + 60) / 120);
    return { a: ZONES[i - 1], b: ZONES[i], t };
  }

  private drawBackdrop(m: number): void {
    const { b } = this;
    const z = this.blend(m);
    const top = mix(z.a.sky[0], z.b.sky[0], z.t);
    const bot = mix(z.a.sky[1], z.b.sky[1], z.t);
    // Flat bands, not a smooth gradient.
    const BAND = 8;
    const n = Math.ceil(this.bh / BAND);
    for (let i = 0; i < n; i++) this.r(0, i * BAND, this.bw, BAND, mix(top, bot, n > 1 ? i / (n - 1) : 0));

    for (let i = 0; i < ZONES.length; i++) {
      const wgt = zoneWeight(i, m);
      if (wgt <= 0) continue;
      b.globalAlpha = wgt;
      this.drawDecor(ZONES[i], i, 0.2, 1, ZONES[i].rock[0], 0.55);
      this.drawDecor(ZONES[i], i + 50, 0.45, 2, ZONES[i].rock[1], 0.3);
      this.drawMotes(ZONES[i], i);
    }
    b.globalAlpha = 1;
  }

  /** One parallax layer of scenery, laid out on a grid by hash so it never changes between frames. */
  private drawDecor(zone: Zone, salt: number, par: number, q: number, color: string, fill: number): void {
    const C = 56 * q;
    const scroll = (this.camBottom * par) / A;
    const j0 = Math.floor(scroll / C) - 1;
    const j1 = Math.floor((scroll + this.bh) / C) + 1;
    const cx = Math.floor(this.bw / 2);
    const cols = Math.ceil(this.bw / 2 / C) + 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = -cols; i < cols; i++) {
        const f = hashFrac(j * 131 + salt, i + 4096);
        if (f > fill) continue;
        const x = cx + i * C + Math.floor(hashFrac(i + 77, j + salt) * C);
        const y = this.bh - Math.round(j * C + hashFrac(j + 31, i + salt) * C - scroll);
        this.decor(zone.decor, x, y, q, f / fill, color, zone);
      }
    }
  }

  private decor(kind: Decor, x: number, y: number, q: number, f: number, color: string, zone: Zone): void {
    const n = 3 + Math.floor(f * 4);
    switch (kind) {
      case 'pillar': {
        // Stalagmites and stalactites.
        const dir = f > 0.5 ? 1 : -1;
        for (let k = 0; k < n; k++) this.r(x - (n - k) * q, y + dir * k * 4 * q, (2 * (n - k) + 1) * q, 4 * q, color);
        break;
      }
      case 'crystal': {
        const c = mix(color, zone.plat[0], 0.28);
        for (let k = -n; k <= n; k++) this.r(x - (n - Math.abs(k)) * q, y + k * 2 * q, (2 * (n - Math.abs(k)) + 1) * q, 2 * q, c);
        this.r(x - q, y - n * 2 * q, q, n * 2 * q, mix(color, zone.plat[0], 0.5));
        break;
      }
      case 'bone': {
        const c = mix(color, '#f0d9a0', 0.22);
        this.r(x, y, (8 + n * 4) * q, 2 * q, c);
        for (let k = 0; k <= n; k++) this.r(x + (2 + k * 4) * q, y + 2 * q, 2 * q, (4 + ((k * 3) % 5)) * q, c);
        break;
      }
      case 'icicle': {
        const c = mix(color, '#e8fbff', 0.25);
        for (let k = 0; k < n; k++) this.r(x - (n - k) * q, y + k * 3 * q, (2 * (n - k) + 1) * q, 3 * q, c);
        break;
      }
      case 'crag': {
        if (f < 0.45) {
          // Stars through the open crater.
          this.r(x, y, q, q, '#ffe9c9');
          this.r(x + 13 * q, y + 9 * q, 1, 1, '#ffffff');
        } else {
          for (let k = 0; k < n; k++) this.r(x + ((k * 5) % 7) * q, y + k * 3 * q, (6 + k * 3) * q, 3 * q, color);
        }
        break;
      }
      case 'cloud':
        this.r(x, y, 34 * q, 4 * q, color);
        this.r(x + 5 * q, y - 3 * q, 20 * q, 3 * q, color);
        this.r(x + 9 * q, y + 4 * q, 18 * q, 2 * q, color);
        break;
    }
  }

  /** Embers, glints, dust, snow or ash in the air. Positions come from the clock, so nothing to keep track of. */
  private drawMotes(zone: Zone, salt: number): void {
    const t = this.time;
    const scroll = (this.camBottom * 0.7) / A;
    const n = Math.round((this.bw * this.bh) / 2600);
    for (let i = 0; i < n; i++) {
      const f = hashFrac(i, salt + 9);
      const g = hashFrac(i + 500, salt);
      let vx = 0;
      let vy = 0;
      let on = true;
      switch (zone.mote) {
        case 'ember':
          vy = -(8 + 14 * f);
          vx = Math.sin(t * (1 + g) + i) * 3;
          on = Math.sin(t * 5 + i) > -0.6;
          break;
        case 'glint':
          on = Math.sin(t * (1.5 + 2 * f) + i * 2) > 0.5;
          break;
        case 'dust':
          vy = 3 + 3 * f;
          vx = 2 * g - 1;
          break;
        case 'snow':
          vy = 10 + 10 * f;
          vx = Math.sin(t + i) * 4;
          break;
        case 'ash':
          vy = 5 + 5 * f;
          vx = 14 + 10 * g;
          break;
      }
      if (!on) continue;
      const x = (((f * this.bw + (vx > 5 ? vx * t : vx)) % this.bw) + this.bw) % this.bw;
      const y = (((g * this.bh + vy * t + scroll) % this.bh) + this.bh) % this.bh;
      this.r(x, y, f > 0.8 ? 2 : 1, f > 0.8 && zone.mote !== 'ash' ? 2 : 1, zone.moteColor);
    }
  }

  /** The chamber floor: solid rock from wall to wall, down into the lava. */
  private drawFloor(sim: Sim): void {
    const top = this.ay(0);
    if (top > this.bh || sim.platforms.length === 0 || sim.platforms[0].w < WIDTH) return;
    const [glow, lit, dark] = ZONES[0].plat;
    this.r(0, top, this.bw, 1, glow);
    this.r(0, top + 1, this.bw, 2, lit);
    this.r(0, top + 3, this.bw, this.bh - top, dark);
    for (let i = 0; i < this.bw; i += 3) {
      const f = hashFrac(i, 5);
      if (f < 0.5) this.r(i, top + 4 + Math.floor(f * 80), 2, 1, lit);
      if (f > 0.93) this.r(i, top + 6 + Math.floor(f * 30), 1, 3, glow);
    }
  }

  private drawLava(): void {
    const { b } = this;
    const top = this.ay(this.lava);
    const t = this.time;
    // Heat haze above the surface.
    for (let i = 0; i < 4; i++) {
      b.globalAlpha = 0.07 * (4 - i);
      this.r(0, top - 6 * (i + 1) - 2, this.bw, 6, '#ff7a1e');
    }
    b.globalAlpha = 1;
    for (let x = 0; x < this.bw; x += 2) {
      const wave = Math.round(1.6 * Math.sin(x * 0.11 + t * 2.2) + 1.2 * Math.sin(x * 0.045 - t * 1.4));
      const y = top - wave;
      this.r(x, y, 2, 2, LAVA[0]);
      this.r(x, y + 2, 2, 3, LAVA[1]);
      this.r(x, y + 5, 2, 6, LAVA[2]);
      this.r(x, y + 11, 2, 10, LAVA[3]);
      this.r(x, y + 21, 2, this.bh, LAVA[4]);
    }
    // Bubbles that swell and pop.
    for (let i = 0; i < Math.ceil(this.bw / 40); i++) {
      const ph = (t * (0.5 + hashFrac(i, 3) * 0.6) + hashFrac(i, 8)) % 1;
      const x = Math.floor(hashFrac(i, Math.floor(t * (0.5 + hashFrac(i, 3) * 0.6) + hashFrac(i, 8))) * this.bw);
      const rad = 1 + Math.floor(ph * 3);
      if (ph < 0.85) this.ring(x, top + 4, rad, LAVA[0]);
      else for (let s = 0; s < 4; s++) this.r(x + (s - 1.5) * 3, top - 2 - (ph - 0.85) * 30, 1, 1, LAVA[0]);
    }
  }

  /** Dim what's beside the shaft and mark the edges you wrap through. */
  private drawSides(m: number): void {
    const { b } = this;
    if (this.ox < 2) return;
    b.globalAlpha = 0.6;
    this.r(0, 0, this.ox, this.bh, '#07030a');
    this.r(this.ox + COL, 0, this.bw - this.ox - COL, this.bh, '#07030a');
    b.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 3);
    const z = this.blend(m);
    const glow = mix(z.a.plat[0], z.b.plat[0], z.t);
    const off = Math.floor(this.time * 10) % 6;
    for (let y = -off; y < this.bh; y += 6) {
      this.r(this.ox - 1, y, 1, 3, glow);
      this.r(this.ox + COL, y + 3, 1, 3, glow);
    }
    b.globalAlpha = 1;
  }

  // ---------- Things in the shaft ----------

  /** Call fn at x and at its wrapped copy when it's near an edge. */
  private wrapped(x: number, margin: number, fn: (x: number) => void): void {
    fn(x);
    if (x < margin) fn(x + WIDTH);
    if (x > WIDTH - margin) fn(x - WIDTH);
  }

  private visible(y: number, pad = 80): boolean {
    return y > this.camBottom - pad && y < this.camBottom + this.bh * A + pad;
  }

  private drawMarkerLines(markers: Marker[]): void {
    for (const mk of markers) {
      const wy = mk.meters * UNITS_PER_METER;
      if (!this.visible(wy, 20) || mk.meters <= 0) continue;
      const y = this.ay(wy);
      for (let x = this.ox; x < this.ox + COL; x += 6) this.r(x, y, 3, 1, mk.color);
    }
  }

  private drawMarkerLabels(markers: Marker[]): void {
    const { ctx } = this;
    for (const mk of markers) {
      const wy = mk.meters * UNITS_PER_METER;
      if (!this.visible(wy, 20) || mk.meters <= 0) continue;
      ctx.font = `${Math.max(12, 8 * this.px)}px ${FONT}`;
      ctx.fillStyle = mk.color;
      ctx.textAlign = 'right';
      ctx.fillText(mk.label, (this.ox + COL - 3) * this.px, (this.ay(wy) - 2) * this.px);
    }
  }

  private drawPlatforms(sim: Sim, alpha: number): void {
    const t = sim.tick - 1 + alpha;
    for (const p of sim.platforms) {
      if (p.broken >= 0 || p.w >= WIDTH) continue;
      const wy = platY(p, t);
      if (!this.visible(wy)) continue;
      this.wrapped(platX(p, t), p.w, (x) => this.platform(p, this.ax(x), this.ay(wy)));
    }
    for (const [id, v] of this.springAnim) {
      const nv = v - 0.06;
      if (nv <= 0) this.springAnim.delete(id);
      else this.springAnim.set(id, nv);
    }
  }

  /** One ledge: a glowing top edge on dark rock with a ragged underside. `cx`, `top` in art pixels. */
  private platform(p: Platform, cx: number, top: number): void {
    const { b } = this;
    const w = Math.round(p.w / A);
    const left = cx - Math.floor(w / 2);
    let [glow, lit, dark] = ZONES[zoneIndexAt(p.y / UNITS_PER_METER)].plat;
    if (p.kind === Kind.Crumble) [glow, lit, dark] = ['#c9a27a', '#8a6248', '#4f3628'];
    if (p.kind === Kind.Ice) [glow, lit, dark] = ['#ffffff', '#bfeaff', '#6fb6d9'];

    if (p.kind === Kind.Fake) b.globalAlpha = 0.82 + 0.1 * Math.sin(this.time * 7 + p.id);
    this.r(left + 1, top, w - 2, 1, glow);
    this.r(left, top + 1, w, 1, lit);
    this.r(left, top + 2, w, 2, dark);
    for (let c = 0; c < w; c += 2) {
      const f = hashFrac(p.id, c);
      const d = c === 0 || c >= w - 2 ? 0 : 1 + Math.floor(f * 2.5);
      if (d) this.r(left + c, top + 4, 2, d, dark);
      if (f > 0.8) this.r(left + c, top + 2, 1, 1, lit);
    }
    b.globalAlpha = 1;

    if (p.kind === Kind.Fake) {
      // The tell: the glowing edge is broken up by cracks.
      for (let c = 3 + Math.floor(hashFrac(p.id, 99) * 3); c < w - 2; c += 5) {
        this.r(left + c, top, 2, 1, dark);
        this.r(left + c, top + 1, 1, 2, '#0c0506');
      }
    } else if (p.kind === Kind.Crumble) {
      // Loose blocks with gaps between them: one bounce and it's gone.
      for (let c = 4 + Math.floor(hashFrac(p.id, 98) * 3); c < w - 3; c += 6) this.r(left + c, top, 1, 5, '#1a0d0a');
    } else if (p.kind === Kind.Ice) {
      for (let c = 1; c < w - 1; c += 4) this.r(left + c, top + 4, 1, 1 + Math.floor(hashFrac(p.id, c + 40) * 4), '#dff6ff');
    }
    if (p.mx !== 0 || p.my !== 0) {
      // Hot sparks hold drifting ledges up.
      const fl = Math.floor(this.time * 12 + p.id) % 3;
      for (const ex of [left + 2, left + w - 4]) {
        this.r(ex, top + 6 + fl, 2, 1, '#ffb02e');
        this.r(ex + (fl === 1 ? 1 : 0), top + 8 + fl, 1, 1, '#ff5a1e');
      }
    }
    if (p.spring !== null) {
      // A puffcap mushroom: land on it for a big bounce.
      const pop = Math.round((this.springAnim.get(p.id) ?? 0) * 4);
      const sx = cx + Math.round(p.spring / A);
      this.r(sx - 1, top - 3 - pop, 2, 3 + pop, '#f3e3c8');
      this.r(sx - 4, top - 6 - pop, 8, 3, '#e83e6c');
      this.r(sx - 3, top - 7 - pop, 6, 1, '#e83e6c');
      this.r(sx - 4, top - 4 - pop, 8, 1, '#a3244a');
      this.r(sx - 2, top - 6 - pop, 1, 1, '#ffffff');
      this.r(sx + 1, top - 5 - pop, 2, 1, '#ffffff');
    }
  }

  private drawPickups(sim: Sim): void {
    for (const u of sim.pickups) {
      if (u.taken || !this.visible(u.y)) continue;
      this.wrapped(u.x, 30, (x) => this.pickup(u, this.ax(x), this.ay(u.y)));
    }
  }

  private pickup(u: Pickup, cx: number, cy: number): void {
    const { b } = this;
    const t = this.time;
    const bob = Math.round(Math.sin(t * 3 + u.id));
    if (u.kind === PickupKind.Geyser) {
      // A steaming vent on the ledge.
      const base = cy + Math.round((PICKUP_R + 2) / A);
      this.r(cx - 6, base - 2, 12, 2, '#5c6470');
      this.r(cx - 4, base - 4, 8, 2, '#8a94a3');
      this.r(cx - 2, base - 4, 4, 1, '#14141c');
      for (let i = 0; i < 4; i++) {
        const ph = (t * 1.4 + i / 4) % 1;
        b.globalAlpha = 1 - ph;
        const size = 1 + Math.floor(ph * 3);
        this.r(cx - size / 2 + Math.sin(ph * 6 + i) * 2, base - 6 - ph * 16, size, size, '#dff6ff');
      }
      b.globalAlpha = 1;
    } else if (u.kind === PickupKind.Bubble) {
      b.globalAlpha = 0.35;
      this.disc(cx, cy + bob, 6, '#ffb84a');
      b.globalAlpha = 1;
      this.ring(cx, cy + bob, 7, '#ff9a3c');
      this.r(cx - 4, cy + bob - 4, 2, 1, '#fff0a0');
      this.r(cx - 5, cy + bob - 3, 1, 2, '#fff0a0');
    } else {
      b.drawImage(SHELL, cx - 4, cy - 4 + bob);
      if (Math.sin(t * 4 + u.id) > 0.7) this.r(cx + 3, cy - 5 + bob, 1, 1, '#ffffff');
    }
  }

  private drawHazards(sim: Sim, alpha: number): void {
    const { b } = this;
    const t = sim.tick - 1 + alpha;
    for (const h of sim.hazards) {
      if (h.dead || !this.visible(h.y)) continue;
      const [hx, hy] = hazardPos(h, t);
      this.wrapped(hx, 40, (x) => {
        const X = this.ax(x);
        const Y = this.ay(hy);
        if (h.kind === HazardKind.Bat) {
          const frame = BAT[Math.floor(this.time * 9 + h.id) % 2];
          b.drawImage(frame, X - 7, Y - Math.round(BAT_R / A / 2));
        } else {
          const dir = Math.sign(h.a) || 1;
          const fl = Math.floor(this.time * 14 + h.id) % 2;
          for (let i = 3; i >= 1; i--) {
            const sz = 5 - i;
            this.r(X - dir * (4 + i * 4) - sz / 2, Y - sz / 2 + (i === 2 ? fl : 0), sz, sz, i === 3 ? '#b3260f' : '#f0541a');
          }
          this.disc(X, Y, 6, '#ff5a1e');
          this.disc(X, Y, 4, '#ffb02e');
          this.disc(X + fl, Y, 2, '#fff3b0');
        }
      });
    }
  }

  private drawRockfalls(sim: Sim): void {
    const { b } = this;
    const half = Math.round(ROCK_HALF / A);
    for (const f of sim.rockfalls) {
      const age = sim.tick - f.start;
      const X = this.ax(f.x);
      if (age < ROCK_WARN) {
        // Warning: a flickering column, pebbles trickling down, and a mark at the top.
        const blink = Math.floor(this.time * 10) % 2;
        b.globalAlpha = 0.1 + 0.22 * (age / ROCK_WARN) * (blink ? 1 : 0.5);
        this.r(X - half, 0, half * 2, this.bh, '#ffcf6b');
        b.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {
          const y = (this.time * 90 + i * 53) % this.bh;
          this.r(X - half + 2 + Math.floor(hashFrac(i, f.start) * (half * 2 - 4)), y, 1, 2, '#c9b79a');
        }
        if (blink || age > ROCK_WARN * 0.6) {
          this.r(X - 1, 4, 3, 7, '#ffe66d');
          this.r(X - 1, 13, 3, 3, '#ffe66d');
        }
      } else if (age <= ROCK_WARN + ROCK_LIVE) {
        const prog = (age - ROCK_WARN) / ROCK_LIVE;
        for (let i = 0; i < 7; i++) {
          const y = Math.round((prog * 1.5 - i * 0.13) * this.bh);
          const x = X + Math.round((hashFrac(i, f.start + 1) - 0.5) * half * 1.6);
          const rad = 2 + (i % 3);
          b.globalAlpha = 0.35;
          this.r(x - 1, y - 16, 2, 14, '#c9b79a');
          b.globalAlpha = 1;
          this.disc(x, y, rad, '#6b5a4a');
          this.r(x - rad + 1, y - rad + 1, rad, 1, '#c9b79a');
        }
      }
    }
  }

  private drawWind(sim: Sim, k: number): void {
    const w = sim.wind;
    const want = Math.min(36, Math.round(Math.abs(w) * 18));
    while (this.wind.length < want) {
      this.wind.push({ x: Math.random() * COL, y: Math.random(), len: 6 + Math.random() * 12, sp: 0.6 + Math.random() * 0.8 });
    }
    if (this.wind.length > want) this.wind.length = want;
    if (!want) return;
    this.b.globalAlpha = 0.4;
    for (const p of this.wind) {
      p.x += w * 3 * p.sp * k;
      if (p.x > COL + 20) p.x -= COL + 40;
      if (p.x < -20) p.x += COL + 40;
      this.r(this.ox + p.x - (w > 0 ? p.len : 0), p.y * this.bh, p.len, 1, '#ffffff');
    }
    this.b.globalAlpha = 1;
  }

  private drawParticles(k: number): void {
    const { b } = this;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += k;
      if (p.life >= p.max) continue;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy -= p.grav * k;
      keep.push(p);
      b.globalAlpha = p.life / p.max > 0.7 ? 0.5 : 1;
      this.r(this.ax(p.x), this.ay(p.y), p.size, p.size, p.color);
    }
    b.globalAlpha = 1;
    this.particles = keep.length > 400 ? keep.slice(-400) : keep;
  }

  /** Pip: a little ember with big eyes and a flame for hair. */
  private drawPlayer(px: number, py: number, sim: Sim, k: number): void {
    const { b } = this;
    this.squash = Math.max(0, this.squash - 0.09 * k);
    const sq = Math.sin(Math.min(1, this.squash) * Math.PI);
    const riding = sim.ride !== -1;
    const t = this.time;

    // A trail of sparks on the way up.
    if (sim.vy > 4 && Math.random() < 0.5 * k) {
      this.particles.push({
        x: px + (Math.random() - 0.5) * 12, y: py + 4, vx: 0, vy: -0.5, life: 0, max: 14 + Math.random() * 10,
        color: riding && sim.ride === PickupKind.Geyser ? '#dff6ff' : '#ff9a3c', size: 1, grav: 0,
      });
    }
    // Blink while the grace period runs out.
    if (!riding && sim.safe > 0 && Math.floor(t * 16) % 2) b.globalAlpha = 0.45;

    this.wrapped(px, 40, (x) => {
      const cx = this.ax(x);
      const feet = this.ay(py);
      if (riding && sim.ride === PickupKind.Geyser) {
        // A column of water and steam shoving you up the shaft.
        for (let y = feet; y < this.bh; y += 2) {
          const wob = Math.round(Math.sin(y * 0.4 + t * 30) * 1.5);
          this.r(cx - 4 + wob, y, 9, 2, '#8fd3f5');
          this.r(cx - 2 + wob, y, 4, 2, '#e8fbff');
        }
        this.disc(cx, feet + 1, 6, '#e8fbff');
      }
      const wide = sq > 0.4 ? 1 : sim.vy > 6 && !riding ? -1 : 0;
      const bw = 13 + wide * 2;
      const bh = 11 - (wide > 0 ? wide + 1 : wide);
      const left = cx - 6 - wide;
      const top = feet - 1 - bh;
      b.drawImage(EMBER, left, top, bw, bh);
      // Feet tuck in on the way up.
      if (wide <= 0) {
        const fy = feet - 1 - (sim.vy > 2 ? 1 : 0);
        this.r(cx - 4, fy, 2, 1, EMBER_PAL.o);
        this.r(cx + 2, fy, 2, 1, EMBER_PAL.o);
      }
      // Eyes look where you're steering, and up or down with the motion.
      const ey = top + 4 - (wide > 0 ? 1 : 0);
      const look = sim.vy > 2 ? 0 : 1;
      for (const e of [-3, 2]) {
        const exx = cx + e + this.face;
        this.r(exx, ey, 2, 3, '#ffffff');
        this.r(exx + (this.face > 0 ? 1 : 0), ey + look, 1, 2, '#2a0d12');
      }
      // The flame leans away from where you're going and stretches when you fall.
      const lean = Math.max(-2, Math.min(2, sim.vx / 3));
      const len = sim.vy < -4 ? 5 : sim.vy > 6 ? 2 : 3;
      for (let i = 0; i < len; i++) {
        const fx = cx - Math.round(lean * i * 0.6) + (i > 0 && Math.floor(t * 14 + i) % 2 ? 1 : 0);
        const fw = i === 0 ? 3 : i < 3 ? 2 : 1;
        this.r(fx - Math.floor(fw / 2), top - 1 - i, fw, 1, i < 2 ? EMBER_PAL.y : EMBER_PAL.r);
      }
      const mid = top + 5;
      if (riding && sim.ride === PickupKind.Bubble) {
        b.globalAlpha = 0.22;
        this.disc(cx, mid, 11, '#ffb84a');
        b.globalAlpha = sim.rideTimer < 50 && Math.floor(t * 12) % 2 ? 0.4 : 1;
        this.ring(cx, mid, 12, '#ff9a3c');
        this.ring(cx, mid, 10, '#fff0a0', Math.PI * 1.1, Math.PI * 1.45);
        b.globalAlpha = 1;
      }
      if (sim.shield) {
        // The shell: bright bits circling you.
        for (let i = 0; i < 8; i++) {
          const a = t * 2.5 + (i * Math.PI) / 4;
          this.r(cx + Math.round(Math.cos(a) * 10), mid + Math.round(Math.sin(a) * 10), i % 2 ? 1 : 2, i % 2 ? 1 : 2, i % 2 ? '#ffffff' : '#6fd0ff');
        }
      }
    });
    b.globalAlpha = 1;
  }
}
