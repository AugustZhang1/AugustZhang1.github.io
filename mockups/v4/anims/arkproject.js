// In-galaxy animation for 'arkproject' (fridge -> recipe PWA).
// The galaxy's own stars clump into ingredient asteroids, spiral in, collide and
// accrete into a ringed recipe planet, which then settles into orbit as a saved
// recipe beside the earlier ones. Next loop: new ingredients, new recipe.
GALAXY_ANIMS['arkproject'] = function (api) {
  const { TAU, clamp, rng } = api;
  const ease = t => api.ease3(clamp(t));
  const sm = (a, b, t) => ease((t - a) / (b - a));

  const RECIPES = [
    { name: 'salmon rice bowl', ing: ['salmon', 'rice', 'cucumber', 'avocado'] },
    { name: 'poutine', ing: ['potatoes', 'cheese curds', 'gravy', 'green onion'] },
    { name: 'spinach frittata', ing: ['eggs', 'spinach', 'cheddar', 'onion'] },
    { name: 'chana masala', ing: ['chickpeas', 'tomato', 'onion', 'garlic', 'rice'] },
    { name: 'tomato basil pasta', ing: ['pasta', 'tomato', 'basil', 'garlic'] },
    { name: 'lentil soup', ing: ['lentils', 'carrot', 'celery', 'onion', 'cumin'] },
    { name: 'maple glazed salmon', ing: ['salmon', 'maple syrup', 'garlic', 'green beans'] }
  ];

  const N = 1500, LOOP = 24, SLOTS = 4, PR = 0.1, KEEP = 64;
  // Timeline (seconds into a loop)
  const T_GATHER = 0.2, T_SPIRAL = 3.6, T_MERGE = 12, T_SAVE = 17;

  // Per-star state
  const owner = new Int16Array(N).fill(-1); // -1 free, 0 active this loop, s+1 saved planet id
  const ingOf = new Int8Array(N);
  const ax = new Float32Array(N), ay = new Float32Array(N);   // asteroid local offset
  const pa = new Float32Array(N), pb = new Float32Array(N);   // planet: disc x,y or ring angle,radius
  const isRing = new Uint8Array(N), keep = new Uint8Array(N);
  const del = new Float32Array(N);

  let T = 0, loop = -1, ast = [], active = [], recipe = null, dimT = 0;
  const saved = [];      // { id, slot, name, phi0, w, born, stars, dissolve }
  let nextId = 1;

  const slotRx = s => 0.6 + 0.15 * s, ASPECT = 0.58, TILT = -0.32;

  function startLoop(k) {
    loop = k;
    recipe = RECIPES[k % RECIPES.length];
    for (let j = 0; j < N; j++) if (owner[j] === 0) owner[j] = -1;
    const free = [];
    for (let j = 0; j < N; j++) if (owner[j] === -1) free.push(j);
    for (let i = free.length - 1; i > 0; i--) { const r = Math.floor(rng() * (i + 1)); const t = free[i]; free[i] = free[r]; free[r] = t; }

    const n = recipe.ing.length, base = rng() * TAU;
    ast = recipe.ing.map((label, i) => {
      const size = 0.05 + 0.03 * rng();
      return {
        label, size,
        ang: base + (i / n) * TAU + (rng() - 0.5) * 0.5,
        r0: 0.42 + 0.1 * rng(),
        stretch: 0.6 + 0.35 * rng(), rot0: rng() * TAU, spin: (rng() - 0.5) * 0.5,
        h: [rng() * TAU, rng() * TAU, rng() * TAU], hs: [0.25 * rng(), 0.18 * rng(), 0.12 * rng()],
        count: Math.round(2200 * size + 20 * rng())
      };
    });
    active = [];
    let p = 0;
    ast.forEach((A, i) => {
      for (let c = 0; c < A.count && p < free.length; c++) {
        const j = free[p++];
        owner[j] = 0; ingOf[j] = i; active.push(j);
        // lumpy irregular blob
        const th = rng() * TAU;
        const lump = 1 + A.hs[0] * Math.sin(2 * th + A.h[0]) + A.hs[1] * Math.sin(3 * th + A.h[1]) + A.hs[2] * Math.sin(5 * th + A.h[2]);
        const rr = Math.pow(rng(), 0.6) * lump;
        ax[j] = Math.cos(th) * rr; ay[j] = Math.sin(th) * rr * A.stretch;
        del[j] = rng();
      }
    });
    const keepP = KEEP / Math.max(1, active.length);
    for (const j of active) {
      if (rng() < 0.3) {
        isRing[j] = 1; pa[j] = rng() * TAU; pb[j] = 1.5 + 0.35 * Math.pow(rng(), 0.7);
      } else {
        isRing[j] = 0; const th = rng() * TAU, r = Math.sqrt(rng());
        pa[j] = Math.cos(th) * r; pb[j] = Math.sin(th) * r;
      }
      keep[j] = rng() < keepP ? 1 : 0;
    }
  }

  // Asteroid centre (galaxy units) at loop time t
  function astCentre(A, t) {
    const s = clamp((t - T_SPIRAL) / (T_MERGE - T_SPIRAL));
    const r = A.r0 * Math.pow(1 - s, 1.3);
    const th = A.ang + 0.08 * t + 1.7 * TAU * s * s;
    return [Math.cos(th) * r, Math.sin(th) * r];
  }

  // Planet local position for star j (unit = planet radius), with ring spin; returns [x, y, hidden, light]
  const PL = [0, 0, 0, 1];
  function planetLocal(j, time) {
    if (isRing[j]) {
      const a = pa[j] + 0.22 * time, r = pb[j];
      const x0 = Math.cos(a) * r, y0 = Math.sin(a) * r * 0.26;
      const c = Math.cos(TILT), s = Math.sin(TILT);
      PL[0] = x0 * c - y0 * s; PL[1] = x0 * s + y0 * c;
      PL[2] = Math.sin(a) < 0 && Math.hypot(PL[0], PL[1]) < 1 ? 1 : 0;
      PL[3] = 0.8;
    } else {
      PL[0] = pa[j]; PL[1] = pb[j]; PL[2] = 0;
      PL[3] = clamp(0.55 + 0.45 * (-pa[j] * 0.6 - pb[j] * 0.8) + 0.2);
    }
    return PL;
  }

  function orbitPos(sv, time) {
    const rx = slotRx(sv.slot), th = sv.phi0 + sv.w * (time - sv.born);
    return [Math.cos(th) * rx, Math.sin(th) * rx * ASPECT];
  }

  function update(dt) {
    T += dt;
    dimT += dt;
    const k = Math.floor(T / LOOP);
    if (k !== loop) startLoop(k);
    const t = T - k * LOOP;
    // Hand the planet over to the saved system
    if (t >= T_SAVE && !saved.some(s => s.loop === k)) {
      const slot = k % SLOTS;
      saved.forEach(s => { if (s.slot === slot && s.dissolve == null) s.dissolve = T; });
      const id = nextId++;
      const stars = active.filter(j => keep[j]);
      stars.forEach(j => { owner[j] = id; });
      const rx = slotRx(slot);
      saved.push({ id, loop: k, slot, name: recipe.name, phi0: rng() * TAU, w: 0.16 / Math.pow(rx, 1.5), born: T, stars });
    }
    for (let i = saved.length - 1; i >= 0; i--) {
      const s = saved[i];
      if (s.dissolve != null && T - s.dissolve > 3.5) {
        s.stars.forEach(j => { if (owner[j] === s.id) owner[j] = -1; });
        saved.splice(i, 1);
      }
    }
  }

  function draw(ctx, cx, cy, R, alpha) {
    if (loop < 0) return;
    R *= 1.6; // the scene uses more of the free area than the galaxy disc
    const S = api.stars(N), cols = api.colors(), acc = api.accent();
    const t = T - loop * LOOP;
    const label = cols[3];
    const rad = b => 0.9 + 0.3 * b;

    // Place one star: blend its live galaxy position with the target (galaxy units)
    const put = (j, ux, uy, m, a, rr) => {
      if (m <= 0.002 || a < 0.01) return;
      const tx = cx + ux * R, ty = cy + uy * R;
      let x, y, aa = a;
      if (S.x[j] < -1000) { x = tx; y = ty; aa *= m; } else { x = S.x[j] + (tx - S.x[j]) * m; y = S.y[j] + (ty - S.y[j]) * m; }
      api.dot(ctx, x, y, rr == null ? rad(S.b[j]) : rr, cols[S.b[j]], aa * (0.35 + 0.65 * m));
    };

    // Saved recipe system: faint orbits, tiny ringed planets, labels
    for (const sv of saved) {
      const age = T - sv.born, arrive = ease(age / 3);
      const fade = sv.dissolve != null ? 1 - clamp((T - sv.dissolve) / 2.5) : 1;
      const rx = slotRx(sv.slot);
      if (arrive > 0.6) {
        ctx.strokeStyle = api.rgba(cols[1], clamp(alpha * 0.1 * fade * (arrive - 0.6) / 0.4));
        ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, rx * R, rx * ASPECT * R, 0, 0, TAU); ctx.stroke();
      }
      const [ox, oy] = orbitPos(sv, T);
      const pcx = ox * arrive, pcy = oy * arrive;
      const sc = PR * (1 - 0.66 * arrive);
      for (const j of sv.stars) {
        const L = planetLocal(j, T);
        if (L[2]) continue;
        const m = sv.dissolve != null ? 1 - sm(0, 2, T - sv.dissolve - del[j] * 0.8) : 1;
        put(j, pcx + L[0] * sc, pcy + L[1] * sc, m, alpha * L[3], rad(S.b[j]) * (1 - 0.25 * arrive));
      }
      if (arrive > 0.9) {
        const la = alpha * fade * sm(3, 4, age);
        const fresh = 1 - sm(4.5, 6.5, age);
        const px = cx + ox * R, py = cy + oy * R + 0.075 * R;
        api.text(ctx, sv.name, px, py, label, la * (0.45 + 0.35 * fresh));
        if (fresh > 0.01) api.text(ctx, 'saved', px, py + 13, acc, la * fresh * 0.9);
      }
    }

    // Active stars: asteroid -> planet -> (spare stars) home
    const mergeP = j => sm(T_MERGE - 0.2, T_MERGE + 1.1, t - del[j] * 0.35);
    const centres = ast.map(A => astCentre(A, t));
    for (const j of active) {
      if (owner[j] !== 0) continue; // kept stars are drawn by the saved planet
      const A = ast[ingOf[j]], c = centres[ingOf[j]];
      const gather = sm(0, 1.6, t - T_GATHER - del[j] * 1.3);
      const sp = clamp((t - T_SPIRAL) / (T_MERGE - T_SPIRAL));
      const rot = A.rot0 + A.spin * t, cr = Math.cos(rot), sr = Math.sin(rot);
      const scl = A.size * (1 - 0.35 * sp * sp);
      let ux = c[0] + (ax[j] * cr - ay[j] * sr) * scl, uy = c[1] + (ax[j] * sr + ay[j] * cr) * scl;
      let a = alpha, m = gather;
      const mp = mergeP(j);
      if (mp > 0) {
        const L = planetLocal(j, T);
        // through the collision point, then out to the planet
        const px = L[0] * PR, py = L[1] * PR;
        ux = ux + (px - ux) * mp; uy = uy + (py - uy) * mp;
        a *= L[2] ? 1 - mp : 1 - (1 - L[3]) * mp;
        // spare stars drift back home as the planet leaves for its orbit
        if (t >= T_SAVE - 0.01) m = 1 - sm(0, 2.2, t - T_SAVE - del[j] * 0.9);
      }
      put(j, ux, uy, m, a);
    }

    // Ingredient labels
    for (let i = 0; i < ast.length; i++) {
      const A = ast[i], c = centres[i];
      const la = alpha * sm(1.8, 3, t) * (1 - sm(8.5, 10, t)) * 0.7;
      api.text(ctx, A.label, cx + c[0] * R, cy + (c[1] + A.size * 1.25) * R + 8, label, la);
    }

    // Collision flash
    const ft = t - T_MERGE;
    if (ft > -0.1 && ft < 1.6) {
      const f = clamp(ft / 1.6);
      api.ring(ctx, cx, cy, (0.03 + 0.32 * ease(f)) * R, acc, alpha * 0.55 * (1 - f), 1.2);
      api.dot(ctx, cx, cy, (0.02 + 0.05 * ease(f)) * R, acc, alpha * 0.22 * (1 - f));
    }

    // Recipe label while the planet is centred
    const pla = alpha * sm(T_MERGE + 1.4, T_MERGE + 2.3, t) * (1 - sm(T_SAVE - 0.3, T_SAVE + 0.4, t));
    api.text(ctx, recipe.name, cx, cy + 0.25 * R, label, pla * 0.85);
    api.text(ctx, 'recipe', cx, cy + 0.25 * R + 14, acc, pla * 0.6);
  }

  const self = { spiralDim: 0, update(dt) { update(dt); self.spiralDim = 0.82 * ease(dimT / 2); }, draw };
  return self;
};
