# In-galaxy animation plugins

Each file registers one animation, played while you are flown into that project's galaxy:

```js
GALAXY_ANIMS['snake'] = function (api) {
  // build state once
  return {
    spiralDim: 0,            // 0..1, how much to dim the galaxy's own spiral (set any time)
    update(dt) { },          // dt in seconds; only called while inside the galaxy
    draw(ctx, cx, cy, R, alpha) { }  // screen px; cx,cy = galaxy core; R = galaxy radius; alpha = fade 0..1
  };
};
```

`api`: `key, rng() (seeded 0..1), TAU, clamp, mix, rgba(rgb, a), ease3, mono (font)`,
`meta` (title, desc, tech, stats), `chunks` (resume chunks: `{ text, ... }`),
`dark()`, `accent()` ([r,g,b]), `ink`, `colors()` (4 galaxy star colours faint to bright),
`grid()` (image/logo luminance grid `{ cols, rows, lum, al }` or null; only league, minecraft, sinai, senseway),
`stars(max)` (this frame's screen positions of the galaxy's own stars, innermost first: `{ n, x, y, b }`),
draw helpers `dot(ctx,x,y,r,rgb,a)`, `ring(ctx,x,y,r,rgb,a,lw)`, `arc(ctx,x,y,r,a0,a1,rgb,a,lw)`, `line(ctx,x0,y0,x1,y1,rgb,a,lw)`, `text(ctx,s,x,y,rgb,a)`.
`lightBoost({ dots })`: call it first to give the draw helpers and `rgba` a little more weight in the light theme only (higher alpha, slightly larger dots and lines, darker text ink; the accent is kept). Dark passes straight through. Pass `{ dots: false }` for dense dot clusters.

Build from the galaxy's own stars: read `api.stars()`, raise `spiralDim`, and draw those stars moving
toward your targets, so the animation is the galaxy and not an overlay.

Test: `http://localhost:8000/index.html?open=snake&dtmax=0.7`
(`dtmax` lets time advance when the automated browser throttles frames to about 1.5 fps).
