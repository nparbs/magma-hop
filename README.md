# Magma Hop

Play it at **https://magmahop.parbs.online**.

Hop out of an erupting volcano with the lava right behind you. You bounce on every ledge by yourself, and you only steer left and right. The edges wrap, the view only moves up, and the run ends if you drop into the lava or take one hit from a fire bat, a rockfall or a fire wisp. Geysers and lava bubbles carry you up the shaft, and a shell blocks one hit. Your score is the highest point you reach, and the global board keeps the best climbs.

There's also a Daily Climb (the same volcano for everyone each UTC day, with its own board, where your best try races you as a ghost), and any climb on a board can be watched back.

Vanilla TypeScript and Canvas 2D on the page, Node and SQLite on the server. The pixel art, the sound effects and the music are all made in code.

## Run it

```sh
npm install
npm run dev        # the page on :5173
npm run server     # the board server on :8794 (the dev page forwards /api to it)
npm test           # sim, route and replay tests, board queries
npm run shots      # headless screenshots into ./shots (needs npm run dev; URL=... to point elsewhere)
                   # scenarios: desktop zones daily small phone landscape (daily needs the server)
```

Without the server the game still plays, but runs aren't ranked.

## Layout

| Path | What |
| --- | --- |
| `src/sim/sim.ts` | The rules: physics, the lava, level generation, hazards, rides and shells, input recording and replay. No DOM. The server runs this file. |
| `src/sim/zones.ts` | Zone heights, colors, when each feature starts, the difficulty curve, wind. |
| `src/sim/bot.ts` | A climber for the title screen and tests. It picks ledges it can still land on. |
| `src/game/` | The page: loop and screens (`main.ts`), drawing (`render.ts`), input, sound and music (`audio.ts`), board calls, `playback.ts` for watching runs and the daily ghost. |
| `server/` | HTTP server: static files, `/api/start` (`{daily: true}` for the Daily Climb), `/api/finish`, `/api/board?range=all\|week\|daily`, `/api/run?id=` (a stored run's inputs), `/health`. SQLite in `db.ts`. |
| `scripts/` | Server build, screenshots, `climb.ts` bot stats, `ship.mjs`. |
| `docs/hosting.md` | VM, tunnel and deploy setup. |

## How the board stays honest

1. Pressing Climb asks the server for a run id and a random seed.
2. The page records only input changes (tick, -4..4) while you play.
3. At the end it sends the inputs. The server checks that enough real time has passed, replays the whole run with the same sim, and stores the height the replay reached, not the height the page claimed.

It doesn't stop a bot that plays in real time, but it stops edited scores, sped-up runs and made-up input logs.

Daily Climb seeds come from a secret the server makes on first start and keeps in the database (or `DAILY_SECRET` if set), so nobody can work out tomorrow's volcano today.

See [ROADMAP.md](ROADMAP.md) for what's planned.
