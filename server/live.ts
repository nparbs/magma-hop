// Who is climbing right now. Each live run posts a few position samples a few times a second and gets
// back the other climbers in the same mode (endless, or today's Daily Climb). Memory only: nothing here
// touches the board, and a restart just forgets who was climbing.

/** A climber is dropped after this long without a post. */
export const LIVE_STALE_MS = 4000;
/** Samples kept per climber: [tick, x, y] triples, about three seconds at one sample every 3 ticks. */
export const LIVE_KEEP = 60;
/** Samples sent back per climber on each post: enough to cover a slow connection's gap. */
export const LIVE_SEND = 24;
/** At most this many other climbers come back, the closest to your height first. */
export const LIVE_MAX = 12;
/** At most this many samples in one post. */
export const LIVE_POST_MAX = 60;

export interface LiveClimber {
  /** Public id for this run, safe to hand out (unlike the run id, which finishes the run). */
  pub: string;
  mode: string;
  name: string;
  skin: number;
  meters: number;
  /** Flat [tick, x, y, tick, x, y, ...], oldest first. */
  pts: number[];
  seen: number;
}

export interface LiveOther {
  id: string;
  name: string;
  skin: number;
  meters: number;
  pts: number[];
}

/** Checks a posted sample list: whole ticks going up, finite positions, inside the shaft and sane heights. */
export function validPts(pts: unknown, width: number): pts is number[] {
  if (!Array.isArray(pts) || pts.length % 3 !== 0 || pts.length > LIVE_POST_MAX * 3) return false;
  let last = -1;
  for (let i = 0; i < pts.length; i += 3) {
    const [t, x, y] = [pts[i], pts[i + 1], pts[i + 2]];
    if (!Number.isInteger(t) || t <= last || t > 1e7) return false;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < -width || x > width * 2) return false;
    if (typeof y !== 'number' || !Number.isFinite(y) || y < -1000 || y > 1e8) return false;
    last = t;
  }
  return true;
}

export class LiveRoom {
  private runs = new Map<string, LiveClimber>();

  /** Record a post from a live run and return everyone else in its mode. */
  post(runId: string, c: Omit<LiveClimber, 'pts' | 'seen'>, pts: number[], now = Date.now()): LiveOther[] {
    let me = this.runs.get(runId);
    if (!me) {
      me = { ...c, pts: [], seen: now };
      this.runs.set(runId, me);
    }
    me.name = c.name;
    me.skin = c.skin;
    me.meters = Math.max(me.meters, c.meters);
    me.seen = now;
    const lastTick = me.pts.length ? me.pts[me.pts.length - 3] : -1;
    for (let i = 0; i < pts.length; i += 3) if (pts[i] > lastTick) me.pts.push(pts[i], pts[i + 1], pts[i + 2]);
    if (me.pts.length > LIVE_KEEP * 3) me.pts.splice(0, me.pts.length - LIVE_KEEP * 3);
    return this.others(runId, me, now);
  }

  private others(runId: string, me: LiveClimber, now: number): LiveOther[] {
    const out: LiveClimber[] = [];
    for (const [id, c] of this.runs) {
      if (id === runId || c.mode !== me.mode || now - c.seen > LIVE_STALE_MS || !c.pts.length) continue;
      out.push(c);
    }
    out.sort((a, b) => Math.abs(a.meters - me.meters) - Math.abs(b.meters - me.meters));
    return out.slice(0, LIVE_MAX).map((c) => ({ id: c.pub, name: c.name, skin: c.skin, meters: c.meters, pts: c.pts.slice(-LIVE_SEND * 3) }));
  }

  /** The run ended (finished, or the climber said so). */
  leave(runId: string): void {
    this.runs.delete(runId);
  }

  /** How many are climbing in each mode right now. */
  counts(now = Date.now()): Record<string, number> {
    const n: Record<string, number> = {};
    for (const c of this.runs.values()) if (now - c.seen <= LIVE_STALE_MS) n[c.mode] = (n[c.mode] ?? 0) + 1;
    return n;
  }

  sweep(now = Date.now()): void {
    for (const [id, c] of this.runs) if (now - c.seen > LIVE_STALE_MS) this.runs.delete(id);
  }

  get size(): number {
    return this.runs.size;
  }
}
