// Talks to the board server. Every call fails soft: the game still plays offline, just unranked.

export type Range = 'all' | 'week' | 'daily';

export interface BoardEntry {
  /** Set when the run can be watched back (played under today's rules). */
  id: number | null;
  name: string;
  meters: number;
  when: number;
}

export interface Board {
  top: BoardEntry[];
  me: { id: number; meters: number; rank: number } | null;
  day: string;
}

export interface FinishResult {
  id: number | null;
  meters: number;
  best: number;
  rank: number;
  /** Endless runs only. */
  weekBest?: number;
  weekRank?: number;
  /** Daily runs only. */
  day?: string;
}

export interface StoredRun {
  id: number;
  name: string;
  meters: number;
  ticks: number;
  cause: string;
  seed: number;
  log: number[];
  day: string | null;
  /** The climber's look; older servers may leave it out. */
  skin?: number;
}

async function call<T>(path: string, init: RequestInit = {}, timeout = 4000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { ...init, signal: ctl.signal, cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown, timeout?: number) =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeout);

export const startRun = (daily = false) =>
  post<{ runId: string; seed: number; day: string | null }>('api/start', daily ? { daily: true } : {}, 2500);

export const finishRun = (body: { runId: string; player: string; name: string; ticks: number; log: number[]; meters: number; skin: number }) =>
  post<FinishResult>('api/finish', body, 15000);

export const fetchBoard = (range: Range, player: string) =>
  call<Board>(`api/board?range=${range}&player=${encodeURIComponent(player)}`);

export const fetchRun = (id: number) => call<StoredRun>(`api/run?id=${id}`, {}, 8000);
