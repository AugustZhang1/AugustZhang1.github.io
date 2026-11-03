// In-galaxy animation for 'snake'. See anims/README.md for the API.
// A snake made of the galaxy's own stars hunts other stars. Each eaten star joins its body.
// It eventually bites its own tail, its stars drift back home, and the next generation
// spawns: faster, straighter, longer-lived.
GALAXY_ANIMS['snake'] = function (api) {
  const { TAU, clamp, mix, rng } = api;
  const lerp = (a, b, t) => a + (b - a) * t;
  const SP = 0.04;          // segment spacing (units of R)
  const SUB = 4;            // trail samples per segment
  const STEP = SP / SUB;
  const H = 1 / 60;         // internal sub-step
  const FOODN = 6;

  let T = 0, gen = 0, best = 0, bestFlash = 0;
  let view = null;          // last { cx, cy, R } from draw
  let phase = 'wait', pt = 0;
  let hx = 0, hy = 0, th = 0, trail = [], acc = 0;
  let segs = [];            // { src: star index, join: 0..1 }
  let tgt = -1, retarget = 0, curlT = 0, cap = 6;
  let food = [];            // { i: star index, k: 0..1 fade-in }
  const flashes = [];       // { x, y, t } normalised, accent
  const eaten = new Set();
  let deathAt = null;       // { x, y } snapshot of segment positions at death

  // Normalised star position (relative to core, in units of R).
  function sp(S, i) {
    return [(S.x[i] - view.cx) / view.R, (S.y[i] - view.cy) / view.R];
  }
  function stars() { return api.stars(1500); }

  // Generation skill: speed, turning, wander, how long it survives.
  const skill = () => {
    const g = Math.min(gen, 8) - 1;
    return { v: 0.15 + 0.03 * g, om: 1.5 + 0.45 * g, wander: 1.8 / (1 + 0.7 * g), smart: clamp(g / 4) };
  };

  function pickFood(S) {
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(rng() * S.n);
      if (S.b[i] < 2 || eaten.has(i) || food.some(f => f.i === i) || segs.some(s => s.src === i)) continue;
      const [x, y] = sp(S, i), r = Math.hypot(x, y);
      if (r < 0.2 || r > 0.8) continue;
      if (Math.hypot(x - hx, y - hy) < 0.12) continue;
      return i;
    }
    return -1;
  }

  function nearestStar(S, x, y, used) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < S.n; i++) {
      if (used.has(i)) continue;
      const dx = (S.x[i] - view.cx) / view.R - x, dy = (S.y[i] - view.cy) / view.R - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  function spawn() {
    const S = stars();
    gen++;
    cap = Math.min(5 + 3 * gen + Math.floor(rng() * 2), 30);
    eaten.clear();
    const a = rng() * TAU, r = 0.45 + 0.2 * rng();
    hx = Math.cos(a) * r; hy = Math.sin(a) * r;
    th = a + Math.PI / 2;
    trail = [];
    const n0 = 3;
    for (let k = 0; k <= (n0 + 1) * SUB; k++) trail.push([hx - Math.cos(th) * STEP * k, hy - Math.sin(th) * STEP * k]);
    const used = new Set();
    segs = [];
    for (let k = 0; k < n0; k++) {
      const p = trail[k * SUB], i = nearestStar(S, p[0], p[1], used);
      used.add(i);
      segs.push({ src: i, join: 0 });
    }
    food = food.filter(f => !used.has(f.i));
    tgt = -1; retarget = 0; curlT = 0; acc = 0;
    phase = 'form'; pt = 0;
  }

  function die() {
    phase = 'die'; pt = 0;
    deathAt = segs.map((s, k) => trail[Math.min(trail.length - 1, k * SUB)].slice());
    flashes.push({ x: hx, y: hy, t: 0, big: 1 });
    if (segs.length > best) { best = segs.length; bestFlash = 1; }
  }

  function step(S, h) {
    const sk = skill();
    // Choose a target: early generations pick at random and change their mind; later ones go nearest.
    retarget -= h;
    if (phase === 'run' && (tgt < 0 || !food[tgt] || retarget <= 0)) {
      let bi = -1, bd = Infinity;
      food.forEach((f, j) => {
        const [x, y] = sp(S, f.i), d = Math.hypot(x - hx, y - hy) * (1 + (1 - sk.smart) * 3 * rng());
        if (d < bd) { bd = d; bi = j; }
      });
      tgt = bi;
      retarget = 1.2 + 6 * sk.smart + rng() * 1.5;
    }
    let des = th;
    if (phase === 'curl') {
      const p = trail[Math.min(trail.length - 1, Math.floor(segs.length * 0.55) * SUB)];
      des = Math.atan2(p[1] - hy, p[0] - hx);
    } else if (tgt >= 0 && food[tgt]) {
      const [x, y] = sp(S, food[tgt].i);
      des = Math.atan2(y - hy, x - hx);
    }
    // Keep inside the disc.
    const r = Math.hypot(hx, hy);
    if (r > 0.82 && phase !== 'curl') {
      const w = clamp((r - 0.82) / 0.1), inA = Math.atan2(-hy, -hx);
      des = Math.atan2(lerp(Math.sin(des), Math.sin(inA), w), lerp(Math.cos(des), Math.cos(inA), w));
    }
    let d = des - th;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const om = phase === 'curl' ? 3.2 : sk.om;
    const wob = sk.wander * (Math.sin(T * 1.7 + gen) + 0.6 * Math.sin(T * 3.1 + gen * 2.3));
    th += clamp(d, -om * h, om * h) + wob * h;
    const v = phase === 'curl' ? Math.max(sk.v, 0.2) : sk.v;
    hx += Math.cos(th) * v * h; hy += Math.sin(th) * v * h;
    // Trail sampled by distance so segments sit at a fixed spacing.
    acc += v * h;
    while (acc >= STEP) {
      acc -= STEP;
      trail.unshift([hx, hy]);
    }
    const keep = (segs.length + 2) * SUB + 2;
    if (trail.length > keep) trail.length = keep;

    // Eat.
    for (let j = food.length - 1; j >= 0; j--) {
      const f = food[j], [x, y] = sp(S, f.i);
      if (f.k > 0.5 && Math.hypot(x - hx, y - hy) < 0.03) {
        flashes.push({ x, y, t: 0 });
        eaten.add(f.i);
        segs.push({ src: f.i, join: 0, fx: x, fy: y });
        food.splice(j, 1);
        if (tgt === j) tgt = -1; else if (tgt > j) tgt--;
        if (phase === 'run' && segs.length >= cap) { phase = 'curl'; curlT = 0; }
      }
    }
    // Bite own tail.
    for (let k = 5; k < segs.length; k++) {
      const p = trail[k * SUB];
      if (p && segs[k].join > 0.9 && Math.hypot(p[0] - hx, p[1] - hy) < SP * 0.6) { die(); return; }
    }
    if (phase === 'curl') { curlT += h; if (curlT > 6) die(); }
  }

  return {
    spiralDim: 0.6,
    update(dt) {
      if (!view) return;
      const S = stars();
      let left = Math.min(dt, 1);
      while (left > 1e-6) {
        const h = Math.min(H, left);
        left -= h; T += h;
        bestFlash = Math.max(0, bestFlash - h * 0.6);
        for (let j = flashes.length - 1; j >= 0; j--) if ((flashes[j].t += h) > 1.2) flashes.splice(j, 1);
        food.forEach(f => { f.k = Math.min(1, f.k + h * 1.5); });
        while (food.length < FOODN) { const i = pickFood(S); if (i < 0) break; food.push({ i, k: 0 }); }
        segs.forEach(s => { s.join = Math.min(1, s.join + h * 1.6); });
        pt += h;
        if (phase === 'wait') { if (pt > 0.6) spawn(); }
        else if (phase === 'form') { step(S, h * clamp(pt / 0.9)); if (pt > 0.9) { phase = 'run'; pt = 0; } }
        else if (phase === 'run' || phase === 'curl') step(S, h);
        else if (phase === 'die') { if (pt > 2.2) { segs = []; trail = []; phase = 'wait'; pt = 0; } }
      }
    },
    draw(ctx, cx, cy, R, alpha) {
      view = { cx, cy, R };
      if (alpha < 0.01) return;
      const S = stars(), C = api.colors(), A = api.accent();
      const X = x => cx + x * R, Y = y => cy + y * R;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // Food: real bright stars, lifted a little above the dimmed spiral.
      food.forEach((f, j) => {
        const [x, y] = sp(S, f.i), tw = 0.8 + 0.2 * Math.sin(T * 2.3 + f.i);
        api.dot(ctx, X(x), Y(y), 2.1, C[3], alpha * f.k * 0.9 * tw);
        api.dot(ctx, X(x), Y(y), 5, C[3], alpha * f.k * 0.08);
        if (j === tgt && phase === 'run') api.ring(ctx, X(x), Y(y), 5.5, C[2], alpha * 0.35 * f.k, 0.8);
      });

      // Eaten-star flashes and the death flash.
      flashes.forEach(f => {
        const e = clamp(f.t / (f.big ? 1.2 : 0.7));
        api.ring(ctx, X(f.x), Y(f.y), (f.big ? 4 + 18 * e : 2 + 9 * e), A, alpha * (1 - e) * 0.8, 1);
        api.dot(ctx, X(f.x), Y(f.y), f.big ? 2.6 : 2, A, alpha * (1 - e) * (1 - e));
      });

      // Body: each segment is a star that slides from its home into place along the head's path.
      const n = segs.length;
      if (n && trail.length) {
        const fade = phase === 'die' ? clamp(pt / 1.6) : 0;
        const e = api.ease3(fade);
        for (let k = n - 1; k >= 0; k--) {
          const s = segs[k];
          let p = trail[Math.min(trail.length - 1, k * SUB)];
          if (phase === 'die' && deathAt) p = deathAt[k] || p;
          let x = p[0], y = p[1];
          const home = s.src >= 0 ? sp(S, s.src) : [x, y];
          const j = api.ease3(s.join);
          x = lerp(home[0], x, j); y = lerp(home[1], y, j);
          if (e > 0) { x = lerp(x, home[0], e); y = lerp(y, home[1], e); }
          const u = n > 1 ? k / (n - 1) : 0;
          const rad = k === 0 ? 3.1 : 2.6 - 1.1 * u;
          const col = k === 0 ? C[3] : mix(C[3], C[2], u);
          const a = alpha * (k === 0 ? 1 : 0.95 - 0.45 * u) * lerp(0.6, 1, j) * (1 - e * 0.75);
          api.dot(ctx, X(x), Y(y), rad * (1 - 0.4 * e), col, a);
        }
      }

      // Label.
      const cw = ctx.canvas.clientWidth || ctx.canvas.width, chh = ctx.canvas.clientHeight || ctx.canvas.height;
      const ly = Math.min(cy + R * 0.95, chh - 48), lx = clamp(cx, 120, cw - 120);
      if (gen > 0) {
        const s = `gen ${gen}   len ${n}   best ${best}`;
        api.text(ctx, s, lx, ly, bestFlash > 0 ? mix(C[2], A, bestFlash) : C[2], alpha * 0.75);
      }
      ctx.restore();
    }
  };
};
