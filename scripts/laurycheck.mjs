// Laury in headless Chrome: first-time tutorials, start-of-run quips, the 500 m check-in, and the off switch.
// Usage: URL=http://localhost:8794/ node scripts/laurycheck.mjs   (the server serving a built page, for the Daily Climb)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:8794/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
let fail = 0;
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fail++;
};

async function open(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(800);
  return page;
}
const state = (page) =>
  page.evaluate(() => {
    const el = document.getElementById('laury');
    return { mode: window.magmahop.mode, show: el.classList.contains('show'), tour: el.classList.contains('tour'), text: document.getElementById('laurySr').textContent };
  });
const mode = (page) => page.evaluate(() => window.magmahop.mode);

/** Press Enter through the tutorial; returns how many lines it had. */
async function clickThrough(page) {
  const lines = new Set();
  for (let i = 0; i < 60 && (await mode(page)) === 'intro'; i++) {
    lines.add((await state(page)).text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
  }
  return lines.size;
}

async function endRun(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('#endBtn');
  await page.waitForTimeout(300);
}

// Desktop: the basics tour, then a quip, then the Daily tour, then a check-in.
{
  const page = await open({ width: 1280, height: 720 });
  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  let s = await state(page);
  check(s.mode === 'intro' && s.show && s.tour, `first Climb starts her tutorial: "${s.text}"`);
  const tick0 = await page.evaluate(() => window.magmahop.sim.tick);
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.magmahop.sim.tick)) === tick0, 'the run waits during the tutorial');
  await page.screenshot({ path: 'shots/laury-tour-desktop.png' });
  const n = await clickThrough(page);
  check((await mode(page)) === 'play' && n >= 6, `Enter steps through ${n} lines, then the run starts`);
  await endRun(page);

  await page.click('#againBtn');
  await page.waitForTimeout(1600);
  s = await state(page);
  check(s.mode === 'play' && s.show && !s.tour, `next run: a quip, no tutorial: "${s.text}"`);
  await page.screenshot({ path: 'shots/laury-quip-desktop.png' });
  await page.waitForTimeout(5000);
  s = await state(page);
  check(!s.show, `the quip goes away by itself${s.show ? `: "${s.text}"` : ''}`);

  // 500 m check-in (teleport, like the zones screenshots).
  await page.evaluate(() => {
    const s = window.magmahop.sim;
    s.nextSurge = 1e9; // no rumble on the way: her rumble line would replace the check-in
    s.generateUntil(5200 + 3000);
    const p = s.platforms.filter((p) => p.path && p.y >= 5100).sort((a, b) => a.y - b.y)[0];
    s.y = p.y + 5; s.x = p.x; s.vy = 0; s.maxY = s.y; s.lavaY = s.y - 200;
    window.magmahop.renderer.snapCamera(s.lavaY);
  });
  await page.waitForTimeout(1500);
  s = await state(page);
  check(s.show && /500/.test(s.text), `500 m check-in: "${s.text}"`);
  await page.screenshot({ path: 'shots/laury-500m-desktop.png' });
  await endRun(page);
  await page.click('#menuBtn');
  await page.waitForTimeout(300);

  await page.click('#dailyBtn');
  await page.waitForTimeout(1500);
  s = await state(page);
  check(s.mode === 'intro' && /Daily/.test(s.text), `first Daily Climb: her Daily tutorial: "${s.text}"`);
  const nd = await clickThrough(page);
  check(nd >= 4 && nd <= 6, `Daily tutorial is short (${nd} lines), no basics again`);
  await endRun(page);
  await page.click('#againBtn');
  await page.waitForTimeout(1600);
  s = await state(page);
  check(s.mode === 'play' && !s.tour, 'second Daily Climb: no tutorial');
  await endRun(page);
  await page.click('#menuBtn');

  // Laury off.
  await page.click('#lauryBtn');
  await page.click('#playBtn');
  await page.waitForTimeout(1600);
  check(!(await state(page)).show, 'Laury off: she stays home');
  await page.context().close();
}

// Phones: Skip, and how the tutorial looks at the smallest sizes.
for (const [name, vp] of [['portrait', { width: 360, height: 640 }], ['landscape', { width: 640, height: 360 }]]) {
  const page = await open(vp, true);
  await page.click('#playBtn');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `shots/laury-tour-${name}.png` });
  await page.click('#laurySkip');
  await page.waitForTimeout(300);
  check((await mode(page)) === 'play', `${name}: Skip starts the run`);
  await endRun(page);
  await page.click('#againBtn');
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `shots/laury-quip-${name}.png` });
  await page.context().close();
}

check(!errors.length, `no page errors ${errors.join(' | ')}`);
await browser.close();
process.exit(fail ? 1 : 0);
