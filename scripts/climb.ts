// Bot climbs for stats: npx esbuild scripts/climb.ts --bundle --platform=node --format=esm --outfile=$TEMP/climb.mjs && node $TEMP/climb.mjs
import { Sim } from '../src/sim/sim';
import { Bot } from '../src/sim/bot';
for (const careful of [false, true]) {
  const out: string[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new Sim(seed);
    const bot = new Bot(careful);
    while (sim.tick < 60 * 60 * 20 && !sim.dead) { const i = bot.think(sim); sim.events.length = 0; sim.step(i); }
    out.push(`${sim.meters}m ${sim.cause || 'alive'} ${(sim.tick / 3600).toFixed(1)}min`);
  }
  console.log(careful ? 'careful' : 'plain', '\n ' + out.join('\n '));
}
