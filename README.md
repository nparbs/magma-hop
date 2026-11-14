# Magma Hop

Play it at **https://magmahop.parbs.online**.

Hop out of an erupting volcano with the lava right behind you. You bounce on every ledge by yourself, and you only steer left and right. The edges wrap, the view only moves up, and the run ends if you drop into the lava or take one hit from a fire bat, a rockfall or a fire wisp. Geysers and lava bubbles carry you up the shaft, and a shell blocks one hit. Your score is the highest point you reach, and the global board keeps the best climbs.

There's also a Daily Climb (the same volcano for everyone each UTC day, with its own board, where your best try races you as a ghost), and any climb on a board can be watched back. You can pick one of five looks for your climber, each zone has its own songs, and phones can steer by tilting.

Anyone playing the same mode at the same time shows up live: beside you on the Daily Climb's shared volcano, or as a notch at their height on the wall in endless runs (everyone has their own volcano there).

Vanilla TypeScript and Canvas 2D on the page, Node and SQLite on the server. The pixel art, the sound effects and the music are all made in code.

## Run it

```sh
npm install
npm run dev        # the page on :5173
npm run server     # the board server on :8794 (the dev page forwards /api to it)
npm test           # sim, route and replay tests, board queries, song patterns
npm run shots      # headless screenshots into ./shots (needs npm run dev; URL=... to point elsewhere)
                   # scenarios: desktop zones daily skins small phone landscape (daily needs the server)
node scripts/musiccheck.mjs   # checks every screen gets its music (needs npm run dev; URL=...)
node scripts/livecheck.mjs    # two headless climbers check they see each other (needs a built page served by the server; URL=...)
npm run ship       # check, push, deploy to the VM and wait for the live site (docs/hosting.md)
```

Without the server the game still plays, but runs aren't ranked.

## Layout

| Path | What |
| --- | --- |
| `src/sim/sim.ts` | The rules: physics, the lava, level generation, hazards, rides and shells, input recording and replay. No DOM. The server runs this file. |
| `src/sim/zones.ts` | Zone heights, colors, when each feature starts, the difficulty curve, wind. |
| `src/sim/bot.ts` | A climber for the title screen and tests. It picks ledges it can still land on. |
| `src/game/` | The page: loop and screens (`main.ts`), drawing, the logo and the looks (`render.ts`), input and tilt, sound and the music player (`audio.ts`), the songs as data (`songs.ts`), board calls, `playback.ts` for watching runs and the daily ghost, `live.ts` for seeing other climbers live. |
| `server/` | HTTP server: static files, `/api/start` (`{daily: true}` for the Daily Climb), `/api/finish`, `/api/board?range=all\|week\|daily`, `/api/run?id=` (a stored run's inputs), `/api/live` (POST your recent positions, get back the others in your mode; GET for how many are climbing), `/health`. SQLite in `db.ts`; who's climbing right now is kept in memory only (`live.ts`). |
| `scripts/` | Server build, screenshots, `musiccheck.mjs`, `livecheck.mjs`, `climb.ts` bot stats, `ship.mjs`. |
| `deploy/` | The script the VM runs on each deploy (`deploy-magma-hop.sh`). |
| `docs/hosting.md` | VM, tunnel and deploy setup. |

## How the board stays honest

1. Pressing Climb asks the server for a run id and a random seed.
2. The page records only input changes (tick, -4..4) while you play.
3. At the end it sends the inputs. The server checks that enough real time has passed, replays the whole run with the same sim, and stores the height the replay reached, not the height the page claimed.

It doesn't stop a bot that plays in real time, but it stops edited scores, sped-up runs and made-up input logs.

Daily Climb seeds come from a secret the server makes on first start and keeps in the database (or `DAILY_SECRET` if set), so nobody can work out tomorrow's volcano today.

See [ROADMAP.md](ROADMAP.md) for what's planned.
