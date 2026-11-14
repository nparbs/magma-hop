import '@fontsource/jersey-15/latin-400.css';
import './style.css';

import { Kind, PickupKind, Recorder, Sim, TICK_RATE, UNITS_PER_METER } from '../sim/sim';
import { Bot } from '../sim/bot';
import { ZONES, zoneIndexAt } from '../sim/zones';
import { cleanName } from '../sim/names';
import { Logo, Renderer, type Marker } from './render';
import { Input } from './input';
import { Sfx } from './audio';
import { Playback } from './playback';
import { fetchBoard, fetchRun, finishRun, startRun, type Board, type Range } from './net';

declare const __APP_VERSION__: string;

const MAX_TICKS = TICK_RATE * 60 * 120;
const STEP = 1 / TICK_RATE;

// ---------- Saved settings (all optional: private windows may block storage) ----------

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem('magmahop.' + k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem('magmahop.' + k, v);
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

/** Your best Daily Climb height on a given day, kept on this device. */
function dailyBest(day: string): number {
  try {
    const d = JSON.parse(store.get('dailyBest') ?? 'null');
    return d && d.day === day ? Number(d.meters) || 0 : 0;
  } catch {
    return 0;
  }
}
function setDailyBest(day: string, meters: number): void {
  store.set('dailyBest', JSON.stringify({ day, meters }));
}
const todayUtc = () => new Date().toISOString().slice(0, 10);

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
  pauseBtn: $('pauseBtn'),
  watchBar: $('watchBar'),
  watchName: $('watchName'),
  watchSpeed: $('watchSpeed'),
  title: $('title'),
  dailyNote: $('dailyNote'),
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
  again: $('againBtn'),
  sound: $('soundBtn'),
  music: $('musicBtn'),
  calm: $('calmBtn'),
  tilt: $('tiltBtn'),
};
$('ver').textContent = `v${__APP_VERSION__}`;

const renderer = new Renderer(canvas);
const logo = new Logo($<HTMLCanvasElement>('logoArt'));
const input = new Input(canvas);
const sfx = new Sfx();
window.addEventListener('resize', () => renderer.resize());
// Any first tap or key wakes the audio up, so the title music can start.
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

// ---------- State ----------

type Mode = 'title' | 'play' | 'pause' | 'dying' | 'over' | 'watch';
type RunTicket = { runId: string; seed: number; got: number; day: string | null };
let mode: Mode = 'title';
let sim = new Sim(Math.floor(Math.random() * 2 ** 31));
let bot: Bot | null = new Bot(true);
let rec = new Recorder();
let prev = { x: sim.x, y: sim.y };
let acc = 0;
let last = performance.now();
let run: RunTicket | null = null;
let nextRun: Promise<RunTicket | null> | null = null;
/** The Daily Climb date while playing one, else null. */
let daily: string | null = null;
let lastKind: 'endless' | 'daily' = 'endless';
let zoneShown = 0;
let bestAnnounced = false;
let dyingTimer = 0;
let topBoard: Board | null = null;
let dailyBoard: Board | null = null;
/** Your best Daily Climb today (or the day's #1), replayed alongside you. */
let ghost: Playback | null = null;
let ghostLabel = '';
let watch: { pb: Playback; speed: number; endTimer: number } | null = null;
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

sfx.setMusic(store.get('music') !== '0');
const musicLabel = () => (ui.music.textContent = sfx.musicOn ? 'Music on' : 'Music off');
musicLabel();
ui.music.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMusic(!sfx.musicOn);
  store.set('music', sfx.musicOn ? '1' : '0');
  musicLabel();
});

// Calm effects start on when the device asks for reduced motion.
const calmSaved = store.get('calm');
let calm = calmSaved === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : calmSaved === '1';
const applyCalm = () => {
  renderer.calm = calm;
  document.body.classList.toggle('calm', calm);
  ui.calm.textContent = calm ? 'Calm effects on' : 'Calm effects off';
};
applyCalm();
ui.calm.addEventListener('click', () => {
  calm = !calm;
  store.set('calm', calm ? '1' : '0');
  applyCalm();
  sfx.click();
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

const ticket = (daily: boolean) => startRun(daily).then((r) => ({ ...r, got: Date.now() }));

/** Ask for an endless seed ahead of time so pressing Climb starts at once. */
function prefetchRun(): void {
  nextRun = ticket(false).catch(() => null);
}

async function takeRun(): Promise<RunTicket | null> {
  let r = nextRun ? await nextRun : null;
  nextRun = null;
  // The server forgets unused seeds after 3 hours.
  if (r && Date.now() - r.got > 2 * 3600_000) r = null;
  if (!r) r = await ticket(false).catch(() => null);
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

function refreshDailyNote(): void {
  const best = dailyBest(todayUtc());
  ui.dailyNote.textContent = best ? `Your best today: ${fmt(best)}` : 'One volcano for everyone today';
}

let boardRange: Range = 'all';
async function showBoard(range: Range = boardRange): Promise<void> {
  boardRange = range;
  ui.board.classList.remove('hidden');
  ui.boardList.innerHTML = `<li class="empty">Loading…</li>`;
  ui.boardMe.textContent = '';
  for (const t of ui.board.querySelectorAll<HTMLElement>('.tab')) t.classList.toggle('active', t.dataset.range === boardRange);
  try {
    const b = await fetchBoard(boardRange, PLAYER);
    if (boardRange !== range) return;
    const watchBtn = (id: number | null) => (id ? `<button class="watch" data-id="${id}" aria-label="Watch this climb">▶</button>` : '');
    const when = boardRange === 'week' ? ' this week' : boardRange === 'daily' ? ' today' : '';
    ui.boardList.innerHTML = b.top.length
      ? b.top.map((r) => `<li><span class="n">${esc(r.name)}</span><span>${fmt(r.meters)}</span>${watchBtn(r.id)}</li>`).join('')
      : `<li class="empty">Nobody yet${when}. Go climb!</li>`;
    const dayNote = boardRange === 'daily' ? `Daily Climb ${b.day} (UTC). ` : '';
    ui.boardMe.textContent = dayNote + (b.me ? `You: #${b.me.rank} with ${fmt(b.me.meters)}` : 'You have no ranked climb here yet.');
  } catch {
    ui.boardList.innerHTML = `<li class="empty">Can't reach the board right now.</li>`;
  }
}
for (const t of ui.board.querySelectorAll<HTMLElement>('.tab')) {
  t.addEventListener('click', () => void showBoard(t.dataset.range as Range));
}
ui.boardList.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.watch');
  if (btn?.dataset.id) void watchRun(Number(btn.dataset.id));
});
for (const c of document.querySelectorAll<HTMLElement>('.close')) {
  c.addEventListener('click', () => c.closest('.panel-wrap')!.classList.add('hidden'));
}

// ---------- Screens ----------

function show(m: Mode): void {
  mode = m;
  ui.title.classList.toggle('hidden', m !== 'title');
  ui.hud.classList.toggle('hidden', m !== 'play' && m !== 'dying' && m !== 'pause' && m !== 'watch');
  ui.pause.classList.toggle('hidden', m !== 'pause');
  ui.over.classList.toggle('hidden', m !== 'over');
  ui.watchBar.classList.toggle('hidden', m !== 'watch');
  ui.pauseBtn.classList.toggle('hidden', m === 'watch');
  if (m !== 'title') ui.how.classList.add('hidden');
}

function toTitle(): void {
  sim = new Sim(Math.floor(Math.random() * 2 ** 31));
  bot = new Bot(true);
  watch = null;
  ghost = null;
  daily = null;
  prev = { x: sim.x, y: sim.y };
  renderer.snapCamera(sim.lavaY);
  ui.board.classList.add('hidden');
  show('title');
  refreshDailyNote();
  void refreshMini();
  if (!nextRun) prefetchRun();
}

function resetWorld(seed: number): void {
  sim = new Sim(seed);
  bot = null;
  watch = null;
  ghost = null;
  rec = new Recorder();
  prev = { x: sim.x, y: sim.y };
  renderer.snapCamera(sim.lavaY);
  acc = 0;
  zoneShown = 0;
}

let starting = false;
async function startGame(kind: 'endless' | 'daily' = lastKind): Promise<void> {
  if (starting) return;
  starting = true;
  sfx.unlock();
  const name = ui.name.value.trim();
  store.set('name', name);
  ui.board.classList.add('hidden');
  let r: RunTicket | null;
  if (kind === 'daily') {
    let why = '';
    r = await ticket(true).catch((e) => {
      why = String((e as Error)?.message ?? e);
      return null;
    });
    if (!r?.day) {
      starting = false;
      const msg = `Can't start the Daily Climb: the board ${why ? `said "${why}"` : "isn't answering"}. Try again in a moment.`;
      ui.dailyNote.textContent = msg;
      if (mode === 'over') ui.rank.textContent = msg;
      return;
    }
  } else r = await takeRun();
  starting = false;
  lastKind = kind;
  run = r;
  daily = kind === 'daily' ? r!.day : null;
  resetWorld(r ? r.seed : Math.floor(Math.random() * 2 ** 31));
  const best = daily ? dailyBest(daily) : localBest;
  bestAnnounced = best === 0;
  show('play');
  input.reset();
  const touch = matchMedia('(pointer: coarse)').matches;
  if (daily) banner('Daily Climb', `Same volcano for everyone today · ${daily}`);
  else banner(ZONES[0].name, touch ? 'Hold either side of the screen to steer' : 'Steer with ← → and stay ahead of the lava');
  if (touch) {
    ui.touchHint.classList.remove('hidden');
    ui.touchHint.style.animation = 'none';
    void ui.touchHint.offsetWidth;
    ui.touchHint.style.animation = '';
  }
  if (daily) void loadGhost(daily);
  if (!nextRun) prefetchRun();
}

/** Fetch today's ghost: your own best Daily Climb today, or the day's leader if you have none yet. */
async function loadGhost(day: string): Promise<void> {
  const forSim = sim;
  try {
    const b = await fetchBoard('daily', PLAYER);
    dailyBoard = b;
    if (b.day !== day) return;
    if (b.me && b.me.meters > dailyBest(day)) setDailyBest(day, b.me.meters);
    let id = b.me?.id ?? null;
    let label = 'Your best';
    if (!id && b.top[0]?.id) {
      id = b.top[0].id;
      label = b.top[0].name;
    }
    if (!id) return;
    const r = await fetchRun(id);
    if (sim !== forSim || r.day !== day || mode === 'over') return;
    const pb = new Playback(r);
    pb.advanceTo(sim.tick);
    ghost = pb;
    ghostLabel = label;
  } catch {
    /* no ghost today */
  }
}

async function watchRun(id: number): Promise<void> {
  sfx.unlock();
  ui.boardMe.textContent = 'Loading that climb…';
  let r;
  try {
    r = await fetchRun(id);
  } catch (e) {
    ui.boardMe.textContent = `Can't load that climb (${String((e as Error).message ?? e)}).`;
    return;
  }
  ui.board.classList.add('hidden');
  const pb = new Playback(r);
  resetWorld(r.seed);
  sim = pb.sim;
  prev = { x: sim.x, y: sim.y };
  watch = { pb, speed: 1, endTimer: 0 };
  ui.watchSpeed.textContent = 'Speed 1×';
  ui.watchName.textContent = `${r.name} · ${fmt(r.meters)}${r.day ? ' · Daily' : ''}`;
  show('watch');
  banner(`Watching ${r.name}`, r.day ? `Daily Climb ${r.day}` : 'Esc or Stop to leave');
}

function stopWatching(): void {
  if (mode !== 'watch') return;
  toTitle();
  void showBoard();
}
ui.watchSpeed.addEventListener('click', () => {
  if (!watch) return;
  watch.speed = watch.speed === 1 ? 2 : watch.speed === 2 ? 4 : 1;
  ui.watchSpeed.textContent = `Speed ${watch.speed}×`;
});
$('watchStop').addEventListener('click', stopWatching);

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
input.onPause = () => (mode === 'play' ? pause() : mode === 'pause' ? resume() : mode === 'watch' ? stopWatching() : undefined);
ui.pauseBtn.addEventListener('click', pause);
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
  const day = daily;
  const before = day ? dailyBest(day) : localBest;
  const isBest = meters > before;
  if (isBest) {
    if (day) setDailyBest(day, meters);
    else {
      localBest = meters;
      store.set('best', String(meters));
    }
  }
  ui.cause.textContent = (day ? 'Daily Climb · ' : '') + (CAUSES[cause] ?? 'Run over');
  ui.meters.textContent = fmt(meters);
  ui.best.textContent = isBest ? (day ? 'Your best today!' : 'New personal best!') : `Your best${day ? ' today' : ''}: ${fmt(before)}`;
  ui.best.classList.toggle('new', isBest);
  ui.rank.textContent = run ? 'Checking your climb…' : 'Offline run: not ranked.';
  ui.again.textContent = day ? 'Try today’s again' : 'Climb again';
  ghost = null;
  show('over');
  if (isBest) sfx.best();

  if (run && meters > 0) {
    const r = run;
    finishRun({ runId: r.runId, player: PLAYER, name: cleanName(ui.name.value), ticks: sim.tick, log: rec.log, meters })
      .then((res) => {
        ui.rank.textContent = res.day ? `#${res.rank} on today’s Daily Climb` : `#${res.rank} all time · #${res.weekRank} this week`;
      })
      .catch((e) => {
        ui.rank.textContent = `Couldn't rank this climb (${String(e.message ?? e)}).`;
      });
  } else if (run) {
    ui.rank.textContent = 'Climb at least 1 m to make the board.';
  }
  run = null;
}

$('playBtn').addEventListener('click', () => void startGame('endless'));
$('dailyBtn').addEventListener('click', () => void startGame('daily'));
ui.again.addEventListener('click', () => void startGame());
$('menuBtn').addEventListener('click', toTitle);
$('boardBtn').addEventListener('click', () => void showBoard());
$('oBoardBtn').addEventListener('click', () => void showBoard(lastKind === 'daily' ? 'daily' : boardRange === 'daily' ? 'all' : boardRange));
$('howBtn').addEventListener('click', () => ui.how.classList.remove('hidden'));
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') {
    if (e.code === 'Enter') void startGame('endless');
    return;
  }
  if ((e.code === 'Enter' || e.code === 'Space') && (mode === 'title' || mode === 'over')) {
    if (!ui.board.classList.contains('hidden') || !ui.how.classList.contains('hidden')) return;
    e.preventDefault();
    void startGame(mode === 'title' ? 'endless' : lastKind);
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
  if (mode === 'watch') {
    watch!.pb.step();
    return;
  }
  const i = input.read();
  rec.push(sim.tick + 1, i);
  sim.step(i);
  if (ghost) {
    ghost.step();
    ghost.sim.events.length = 0;
  }
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
  if (mode !== 'watch') {
    const best = daily ? dailyBest(daily) : localBest;
    if (daily) bits.push('Daily Climb');
    if (best && !(max > best)) bits.push(`Best ${fmt(best)}`);
    if (!run && mode === 'play') bits.push('Offline: not ranked');
    if (!bestAnnounced && max > best) {
      bestAnnounced = true;
      toast(daily ? 'Best today!' : 'New best!');
      sfx.best();
    }
  }
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
}

function markers(): Marker[] {
  if (mode === 'title') return [];
  if (mode === 'watch') {
    const r = watch!.pb.run;
    return [{ meters: r.meters, label: `${r.name} ${fmt(r.meters)}`, color: '#ffd84a' }];
  }
  const out: Marker[] = [];
  const best = daily ? dailyBest(daily) : localBest;
  const top = (daily ? dailyBoard : topBoard)?.top[0];
  if (best > 0) out.push({ meters: best, label: `Your best ${fmt(best)}`, color: '#7dfcc6' });
  if (top && top.meters !== best) out.push({ meters: top.meters, label: `#1 ${top.name} ${fmt(top.meters)}`, color: '#ffd84a' });
  return out;
}

function music(): void {
  const m = sfx.music;
  if (!m) return;
  if (mode === 'title') m.play(0);
  else if (mode === 'play' || mode === 'watch') m.play(zoneIndexAt(sim.meters));
  else m.stop(mode === 'dying' ? 1.2 : 0.4);
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play' || mode === 'title' || mode === 'watch') {
    const speed = mode === 'watch' ? watch!.speed : 1;
    acc += dt * speed;
    let n = 0;
    while (acc >= STEP && n < 8 * speed) {
      tick();
      handleEvents();
      acc -= STEP;
      n++;
      if (mode !== 'play' && mode !== 'title' && mode !== 'watch') break;
    }
    if (n === 8 * speed) acc = 0;
  } else if (mode === 'dying') {
    dyingTimer -= dt;
    if (dyingTimer <= 0) endRun(sim.cause);
  }
  if (mode === 'watch' && watch!.pb.done) {
    watch!.endTimer += dt;
    if (watch!.endTimer > 1.6) stopWatching();
  }
  if (mode === 'play' || mode === 'dying' || mode === 'pause' || mode === 'watch') updateHud();
  const alpha = mode === 'play' || mode === 'title' || mode === 'watch' ? Math.min(1, acc / STEP) : 1;

  if (ghost && !ghost.done && (mode === 'play' || mode === 'pause' || mode === 'dying')) {
    const g = ghost.sim;
    const p = ghost.prev;
    const x = Math.abs(g.x - p.x) < 200 ? p.x + (g.x - p.x) * alpha : g.x;
    renderer.ghost = { x, y: p.y + (g.y - p.y) * alpha, label: ghostLabel };
  } else renderer.ghost = null;

  renderer.draw(sim, alpha, prev, markers(), mode === 'pause' ? 0 : dt);
  // Calm effects keep Pip still on the logo.
  if (mode === 'title') logo.draw(calm ? 0.3 : now / 1000);
  music();
  if (input.padConfirm() && (mode === 'title' || mode === 'over')) void startGame(mode === 'title' ? 'endless' : lastKind);
  requestAnimationFrame(frame);
}

// Headless checks poke at this.
(window as unknown as { magmahop: unknown }).magmahop = {
  get sim() {
    return sim;
  },
  get mode() {
    return mode;
  },
  get ghost() {
    return ghost;
  },
  renderer,
  startGame,
  watchRun,
};

toTitle();
requestAnimationFrame(frame);
