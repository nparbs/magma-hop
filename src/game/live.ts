// Other climbers playing the same mode right now. Four times a second we post our recent positions
// and get theirs back, then draw each one a little behind real time so the motion stays smooth.

import { TICK_RATE, WIDTH } from '../sim/sim';

/** Take a sample every this many ticks. */
const SAMPLE_EVERY = 3;
const POST_MS = 250;
/** Show others this far behind their newest sample, to ride out network jitter. */
const DELAY_TICKS = 27;

interface Remote {
  id: string;
  name: string;
  skin: number;
  meters: number;
  /** Flat [tick, x, y, ...], oldest first. */
  pts: number[];
  /** Newest tick heard, and when (performance.now). */
  newest: number;
  heardAt: number;
  /** The tick we're showing. */
  play: number;
}

export interface Rival {
  id: string;
  name: string;
  skin: number;
  /** Best height so far, in meters. */
  meters: number;
  x: number;
  y: number;
}

export class LiveClimbers {
  private remotes = new Map<string, Remote>();
  private outbox: number[] = [];
  private runId: string | null = null;
  private busy = false;
  private lastPost = 0;
  /** Set when the server turned us down, so we stop asking for this run. */
  private refused = false;

  /** Start sharing for a run (or stop, with null). */
  begin(runId: string | null): void {
    if (this.runId && this.runId !== runId) this.leave();
    this.runId = runId;
    this.outbox = [];
    this.remotes.clear();
    this.refused = false;
  }

  /** Tell the server we're gone and forget everyone. */
  leave(): void {
    if (this.runId && !this.refused) {
      void fetch('api/live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: this.runId, leave: true }),
        keepalive: true,
      }).catch(() => undefined);
    }
    this.runId = null;
    this.outbox = [];
    this.remotes.clear();
  }

  /** Call after every tick of your run. */
  sample(tick: number, x: number, y: number): void {
    if (!this.runId || tick % SAMPLE_EVERY) return;
    this.outbox.push(tick, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    if (this.outbox.length > 60 * 3) this.outbox.splice(0, this.outbox.length - 60 * 3);
  }

  /** Call every frame while the run is on screen. Posts on its own schedule. */
  pump(now: number, me: { name: string; skin: number; meters: number }): void {
    if (!this.runId || this.refused || this.busy || now - this.lastPost < POST_MS) return;
    this.lastPost = now;
    this.busy = true;
    const runId = this.runId;
    const pts = this.outbox;
    this.outbox = [];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    fetch('api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, pts, ...me }),
      signal: ctl.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (r.status === 404 || r.status === 400) this.refused = true;
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { others: { id: string; name: string; skin: number; meters: number; pts: number[] }[] };
        if (this.runId === runId) this.merge(body.others ?? [], performance.now());
      })
      .catch(() => {
        // Put the samples back so the next post carries them.
        if (this.runId === runId && !this.refused) this.outbox = pts.concat(this.outbox).slice(-60 * 3);
      })
      .finally(() => {
        clearTimeout(timer);
        this.busy = false;
      });
  }

  private merge(others: { id: string; name: string; skin: number; meters: number; pts: number[] }[], now: number): void {
    const seen = new Set<string>();
    for (const o of others) {
      if (typeof o?.id !== 'string' || !Array.isArray(o.pts) || o.pts.length < 3) continue;
      seen.add(o.id);
      let r = this.remotes.get(o.id);
      const newest = o.pts[o.pts.length - 3];
      if (!r) {
        r = { id: o.id, name: o.name, skin: o.skin, meters: o.meters, pts: [], newest, heardAt: now, play: newest - DELAY_TICKS };
        this.remotes.set(o.id, r);
      }
      r.name = o.name;
      r.skin = o.skin;
      r.meters = o.meters;
      const last = r.pts.length ? r.pts[r.pts.length - 3] : -1;
      for (let i = 0; i + 2 < o.pts.length; i += 3) if (o.pts[i] > last) r.pts.push(o.pts[i], o.pts[i + 1], o.pts[i + 2]);
      if (r.pts.length > 120 * 3) r.pts.splice(0, r.pts.length - 120 * 3);
      if (newest > r.newest) {
        r.newest = newest;
        r.heardAt = now;
      }
    }
    for (const id of this.remotes.keys()) if (!seen.has(id)) this.remotes.delete(id);
  }

  /** Where everyone is right now, a little behind real time. */
  rivals(now: number, dt: number): Rival[] {
    const out: Rival[] = [];
    for (const r of this.remotes.values()) {
      // Where their clock is now, by our guess, minus the cushion. Never past what we've heard.
      const target = Math.min(r.newest, r.newest + ((now - r.heardAt) / 1000) * TICK_RATE - DELAY_TICKS);
      r.play += dt * TICK_RATE;
      if (Math.abs(target - r.play) > 40) r.play = target;
      else r.play += (target - r.play) * Math.min(1, dt * 3);
      if (r.play > r.newest) r.play = r.newest;
      const p = at(r.pts, r.play);
      if (p) out.push({ id: r.id, name: r.name, skin: r.skin, meters: r.meters, x: p.x, y: p.y });
    }
    return out;
  }

  /** How many others are climbing with you. */
  get count(): number {
    return this.remotes.size;
  }
}

/** Position at a (fractional) tick, between the two samples around it. Wrapping jumps don't slide. */
function at(pts: number[], tick: number): { x: number; y: number } | null {
  if (!pts.length) return null;
  if (tick <= pts[0]) return { x: pts[1], y: pts[2] };
  for (let i = pts.length - 3; i >= 0; i -= 3) {
    if (pts[i] > tick) continue;
    if (i + 3 >= pts.length) return { x: pts[i + 1], y: pts[i + 2] };
    const f = (tick - pts[i]) / (pts[i + 3] - pts[i]);
    const x0 = pts[i + 1];
    const x1 = pts[i + 4];
    const x = Math.abs(x1 - x0) < WIDTH / 2 ? x0 + (x1 - x0) * f : f < 0.5 ? x0 : x1;
    return { x, y: pts[i + 2] + (pts[i + 5] - pts[i + 2]) * f };
  }
  return null;
}

/** How many are climbing in each mode right now (for the title screen). */
export async function liveCounts(): Promise<{ endless: number; daily: number } | null> {
  try {
    const r = await fetch('api/live', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
