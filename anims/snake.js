// In-galaxy animation for 'snake' (AI Snake Game). See anims/README.md for the API.
// A snake made of the galaxy's own stars hunts the brightest stars; each star it eats
// leaves its place in the spiral and joins the body. Three generations per loop:
//   gen 1 wanders and crashes into the galaxy's rim,
//   gen 2 is steadier but coils into its own tail,
//   gen 3 beelines from star to star and survives, the longest yet.
// When a generation ends its stars drift back home. Loop is about 21 s.
GALAXY_ANIMS['snake'] = function (api) {
  const { TAU, clamp, mix, rng } = api;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const NS = 100000;        // all of the galaxy's stars (capped by the galaxy)
  const BA = [0.16, 0.26, 0.4, 0.52], BS = [1.0, 1.15, 1.45, 1.9];
  const SP = 0.075;         // segment spacing (units of R)
  const SUB = 4;            // trail samples per segment
  const STEP = SP / SUB;
  const H = 1 / 60;         // internal sub-step
  const FOODN = 10;
  const DIM = 0.9;

  // One loop = these three generations. life = seconds of hunting before the ending,
  // cap = max length, min = length gen 3 keeps hunting for (up to 2.5 s extra).
  const GENS = [
    { v: 0.22, om: 1.8, wander: 1.6, smart: 0.15, life: 2.4, cap: 4, end: 'crash' },
    { v: 0.26, om: 2.8, wander: 0.7, smart: 0.5, life: 4.3, cap: 7, end: 'bite' },
    { v: 0.37, om: 4.4, wander: 0.1, smart: 1, life: 6.0, cap: 14, min: 11, end: 'win' }
  ];
  const FORM = 0.6, DISS = 1.6, GAP = 0.35;

  let T = 0, total = 0, gi = -1, best = 0, bestFlash = 0;
  let view = null;          // last { cx, cy, R } from draw
  let phase = 'wait', pt = 0;
  let hx = 0, hy = 0, th = 0, trail = [], acc = 0, wob0 = 0;
  let segs = [];            // { src: star index, join: 0..1 }
  let tgt = -1, retarget = 0, chase = 0, skip = -1;
  let food = [];            // { i: star index, k: 0..1 fade-in }
  const flashes = [];       // { x, y, t, big } normalised, accent
  let deathAt = null, winGlow = 0;
  const G = () => GENS[Math.max(0, gi)];

  function stars() { return api.stars(NS); }
  // Normalised star position (relative to core, in units of R).
  function sp(S, i) { return [(S.x[i] - view.cx) / view.R, (S.y[i] - view.cy) / view.R]; }
  const used = i => food.some(f => f.i === i) || segs.some(s => s.src === i);
  // Point on the body path at distance D behind the head. The head leads trail[0] by acc,
  // so interpolating here keeps segments gliding instead of hopping between samples.
  function at(D) {
    if (!trail.length) return [hx, hy];
    if (D <= acc) { const f = acc > 0 ? D / acc : 0; return [lerp(hx, trail[0][0], f), lerp(hy, trail[0][1], f)]; }
    const q = (D - acc) / STEP, i = Math.floor(q), f = q - i;
    if (i >= trail.length - 1) return trail[trail.length - 1].slice();
    return [lerp(trail[i][0], trail[i + 1][0], f), lerp(trail[i][1], trail[i + 1][1], f)];
  }

  function pickFood(S) {
    for (let tries = 0; tries < 80; tries++) {
      const i = Math.floor(rng() * S.n);
      if (S.b[i] < 2 || used(i)) continue;
      const [x, y] = sp(S, i), r = Math.hypot(x, y);
      if (!(r > 0.32 && r < 0.6)) continue;
      if (Math.hypot(x - hx, y - hy) < 0.2) continue;
      return i;
    }
    return -1;
  }

  function nearestStar(S, x, y, taken) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < S.n; i++) {
      if (taken.has(i) || used(i) || S.x[i] < -1e3) continue;
      const dx = (S.x[i] - view.cx) / view.R - x, dy = (S.y[i] - view.cy) / view.R - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  function spawn() {
    const S = stars();
    gi++;
    // Spawn a short way from a food star, heading roughly toward it (sloppier in early gens).
    const f0 = food.length ? food[Math.floor(rng() * food.length)] : null;
    const [fx, fy] = f0 ? sp(S, f0.i) : [0.45, 0];
    const a = Math.atan2(fy, fx) + (rng() < 0.5 ? 1 : -1) * (1.35 + 0.2 * rng());
    hx = fx - Math.cos(a) * 0.24; hy = fy - Math.sin(a) * 0.24;
    th = Math.atan2(fy - hy, fx - hx) + (rng() - 0.5) * 0.2;
    wob0 = rng() * TAU;
    trail = [];
    const n0 = 3;
    for (let k = 0; k <= (n0 + 1) * SUB; k++) trail.push([hx - Math.cos(th) * STEP * k, hy - Math.sin(th) * STEP * k]);
    const taken = new Set();
    segs = [];
    food = food.filter(f => { const [x, y] = sp(S, f.i); return Math.hypot(x - hx, y - hy) > 0.2; });
    for (let k = 0; k < n0; k++) {
      const p = trail[k * SUB], i = nearestStar(S, p[0], p[1], taken);
      if (i < 0) continue;
      taken.add(i);
      segs.push({ src: i, join: 0 });
    }
    tgt = -1; retarget = 0; acc = 0; winGlow = 0; deathAt = null;
    phase = 'form'; pt = 0;
  }

  function die(big) {
    deathAt = segs.map((s, k) => at(k * SP));
    if (big) flashes.push({ x: hx, y: hy, t: 0, big: 1 });
    if (gi > 0 && segs.length > best) bestFlash = 1;
    best = Math.max(best, segs.length);
    phase = 'die'; pt = 0;
  }

  function step(S, h) {
    const g = G();
    // Targeting: gen 1 picks noisily and changes its mind; later gens go for the nearest star.
    retarget -= h; chase += h;
    if (chase > 2.2) { skip = tgt >= 0 && food[tgt] ? food[tgt].i : -1; tgt = -1; chase = 0; }  // circling: give up on it
    if (phase === 'run' && (tgt < 0 || !food[tgt] || retarget <= 0)) {
      let bi = -1, bd = Infinity;
      food.forEach((f, j) => {
        if (f.k < 0.3 || f.i === skip) return;
        const [x, y] = sp(S, f.i), d = Math.hypot(x - hx, y - hy) * (1 + (1 - g.smart) * 3 * rng());
        if (d < bd) { bd = d; bi = j; }
      });
      if (bi !== tgt) chase = 0;
      tgt = bi;
      retarget = 1.0 + 8 * g.smart + rng();
    }
    let des = th, om = g.om, v = g.v, wander = g.wander;
    if (phase === 'end') {
      if (g.end === 'crash') { des = Math.atan2(hy, hx); om = 2.4; v = g.v * 1.5; }
      else if (g.end === 'bite') {
        const p = trail[Math.min(trail.length - 1, Math.max(3, Math.floor(segs.length * 0.6)) * SUB)];
        des = Math.atan2(p[1] - hy, p[0] - hx); om = 5.5; wander = 0;
      } else { des = th + 0.6; om = 1.2; v = g.v * Math.max(0, 1 - pt / 1.6); wander = 0; }
    } else if (tgt >= 0 && food[tgt]) {
      const [x, y] = sp(S, food[tgt].i);
      des = Math.atan2(y - hy, x - hx);
    }
    // Keep inside the disc (except when it is about to crash into the rim).
    const r = Math.hypot(hx, hy);
    // ...and out of the bright core, so it travels the mid and outer disc.
    if (r > 0.64 && !(phase === 'end' && g.end === 'crash')) {
      const w = clamp((r - 0.64) / 0.1), inA = Math.atan2(-hy, -hx);
      des = Math.atan2(lerp(Math.sin(des), Math.sin(inA), w), lerp(Math.cos(des), Math.cos(inA), w));
    } else if (r < 0.28 && phase !== 'end') {
      const w = 0.85 * clamp((0.28 - r) / 0.1), outA = Math.atan2(hy, hx);
      des = Math.atan2(lerp(Math.sin(des), Math.sin(outA), w), lerp(Math.cos(des), Math.cos(outA), w));
    }
    let d = des - th;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const wob = wander * (Math.sin(T * 1.9 + wob0) + 0.7 * Math.sin(T * 3.3 + wob0 * 2.1));
    th += clamp(d, -om * h, om * h) + wob * h;
    hx += Math.cos(th) * v * h; hy += Math.sin(th) * v * h;
    // Trail sampled by distance so segments sit at a fixed spacing.
    acc += v * h;
    while (acc >= STEP) { acc -= STEP; trail.unshift([hx, hy]); }
    const keep = (segs.length + 2) * SUB + 2;
    if (trail.length > keep) trail.length = keep;

    // Eat (a dying snake no longer eats).
    if (phase !== 'end' || g.end === 'win') for (let j = food.length - 1; j >= 0; j--) {
      const f = food[j], [x, y] = sp(S, f.i);
      if (f.k > 0.5 && Math.hypot(x - hx, y - hy) < 0.06) {
        flashes.push({ x, y, t: 0 });
        segs.push({ src: f.i, join: 0 });
        food.splice(j, 1);
        if (tgt === j) { tgt = -1; chase = 0; } else if (tgt > j) tgt--;
      }
    }
    if (phase === 'run' && ((pt > g.life && segs.length >= (g.min || 0)) || pt > g.life + 2.5 || segs.length >= g.cap)) { phase = 'end'; pt = 0; tgt = -1; }
    if (phase !== 'end') return;
    if (g.end === 'crash' && (r > 0.8 || pt > 1.8)) die(true);
    else if (g.end === 'bite') {
      for (let k = 3; k < segs.length; k++) {
        const p = trail[k * SUB];
        if (p && Math.hypot(p[0] - hx, p[1] - hy) < SP * 0.7) { die(true); return; }
      }
      if (pt > 2.2) die(true);
    } else if (g.end === 'win') {
      winGlow = smooth(pt / 0.8);
      best = Math.max(best, segs.length);
      if (pt > 0.05 && pt - h <= 0.05) { flashes.push({ x: hx, y: hy, t: 0, big: 1 }); best = Math.max(best, segs.length); bestFlash = 1; }
      if (pt > 2.4) die(false);
    }
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      if (!view) return;
      const S = stars();
      let left = Math.min(dt, 1);
      while (left > 1e-6) {
        const h = Math.min(H, left);
        left -= h; T += h; total += h;
        bestFlash = Math.max(0, bestFlash - h * 0.5);
        for (let j = flashes.length - 1; j >= 0; j--) if ((flashes[j].t += h) > 1.2) flashes.splice(j, 1);
        food.forEach(f => { f.k = Math.min(1, f.k + h * 1.2); });
        // The galaxy turns; a food star that drifts toward the rim or the core is released and replaced.
        for (let j = food.length - 1; j >= 0; j--) {
          const [x, y] = sp(S, food[j].i);
          const rr = Math.hypot(x, y);
          if (!(rr < 0.66 && rr > 0.3)) { food.splice(j, 1); if (tgt === j) tgt = -1; else if (tgt > j) tgt--; }
        }
        while (food.length < FOODN) { const i = pickFood(S); if (i < 0) break; food.push({ i, k: 0 }); }
        segs.forEach(s => { s.join = Math.min(1, s.join + h * 1.6); });
        pt += h;
        if (phase === 'wait') { if (pt > (gi < 0 ? 0.7 : GAP)) spawn(); }
        else if (phase === 'form') { step(S, h * smooth(pt / FORM)); if (pt > FORM) { phase = 'run'; pt = 0; } }
        else if (phase === 'run' || phase === 'end') step(S, h);
        else if (phase === 'die' && pt > DISS) {
          segs = []; trail = []; phase = 'wait'; pt = 0;
          if (gi >= GENS.length - 1) { gi = -1; best = 0; pt = 0.7 - GAP; }  // next loop
        }
      }
      self.spiralDim = DIM * smooth(total / 1.0);
    },
    draw(ctx, cx, cy, R, alpha) {
      view = { cx, cy, R };
      if (alpha < 0.01) return;
      const S = stars(), C = api.colors(), A = api.accent(), dark = api.dark();
      const vis = self.spiralDim / DIM;
      const X = x => cx + x * R, Y = y => cy + y * R;
      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

      // The galaxy's own stars, redrawn; stars in the snake's body have left their place.
      const out = new Set(segs.map(s => s.src));
      if (vis > 0.005) for (let b = 0; b < 4; b++) {
        const r = BS[b] * 0.85, a = Math.min(1, BA[b] * vis * alpha * (dark ? 0.42 : 0.6));
        ctx.fillStyle = api.rgba(C[b], a);
        for (let i = 0; i < S.n; i++) {
          if (S.b[i] !== b || out.has(i) || S.x[i] < -1e3) continue;
          ctx.fillRect(S.x[i] - r / 2, S.y[i] - r / 2, r, r);
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      // Food: real bright stars, lifted to a clear mid level with a soft halo.
      food.forEach((f, j) => {
        if (S.x[f.i] < -1e3) return;
        const [x, y] = sp(S, f.i), tw = 0.85 + 0.15 * Math.sin(T * 2.3 + f.i);
        api.dot(ctx, X(x), Y(y), 2.8, C[3], alpha * f.k * 0.75 * tw);
        api.dot(ctx, X(x), Y(y), 7, C[3], alpha * f.k * (dark ? 0.09 : 0.07));
        if (j === tgt && phase === 'run' && G().smart > 0.2) api.ring(ctx, X(x), Y(y), 9, C[2], alpha * 0.4 * f.k, 0.8);
      });

      // Flashes: small accent ring where a star is eaten, a big one where a generation ends.
      flashes.forEach(f => {
        const e = clamp(f.t / (f.big ? 1.2 : 0.7));
        api.ring(ctx, X(f.x), Y(f.y), f.big ? 5 + 22 * e : 3 + 10 * e, A, alpha * (1 - e) * 0.85, f.big ? 1.2 : 1);
        api.dot(ctx, X(f.x), Y(f.y), f.big ? 3 : 2.2, A, alpha * (1 - e) * (1 - e));
      });

      // Body: each segment is a star that slides from its home into place along the head's path,
      // and drifts back home when the generation ends. A soft spine joins the settled segments.
      const n = segs.length;
      if (n && trail.length) {
        const e = phase === 'die' ? api.ease3(pt / (DISS * 0.85)) : 0;
        const P = [];
        for (let k = 0; k < n; k++) {
          const s = segs[k];
          let p = at(k * SP);
          if (phase === 'die' && deathAt && deathAt[k]) p = deathAt[k];
          let x = p[0], y = p[1];
          const home = S.x[s.src] < -1e3 ? [x, y] : sp(S, s.src);
          const j = api.ease3(s.join);
          x = lerp(home[0], x, j); y = lerp(home[1], y, j);
          if (e > 0) { x = lerp(x, home[0], e); y = lerp(y, home[1], e); }
          const u = n > 1 ? k / (n - 1) : 0;
          let col = mix(C[3], C[2], 0.45 * u);
          if (winGlow > 0) col = mix(col, A, winGlow * (k === 0 ? 0.95 : 0.6 * (1 - 0.6 * u)));
          P.push({ x: X(x), y: Y(y), j, u, col, rad: (k === 0 ? 6.5 : 5.2 - 2.2 * u) * (1 - 0.6 * e), a: alpha * (k === 0 ? 1 : 0.95 - 0.4 * u) * lerp(0.5, 1, j) * (1 - e * 0.7) });
        }
        ctx.lineCap = 'round';
        if (phase !== 'die') for (let k = 1; k < n && P[k].j > 0.85; k++) {
          const p0 = P[k - 1], p1 = P[k];
          api.line(ctx, p0.x, p0.y, p1.x, p1.y, p1.col, p1.a * 0.45, p1.rad * 1.5);
        }
        for (let k = n - 1; k >= 0; k--) api.dot(ctx, P[k].x, P[k].y, P[k].rad, P[k].col, P[k].a);
        // Head: brightest, with a faint ring so it reads as the front.
        api.ring(ctx, P[0].x, P[0].y, P[0].rad + 4, P[0].col, P[0].a * 0.35, 1);
      }

      // Label: generation, current length, best so far.
      if (gi >= 0) {
        const cw = ctx.canvas.clientWidth || ctx.canvas.width, chh = ctx.canvas.clientHeight || ctx.canvas.height;
        const ly = Math.min(cy + R * 0.82, chh - 60), lx = clamp(cx, 140, cw - 140);
        const s = `gen ${gi + 1}` + (n ? `   length ${n}` : '') + (gi > 0 ? `   best ${best}` : '');
        api.text(ctx, s, lx, ly, bestFlash > 0 ? mix(C[2], A, bestFlash) : C[2], alpha * 0.8 * vis);
      }
      ctx.restore();
    }
  };
  return self;
};
