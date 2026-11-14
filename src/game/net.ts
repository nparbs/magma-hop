// Talks to the board server. Every call fails soft: the game still plays offline, just unranked.

export interface BoardEntry {
  name: string;
  meters: number;
  when: number;
}

export interface Board {
  top: BoardEntry[];
  me: { meters: number; rank: number } | null;
}

export interface FinishResult {
  meters: number;
  best: number;
  rank: number;
  weekBest: number;
  weekRank: number;
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

export const startRun = () => post<{ runId: string; seed: number }>('api/start', {}, 2500);

export const finishRun = (body: { runId: string; player: string; name: string; ticks: number; log: number[]; meters: number }) =>
  post<FinishResult>('api/finish', body, 15000);

export const fetchBoard = (range: 'all' | 'week', player: string) =>
  call<Board>(`api/board?range=${range}&player=${encodeURIComponent(player)}`);
