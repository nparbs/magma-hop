# Magma Hop

Magma Hop (called Updraft until 2026-11-14; the owner picked the new name) is an original endless bouncing climber (TypeScript, Canvas 2D, Vite, Node + node:sqlite). See README.md for the layout and ROADMAP.md for the plan and the owner's decisions.

## Working here

- Keep it original. It's in the endless-climber genre, but don't use other games' names, characters, art, music or levels.
- `src/sim` must stay free of the DOM, clocks and `Math.random`. Use only `+ - * /`, `Math.floor/abs/sqrt/min/max/round` and the seeded `Rng`/`hash32` in it: no `Math.sin`, `exp`, `pow`. The server replays runs with it, and trig can differ between JS engines.
- Any rule change in `src/sim` changes old replays. That's fine for the board (it stores heights), but stored input logs won't replay the same afterwards. Bump `SIM_VERSION` in `sim.ts` with every rule change: the server stores it with each run (`runs.sim`).
- There must always be a way up (owner's rule): route ledges are only Normal, Ice or Crust (the owner left the Crust choice to Claude on 2026-11-14; it is allowed because the first landing is always solid and it re-forms), never Crumble or Fake, and every ledge has a route ledge within one hop above it. Keep that when adding ledge types.
- Run `npm test` after changing the sim or the generator. The route test checks every route gap fits one bounce; the replay test checks page and server agree. A fall is fatal, so after generator or physics changes also run the bot stats below and check the no-hazards bot still gets well past 1 km.
- Bot stats: `npx esbuild scripts/climb.ts --bundle --platform=node --format=esm --outfile=$TEMP/climb.mjs && node $TEMP/climb.mjs`.
- Headless check: `npm run dev`, `npm run server`, then `URL=http://localhost:PORT/ npm run shots`. `window.magmahop` exposes `sim`, `mode`, `ghost`, `live`, `music`, `renderer`, `startGame`, `watchRun`. Scenarios: desktop zones daily skins small phone landscape. The `zones` scenario teleports, so the server credits those runs with only what the inputs earned (a useful anti-cheat check).
- Live climbers (`src/game/live.ts`, `server/live.ts`) are display only: positions are never trusted for anything on the board. Check with `node scripts/livecheck.mjs` against the server serving a built page (`npm run build`, then `npm run server`, `URL=http://localhost:8794/`).
- Ash (tutorial guide; the owner renamed her from Laury on 2026-11-15, and code names like `laury.ts`, `#laury` and the `laury` store key keep the old name so saved settings carry over): players see "Ash" only. She's meant to be rare during runs (`lauryChat` in `main.ts`). Her lines are data in `src/game/laury-lines.ts` (keep them short, original and clean), the controller is `laury.ts`, the sprite is `LauryArt` in `render.ts`. Check with `node scripts/laurycheck.mjs` (same setup as livecheck).
- Phone layouts: check 640x360 and 360x640 at the smallest. Nothing smaller needs to work.
- Music is data in `src/game/songs.ts` (pattern strings, see the top of that file), played by `Music` in `audio.ts`. `npm test` checks the patterns; `node scripts/musiccheck.mjs` (with the dev page up, `URL=`) checks every screen gets its music.
- Looks (skins) are `SKINS` in `render.ts`: a palette for the ember sprite plus one finishing touch. Cosmetic only, never in `src/sim`.
- All drawing is in `src/game/render.ts` and all sound in `src/game/audio.ts`. Don't add image or audio files. The renderer draws onto a small buffer (1 art pixel = 2 world units) and scales it up by a whole number of device pixels; sprites are rows of characters at the top of the file. Draw with `r`, `disc`, `ring` and sprites, not smooth canvas paths.
- The theme is the volcano escape the owner was offered on 2026-11-14 (see ROADMAP.md). Not a notepad-doodle look. The title logo is drawn by `drawLogo` in `render.ts`, in the same pixel style; the favicon is the inline SVG in `index.html`.
- Edit files with the editor tools, not PowerShell `Get-Content`/`Set-Content`: Windows PowerShell 5.1 reads these UTF-8 files as ANSI and garbles characters like ▶ and ❚❚.

## Hosting

One container on the Debian VM, joined to Scrap Riot's `scrap-riot_default` network so its Cloudflare Tunnel can route magmahop.parbs.online to `magmahop:8794`. The repo is public (github.com/nparbs/magma-hop) and the VM clones it to `~/magma-hop`. Same setup as Permafrost, Crunch Rally and the others. Keep LAN addresses and secrets out of the repo: `.deploy.local.json` is git-ignored. Ship with `npm run ship`, only when asked.
