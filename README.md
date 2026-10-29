# StudyForge

A focus timer for serious study sessions on a PC. You are a **Knowledge Smith**: every minute of real study heats your forge, and the hotter it gets, the more Ingots you forge. Distractions cool the forge and crack your work.

Pure HTML + CSS + JavaScript. No accounts, no backend, no build step, no dependencies.

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
sw.js           offline cache
tools/serve.ps1 tiny local web server used by "Start StudyForge.bat"
v1/             the original v1 app, unchanged
```

Run the unit tests (Node 18+, no install needed):

```
npm test
```
