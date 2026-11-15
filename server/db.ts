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
  /** How long the run lasted and how it ended ('summit' for a Daily Climb win). */
  ticks: number;
  cause: string;
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

/**
 * Board order. Endless: highest first. Daily: everyone who reached the summit first, fastest first,
 * then the rest highest first. Ties go to whoever got there first.
 */
function order(s: Scope): string {
  return 'day' in s ? "(cause = 'summit') DESC, CASE WHEN cause = 'summit' THEN ticks END, meters DESC, created" : 'meters DESC, created';
}

/** The run that a board compares: its height, and for the Daily whether (and how fast) it reached the summit. */
export interface RankedRun {
  meters: number;
  ticks?: number;
  cause?: string;
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

  /** Each climber's best run on this board, in board order (see `order`). */
  top(scope: Scope, limit: number): BoardRow[] {
    const [w, args] = where(scope);
    const ord = order(scope);
    return this.db
      .prepare(
        `SELECT id, name, meters, created AS "when", sim, ticks, cause FROM (
           SELECT id, name, meters, created, sim, ticks, cause,
                  ROW_NUMBER() OVER (PARTITION BY player ORDER BY ${ord}) AS k
           FROM runs WHERE ${w})
         WHERE k = 1 ORDER BY ${ord} LIMIT ?`,
      )
      .all(...args, limit) as unknown as BoardRow[];
  }

  /** A climber's best run on this board. */
  best(player: string, scope: Scope): { id: number; meters: number; ticks: number; cause: string } | null {
    const [w, args] = where(scope);
    const row = this.db
      .prepare(`SELECT id, meters, ticks, cause FROM runs WHERE player = ? AND ${w} ORDER BY ${order(scope)} LIMIT 1`)
      .get(player, ...args) as { id: number; meters: number; ticks: number; cause: string } | undefined;
    return row ?? null;
  }

  /**
   * 1-based place of a run among climbers' bests (other climbers who beat it, plus one).
   * Pass a number for the endless boards; on the Daily, pass the run so a summit counts.
   */
  rank(player: string, run: number | RankedRun, scope: Scope): number {
    const r = typeof run === 'number' ? { meters: run } : run;
    const [w, args] = where(scope);
    if (!('day' in scope)) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM (SELECT player, MAX(meters) AS m FROM runs WHERE ${w} AND player != ? GROUP BY player) WHERE m > ?`)
        .get(...args, player, r.meters) as { n: number };
      return row.n + 1;
    }
    const won = r.cause === 'summit' ? 1 : 0;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT (cause = 'summit') AS s, ticks, meters,
                  ROW_NUMBER() OVER (PARTITION BY player ORDER BY ${order(scope)}) AS k
           FROM runs WHERE ${w} AND player != ?)
         WHERE k = 1 AND (s > ? OR (s = ? AND (CASE WHEN s = 1 THEN ticks < ? ELSE meters > ? END)))`,
      )
      .get(...args, player, won, won, r.ticks ?? 0, r.meters) as { n: number };
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
