// In-galaxy animation for 'pet' (the black hole of unfinished projects).
// A small rock made from the galaxy's own stars orbits the disc, can be grabbed
// in screen space, and eventually spirals through the horizon before returning.
GALAXY_ANIMS['pet'] = function (api) {
  const { TAU, clamp } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const GM = 0.22, DRAG = 0.03;
  const HORIZON = 0.21, SOFT_EDGE = 1.05, MAX_R = 1.4, GONE = 1.4;

  // Stable, seeded local offsets make the gathered dots read as one lumpy rock.
  const ROCK_DOTS = [];
  for (let j = 0; j < 38; j++) {
    const an = j / 38 * TAU + (api.rng() - 0.5) * 0.16;
    const rr = 0.46 + api.rng() * 0.56;
    ROCK_DOTS.push({ x: Math.cos(an) * rr, y: Math.sin(an) * rr * 0.78, r: 0.62 + api.rng() * 0.62 });
  }

  // Disc-plane coordinates (x along the disc, y across it) to screen and back.
  let view = { cx: 0, cy: 0, R: 1 };
  const H = () => (api.hole ? api.hole() : { rot: 0, ry: 0.13, flip: 1 });
  function toScr(px, py) {
    const h = H(), yy = py * h.ry * h.flip, c = Math.cos(h.rot), s = Math.sin(h.rot);
    return [view.cx + (px * c - yy * s) * view.R, view.cy + (px * s + yy * c) * view.R];
  }
  // Inverse projection uses a modest flattening floor. A nearly edge-on disc
  // cannot encode 200 px of screen motion as a meaningful plane coordinate.
  function fromScr(sx, sy) {
    const h = H(), dx = (sx - view.cx) / view.R, dy = (sy - view.cy) / view.R;
    const c = Math.cos(h.rot), s = Math.sin(h.rot), ry = Math.max(0.34, Math.abs(h.ry) || 0.34);
    const u = dx * c + dy * s, v = (-dx * s + dy * c) / (ry * (h.flip || 1));
    return [u, clamp(v, -MAX_R, MAX_R)];
  }
  function limitRadius() {
    const r = Math.hypot(x, y);
    if (r > MAX_R) { x *= MAX_R / r; y *= MAX_R / r; }
  }

  let x = 1, y = 0, vx = 0, vy = 0;
  let gone = 0, held = false, T = 0;
  let last = null, heldScreen = null;
  const trail = [];
  function spawn() {
    const a = api.rng() * TAU, r = 1.05, v = Math.sqrt(GM / r);
    x = Math.cos(a) * r; y = Math.sin(a) * r;
    vx = -Math.sin(a) * v; vy = Math.cos(a) * v;
    trail.length = 0; heldScreen = null;
  }
  spawn();

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      if (held) return;
      if (gone > 0) { gone -= dt; if (gone <= 0) spawn(); return; }
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const r = Math.max(0.05, Math.hypot(x, y));
        const a = GM / (r * r * r);
        vx -= x * a * h; vy -= y * a * h;
        // Natural orbital drag, with a firm additional falloff outside the core.
        const outer = smooth((r - SOFT_EDGE) / (MAX_R - SOFT_EDGE));
        // Near the horizon the drag rises, so the final plunge is quick and the rock spends
        // most of the loop at full size out in the disc.
        const inner = smooth((0.45 - r) / 0.2);
        const f = Math.exp(-(DRAG + outer * 1.9 + inner * 0.6) * h);
        vx *= f; vy *= f;
        if (outer > 0) { vx -= x / r * outer * 0.95 * h; vy -= y / r * outer * 0.95 * h; }
        x += vx * h; y += vy * h;
        let rr = Math.hypot(x, y);
        if (rr > MAX_R) {
          x *= MAX_R / rr; y *= MAX_R / rr; rr = MAX_R;
          const out = (x * vx + y * vy) / rr;
          if (out > 0) { vx -= out * x / rr; vy -= out * y / rr; }
        }
        if (rr < HORIZON) { gone = GONE; return; }
      }
      trail.unshift([x, y]);
      if (trail.length > 18) trail.length = 18;
    },
    // Grab hooks (see index.html grabbable()).
    hit(sx, sy) {
      if (gone > 0) return false;
      const p = held && heldScreen ? heldScreen : toScr(x, y);
      return Math.hypot(sx - p[0], sy - p[1]) < Math.max(34, view.R * 0.13);
    },
    grab(sx, sy) {
      held = true; trail.length = 0;
      heldScreen = [sx, sy];
      last = { sx, sy, t: performance.now(), v: [0, 0] };
    },
    drag(sx, sy) {
      if (!held) return;
      const now = performance.now(), dt = Math.max(0.008, (now - last.t) / 1000);
      last.v[0] = 0.6 * last.v[0] + 0.4 * (sx - last.sx) / dt;
      last.v[1] = 0.6 * last.v[1] + 0.4 * (sy - last.sy) / dt;
      last.sx = sx; last.sy = sy; last.t = now;
      // Keep the visual center exactly under the pointer while held. Physics is
      // suspended, so the edge-on disc cannot compress vertical dragging.
      heldScreen = [sx, sy];
      [x, y] = fromScr(sx, sy);
      limitRadius();
    },
    release() {
      if (!held) return;
      held = false;
      if (heldScreen) [x, y] = fromScr(heldScreen[0], heldScreen[1]);
      limitRadius();
      // Convert screen velocity back through the same regularized inverse. The
      // cap prevents a fast pointer sample from creating a wide orbit.
      const h = H(), c = Math.cos(h.rot), s = Math.sin(h.rot), ry = Math.max(0.34, Math.abs(h.ry) || 0.34);
      const sv = last ? last.v : [0, 0];
      let pvx = (sv[0] * c + sv[1] * s) / Math.max(1, view.R);
      let pvy = (-sv[0] * s + sv[1] * c) / Math.max(1, view.R * ry) * (h.flip || 1);
      const mag = Math.hypot(pvx, pvy), cap = 0.65;
      if (mag > cap) { pvx *= cap / mag; pvy *= cap / mag; }
      vx = pvx; vy = pvy; heldScreen = null; last = null;
    },
    draw(ctx, cx, cy, R, alpha) {
      view = { cx, cy, R };
      if (alpha < 0.01) return;
      const C = api.colors(), A = api.accent();
      if (gone > 0) {
        // The accent is reserved for the swallow moment.
        const g = 1 - gone / GONE;
        api.ring(ctx, cx, cy, R * (HORIZON + 0.12 * g), A, alpha * 0.6 * (1 - g), 1.2);
        return;
      }
      const r = Math.hypot(x, y), [px, py] = held && heldScreen ? heldScreen : toScr(x, y);
      trail.forEach((p, j) => {
        if (!j) return;
        const [tx, ty] = toScr(p[0], p[1]);
        api.dot(ctx, tx, ty, 1.2, C[2], alpha * 0.22 * (1 - j / trail.length));
      });
      const near = held ? 0 : smooth((0.34 - r) / 0.13);
      const size = R * 0.1 * (1 - 0.7 * near);
      const behind = !held && y < 0 && Math.hypot(px - cx, py - cy) < HORIZON * R;
      if (!behind) drawRock(ctx, px, py, size, alpha, near, C, held, Math.atan2(cy - py, cx - px));
    }
  };

  function drawRock(ctx, px, py, size, alpha, near, C, isHeld, toward) {
    const S = api.stars(96);
    if (!S.n) return;
    const gather = smooth((T - 0.25) / 1.35);
    self.spiralDim = 0.82 * gather;
    const count = Math.min(ROCK_DOTS.length, S.n), stretch = 1 + 2.5 * near;
    for (let j = 0; j < count; j++) {
      const sx = S.x[j], sy = S.y[j];
      if (sx < -1e3) continue;
      const d = ROCK_DOTS[j];
      const ux = d.x * size * stretch, uy = d.y * size / Math.sqrt(stretch);
      const tx = px + ux * Math.cos(toward) - uy * Math.sin(toward);
      const ty = py + ux * Math.sin(toward) + uy * Math.cos(toward);
      const qx = sx + (tx - sx) * gather, qy = sy + (ty - sy) * gather;
      const col = C[Math.min(3, S.b[j] || 0)];
      const a = alpha * (0.08 + 0.92 * gather);
      api.dot(ctx, qx, qy, Math.max(0.8, size * 0.075 * d.r), col, a);
    }
    // Eyes stay legible as two tiny marks over the gathered star body.
    const er = size * (0.18 + 0.1 * near), ink = api.ink;
    [-1, 1].forEach(side => {
      const ex = px + side * size * 0.25, ey = py - size * 0.12;
      if (isHeld) api.line(ctx, ex - er, ey, ex + er, ey, ink, alpha * 0.9, 1.3);
      else {
        api.dot(ctx, ex, ey, er, [255, 255, 255], alpha * 0.9);
        api.dot(ctx, ex + size * 0.02, ey, er * 0.46, ink, alpha);
      }
    });
  }
  return self;
};
