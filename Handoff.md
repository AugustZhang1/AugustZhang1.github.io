# Handoff: galaxy portfolio redesign

Last updated 2026-11-03. Read `DESIGN.md` first; it is the full spec. This file covers where the work stopped.

## Where things are
- **Prototype:** `mockups/v4/galaxy.html` (single file, vanilla canvas JS). It is a universe of 13 project galaxies with three zoom levels (universe, galaxy, solar system), search with cosine scores, hover previews and a breadcrumb.
- **Animations:** each project's in-galaxy animation is a plugin in `mockups/v4/anims/<key>.js`. The API is in `mockups/v4/anims/README.md`. A plugin gets the galaxy's live star positions (`api.stars()`) and can dim the spiral (`spiralDim`), so animations are made of the galaxy's own stars, not overlays.
- **Fallbacks:** if a plugin file registers nothing, galaxy.html falls back to an older built-in animation where one exists (search "IN-GALAXY ANIMATIONS" in galaxy.html).
- **Other prototypes, kept for comparison:** `mockups/v4/map.html` and `mockups/v4/halftone.html`.
- **Backup:** galaxy.html as it was before the plugin refactor is in the session scratchpad only, so treat git as the source of truth.
- **Not committed:** none of this is in git yet (`DESIGN.md`, `mockups/` and `Handoff.md` are untracked).

## How to run and test
1. From the repo root, run `python -m http.server 8000`.
2. Open `http://localhost:8000/mockups/v4/galaxy.html`.
3. For a single project: `galaxy.html?open=<key>&dtmax=0.7`. `open` flies straight into that galaxy. `dtmax` lets time advance when the automated Chrome throttles frames to about 1.5 fps; plain screenshots in automated Chrome otherwise look broken or frozen.
4. Console helpers: `__galaxy.open(key)` and `__galaxy.close()`.
5. Run `node --check anims/<key>.js` on each file. Stub tests have missed real bugs before (an uninitialised field gave NaN and blanked the page), so always check visually in a browser.

## Animation status (stopped mid-work on 2026-11-03)
Each subagent was stopped while iterating. The files below are syntactically valid and registered unless noted, but **only housing was finished and visually verified**.

| Key | Status |
|---|---|
| housing | **Done and verified.** Scatter, decision-tree splits, then a 16-step staircase on a 23s loop. |
| league | **Done and verified (batch 1).** Win-probability curve, playhead sweep, swing flares ending on "+18% Baron"; 25s loop. |
| minecraft | **Done and verified (batch 2).** Stars build shaded voxel cottage / oak tree / castle tower with `!design` counter, quarter turn, dissolve; 20s loop. |
| snake | **Done and verified (batch 2).** Star snake over a dimmed field, 3 generations (crash, self-bite, long accent finish) with gen/length/best label; ~22s loop. |
| rag | **Done and verified (batch 2).** Radar sweep from a query star, 5 planets with moons, ranked top-5, judge strikes a hallucination; 22.5s loop. |
| arbitrage | **Done and verified (batch 3).** 4 bookmaker stations beam odds into a ring gauge; stale line drops under 100%, gap lights, stakes return as "+2.6% locked"; 24s loop. |
| audiobook | **Done and verified (batch 3).** Star book sheds lines through a 28-voice ring into a star waveform with chapter beacons; 24s loop. |
| ark-eagle | **Done and verified (batch 3).** 7 day-orbits fill with 17 satellites; one drops out, scan auto-launches a replacement; 24s loop. |
| arkproject | Written (231 lines), not verified. |
| jobapply | Written (209 lines), not verified. |
| sinai | Written (243 lines). Was checking the dark-theme system phase. |
| medihub | **Done and verified (batch 1).** Station with 6 bays; book, specialist match, turn-away, cancel and rebook; 24s loop. |
| senseway | **Done and verified (batch 1).** Logo from stars, then crosswalk with LiDAR, GPS fixes and a dashboard; 23.2s loop. |

The vision for each animation is the table in `DESIGN.md` ("In-galaxy animations"). Rules: build from the galaxy's own stars, keep it calm and elegant, use flat dots in the galaxy colours with one accent, keep text minimal, and edit only your own `anims/<key>.js`.

## Next steps
1. Build medihub and senseway.
2. Visually verify and polish the other 11 (open each with `?open=<key>&dtmax=0.7` and screenshot several moments in the loop, in dark and light theme).
3. Have the user click through every galaxy and give feedback.
4. Later: compute real embeddings for the chunks, add the resume PDF (`AugustZhang_Resume_Final.pdf`), add `img/minecraft.mp4`, and port the result to the real `index.html`.

## User preferences learned
- Keep solutions simple; don't overengineer.
- Ignore all images in `mockups/` (rejected).
- When asked to "use Claude subagents", use the Agent tool (Opus 5.5, medium effort, for the animation work).
- The user is direct and visual. Show working prototypes rather than describing ideas, and confirm behaviour in a real browser before reporting success.
