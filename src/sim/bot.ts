// A simple climber: aims for the highest ledge it can reach. It plays the title screen and the tests.
// It knows which ledges are fake and ignores hazards unless `careful` is set.

import { APEX, GRAVITY, Kind, Sim, platX, platY, wrapDx, hazardPos, INPUT_MAX } from './sim';

export class Bot {
  private landedY = 0;

  constructor(private careful = false) {}

  think(sim: Sim): number {
    for (const e of sim.events) if (e.t === 'bounce' || e.t === 'spring' || e.t === 'stomp') this.landedY = e.y;
    const t = sim.tick + 1;
    const apexY = sim.vy > 0 ? sim.y + (sim.vy * sim.vy) / (2 * GRAVITY) : sim.y;

    let best = null;
    let bestScore = -Infinity;
    for (const p of sim.platforms) {
      if (p.kind === Kind.Fake || p.broken >= 0) continue;
      const py = platY(p, t);
      if (py < this.landedY - APEX * 2 || py > apexY + 400) continue;
      const reachable = sim.vy > 0 ? py <= apexY - 12 && py > this.landedY + 1 : py <= sim.y - 2;
      if (!reachable) continue;
      // Prefer high ledges, then near ones, then wide ones.
      const dx = Math.abs(wrapDx(sim.x, platX(p, t)));
      const score = py - dx * 0.35 + p.w * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) return 0;
    let dx = wrapDx(sim.x, platX(best, t)) - sim.wind * 6;

    if (this.careful) {
      for (const h of sim.hazards) {
        if (h.dead) continue;
        const [hx, hy] = hazardPos(h, t);
        if (Math.abs(hy - sim.y) > 140) continue;
        const hdx = wrapDx(sim.x, hx);
        if (Math.abs(hdx) < 60) dx = -Math.sign(hdx) * 60;
      }
      for (const b of sim.bolts) {
        const bdx = wrapDx(sim.x, b.x);
        if (Math.abs(bdx) < 50) dx = -Math.sign(bdx || 1) * 60;
      }
    }
    return Math.max(-INPUT_MAX, Math.min(INPUT_MAX, Math.round(dx / 5)));
  }
}
