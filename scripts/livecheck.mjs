// Two climbers in headless Chrome, to check they see each other live.
// Usage: URL=http://localhost:8794/ node scripts/livecheck.mjs   (needs the board server serving a built page)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:8794/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
let fail = 0;

async function climber(name, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  // Laury's first-time tutorial holds the run, so mark it seen.
  await page.evaluate(() => {
    localStorage.setItem('magmahop.seen.basics', '1');
    localStorage.setItem('magmahop.seen.daily', '1');
  });
  await page.waitForTimeout(800);
  await page.fill('#nameInput', name);
  return page;
}
const rivals = (page) => page.evaluate(() => window.magmahop.renderer.rivals.map((r) => ({ name: r.name, inWorld: r.inWorld, y: Math.round(r.y) })));
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fail++;
};

for (const kind of ['daily', 'endless']) {
  const a = await climber('Ann', { width: 1280, height: 720 });
  const b = await climber('Bo', { width: 640, height: 360 });
  const btn = kind === 'daily' ? '#dailyBtn' : '#playBtn';
  await a.click(btn);
  await b.click(btn);
  await b.keyboard.down('ArrowRight');
  await a.waitForTimeout(2500);
  const ra = await rivals(a);
  const rb = await rivals(b);
  check(ra.length === 1 && ra[0].name === 'Bo' && ra[0].inWorld === (kind === 'daily'), `${kind}: Ann sees Bo ${JSON.stringify(ra)}`);
  check(rb.length === 1 && rb[0].name === 'Ann', `${kind}: Bo sees Ann ${JSON.stringify(rb)}`);
  await a.screenshot({ path: `shots/live-${kind}-desktop.png` });
  await b.screenshot({ path: `shots/live-${kind}-landscape.png` });
  // Bo pauses: still shown. Bo ends the run: gone.
  await b.keyboard.up('ArrowRight');
  await b.keyboard.press('Escape');
  await a.waitForTimeout(1500);
  check((await rivals(a)).length === 1, `${kind}: a paused climber stays`);
  await b.click('#endBtn');
  await a.waitForTimeout(1500);
  check((await rivals(a)).length === 0, `${kind}: a finished climber goes`);
  await a.context().close();
  await b.context().close();
}

// Others off: you neither see nor are seen.
const a = await climber('Ann', { width: 1280, height: 720 });
const b = await climber('Bo', { width: 1280, height: 720 });
await b.click('#liveBtn');
await a.click('#dailyBtn');
await b.click('#dailyBtn');
await a.waitForTimeout(2000);
check((await rivals(a)).length === 0 && (await rivals(b)).length === 0, 'Others off hides both ways');
await b.click('#liveBtn').catch(() => {});

check(!errors.length, `no page errors ${errors.join(' | ')}`);
await browser.close();
process.exit(fail ? 1 : 0);
