# Updraft roadmap

An endless bouncing climb up a sky tower, with a global board for the highest climb. Browser and phones, to be hosted at updraft.parbs.online.

## Decisions so far

These came from the owner's answers on 2026-11-13. Change them only on their say-so.

| Topic | Decision |
| --- | --- |
| Genre | Endless vertical platformer. The original ask was "Jump King type", but the owner chose **automatic bouncing with left/right steering only**, so it plays closer to the endless-bouncer genre. It's an original game: no names, characters, art or levels from other games. |
| Controls | Bounce on every landing, full air steering, no charge or jump button. Keys, gamepad, hold either half of the screen, optional tilt. |
| Edges | Wrap around. |
| Falling | No checkpoints. A miss drops you onto whatever is below. Score is the **highest point reached**, so a fall costs time, not score. |
| Run ends | One hazard hit. Players can also end a run from the pause menu. |
| Difficulty | Harder as you climb, forever: smaller ledges and bigger gaps, moving and crumbling ledges, fakes, wind gusts, ice, plus springs. |
| Board | Global, best height per climber, all time and this week. Server-issued seeds and a full server-side replay of every run. |
| Theme and name | Left to Claude: "Updraft", Pip the spring-bot, zones Rooftops → Cloudline → Thunderhead → Glacier Sky → Low Orbit → The Void. |
| Hosting | updraft.parbs.online, same pattern as the other parbs.online games. |

## v0.1 — first climb (built)

- [x] Deterministic sim (`src/sim`), shared by page and server, with no trig or clocks so replays match exactly.
- [x] Level generator with a guaranteed route: every route gap fits inside one bounce (tested to 8 km).
- [x] Six zones with their own sky, scenery and ledge colors.
- [x] Ledges: normal, moving, bobbing, crumbling (come back after 5 s), ice, fake (faint dotted underside), springs.
- [x] Hazards: drones (stomp them from above), lightning with a warning column, space debris, and wind gusts announced a second early.
- [x] Difficulty dial `h / (h + 1200)` in meters: keeps rising forever, never hits a wall.
- [x] Board server: Node + SQLite, `/api/start` hands out a seed, `/api/finish` replays the inputs, checks real time passed, stores the run.
- [x] Title screen with a bot playing behind it, how-to, board (all time / week), pause, run-over screen with rank.
- [x] Your-best and #1 lines drawn across the tower while you climb.
- [x] Synthesized sound effects, mute (M).
- [x] Phone layouts (portrait and landscape), touch halves, tilt, gamepad.
- [x] Docker image, compose file, locked deploy script, `npm run ship`.

## Before going live

- [ ] Owner playtest: how do the bounce height, steering speed and the first 700 m feel? All numbers are first guesses (`src/sim/sim.ts` top, `src/sim/zones.ts`).
- [ ] VM setup and the Cloudflare hostname (docs/hosting.md).
- [ ] Add Updraft to the parbs.online landing page.

## v0.2 — feel and fairness (proposed)

- [ ] Music: a loop per zone that crossfades as you climb.
- [ ] Reduce-flashing setting (lightning flashes the screen).
- [ ] Ghost of your best run, drawn from your stored inputs.
- [ ] Watch the top runs: the server already keeps every board run's inputs, so replays are just playback.
- [ ] Daily Climb: one seed for everyone each day, with its own board.
- [ ] Tuning pass from playtests: hazard density in 150–700 m, crumble and fake rates, wind strength.

## Later ideas (not agreed)

- More hazards per zone: gulls in the Cloudline, hail in the Thunderhead, meteor showers in the Void.
- Cosmetics for Pip unlocked by height milestones (antenna colors, hats, trails).
- Height achievements and a stats page (total meters climbed, falls survived, drones squashed).
- Name filter or an admin way to hide a board entry.
- Install as an app (PWA) and offline play.

## Open questions for the owner

- Should squashing a drone stay in? It makes drones a tool as well as a threat.
- Should ending a run from the pause menu count on the board? It does now.
- Weekly board resets Monday 00:00 UTC. Is that the right week?
