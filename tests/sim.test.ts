import { describe, expect, it } from 'vitest';
import { APEX, BUBBLE_TICKS, FALL_LIMIT, Kind, MAX_GAP, PickupKind, Recorder, Sim, replay } from '../src/sim/sim';
import { Bot } from '../src/sim/bot';

function playBot(seed: number, ticks: number, hazards = true, careful = false) {
  const sim = new Sim(seed, { hazards });
  const bot = new Bot(careful);
  const rec = new Recorder();
  while (sim.tick < ticks && !sim.dead) {
    const input = bot.think(sim);
    sim.events.length = 0;
    rec.push(sim.tick + 1, input);
    sim.step(input);
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
      for (const p of path) expect([Kind.Normal, Kind.Ice]).toContain(p.kind);
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
    expect(lava).toBeCloseTo(sim.maxY - FALL_LIMIT, 6);
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
