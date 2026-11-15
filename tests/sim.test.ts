import { describe, expect, it } from 'vitest';
import {
  APEX, BOUNCE, BUBBLE_TICKS, CRUST_BOUNCES, CRUST_REFORM, FALL_LIMIT, Kind, MAX_GAP, PickupKind, Recorder, SURGE_LIMIT, SURGE_RUMBLE,
  Sim, WIDTH, replay, summitMeters, type SimEvent,
} from '../src/sim/sim';
import { CRUST_ZONE, ZONES, zoneIndexAt } from '../src/sim/zones';
import { Bot } from '../src/sim/bot';

function playBot(seed: number, ticks: number, hazards = true, careful = false, daily = false, onTick?: (sim: Sim, events: SimEvent[]) => void) {
  const sim = new Sim(seed, { hazards, daily });
  const bot = new Bot(careful);
  const rec = new Recorder();
  while (sim.tick < ticks && !sim.dead) {
    const input = bot.think(sim);
    sim.events.length = 0;
    rec.push(sim.tick + 1, input);
    sim.step(input);
    onTick?.(sim, sim.events);
  }
  return { sim, log: rec.log };
}

describe('generation', () => {
  it('is the same for the same seed', () => {
    const a = new Sim(42);
    const b = new Sim(42);
    expect(a.platforms.map((p) => [p.x, p.y, p.kind])).toEqual(b.platforms.map((p) => [p.x, p.y, p.kind]));
    expect(new Sim(43).platforms[3].x).not.toBe(a.platforms[3].x);
  });

  it('never leaves a route gap bigger than a bounce can clear', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const sim = new Sim(seed);
      // Force generation far up.
      (sim as any).generateUntil(80_000);
      const path = sim.platforms.filter((p) => p.path).sort((a, b) => a.y - b.y);
      expect(path.length).toBeGreaterThan(300);
      for (let i = 1; i < path.length; i++) {
        const top = path[i].y + path[i].my;
        expect(top - path[i - 1].y).toBeLessThanOrEqual(MAX_GAP * APEX + 1e-9);
        expect(path[i].kind).not.toBe(Kind.Fake);
      }
    }
  });

  it('always leaves a way up: route ledges never break, and every ledge has a route ledge within one hop above', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const sim = new Sim(seed);
      (sim as any).generateUntil(80_000);
      const path = sim.platforms.filter((p) => p.path).sort((a, b) => a.y - b.y);
      for (const p of path) expect([Kind.Normal, Kind.Ice, Kind.Crust]).toContain(p.kind);
      // From any ledge you can stand on, crumbling ones included (you bounce once before they go),
      // the next route ledge up is in reach at its highest. A bobbing ledge counts from the middle of
      // its swing: you can ride it there and wait.
      let k = 0;
      const standable = sim.platforms.filter((p) => p.kind !== Kind.Fake && p.y < path[path.length - 1].y).sort((a, b) => a.y - b.y);
      for (const p of standable) {
        while (k < path.length && path[k].y <= p.y) k++;
        const next = path[k];
        expect(next.y + next.my - p.y).toBeLessThanOrEqual(MAX_GAP * APEX + 1e-9);
      }
    }
  });

  it('gets harder: route gaps grow and ledges shrink with height', () => {
    const sim = new Sim(7);
    (sim as any).generateUntil(60_000);
    const path = sim.platforms.filter((p) => p.path).sort((a, b) => a.y - b.y);
    const low = path.filter((p) => p.y < 3000);
    const high = path.filter((p) => p.y > 40_000);
    const avgW = (l: typeof path) => l.reduce((s, p) => s + p.w, 0) / l.length;
    expect(avgW(high)).toBeLessThan(avgW(low) * 0.8);
    expect(high.length / 20_000).toBeLessThan(low.length / 3000);
  });
});

describe('play', () => {
  it('the route can be climbed (bot, no hazards)', () => {
    for (const seed of [1, 2, 3]) {
      const { sim } = playBot(seed, 60 * 60 * 8, false);
      expect(sim.meters).toBeGreaterThan(1200);
    }
  });

  it('falling into the lava ends the run, and the lava never drops', () => {
    const { sim } = playBot(4, 60 * 20, false);
    expect(sim.dead).toBe(false);
    const lava = sim.lavaY;
    // Calm, the lava trails FALL_LIMIT below your best; a surge brings it closer, never closer than SURGE_LIMIT.
    expect(lava).toBeGreaterThanOrEqual(sim.maxY - FALL_LIMIT - 1e-6);
    expect(lava).toBeLessThanOrEqual(sim.maxY - SURGE_LIMIT + 1e-6);
    // Steer hard one way with nothing aimed at: sooner or later there's no ledge underneath.
    let low = lava;
    for (let i = 0; i < 60 * 120 && !sim.dead; i++) {
      sim.step(i % 50 < 25 ? 4 : 0);
      expect(sim.lavaY).toBeGreaterThanOrEqual(low);
      low = sim.lavaY;
    }
    expect(sim.dead).toBe(true);
    expect(sim.cause).toBe('lava');
  });

  it('crumbling ledges break for good', () => {
    const sim = new Sim(9, { hazards: false });
    (sim as any).generateUntil(40_000);
    const p = sim.platforms.find((q) => q.kind === Kind.Crumble && q.mx === 0 && q.my === 0)!;
    sim.x = p.x;
    sim.y = p.y + 20;
    sim.vy = 0;
    sim.maxY = sim.y;
    sim.lavaY = sim.y - FALL_LIMIT;
    while (p.broken < 0 && sim.tick < 100) sim.step(0);
    expect(p.broken).toBeGreaterThan(0);
    expect(sim.vy).toBeGreaterThan(0);
    for (let i = 0; i < 400 && !sim.dead; i++) sim.step(0);
    expect(p.broken).toBeGreaterThan(0);
  });

  it('a ride carries you up and keeps you safe', () => {
    const sim = new Sim(10);
    (sim as any).generateUntil(60_000);
    const u = sim.pickups.find((q) => q.kind === PickupKind.Bubble)!;
    expect(u).toBeTruthy();
    expect(sim.pickups.some((q) => q.kind === PickupKind.Shield)).toBe(true);
    sim.x = u.x;
    sim.y = u.y;
    sim.vy = 0;
    sim.maxY = sim.y;
    sim.lavaY = sim.y - FALL_LIMIT;
    const from = sim.y;
    sim.step(0);
    expect(sim.ride).toBe(PickupKind.Bubble);
    for (let i = 0; i < BUBBLE_TICKS; i++) sim.step(0);
    expect(sim.dead).toBe(false);
    expect(sim.ride).toBe(-1);
    expect(sim.y - from).toBeGreaterThan(2500);
  });

  it('hazards end runs', () => {
    let deaths = 0;
    for (const seed of [11, 12, 13, 14]) if (playBot(seed, 60 * 60 * 10, true).sim.dead) deaths++;
    expect(deaths).toBeGreaterThan(0);
  });
});

describe('replay', () => {
  it('matches the live run exactly', () => {
    for (const seed of [5, 6, 7]) {
      const { sim, log } = playBot(seed, 60 * 60 * 4, true, true);
      const r = replay(seed, log, sim.tick);
      expect(r.meters).toBe(sim.meters);
      expect(r.dead).toBe(sim.dead);
      expect(r.ticks).toBe(sim.tick);
    }
  });

  it('a forged log does not reach the claimed height', () => {
    const { sim } = playBot(8, 60 * 60 * 3, false);
    const r = replay(8, [1, 4], sim.tick);
    expect(r.meters).toBeLessThan(sim.meters);
  });
});

describe('eruption surges', () => {
  function surgeLog(seed: number, careful: boolean) {
    const rumbles: { tick: number; at: number }[] = [];
    const rises: number[] = [];
    let lastLava = -Infinity;
    let monotonic = true;
    let closest = Infinity;
    let prevNext = 0;
    const { sim } = playBot(seed, 60 * 60 * 3, false, careful, false, (s, ev) => {
      if (s.lavaY < lastLava) monotonic = false;
      lastLava = s.lavaY;
      closest = Math.min(closest, s.fallLimit);
      for (const e of ev) {
        if (e.t === 'rumble') rumbles.push({ tick: s.tick, at: prevNext });
        if (e.t === 'surge') rises.push(s.tick);
      }
      prevNext = s.nextSurge;
    });
    return { sim, rumbles, rises, monotonic, closest };
  }

  it('rumble, then a rise SURGE_RUMBLE ticks later; the lava never drops and stays a hop away', () => {
    const a = surgeLog(1, false);
    expect(a.rumbles.length).toBeGreaterThan(2);
    expect(a.monotonic).toBe(true);
    for (let i = 0; i < a.rises.length; i++) expect(a.rises[i] - a.rumbles[i].tick).toBe(SURGE_RUMBLE);
    expect(a.closest).toBeLessThan(FALL_LIMIT - 100);
    expect(a.closest).toBeGreaterThanOrEqual(SURGE_LIMIT);
    // The first surge comes after the Magma Chamber.
    expect(a.rumbles[0].at).toBeGreaterThanOrEqual(ZONES[1].from);
  });

  it('is deterministic, and the surge heights come from the seed alone', () => {
    const a = surgeLog(2, false);
    const b = surgeLog(2, false);
    expect(b.rumbles).toEqual(a.rumbles);
    const c = surgeLog(2, true);
    const n = Math.min(a.rumbles.length, c.rumbles.length);
    expect(n).toBeGreaterThan(1);
    expect(c.rumbles.slice(0, n).map((r) => r.at)).toEqual(a.rumbles.slice(0, n).map((r) => r.at));
    // Gaps shrink with height but never below about 120 m.
    const at = a.rumbles.map((r) => r.at);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(100);
  });

  it('eases back to the normal fall limit', () => {
    const { sim } = surgeLog(1, false);
    const s = new Sim(1, { hazards: false });
    expect(s.fallLimit).toBe(FALL_LIMIT);
    expect(s.fallLimitIn(1000)).toBe(FALL_LIMIT);
    expect(['none', 'rumble', 'rise', 'hold', 'ease']).toContain(sim.surge);
    expect(sim.fallLimitIn(10_000)).toBe(FALL_LIMIT);
  });
});

describe('crust ledges', () => {
  it('only from the Crater Rim up, where ice would have been', () => {
    const sim = new Sim(21);
    (sim as any).generateUntil(60_000);
    const rim = ZONES[CRUST_ZONE].from * 10;
    const crust = sim.platforms.filter((p) => p.kind === Kind.Crust);
    const ice = sim.platforms.filter((p) => p.kind === Kind.Ice);
    expect(crust.length).toBeGreaterThan(20);
    expect(crust.some((p) => p.path)).toBe(true);
    for (const p of crust) expect(p.y).toBeGreaterThanOrEqual(rim - APEX);
    for (const p of ice) expect(p.y).toBeLessThan(rim + APEX);
  });

  it('holds twice, melts on the third bounce (still launching you), and forms again', () => {
    const sim = new Sim(22, { hazards: false });
    (sim as any).generateUntil(40_000);
    const p = sim.platforms.find((q) => q.kind === Kind.Crust && q.mx === 0 && q.my === 0 && q.spring === null)!;
    expect(p).toBeTruthy();
    sim.nextSurge = Infinity;
    sim.x = p.x;
    sim.y = p.y + 20;
    sim.vy = 0;
    sim.maxY = sim.y;
    sim.lavaY = sim.y - FALL_LIMIT;
    const melts: number[] = [];
    let bounces = 0;
    while (p.melt < 0 && sim.tick < 400) {
      sim.step(0);
      for (const e of sim.events) {
        if (e.t === 'bounce' && e.kind === Kind.Crust) {
          bounces++;
          expect(sim.vy).toBe(BOUNCE);
          expect(p.heat).toBe(bounces);
          if (bounces < CRUST_BOUNCES) expect(p.melt).toBe(-1);
        }
        if (e.t === 'melt') melts.push(sim.tick);
      }
      sim.events.length = 0;
    }
    expect(bounces).toBe(CRUST_BOUNCES);
    expect(melts).toEqual([p.melt]);
    expect(sim.vy).toBe(BOUNCE);
    // Ride a bubble up so we're still alive when it re-forms.
    sim.ride = PickupKind.Bubble;
    sim.rideTimer = 400;
    let reformed = -1;
    while (reformed < 0 && sim.tick < 1000) {
      sim.step(0);
      for (const e of sim.events) if (e.t === 'reform') reformed = sim.tick;
      sim.events.length = 0;
    }
    expect(reformed - melts[0]).toBe(CRUST_REFORM);
    expect(p.melt).toBe(-1);
    expect(p.heat).toBe(0);
  });
});

describe('daily summit', () => {
  it('sits at a multiple of 10 m between 1,200 and 2,000 m, from the seed', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 400; seed++) {
      const m = summitMeters(seed);
      expect(m % 10).toBe(0);
      expect(m).toBeGreaterThanOrEqual(1200);
      expect(m).toBeLessThanOrEqual(2000);
      seen.add(m);
    }
    expect(seen.size).toBeGreaterThan(40);
    expect(new Sim(5).summit).toBe(0);
    expect(new Sim(5, { daily: true }).summit).toBe(summitMeters(5));
  });

  it('squeezes all six zones below the summit and puts one full-width ledge at it, nothing above', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Sim(seed, { daily: true });
      (sim as any).generateUntil(80_000);
      const top = sim.summit * 10;
      expect(Math.max(...sim.platforms.map((p) => p.y))).toBe(top);
      const s = sim.platforms.filter((p) => p.summit);
      expect(s).toHaveLength(1);
      expect(s[0]).toMatchObject({ y: top, w: WIDTH, kind: Kind.Normal, path: true, mx: 0, my: 0 });
      expect(sim.zoneAt(sim.summit - 1)).toBe(ZONES.length - 1);
      expect(sim.zoneAt(sim.summit / 2)).toBe(zoneIndexAt(1700));
      // The route still fits one bounce all the way up, the summit included.
      const path = sim.platforms.filter((p) => p.path).sort((a, b) => a.y - b.y);
      for (let i = 1; i < path.length; i++) expect(path[i].y + path[i].my - path[i - 1].y).toBeLessThanOrEqual(MAX_GAP * APEX + 1e-9);
      expect(sim.platforms.some((p) => p.kind === Kind.Crust)).toBe(true);
    }
  });

  it('reaching it wins the run, and the server replay agrees', () => {
    let won = false;
    for (const seed of [3, 11, 2, 4]) {
      const { sim, log } = playBot(seed, 60 * 60 * 10, true, true, true);
      if (!sim.won) continue;
      won = true;
      expect(sim.dead).toBe(true);
      expect(sim.cause).toBe('summit');
      expect(sim.meters).toBe(sim.summit);
      const r = replay(seed, log, sim.tick, { daily: true });
      expect(r).toEqual({ meters: sim.summit, dead: true, cause: 'summit', ticks: sim.tick });
      expect(replay(seed, log, sim.tick).cause).not.toBe('summit');
      break;
    }
    expect(won).toBe(true);
  });

  it('a summit event fires when you get there', () => {
    const sim = new Sim(9, { daily: true, hazards: false });
    sim.nextSurge = Infinity;
    sim.y = sim.summit * 10 - 60;
    sim.maxY = sim.y;
    sim.lavaY = sim.y - FALL_LIMIT;
    sim.vy = BOUNCE;
    (sim as any).generateUntil(sim.y + 4000);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 && !sim.dead; i++) {
      sim.step(0);
      ev.push(...sim.events);
      sim.events.length = 0;
    }
    expect(sim.won).toBe(true);
    expect(ev.find((e) => e.t === 'summit')).toMatchObject({ ticks: sim.tick });
    expect(ev.some((e) => e.t === 'die')).toBe(false);
  });
});
