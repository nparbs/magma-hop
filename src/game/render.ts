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

/** Another climb drawn as a see-through ember (the Daily Climb ghost). World position and a name tag. */
export interface Ghost {
  x: number;
  y: number;
  label: string;
}

/**
 * Another player climbing right now. `inWorld`: they're on the same volcano (the Daily Climb), so draw
 * them where they are. Otherwise their tower is a different one, so only their height is shown.
 */
export interface Rival {
  x: number;
  y: number;
  name: string;
  skin: number;
  inWorld: boolean;
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

const EMBER_ROWS = [
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
];

// ---------- Skins: the climber's looks. Cosmetic only; the sim never sees them. ----------

export interface Skin {
  name: string;
  /** Outline, body, lower body, highlight. */
  pal: { o: string; y: string; r: string; h: string };
  /** Flame (or top) colors: inner, outer. Also the spark trail. */
  flame: [string, string];
  /** A finishing touch drawn over the body. */
  extra: 'none' | 'frost' | 'drip' | 'cracks' | 'star';
  sprite: HTMLCanvasElement;
}

function skin(name: string, pal: Skin['pal'], flame: Skin['flame'], extra: Skin['extra']): Skin {
  return { name, pal, flame, extra, sprite: sprite(EMBER_ROWS, pal) };
}

/** In picker order. The index is what's saved and sent with a run. */
export const SKINS: Skin[] = [
  skin('Pip', { o: '#7a1e0c', y: '#ffc23a', r: '#ff7a1e', h: '#fff0a0' }, ['#ffc23a', '#ff7a1e'], 'none'),
  skin('Frostbite', { o: '#1d4a7a', y: '#d8f4ff', r: '#7fc4e6', h: '#ffffff' }, ['#e8fbff', '#6fd0ff'], 'frost'),
  skin('Gloop', { o: '#1f5a1a', y: '#8ee04a', r: '#4fa83a', h: '#e0ffb0' }, ['#c8ff6a', '#6ad02a'], 'drip'),
  skin('Obsidian', { o: '#000000', y: '#2e2536', r: '#1a141e', h: '#6a5a78' }, ['#ffb02e', '#f0541a'], 'cracks'),
  skin('Starling', { o: '#4a1a6a', y: '#e7a4ff', r: '#b45cf0', h: '#fff0ff' }, ['#fff3b0', '#ffd84a'], 'star'),
];

export const skinAt = (i: number) => SKINS[i >= 0 && i < SKINS.length ? Math.floor(i) : 0] ?? SKINS[0];

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** A skin's finishing touch over the body. `left`, `top`: the body sprite's corner; `h`: its drawn height. */
function skinExtra(px: Px, s: Skin, left: number, top: number, h: number, time: number): void {
  switch (s.extra) {
    case 'frost':
      px(left + 3, top + h, 1, 1, '#e8fbff');
      px(left + 9, top + h, 1, 2, '#e8fbff');
      if (Math.floor(time * 3) % 3 === 0) px(left + 10, top + 2, 1, 1, '#ffffff');
      break;
    case 'drip': {
      const len = Math.floor(((time * 1.5) % 1) * 4);
      px(left + 4, top + h - 1, 1, 1 + len, s.pal.r);
      px(left + 9, top + h - 1, 1, 1 + ((len + 2) % 4), s.pal.r);
      break;
    }
    case 'cracks': {
      const glow = Math.floor(time * 4) % 2 ? '#ffb02e' : '#ff7a1e';
      px(left + 1, top + 7, 1, 1, glow);
      px(left + 2, top + 8, 1, 1, glow);
      px(left + 11, top + 6, 1, 1, glow);
      px(left + 10, top + 7, 1, 1, glow);
      px(left + 6, top + 9, 2, 1, '#f0541a');
      break;
    }
    default:
      break;
  }
}

/** A star in place of the flame (Starling). `cx`: center column; `top`: the body's top row. */
function skinStar(px: Px, s: Skin, cx: number, top: number, time: number): void {
  px(cx - 1, top - 3, 3, 1, s.flame[0]);
  px(cx, top - 4, 1, 3, s.flame[0]);
  if (Math.floor(time * 5) % 4 === 0) px(cx + 2, top - 5, 1, 1, '#ffffff');
}

/** The ember's shape in ghostly blue, for the Daily Climb ghost. */
const GHOST = sprite(
  [
    '....ooooo....',
    '..ooyyyyyoo..',
    '.oyyyyyyyyyo.',
    'oyywyyyywyyyo',
    'oyywyyyywyyyo',
    'oyyyyyyyyyyyo',
    'oyyyyyyyyyyyo',
    'oyyyyyyyyyyyo',
    '.oyyyyyyyyyo.',
    '..ooyyyyyoo..',
    '....ooooo....',
  ],
  { o: '#1d5f96', y: '#4fd2ff', w: '#ffffff' },
);

const BAT_PAL ={ o: '#6a2458', p: '#e0492a', e: '#ffe66d', F: '#ff9a3c' };
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

// ---------- The title logo: MAGMA over HOP, with Pip as the O ----------

/** 5x7 letters, only the ones the logo needs. `#` is lit. */
const GLYPHS: Record<string, string[]> = {
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};

/** Logo size in art pixels. */
const LOGO_W = 64;
const LOGO_H = 50;
const BIG = 3;
const SMALL = 2;
/** Where each word starts and how big its letter pixels are. HOP's O is left blank for Pip. */
const WORDS = [
  { text: 'MAGMA', x: 3, y: 3, s: SMALL },
  { text: 'H P', x: 6, y: 21, s: BIG },
];
/** Columns under HOP where lava drips: the feet of the H, the P, and Pip's puddle. */
const DRIPS = [7, 19, 43, 31];

/**
 * Draws the logo into its own small canvas, a frame at a time (Pip keeps hopping).
 * The canvas is shown blown up with `image-rendering: pixelated`.
 */
/** Laury, the volcanologist who shows you the ropes: brown ponytail, goggles up, heat jacket. */
const LAURY = sprite(
  [
    '......oooooo......',
    '....oohhHHhhoo....',
    '...ohhHHhhhhhho...',
    '..ohGGGGGGGGGGho..',
    '..oGggwGGGggwGGo..',
    '..ohGGGGGGGGGGhoo.',
    '..ohhssssssshhhddo',
    '..ohssssssssshhddo',
    '..ohssssssssshoddo',
    '..ohssssssssshoddo',
    '..ohSssssssSshoddo',
    '...oSsssssssso.ddo',
    '....ossssssoo..do.',
    '...ookkkkkkoo..o..',
    '..ojjjkkkkjjjo....',
    '.ojjjjjkkjjjjjo...',
    '.ojJjjjkkjjjJjo...',
    '.osJjjjkkjjjJso...',
    '.osoJjjjjjjJoso...',
    '..o.oJJJJJJo.o....',
    '....oppppppo......',
    '....opppoppo......',
    '....opppoppo......',
    '...obbbooobbbo....',
    '...oooo...oooo....',
  ],
  {
    o: '#2a1418', h: '#7a4526', H: '#a8693a', d: '#5a321b',
    s: '#f2c29a', S: '#e0a07c', G: '#3a3a4a', g: '#6fd0ff', w: '#ffffff',
    j: '#ff9a3c', J: '#c4561e', k: '#fff0a0', p: '#4a3a5a', b: '#3a2420',
  },
);
export const LAURY_W = 22;
export const LAURY_H = 28;

/** Draws Laury into her own little canvas (the page scales it up). Blinks, talks and waves. */
export class LauryArt {
  private g: CanvasRenderingContext2D;
  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = LAURY_W;
    canvas.height = LAURY_H;
    this.g = canvas.getContext('2d')!;
  }

  /** `talking`: mouth moves; `wave`: right hand up; `still`: no bobbing (calm effects). */
  draw(time: number, talking: boolean, wave: boolean, still: boolean): void {
    const { g } = this;
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };
    g.clearRect(0, 0, LAURY_W, LAURY_H);
    const ox = 1;
    const oy = 2 + (!still && Math.floor(time * 2.5) % 2 ? 1 : 0);
    g.drawImage(LAURY, ox, oy);
    // Eyes, with a blink every few seconds.
    const blink = time % 3.4 < 0.12;
    for (const ex of [6, 10]) {
      if (blink) px(ox + ex, oy + 9, 1, 1, '#2a1418');
      else {
        px(ox + ex, oy + 8, 1, 2, '#2a1418');
        px(ox + ex, oy + 8, 1, 1, '#4a2a20');
      }
    }
    // Mouth: a smile, or flapping while she talks.
    const open = talking && Math.floor(time * 9) % 2 === 0;
    if (open) {
      px(ox + 8, oy + 11, 2, 2, '#b0443a');
      px(ox + 8, oy + 12, 2, 1, '#e86a5a');
    } else {
      px(ox + 7, oy + 11, 1, 1, '#b0443a');
      px(ox + 8, oy + 12, 2, 1, '#b0443a');
      px(ox + 10, oy + 11, 1, 1, '#b0443a');
    }
    if (wave) {
      // Lower hand tucked away, the arm raised and waving beside her head.
      px(ox + 13, oy + 17, 1, 2, '#ff9a3c');
      const sway = Math.floor(time * 6) % 2;
      px(ox + 14, oy + 14, 2, 2, '#2a1418');
      px(ox + 14, oy + 14, 1, 1, '#ff9a3c');
      px(ox + 15 + sway, oy + 11, 2, 3, '#2a1418');
      px(ox + 15 + sway, oy + 12, 1, 2, '#ff9a3c');
      px(ox + 16 + sway, oy + 9, 2, 3, '#2a1418');
      px(ox + 16 + sway, oy + 10, 1, 1, '#f2c29a');
    }
  }
}

export class Logo {
  /** The climber in the O: whichever skin is picked. */
  skin: Skin = SKINS[0];
  private g: CanvasRenderingContext2D;
  /** Letter pixels, and the dark outline around them, worked out once. */
  private fill: Uint8Array;
  private edge: Uint8Array;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = LOGO_W;
    canvas.height = LOGO_H;
    this.g = canvas.getContext('2d')!;
    this.fill = new Uint8Array(LOGO_W * LOGO_H);
    this.edge = new Uint8Array(LOGO_W * LOGO_H);
    for (const w of WORDS) {
      [...w.text].forEach((ch, i) => {
        const rows = GLYPHS[ch];
        if (!rows) return;
        const gx = w.x + i * 6 * w.s;
        rows.forEach((row, ry) => {
          for (let rx = 0; rx < 5; rx++) {
            if (row[rx] !== '#') continue;
            for (let dy = 0; dy < w.s; dy++) for (let dx = 0; dx < w.s; dx++) this.fill[(w.y + ry * w.s + dy) * LOGO_W + gx + rx * w.s + dx] = 1;
          }
        });
      });
    }
    for (let y = 0; y < LOGO_H; y++) {
      for (let x = 0; x < LOGO_W; x++) {
        if (this.fill[y * LOGO_W + x]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < LOGO_W && ny < LOGO_H && this.fill[ny * LOGO_W + nx]) near = true;
          }
        }
        if (near) this.edge[y * LOGO_W + x] = 1;
      }
    }
  }

  draw(time: number): void {
    const { g } = this;
    g.clearRect(0, 0, LOGO_W, LOGO_H);
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };

    // Lava drips hang from HOP and stretch, drop and start again.
    for (let i = 0; i < DRIPS.length; i++) {
      const ph = (time * (0.35 + 0.1 * i) + i * 0.37) % 1;
      const x = DRIPS[i];
      const top = WORDS[1].y + 7 * BIG;
      const len = Math.floor(ph * 7);
      px(x, top, 1, 1 + len, LAVA[2]);
      px(x, top + len, 1, 1, LAVA[1]);
      if (ph > 0.75) px(x, top + 9 + Math.floor((ph - 0.75) * 30), 1, 1, LAVA[1]);
    }

    // A drop shadow, the outline, then the letters in bands from hot yellow to deep red.
    for (let y = 0; y < LOGO_H; y++) {
      for (let x = 0; x < LOGO_W; x++) {
        const k = y * LOGO_W + x;
        if ((this.fill[k] || this.edge[k]) && y + 2 < LOGO_H && !this.fill[k + 2 * LOGO_W] && !this.edge[k + 2 * LOGO_W]) {
          px(x, y + 2, 1, 1, '#3a0a08');
        }
      }
    }
    for (const w of WORDS) {
      const h = 7 * w.s;
      for (let y = w.y - 1; y <= w.y + h; y++) {
        const t = (y - w.y) / (h - 1);
        const band = t < 0.2 ? LAVA[0] : t < 0.45 ? LAVA[1] : t < 0.75 ? LAVA[2] : LAVA[3];
        for (let x = 0; x < LOGO_W; x++) {
          const k = y * LOGO_W + x;
          if (this.edge[k]) px(x, y, 1, 1, '#2a0d12');
          else if (this.fill[k]) px(x, y, 1, 1, band);
        }
      }
      // A hot glint along the top of each letter.
      for (let x = 0; x < LOGO_W; x++) if (this.fill[w.y * LOGO_W + x] && (x + w.y) % 5 !== 0) px(x, w.y, 1, 1, '#fff6c8');
    }

    // Pip is the O: hopping off a little lava puddle in the O's spot.
    const ox = WORDS[1].x + 6 * BIG + 1;
    const floor = WORDS[1].y + 7 * BIG - 1;
    px(ox - 1, floor, 15, 1, LAVA[1]);
    px(ox, floor + 1, 13, 1, LAVA[2]);
    const ph = (time * 1.6) % 1;
    const air = 4 * ph * (1 - ph);
    const lift = Math.round(air * 10);
    const squash = ph < 0.08 || ph > 0.94;
    const top = floor - 11 - lift + (squash ? 1 : 0);
    const s = this.skin;
    const h = squash ? 10 : 11;
    g.drawImage(s.sprite, ox, top, 13, h);
    skinExtra(px, s, ox, top, h, time);
    // Eyes, looking up on the way up.
    for (const e of [3, 8]) {
      px(ox + e, top + 4, 2, 3, '#ffffff');
      px(ox + e + 1, top + 4 + (ph < 0.5 ? 0 : 1), 1, 2, '#2a0d12');
    }
    // Flame hair that flickers, or Starling's star.
    if (s.extra === 'star') skinStar(px, s, ox + 6, top, time);
    else {
      const fl = Math.floor(time * 12) % 2;
      px(ox + 5, top - 1, 3, 1, s.flame[0]);
      px(ox + 6 - fl, top - 2, 2, 1, s.flame[0]);
      px(ox + 6 + fl, top - 3, 1, 1, s.flame[1]);
    }
    if (squash) {
      px(ox - 3, floor - 1, 2, 1, LAVA[0]);
      px(ox + 14, floor - 1, 2, 1, LAVA[0]);
    }
  }
}

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
  private sim: Sim | null = null;
  /** Seconds since the summit eruption began, or -1. */
  private erupt = -1;
  private face = 1;
  /** Calm effects: no screen flashes, no shake, no blinking warnings. */
  calm = false;
  ghost: Ghost | null = null;
  /** Other players climbing the same mode right now. */
  rivals: Rival[] = [];
  /** The climber's look. */
  skin: Skin = SKINS[0];

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

  /** Width of the space beside the shaft, in CSS pixels. */
  get gutter(): number {
    return (this.ox * this.px * window.innerWidth) / this.w;
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

  /** A small puff of smoke and sparks along a ledge. */
  private puff(x: number, y: number, w: number, colors: string[]): void {
    for (let i = 0; i < Math.max(5, w / 10); i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * w, y, vx: (Math.random() - 0.5) * 0.8, vy: 0.6 + Math.random() * 1.2,
        life: 0, max: 24 + Math.random() * 16, color: colors[i % colors.length], size: 1 + (i % 2), grav: -0.01,
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
    const zone = ZONES[sim.zoneAt(e.y / UNITS_PER_METER)];
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
      case 'rumble':
        this.shake = Math.max(this.shake, 3);
        break;
      case 'surge':
        this.flash = Math.max(this.flash, 0.3);
        this.flashColor = '#ff7a1e';
        this.shake = Math.max(this.shake, 4);
        break;
      case 'melt':
        this.puff(e.x, e.y, e.w, ['#ffb02e', '#ff5a1e', '#5a4a4a']);
        break;
      case 'reform':
        this.puff(e.x, e.y, e.w, ['#8a7a7a', '#3a2a2a']);
        break;
      case 'summit':
        this.erupt = 0;
        this.flash = 1;
        this.flashColor = '#fff0a0';
        this.shake = 10;
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
    if (sim !== this.sim) this.erupt = -1;
    this.sim = sim;
    if (this.erupt >= 0) this.erupt += dt;
    // The ground trembles through the warning rumble.
    if (sim.surge === 'rumble' && !sim.dead) this.shake = Math.max(this.shake, 2.5);

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

    const zM = sim.zoneMeters(camM);
    this.drawBackdrop(zM);
    this.drawFloor(sim);
    this.drawSummit(sim);

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
    if (this.ghost) this.drawGhost(this.ghost);
    this.drawRivals();
    if (!sim.dead) this.drawPlayer(px, py, sim, k);
    else if (sim.won && this.erupt >= 0) this.drawEruption(px, py, sim, k);
    this.drawParticles(k);
    b.restore();

    this.drawLava(sim);
    this.drawSides(zM);

    // Blow the buffer up onto the screen.
    if (this.calm) {
      this.shake = 0;
      this.flash = 0;
    }
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
    if (this.ghost) this.drawGhostLabel(this.ghost);
    this.drawRivalLabels();

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

  private drawLava(sim: Sim): void {
    const { b } = this;
    const top = this.ay(this.lava);
    const t = this.time * (sim.surge === 'rise' || sim.surge === 'hold' ? 1.8 : 1);
    // 0..1: how worked up the lava is.
    const hot = sim.surge === 'rise' || sim.surge === 'hold' ? 1 : sim.surge === 'none' ? 0 : 0.4;
    const LV = hot ? LAVA.map((c, i) => mix(c, i < 2 ? '#fff6b0' : '#ff7a1e', 0.35 * hot)) : LAVA;
    // Heat haze above the surface.
    for (let i = 0; i < 4; i++) {
      b.globalAlpha = 0.07 * (4 - i);
      this.r(0, top - 6 * (i + 1) - 2, this.bw, 6, '#ff7a1e');
    }
    b.globalAlpha = 1;
    for (let x = 0; x < this.bw; x += 2) {
      const wave = Math.round(1.6 * (1 + hot * 0.6) * Math.sin(x * 0.11 + t * 2.2) + 1.2 * Math.sin(x * 0.045 - t * 1.4));
      const y = top - wave;
      this.r(x, y, 2, 2, LV[0]);
      this.r(x, y + 2, 2, 3, LV[1]);
      this.r(x, y + 5, 2, 6, LV[2]);
      this.r(x, y + 11, 2, 10, LV[3]);
      this.r(x, y + 21, 2, this.bh, LV[4]);
    }
    // Heat shimmer: rows just above the surface wobble sideways.
    if (!this.calm) {
      b.globalAlpha = 0.16;
      for (let i = 0; i < 5; i++) {
        for (let x = 0; x < this.bw; x += 7) {
          if (Math.sin(x * 0.37 + this.time * 5 + i * 1.9) > 0.25) this.r(x + Math.round(Math.sin(this.time * 3 + i) * 2), top - 4 - i * 3, 5, 1, '#ffd08a');
        }
      }
      b.globalAlpha = 1;
    }
    // Bubbles that swell and pop.
    for (let i = 0; i < Math.ceil(this.bw / (hot > 0.5 ? 22 : 40)); i++) {
      const ph = (t * (0.5 + hashFrac(i, 3) * 0.6) + hashFrac(i, 8)) % 1;
      const x = Math.floor(hashFrac(i, Math.floor(t * (0.5 + hashFrac(i, 3) * 0.6) + hashFrac(i, 8))) * this.bw);
      const rad = 1 + Math.floor(ph * 3);
      if (ph < 0.85) this.ring(x, top + 4, rad, LV[0]);
      else for (let s = 0; s < 4; s++) this.r(x + (s - 1.5) * 3, top - 2 - (ph - 0.85) * 30, 1, 1, LV[0]);
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
    const z = this.sim ? this.sim.zoneAt(p.y / UNITS_PER_METER) : 0;
    let [glow, lit, dark] = ZONES[z].plat;
    const moving = p.mx !== 0 || p.my !== 0;
    // Cracked and drifting ledges are made of what their zone is made of. The tells stay the same
    // everywhere: cracked ledges show gaps between their pieces, drifting ones are held up from below.
    if (p.kind === Kind.Crumble || (p.kind === Kind.Normal && moving && z > 0)) {
      if (p.kind === Kind.Crumble) this.crumbleLedge(z, left, top, w, p.id);
      else this.driftLedge(z, left, top, w, p.id);
      if (moving) this.lift(z, left, top, w, p.id);
      this.puffcap(p, cx, top);
      return;
    }
    if (p.kind === Kind.Crust) {
      if (p.melt >= 0) {
        // Melted: only a faint outline of where it was.
        b.globalAlpha = 0.22;
        this.r(left, top + 1, w, 1, '#ff7a1e');
        b.globalAlpha = 1;
        return;
      }
      [glow, lit, dark] = ['#4a3636', '#2e2023', '#1a1115'];
    }
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
    } else if (p.kind === Kind.Crust) {
      // Glowing cracks: more of them, and hotter, as it heats.
      const HEAT = ['#7a2a14', '#c4481a', '#ff7a1e', '#ffd84a'];
      const heat = Math.max(0, Math.min(3, p.heat));
      const col = HEAT[heat];
      for (let c = 2 + Math.floor(hashFrac(p.id, 97) * 3); c < w - 2; c += 5) {
        const f = hashFrac(p.id, c + 60);
        if (heat < 3 && f < 0.35 - heat * 0.1) continue;
        this.r(left + c, top, 1, 2, col);
        this.r(left + c + 1, top + 2, 1, 2, col);
        if (heat >= 2) this.r(left + c, top + 4, 1, 1, col);
      }
      if (heat >= 2) {
        b.globalAlpha = 0.18 + 0.08 * Math.sin(this.time * 9 + p.id) * (heat - 1);
        this.r(left, top - 1, w, 1, col);
        b.globalAlpha = 1;
      }
    } else if (p.kind === Kind.Ice) {
      for (let c = 1; c < w - 1; c += 4) this.r(left + c, top + 4, 1, 1 + Math.floor(hashFrac(p.id, c + 40) * 4), '#dff6ff');
    }
    if (moving) this.lift(z, left, top, w, p.id);
    this.puffcap(p, cx, top);
  }

  /** The pieces of a cracked ledge, split by 1-pixel gaps: [start, width] in art pixels. */
  private pieces(w: number, id: number): [number, number][] {
    const out: [number, number][] = [];
    let a = 0;
    for (let g = 4 + Math.floor(hashFrac(id, 98) * 3); g < w - 3; g += 6) {
      out.push([a, g - a]);
      a = g + 1;
    }
    out.push([a, w - a]);
    return out;
  }

  /** A cracked ledge (one bounce and it's gone), in its zone's material. */
  private crumbleLedge(z: number, left: number, top: number, w: number, id: number): void {
    const { b } = this;
    const parts = this.pieces(w, id);
    if (z === 0) {
      // Cooled lava blocks, still glowing in the seams.
      b.globalAlpha = 0.55;
      for (const [a] of parts) if (a > 0) this.r(left + a - 1, top + 1, 1, 3, '#ff6a1e');
      b.globalAlpha = 1;
    }
    for (const [a, pw] of parts) {
      const x = left + a;
      const f = hashFrac(id, a + 7);
      if (z === 0) {
        this.r(x, top, pw, 1, '#a0482a');
        this.r(x, top + 1, pw, 2, '#5a2618');
        this.r(x, top + 3, pw, 1 + Math.floor(f * 2), '#2e1210');
        if (pw > 2) this.r(x + 1, top + 1, 1, 1, '#c4602e');
      } else if (z === 1) {
        // Cracked crystal shards, each with a point underneath.
        this.r(x, top, pw, 1, '#e6e0ff');
        this.r(x, top + 1, pw, 2, '#8a76e0');
        this.r(x, top + 3, pw, 1, '#4a3a9a');
        if (pw > 2) this.r(x + 1, top + 4, pw - 2, 1, '#4a3a9a');
        this.r(x + Math.floor(pw / 2), top + 5, 1, 1, '#2e2470');
        this.r(x + Math.floor(f * (pw - 1)), top + 1, 1, 1, '#ffffff');
      } else if (z === 2) {
        // Brittle ribs on a thin spine.
        this.r(x, top, pw, 1, '#fff4d6');
        this.r(x, top + 1, pw, 1, '#c9b48a');
        for (let c = 1; c < pw; c += 2) this.r(x + c, top + 2, 1, 2 + Math.floor(hashFrac(id, a + c) * 2), '#d9c79c');
      } else if (z === 3) {
        // A thin snow crust with clumps hanging off it.
        this.r(x, top, pw, 1, '#ffffff');
        this.r(x, top + 1, pw, 1, '#dff2fb');
        this.r(x, top + 2, pw, 1, '#a8d4ea');
        if (pw > 3) this.r(x + 1 + Math.floor(f * (pw - 3)), top + 3, 2, 1 + Math.floor(f * 2), '#cfeefc');
      } else if (z === 4) {
        // Porous cinder blocks.
        this.r(x, top, pw, 1, '#c09a8e');
        this.r(x, top + 1, pw, 2, '#4a3c40');
        this.r(x, top + 3, pw, 1, '#2a2024');
        if (pw > 2) this.r(x + 1 + Math.floor(f * (pw - 2)), top + 1, 1, 1, '#1a1216');
        if (f > 0.7) this.r(x + Math.floor(f * pw) - 1, top + 2, 1, 1, '#ff7a3c');
      } else {
        // Packed ash, flaking away underneath.
        this.r(x, top, pw, 1, '#c9c0cf');
        this.r(x, top + 1, pw, 2, '#75697f');
        this.r(x, top + 3, pw, 1, '#4a4252');
        const fall = (this.time * 5 + f * 8) % 8;
        b.globalAlpha = 1 - fall / 8;
        this.r(x + Math.floor(f * pw), top + 4 + Math.floor(fall), 1, 1, '#a89fb0');
        b.globalAlpha = 1;
      }
    }
  }

  /** A drifting ledge's body above the Magma Chamber (the chamber keeps plain rock). */
  private driftLedge(z: number, left: number, top: number, w: number, id: number): void {
    if (z === 1) {
      // A floating crystal, tapering to a point.
      this.r(left + 1, top, w - 2, 1, '#b8fff6');
      this.r(left, top + 1, w, 1, '#8a76e0');
      this.r(left, top + 2, w, 1, '#5a48b0');
      let inset = 1;
      for (let y = top + 3; inset * 2 < w && y < top + 7; y++, inset += 2) this.r(left + inset, y, w - inset * 2, 1, '#3d2f86');
      for (let c = 3; c < w - 3; c += 6) this.r(left + c, top + 1, 1, 2, '#cfc4ff');
    } else if (z === 2) {
      // A raft of bone with knobbed ends.
      this.r(left + 1, top, w - 2, 1, '#fff4d6');
      this.r(left, top + 1, w, 1, '#efe2c0');
      this.r(left, top + 2, w, 1, '#c9b48a');
      this.r(left + 1, top + 3, w - 2, 1, '#8a7652');
      for (const ex of [left - 1, left + w - 2]) {
        this.r(ex, top - 1, 3, 5, '#efe2c0');
        this.r(ex + 1, top - 1, 1, 1, '#fff4d6');
      }
      for (let c = 4 + Math.floor(hashFrac(id, 3) * 3); c < w - 4; c += 6) this.r(left + c, top + 1, 1, 2, '#8a7652');
    } else if (z === 3) {
      // An ice floe.
      this.r(left, top, w, 1, '#ffffff');
      this.r(left, top + 1, w, 1, '#cfeefc');
      this.r(left, top + 2, w, 1, '#8cc4e2');
      this.r(left + 1, top + 3, w - 2, 1, '#5b98bd');
      for (let c = 2; c < w - 2; c += 5) if (hashFrac(id, c) > 0.5) this.r(left + c, top + 4, 2, 1, '#5b98bd');
      if (Math.sin(this.time * 3 + id) > 0.8) this.r(left + 2, top + 1, 1, 1, '#ffffff');
    } else if (z === 4) {
      // A raft of pumice, full of holes.
      this.r(left + 1, top, w - 2, 1, '#ff8a4a');
      this.r(left, top + 1, w, 1, '#9a7a72');
      this.r(left, top + 2, w, 2, '#6e5550');
      this.r(left + 1, top + 4, w - 2, 1, '#4a3836');
      for (let c = 1; c < w - 1; c += 3) {
        const f = hashFrac(id, c + 20);
        if (f > 0.45) this.r(left + c, top + 2 + Math.floor(f * 2), 1, 1, '#2e2224');
      }
    } else {
      // A puff of cinder cloud, darker than the sky's clouds, with a glowing top so it reads as solid.
      for (let c = 1; c < w - 3; c += 4) this.r(left + c, top - 1, 3, 1, '#8a7f94');
      this.r(left, top, w, 1, '#ffd9f2');
      this.r(left, top + 1, w, 2, '#4a4252');
      this.r(left + 1, top + 3, w - 2, 1, '#2e2834');
      for (let c = 2; c < w - 3; c += 4) if (hashFrac(id, c) > 0.5) this.r(left + c, top + 4, 2, 1, '#2e2834');
    }
  }

  /** What holds a drifting ledge up, by zone. */
  private lift(z: number, left: number, top: number, w: number, id: number): void {
    const { b } = this;
    const fl = Math.floor(this.time * 12 + id) % 3;
    const ends = [left + 2, left + w - 4];
    if (z === 0) {
      // Hot sparks.
      for (const ex of ends) {
        this.r(ex, top + 6 + fl, 2, 1, '#ffb02e');
        this.r(ex + (fl === 1 ? 1 : 0), top + 8 + fl, 1, 1, '#ff5a1e');
      }
    } else if (z === 1) {
      // A soft crystal glow.
      b.globalAlpha = 0.22 + 0.1 * Math.sin(this.time * 4 + id);
      this.r(left + 3, top + 7, w - 6, 1, '#6ff2e0');
      this.r(left + 5, top + 8, w - 10, 1, '#6ff2e0');
      b.globalAlpha = 1;
      this.r(left + Math.floor(w / 2), top + 8 + fl * 2, 1, 1, '#b8fff6');
    } else if (z === 2 || z === 5) {
      // Dust or ash trickling off.
      const col = z === 2 ? '#d9c08a' : '#a89fb0';
      for (const ex of ends) {
        b.globalAlpha = 0.8 - fl * 0.25;
        this.r(ex + (fl === 1 ? 1 : 0), top + 6 + fl * 2, 1, 1, col);
        b.globalAlpha = 1;
      }
    } else {
      // Steam (Ice Cap) or smoke with a spark (Crater Rim).
      const col = z === 3 ? '#e8fbff' : '#8a7a80';
      for (const ex of ends) {
        b.globalAlpha = 0.55 - fl * 0.15;
        this.r(ex, top + 6 + fl * 2, 2 + fl, 2, col);
        b.globalAlpha = 1;
      }
      if (z === 4) this.r(ends[fl % 2] + 1, top + 7 + fl, 1, 1, '#ffb02e');
    }
  }

  /** A puffcap mushroom: land on it for a big bounce. */
  private puffcap(p: Platform, cx: number, top: number): void {
    if (p.spring !== null) {
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
        // Calm effects keep it steady and let it brighten instead.
        const blink = this.calm ? 1 : Math.floor(this.time * 10) % 2;
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

  /** The ghost: the same ember, faded and tinted, with no effects. */
  private drawGhost(g: Ghost): void {
    if (!this.visible(g.y, 40)) return;
    const { b } = this;
    b.globalAlpha = 0.75;
    this.wrapped(g.x, 40, (x) => {
      const cx = this.ax(x);
      const feet = this.ay(g.y);
      b.drawImage(GHOST, cx - 6, feet - 12);
      this.r(cx - 1, feet - 15, 3, 1, '#bff6ff');
      this.r(cx, feet - 17, 1, 2, '#bff6ff');
    });
    b.globalAlpha = 1;
  }

  private drawGhostLabel(g: Ghost): void {
    if (!this.visible(g.y, 40)) return;
    const { ctx } = this;
    ctx.font = `${Math.max(12, 7 * this.px)}px ${FONT}`;
    ctx.fillStyle = 'rgba(191, 246, 255, 0.75)';
    ctx.textAlign = 'center';
    let x = g.x;
    if (x < 40) x = 40;
    if (x > WIDTH - 40) x = WIDTH - 40;
    ctx.fillText(g.label, this.ax(x) * this.px, (this.ay(g.y) - 20) * this.px);
  }

  /** Other live climbers: their own look, see-through, with no effects. Endless ones get a tick on the wall. */
  private drawRivals(): void {
    const { b } = this;
    for (const rv of this.rivals) {
      if (!this.visible(rv.y, 40)) continue;
      const s = skinAt(rv.skin);
      if (!rv.inWorld) {
        // A different tower: a notch on the left wall at their height, in their colors.
        const y = this.ay(rv.y) - 8;
        for (let i = 0; i < 4; i++) this.r(this.ox, y + i, 5 - i, 1, s.pal.o);
        for (let i = 1; i < 4; i++) this.r(this.ox, y - i, 5 - i, 1, s.pal.o);
        for (let i = 0; i < 3; i++) this.r(this.ox, y + i, 3 - i, 1, s.pal.y);
        for (let i = 1; i < 3; i++) this.r(this.ox, y - i, 3 - i, 1, s.pal.y);
        continue;
      }
      b.globalAlpha = 0.6;
      this.wrapped(rv.x, 40, (x) => {
        const cx = this.ax(x);
        const feet = this.ay(rv.y);
        const top = feet - 12;
        b.drawImage(s.sprite, cx - 6, top);
        for (const e of [-3, 2]) {
          this.r(cx + e, top + 4, 2, 3, '#ffffff');
          this.r(cx + e + 1, top + 5, 1, 2, '#2a0d12');
        }
        this.r(cx - 1, top - 1, 3, 1, s.flame[0]);
        this.r(cx, top - 3, 1, 2, s.flame[1]);
      });
      b.globalAlpha = 1;
    }
  }

  /** Name tags over live climbers on screen, and arrows at the top or bottom edge for the ones off it. */
  private drawRivalLabels(): void {
    if (!this.rivals.length) return;
    const { ctx } = this;
    const size = Math.max(12, 7 * this.px);
    ctx.font = `${size}px ${FONT}`;
    let above = 0;
    let below = 0;
    for (const rv of this.rivals) {
      const s = skinAt(rv.skin);
      const m = `${Math.max(0, Math.floor(rv.y / UNITS_PER_METER)).toLocaleString('en-US')} m`;
      const top = this.camBottom + this.bh * A;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = s.pal.h;
      if (rv.y > top - 30) {
        // Higher than the view: stack along the top edge.
        ctx.textAlign = 'left';
        ctx.fillText(`▲ ${rv.name} ${m}`, (this.ox + 3) * this.px, (40 + above * 9) * this.px);
        above++;
      } else if (rv.y < this.camBottom + LAVA_SHOW) {
        // Below the view (behind you): stack just above the lava.
        ctx.textAlign = 'left';
        ctx.fillText(`▼ ${rv.name} ${m}`, (this.ox + 3) * this.px, (this.bh - 22 - below * 9) * this.px);
        below++;
      } else if (rv.inWorld) {
        ctx.textAlign = 'center';
        const x = Math.max(40, Math.min(WIDTH - 40, rv.x));
        ctx.fillText(rv.name, this.ax(x) * this.px, (this.ay(rv.y) - 18) * this.px);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(rv.name, (this.ox + 6) * this.px, (this.ay(rv.y) - 3) * this.px);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The full-width ledge at the Daily summit, drawn as the crater lip. */
  private drawSummit(sim: Sim): void {
    let p: Platform | null = null;
    for (let i = sim.platforms.length - 1; i >= 0 && i > sim.platforms.length - 8; i--) if (sim.platforms[i].summit) p = sim.platforms[i];
    if (!p || !this.visible(p.y, 200)) return;
    const top = this.ay(p.y);
    const { b } = this;
    // Light spilling over the rim.
    for (let i = 0; i < 5; i++) {
      b.globalAlpha = 0.07 * (5 - i);
      this.r(0, top - 10 - i * 8, this.bw, 8, '#ffb84a');
    }
    b.globalAlpha = 1;
    const rock = ['#ffd84a', '#c4481a', '#2e2023', '#1a1115'];
    this.r(0, top, this.bw, 1, rock[0]);
    this.r(0, top + 1, this.bw, 2, rock[1]);
    this.r(0, top + 3, this.bw, this.bh, rock[2]);
    for (let x = 0; x < this.bw; x += 3) {
      const f = hashFrac(x, 11);
      if (f > 0.55) this.r(x, top + 4 + Math.floor(f * 20), 2, 1, rock[3]);
      if (f < 0.25) this.r(x, top + 2, 1, 3, Math.floor(this.time * 6 + x) % 5 ? rock[1] : rock[0]);
    }
    // Jagged teeth along the rim.
    for (let x = 0; x < this.bw; x += 5) {
      const h = 2 + Math.floor(hashFrac(x, 23) * 5);
      this.r(x, top - h, 3, h, rock[2]);
      this.r(x, top - h, 3, 1, rock[1]);
    }
  }

  /** The summit eruption: the ember is flung up and out of the top of the screen on a column of fire. */
  private drawEruption(px: number, py: number, sim: Sim, k: number): void {
    const t = this.erupt;
    const rise = 120 * t + 700 * t * t;
    this.drawPlayer(px, py + rise, sim, k);
    const base = this.ay(py);
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: px + (Math.random() - 0.5) * 24, y: py + rise - Math.random() * 40, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2,
        life: 0, max: 30 + Math.random() * 20, color: LAVA[i % 3], size: 1 + (i % 2), grav: 0.05,
      });
    }
    if (t < 0.6) {
      const w = Math.round(14 * (1 - t / 0.6) + 4);
      this.r(this.ax(px) - w / 2, 0, w, base, t < 0.3 ? '#fff0a0' : LAVA[1]);
    }
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
        color: riding && sim.ride === PickupKind.Geyser ? '#dff6ff' : this.skin.flame[1], size: 1, grav: 0,
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
      const s = this.skin;
      // The closer the lava, the brighter the ember glows.
      const near = clamp01(1 - (py - sim.lavaY) / Math.max(1, sim.fallLimit));
      if (near > 0.45) {
        b.globalAlpha = 0.28 * ((near - 0.45) / 0.55) * (this.calm ? 1 : 0.8 + 0.2 * Math.sin(t * 14));
        this.disc(cx, top + 5, 10, '#ffb84a');
        b.globalAlpha = 1;
      }
      b.drawImage(s.sprite, left, top, bw, bh);
      skinExtra((x, y, w, h, c) => this.r(x, y, w, h, c), s, left, top, bh, t);
      // Feet tuck in on the way up.
      if (wide <= 0) {
        const fy = feet - 1 - (sim.vy > 2 ? 1 : 0);
        this.r(cx - 4, fy, 2, 1, s.pal.o);
        this.r(cx + 2, fy, 2, 1, s.pal.o);
      }
      // Eyes look where you're steering, and up or down with the motion.
      const ey = top + 4 - (wide > 0 ? 1 : 0);
      const look = sim.vy > 2 ? 0 : 1;
      for (const e of [-3, 2]) {
        const exx = cx + e + this.face;
        this.r(exx, ey, 2, 3, '#ffffff');
        this.r(exx + (this.face > 0 ? 1 : 0), ey + look, 1, 2, '#2a0d12');
      }
      // The flame leans away from where you're going and stretches when you fall. Starling has a star.
      if (s.extra === 'star') skinStar((x, y, w, h, c) => this.r(x, y, w, h, c), s, cx, top, t);
      else {
        const lean = Math.max(-2, Math.min(2, sim.vx / 3));
        const len = sim.vy < -4 ? 5 : sim.vy > 6 ? 2 : 3;
        for (let i = 0; i < len; i++) {
          const fx = cx - Math.round(lean * i * 0.6) + (i > 0 && Math.floor(t * 14 + i) % 2 ? 1 : 0);
          const fw = i === 0 ? 3 : i < 3 ? 2 : 1;
          this.r(fx - Math.floor(fw / 2), top - 1 - i, fw, 1, i < 2 ? s.flame[0] : s.flame[1]);
        }
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
