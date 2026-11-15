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
- [x] The owner has played it live since 2026-11-14. First note: too many ledges early on (fixed in v0.3.2).

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

## Going live (2026-11-14)

- [x] v0.2 and v0.3 merged to main; repo renamed to nparbs/magma-hop and made public.
- [x] VM container, locked deploy key and the Cloudflare hostname: live at https://magmahop.parbs.online.
- [ ] Owner feedback on the feel: bounce height, steering speed, how often rides and shells turn up. Tuning numbers are at the top of `src/sim/sim.ts` and in `src/sim/zones.ts`.
- [ ] Owner listen of the music (the songs are in `src/game/songs.ts`).
- [ ] Add Magma Hop to the parbs.online landing page.

## v0.3 — feel and fairness (live)

No rule changes, so `SIM_VERSION` stays 2 and v0.2 runs can still be watched.

- [x] Music: a synthesized loop per zone (one tempo, so they crossfade in time), busier the higher you go. Its own Music on/off switch.
- [x] Calm effects setting: no screen flashes, no shake, steady rockfall warnings. Starts on when the device asks for reduced motion.
- [x] Daily Climb: one seed for everyone per UTC day, made from a server secret so it can't be worked out ahead of time. Its own board tab. Daily runs don't count on the all-time or weekly boards, since everyone can practise the same seed.
- [x] Ghost: in the Daily Climb, your best try today races you as a blue ember. With no try yet, you race the day's #1. (A ghost only works on the same seed, so endless runs don't have one.)
- [x] Watch the top runs: ▶ beside a name on any board plays that climb back, at 1×, 2× or 4×.
- [x] Fixed: the board opened behind the run-over screen.
- [ ] Tuning pass from playtests: hazard density, crumble and fake rates, wind strength. Waits for more of the owner's play.

Fixes after going live:

- [x] v0.3.1: the server took runs only from one exact address, so under any other hostname runs went unranked and the Daily Climb couldn't start. It now accepts its own page's address and still refuses other sites.
- [x] v0.3.2: fewer ledges early on, and route ledges never crumble or fake, so there's always a way up (see the decisions table). `SIM_VERSION` 3.

## v0.4 — music and looks (live, 2026-11-14)

Asked for by the owner after playing v0.3 live.

- [x] Several songs per zone (3 in the first two zones, 2 in the rest), each with its own tempo and melody. A zone's songs take turns every few loops.
- [x] A title theme and a run-over theme. Every change of zone or screen crossfades; pausing muffles the music instead of stopping it.
- [x] Five looks for the climber: Pip, Frostbite, Gloop, Obsidian and Starling. Picked with the arrows beside the logo (the logo shows the pick). Cosmetic only; each run stores its look so replays show it.
- [x] Tilt steering on phones was already there (the Tilt switch on the title screen). It's now also in the pause menu, says so when the phone refuses it, and the how-to explains it.
- [x] `scripts/musiccheck.mjs` walks the screens headless and checks the music follows; `tests/songs.test.ts` checks every song's patterns.

## v0.5 — climb together, and Laury (live, 2026-11-14)

Asked for by the owner on 2026-11-14: see the other players live when you're playing the same mode.

- [x] Every live run posts its recent positions four times a second (`POST /api/live`) and gets back the other climbers in the same mode: endless, or today's Daily Climb. Up to 12, closest in height first. Kept in server memory only, never on the board; a climber drops off 4 s after their last post, or at once when the run ends.
- [x] Others are drawn about half a second behind real time, smoothed between samples.
- [x] Daily Climb: everyone is on the same volcano, so others hop beside you, see-through, in their own look, with a name tag.
- [x] Endless: everyone has their own volcano, so drawing them on your ledges would look wrong. Instead each one is a notch on the left wall at their height, with their name.
- [x] Anyone above or below the view gets an arrow with their name and height at the top or bottom edge. The HUD says how many are climbing with you, and the title screen how many are climbing now.
- [x] **Show others climbing** in Settings (from the title screen or the pause menu). Off hides them and hides you from them.
- [x] No sim change: `SIM_VERSION` stays 3. `tests/live.test.ts` and `scripts/livecheck.mjs` (two headless climbers) check it.
- [ ] Owner playtest with a second player.

Laury, the tutorial guide (asked for by the owner on 2026-11-14):

- [x] Laury: a pixel-art volcanologist with a brown ponytail, goggles and a heat jacket, drawn in code. She slides in at the bottom left with a speech bubble, blinks, talks and waves.
- [x] The first time you try a mode she gives a short tutorial while the run waits: the basics (8 lines, steering explained for keys or touch), then the Daily Climb's own 4 to 5 lines. Next with a tap, Enter, Space or a gamepad button; Skip or Esc ends it.
- [x] Later runs: a quick joke at the start, then she leaves. About a third of the time it's about how your last run ended (lava, bat, wisp, rockfall, quitting). She avoids repeating her last 12 lines.
- [x] She checks in at 500 m and 1,000 m, then at each further 500 m mark about half the time.
- [x] Never blocks steering during play (the bubble ignores touches). **Laury on/off** in Settings, which also has a button to see her tutorial again.
- [x] Her lines are data in `src/game/laury-lines.ts`. `scripts/laurycheck.mjs` checks the whole flow headless.

## v0.6 — eruption (live since 2026-11-14)

Asked for by the owner on 2026-11-14, to lean into the volcano theme.

- [x] **Eruption surges.** The volcano rumbles for 2 s, then the lava rises from 28 m below your best height to about 12 m below (wider high up, so a route gap always fits), holds, and lets go. The lava never moves down: the gap reopens as you climb. Surges come at heights set by the seed, the first around 260 to 310 m, then closer together with height down to 120 m apart.
- [x] **Crust ledges** replace ice ledges from the Crater Rim up (ice stays below). Two solid bounces, the third still launches you but melts the ledge, and it re-forms 3 s later. Allowed on route ledges; the owner left that choice to Claude.
- [x] **Daily summit.** The Daily Climb has a top, set by the day's seed between 1,200 and 2,000 m, with all six zones squeezed below it. Reaching it erupts you out and wins the run. The Daily board lists summit finishers first, fastest first, then everyone else by height. The HUD shows `1,240 / 1,650 m`.
- [x] **Heat feel.** Shimmer above the lava (off with calm effects), the ember glows brighter as the lava gets close, shake during a rumble, a music pulse layer during a surge, and rumble, surge, sizzle and fanfare sounds.
- [x] **Laury and naming.** Laury has lines for a rumble, a surge survived, a near miss and the summit. The game-over screen names the cause: "Scorched at 840 m" (`src/game/cause-text.ts`).
- [x] `SIM_VERSION` is 4. Runs stored under 3 keep their heights on the board but can no longer be watched (the board hides their watch button).
- [x] Owner playtest (2026-11-15): too punishing early, softened in v0.7.1. Earlier note: surges are the big difficulty change: the no-hazards bot still passes 1 km every run, but most of its runs now end in the Ice Cap (1.4 to 1.9 km), and the careful bot reached the Daily summit on 3 of 12 seeds. If it plays too hard, soften surges in the Ice Cap first.

## v0.7 — looks (live since 2026-11-14)

Asked for by the owner on 2026-11-14. The owner picked "zone materials" and "settings panel" from Claude's options.

- [x] **Zone ledges.** Cracked and drifting ledges are made of their zone's material. Cracked: cooled lava blocks with glowing seams, crystal shards, brittle ribs, a thin snow crust, cinder blocks, packed ash flaking away. Drifting: the chamber's rock on sparks, a floating crystal over a glow, a bone raft shedding dust, an ice floe on steam, a smoking pumice raft, a cinder puff. The tells stay the same in every zone: cracked ledges show gaps between their pieces, drifting ones have something under them. Fakes are unchanged. Cosmetic only, no sim change.
- [x] **Home screen and buttons.** One button family: every button is a basalt block with a 2px edge and a hard shadow it presses into. Three sizes: the lava-orange main action on each panel, normal buttons, and small chips. The board tabs and pause button use it too.
- [x] **Settings panel.** The title shows Climb, Daily Climb and Board / How to play / Settings. Settings is one panel, opened from the title or the pause menu: Sound, Music, Calm effects, Tilt to steer (phones), Show others climbing and Laury, each a row lit in fire when on and burnt ash when off, plus Laury's tutorial button. Escape closes it first. The home screen now fits at 360x640 and 640x360.

## v0.7.1 — gentler start (live since 2026-11-15)

Owner playtest, 2026-11-15: surges and the early bats were too punishing. Make the climb to 1,000 m a little easier while the difficulty still builds as you go.

- [x] **Surges ease in.** The first comes at 400 to 460 m (was 260 to 310). Early surges stop 20 m below your best height (was 12 m), closing to 12 m by 1,500 m. The lava rises a third slower (1.7 s instead of 1.3 s), and early surges are further apart (about 270 m at first, was 250). Higher up they're as before.
- [x] **Bats ease in.** They start at 200 m (was 150). Below 1,000 m there are fewer of them (about a third as many at the start, building to full), their patrols are shorter, and they fly up to 60% slower. Full strength from 1,000 m.
- [x] **A shell before the first bats.** The first pickup once bats are about is always a shell, so your first misjudged bat isn't the end of the run.
- [x] `SIM_VERSION` 5. Bot check, 12 seeds: the plain bot's middle run went from about 770 m to about 1,100 m; the careful bot in the Daily went from about 660 m to about 1,100 m, and still reaches the summit on 4 of 24 seeds, as before.
- [ ] Owner playtest.

### Suggestions from Claude (not agreed)

Ideas that would make deaths feel fairer without making the game easier.

- **Lava gauge.** A thin bar up the side of the screen showing how close the lava is, so you notice it before it's on screen.
- **Bat tells.** Bats squeak and flash once the first time they come on screen, and early bats hang asleep until you're near. You'd still have to stomp them from above.
- **"What got you" replay.** On the run-over screen, a 2-second replay of the moment you died. Laury tells you how to avoid it next time ("bats only fold when you land on them from above").
- **Practice from a zone.** Once you've reached a zone, you can start a practice run there. It isn't ranked and has no board, so the board stays fair.
- **Shell on the HUD.** A small shell icon while you're carrying one, and a "Shell saved you" pop when it breaks.

## v0.7.2 — tide line (live since 2026-11-15)

The owner picked this from Claude's suggestions on 2026-11-15, and said the v0.7.1 surge numbers are about right.

- [x] **Tide line.** From the rumble until the lava gets there, a dashed glowing line marks where the surge will stop. It follows your best height, just as the lava will. It fades in over half a second and pulses (steady with calm effects). Display only, no sim change.
- [x] Owner playtest. On phones, Laury's rumble line could cover the left end of the tide line (fixed in v0.8.0: her bubble moved to the top).

## v0.8.0 — Ash, and more music (2026-11-15)

All asked for by the owner on 2026-11-15.

- [x] **Ash.** The guide is renamed from Laury to Ash, the owner's pick from Claude's list (code keeps `laury` names). Her bubble sits at the top right, out of the climber's way. Tutorial Next/Skip sit on the right edge halfway down, where a right thumb rests (lower right on short landscape screens).
- [x] **Rarer.** During runs she says at most two lines, never within a minute of each other (across runs too), and each trigger is a small chance. The tutorials and the summit line are unchanged.
- [x] **Voice.** A chirpy babble, one blip per syllable as her text types out, rising on the last syllable before ! or ?. Uses the sound mute.
- [x] **More music.** 18 new songs (six per zone in the Magma Chamber, four or five elsewhere, three each for the title and run-over screens), and every song has a B section, so it plays A B A B. Each cue shuffles through all its songs before repeating. The title theme still plays first.
- [ ] Owner playtest: the new songs and Ash's voice haven't been heard by anyone yet.

## v0.8.1 — carved stone menus (2026-11-15)

The owner asked for a more professional UI that still fits, and picked "carved stone tablets" from three directions.

- [x] **Stone slabs.** Panels are basalt tablets with a chiselled groove and lava glowing through corner cracks: pixel art from `stoneUi()` in `render.ts`, used as a CSS 9-slice `border-image` (`--slab`) and a grain tile (`--grain`). One art pixel is `--sp` (2px, 3px on big screens).
- [x] **One button family.** Embossed rock that glows orange from inside on hover and press; the main action is a molten slab. Teal is gone from the menus (gold and lit orange instead); the in-game ghost stays blue.
- [x] Board rank badges (gold, silver, bronze), carved panel titles and name well, a stone bubble for Ash, "SCORCHED" over the height on game over, top 3 on the title's mini board so the title fits at 360x640 and 640x360.
- [x] How to play cut to a third of its text.

## Later ideas (not agreed)

- More hazards per zone.
- More looks, maybe unlocked by height milestones (five are free to pick now).
- Height achievements and a stats page (total meters climbed, enemies squashed).
- Name filter or an admin way to hide a board entry.
- Install as an app (PWA) and offline play.

## Open questions for the owner

- Should ending a run from the pause menu count on the board? It does now.
- Weekly board resets Monday 00:00 UTC. Is that the right week?
- The Daily Climb changes at 00:00 UTC and keeps daily runs off the endless boards. Both are Claude's picks; change either if you like.
