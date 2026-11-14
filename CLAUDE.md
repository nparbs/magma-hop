# Updraft

An original endless bouncing climber (TypeScript, Canvas 2D, Vite, Node + node:sqlite). See README.md for the layout and ROADMAP.md for the plan and the owner's decisions.

## Working here

- Keep it original. It's in the endless-climber genre, but don't use other games' names, characters, art, music or levels.
- `src/sim` must stay free of the DOM, clocks and `Math.random`. Use only `+ - * /`, `Math.floor/abs/sqrt/min/max/round` and the seeded `Rng`/`hash32` in it: no `Math.sin`, `exp`, `pow`. The server replays runs with it, and trig can differ between JS engines.
- Any rule change in `src/sim` changes old replays. That's fine for the board (it stores heights), but stored input logs won't replay the same afterwards. Bump `SIM_VERSION` in `sim.ts` with every rule change: the server stores it with each run (`runs.sim`).
- Run `npm test` after changing the sim or the generator. The route test checks every route gap fits one bounce; the replay test checks page and server agree. A fall is fatal, so after generator or physics changes also run the bot stats below and check the no-hazards bot still gets well past 1 km.
- Bot stats: `npx esbuild scripts/climb.ts --bundle --platform=node --format=esm --outfile=$TEMP/climb.mjs && node $TEMP/climb.mjs`.
- Headless check: `npm run dev`, `npm run server`, then `URL=http://localhost:PORT/ npm run shots`. `window.updraft` exposes `sim`, `mode`, `renderer`, `startGame`. The `zones` scenario teleports, so the server credits those runs with only what the inputs earned (a useful anti-cheat check).
- Phone layouts: check 640x360 and 360x640 at the smallest. Nothing smaller needs to work.
- All drawing is in `src/game/render.ts` and all sound in `src/game/audio.ts`. Don't add image or audio files. The renderer draws onto a small buffer (1 art pixel = 2 world units) and scales it up by a whole number of device pixels; sprites are rows of characters at the top of the file. Draw with `r`, `disc`, `ring` and sprites, not smooth canvas paths.
- The theme is the volcano escape the owner was offered on 2026-11-14 (see ROADMAP.md). Not a notepad-doodle look.

## Hosting

One container on the Debian VM, joined to Scrap Riot's `scrap-riot_default` network so its Cloudflare Tunnel can route updraft.parbs.online to `updraft:8794`. Same setup as Permafrost, Crunch Rally and the others. Keep LAN addresses and secrets out of the repo: `.deploy.local.json` is git-ignored. Ship with `npm run ship`, only when asked.
