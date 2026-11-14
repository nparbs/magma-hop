// A climber that plays the title screen and the tests. Each tick it picks the best ledge it can
// still land on (a fall is fatal, so "can still land on" matters more than "highest") and steers there.
// It knows which ledges are fake. With `careful` set it also keeps away from hazards.

import {
  GRAVITY, INPUT_MAX, Kind, PLAYER_H, PickupKind, RUN_SPEED, Sim, WIDTH, hazardPos, platX, platY, wrapDx, type Platform,
} from './sim';

export class Bot {
  private targetId = -1;
  private targetY = 0;
  /** Ledges it kept missing (something was in the way). */
  private avoid = new Set<number>();
  private bestSeen = 0;
  private stuck = 0;

  constructor(private careful = false) {}

  think(sim: Sim): number {
    if (sim.ride !== -1) return 0;
    // Bounced somewhere other than where it was heading: stop trying for that ledge.
    for (const e of sim.events) {
      if ((e.t === 'bounce' || e.t === 'spring') && this.targetId >= 0 && Math.abs(e.y - this.targetY) > 3) this.avoid.add(this.targetId);
    }
    // Going nowhere for five seconds: give up on the current ledge too.
    if (sim.maxY > this.bestSeen + 1) {
      this.bestSeen = sim.maxY;
      this.stuck = 0;
    } else if (++this.stuck > 300) {
      this.avoid.add(this.targetId);
      this.stuck = 0;
    }
    const t = sim.tick + 1;
    const g = GRAVITY;
    const apexY = sim.vy > 0 ? sim.y + (sim.vy * sim.vy) / (2 * g) : sim.y;

    let best: Platform | null = null;
    let bestScore = -Infinity;
    let bestDx = 0;
    let bestT = 1;
    let held: { dx: number; T: number; score: number; p: Platform } | null = null;

    for (const p of sim.platforms) {
      if (p.kind === Kind.Fake || p.broken >= 0 || this.avoid.has(p.id)) continue;
      if (p.y > apexY + 80 || p.y < sim.lavaY - 60) continue;
      // Ticks until we fall to this ledge's height.
      let T = this.fallTime(sim, p.y);
      if (T < 0) continue;
      const py = platY(p, t + T);
      if (p.my !== 0) {
        T = this.fallTime(sim, py);
        if (T < 0) continue;
      }
      if (py <= sim.lavaY + 8 || py > apexY - 4) continue;

      let aim = platX(p, t + T);
      let half = p.w / 2 - 6;
      let bonus = 0;
      if (p.spring !== null) {
        aim += p.spring;
        half = 10;
        bonus = 160;
      }
      // A ride or shield resting on this ledge: land right on it.
      for (const u of sim.pickups) {
        if (u.taken || u.y < py || u.y > py + 40 || Math.abs(wrapDx(u.x, aim)) > p.w / 2) continue;
        if (u.kind === PickupKind.Shield && sim.shield) continue;
        aim = u.x;
        half = 8;
        bonus = 200;
      }
      const dx = wrapDx(sim.x, aim) - sim.wind * T * 0.8;
      const need = Math.max(0, Math.abs(dx) - half);
      const can = RUN_SPEED * Math.max(0, T - 8) * 0.85;
      if (need > can) continue;

      let score = py - (need / (can + 1)) * 60;
      score += bonus;
      if (p.kind === Kind.Ice) score -= 25;
      if (p.mx !== 0) score -= 15;
      if (this.careful) {
        for (const b of sim.rockfalls) if (Math.abs(wrapDx(aim, b.x)) < 50) score -= 120;
      }
      if (p.id === this.targetId) held = { dx, T, score, p };
      if (score > bestScore) {
        bestScore = score;
        best = p;
        bestDx = dx;
        bestT = T;
      }
    }
    if (!best) return 0;
    // Stick with the ledge we were already heading for unless something clearly better turns up.
    if (held && held.score > bestScore - 30) {
      best = held.p;
      bestDx = held.dx;
      bestT = held.T;
    }
    this.targetId = best.id;
    this.targetY = best.y;

    let dx = bestDx;
    if (this.careful && sim.safe === 0) {
      const cy = sim.y + PLAYER_H / 2;
      for (const h of sim.hazards) {
        if (h.dead) continue;
        const [hx, hy] = hazardPos(h, t + 6);
        // Bats below us while we fall are a free bounce; everything else is to be avoided.
        if (Math.abs(hy - cy) > 80) continue;
        if (sim.vy < 0 && hy < sim.y - 10 && h.kind === 0) continue;
        const hdx = wrapDx(sim.x, hx);
        if (Math.abs(hdx) < 55) dx = -Math.sign(hdx || 1) * WIDTH;
      }
      for (const b of sim.rockfalls) {
        const bdx = wrapDx(sim.x, b.x);
        if (Math.abs(bdx) < 45 && Math.abs(dx) < 45) dx = -Math.sign(bdx || 1) * 60;
      }
    }
    // Get over the ledge in about half the time left, then hold there.
    const want = dx / Math.max(1, bestT * 0.5);
    return Math.max(-INPUT_MAX, Math.min(INPUT_MAX, Math.round((want / RUN_SPEED) * INPUT_MAX)));
  }

  /** Ticks until the climber, on its current arc, comes down to height `py`. -1 if it never gets that high. */
  private fallTime(sim: Sim, py: number): number {
    const disc = sim.vy * sim.vy - 2 * GRAVITY * (py - sim.y);
    if (disc < 0) return -1;
    return (sim.vy + Math.sqrt(disc)) / GRAVITY;
  }
}
