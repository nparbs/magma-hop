import { describe, expect, it } from 'vitest';
import { APEX, Kind, MAX_GAP, Recorder, Sim, replay } from '../src/sim/sim';
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
      expect(sim.meters).toBeGreaterThan(1500);
    }
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
