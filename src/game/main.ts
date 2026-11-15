import '@fontsource/jersey-15/latin-400.css';
import './style.css';

import { Kind, PickupKind, Recorder, Sim, TICK_RATE, UNITS_PER_METER } from '../sim/sim';
import { Bot } from '../sim/bot';
import { ZONES } from '../sim/zones';
import { cleanName } from '../sim/names';
import { LauryArt, Logo, Renderer, SKINS, skinAt, type Marker } from './render';
import { Input } from './input';
import { Sfx } from './audio';
import { Playback } from './playback';
import { fetchBoard, fetchRun, finishRun, startRun, type Board, type Range } from './net';
import { LiveClimbers, liveCounts } from './live';
import { Laury } from './laury';
import { AFTER, CHECK_IN, DAILY_START, MILESTONE, NEAR_MISS, RUMBLE, START, SUMMIT, SURGE_SURVIVED, basicsTour, dailyTour, pick } from './laury-lines';
import { causeLine } from './cause-text';

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
/** Today's fastest summit time in ticks, or 0 if the summit hasn't been reached today. */
function dailyTime(day: string): number {
  try {
    const d = JSON.parse(store.get('dailyBest') ?? 'null');
    return d && d.day === day ? Number(d.ticks) || 0 : 0;
  } catch {
    return 0;
  }
}
function setDailyBest(day: string, meters: number, ticks = 0): void {
  store.set('dailyBest', JSON.stringify({ day, meters, ticks }));
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
  pauseTilt: $('pauseTilt'),
  skinName: $('skinName'),
  live: $('liveBtn'),
  pauseLive: $('pauseLive'),
  liveNote: $('liveNote'),
};
$('ver').textContent = `v${__APP_VERSION__}`;

const renderer = new Renderer(canvas);
const logo = new Logo($<HTMLCanvasElement>('logoArt'));
const input = new Input(canvas);
const sfx = new Sfx();
/** Laury and her bubble stay beside the shaft when there's room for them there. */
function fitLaury(): void {
  const room = renderer.gutter - 20;
  document.documentElement.style.setProperty('--laury-max', room >= 300 ? `${Math.min(500, room)}px` : 'min(500px, calc(100vw - 20px))');
}
fitLaury();
window.addEventListener('resize', () => {
  renderer.resize();
  fitLaury();
});
// Any first tap or key wakes the audio up, so the title music can start.
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

// ---------- State ----------

/** `intro`: a run that waits while Laury gives the first-time tutorial. */
type Mode = 'title' | 'intro' | 'play' | 'pause' | 'dying' | 'over' | 'watch';
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
/** Laury's eruption quips: rumbles this run, the last surge phase seen, and the lava near-miss state. */
let rumbles = 0;
let lastSurge = 'none';
let nearLava = false;
let lastNearMiss = -1e9;
let topBoard: Board | null = null;
let dailyBoard: Board | null = null;
/** Your best Daily Climb today (or the day's #1), replayed alongside you. */
let ghost: Playback | null = null;
let ghostLabel = '';
let watch: { pb: Playback; speed: number; endTimer: number } | null = null;
renderer.snapCamera(sim.lavaY);

ui.name.value = store.get('name') ?? '';
ui.name.addEventListener('change', () => store.set('name', ui.name.value.trim()));

/** A settings switch: lit in fire when on, burnt-out ash when off. */
function setToggle(b: HTMLElement, on: boolean, label: string): void {
  b.textContent = label;
  b.classList.add('toggle');
  b.classList.toggle('on', on);
  b.classList.toggle('off', !on);
}

sfx.setMuted(store.get('muted') === '1');
const soundLabel = () => setToggle(ui.sound, !sfx.muted, sfx.muted ? 'Sound off' : 'Sound on');
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
const musicLabel = () => setToggle(ui.music, sfx.musicOn, sfx.musicOn ? 'Music on' : 'Music off');
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
  setToggle(ui.calm, calm, calm ? 'Calm effects on' : 'Calm effects off');
};
applyCalm();
ui.calm.addEventListener('click', () => {
  calm = !calm;
  store.set('calm', calm ? '1' : '0');
  applyCalm();
  sfx.click();
});

// The climber's look. Cosmetic: it's sent with a run only so replays show it.
let skinIdx = Math.max(0, Math.min(SKINS.length - 1, Math.floor(Number(store.get('skin') ?? 0)) || 0));
function applySkin(i = skinIdx): void {
  const s = skinAt(i);
  renderer.skin = s;
  logo.skin = s;
  ui.skinName.textContent = s.name;
}
applySkin();
for (const [id, d] of [['skinPrev', -1], ['skinNext', 1]] as const) {
  $(id).addEventListener('click', () => {
    skinIdx = (skinIdx + d + SKINS.length) % SKINS.length;
    store.set('skin', String(skinIdx));
    applySkin();
    sfx.unlock();
    sfx.click();
  });
}

// Tilt to steer, on phones and tablets. The switch is on the title screen and in the pause menu.
// iPhones only allow it after asking, from a tap.
if ('ontouchstart' in window && 'DeviceOrientationEvent' in window) {
  const label = () => {
    for (const b of [ui.tilt, ui.pauseTilt]) setToggle(b, input.tiltOn, input.tiltOn ? 'Tilt on' : 'Tilt off');
  };
  for (const b of [ui.tilt, ui.pauseTilt]) {
    b.classList.remove('hidden');
    b.addEventListener('click', async () => {
      if (input.tiltOn) input.tiltOn = false;
      else if (!(await input.enableTilt())) {
        setToggle(b, false, 'Tilt not allowed');
        return;
      }
      store.set('tilt', input.tiltOn ? '1' : '0');
      label();
    });
  }
  // Android turns it straight back on; iPhones need the tap again, so the label stays honest.
  if (store.get('tilt') === '1') void input.enableTilt().then(label);
  label();
}

// Seeing other players climbing the same mode right now. Off hides them and hides you from them.
const live = new LiveClimbers();
let liveOn = store.get('live') !== '0';
const liveLabel = () => {
  for (const b of [ui.live, ui.pauseLive]) setToggle(b, liveOn, liveOn ? 'Others on' : 'Others off');
};
liveLabel();
for (const b of [ui.live, ui.pauseLive]) {
  b.addEventListener('click', () => {
    liveOn = !liveOn;
    store.set('live', liveOn ? '1' : '0');
    liveLabel();
    sfx.click();
    if (!liveOn) live.leave();
    else if (run && (mode === 'play' || mode === 'pause')) live.begin(run.runId);
    void refreshLiveNote();
  });
}

/** On the title screen: how many are climbing right now. */
async function refreshLiveNote(): Promise<void> {
  const n = liveOn ? await liveCounts() : null;
  const bits: string[] = [];
  if (n?.endless) bits.push(`${n.endless} climbing now`);
  if (n?.daily) bits.push(`${n.daily} on the Daily Climb`);
  ui.liveNote.textContent = bits.join(' · ');
  ui.liveNote.classList.toggle('hidden', !bits.length);
}
setInterval(() => {
  if (mode === 'title' && !document.hidden) void refreshLiveNote();
}, 10_000);

// Laury: a first-time tutorial per mode, a joke at the start of later runs, check-ins every 500 m.
const laury = new Laury(
  $('laury'),
  new LauryArt($<HTMLCanvasElement>('lauryArt')),
  $('lauryText'),
  $('laurySr'),
  $<HTMLButtonElement>('lauryNext'),
  $<HTMLButtonElement>('laurySkip'),
);
let lauryOn = store.get('laury') !== '0';
const lauryLabel = () => {
  for (const id of ['lauryBtn', 'pauseLaury']) setToggle($(id), lauryOn, lauryOn ? 'Laury on' : 'Laury off');
};
lauryLabel();
for (const id of ['lauryBtn', 'pauseLaury']) {
  $(id).addEventListener('click', () => {
    lauryOn = !lauryOn;
    store.set('laury', lauryOn ? '1' : '0');
    lauryLabel();
    sfx.click();
    if (!lauryOn) laury.finish();
  });
}
$('lauryAgain').addEventListener('click', (e) => {
  store.set('seen.basics', '0');
  store.set('seen.daily', '0');
  lauryOn = true;
  store.set('laury', '1');
  lauryLabel();
  (e.target as HTMLElement).textContent = "She'll be there next run";
  sfx.click();
});
let lauryRecent: string[] = [];
try {
  lauryRecent = JSON.parse(store.get('lauryRecent') ?? '[]');
  if (!Array.isArray(lauryRecent)) lauryRecent = [];
} catch {
  /* start fresh */
}
/** A line she hasn't said lately. */
function lauryPick(list: string[]): string {
  const l = pick(list, lauryRecent);
  lauryRecent = [l, ...lauryRecent.filter((x) => x !== l)].slice(0, 12);
  store.set('lauryRecent', JSON.stringify(lauryRecent));
  return l;
}
function startLine(kind: 'endless' | 'daily'): string {
  const after = AFTER[store.get('lastCause') ?? ''];
  if (after && Math.random() < 0.35) return lauryPick(after);
  return lauryPick(kind === 'daily' ? [...DAILY_START, ...START] : START);
}
/** The next 500 m mark where she might check in. */
let nextCheckIn = 500;

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
/** Ticks as m:ss.s, e.g. 3:07.4. */
const fmtTime = (ticks: number) => {
  const tenths = Math.floor((ticks * 10) / TICK_RATE);
  const sec = Math.floor(tenths / 10);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}.${tenths % 10}`;
};
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
  const time = dailyTime(todayUtc());
  ui.dailyNote.textContent = time ? `Your fastest today: ${fmtTime(time)}` : best ? `Your best today: ${fmt(best)}` : 'One volcano for everyone today';
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
      ? b.top.map((r) => `<li><span class="n">${esc(r.name)}</span><span>${r.cause === 'summit' && r.ticks ? `Summit ${fmtTime(r.ticks)}` : fmt(r.meters)}</span>${watchBtn(r.id)}</li>`).join('')
      : `<li class="empty">Nobody yet${when}. Go climb!</li>`;
    const dayNote = boardRange === 'daily' ? `Daily Climb ${b.day} (UTC). ` : '';
    ui.boardMe.textContent = dayNote + (b.me ? `You: #${b.me.rank} with ${b.me.cause === 'summit' && b.me.ticks ? `a ${fmtTime(b.me.ticks)} summit` : fmt(b.me.meters)}` : 'You have no ranked climb here yet.');
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
  ui.hud.classList.toggle('hidden', m !== 'play' && m !== 'dying' && m !== 'pause' && m !== 'watch' && m !== 'intro');
  ui.pause.classList.toggle('hidden', m !== 'pause');
  ui.over.classList.toggle('hidden', m !== 'over');
  ui.watchBar.classList.toggle('hidden', m !== 'watch');
  ui.pauseBtn.classList.toggle('hidden', m === 'watch' || m === 'intro');
  if (m !== 'title') ui.how.classList.add('hidden');
}

function toTitle(): void {
  sim = new Sim(Math.floor(Math.random() * 2 ** 31));
  bot = new Bot(true);
  watch = null;
  ghost = null;
  daily = null;
  live.leave();
  laury.finish();
  prev = { x: sim.x, y: sim.y };
  renderer.snapCamera(sim.lavaY);
  ui.board.classList.add('hidden');
  applySkin();
  show('title');
  refreshDailyNote();
  void refreshMini();
  void refreshLiveNote();
  if (!nextRun) prefetchRun();
}

function resetWorld(seed: number): void {
  sim = new Sim(seed, { daily: daily !== null });
  bot = null;
  watch = null;
  ghost = null;
  live.leave();
  laury.finish();
  nextCheckIn = 500;
  rumbles = 0;
  lastSurge = 'none';
  nearLava = false;
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
  if (liveOn && r) live.begin(r.runId);
  const best = daily ? dailyBest(daily) : localBest;
  bestAnnounced = best === 0;
  input.reset();
  const touch = matchMedia('(pointer: coarse)').matches;
  const kickoff = (quip: boolean) => {
    show('play');
    if (daily) banner('Daily Climb', `Same volcano for everyone today · ${daily}`);
    else banner(ZONES[0].name, touch ? 'Hold either side of the screen to steer' : 'Steer with ← → and stay ahead of the lava');
    if (touch) {
      ui.touchHint.classList.remove('hidden');
      ui.touchHint.style.animation = 'none';
      void ui.touchHint.offsetWidth;
      ui.touchHint.style.animation = '';
    }
    if (quip && lauryOn) {
      const forSim = sim;
      window.setTimeout(() => {
        if (sim === forSim && mode === 'play' && lauryOn) laury.say(startLine(kind));
      }, 500);
    }
  };
  // First time in this mode: Laury shows you around while the run waits.
  const tour: string[] = [];
  if (lauryOn && store.get('seen.basics') !== '1') tour.push(...basicsTour(touch));
  if (lauryOn && kind === 'daily' && store.get('seen.daily') !== '1') tour.push(...dailyTour(liveOn));
  if (tour.length) {
    const forSim = sim;
    show('intro');
    void laury.tour(tour).then(() => {
      store.set('seen.basics', '1');
      if (kind === 'daily') store.set('seen.daily', '1');
      if (sim !== forSim || mode !== 'intro') return;
      last = performance.now();
      acc = 0;
      input.reset();
      kickoff(false);
    });
  } else kickoff(true);
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
  applySkin(r.skin ?? 0);
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
input.onPause = () => (mode === 'intro' ? laury.finish() : mode === 'play' ? pause() : mode === 'pause' ? resume() : mode === 'watch' ? stopWatching() : undefined);
ui.pauseBtn.addEventListener('click', pause);
// During the tutorial a tap anywhere moves her along.
canvas.addEventListener('pointerdown', () => {
  if (mode === 'intro') laury.next();
});
$('resumeBtn').addEventListener('click', resume);
$('endBtn').addEventListener('click', () => endRun('quit'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function endRun(cause: string): void {
  if (mode !== 'play' && mode !== 'pause' && mode !== 'dying') return;
  const meters = sim.meters;
  const day = daily;
  const before = day ? dailyBest(day) : localBest;
  const won = sim.won && cause === 'summit';
  // A Daily win is ranked by time, so the best is the fastest summit, not the height.
  const timeBefore = day ? dailyTime(day) : 0;
  const isBest = won ? timeBefore === 0 || sim.tick < timeBefore : meters > before;
  if (isBest) {
    if (day) setDailyBest(day, Math.max(meters, before), won ? sim.tick : timeBefore);
    else {
      localBest = meters;
      store.set('best', String(meters));
    }
  }
  ui.cause.textContent = (day ? 'Daily Climb · ' : '') + (won ? 'Summit!' : causeLine(cause, meters));
  ui.meters.textContent = won ? fmtTime(sim.tick) : fmt(meters);
  ui.best.textContent = won
    ? isBest ? 'Your fastest today!' : `Your fastest today: ${fmtTime(timeBefore)}`
    : isBest ? (day ? 'Your best today!' : 'New personal best!') : `Your best${day ? ' today' : ''}: ${timeBefore ? `Summit ${fmtTime(timeBefore)}` : fmt(before)}`;
  ui.best.classList.toggle('new', isBest);
  ui.rank.textContent = run ? 'Checking your climb…' : 'Offline run: not ranked.';
  ui.again.textContent = day ? 'Try today’s again' : 'Climb again';
  ghost = null;
  live.leave();
  laury.finish();
  store.set('lastCause', cause);
  show('over');
  if (isBest && !won) sfx.best();
  if (won && lauryOn) laury.say(lauryPick(SUMMIT));

  if (run && meters > 0) {
    const r = run;
    finishRun({ runId: r.runId, player: PLAYER, name: cleanName(ui.name.value), ticks: sim.tick, log: rec.log, meters, skin: skinIdx })
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
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'intro') {
    e.preventDefault();
    if (!e.repeat) laury.next();
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
    else if (e.t === 'rumble') {
      sfx.rumble();
      if (mode === 'play' && lauryOn && (rumbles++ === 0 || Math.random() < 1 / 3)) laury.say(lauryPick(RUMBLE));
    } else if (e.t === 'surge') sfx.surge();
    else if (e.t === 'melt') sfx.melt();
    else if (e.t === 'summit') sfx.fanfare();
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
  live.sample(sim.tick, sim.x, sim.y);
  if (ghost) {
    ghost.step();
    ghost.sim.events.length = 0;
  }
  if (sim.dead) {
    mode = 'dying';
    dyingTimer = sim.won ? 2.8 : 1.3;
  } else if (sim.tick >= MAX_TICKS) endRun('quit');
}

function updateHud(): void {
  ui.height.textContent = sim.summit > 0 ? `${sim.meters.toLocaleString('en-US')} / ${fmt(sim.summit)}` : fmt(sim.meters);
  const now = sim.heightNow;
  const max = sim.meters;
  const bits: string[] = [];
  if (sim.shield) bits.push('Shell');
  if (mode !== 'watch') {
    const best = daily ? dailyBest(daily) : localBest;
    if (daily) bits.push('Daily Climb');
    if (best && !(max > best)) bits.push(`Best ${fmt(best)}`);
    if (!run && mode === 'play') bits.push('Offline: not ranked');
    if (live.count) bits.push(`${live.count} climbing with you`);
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

  // Laury checks in at 500 m marks: always at the first two, then now and then.
  if (mode === 'play' && max >= nextCheckIn) {
    let mark = 0;
    while (max >= nextCheckIn) {
      mark = nextCheckIn;
      nextCheckIn += 500;
    }
    if (lauryOn && (mark <= 1000 || Math.random() < 0.5)) laury.say(MILESTONE[mark] ?? lauryPick(CHECK_IN).replace('{h}', fmt(mark)));
  }

  if (mode === 'play' && !sim.dead) {
    // Laury on eruptions: a surge survived, and a close brush with the lava.
    if (lastSurge !== 'none' && sim.surge === 'none' && lauryOn && Math.random() < 0.5) laury.say(lauryPick(SURGE_SURVIVED));
    lastSurge = sim.surge;
    const gap = (sim.y - sim.lavaY) / UNITS_PER_METER;
    if (gap < 3) nearLava = true;
    else if (nearLava && gap >= 10) {
      nearLava = false;
      const t = performance.now();
      if (t - lastNearMiss >= 20000 && lauryOn) {
        lastNearMiss = t;
        laury.say(lauryPick(NEAR_MISS));
      }
    }
  }

  const z = sim.zoneAt(max);
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

/** Every screen has its music; changing screen or zone crossfades. Pausing muffles what's playing. */
function music(): void {
  const m = sfx.music;
  if (!m) return;
  m.duck(mode === 'pause');
  m.pulse = mode === 'play' && sim.surge !== 'none';
  if (mode === 'title') m.play('title');
  else if (mode === 'play' || mode === 'watch' || mode === 'intro') m.play(`zone${sim.zoneAt(sim.meters)}`);
  else if (mode === 'dying' || mode === 'over') m.play(sim.won ? 'summit' : 'over');
}

let padHeld = false;
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
  if (mode === 'play' || mode === 'dying' || mode === 'pause' || mode === 'watch' || mode === 'intro') updateHud();
  laury.update(mode === 'pause' ? 0 : dt, calm);
  const alpha = mode === 'play' || mode === 'title' || mode === 'watch' ? Math.min(1, acc / STEP) : 1;

  if (ghost && !ghost.done && (mode === 'play' || mode === 'pause' || mode === 'dying')) {
    const g = ghost.sim;
    const p = ghost.prev;
    const x = Math.abs(g.x - p.x) < 200 ? p.x + (g.x - p.x) * alpha : g.x;
    renderer.ghost = { x, y: p.y + (g.y - p.y) * alpha, label: ghostLabel };
  } else renderer.ghost = null;

  if (mode === 'play' || mode === 'pause' || mode === 'dying' || mode === 'intro') {
    live.pump(now, { name: cleanName(ui.name.value), skin: skinIdx, meters: Math.floor(sim.meters) });
    const inWorld = daily !== null;
    renderer.rivals = live.rivals(now, mode === 'pause' ? 0 : dt).map((r) => ({ ...r, inWorld }));
  } else renderer.rivals = [];

  renderer.draw(sim, alpha, prev, markers(), mode === 'pause' ? 0 : dt);
  // Calm effects keep Pip still on the logo.
  if (mode === 'title') logo.draw(calm ? 0.3 : now / 1000);
  music();
  // Gamepad: a fresh press moves Laury along; holding it doesn't skip her whole tutorial.
  const pad = input.padConfirm();
  if (mode === 'intro') {
    if (pad && !padHeld) laury.next();
  } else if (pad && (mode === 'title' || mode === 'over')) void startGame(mode === 'title' ? 'endless' : lastKind);
  padHeld = pad;
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
  laury,
  get live() {
    return live;
  },
  get music() {
    return sfx.music?.state ?? null;
  },
  renderer,
  startGame,
  watchRun,
};

toTitle();
requestAnimationFrame(frame);
