# Handoff

Last updated 2026-11-15. Live is **v0.8.0** (commit 8576d6d): the guide renamed Laury → Ash (code keeps `laury` names), rarer during runs (`lauryChat` in `main.ts`) with a babble voice (`Sfx.voice`), her bubble top right and tutorial buttons mid-right, and 18 more songs with B sections (`onPass` in `songs.ts`, shuffle bags in `Music.pick`). See ROADMAP.md v0.8.0; nobody has heard the new songs or the voice yet. Read ROADMAP.md for the plan and the decisions the owner has made, CLAUDE.md for the working rules, and docs/hosting.md for the server.

## v0.7.1 (gentler start) and v0.7.2 (tide line), live since 2026-11-15

The owner's first playtest note on v0.6: surges and the early bats were too punishing. They asked for an easier climb to 1,000 m that still gets harder as you go. They said the v0.7.1 surge numbers below are about right, then picked the tide line from Claude's suggestions.

- **v0.7.1 (f9f544b), `SIM_VERSION` 5.** All in `src/sim/sim.ts`, plus `FEATURE.bats` in `zones.ts`.
  - Surges: `SURGE_FIRST` is 400 (+0 to 60), `SURGE_RISE` is 100 ticks, and `surgeGap` is `120 + 200 * (1 - d)`. `surgeLimit(m)` ramps from `SURGE_EARLY` (200 units = 20 m) at the first surge to `SURGE_LIMIT` (120) by `SURGE_FULL` (1,500 m), and never goes below the widest route gap + 15.
  - Bats: they start at 200 m (`FEATURE.bats`). In `genStep`, `bw` ramps 0 to 1 from 200 m to `BAT_FULL` (1,000 m) and scales the spawn chance (×0.35 up to ×1), the patrol width, and the period (×1.6 down to ×1, so slower wings).
  - First shell: the first pickup at or above `FEATURE.bats` is forced to a shell (the `firstShell` flag).
  - The Daily-win test now uses seeds 17, 18, 19 and 22, since the old ones no longer reach the summit.
  - Bot stats, 12 seeds: the plain bot's middle run went from about 770 m to about 1,100 m. The careful Daily bot went from about 660 m to about 1,100 m and still reaches the summit on 4 of 24 seeds.
- **v0.7.2 (d397730).** `drawTideLine(sim)` in `render.ts` runs right after `drawLava`. From `rumble` through `rise`, it draws a dashed two-tone line at `sim.maxY - sim.surgeMin`, and hides it once the lava is within 3 px of it. It fades in over 30 ticks, and the dashes march and pulse unless calm effects are on. Display only.
- **Checked:** 34 tests, typecheck, bot stats, and headless screenshots of the tide line during a rumble and a rise at 1280x720 and 360x640.
- **Not checked:** the owner hasn't played either version yet. On 360x640, Laury's "about to surge" bubble covers the left part of the tide line. Moving her bubble up during a surge, or skipping that quip, would fix it if it bothers the owner.
- **Next ideas** (not agreed) are under "Suggestions from Claude" in ROADMAP.md: lava gauge, bat warnings, a replay of how the run ended with a tip, practice runs from a zone, a shell icon on the HUD.

## v0.7 (looks), live since 2026-11-14 (e0f844c)

The parbs.online card was updated for v0.7 the same day (PR #14 there), with a new gameplay loop.

ROADMAP.md lists what it does. What a developer needs:

- **Ledges:** `platform()` in `render.ts` hands cracked ledges to `crumbleLedge(z, …)` and drifting Normal ledges above the chamber to `driftLedge(z, …)`. `lift(z, …)` draws what holds any drifting ledge up, and `pieces()` splits a cracked ledge at its gaps. The zone comes from `sim.zoneAt`, so the Daily's squeezed zones work.
- **UI:** the button family is the block at the top of the Buttons section in `style.css` (`--face`, `--rim`, `--base`, `--lift`). The settings rows are `.btn.toggle`, filled in by `setToggle(button, on, state?)` in `main.ts`, which keeps the button's original text as its name. The `#settings` panel sits above the pause menu (z-index 6), and `input.onPause` closes it before anything else.
- **Checked:** 34 tests, typecheck, build, `livecheck` (10), `laurycheck` (13, four runs in a row) and screenshots of every zone's ledges, and the title, settings, pause, game-over and board screens at desktop, 360x640 and 640x360.
  - `laurycheck`'s `endRun` now waits out a death if the unsteered climber has already fallen. It was flaky before because of that.
- **Not checked:** nobody has played it, and it hasn't been seen on a real phone.

## v0.6 (eruption), live, not yet played by the owner

ROADMAP.md lists what each feature does. What a developer needs:

- **Sim (`src/sim/sim.ts`, `SIM_VERSION` 4).**
  - Surges: `sim.surge` is `'none' | 'rumble' | 'rise' | 'hold' | 'ease'`, and `sim.fallLimit` is the current gap (280 down to `surgeLimit(m)`, which is 120 low down and wider high up so a route gap always fits). `sim.nextSurge` is the height in meters of the next one. Events: `rumble`, `surge`.
  - Crust: `Kind.Crust` with `heat` (0 to 3) and `melt` (tick, or -1) on the platform. Events: `melt`, `reform`. `CRUST_ZONE` in `zones.ts` says where it replaces ice.
  - Daily: `new Sim(seed, { daily })` and `replay(seed, log, ticks, { daily })`. `sim.summit` is the top in meters (0 in endless), from `summitMeters(seed)`. Use `sim.zoneAt(m)`, not `zoneIndexAt`, anywhere the page picks a zone, because the Daily squeezes the zones. A win sets `sim.won` and ends the run with cause `summit`.
- **Server.** The Daily board order is in `order()` in `server/db.ts`: summit finishers first by `ticks`, then height. Board rows carry `ticks` and `cause`. The cause always comes from the server's replay, never from the page.
- **Page.** Laury's eruption quips and the near-miss rule are in `updateHud` and the event loop in `main.ts`. The Daily's local best keeps the fastest summit time (`dailyTime`). The game-over line is `causeLine` in `cause-text.ts`.
- **Checked:** 34 tests, typecheck, build, bot stats, `livecheck` (10), `laurycheck` (13), `musiccheck`, and screenshots of crust, a surge, the summit, the eruption, the win screen and the game-over line (desktop and 360x640).
  - The three check scripts now mark Laury's tutorial as seen (or skip the surge) so they test what they mean to.
- **Not checked:** nobody has played it. No sound has been heard. Shimmer and shake haven't been watched in motion. 640x360 wasn't looked at for the Daily HUD.
- **v0.6.1 (live since 2026-11-14, b0a7204):** fixed both known gaps. The win screen now plays `SUMMIT_SONG`, and the Daily board's "You" line shows a summit finisher's time. Setting switches use `setToggle` in `main.ts`: `.chip.toggle.on` draws a flickering pixel flame and `.off` draws ash, both as box-shadow sprites in `style.css`. The Summit song hasn't been heard.
- **Tuning risk:** surges make the game a lot harder (bot numbers in ROADMAP.md). Soften them in the Ice Cap first if the owner finds it too hard.

## Where things stand (v0.5 and earlier)

- **v0.5 is live** at https://magmahop.parbs.online. It has two features, both asked for by the owner on 2026-11-14. ROADMAP.md lists what each one does.
  - **Live climbers.** You can see other players who are in the same mode right now.
    - Server: `server/live.ts` (`LiveRoom`) holds who is climbing, in memory only. `POST /api/live` takes `{runId, pts, name, skin, meters}`, or `{runId, leave: true}`. `pts` is a flat list of `[tick, x, y]` samples, taken every 3 ticks.
    - The mode key is `endless` or `daily:<day>`. The server answers with up to 12 others, closest in height first. Each one carries a public `pub` id made at `/api/start`. The run id is never sent out, because it is what finishes a run.
    - A climber drops off 4 s after their last post, and at once on `/api/finish` or `leave`. `GET /api/live` gives the counts for the title screen.
    - Rate limits are per run (400/min) and loose per address (2400/min), because several people can share one home address.
    - Page: `src/game/live.ts` (`LiveClimbers`). It samples in `tick()` and posts every 250 ms from `frame()`. That includes while paused and during Laury's tutorial, so you stay visible.
    - Others are drawn about 27 ticks behind their newest sample, with the playhead eased toward that point. `at()` interpolates between samples and doesn't slide across a wrap.
    - Drawing: `Renderer.rivals`, `drawRivals` and `drawRivalLabels` in `render.ts`.
      - Daily: `inWorld` is true, so others are drawn see-through on the shared volcano.
      - Endless: each one is a notch on the left wall at their height.
      - Anyone off screen gets a ▲ or ▼ arrow at the top or bottom edge.
    - Switch: **Others on/off** (`magmahop.live` in localStorage). Off stops sending as well as showing.
    - Positions are display only. Nothing on the board trusts them.
  - **Laury, the tutorial guide.**
    - Code:
      - Sprite and animation: `LauryArt` in `render.ts`. It draws into its own 22x28 canvas, which CSS scales up with `image-rendering: pixelated`.
      - Controller: `src/game/laury.ts`. `tour(lines)` blocks the run and returns a promise; `say(line)` is a quick quip. During quips the bubble lets touches through to the game.
      - Lines: `src/game/laury-lines.ts`.
    - First run in a mode:
      - A new `intro` mode in `main.ts` holds the run (no ticks) while the tutorial plays.
      - `kickoff()` starts the run proper afterwards.
      - Flags `seen.basics` and `seen.daily` are set even if the player skips.
    - Later runs get a quip 500 ms after start. 35% of the time it comes from `AFTER[lastCause]`. `lauryRecent` keeps the last 12 lines so she doesn't repeat herself.
    - Check-ins at 500 m marks happen in `updateHud`: always at 500 and 1000, then 50% of the time.
    - On wide screens, `fitLaury()` sets `--laury-max` so her bubble stays in the space beside the shaft.
    - Gamepad: the A button only moves the tutorial on a fresh press (`padHeld`).
    - Switch: **Laury on/off** (`magmahop.laury`). How to play has a button that clears her flags.
  - **No sim change.** `SIM_VERSION` is still 3, so every stored run can still be watched.
  - **Checked:**
    - 24 tests (`tests/live.test.ts` is new) and typecheck.
    - `scripts/livecheck.mjs`, 10 checks with two headless browsers in both modes: they see each other, a paused climber stays, a finished one goes, and Others off hides both ways.
    - `scripts/laurycheck.mjs`, 13 checks at desktop, 360x640 and 640x360.
    - After the ship, `/health` and `/api/live` both answered on the live site.
  - **Not checked:**
    - Nobody has played either feature by hand.
    - Live climbers haven't been tried with two real devices over the internet.
    - Laury hasn't been seen on a real phone.

- **v0.4** (music per zone, five looks, tilt in the pause menu), **v0.3** (Daily Climb, ghost, watching runs, calm effects), **v0.3.1** (origin check) and **v0.3.2** (fewer early ledges, route ledges never break) are all live and described in ROADMAP.md.

## How it fits together

- `src/sim/` holds the rules (`sim.ts`), zones and difficulty (`zones.ts`) and the bot (`bot.ts`). It is deterministic and has no trig. The server replays every run with it.
- `src/game/main.ts` holds the loop and the screens. The modes are `title`, `intro`, `play`, `pause`, `dying`, `over` and `watch`.
- `window.magmahop` exposes `sim`, `mode`, `ghost`, `laury`, `live`, `music`, `renderer`, `startGame` and `watchRun` for headless checks.
- `server/index.ts` handles the HTTP side: `/api/start`, `/api/finish` (replay check), `/api/board`, `/api/run`, `/api/live` and `/health`. SQLite is in `server/db.ts`.

## Shipping and testing

- **Ship:** `npm run ship`, only when the owner asks. It must be run from `main`. It typechecks, tests, builds, pushes, runs the locked deploy key on the VM and waits for `/health` to show the new version. The key and VM address are in `.deploy.local.json`, which is git-ignored. It only works from the home LAN.
- **Development changes:** work on a branch, then fast-forward `main` before shipping. v0.5 was built on `v0.5-live`.
- **Running the checks:**
  1. Run `npm run build` and `npm run build:server`.
  2. Start the server on a spare port with a scratch database, for example `PORT=8797 DB_FILE=<scratch>/live.db node dist-server/index.mjs`.
  3. Run `URL=http://localhost:8797/ node scripts/livecheck.mjs` and `node scripts/laurycheck.mjs`. They need the built page served by that server, because the Daily Climb needs it.
  4. Run `npm run shots` (scenarios: desktop zones daily skins small phone landscape) and `scripts/musiccheck.mjs` with the dev page running.
- **Bot stats** after generator or physics changes: see CLAUDE.md.

## Open

- Owner playtest of v0.5 with a second player, and of Laury.
- Owner playtest of v0.6 (live since 2026-11-14), and the two known small gaps above.
- The questions in ROADMAP.md: whether quitting from the pause menu should count, the weekly reset time, and the Daily Climb's UTC changeover.
- A tuning pass on hazards and ledge rates, waiting on more of the owner's play.
- Adding Magma Hop to the parbs.online landing page.
- Ideas the owner hasn't agreed to are in ROADMAP.md under "Later ideas". Don't propose shooting (the owner ruled it out).
