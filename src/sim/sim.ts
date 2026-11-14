// The whole game's rules. No DOM, no Math.sin, no clocks: the server replays runs with this file
// and must land on exactly the same height the player saw.
//
// Units: x runs 0..WIDTH and wraps. y points UP, 0 is the street. 10 units = 1 meter. 60 ticks a second.

import { Rng, hash32, hashFrac } from './rng';
import { FEATURE, difficulty, lightningOn, windStrength } from './zones';

export const WIDTH = 420;
export const UNITS_PER_METER = 10;
export const TICK_RATE = 60;
export const GRAVITY = 0.42;
export const BOUNCE = 13.6;
export const SPRING = 24;
export const STOMP = 14.6;
export const MAX_FALL = 22;
export const RUN_SPEED = 6.2;
export const STEER = 1.1;
export const ICE_STEER = 0.13;
export const ICE_TICKS = 42;
/** Highest a normal bounce carries you. */
export const APEX = (BOUNCE * BOUNCE) / (2 * GRAVITY);
/** The biggest gap the generator ever leaves between path platforms, as a share of APEX. */
export const MAX_GAP = 0.86;
export const PLAYER_HALF = 13;
export const PLAYER_H = 30;
export const RESPAWN_TICKS = 300;
export const DRONE_R = 15;
export const DEBRIS_R = 13;
export const BOLT_HALF = 22;
export const BOLT_WARN = 70;
export const BOLT_LIVE = 16;
export const GUST_CYCLE = 420;
/** Input is an integer -4..4: keyboard gives ±4, tilt gives the steps between. */
export const INPUT_MAX = 4;

const BUCKET = 200;

export enum Kind {
  Normal = 0,
  Crumble = 1,
  Ice = 2,
  Fake = 3,
}

export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  kind: Kind;
  /** Side-to-side swing, units. */
  mx: number;
  /** Up-and-down bob, units. */
  my: number;
  /** Swing period in ticks, and phase in ticks. */
  per: number;
  ph: number;
  /** Spring offset from the center, or null. */
  spring: number | null;
  /** Tick it broke, or -1. Crumbling and fake ledges come back after RESPAWN_TICKS. */
  broken: number;
  /** Part of the guaranteed route up (used by tests and the bot). */
  path: boolean;
}

export enum HazardKind {
  Drone = 0,
  Debris = 1,
}

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  /** Drone: patrol half-width and period. Debris: speed per tick (signed), period unused. */
  a: number;
  per: number;
  ph: number;
  dead: boolean;
}

export interface Bolt {
  x: number;
  y: number;
  start: number;
}

export type SimEvent =
  | { t: 'bounce'; x: number; y: number; kind: Kind }
  | { t: 'spring'; x: number; y: number }
  | { t: 'crumble'; x: number; y: number }
  | { t: 'fake'; x: number; y: number }
  | { t: 'stomp'; x: number; y: number }
  | { t: 'strike'; x: number; y: number }
  | { t: 'warn'; x: number; y: number }
  | { t: 'die'; x: number; y: number; cause: string };

export interface SimOptions {
  /** Tests switch hazards off to check the route alone. */
  hazards?: boolean;
}

/** Triangle wave in [-1, 1] with no trig, so it's identical everywhere. */
export function tri(u: number): number {
  const f = u - Math.floor(u);
  return 1 - 4 * Math.abs(f - 0.5);
}

/** Shortest signed distance from a to b across the wrapping edge. */
export function wrapDx(a: number, b: number): number {
  let d = (b - a) % WIDTH;
  if (d > WIDTH / 2) d -= WIDTH;
  else if (d < -WIDTH / 2) d += WIDTH;
  return d;
}

const wrapX = (x: number) => {
  const r = x % WIDTH;
  return r < 0 ? r + WIDTH : r;
};

export function platX(p: Platform, tick: number): number {
  return p.mx === 0 ? p.x : wrapX(p.x + p.mx * tri((tick + p.ph) / p.per));
}

export function platY(p: Platform, tick: number): number {
  return p.my === 0 ? p.y : p.y + p.my * tri((tick + p.ph) / (p.per * 1.5));
}

export function hazardPos(h: Hazard, tick: number): [number, number] {
  if (h.kind === HazardKind.Drone) return [wrapX(h.x + h.a * tri((tick + h.ph) / h.per)), h.y];
  return [wrapX(h.x + h.a * tick), h.y + 18 * tri((tick + h.ph) / 200)];
}

export class Sim {
  readonly seed: number;
  tick = 0;
  x = WIDTH / 2;
  y = 0;
  vx = 0;
  vy = BOUNCE;
  maxY = 0;
  iceTimer = 0;
  wind = 0;
  dead = false;
  cause = '';
  input = 0;
  platforms: Platform[] = [];
  hazards: Hazard[] = [];
  bolts: Bolt[] = [];
  events: SimEvent[] = [];

  private readonly hazardsOn: boolean;
  private gen: Rng;
  private boltRng: Rng;
  private nextBolt = 0;
  private topY = 0;
  private topX = WIDTH / 2;
  private nextId = 1;
  private pBuckets = new Map<number, Platform[]>();
  private hBuckets = new Map<number, Hazard[]>();

  constructor(seed: number, opts: SimOptions = {}) {
    this.seed = seed >>> 0;
    this.hazardsOn = opts.hazards !== false;
    this.gen = new Rng(hash32(this.seed, 1));
    this.boltRng = new Rng(hash32(this.seed, 2));
    this.generateUntil(APEX * 12);
  }

  get meters(): number {
    return Math.floor(this.maxY / UNITS_PER_METER);
  }

  get heightNow(): number {
    return Math.floor(this.y / UNITS_PER_METER);
  }

  /** Advance one tick with input -4..4. Does nothing once dead. */
  step(input: number): void {
    if (this.dead) return;
    const inp = Math.max(-INPUT_MAX, Math.min(INPUT_MAX, Math.round(input) || 0));
    this.input = inp;
    this.tick++;
    const t = this.tick;
    const meters = this.y / UNITS_PER_METER;

    // Steering: snappy in the air, slippery for a moment after ice.
    const accel = this.iceTimer > 0 ? ICE_STEER : STEER;
    if (this.iceTimer > 0) this.iceTimer--;
    const target = (RUN_SPEED * inp) / INPUT_MAX;
    const dv = target - this.vx;
    this.vx += dv > accel ? accel : dv < -accel ? -accel : dv;

    this.wind = this.hazardsOn ? this.windAt(t, meters) : 0;

    const prevY = this.y;
    this.vy -= GRAVITY;
    if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;
    this.x = wrapX(this.x + this.vx + this.wind);
    this.y += this.vy;

    if (this.vy < 0) this.land(prevY, t);
    if (this.y <= 0) {
      this.y = 0;
      this.vy = BOUNCE;
      this.events.push({ t: 'bounce', x: this.x, y: 0, kind: Kind.Normal });
    }
    if (this.y > this.maxY) this.maxY = this.y;

    // Broken ledges come back.
    for (const p of this.near(this.pBuckets, this.y, 3)) {
      if (p.broken >= 0 && t - p.broken >= RESPAWN_TICKS) p.broken = -1;
    }

    if (this.hazardsOn) {
      this.touchHazards(prevY, t);
      this.lightning(t, meters);
    }

    if (this.maxY + APEX * 8 > this.topY) this.generateUntil(this.maxY + APEX * 12);
  }

  /** Every bucket within `span` of y. */
  private *near<T>(map: Map<number, T[]>, y: number, span: number): Iterable<T> {
    const b = Math.floor(y / BUCKET);
    for (let i = b - span; i <= b + span; i++) {
      const list = map.get(i);
      if (list) yield* list;
    }
  }

  private land(prevY: number, t: number): void {
    let best: Platform | null = null;
    let bestY = -Infinity;
    for (const p of this.near(this.pBuckets, this.y, 1)) {
      if (p.broken >= 0) continue;
      const py = platY(p, t);
      const pyPrev = platY(p, t - 1);
      if (prevY < pyPrev - 0.001 || this.y > py) continue;
      if (Math.abs(wrapDx(this.x, platX(p, t))) > p.w / 2 + PLAYER_HALF * 0.7) continue;
      if (p.kind === Kind.Fake) {
        p.broken = t;
        this.events.push({ t: 'fake', x: platX(p, t), y: py });
        continue;
      }
      if (py > bestY) {
        best = p;
        bestY = py;
      }
    }
    if (!best) return;
    const px = platX(best, t);
    this.y = bestY;
    if (best.spring !== null && Math.abs(wrapDx(px + best.spring, this.x)) <= 15) {
      this.vy = SPRING;
      this.events.push({ t: 'spring', x: this.x, y: bestY });
    } else {
      this.vy = BOUNCE;
      this.events.push({ t: 'bounce', x: this.x, y: bestY, kind: best.kind });
    }
    if (best.kind === Kind.Crumble) {
      best.broken = t;
      this.events.push({ t: 'crumble', x: px, y: bestY });
    } else if (best.kind === Kind.Ice) {
      this.iceTimer = ICE_TICKS;
      const cap = RUN_SPEED * 1.3;
      this.vx = Math.max(-cap, Math.min(cap, this.vx * 1.3));
    }
  }

  private touchHazards(prevY: number, t: number): void {
    const cx = this.x;
    const cy = this.y + PLAYER_H / 2;
    for (const h of this.near(this.hBuckets, this.y, 1)) {
      if (h.dead) continue;
      const [hx, hy] = hazardPos(h, t);
      const dx = wrapDx(cx, hx);
      const dy = hy - cy;
      const r = (h.kind === HazardKind.Drone ? DRONE_R : DEBRIS_R) + 11;
      if (dx * dx + dy * dy >= r * r) continue;
      // Falling onto a drone from above squashes it and bounces you.
      if (h.kind === HazardKind.Drone && this.vy < 0 && prevY >= hy) {
        h.dead = true;
        this.vy = STOMP;
        this.events.push({ t: 'stomp', x: hx, y: hy });
        continue;
      }
      this.die(h.kind === HazardKind.Drone ? 'drone' : 'debris');
      return;
    }
  }

  private lightning(t: number, meters: number): void {
    this.bolts = this.bolts.filter((b) => t - b.start <= BOLT_WARN + BOLT_LIVE);
    if (lightningOn(meters) && t >= this.nextBolt) {
      const d = difficulty(meters);
      const r = this.boltRng;
      const aimed = r.chance(0.55);
      const x = aimed ? wrapX(this.x + r.range(-40, 40)) : r.range(0, WIDTH);
      const bolt = { x, y: this.y, start: t };
      this.bolts.push(bolt);
      this.events.push({ t: 'warn', x, y: this.y });
      this.nextBolt = t + Math.floor(150 - 70 * d + r.range(0, 120));
    }
    for (const b of this.bolts) {
      const age = t - b.start;
      if (age === BOLT_WARN) this.events.push({ t: 'strike', x: b.x, y: b.y });
      if (age < BOLT_WARN || age > BOLT_WARN + BOLT_LIVE) continue;
      if (Math.abs(wrapDx(this.x, b.x)) < BOLT_HALF + PLAYER_HALF * 0.6 && Math.abs(this.y - b.y) < 520) {
        this.die('lightning');
        return;
      }
    }
  }

  /** Gusts: calm, ramp up, hold, ramp down. The page shows the arrow during the calm. */
  windAt(t: number, meters: number): number {
    const max = windStrength(meters);
    if (max === 0) return 0;
    const k = Math.floor(t / GUST_CYCLE);
    const ph = t - k * GUST_CYCLE;
    const dir = hash32(this.seed, k + 1000) & 1 ? 1 : -1;
    const s = max * (0.55 + 0.45 * hashFrac(this.seed, k + 5000));
    let env = 0;
    if (ph < 90) env = 0;
    else if (ph < 150) env = (ph - 90) / 60;
    else if (ph < 350) env = 1;
    else env = (GUST_CYCLE - ph) / 70;
    return dir * s * env;
  }

  /** Direction of the gust that's coming or blowing, for the HUD. 0 when calm and nothing is coming. */
  gustDir(t: number, meters: number): number {
    if (windStrength(meters) === 0) return 0;
    const k = Math.floor(t / GUST_CYCLE);
    const ph = t - k * GUST_CYCLE;
    if (ph < 30) return 0;
    return hash32(this.seed, k + 1000) & 1 ? 1 : -1;
  }

  private die(cause: string): void {
    this.dead = true;
    this.cause = cause;
    this.events.push({ t: 'die', x: this.x, y: this.y, cause });
  }

  // ---------- Level generation ----------

  private addPlatform(p: Omit<Platform, 'id' | 'broken'>): Platform {
    const full: Platform = { ...p, id: this.nextId++, broken: -1 };
    this.platforms.push(full);
    const b = Math.floor(p.y / BUCKET);
    let list = this.pBuckets.get(b);
    if (!list) this.pBuckets.set(b, (list = []));
    list.push(full);
    return full;
  }

  private addHazard(h: Omit<Hazard, 'id' | 'dead'>): void {
    const full: Hazard = { ...h, id: this.nextId++, dead: false };
    this.hazards.push(full);
    const b = Math.floor(h.y / BUCKET);
    let list = this.hBuckets.get(b);
    if (!list) this.hBuckets.set(b, (list = []));
    list.push(full);
  }

  private generateUntil(y: number): void {
    if (this.platforms.length === 0) {
      // The street: a wide ledge to start on (the ground also bounces).
      this.addPlatform({ x: WIDTH / 2, y: 0, w: WIDTH, kind: Kind.Normal, mx: 0, my: 0, per: 1, ph: 0, spring: null, path: true });
    }
    while (this.topY < y) this.genStep();
  }

  private genStep(): void {
    const r = this.gen;
    const m = this.topY / UNITS_PER_METER;
    const d = difficulty(m);

    // The next ledge on the guaranteed route.
    let frac = 0.26 + 0.56 * d + r.range(-0.08, 0.08);
    frac = Math.max(0.18, Math.min(MAX_GAP, frac));
    let y = this.topY + frac * APEX;
    const reach = 60 + 220 * d;
    const x = wrapX(this.topX + r.range(-reach, reach));
    const w = Math.max(40, 100 - 56 * d) * r.range(0.85, 1.15);

    let kind = Kind.Normal;
    if (m >= FEATURE.ice && r.chance(0.3)) kind = Kind.Ice;
    else if (m >= FEATURE.crumble && r.chance(0.08 + 0.3 * d)) kind = Kind.Crumble;

    let mx = 0;
    let my = 0;
    const per = r.int(130, 260);
    const ph = r.int(0, 600);
    if (m >= FEATURE.moving && r.chance(0.12 + 0.45 * d)) mx = r.range(40, 60 + 110 * d);
    if (m >= FEATURE.bobbing && r.chance(0.25)) {
      my = r.range(25, 55);
      // Its highest point must still be in reach.
      const top = this.topY + MAX_GAP * APEX;
      if (y + my > top) y = top - my;
    }
    const spring = kind !== Kind.Crumble && r.chance(0.05 + 0.02 * d) ? r.range(-w / 2 + 12, w / 2 - 12) : null;

    const lowY = this.topY;
    this.addPlatform({ x, y, w, kind, mx, my, per, ph, spring, path: true });
    this.topY = y;
    this.topX = x;
    const band = y - lowY;

    // Spare ledges make low zones forgiving. They thin out as you climb.
    const extras = r.chance(1 - d) ? r.int(0, Math.round(2.4 * (1 - d))) : 0;
    for (let i = 0; i < extras; i++) {
      const ek = m >= FEATURE.crumble && r.chance(0.3) ? Kind.Crumble : m >= FEATURE.ice && r.chance(0.3) ? Kind.Ice : Kind.Normal;
      this.addPlatform({
        x: r.range(0, WIDTH),
        y: lowY + band * r.range(0.2, 0.9),
        w: Math.max(36, 90 - 50 * d) * r.range(0.8, 1.1),
        kind: ek,
        mx: m >= FEATURE.moving && r.chance(0.3) ? r.range(30, 90) : 0,
        my: 0,
        per: r.int(140, 280),
        ph: r.int(0, 600),
        spring: null,
        path: false,
      });
    }

    // Fakes that look almost real.
    if (m >= FEATURE.fakes && r.chance(0.12 + 0.45 * d)) {
      this.addPlatform({
        x: wrapX(x + r.range(80, WIDTH - 80)),
        y: lowY + band * r.range(0.4, 1.1),
        w: w * r.range(0.9, 1.1),
        kind: Kind.Fake,
        mx: 0,
        my: 0,
        per: 1,
        ph: 0,
        spring: null,
        path: false,
      });
    }

    // Drones patrol between ledges, kept clear of the route ledge itself.
    if (m >= FEATURE.drones && band > 90 && r.chance(0.06 + 0.32 * d)) {
      this.addHazard({
        kind: HazardKind.Drone,
        x: r.range(0, WIDTH),
        y: lowY + band * r.range(0.4, 0.6),
        a: r.range(50, 90 + 110 * d),
        per: r.int(160, 320),
        ph: r.int(0, 600),
      });
    }
    if (m >= FEATURE.debris && band > 90 && r.chance(0.05 + 0.25 * d)) {
      this.addHazard({
        kind: HazardKind.Debris,
        x: r.range(0, WIDTH),
        y: lowY + band * r.range(0.35, 0.65),
        a: (r.chance(0.5) ? 1 : -1) * r.range(1.2, 1.6 + 2 * d),
        per: 1,
        ph: r.int(0, 600),
      });
    }
  }
}

// ---------- Recording and replaying runs ----------

/** Flat [tick, input, tick, input, ...]: the input that starts on that tick. */
export type InputLog = number[];

export class Recorder {
  log: InputLog = [];
  private last = 0;
  push(tick: number, input: number): void {
    if (input !== this.last) {
      this.log.push(tick, input);
      this.last = input;
    }
  }
}

export interface ReplayResult {
  meters: number;
  dead: boolean;
  cause: string;
  ticks: number;
}

/** Re-run a recorded game. `ticks` is how many steps the player took. */
export function replay(seed: number, log: InputLog, ticks: number): ReplayResult {
  const sim = new Sim(seed);
  let k = 0;
  let input = 0;
  while (sim.tick < ticks && !sim.dead) {
    const next = sim.tick + 1;
    while (k < log.length && log[k] <= next) {
      input = log[k + 1];
      k += 2;
    }
    sim.step(input);
    sim.events.length = 0;
  }
  return { meters: sim.meters, dead: sim.dead, cause: sim.cause, ticks: sim.tick };
}
