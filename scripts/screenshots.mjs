// Drive the game in headless Chrome and save screenshots to ./shots.
// Usage: node scripts/screenshots.mjs [scenario...]   (needs `npm run dev`; URL=... to override)
// Scenarios: desktop, phone, landscape, zones. window.updraft exposes sim, mode, renderer, startGame.
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
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 1 });
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
    const u = window.updraft;
    const s = u.sim;
    s.generateUntil(m * 10 + 3000);
    const p = s.platforms.filter((p) => p.path && p.y >= m * 10).sort((a, b) => a.y - b.y)[0];
    s.y = p.y + 5;
    s.x = p.x;
    s.vy = 0;
    s.maxY = s.y;
    u.renderer.snapCamera(s.y);
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
  for (const [m, name] of [[300, 'cloud'], [900, 'storm'], [1500, 'glacier'], [2400, 'orbit'], [3500, 'void']]) {
    await warp(page, m);
    await wait(page, 900);
    await shot(page, `z-${name}`);
  }
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
  await shot(page, 'p3-storm');
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
