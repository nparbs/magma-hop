import '@fontsource/jersey-15/latin-400.css';
import './style.css';

import { Kind, PickupKind, Recorder, Sim, TICK_RATE, UNITS_PER_METER } from '../sim/sim';
import { Bot } from '../sim/bot';
import { ZONES, zoneIndexAt } from '../sim/zones';
import { cleanName } from '../sim/names';
import { Renderer, type Marker } from './render';
import { Input } from './input';
import { Sfx } from './audio';
import { fetchBoard, finishRun, startRun, type Board } from './net';

declare const __APP_VERSION__: string;

const MAX_TICKS = TICK_RATE * 60 * 120;
const STEP = 1 / TICK_RATE;

// ---------- Saved settings (all optional: private windows may block storage) ----------

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem('updraft.' + k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem('updraft.' + k, v);
    } catch {
      /* fine */
    }
  },
};

function playerToken(): string {
  let t = store.get('player');
  if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set('player', t);
  }
  return t;
}

const PLAYER = playerToken();
let localBest = Number(store.get('best') ?? 0) || 0;

// ---------- Elements ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ui = {
  hud: $('hud'),
  height: $('hHeight'),
  sub: $('hSub'),
  wind: $('hWind'),
  banner: $('banner'),
  toast: $('toast'),
  touchHint: $('touchHint'),
  title: $('title'),
  how: $('how'),
  board: $('board'),
  boardList: $('boardList'),
  boardMe: $('boardMe'),
  pause: $('pause'),
  over: $('over'),
  name: $<HTMLInputElement>('nameInput'),
  mini: $('miniBoard'),
  cause: $('oCause'),
  meters: $('oMeters'),
  best: $('oBest'),
  rank: $('oRank'),
  sound: $('soundBtn'),
  tilt: $('tiltBtn'),
};
$('ver').textContent = `v${__APP_VERSION__}`;

const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sfx = new Sfx();
window.addEventListener('resize', () => renderer.resize());

// ---------- State ----------

type Mode = 'title' | 'play' | 'pause' | 'dying' | 'over';
let mode: Mode = 'title';
let sim = new Sim(Math.floor(Math.random() * 2 ** 31));
let bot: Bot | null = new Bot(true);
let rec = new Recorder();
let prev = { x: sim.x, y: sim.y };
let acc = 0;
let last = performance.now();
let run: { runId: string; seed: number; got: number } | null = null;
let nextRun: Promise<{ runId: string; seed: number; got: number } | null> | null = null;
let zoneShown = 0;
let bestAnnounced = false;
let dyingTimer = 0;
let topBoard: Board | null = null;
renderer.snapCamera(sim.lavaY);

ui.name.value = store.get('name') ?? '';
ui.name.addEventListener('change', () => store.set('name', ui.name.value.trim()));

sfx.setMuted(store.get('muted') === '1');
const soundLabel = () => (ui.sound.textContent = sfx.muted ? 'Sound off' : 'Sound on');
soundLabel();
ui.sound.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  store.set('muted', sfx.muted ? '1' : '0');
  soundLabel();
  sfx.unlock();
  sfx.click();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && (e.target as HTMLElement)?.tagName !== 'INPUT') ui.sound.click();
});

// Tilt only makes sense on touch devices.
if ('ontouchstart' in window && 'DeviceOrientationEvent' in window) {
  ui.tilt.classList.remove('hidden');
  const label = () => (ui.tilt.textContent = input.tiltOn ? 'Tilt on' : 'Tilt off');
  if (store.get('tilt') === '1') void input.enableTilt().then(label);
  ui.tilt.addEventListener('click', async () => {
    if (input.tiltOn) input.tiltOn = false;
    else await input.enableTilt();
    store.set('tilt', input.tiltOn ? '1' : '0');
    label();
  });
}

// ---------- Runs and the board ----------

/** Ask for a seed ahead of time so pressing Climb starts at once. */
function prefetchRun(): void {
  nextRun = startRun()
    .then((r) => ({ ...r, got: Date.now() }))
    .catch(() => null);
}

async function takeRun(): Promise<{ runId: string; seed: number; got: number } | null> {
  let r = nextRun ? await nextRun : null;
  nextRun = null;
  // The server forgets unused seeds after 3 hours.
  if (r && Date.now() - r.got > 2 * 3600_000) r = null;
  if (!r) r = await startRun().then((x) => ({ ...x, got: Date.now() })).catch(() => null);
  return r;
}

const fmt = (m: number) => `${m.toLocaleString('en-US')} m`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function refreshMini(): Promise<void> {
  try {
    topBoard = await fetchBoard('all', PLAYER);
    const rows = topBoard.top.slice(0, 5);
    ui.mini.innerHTML = rows.length
      ? `<div class="head">Highest climbers</div>` +
        rows.map((r, i) => `<div class="r"><span>${i + 1}. ${esc(r.name)}</span><span>${fmt(r.meters)}</span></div>`).join('') +
        (topBoard.me ? `<div class="r" style="color:var(--mint)"><span>You: #${topBoard.me.rank}</span><span>${fmt(topBoard.me.meters)}</span></div>` : '')
      : `<div class="head">No climbers on the board yet. Be the first.</div>`;
    if (topBoard.me && topBoard.me.meters > localBest) {
      localBest = topBoard.me.meters;
      store.set('best', String(localBest));
    }
  } catch {
    ui.mini.innerHTML = `<div class="head">Board offline. Runs won't be ranked.</div>`;
  }
}

let boardRange: 'all' | 'week' = 'all';
async function showBoard(): Promise<void> {
  ui.board.classList.remove('hidden');
  ui.boardList.innerHTML = `<li class="empty">Loading…</li>`;
  ui.boardMe.textContent = '';
  for (const t of ui.board.querySelectorAll<HTMLElement>('.tab')) t.classList.toggle('active', t.dataset.range === boardRange);
  try {
    const b = await fetchBoard(boardRange, PLAYER);
    ui.boardList.innerHTML = b.top.length
      ? b.top.map((r) => `<li><span class="n">${esc(r.name)}</span><span>${fmt(r.meters)}</span></li>`).join('')
      : `<li class="empty">Nobody yet${boardRange === 'week' ? ' this week' : ''}. Go climb!</li>`;
    ui.boardMe.textContent = b.me ? `You: #${b.me.rank} with ${fmt(b.me.meters)}` : 'You have no ranked climb here yet.';
  } catch {
    ui.boardList.innerHTML = `<li class="empty">Can't reach the board right now.</li>`;
  }
}
for (const t of ui.board.querySelectorAll<HTMLElement>('.tab')) {
  t.addEventListener('click', () => {
    boardRange = t.dataset.range as 'all' | 'week';
    void showBoard();
  });
}
for (const c of document.querySelectorAll<HTMLElement>('.close')) {
  c.addEventListener('click', () => c.closest('.panel-wrap')!.classList.add('hidden'));
}

// ---------- Screens ----------

function show(m: Mode): void {
  mode = m;
  ui.title.classList.toggle('hidden', m !== 'title');
  ui.hud.classList.toggle('hidden', m !== 'play' && m !== 'dying' && m !== 'pause');
  ui.pause.classList.toggle('hidden', m !== 'pause');
  ui.over.classList.toggle('hidden', m !== 'over');
  if (m !== 'title') ui.how.classList.add('hidden');
}

function toTitle(): void {
  sim = new Sim(Math.floor(Math.random() * 2 ** 31));
  bot = new Bot(true);
  prev = { x: sim.x, y: sim.y };
  renderer.snapCamera(sim.lavaY);
  ui.board.classList.add('hidden');
  show('title');
  void refreshMini();
  if (!nextRun) prefetchRun();
}

let starting = false;
async function startGame(): Promise<void> {
  if (starting) return;
  starting = true;
  sfx.unlock();
  const name = ui.name.value.trim();
  store.set('name', name);
  ui.board.classList.add('hidden');
  run = await takeRun();
  starting = false;
  sim = new Sim(run ? run.seed : Math.floor(Math.random() * 2 ** 31));
  bot = null;
  rec = new Recorder();
  prev = { x: sim.x, y: sim.y };
  renderer.snapCamera(sim.lavaY);
  acc = 0;
  zoneShown = 0;
  bestAnnounced = localBest === 0;
  show('play');
  input.reset();
  ui.sub.textContent = run ? (localBest ? `Best ${fmt(localBest)}` : '') : 'Offline: not ranked';
  banner(ZONES[0].name, matchMedia('(pointer: coarse)').matches ? 'Hold either side of the screen to steer' : 'Steer with ← → and stay ahead of the lava');
  if (matchMedia('(pointer: coarse)').matches) {
    ui.touchHint.classList.remove('hidden');
    ui.touchHint.style.animation = 'none';
    void ui.touchHint.offsetWidth;
    ui.touchHint.style.animation = '';
  }
  prefetchRun();
}

let bannerTimer = 0;
function banner(title: string, sub: string): void {
  ui.banner.innerHTML = `<b>${esc(title)}</b><small>${esc(sub)}</small>`;
  ui.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => ui.banner.classList.remove('show'), 2600);
}

let toastTimer = 0;
function toast(text: string): void {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 1600);
}

function pause(): void {
  if (mode === 'play') show('pause');
}
function resume(): void {
  if (mode !== 'pause') return;
  last = performance.now();
  acc = 0;
  input.reset();
  show('play');
}
input.onPause = () => (mode === 'play' ? pause() : mode === 'pause' ? resume() : undefined);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('endBtn').addEventListener('click', () => endRun('quit'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

const CAUSES: Record<string, string> = {
  lava: 'Fell into the lava',
  bat: 'Bitten by a fire bat',
  wisp: 'Burned by a fire wisp',
  rockfall: 'Flattened by a rockfall',
  quit: 'You called it there',
};

function endRun(cause: string): void {
  if (mode !== 'play' && mode !== 'pause' && mode !== 'dying') return;
  const meters = sim.meters;
  const isBest = meters > localBest;
  if (isBest) {
    localBest = meters;
    store.set('best', String(meters));
  }
  ui.cause.textContent = CAUSES[cause] ?? 'Run over';
  ui.meters.textContent = fmt(meters);
  ui.best.textContent = isBest ? 'New personal best!' : `Your best: ${fmt(localBest)}`;
  ui.best.classList.toggle('new', isBest);
  ui.rank.textContent = run ? 'Checking your climb…' : 'Offline run: not ranked.';
  show('over');
  if (isBest) sfx.best();

  if (run && meters > 0) {
    const r = run;
    finishRun({ runId: r.runId, player: PLAYER, name: cleanName(ui.name.value), ticks: sim.tick, log: rec.log, meters })
      .then((res) => {
        ui.rank.textContent = `#${res.rank} all time · #${res.weekRank} this week`;
      })
      .catch((e) => {
        ui.rank.textContent = `Couldn't rank this climb (${String(e.message ?? e)}).`;
      });
  } else if (run) {
    ui.rank.textContent = 'Climb at least 1 m to make the board.';
  }
  run = null;
}

$('playBtn').addEventListener('click', () => void startGame());
$('againBtn').addEventListener('click', () => void startGame());
$('menuBtn').addEventListener('click', toTitle);
$('boardBtn').addEventListener('click', () => void showBoard());
$('oBoardBtn').addEventListener('click', () => void showBoard());
$('howBtn').addEventListener('click', () => ui.how.classList.remove('hidden'));
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') {
    if (e.code === 'Enter') void startGame();
    return;
  }
  if ((e.code === 'Enter' || e.code === 'Space') && (mode === 'title' || mode === 'over')) {
    if (!ui.board.classList.contains('hidden') || !ui.how.classList.contains('hidden')) return;
    e.preventDefault();
    void startGame();
  }
});

// ---------- The loop ----------

function handleEvents(): void {
  const audible = mode !== 'title';
  for (const e of sim.events) {
    renderer.onEvent(e, sim);
    if (!audible) continue;
    if (e.t === 'bounce') e.kind === Kind.Ice ? sfx.ice() : sfx.bounce(e.y / UNITS_PER_METER);
    else if (e.t === 'spring') sfx.spring();
    else if (e.t === 'crumble') sfx.crumble();
    else if (e.t === 'fake') sfx.fake();
    else if (e.t === 'stomp') sfx.stomp();
    else if (e.t === 'warn') sfx.warn();
    else if (e.t === 'strike') sfx.strike();
    else if (e.t === 'pickup') {
      sfx.pickup(e.kind === PickupKind.Shield);
      toast(e.kind === PickupKind.Shield ? 'Shell: blocks one hit' : e.kind === PickupKind.Geyser ? 'Geyser!' : 'Lava bubble!');
    } else if (e.t === 'rideend') sfx.rideEnd();
    else if (e.t === 'shieldbreak') {
      sfx.shieldBreak();
      toast('Shell broken');
    } else if (e.t === 'die') sfx.die(e.cause === 'lava');
  }
  sim.events.length = 0;
}

function tick(): void {
  prev = { x: sim.x, y: sim.y };
  if (mode === 'title') {
    const i = bot!.think(sim);
    sim.events.length = 0;
    sim.step(i);
    if (sim.dead || sim.meters > 900) {
      sim = new Sim(Math.floor(Math.random() * 2 ** 31));
      bot = new Bot(true);
      prev = { x: sim.x, y: sim.y };
      renderer.snapCamera(sim.lavaY);
    }
    return;
  }
  const i = input.read();
  rec.push(sim.tick + 1, i);
  sim.step(i);
  if (sim.dead) {
    mode = 'dying';
    dyingTimer = 1.3;
  } else if (sim.tick >= MAX_TICKS) endRun('quit');
}

function updateHud(): void {
  ui.height.textContent = fmt(sim.meters);
  const now = sim.heightNow;
  const max = sim.meters;
  const bits: string[] = [];
  if (sim.shield) bits.push('Shell');
  if (localBest && !(max > localBest)) bits.push(`Best ${fmt(localBest)}`);
  if (!run) bits.push('Offline: not ranked');
  ui.sub.textContent = bits.join(' · ');

  const g = sim.gustDir(sim.tick, now);
  ui.wind.classList.toggle('hidden', g === 0);
  if (g) ui.wind.textContent = g > 0 ? 'Gust ≫' : '≪ Gust';

  const z = zoneIndexAt(max);
  if (z > zoneShown) {
    zoneShown = z;
    banner(ZONES[z].name, ZONES[z].intro);
    sfx.zone();
  }
  if (!bestAnnounced && max > localBest) {
    bestAnnounced = true;
    toast('New best!');
    sfx.best();
  }
}

function markers(): Marker[] {
  const out: Marker[] = [];
  if (localBest > 0) out.push({ meters: localBest, label: `Your best ${fmt(localBest)}`, color: '#7dfcc6' });
  const top = topBoard?.top[0];
  if (top && top.meters !== localBest) out.push({ meters: top.meters, label: `#1 ${top.name} ${fmt(top.meters)}`, color: '#ffd84a' });
  return mode === 'title' ? [] : out;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play' || mode === 'title') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) {
      tick();
      handleEvents();
      acc -= STEP;
      n++;
      if (mode !== 'play' && mode !== 'title') break;
    }
    if (n === 8) acc = 0;
  } else if (mode === 'dying') {
    dyingTimer -= dt;
    if (dyingTimer <= 0) endRun(sim.cause);
  }
  if (mode === 'play' || mode === 'dying' || mode === 'pause') updateHud();
  const alpha = mode === 'play' || mode === 'title' ? Math.min(1, acc / STEP) : 1;
  renderer.draw(sim, alpha, prev, markers(), mode === 'pause' ? 0 : dt);
  if (input.padConfirm() && (mode === 'title' || mode === 'over')) void startGame();
  requestAnimationFrame(frame);
}

// Headless checks poke at this.
(window as unknown as { updraft: unknown }).updraft = {
  get sim() {
    return sim;
  },
  get mode() {
    return mode;
  },
  renderer,
  startGame,
};

toTitle();
requestAnimationFrame(frame);
