// Every verified run in one SQLite file. The boards show each climber's best.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BoardRow {
  /** Run id, for watching it back. */
  id: number;
  name: string;
  meters: number;
  when: number;
  /** Rules version the run was played under. Only the current version can be watched. */
  sim: number;
}

export interface StoredRun {
  id: number;
  name: string;
  meters: number;
  ticks: number;
  cause: string;
  seed: number;
  log: number[];
  sim: number;
  day: string | null;
  skin: number;
  created: number;
}

/**
 * Which board: endless runs since a time (all time is since 0), or one day's Daily Climb.
 * Daily runs never count on the endless boards: everyone knows the seed, so they'd be easy to grind.
 */
export type Scope = { since: number } | { day: string };

export const playerKey = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

/** Monday 00:00 UTC of this week. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/** Today's date in UTC, like 2026-11-14. The Daily Climb changes at 00:00 UTC. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function where(s: Scope): [string, (string | number)[]] {
  return 'day' in s ? ['day = ?', [s.day]] : ['day IS NULL AND created >= ?', [s.since]];
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
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
    const cols = this.db.prepare('PRAGMA table_info(runs)').all() as { name: string }[];
    // Which version of the rules a run was played under. Runs from before this column are version 1.
    if (!cols.some((c) => c.name === 'sim')) this.db.exec('ALTER TABLE runs ADD COLUMN sim INTEGER NOT NULL DEFAULT 1');
    // The Daily Climb date for daily runs, NULL for endless runs.
    if (!cols.some((c) => c.name === 'day')) this.db.exec('ALTER TABLE runs ADD COLUMN day TEXT');
    // Which look the climber had (cosmetic, shown when the run is watched back).
    if (!cols.some((c) => c.name === 'skin')) this.db.exec('ALTER TABLE runs ADD COLUMN skin INTEGER NOT NULL DEFAULT 0');
    this.db.exec('CREATE INDEX IF NOT EXISTS runs_day ON runs (day, meters DESC)');
  }

  /** A random secret made once and kept, so daily seeds can't be worked out ahead of time. */
  secret(): string {
    const row = this.db.prepare("SELECT v FROM meta WHERE k = 'secret'").get() as { v: string } | undefined;
    if (row) return row.v;
    const v = randomBytes(24).toString('base64url');
    this.db.prepare("INSERT INTO meta (k, v) VALUES ('secret', ?)").run(v);
    return v;
  }

  add(r: { player: string; name: string; meters: number; ticks: number; cause: string; seed: number; log: number[]; sim: number; day?: string | null; skin?: number }): number {
    const res = this.db
      .prepare('INSERT INTO runs (player, name, meters, ticks, cause, seed, log, created, sim, day, skin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.player, r.name, r.meters, r.ticks, r.cause, r.seed, JSON.stringify(r.log), Date.now(), r.sim, r.day ?? null, r.skin ?? 0);
    // A climber's newest name shows on all their runs.
    this.db.prepare('UPDATE runs SET name = ? WHERE player = ?').run(r.name, r.player);
    return Number(res.lastInsertRowid);
  }

  /** Each climber's best run on this board, highest first; ties go to whoever got there first. */
  top(scope: Scope, limit: number): BoardRow[] {
    const [w, args] = where(scope);
    return this.db
      .prepare(
        `SELECT id, name, meters, created AS "when", sim FROM (
           SELECT id, name, meters, created, sim,
                  ROW_NUMBER() OVER (PARTITION BY player ORDER BY meters DESC, created) AS k
           FROM runs WHERE ${w})
         WHERE k = 1 ORDER BY meters DESC, created LIMIT ?`,
      )
      .all(...args, limit) as unknown as BoardRow[];
  }

  /** A climber's best run on this board. */
  best(player: string, scope: Scope): { id: number; meters: number } | null {
    const [w, args] = where(scope);
    const row = this.db
      .prepare(`SELECT id, meters FROM runs WHERE player = ? AND ${w} ORDER BY meters DESC, created LIMIT 1`)
      .get(player, ...args) as { id: number; meters: number } | undefined;
    return row ?? null;
  }

  /** 1-based place of a height among climbers' bests (other climbers who beat it, plus one). */
  rank(player: string, meters: number, scope: Scope): number {
    const [w, args] = where(scope);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM (SELECT player, MAX(meters) AS m FROM runs WHERE ${w} AND player != ? GROUP BY player) WHERE m > ?`)
      .get(...args, player, meters) as { n: number };
    return row.n + 1;
  }

  run(id: number): StoredRun | null {
    const row = this.db
      .prepare('SELECT id, name, meters, ticks, cause, seed, log, sim, day, skin, created FROM runs WHERE id = ?')
      .get(id) as (Omit<StoredRun, 'log'> & { log: string }) | undefined;
    return row ? { ...row, log: JSON.parse(row.log) } : null;
  }

  climbers(): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT player) AS n FROM runs').get() as { n: number }).n;
  }
}
