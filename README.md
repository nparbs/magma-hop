# Updraft

Bounce out of an erupting volcano with the lava right behind you. You bounce on every ledge by yourself, and you only steer left and right. The edges wrap, the view only moves up, and the run ends if you drop into the lava or take one hit from a fire bat, a rockfall or a fire wisp. Geysers and lava bubbles carry you up the shaft, and a shell blocks one hit. Your score is the highest point you reach, and the global board keeps the best climbs.

Vanilla TypeScript and Canvas 2D on the page, Node and SQLite on the server. The pixel art and the sound are all made in code.

## Run it

```sh
npm install
npm run dev        # the page on :5173
npm run server     # the board server on :8794 (the dev page forwards /api to it)
npm test           # sim, route and replay tests, board queries
npm run shots      # headless screenshots into ./shots (needs npm run dev; URL=... to point elsewhere)
```

Without the server the game still plays, but runs aren't ranked.

## Layout

| Path | What |
| --- | --- |
| `src/sim/sim.ts` | The rules: physics, the lava, level generation, hazards, rides and shells, input recording and replay. No DOM. The server runs this file. |
| `src/sim/zones.ts` | Zone heights, colors, when each feature starts, the difficulty curve, wind. |
| `src/sim/bot.ts` | A climber for the title screen and tests. It picks ledges it can still land on. |
| `src/game/` | The page: loop and screens (`main.ts`), drawing (`render.ts`), input, sound, board calls. |
| `server/` | HTTP server: static files, `/api/start`, `/api/finish`, `/api/board`, `/health`. SQLite in `db.ts`. |
| `scripts/` | Server build, screenshots, `climb.ts` bot stats, `ship.mjs`. |
| `docs/hosting.md` | VM, tunnel and deploy setup. |

## How the board stays honest

1. Pressing Climb asks the server for a run id and a random seed.
2. The page records only input changes (tick, -4..4) while you play.
3. At the end it sends the inputs. The server checks that enough real time has passed, replays the whole run with the same sim, and stores the height the replay reached, not the height the page claimed.

It doesn't stop a bot that plays in real time, but it stops edited scores, sped-up runs and made-up input logs.

See [ROADMAP.md](ROADMAP.md) for what's planned.
