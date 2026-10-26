# StudyForge

A focus timer for serious study sessions on a PC. You are a **Knowledge Smith**: every minute of real study heats your forge, and the hotter it gets, the more Ingots you forge. Distractions cool the forge and crack your work.

Pure HTML + CSS + JavaScript. No accounts, no backend, no build step, no dependencies.

## Running it

- **Easiest:** double-click `index.html`. It runs straight from the file system.
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

## Known limitation

A normal web page **cannot block** YouTube, Instagram, Roblox or other apps. It also can't see which app you switched to. StudyForge detects when you leave the tab or window and asks you to classify that time honestly when you return. Short alt-tabs under 3 seconds are ignored.

## Development

```
js/logic.js     pure game rules (heat, ingots, streaks, alloys, achievements)
js/session.js   session engine (time accounting, away/return, Open for Study, phases, exam)
js/storage.js   localStorage persistence
js/sound.js     synthesized sound effects (WebAudio)
js/ui.js        rendering
js/app.js       controller: events, keyboard, notifications, recovery
sw.js           offline cache
```

Run the unit tests (Node 18+, no install needed):

```
npm test
```
