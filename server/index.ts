// Serves the page and the height board. Every run is replayed here before it counts.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { Store, playerKey, utcDay, weekStart, type Scope } from './db';
import { INPUT_MAX, SIM_VERSION, TICK_RATE, WIDTH, replay } from '../src/sim/sim';
import { LiveRoom, validPts } from './live';
import { cleanName } from '../src/sim/names';

declare const __APP_VERSION__: string;

const PORT = Number(process.env.PORT ?? 8794);
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? 'dist');
const DB_FILE = process.env.DB_FILE ?? 'data/magmahop.db';
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const IP_HEADER = (process.env.CLIENT_IP_HEADER ?? '').toLowerCase();

/** Two hours of climbing is the longest run the board takes. */
const MAX_TICKS = TICK_RATE * 60 * 120;
const MAX_LOG = 60_000;
const RUN_TTL = 3 * 3600_000;
const MAX_PENDING = 20_000;

const store = new Store(DB_FILE);
const pending = new Map<string, { seed: number; issued: number; day: string | null; pub: string }>();
/** Who is climbing right now, so players in the same mode can see each other. */
const live = new LiveRoom();

/** The Daily Climb seed: the same for everyone on a UTC day, and not guessable before it starts. */
const DAILY_SECRET = process.env.DAILY_SECRET || store.secret();
function dailySeed(day: string): number {
  return (createHmac('sha256', DAILY_SECRET).update('daily:' + day).digest().readUInt32BE(0) % (2 ** 31 - 1)) + 1;
}

function scopeOf(range: string | null): Scope {
  if (range === 'daily') return { day: utcDay() };
  return { since: range === 'week' ? weekStart() : 0 };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let rel: string;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    // A request target that is not a URL (//) or has a bad escape (/%E0) would otherwise throw out of the request handler and stop the server.
    res.writeHead(400).end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(STATIC_DIR, '.' + rel);
  if (!file.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const hashed = rel.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

// ---------- Rate limits: a few tokens per IP that refill each minute ----------

const buckets = new Map<string, { n: number; at: number }>();
function allow(key: string, perMinute: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.at > 60_000) {
    buckets.set(key, { n: 1, at: now });
    return true;
  }
  if (b.n >= perMinute) return false;
  b.n++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.at > 60_000) buckets.delete(k);
  for (const [k, r] of pending) if (now - r.issued > RUN_TTL) pending.delete(k);
  live.sweep(now);
}, 60_000).unref();

function clientIp(req: http.IncomingMessage): string {
  if (IP_HEADER) {
    const v = req.headers[IP_HEADER];
    if (typeof v === 'string' && v) return v.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '?';
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage, limit: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too big'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function validLog(log: unknown, ticks: number): log is number[] {
  if (!Array.isArray(log) || log.length % 2 !== 0 || log.length > MAX_LOG) return false;
  let last = 0;
  for (let i = 0; i < log.length; i += 2) {
    const t = log[i];
    const v = log[i + 1];
    if (!Number.isInteger(t) || t <= last || t > ticks) return false;
    if (!Number.isInteger(v) || v < -INPUT_MAX || v > INPUT_MAX) return false;
    last = t;
  }
  return true;
}

const token = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

/**
 * POSTs must come from our own page: either the address this request was sent to (same origin,
 * whatever hostname the tunnel serves us under) or one listed in ALLOWED_ORIGINS. Other sites are refused.
 */
function originOk(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED.length) return true;
  if (ALLOWED.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const ip = clientIp(req);
  if (req.method === 'POST' && !originOk(req)) {
    console.warn(`refused POST ${url.pathname} from origin ${req.headers.origin} (host ${req.headers.host})`);
    send(res, 403, { error: 'origin' });
    return;
  }

  if (url.pathname === '/api/start' && req.method === 'POST') {
    if (!allow('start:' + ip, 40)) return send(res, 429, { error: 'slow down' });
    let body: any = {};
    try {
      body = await readJson(req, 1024);
    } catch {
      /* an empty body means an endless run */
    }
    if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value!);
    const runId = randomBytes(12).toString('base64url');
    const day = body?.daily === true ? utcDay() : null;
    const seed = day ? dailySeed(day) : randomInt(1, 2 ** 31);
    pending.set(runId, { seed, issued: Date.now(), day, pub: randomBytes(6).toString('base64url') });
    return send(res, 200, { runId, seed, sim: SIM_VERSION, day });
  }

  if (url.pathname === '/api/finish' && req.method === 'POST') {
    if (!allow('finish:' + ip, 12)) return send(res, 429, { error: 'slow down' });
    let body: any;
    try {
      body = await readJson(req, 512 * 1024);
    } catch {
      return send(res, 400, { error: 'bad request' });
    }
    const run = typeof body?.runId === 'string' ? pending.get(body.runId) : undefined;
    if (!run) return send(res, 404, { error: 'unknown run' });
    pending.delete(body.runId);
    live.leave(body.runId);
    const ticks = body.ticks;
    if (!token(body.player) || !Number.isInteger(ticks) || ticks < 1 || ticks > MAX_TICKS || !validLog(body.log, ticks)) {
      return send(res, 400, { error: 'bad run' });
    }
    // Real time must have passed: a run can't be played faster than 60 ticks a second.
    const minMs = (ticks / TICK_RATE) * 1000 * 0.9 - 3000;
    if (Date.now() - run.issued < minMs) return send(res, 400, { error: 'too fast' });

    const r = replay(run.seed, body.log, ticks, { daily: run.day !== null });
    if (r.ticks !== ticks) return send(res, 400, { error: 'replay mismatch' });
    if (Number(body.meters) !== r.meters) console.warn(`replay height differs: claimed ${body.meters}, replayed ${r.meters}`);

    const player = playerKey(body.player);
    const name = cleanName(body.name);
    // The look is cosmetic: anything odd just becomes the default.
    const skin = Number.isInteger(body.skin) && body.skin >= 0 && body.skin < 32 ? body.skin : 0;
    const id =
      r.meters > 0
        ? store.add({ player, name, meters: r.meters, ticks, cause: r.cause || 'quit', seed: run.seed, log: body.log, sim: SIM_VERSION, day: run.day, skin })
        : null;
    if (run.day) {
      const scope = { day: run.day };
      const cause = r.cause || 'quit';
      return send(res, 200, {
        id,
        meters: r.meters,
        day: run.day,
        summit: cause === 'summit',
        ticks,
        best: store.best(player, scope)?.meters ?? r.meters,
        rank: store.rank(player, { meters: r.meters, ticks, cause }, scope),
      });
    }
    const all = { since: 0 };
    const week = { since: weekStart() };
    return send(res, 200, {
      id,
      meters: r.meters,
      best: store.best(player, all)?.meters ?? r.meters,
      rank: store.rank(player, r.meters, all),
      weekBest: store.best(player, week)?.meters ?? r.meters,
      weekRank: store.rank(player, r.meters, week),
    });
  }

  // A live run says where it is and hears where everyone else in its mode is.
  if (url.pathname === '/api/live' && req.method === 'POST') {
    let body: any;
    try {
      body = await readJson(req, 8 * 1024);
    } catch {
      return send(res, 400, { error: 'bad request' });
    }
    const run = typeof body?.runId === 'string' ? pending.get(body.runId) : undefined;
    if (!run) return send(res, 404, { error: 'unknown run' });
    // Several people can share one home address, so the per-address limit is loose; each run gets its own.
    if (!allow('live:' + body.runId, 400) || !allow('liveip:' + ip, 2400)) return send(res, 429, { error: 'slow down' });
    if (body.leave === true) {
      live.leave(body.runId);
      return send(res, 200, { others: [] });
    }
    if (!validPts(body.pts, WIDTH)) return send(res, 400, { error: 'bad points' });
    const meters = Number.isInteger(body.meters) && body.meters >= 0 && body.meters < 1e6 ? body.meters : 0;
    const skin = Number.isInteger(body.skin) && body.skin >= 0 && body.skin < 32 ? body.skin : 0;
    const mode = run.day ? 'daily:' + run.day : 'endless';
    const others = live.post(body.runId, { pub: run.pub, mode, name: cleanName(body.name), skin, meters }, body.pts);
    return send(res, 200, { others });
  }

  if (url.pathname === '/api/live' && req.method === 'GET') {
    if (!allow('livecount:' + ip, 60)) return send(res, 429, { error: 'slow down' });
    const n = live.counts();
    return send(res, 200, { endless: n.endless ?? 0, daily: n['daily:' + utcDay()] ?? 0 });
  }

  if (url.pathname === '/api/board' && req.method === 'GET') {
    if (!allow('board:' + ip, 60)) return send(res, 429, { error: 'slow down' });
    const scope = scopeOf(url.searchParams.get('range'));
    // Only runs under today's rules can be watched, so older ones go out without an id.
    const top = store
      .top(scope, 50)
      .map((r) => ({ id: r.sim === SIM_VERSION ? r.id : null, name: r.name, meters: r.meters, when: r.when, ticks: r.ticks, cause: r.cause }));
    const me = url.searchParams.get('player');
    let mine = null;
    if (token(me)) {
      const key = playerKey(me!);
      const best = store.best(key, scope);
      if (best !== null) mine = { id: best.id, meters: best.meters, ticks: best.ticks, cause: best.cause, rank: store.rank(key, best, scope) };
    }
    return send(res, 200, { top, me: mine, weekStart: weekStart(), day: utcDay() });
  }

  // One stored run's inputs, to watch it back or race it as a ghost.
  if (url.pathname === '/api/run' && req.method === 'GET') {
    if (!allow('run:' + ip, 30)) return send(res, 429, { error: 'slow down' });
    const id = Number(url.searchParams.get('id'));
    const r = Number.isInteger(id) && id > 0 ? store.run(id) : null;
    if (!r) return send(res, 404, { error: 'no such run' });
    if (r.sim !== SIM_VERSION) return send(res, 410, { error: 'played under older rules' });
    return send(res, 200, { id: r.id, name: r.name, meters: r.meters, ticks: r.ticks, cause: r.cause, seed: r.seed, log: r.log, day: r.day, skin: r.skin });
  }

  send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://x');
  } catch {
    // A request target like // is not a URL; uncaught, the throw would stop the server.
    res.writeHead(400).end();
    return;
  }
  if (url.pathname === '/health') {
    return send(res, 200, { ok: true, version: __APP_VERSION__, sim: SIM_VERSION, climbers: store.climbers(), pending: pending.size, live: live.size });
  }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: 'server' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Magma Hop v${__APP_VERSION__} on :${PORT}, static from ${STATIC_DIR}, ${store.climbers()} climbers`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
