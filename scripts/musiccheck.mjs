// Walks the screens in headless Chrome and prints what the music is doing at each step.
// Usage: node scripts/musiccheck.mjs   (needs `npm run dev`; URL=... to override)
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);
// Laury's first-time tutorial holds the run, so mark it seen.
await page.evaluate(() => {
  localStorage.setItem('magmahop.seen.basics', '1');
  localStorage.setItem('magmahop.seen.daily', '1');
});
await page.waitForTimeout(800);

const music = () => page.evaluate(() => window.magmahop.music);
const log = async (label) => console.log(label.padEnd(24), JSON.stringify(await music()));
const fails = [];
const expectCue = async (label, cue, ducked = false) => {
  const m = await music();
  await log(label);
  if (!m || m.cue !== cue || m.ducked !== ducked) fails.push(`${label}: wanted ${cue}${ducked ? ' (muffled)' : ''}, got ${JSON.stringify(m)}`);
};

await page.click('#skinNext'); // any tap wakes the audio up
await page.waitForTimeout(500);
await expectCue('title', 'title');
await page.click('#playBtn');
await page.waitForTimeout(1500);
await expectCue('playing', 'zone0');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await expectCue('paused', 'zone0', true);
await page.click('#resumeBtn');
await page.waitForTimeout(400);
await expectCue('resumed', 'zone0');
// Jump up into the Crystal Caves: the zone's music should take over.
await page.evaluate(() => {
  const s = window.magmahop.sim;
  s.generateUntil(3200 + 3000);
  const p = s.platforms.filter((q) => q.path && q.y >= 3200).sort((a, b) => a.y - b.y)[0];
  s.y = p.y + 5;
  s.x = p.x;
  s.vy = 0;
  s.maxY = s.y;
  s.lavaY = s.y - 200;
  window.magmahop.renderer.snapCamera(s.lavaY);
});
await page.waitForTimeout(600);
await expectCue('crystal caves', 'zone1');
await page.keyboard.press('Escape');
await page.click('#endBtn');
await page.waitForTimeout(800);
await expectCue('run over', 'over');
await page.click('#menuBtn');
await page.waitForTimeout(500);
await expectCue('back to title', 'title');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) {
  console.log('\nFAILED:\n' + fails.join('\n'));
  process.exit(1);
}
console.log('\nmusic follows every screen');
