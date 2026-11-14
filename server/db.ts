// Every verified run in one SQLite file. The boards show each climber's best.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BoardRow {
  name: string;
  meters: number;
  when: number;
}

export const playerKey = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

/** Monday 00:00 UTC of this week. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY,
        player TEXT NOT NULL,
        name TEXT NOT NULL,
        meters INTEGER NOT NULL,
        ticks INTEGER NOT NULL,
        cause TEXT NOT NULL,
        seed INTEGER NOT NULL,
        log TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runs_meters ON runs (meters DESC, created);
      CREATE INDEX IF NOT EXISTS runs_player ON runs (player, meters DESC);
      CREATE INDEX IF NOT EXISTS runs_created ON runs (created);
    `);
    // Which version of the rules a run was played under. Runs from before this column are version 1.
    const cols = this.db.prepare('PRAGMA table_info(runs)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'sim')) this.db.exec('ALTER TABLE runs ADD COLUMN sim INTEGER NOT NULL DEFAULT 1');
  }

  add(r: { player: string; name: string; meters: number; ticks: number; cause: string; seed: number; log: number[]; sim: number }): void {
    this.db
      .prepare('INSERT INTO runs (player, name, meters, ticks, cause, seed, log, created, sim) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.player, r.name, r.meters, r.ticks, r.cause, r.seed, JSON.stringify(r.log), Date.now(), r.sim);
    // A climber's newest name shows on all their runs.
    this.db.prepare('UPDATE runs SET name = ? WHERE player = ?').run(r.name, r.player);
  }

  /** Each climber's best run since `since`, highest first; ties go to whoever got there first. */
  top(since: number, limit: number): BoardRow[] {
    return this.db
      .prepare(
        `SELECT name, meters, created AS "when" FROM (
           SELECT name, meters, created,
                  ROW_NUMBER() OVER (PARTITION BY player ORDER BY meters DESC, created) AS k
           FROM runs WHERE created >= ?)
         WHERE k = 1 ORDER BY meters DESC, created LIMIT ?`,
      )
      .all(since, limit) as unknown as BoardRow[];
  }

  best(player: string, since: number): number | null {
    const row = this.db.prepare('SELECT MAX(meters) AS m FROM runs WHERE player = ? AND created >= ?').get(player, since) as { m: number | null };
    return row.m;
  }

  /** 1-based place of a height among climbers' bests (other climbers who beat it, plus one). */
  rank(player: string, meters: number, since: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT player, MAX(meters) AS m FROM runs WHERE created >= ? AND player != ? GROUP BY player) WHERE m > ?`,
      )
      .get(since, player, meters) as { n: number };
    return row.n + 1;
  }

  climbers(): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT player) AS n FROM runs').get() as { n: number }).n;
  }
}
