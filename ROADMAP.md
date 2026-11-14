# Magma Hop roadmap

An endless hop up an erupting volcano, with a global board for the highest climb. Browser and phones, at magmahop.parbs.online. It was called Updraft until 2026-11-14.

## Decisions so far

These came from the owner's answers on 2026-11-13, corrected on 2026-11-14. Change them only on their say-so.

| Topic | Decision |
| --- | --- |
| Genre | Endless bouncer. On 2026-11-14 the owner said the reference they meant was Doodle Jump, not Jump King. It's an original game in that genre: no names, characters, art or levels from other games, and **not the notepad-doodle look**. |
| Controls | Bounce on every landing, full air steering, no charge or jump button. Keys, gamepad, hold either half of the screen, optional tilt. |
| Edges | Wrap around. |
| Falling | The view only moves up, and dropping off the bottom of it (into the lava) ends the run. Confirmed by the owner on 2026-11-14. |
| Run ends | Falling off the bottom of the view, or one hazard hit. Players can also end a run from the pause menu. |
| Score | Highest point reached. |
| Difficulty | Harder as you climb, forever: smaller ledges and bigger gaps, moving and crumbling ledges, fakes, wind gusts, ice, plus springs. |
| Always a way up | There must always be a way to keep climbing, even with breaking ledges (owner, 2026-11-14). Route ledges never crumble or fake, and from every ledge the next route ledge is within one hop. A test checks it. |
| Ledge density | Fewer ledges in the early zones (owner, 2026-11-14): about 4.2 per hop-height at the bottom (was 6), 3.7 at 700 m, thinning toward 2.5. |
| Board | Global, best height per climber, all time and this week. Server-issued seeds and a full server-side replay of every run. |
| Theme and art style | Volcano escape in chunky pixel art (option B below). The owner picked it on 2026-11-14. |
| Enemies | Collision only: stomp from above, touching them any other way is a hit. **No shooting** (owner, 2026-11-14). |
| Name | **Magma Hop**, picked by the owner on 2026-11-14 from Claude's list (it replaced Updraft, which suited the old sky tower). |
| Repo | Public, github.com/nparbs/magma-hop (owner, 2026-11-14). |
| Hosting | magmahop.parbs.online, same pattern as the other parbs.online games. |

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

## v0.2 — bouncer rework (built, on branch `v0.2-bouncer`)

v0.1 kept one Jump King habit: a miss dropped you back down the tower. This version removes it and reskins the game.

Rules

- [x] The view never scrolls down. The lava sits 28 m below the highest point you've reached, and touching it ends the run.
- [x] Crumbling ledges break for good after one bounce.
- [x] Fake ledges snap when you land on them, so you fall through.
- [x] More ledges: about six per bounce-height at the bottom, thinning to under three, with the guaranteed route still running through them.
- [x] Rides: a geyser vent (short, about 130 m) and a lava bubble (long, about 315 m, from 400 m up). Nothing can hurt you on a ride or for a moment after.
- [x] Shell pickup: blocks one hit.
- [x] A ride or a shell turns up every 220 to 420 m, resting on a route ledge.
- [x] Stomping bats from above stays. No shooting.
- [x] `SIM_VERSION` is 2, stored with every run. Lower bounce (19 m instead of 22 m) to suit the denser ledges.

Tuning and checks

- [x] Route, replay, lava, crumble and ride tests.
- [x] The title-screen bot now picks ledges it can still land on. Without hazards it climbs 1.4 to 5.9 km before it falls.
- [x] The run-over screen says what ended the run.
- [ ] Nobody has played it by hand yet. Every number is still a first guess.

Look

- [x] Volcano escape: Pip is now a little ember. Magma Chamber → Crystal Caves → Fossil Beds → Ice Cap → Crater Rim → Ash Clouds.
- [x] Pixel art drawn in code on a low-resolution buffer, scaled up by whole pixels. Jersey 15 pixel font.
- [x] Fire bats, rockfalls (were lightning), fire wisps (were space junk), steam gusts, puffcap mushrooms (the springs).
- [x] New sounds for rides, the shell and the lava.

## Theme options (B chosen and built; the rest kept for reference)

All of these can be drawn in code. Each one says what is below you, because falling now ends the run.

| | Theme | Look | You are | Climb | Hazards and rides | Below you |
| --- | --- | --- | --- | --- | --- | --- |
| A | **Sky tower** (what v0.1 has) | Flat vector shapes, soft gradient skies | Pip the spring-bot | Rooftops → Cloudline → Thunderhead → Glacier Sky → Low Orbit → The Void | Drones, lightning, debris, wind. Rides: balloon, rocket pack | Open air |
| B | **Volcano escape** | Chunky pixel art, dark rock with hot glowing edges | A small ember creature | Magma chamber → Crystal caves → Fossil beds → Ice cap → Crater rim → Ash clouds | Fire bats, falling rocks, steam vents (the wind). Rides: geyser, lava bubble | Rising lava, always visible at the bottom |
| C | **Neon arcade** | Glowing line art on black, CRT bloom, ledges pulse with the music | A bouncing spark | Six color-and-tempo stages rather than places | Glitch blocks, sweeping lasers, static storms. Rides: signal beam, overdrive | The screen dissolving into static |
| D | **Beanstalk** | Storybook: flat colors, thick clean outlines, big shapes | A frog | Garden → Canopy → Cloud tops → Giant's castle → Moonlit sky → Stars | Wasps, thorn vines, rain squalls. Mushroom caps are the springs. Rides: dandelion seed, a passing bird | A very long drop |
| E | **Out of the deep** | Dark water, glowing sea life, light growing as you rise | A small glowing jellyfish, pulsing instead of bouncing | Trench → Shipwreck → Kelp forest → Reef → Sunlit shallows → Open sky | Anglerfish, urchins, currents. Rides: bubble column, a turtle | The dark |
| F | **Laundry day** | Flat cartoon cutouts, washed-out city colors | A lost sock | Alley → Fire escapes → Rooftops → Billboards → Cranes → Flight path | Pigeons, cats swatting from windows, AC exhaust gusts. Rides: a shopping bag in the wind, a drone delivery | The alley dumpster |

Claude's pick is **B, Volcano escape**: the rising lava explains the new falling rule at a glance, and pixel art on a dark background reads well at 640x360. C is the cheapest to build and pairs best with the planned music. E would want a new name.

## Before going live

- [ ] Owner playtest of v0.2: bounce height, steering speed, how forgiving the first 700 m are, how often rides and shells turn up. All numbers are first guesses (`src/sim/sim.ts` top, `src/sim/zones.ts`).
- [ ] Owner listen of the v0.3 music (nobody has heard it yet; the loops are in `src/game/audio.ts`, `SONGS`).
- [ ] Merge `v0.2-bouncer` and `v0.3` once the owner is happy with them.
- [ ] VM setup and the Cloudflare hostname (docs/hosting.md).
- [ ] Add Magma Hop to the parbs.online landing page.

## v0.3 — feel and fairness (built, on branch `v0.3`)

No rule changes, so `SIM_VERSION` stays 2 and v0.2 runs can still be watched.

- [x] Music: a synthesized loop per zone (one tempo, so they crossfade in time), busier the higher you go. Its own Music on/off switch.
- [x] Calm effects setting: no screen flashes, no shake, steady rockfall warnings. Starts on when the device asks for reduced motion.
- [x] Daily Climb: one seed for everyone per UTC day, made from a server secret so it can't be worked out ahead of time. Its own board tab. Daily runs don't count on the all-time or weekly boards, since everyone can practise the same seed.
- [x] Ghost: in the Daily Climb, your best try today races you as a blue ember. With no try yet, you race the day's #1. (A ghost only works on the same seed, so endless runs don't have one.)
- [x] Watch the top runs: ▶ beside a name on any board plays that climb back, at 1×, 2× or 4×.
- [x] Fixed: the board opened behind the run-over screen.
- [ ] Tuning pass from playtests: hazard density, crumble and fake rates, wind strength. Waits for the owner's playtest.

## Later ideas (not agreed)

- More hazards per zone.
- Cosmetics for the character unlocked by height milestones.
- Height achievements and a stats page (total meters climbed, enemies squashed).
- Name filter or an admin way to hide a board entry.
- Install as an app (PWA) and offline play.

## Open questions for the owner

- Ice ledges keep appearing above the Ice Cap (in the Crater Rim and Ash Clouds). Keep them there, or swap them for something that fits those zones?
- Should ending a run from the pause menu count on the board? It does now.
- Weekly board resets Monday 00:00 UTC. Is that the right week?
- The Daily Climb changes at 00:00 UTC and keeps daily runs off the endless boards. Both are Claude's picks; change either if you like.
