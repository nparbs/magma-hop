// The whole game's rules. No DOM, no Math.sin, no clocks: the server replays runs with this file
// and must land on exactly the same height the player saw.
//
// Units: x runs 0..WIDTH and wraps. y points UP, 0 is the chamber floor. 10 units = 1 meter. 60 ticks a second.

import { Rng, hash32, hashFrac } from './rng';
import { FEATURE, difficulty, rockfallOn, windStrength } from './zones';

/** Bump this whenever a rule changes: stored input logs only replay under the version that made them. */
export const SIM_VERSION = 3;

export const WIDTH = 420;
export const UNITS_PER_METER = 10;
export const TICK_RATE = 60;
export const GRAVITY = 0.42;
export const BOUNCE = 12.6;
export const SPRING = 22;
export const STOMP = 13.6;
export const MAX_FALL = 20;
export const RUN_SPEED = 6.2;
export const STEER = 1.1;
export const ICE_STEER = 0.13;
export const ICE_TICKS = 42;
/** Highest a normal bounce carries you. */
export const APEX = (BOUNCE * BOUNCE) / (2 * GRAVITY);
/** The biggest gap the generator ever leaves between path platforms, as a share of APEX. */
export const MAX_GAP = 0.86;
/** The lava sits this far below the highest point you've reached. It never goes back down. */
export const FALL_LIMIT = 280;
/** Where the lava starts, below the chamber floor. */
export const START_LAVA = 120;
export const PLAYER_HALF = 13;
export const PLAYER_H = 30;
export const BAT_R = 15;
export const WISP_R = 13;
export const PICKUP_R = 14;
export const ROCK_HALF = 22;
export const ROCK_WARN = 70;
export const ROCK_LIVE = 16;
export const GUST_CYCLE = 420;
/** Rides: how long they last (ticks) and how fast they lift you (units per tick). */
export const GEYSER_TICKS = 80;
export const GEYSER_SPEED = 16;
export const BUBBLE_TICKS = 210;
export const BUBBLE_SPEED = 15;
/** Nothing can hurt you for this long after a ride ends or a shield breaks. */
export const GRACE_TICKS = 50;
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
  /** Tick it broke, or -1. Crumbling and fake ledges break for good. */
  broken: number;
  /** Part of the guaranteed route up (used by tests and the bot). */
  path: boolean;
}

export enum HazardKind {
  Bat = 0,
  Wisp = 1,
}

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  /** Bat: patrol half-width and period. Wisp: speed per tick (signed), period unused. */
  a: number;
  per: number;
  ph: number;
  dead: boolean;
}

export enum PickupKind {
  /** Short ride. */
  Geyser = 0,
  /** Long ride. */
  Bubble = 1,
  /** Absorbs one hit. */
  Shield = 2,
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
}

export interface Rockfall {
  x: number;
  y: number;
  start: number;
}

export type SimEvent =
  | { t: 'bounce'; x: number; y: number; kind: Kind }
  | { t: 'spring'; x: number; y: number }
  | { t: 'crumble'; x: number; y: number; w: number }
  | { t: 'fake'; x: number; y: number; w: number }
  | { t: 'stomp'; x: number; y: number }
  | { t: 'pickup'; x: number; y: number; kind: PickupKind }
  | { t: 'rideend'; x: number; y: number }
  | { t: 'shieldbreak'; x: number; y: number }
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
  if (h.kind === HazardKind.Bat) return [wrapX(h.x + h.a * tri((tick + h.ph) / h.per)), h.y];
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
  /** Top of the lava. Touching it ends the run. */
  lavaY = -START_LAVA;
  iceTimer = 0;
  wind = 0;
  /** The ride you're on, or -1. */
  ride: PickupKind | -1 = -1;
  rideTimer = 0;
  /** Ticks left during which hazards can't hurt you. */
  safe = 0;
  shield = false;
  dead = false;
  cause = '';
  input = 0;
  platforms: Platform[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  rockfalls: Rockfall[] = [];
  events: SimEvent[] = [];

  private readonly hazardsOn: boolean;
  private gen: Rng;
  private rockRng: Rng;
  private nextRock = 0;
  private topY = 0;
  private topX = WIDTH / 2;
  private nextPickupY = FEATURE.pickups * UNITS_PER_METER;
  private recent: Platform[] = [];
  private nextId = 1;
  private pBuckets = new Map<number, Platform[]>();
  private hBuckets = new Map<number, Hazard[]>();
  private uBuckets = new Map<number, Pickup[]>();

  constructor(seed: number, opts: SimOptions = {}) {
    this.seed = seed >>> 0;
    this.hazardsOn = opts.hazards !== false;
    this.gen = new Rng(hash32(this.seed, 1));
    this.rockRng = new Rng(hash32(this.seed, 2));
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
    const riding = this.ride !== -1;
    if (riding) {
      this.vy = this.ride === PickupKind.Geyser ? GEYSER_SPEED : BUBBLE_SPEED;
      if (--this.rideTimer <= 0) {
        // Let go with one bounce's worth of lift, so there's time to pick a ledge.
        this.ride = -1;
        this.vy = BOUNCE;
        this.events.push({ t: 'rideend', x: this.x, y: this.y });
      }
    } else {
      this.vy -= GRAVITY;
      if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;
    }
    this.x = wrapX(this.x + this.vx + this.wind);
    this.y += this.vy;

    if (!riding && this.vy < 0) this.land(prevY, t);
    if (this.y > this.maxY) this.maxY = this.y;
    if (this.maxY - FALL_LIMIT > this.lavaY) this.lavaY = this.maxY - FALL_LIMIT;
    if (this.y < this.lavaY) {
      this.die('lava');
      return;
    }

    this.touchPickups();
    if (this.safe > 0) this.safe--;
    if (this.hazardsOn) {
      this.touchHazards(prevY, t);
      if (!this.dead) this.rockfall(t, meters);
    }

    if (this.maxY + APEX * 8 > this.topY) this.generateUntil(this.maxY + APEX * 12);
    if ((t & 127) === 0) this.prune();
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
        // It snaps and you drop straight through.
        p.broken = t;
        this.events.push({ t: 'fake', x: platX(p, t), y: py, w: p.w });
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
    if (best.spring !== null && Math.abs(wrapDx(px + best.spring, this.x)) <= 16) {
      this.vy = SPRING;
      this.events.push({ t: 'spring', x: this.x, y: bestY });
    } else {
      this.vy = BOUNCE;
      this.events.push({ t: 'bounce', x: this.x, y: bestY, kind: best.kind });
    }
    if (best.kind === Kind.Crumble) {
      best.broken = t;
      this.events.push({ t: 'crumble', x: px, y: bestY, w: best.w });
    } else if (best.kind === Kind.Ice) {
      this.iceTimer = ICE_TICKS;
      const cap = RUN_SPEED * 1.3;
      this.vx = Math.max(-cap, Math.min(cap, this.vx * 1.3));
    }
  }

  private touchPickups(): void {
    const cy = this.y + PLAYER_H / 2;
    for (const u of this.near(this.uBuckets, this.y, 1)) {
      if (u.taken) continue;
      if (Math.abs(wrapDx(this.x, u.x)) > PICKUP_R + PLAYER_HALF) continue;
      if (Math.abs(u.y - cy) > PICKUP_R + PLAYER_H / 2) continue;
      if (u.kind === PickupKind.Shield) {
        if (this.shield) continue;
        this.shield = true;
      } else {
        if (this.ride !== -1) continue;
        this.ride = u.kind;
        this.rideTimer = u.kind === PickupKind.Geyser ? GEYSER_TICKS : BUBBLE_TICKS;
        this.safe = this.rideTimer + GRACE_TICKS;
        this.iceTimer = 0;
      }
      u.taken = true;
      this.events.push({ t: 'pickup', x: u.x, y: u.y, kind: u.kind });
    }
  }

  /** True if the hit was soaked up by a ride, the grace period or the shield. */
  private absorb(): boolean {
    if (this.safe > 0) return true;
    if (!this.shield) return false;
    this.shield = false;
    this.safe = GRACE_TICKS;
    this.events.push({ t: 'shieldbreak', x: this.x, y: this.y });
    return true;
  }

  private touchHazards(prevY: number, t: number): void {
    const cx = this.x;
    const cy = this.y + PLAYER_H / 2;
    for (const h of this.near(this.hBuckets, this.y, 1)) {
      if (h.dead) continue;
      const [hx, hy] = hazardPos(h, t);
      const dx = wrapDx(cx, hx);
      const dy = hy - cy;
      const r = (h.kind === HazardKind.Bat ? BAT_R : WISP_R) + 11;
      if (dx * dx + dy * dy >= r * r) continue;
      const bat = h.kind === HazardKind.Bat;
      // Falling onto a bat from above squashes it and bounces you.
      if (bat && this.ride === -1 && this.vy < 0 && prevY >= hy) {
        h.dead = true;
        this.vy = STOMP;
        this.events.push({ t: 'stomp', x: hx, y: hy });
        continue;
      }
      if (this.absorb()) {
        if (bat) {
          h.dead = true;
          this.events.push({ t: 'stomp', x: hx, y: hy });
        }
        continue;
      }
      this.die(bat ? 'bat' : 'wisp');
      return;
    }
  }

  private rockfall(t: number, meters: number): void {
    this.rockfalls = this.rockfalls.filter((b) => t - b.start <= ROCK_WARN + ROCK_LIVE);
    if (rockfallOn(meters) && t >= this.nextRock && this.ride === -1) {
      const d = difficulty(meters);
      const r = this.rockRng;
      const aimed = r.chance(0.55);
      const x = aimed ? wrapX(this.x + r.range(-40, 40)) : r.range(0, WIDTH);
      this.rockfalls.push({ x, y: this.y, start: t });
      this.events.push({ t: 'warn', x, y: this.y });
      this.nextRock = t + Math.floor(170 - 70 * d + r.range(0, 120));
    }
    for (const b of this.rockfalls) {
      const age = t - b.start;
      if (age === ROCK_WARN) this.events.push({ t: 'strike', x: b.x, y: b.y });
      if (age < ROCK_WARN || age > ROCK_WARN + ROCK_LIVE) continue;
      if (Math.abs(wrapDx(this.x, b.x)) < ROCK_HALF + PLAYER_HALF * 0.6 && Math.abs(this.y - b.y) < 520) {
        if (this.absorb()) continue;
        this.die('rockfall');
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

  /** Forget everything the lava has swallowed, so long runs stay fast. */
  private prune(): void {
    const cut = this.lavaY - 160;
    this.platforms = this.platforms.filter((p) => p.y + p.my >= cut);
    this.hazards = this.hazards.filter((h) => h.y >= cut);
    this.pickups = this.pickups.filter((u) => u.y >= cut);
    const b = Math.floor(cut / BUCKET) - 1;
    for (const map of [this.pBuckets, this.hBuckets, this.uBuckets]) {
      for (const k of map.keys()) if (k < b) map.delete(k);
    }
  }

  // ---------- Level generation ----------

  private bucket<T extends { y: number }>(map: Map<number, T[]>, item: T): void {
    const b = Math.floor(item.y / BUCKET);
    let list = map.get(b);
    if (!list) map.set(b, (list = []));
    list.push(item);
  }

  private addPlatform(p: Omit<Platform, 'id' | 'broken'>): Platform {
    const full: Platform = { ...p, id: this.nextId++, broken: -1 };
    this.platforms.push(full);
    this.bucket(this.pBuckets, full);
    this.recent.push(full);
    if (this.recent.length > 10) this.recent.shift();
    return full;
  }

  private addHazard(h: Omit<Hazard, 'id' | 'dead'>): void {
    const full: Hazard = { ...h, id: this.nextId++, dead: false };
    this.hazards.push(full);
    this.bucket(this.hBuckets, full);
  }

  /** Would a ledge here sit on top of one just placed? */
  private crowded(x: number, y: number, w: number): boolean {
    for (const p of this.recent) {
      if (Math.abs(p.y - y) < 20 + p.my && Math.abs(wrapDx(p.x, x)) < (p.w + w) / 2 + 12 + p.mx) return true;
    }
    return false;
  }

  private generateUntil(y: number): void {
    if (this.platforms.length === 0) {
      // The chamber floor: one ledge as wide as the shaft to start on.
      this.addPlatform({ x: WIDTH / 2, y: 0, w: WIDTH, kind: Kind.Normal, mx: 0, my: 0, per: 1, ph: 0, spring: null, path: true });
    }
    while (this.topY < y) this.genStep();
  }

  private genStep(): void {
    const r = this.gen;
    const m = this.topY / UNITS_PER_METER;
    const d = difficulty(m);

    // The next ledge on the guaranteed route: about 7 m up at the bottom, stretching toward a full hop.
    let frac = 0.38 + 0.42 * d + r.range(-0.07, 0.07);
    frac = Math.max(0.2, Math.min(MAX_GAP, frac));
    let y = this.topY + frac * APEX;
    const reach = 70 + 200 * d;
    const x = wrapX(this.topX + r.range(-reach, reach));
    const w = Math.max(42, 84 - 44 * d) * r.range(0.85, 1.15);

    // Route ledges never crumble or fake: whatever breaks behind you, the way up is still there.
    // (Crumbling ledges and fakes are only ever spares.)
    let kind = Kind.Normal;
    if (m >= FEATURE.ice && r.chance(0.3)) kind = Kind.Ice;

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
    const spring = r.chance(0.05 + 0.02 * d) ? r.range(-w / 2 + 14, w / 2 - 14) : null;

    const lowY = this.topY;
    this.addPlatform({ x, y, w, kind, mx, my, per, ph, spring, path: true });
    this.topY = y;
    this.topX = x;
    const band = y - lowY;

    // A ride or a shield resting on a still, solid route ledge every few hundred meters.
    if (y >= this.nextPickupY && mx === 0 && my === 0 && kind === Kind.Normal && spring === null) {
      const roll = r.next();
      let pk = roll < 0.4 ? PickupKind.Shield : roll < 0.8 ? PickupKind.Geyser : PickupKind.Bubble;
      if (pk === PickupKind.Bubble && m < FEATURE.bubble) pk = PickupKind.Geyser;
      if (pk === PickupKind.Shield && m < FEATURE.bats) pk = PickupKind.Geyser;
      const u: Pickup = { id: this.nextId++, kind: pk, x, y: y + PICKUP_R + 2, taken: false };
      this.pickups.push(u);
      this.bucket(this.uBuckets, u);
      this.nextPickupY = y + r.range(2200, 4200);
    }

    // Spare ledges. Route plus spares come to about 4.2 ledges per bounce-height at the bottom,
    // 3.7 at 700 m and 3 at 3 km, thinning toward 2.5 (the owner found 6 at the bottom too busy).
    // A missed jump should usually leave something else to land on.
    const want = (band / APEX) * (4.2 - 1.2 * d - 0.5 * d * d) - 1;
    const extras = Math.floor(want) + (r.chance(want - Math.floor(want)) ? 1 : 0);
    for (let i = 0; i < extras; i++) {
      // Spares carry all the crumbling, a bit more of it now the route has none.
      const ek = m >= FEATURE.crumble && r.chance(0.2 + 0.3 * d) ? Kind.Crumble : m >= FEATURE.ice && r.chance(0.3) ? Kind.Ice : Kind.Normal;
      const ew = Math.max(40, 80 - 44 * d) * r.range(0.8, 1.1);
      const emx = m >= FEATURE.moving && r.chance(0.1 + 0.25 * d) ? r.range(30, 90) : 0;
      const eper = r.int(140, 280);
      const eph = r.int(0, 600);
      for (let tries = 0; tries < 4; tries++) {
        const ex = r.range(0, WIDTH);
        const ey = lowY + band * r.range(0.1, 0.95);
        if (this.crowded(ex, ey, ew + emx * 2)) continue;
        this.addPlatform({ x: ex, y: ey, w: ew, kind: ek, mx: emx, my: 0, per: eper, ph: eph, spring: null, path: false });
        break;
      }
    }

    // Fakes that look almost real.
    if (m >= FEATURE.fakes && r.chance(0.1 + 0.4 * d)) {
      const fx = wrapX(x + r.range(80, WIDTH - 80));
      const fy = lowY + band * r.range(0.3, 1);
      const fw = w * r.range(0.9, 1.1);
      if (!this.crowded(fx, fy, fw)) {
        this.addPlatform({ x: fx, y: fy, w: fw, kind: Kind.Fake, mx: 0, my: 0, per: 1, ph: 0, spring: null, path: false });
      }
    }

    // Bats patrol between ledges, kept clear of the route ledge itself.
    if (m >= FEATURE.bats && band > 60 && r.chance(0.04 + 0.22 * d)) {
      this.addHazard({
        kind: HazardKind.Bat,
        x: r.range(0, WIDTH),
        y: lowY + band * r.range(0.4, 0.6),
        a: r.range(50, 90 + 110 * d),
        per: r.int(160, 320),
        ph: r.int(0, 600),
      });
    }
    if (m >= FEATURE.wisps && band > 60 && r.chance(0.04 + 0.2 * d)) {
      this.addHazard({
        kind: HazardKind.Wisp,
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
