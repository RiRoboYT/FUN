# StudyForge

A focus timer for serious study sessions on a PC. You are a **Knowledge Smith**: every minute of real study heats your forge, and the hotter it gets, the more Ingots you forge. Distractions cool the forge and crack your work.

Pure HTML + CSS + JavaScript. No accounts, no backend, no build step, no dependencies.

## What's new in v3.1

- **Smoother forging:** clicking **Forge** no longer freezes the page or skips the animation.
  - The Vault keeps a fixed set of lights, so adding the crucible no longer forces every shader in the scene to recompile.
  - New shaders and textures are prepared before the pour starts.
  - If the PC stalls for a moment, the animation pauses instead of jumping ahead.
- **Brighter forge:** the session forge has a warm room light, so it's clearly visible even when the metal is cold, and the end-of-session scene lights the anvil properly.
- **Brightness control:**
  - Settings → Effects → **3D brightness** (50–250%) sets it for the forge and the Vault.
  - On the session screen, the ☀ button (or **B**) opens a quick slider.

## What's new in v3 — animation

- **Forging in the Vault:** reaching an alloy's requirements no longer hands you the ingot.
  - The alloy becomes **Ready to forge**: its mould sits waiting with a crucible of molten metal behind it, and the dashboard shows "Silver is ready to forge →".
  - Press **Forge Silver** (in the Vault's side panel) to play a ~10 s cinematic:
    1. The crucible lifts and pours a glowing stream into the mould.
    2. The metal cools from orange-hot to a crust.
    3. The mould is knocked away.
    4. Three hammer strikes press in the hallmark, with sparks.
    5. A light sweeps over the bar and the "Forged" card appears.
  - The title and the alloy achievement are granted **only after the animation finishes**.
  - Bronze is the starter alloy and is already forged.
  - Alloys you'd already reached before v3 start as ready to forge, so you get to watch each one.
  - Forged alloys have **↻ Replay the forging**.
  - Press Space, Esc or Enter (or the Skip button) to skip.
- **Session-end animation:** the old reward pop-up is replaced by a ~7 s sequence.
  - In the 3D forge, the billet is lifted, quenched in the water barrel with a burst of steam, and set on the anvil under a spotlight as a finished ingot. A failed exam cracks the billet apart instead.
  - At the same time, a card counts up each part of your reward: heat yield, streak multiplier, bonuses and achievements. Ingots fly to your bank, a wax seal stamps your peak heat, and a bar fills toward your next alloy.
  - It finishes with your session note box and buttons for **Dashboard**, **Forge Hall** or **Go to the Vault** (when an alloy is ready).
  - Press Space, Esc or Enter (or the Skip button) to jump to the end.
- **Loading animations:**
  - The Vault shows an ingot mould filling with molten metal, with real progress: lighting the studio → casting the metals → polishing the bullion → ready. The scene then dollies in.
  - The session forge shows ember dots while it lights, then the room glows up.
  - The 3D engine now preloads quietly in the background a few seconds after the app opens.
- **Big real-world clock** on the session screen (top-right): 12-hour time without seconds (e.g. 5:42 PM), with the date underneath. During an exam it also shows when the exam ends.
- New synthesized sounds for the animations: pour, quench hiss, thud, clang, tick and whoosh.

## What's new in v2.5

- **Backup & restore** (Settings → Backup & restore):
  - **Download backup** saves everything to a `.json` file.
  - **Restore from a backup** loads it on any PC or browser, after a confirmation showing what will be replaced.
  - **Export history** saves a CSV that opens in Excel.
  - Settings shows when you last backed up, and once you have a few sessions the app reminds you (at most weekly) if it's been more than two weeks.
- **Calendar** (top of the Stats page, or "Calendar →" on the dashboard): a month view where each day's tile **glows hotter the more you studied**. Days you didn't study stay dark, a little study is a dull ember, and around 4 hours is white-hot. Click a day to see its sessions, subjects and notes. The summary shows hours this month, days studied, your best day and your longest run.
- **One visual language:** the dashboard, Stats, Session Log, Forge Hall and Settings now match the session screen, with Inter Tight text, Fraunces headings, glass cards with lit edges and heat colours.
  - **The dashboard hero** shows a greeting with your name, your current alloy as a metal ingot, and today's studied time, streak, Ingots and Forge Score.
  - **The "This week" strip** has glowing day tiles.
  - **Subject Forges** glow with the week's heat.

## What's new in v2.4 — the live forge

The session screen is now set in a smithy. It's a fixed, cinematic 3D backdrop rendered with three.js. You don't interact with it; it reacts to how you study.

- **The billet heats as you study.** It goes from cold steel through dull red, orange and yellow to white, then blue-white at Legendary, with the coals and flames following. Distraction cools it, and cracks appear in the metal.
- **A hammer strike for every Ingot:** the hammer swings in, sparks fly and the anvil rings.
- **Heat ring with temperature:** a ring around the timer fills from 20 °C to 1,538 °C (iron's melting point), with silver (962 °C) and gold (1,064 °C) marked.
- **The room warms with you:** an ember glow rises from the bottom of the screen as the heat builds.
- **A look for each mode:** the warm smithy for Stopwatch and Study Timer. On breaks the forge banks down: the coals dim, the billet cools and steam rises, and the ring counts the break down in blue. In the **Exam Timer** the scene goes cold and stark under a single overhead spotlight, and the ring becomes the countdown.
- **Cleaner layout and type:** the timer uses Inter Tight and headings use Fraunces, both bundled in `fonts/` (SIL Open Font License). A single glass split bar replaces the three counter boxes. A top strip shows the subject, the clock and Forge Radio's now playing.
- **Built for long sessions:** it renders at 30 fps below native resolution, pauses whenever you switch tabs, and lowers its own quality if your PC struggles. **Settings → Effects → Calm forge** shows it as a still scene that only redraws when the heat changes.

## What's new in v2.3.1 — The Vault, rebuilt

The Forge Hall's **Vault** is a real-time 3D product shot of your alloys, built with
[three.js](https://threejs.org) r170 and its official post-processing add-ons.

- **A museum display:** the five alloys sit in a row on a polished black-granite slab with a brass inlay. A low camera glides along it like a jewellery product page. The selected piece is sharp and the rest fall into soft depth of field.
- **Cast bullion bars:** rounded edges, tapered sides and a slightly settled top. Inscriptions are pressed into the metal (normal-mapped, with matte cavities): the alloy name and fineness on top, the symbol on the front, and your hallmark ("Forged by <name> · date") on the back. Surfaces have fine scratches and uneven polish. Silver is brushed (anisotropic), platinum has a lacquer coat and Mythril an iridescent film.
- **Graphite casting moulds** for locked alloys, with the ingot's exact shape carved out using constructive solid geometry ([three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg)). The next alloy's mould is filling with **molten metal**: slow convection, a cooling crust, a glowing rim where it meets the mould wall, embers, bloom and a heat-haze shimmer. How full it is matches your real Ingot progress.
- **Studio lighting:** a light-formed reflection environment (virtual softboxes and strip lights, prefiltered with PMREM), rectangular area lights, soft contact shadows, ambient occlusion (GTAO), a faint light beam with drifting dust, and Khronos PBR Neutral tone mapping with SMAA anti-aliasing.
- **Interaction:** drag to glide along the slab, or flick it and it settles on the nearest piece. Click a bar to lift it and turn it in your hand. Arrow keys, Enter and Esc work too, and every caption is a focusable button. The side panel tells each alloy's story (days, sessions, hours, top subject, best streak) or shows the requirements still to meet.
- **Performance:** the bundle loads only when you open the Forge Hall. Rendering pauses when the shelf is off-screen, the tab is hidden or you leave the page. It drops to half frame rate when idle, and quality steps down automatically (high → medium → low) if frames get slow. Without WebGL 2 it falls back to the 2D alloy cards. Add `?vaultQuality=high|medium|low` to the URL to force a level.

## What's new in v2.2

- **Achievement rewards:** every achievement has a tier (Common, Rare, Epic or Legendary) worth points ("G", like Xbox Gamerscore) and bonus Ingots (+5 / +15 / +30 / +60). Achievements unlocked before v2.2 are paid out automatically. Your total **Forge Score** shows in the top bar.
- **30 achievements**, including 2 secret ones that stay hidden until earned. Locked achievements show a progress bar (e.g. "3 / 7 days").
- **Xbox-style pop-up:** when you unlock one, an orb pops up at the bottom of the screen, stretches into a pill ("Achievement unlocked · 25G – Night Owl · +15 Ingots") with a chime, then shrinks away. Several unlocks queue one after another.

## What's new in v2.1

- **Weekly Stats page:** a day-by-day chart of Studied, Intentional and Distracted time, plus totals, a daily average, your best day, a focus score and a comparison with last week. It also shows time per subject and where your distraction came from (YouTube, Instagram, …).
- **Session notes:** jot what you covered on the reward card. Notes show in the Session Log and Recent sessions.
- **Log study done away from the timer:** add tuition, school or other study afterwards (subject, how long, when, notes). It counts toward stats, Subject Forges and your streak, earns Ingots at the base rate, and you can delete it from the Session Log.

## What's new in v2

- **Interactive cursor:** an orange dot with a ring that trails behind it and wraps itself around whatever button you hover over. It squishes when you press, and clicks throw forge sparks.
- **Magnetic, expanding buttons:** the top navigation and session controls are icon pills. The active one shows its label, and hovering another hands the label over. Buttons lean toward the cursor, and cards glow where your mouse is.
- **Forge Radio:** a gooey floating player in the bottom-right corner.
  - **Ambient:** plays built-in sounds (forge fire, rain, brown noise) that work offline.
  - **YouTube Music:** paste a YT Music or YouTube playlist, album or song link, and ⏮ ⏯ ⏭ control it.
- Every effect can be switched off in **Settings → Effects**. The effects respect "reduce motion" and turn off on touch screens.

**StudyForge v1 is still included, unchanged,** in the `v1/` folder. Open `v1/index.html`, or use the link in Settings. Both versions share the same saved data. It's also tagged `v1.0.0` in git.

## Running it

- **Easiest:** double-click `index.html`. It runs straight from the file system. Everything works this way except the YouTube Music player.
- **With YouTube Music (Windows):** double-click **`Start StudyForge.bat`**. It serves the folder at `http://localhost:8642` using PowerShell, which ships with Windows, and opens your browser. YouTube's player refuses to load inside a page opened as a file. Keep the black window open while you use the app.
- **To install it as an offline app (PWA):** serve the folder over http, for example `python3 -m http.server 8000`, open `http://localhost:8000`, then use your browser's "Install app" option. After the first load it works offline.

Your data is saved in the browser's `localStorage`. It stays on that device and in that browser profile.

## Features (v1)

| Feature | Details |
|---|---|
| **Stopwatch** | Unlimited free forging, with pause. |
| **Study Timer** | 25/5, 50/10, or custom work/break blocks that switch automatically. +3 bonus Ingots for each work block finished with less than 10% distraction. |
| **Exam Timer** | 30/60/90/120/custom countdown with no pause. Optional **Strict Mode**: leaving for more than 10 seconds ends the attempt. Finishing with under 1 min distracted earns a **Legendary Attempt** (+10 Ingots). |
| **Three live counters** | Studied (green), Intentional (blue), Distracted (red). |
| **Forge heat** | Cold → Warm → Hot → Blazing → Legendary at 0/5/15/40/70 min. Multipliers are 1.0/1.0/1.1/1.25/1.5×. Each distracted minute cools the forge by two minutes of heat. A distracted stretch of 2+ min cracks the ingot. |
| **Return popup** | When you come back to the tab, you pick what you were doing. WhatsApp/AI/Google count as Studied, PDF/Office/Explorer as Intentional, and YouTube/Instagram/Roblox as Distracted. For Other, you enter the name and choose the bucket yourself. |
| **Open for Study** (`O`) | Approve a timed window for another app or site. The main timer pauses and an Intentional timer runs. You get a notification when the window ends. Any time past it counts as Distracted. |
| **Ingots, streaks, alloys** | 1 Ingot per 5 clean minutes × heat × streak (1.0/1.2/1.4/1.6× at 1/3/7/14 days). Bronze → Silver → Gold → Platinum → Mythril. |
| **Titles & achievements** | 5 equippable titles and 8 achievements in the Forge Hall. |
| **Subject Forges** | Studied time per subject over the last 7 days. The hottest subject glows. |
| **Session Log** | Full history with an end-of-session reward card. |
| **Crash recovery** | If the tab closes mid-session, you're offered a resume on the next load. The gap counts as away time, and you're asked about it. |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Start / Pause (no pause in Exam mode) |
| `Esc` | Stop session. In full screen, the first press only exits full screen, because the browser handles that. |
| `F` | Toggle full screen |
| `O` | Open for Study |

## Known limitations

- YouTube Music has no public API, and a web page can't control another tab. Forge Radio can't steer a YT Music tab you already have open. It plays the music itself through YouTube's official embedded player, which needs an internet connection and the `.bat` launcher (or any web server).
- A normal web page **cannot block** YouTube, Instagram, Roblox or other apps. It also can't see which app you switched to. StudyForge detects when you leave the tab or window and asks you to classify that time honestly when you return. Short alt-tabs under 3 seconds are ignored.

## Development

```
js/logic.js     pure game rules (heat, ingots, streaks, alloys, achievements)
js/session.js   session engine (time accounting, away/return, Open for Study, phases, exam)
js/storage.js   localStorage persistence
js/sound.js     synthesized sound effects and ambient soundscapes (WebAudio)
js/ui.js        rendering
js/app.js       controller: events, keyboard, notifications, recovery
js/fx.js        v2 cursor, magnetic buttons, hover glow, click sparks
js/radio.js     v2 Forge Radio (ambient + YouTube embedded player)
js/scene3d.js   loads the 3D bundle on demand for the Vault and the session forge (2D fallback without WebGL 2)
src/vault/      Vault source (ES modules): scene, geometry, procedural textures, effects, post-processing
src/forge/      session forge source: smithy scene, coals, billet, hammer, per-mode looks
vendor/         studyforge3d.bundle.js built from src/ with esbuild (npm run build:3d)
fonts/          Inter Tight and Fraunces (variable, Latin), SIL Open Font License
sw.js           offline cache
tools/serve.ps1 tiny local web server used by "Start StudyForge.bat"
v1/             the original v1 app, unchanged
```

Rebuild the 3D scenes after editing `src/` (needs `npm install` once):

```
npm run build:3d
```

Run the unit tests (Node 18+, no install needed):

```
npm test
```
