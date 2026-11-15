// The whole game's rules. No DOM, no Math.sin, no clocks: the server replays runs with this file
// and must land on exactly the same height the player saw.
//
// Units: x runs 0..WIDTH and wraps. y points UP, 0 is the chamber floor. 10 units = 1 meter. 60 ticks a second.

import { Rng, hash32, hashFrac } from './rng';
import { CRUST_ZONE, DAILY_SPAN, FEATURE, difficulty, rockfallOn, windStrength, zoneIndexAt } from './zones';

/** Bump this whenever a rule changes: stored input logs only replay under the version that made them. */
export const SIM_VERSION = 5;

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
/** Bats reach full strength (rate, patrol width, speed) at this height, meters. */
export const BAT_FULL = 1000;
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

// Eruption surges: past seeded heights the lava rumbles, then surges up close behind you and eases off.
/** First surge height, meters: somewhere in [SURGE_FIRST, SURGE_FIRST + SURGE_FIRST_SPREAD). */
export const SURGE_FIRST = 400;
export const SURGE_FIRST_SPREAD = 60;
/** Gap to the next surge, meters: about 270 low down, shrinking toward SURGE_GAP_MIN. */
export const SURGE_GAP_MIN = 120;
/** Phase lengths, ticks. */
export const SURGE_RUMBLE = 120;
export const SURGE_RISE = 100;
export const SURGE_HOLD = 60;
export const SURGE_EASE = 300;
/**
 * How close the lava gets during a surge. Never closer than the biggest route gap at that height
 * (plus a margin), so there is always a route ledge in reach above the lava: 120 low down, about 157 at 3 km.
 */
export const SURGE_LIMIT = 120;
/** Early surges are gentler: the lava stops SURGE_EARLY short at the first surge, easing to SURGE_LIMIT by SURGE_FULL m. */
export const SURGE_EARLY = 200;
export const SURGE_FULL = 1500;

export type SurgePhase = 'none' | 'rumble' | 'rise' | 'hold' | 'ease';

/** Crust ledges: this many bounces and the third one melts it (you still get the bounce). */
export const CRUST_BOUNCES = 3;
/** Ticks a melted crust takes to form again, heat reset. */
export const CRUST_REFORM = 180;

/** Daily Climb summit, meters: a multiple of 10 in 1,200..2,000, from the seed. */
export function summitMeters(seed: number): number {
  return 1200 + 10 * (hash32(seed >>> 0, 77) % 81);
}

/** Meters of the gap after a surge at `m` (before the seeded jitter). */
export function surgeGap(m: number): number {
  return SURGE_GAP_MIN + 200 * (1 - difficulty(m));
}

/** The closest the lava comes during a surge that starts at `m` meters. */
export function surgeLimit(m: number): number {
  const d = difficulty(m);
  const widest = Math.min(MAX_GAP, 0.45 + 0.42 * d) * APEX;
  const ramp = Math.max(0, Math.min(1, (m - SURGE_FIRST) / (SURGE_FULL - SURGE_FIRST)));
  return Math.max(SURGE_EARLY - (SURGE_EARLY - SURGE_LIMIT) * ramp, widest + 15);
}

const BUCKET = 200;

export enum Kind {
  Normal = 0,
  Crumble = 1,
  Ice = 2,
  Fake = 3,
  /** Solid twice; the third bounce melts it for CRUST_REFORM ticks. */
  Crust = 4,
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
  /** Crust: bounces taken since it last formed (0..CRUST_BOUNCES). Always 0 for other kinds. */
  heat: number;
  /** Crust: tick it melted, or -1 while solid. It forms again CRUST_REFORM ticks later. */
  melt: number;
  /** Part of the guaranteed route up (used by tests and the bot). */
  path: boolean;
  /** The full-width ledge at the Daily Climb summit. */
  summit?: boolean;
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
  | { t: 'die'; x: number; y: number; cause: string }
  /** A crust ledge melted under its third bounce, or formed again. */
  | { t: 'melt'; x: number; y: number; w: number }
  | { t: 'reform'; x: number; y: number; w: number }
  /** An eruption surge: the warning rumble starts, then (SURGE_RUMBLE ticks later) the lava starts rising. */
  | { t: 'rumble'; y: number }
  | { t: 'surge'; y: number }
  /** Daily Climb won: the run ends here with cause 'summit'. */
  | { t: 'summit'; x: number; y: number; ticks: number };

export interface SimOptions {
  /** Tests switch hazards off to check the route alone. */
  hazards?: boolean;
  /** A Daily Climb run: it has a summit, and the zones are squeezed to fit below it. */
  daily?: boolean;
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

  /** Daily Climb run (set from SimOptions.daily). */
  readonly daily: boolean;
  /** Daily Climb summit in meters, 0 in endless. Reaching it wins: dead, cause 'summit', `won`. */
  readonly summit: number;
  won = false;

  /** Eruption surge phase and the lava's current distance below `maxY` (FALL_LIMIT when calm). */
  surge: SurgePhase = 'none';
  fallLimit = FALL_LIMIT;
  /** Closest the lava comes in the current (or last) surge. */
  surgeMin = SURGE_LIMIT;
  /** Ticks since the current surge's rumble began. */
  surgeTick = 0;
  /** Height in meters (of `meters`) that sets off the next surge. */
  nextSurge: number;
  /** Surges set off so far. */
  surges = 0;

  private readonly hazardsOn: boolean;
  private gen: Rng;
  private rockRng: Rng;
  private nextRock = 0;
  private topY = 0;
  private topX = WIDTH / 2;
  private topped = false;
  private nextPickupY: number;
  private firstShell = false;
  private recent: Platform[] = [];
  private melted: Platform[] = [];
  private nextId = 1;
  private pBuckets = new Map<number, Platform[]>();
  private hBuckets = new Map<number, Hazard[]>();
  private uBuckets = new Map<number, Pickup[]>();

  constructor(seed: number, opts: SimOptions = {}) {
    this.seed = seed >>> 0;
    this.hazardsOn = opts.hazards !== false;
    this.daily = opts.daily === true;
    this.summit = this.daily ? summitMeters(this.seed) : 0;
    this.nextPickupY = this.daily
      ? Math.floor((FEATURE.pickups * this.summit) / DAILY_SPAN) * UNITS_PER_METER
      : FEATURE.pickups * UNITS_PER_METER;
    this.nextSurge = SURGE_FIRST + Math.floor(SURGE_FIRST_SPREAD * hashFrac(this.seed, 900));
    this.gen = new Rng(hash32(this.seed, 1));
    this.rockRng = new Rng(hash32(this.seed, 2));
    this.generateUntil(APEX * 12);
  }

  get meters(): number {
    return Math.floor(this.maxY / UNITS_PER_METER);
  }

  /**
   * The height zones and features are read at. Endless: the meters themselves. Daily: squeezed so
   * all six zones fit below the summit (`meters * 3400 / summit`). The difficulty ramp stays on real meters.
   */
  zoneMeters(meters: number): number {
    if (!this.daily) return meters;
    return Math.floor((Math.floor(meters) * DAILY_SPAN) / this.summit);
  }

  /** The zone index (into ZONES) at a height in real meters, squeezed in the Daily. */
  zoneAt(meters: number): number {
    return zoneIndexAt(this.zoneMeters(meters));
  }

  /** Fall limit `dt` ticks from now, if no new surge starts. */
  fallLimitIn(dt: number): number {
    if (this.surge === 'none') return FALL_LIMIT;
    let e = this.surgeTick + dt;
    const span = FALL_LIMIT - this.surgeMin;
    if (e < SURGE_RUMBLE) return FALL_LIMIT;
    e -= SURGE_RUMBLE;
    if (e < SURGE_RISE) {
      const u = e / SURGE_RISE;
      return FALL_LIMIT - span * u * u * (3 - 2 * u);
    }
    e -= SURGE_RISE;
    if (e < SURGE_HOLD) return this.surgeMin;
    e -= SURGE_HOLD;
    if (e < SURGE_EASE) return this.surgeMin + (span * e) / SURGE_EASE;
    return FALL_LIMIT;
  }

  /** Where the lava will be `dt` ticks from now if you climb no higher (for the bot and the page). */
  lavaAfter(dt: number): number {
    return Math.max(this.lavaY, this.maxY - this.fallLimitIn(dt));
  }

  private surgeUpdate(): void {
    if (this.surge === 'none') {
      if (this.meters < this.nextSurge) return;
      const at = this.nextSurge;
      this.surge = 'rumble';
      this.surgeTick = 0;
      this.surgeMin = surgeLimit(at);
      this.surges++;
      // Everyone on the same seed gets the same surge heights.
      this.nextSurge = at + Math.round(surgeGap(at) * (0.85 + 0.3 * hashFrac(this.seed, 901 + this.surges)));
      this.events.push({ t: 'rumble', y: this.lavaY });
    } else this.surgeTick++;
    const e = this.surgeTick;
    let ph: SurgePhase = 'rumble';
    if (e >= SURGE_RUMBLE + SURGE_RISE + SURGE_HOLD + SURGE_EASE) ph = 'none';
    else if (e >= SURGE_RUMBLE + SURGE_RISE + SURGE_HOLD) ph = 'ease';
    else if (e >= SURGE_RUMBLE + SURGE_RISE) ph = 'hold';
    else if (e >= SURGE_RUMBLE) ph = 'rise';
    if (ph === 'rise' && this.surge === 'rumble') this.events.push({ t: 'surge', y: this.lavaY });
    this.surge = ph;
    this.fallLimit = this.fallLimitIn(0);
  }

  private reform(t: number): void {
    if (this.melted.length === 0) return;
    this.melted = this.melted.filter((p) => {
      if (t - p.melt < CRUST_REFORM) return true;
      p.melt = -1;
      p.heat = 0;
      this.events.push({ t: 'reform', x: platX(p, t), y: platY(p, t), w: p.w });
      return false;
    });
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

    this.reform(t);
    if (!riding && this.vy < 0) this.land(prevY, t);
    if (this.y > this.maxY) this.maxY = this.y;
    if (this.summit > 0 && this.maxY >= this.summit * UNITS_PER_METER) {
      // Daily Climb won. The height counts as exactly the summit.
      this.maxY = this.summit * UNITS_PER_METER;
      this.won = true;
      this.dead = true;
      this.cause = 'summit';
      this.events.push({ t: 'summit', x: this.x, y: this.maxY, ticks: t });
      return;
    }
    this.surgeUpdate();
    if (this.maxY - this.fallLimit > this.lavaY) this.lavaY = this.maxY - this.fallLimit;
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
      if (p.broken >= 0 || p.melt >= 0) continue;
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
    } else if (best.kind === Kind.Crust) {
      // Twice it holds; the third bounce still launches you, but the crust melts behind you.
      if (++best.heat >= CRUST_BOUNCES) {
        best.melt = t;
        this.melted.push(best);
        this.events.push({ t: 'melt', x: px, y: bestY, w: best.w });
      }
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
    if (rockfallOn(this.zoneMeters(meters)) && t >= this.nextRock && this.ride === -1) {
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
    const max = windStrength(this.zoneMeters(meters));
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
    if (windStrength(this.zoneMeters(meters)) === 0) return 0;
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

  private addPlatform(p: Omit<Platform, 'id' | 'broken' | 'heat' | 'melt'>): Platform {
    const full: Platform = { ...p, id: this.nextId++, broken: -1, heat: 0, melt: -1 };
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
    while (!this.topped && this.topY < y) this.genStep();
  }

  private genStep(): void {
    const r = this.gen;
    const m = this.topY / UNITS_PER_METER;
    const d = difficulty(m);
    // Features unlock on the zone height (squeezed in the Daily); difficulty stays on real meters.
    const fm = this.zoneMeters(m);
    // From the Crater Rim up, crust takes the place of ice.
    const slick = zoneIndexAt(fm) >= CRUST_ZONE ? Kind.Crust : Kind.Ice;

    // The next ledge on the guaranteed route: about 7 m up at the bottom, stretching toward a full hop.
    let frac = 0.38 + 0.42 * d + r.range(-0.07, 0.07);
    frac = Math.max(0.2, Math.min(MAX_GAP, frac));
    let y = this.topY + frac * APEX;
    const reach = 70 + 200 * d;
    const x = wrapX(this.topX + r.range(-reach, reach));
    const w = Math.max(42, 84 - 44 * d) * r.range(0.85, 1.15);

    // The Daily summit: one still ledge across the whole shaft, and nothing above it.
    const summitY = this.summit * UNITS_PER_METER;
    if (this.summit > 0 && y >= summitY) {
      this.addPlatform({ x: WIDTH / 2, y: summitY, w: WIDTH, kind: Kind.Normal, mx: 0, my: 0, per: 1, ph: 0, spring: null, path: true, summit: true });
      this.topY = summitY;
      this.topped = true;
      return;
    }

    // Route ledges never crumble or fake: whatever breaks behind you, the way up is still there.
    // (Crumbling ledges and fakes are only ever spares. Crust melts only after two solid bounces and forms again.)
    let kind = Kind.Normal;
    if (fm >= FEATURE.ice && r.chance(0.3)) kind = slick;

    let mx = 0;
    let my = 0;
    const per = r.int(130, 260);
    const ph = r.int(0, 600);
    if (fm >= FEATURE.moving && r.chance(0.12 + 0.45 * d)) mx = r.range(40, 60 + 110 * d);
    if (fm >= FEATURE.bobbing && r.chance(0.25)) {
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
      if (pk === PickupKind.Bubble && fm < FEATURE.bubble) pk = PickupKind.Geyser;
      if (pk === PickupKind.Shield && fm < FEATURE.bats) pk = PickupKind.Geyser;
      // The first pickup once bats are about is always a shell, so the first bat you misjudge isn't the end.
      if (fm >= FEATURE.bats && !this.firstShell) {
        pk = PickupKind.Shield;
        this.firstShell = true;
      }
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
      const ek = fm >= FEATURE.crumble && r.chance(0.2 + 0.3 * d) ? Kind.Crumble : fm >= FEATURE.ice && r.chance(0.3) ? slick : Kind.Normal;
      const ew = Math.max(40, 80 - 44 * d) * r.range(0.8, 1.1);
      const emx = fm >= FEATURE.moving && r.chance(0.1 + 0.25 * d) ? r.range(30, 90) : 0;
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
    if (fm >= FEATURE.fakes && r.chance(0.1 + 0.4 * d)) {
      const fx = wrapX(x + r.range(80, WIDTH - 80));
      const fy = lowY + band * r.range(0.3, 1);
      const fw = w * r.range(0.9, 1.1);
      if (!this.crowded(fx, fy, fw)) {
        this.addPlatform({ x: fx, y: fy, w: fw, kind: Kind.Fake, mx: 0, my: 0, per: 1, ph: 0, spring: null, path: false });
      }
    }

    // Bats patrol between ledges, kept clear of the route ledge itself.
    // Below BAT_FULL meters they ease in: rarer, shorter patrols and slower wings.
    const bw = Math.min(1, (fm - FEATURE.bats) / (BAT_FULL - FEATURE.bats));
    if (fm >= FEATURE.bats && band > 60 && r.chance((0.04 + 0.22 * d) * (0.35 + 0.65 * bw))) {
      this.addHazard({
        kind: HazardKind.Bat,
        x: r.range(0, WIDTH),
        y: lowY + band * r.range(0.4, 0.6),
        a: r.range(35 + 15 * bw, 60 + 30 * bw + 110 * d),
        per: Math.round(r.int(160, 320) * (1.6 - 0.6 * bw)),
        ph: r.int(0, 600),
      });
    }
    if (fm >= FEATURE.wisps && band > 60 && r.chance(0.04 + 0.2 * d)) {
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

/** Re-run a recorded game. `ticks` is how many steps the player took. Daily runs need `{ daily: true }`. */
export function replay(seed: number, log: InputLog, ticks: number, opts: SimOptions = {}): ReplayResult {
  const sim = new Sim(seed, { daily: opts.daily === true });
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
