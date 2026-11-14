// Drive the game in headless Chrome and save screenshots to ./shots.
// Usage: node scripts/screenshots.mjs [scenario...]   (needs `npm run dev`; URL=... to override)
// Scenarios: desktop, phone, landscape, zones. window.magmahop exposes sim, mode, renderer, startGame.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('shots', { recursive: true });

const scenarios = process.argv.slice(2);
const want = (s) => !scenarios.length || scenarios.includes(s);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: opts.touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(1200);
  return page;
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = async (page, name) => {
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
};

/** Teleport the climber to a height (meters) to look at a zone. Only for screenshots. */
async function warp(page, meters) {
  await page.evaluate((m) => {
    const u = window.magmahop;
    const s = u.sim;
    s.generateUntil(m * 10 + 3000);
    const p = s.platforms.filter((p) => p.path && p.y >= m * 10).sort((a, b) => a.y - b.y)[0];
    s.y = p.y + 5;
    s.x = p.x;
    s.vy = 0;
    s.maxY = s.y;
    s.lavaY = s.y - 200;
    u.renderer.snapCamera(s.lavaY);
  }, meters);
}

if (want('desktop')) {
  const page = await open({ width: 1280, height: 720 });
  await wait(page, 2500);
  await shot(page, '01-title');
  await page.fill('#nameInput', 'Tester');
  await page.click('#playBtn');
  await wait(page, 1500);
  await shot(page, '02-start');
  await page.keyboard.down('ArrowRight');
  await wait(page, 700);
  await page.keyboard.up('ArrowRight');
  await wait(page, 600);
  await shot(page, '03-playing');
  await page.click('#howBtn').catch(() => {});
  await page.keyboard.press('Escape');
  await wait(page, 300);
  await shot(page, '04-pause');
  await page.click('#endBtn');
  await wait(page, 1500);
  await shot(page, '05-over');
  await page.click('#oBoardBtn');
  await wait(page, 800);
  await shot(page, '06-board');
}

if (want('zones')) {
  const page = await open({ width: 1280, height: 720 });
  await page.click('#playBtn');
  await wait(page, 800);
  for (const [m, name] of [[300, 'crystal'], [900, 'fossil'], [1500, 'ice'], [2400, 'rim'], [3500, 'ash']]) {
    await warp(page, m);
    await wait(page, 900);
    await shot(page, `z-${name}`);
  }
}

/** End the run from the pause menu, or wait out the death if it already ended. */
async function endIfPlaying(page) {
  if ((await page.evaluate(() => window.magmahop.mode)) === 'play') {
    await page.keyboard.press('Escape');
    await page.click('#endBtn');
  }
  await page.waitForFunction(() => window.magmahop.mode === 'over', null, { timeout: 5000 });
}

if (want('daily')) {
  // Needs the board server: a Daily run, then a second try with the first one as the ghost, then watching it back.
  const page = await open({ width: 1280, height: 720 });
  await page.fill('#nameInput', 'Ghosty');
  await page.click('#dailyBtn');
  await wait(page, 1200);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await wait(page, 700);
    await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await wait(page, 300);
  }
  await endIfPlaying(page);
  await wait(page, 2500);
  await shot(page, 'd1-daily-over');
  await page.click('#againBtn');
  await wait(page, 2500);
  const g = await page.evaluate(() => ({ ghost: !!window.magmahop.ghost, mode: window.magmahop.mode }));
  console.log('second daily try:', JSON.stringify(g));
  await shot(page, 'd2-daily-ghost');
  await endIfPlaying(page);
  await wait(page, 1500);
  await page.click('#oBoardBtn');
  await wait(page, 800);
  await shot(page, 'd3-daily-board');
  await page.click('#boardList .watch');
  await wait(page, 2500);
  await shot(page, 'd4-watch');
  await page.click('#watchSpeed');
  await wait(page, 1500);
  await page.click('#watchStop');
  await wait(page, 800);
  await shot(page, 'd5-back-to-board');
}

if (want('skins')) {
  // Every look on the logo, then one in play.
  const page = await open({ width: 1280, height: 720 });
  for (let i = 0; i < 5; i++) {
    await page.locator('.logo-row').screenshot({ path: `shots/k${i}-logo.png` });
    console.log('shot', `k${i}-logo`, await page.textContent('#skinName'));
    await page.click('#skinNext');
    await wait(page, 300);
  }
  await page.click('#skinNext');
  await page.click('#skinNext');
  await page.click('#playBtn');
  await wait(page, 1200);
  await shot(page, 'k5-play');
}

if (want('small')) {
  const page = await open({ width: 360, height: 640 }, { touch: true });
  await wait(page, 1200);
  await shot(page, 's1-title-360');
}

if (want('phone')) {
  const page = await open({ width: 390, height: 844 }, { touch: true });
  await wait(page, 1500);
  await shot(page, 'p1-title');
  await page.click('#playBtn');
  await wait(page, 1600);
  await shot(page, 'p2-play');
  await warp(page, 800);
  await wait(page, 900);
  await shot(page, 'p3-fossil');
}

if (want('landscape')) {
  const page = await open({ width: 640, height: 360 }, { touch: true });
  await wait(page, 1200);
  await shot(page, 'l1-title');
  await page.click('#playBtn');
  await wait(page, 1500);
  await shot(page, 'l2-play');
  await page.click('#pauseBtn');
  await page.click('#endBtn');
  await wait(page, 800);
  await shot(page, 'l3-over');
}

await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('no page errors');
