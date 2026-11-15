// Plays a stored run back tick by tick: for watching top climbs and for the Daily Climb ghost.

import { Sim } from '../sim/sim';
import type { StoredRun } from './net';

export class Playback {
  readonly sim: Sim;
  prev: { x: number; y: number };
  private k = 0;
  private input = 0;

  constructor(readonly run: StoredRun) {
    this.sim = new Sim(run.seed, { daily: run.day != null });
    this.prev = { x: this.sim.x, y: this.sim.y };
  }

  /** True once the recorded run has run out of ticks or died. */
  get done(): boolean {
    return this.sim.dead || this.sim.tick >= this.run.ticks;
  }

  /** One tick, using the input recorded for it. Leaves the sim's events for the caller. */
  step(): void {
    if (this.done) return;
    const { log } = this.run;
    const next = this.sim.tick + 1;
    while (this.k < log.length && log[this.k] <= next) {
      this.input = log[this.k + 1];
      this.k += 2;
    }
    this.prev = { x: this.sim.x, y: this.sim.y };
    this.sim.step(this.input);
  }

  /** Catch up to a tick, throwing the events away (a ghost that loaded late). */
  advanceTo(tick: number): void {
    while (!this.done && this.sim.tick < tick) {
      this.step();
      this.sim.events.length = 0;
    }
  }
}
