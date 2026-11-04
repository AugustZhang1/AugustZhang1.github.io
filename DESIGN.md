# Site redesign: direction

Working notes; expect changes. The live site is `index.html`; the previous site is kept at `old.html`.

## Concept
August's work as a **universe**, styled like a RAG vector store a recruiter can explore.
- Every project and experience is its own **galaxy**, a separate universe floating in a deep, populated void.
- Inside each galaxy, the resume **chunks** (bullets and sentences) are distinct stars. Each chunk star opens into a **solar system**.
- Real embeddings will replace the seeded positions later. The data is already shaped like the future JSON file.

## Look and feel
- **Space, done tastefully.** Real-looking galaxies (a dense core, a bulge, spiral arms, dust lanes, a halo) with varied shapes: tight, loose, barred and elliptical. Soft photographic glow is allowed here. No neon, no sci-fi HUD, no cartoon.
- **Populated void.** A faint deep field of distant galaxies and layered starfields, so the universe feels vast but calm. The 13 project galaxies are clearly the brightest.
- **Minimal chrome.** The name "August Zhang", "Computer Engineering @ uOttawa", Resume / GitHub / LinkedIn / Email in small spaced monospace capitals, and a theme toggle. A small clickable breadcrumb (Universe / Project / Chunk) is the only navigation text.
- **No self-explaining text.** No instructions, status lines or technical labels beyond small mono numbers that carry meaning.
- **Lightweight build.** Plain canvas and vanilla JS, with no libraries.

## Three zoom levels
1. **Universe.** All galaxies, slowly rotating. Drag to orbit, scroll to zoom.
   - **Hover:** the project name, a preview card (League shows a live review page, Minecraft a video or screenshot, Sinai and SenseWay their logos uncropped), and faint lines with cosine scores to the 2 nearest galaxies.
   - **Search my work:** keyword retrieval for now. A query marker appears, with lines and cosine scores to the top 5 chunk stars, and the galaxies holding a match brighten.
   - Faint x/y/z axes and arrows from the origin, in the overview only.
2. **Galaxy (click).** The camera flies in, the detail panel opens on the right, and the project's animation plays (see below).
3. **Solar system (click a chunk star).** The star becomes a sun showing the chunk text, with 2 to 5 planets, one per key term (tech or metric). Back or Esc goes up a level; arrow keys step between stars or galaxies.

## In-galaxy animations
Each animation is **made of that galaxy's own stars**, which leave the spiral and form the idea. They are never flat overlays drawn on top. The mood is calm and elegant, with one accent for key moments. Each lives in `anims/<project>.js` (API in `anims/README.md`).

| Project | Animation |
|---|---|
| LeagueVODreview | Stars form a win-probability curve; a playhead travels it and big swings flare with labels like "+18% Baron". |
| AI Builder for Minecraft | Stars snap onto a voxel grid and build a small structure block by block, then rotate it. |
| RAG Toolkit | A query sweeps the galaxy like radar, finds 5 planets with moons, ranks them with scores, and a judge strikes out a hallucination. |
| Sports Odds Arbitrage | Bookmaker stations beam odds into a ring gauge; when the implied probability dips under 100%, the gap lights and stakes return as profit. |
| AudiobookFree | A star book sheds text lines that pass a ring of 28 voices and become a sound wave, with chapter beacons. |
| Ark Eagle Scheduler | 7 day-orbits fill with volunteer satellites; one drops out and a replacement auto-launches to fill the slot. |
| MediHub | A station with docking bays; patient ships book, cancel and rebook, and specialist bays take only matching ships. |
| ArkProject | Ingredient asteroids drift together and merge into a recipe planet that joins a growing system. |
| JobApply | Postings stream in, duplicates merge, a ranking pass orders them, and documents and forms fill, stopping at an unpressed "you submit". |
| Sinai Foundation | Stars form the logo, then it becomes a sun with 3 site planets, a shared component ring and deploy pulses. |
| SenseWay | Stars form the logo, then a starlit crosswalk with LiDAR and GPS sensing, data streaming to a dashboard. |
| Video To Reels | Stars pour into a tall phone frame and fill its screen as a dot-matrix picture; a swipe sends the reel up, and a star "most replayed" curve lifts its peak, which becomes the next 30 s reel. |
| Calendar Clerk | An email made of star lines drifts into an extraction ring; the date and title stars split out and land on a star calendar grid as a draft event, which lights only once an approval star is pressed. |
| AI Snake Game | Stars leave the spiral to build a Snake board, then a star-ribbon snake plays three training games for one food star at a time: random moves at game 1, steadier at game 40, and no random moves by game 80. |
| Desktop Pet (black hole) | A small rock made of disc stars orbits the black hole and slowly spirals in; you can grab and fling it, and it always falls back. |

## Other prototypes (for comparison)
- `mockups/v4/map.html`: the minimal vector point cloud (navy and coral, points coloured by domain).
- `mockups/v4/halftone.html`: ink on paper, where hovered projects decode into halftone prints.

## Ruled out
- Everything in the `mockups/` image rounds (all rejected).
- Neon or cyan "AI dashboard" looks, the beige paper and serif journal look, Swiss-minimal or topographic styles, and the Codex engineering-instrument redesign.
- Flat animations drawn on top of the galaxies, and halftone portraits made from weak or AI-looking images.

## Content decisions
- Remove the Real-Time Chat and E-Hotel projects (their repos are private).
- Private repos get no GitHub link (JobApply, RAG, Ark Eagle, ArkProject, Video To Reels, Calendar Clerk, Desktop Pet).
- Trimmed Housing Price Prediction (weakest project); its plugin file stays in `anims/` unused. AI Snake Game is back in.
- Education: Computer Engineering, University of Ottawa, Dec 2027.
- Resume: AugustZhang_Resume_Final.pdf (from Desktop/Job; not in the repo yet, so the Resume link 404s until it's added).
- Keep the GoatCounter script.
