// In-galaxy animation for 'arkproject' (fridge -> recipe PWA). See anims/README.md.
// The spiral dims and its stars condense into a small system around the core: two
// ringed planets, recipes saved earlier, on faint orbits. Then the galaxy's stars clump
// into ingredient asteroids (labelled) that drift in together, collide (accent flash)
// and accrete into a big ringed recipe planet. It is named, shrinks, and moves out to
// join the system on a new orbit ("saved"). The system holds, then every star relaxes
// back into the spiral. Each loop cooks the next recipe; the two before it are the
// planets already in orbit.
GALAXY_ANIMS['arkproject'] = function (api) {
  const { TAU, clamp, rng } = api;
  const sm = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const win = (a, b, t) => sm((t - a) / (b - a));

  const RECIPES = [
    { name: 'salmon rice bowl', ing: ['salmon', 'rice', 'cucumber', 'avocado'] },
    { name: 'poutine', ing: ['potatoes', 'cheese curds', 'gravy', 'green onion'] },
    { name: 'spinach frittata', ing: ['eggs', 'spinach', 'cheddar', 'onion'] },
    { name: 'chana masala', ing: ['chickpeas', 'tomato', 'garlic', 'rice'] },
    { name: 'tomato basil pasta', ing: ['pasta', 'tomato', 'basil', 'garlic'] },
    { name: 'lentil soup', ing: ['lentils', 'carrot', 'celery', 'cumin'] },
    { name: 'maple glazed salmon', ing: ['salmon', 'maple syrup', 'garlic', 'green beans'] }
  ];

  // Scene units: U = 1.6 x galaxy radius.
  const MAXS = 2400, LOOP = 24;
  const PR = 0.165;                      // hero planet radius (U)
  const SMALL = 0.46;                    // saved planets are this fraction of the hero
  const ORB = [0.36, 0.5, 0.64], ASPECT = 0.56, TILT = -0.32;
  const PER_SAVED = 190, KEEP = 190;     // stars per saved planet
  // Timeline (seconds into a loop)
  const DIM0 = 0, SYS = 0.4, GATH = 2.2, DRIFT = 4.8, MERGE = 11, NAME = 12.6,
        SAVE = 15.8, JOIN = 18.8, BACK = 20.6, END = 23.6;

  const orbW = r => 0.075 / Math.pow(r, 1.5);
  const orbitAt = (slot, phi, t) => {
    const r = ORB[slot], th = phi + orbW(r) * t;
    return [Math.cos(th) * r, Math.sin(th) * r * ASPECT];
  };
  const cT = Math.cos(TILT), sT = Math.sin(TILT);

  // Per-star planet geometry (shared by hero and saved planets): ring or disc.
  const isRing = new Uint8Array(MAXS), pa = new Float32Array(MAXS), pb = new Float32Array(MAXS), del = new Float32Array(MAXS);
  for (let j = 0; j < MAXS; j++) {
    del[j] = rng();
    if (rng() < 0.3) { isRing[j] = 1; pa[j] = rng() * TAU; pb[j] = 1.45 + 0.4 * Math.pow(rng(), 0.7); }
    else { const th = rng() * TAU, r = Math.sqrt(rng()); pa[j] = Math.cos(th) * r; pb[j] = Math.sin(th) * r; }
  }
  const PL = [0, 0, 0, 1]; // x, y, hidden behind the disc, light
  function planetLocal(j, t) {
    if (isRing[j]) {
      const a = pa[j] + 0.2 * t, r = pb[j];
      const x0 = Math.cos(a) * r, y0 = Math.sin(a) * r * 0.26;
      PL[0] = x0 * cT - y0 * sT; PL[1] = x0 * sT + y0 * cT;
      PL[2] = Math.sin(a) < 0 && Math.hypot(PL[0], PL[1]) < 1 ? 1 : 0;
      PL[3] = 0.85;
    } else {
      PL[0] = pa[j]; PL[1] = pb[j]; PL[2] = 0;
      PL[3] = clamp(0.62 + 0.38 * (-pa[j] * 0.6 - pb[j] * 0.8));
    }
    return PL;
  }

  // Per-loop state, built lazily at the first draw of each loop (needs stars().n).
  let T = 0, built = -1;
  let ast = [], heroStars = [], heroKeep = null, ingOf = null, ax = null, ay = null, olds = [], recipe = null, newPhi = 0;

  function build(k, n) {
    built = k;
    recipe = RECIPES[k % RECIPES.length];
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const r = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[r]; idx[r] = t; }
    let p = 0;
    // Two planets saved earlier, already orbiting.
    olds = [0, 1].map(s => {
      const prev = RECIPES[(k + RECIPES.length - 2 + s) % RECIPES.length];
      const stars = idx.slice(p, p + PER_SAVED); p += PER_SAVED;
      return { slot: s, name: prev.name, phi: rng() * TAU, stars };
    });
    newPhi = rng() * TAU;
    // Ingredient asteroids, evenly spread around the outside of the system.
    const m = recipe.ing.length, base = rng() * TAU;
    ingOf = new Int8Array(n).fill(-1); ax = new Float32Array(n); ay = new Float32Array(n);
    heroKeep = new Uint8Array(n);
    heroStars = [];
    ast = recipe.ing.map((label, i) => {
      const size = 0.075 + 0.02 * rng();
      const A = {
        label, size,
        ang: base + (i / m) * TAU + (rng() - 0.5) * 0.4,
        r0: 0.74 + 0.06 * rng(),
        stretch: 0.62 + 0.3 * rng(), rot0: rng() * TAU, spin: (rng() - 0.5) * 0.35,
        h: [rng() * TAU, rng() * TAU, rng() * TAU], hs: [0.22 * rng(), 0.16 * rng(), 0.1 * rng()]
      };
      const count = Math.min(n - p, Math.round(3200 * size));
      for (let c = 0; c < count; c++) {
        const j = idx[p++];
        ingOf[j] = i; heroStars.push(j);
        const th = rng() * TAU;
        const lump = 1 + A.hs[0] * Math.sin(2 * th + A.h[0]) + A.hs[1] * Math.sin(3 * th + A.h[1]) + A.hs[2] * Math.sin(5 * th + A.h[2]);
        const rr = Math.pow(rng(), 0.55) * lump;
        ax[j] = Math.cos(th) * rr; ay[j] = Math.sin(th) * rr * A.stretch;
      }
      return A;
    });
    const kp = KEEP / Math.max(1, heroStars.length);
    for (const j of heroStars) heroKeep[j] = rng() < kp ? 1 : 0;
  }

  function astCentre(A, t) {
    const s = clamp((t - DRIFT) / (MERGE - DRIFT));
    const r = A.r0 * (1 - s * s * (1.6 - 0.6 * s)); // slow drift, then falls together
    const th = A.ang + 0.05 * t + 0.9 * s * s;
    return [Math.cos(th) * r, Math.sin(th) * r * 0.8];
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      const t = T % LOOP;
      self.spiralDim = 0.9 * win(DIM0, DIM0 + 1.4, t) * (1 - win(BACK + 0.6, END, t));
    },
    draw(ctx, cx, cy, R0, alpha) {
      if (alpha < 0.01) return;
      const k = Math.floor(T / LOOP), t = T - k * LOOP;
      const S = api.stars(MAXS), n = S.n;
      if (n < 50) return;
      if (k !== built) build(k, n);
      const cols = api.colors(), acc = api.accent(), dark = api.dark();
      const label = cols[3], U = R0 * 1.6;
      const rad = b => 1.05 + 0.38 * b;
      const back = j => 1 - win(BACK + del[j] * 1.2, BACK + del[j] * 1.2 + 1.6, t); // relax into the spiral

      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

      // Blend a star's live spiral position with its target (scene units).
      const put = (j, ux, uy, m, a, r, bmin = 0) => {
        if (m <= 0.002 || a < 0.01) return;
        const tx = cx + ux * U, ty = cy + uy * U, sx = S.x[j], sy = S.y[j];
        let x, y, aa = a;
        if (sx < -1000) { x = tx; y = ty; aa *= m; } else { x = sx + (tx - sx) * m; y = sy + (ty - sy) * m; }
        const b = Math.max(bmin, S.b[j]);
        api.dot(ctx, x, y, r == null ? rad(b) : r, cols[b], aa * (0.2 + 0.8 * m * m) * (dark ? 1 : 0.95));
      };
      const ellipse = (r, rgb, a, lw) => {
        if (a < 0.01) return;
        ctx.strokeStyle = api.rgba(rgb, clamp(a)); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.ellipse(cx, cy, r * U, r * ASPECT * U, 0, 0, TAU); ctx.stroke();
      };

      const sysA = alpha * win(SYS + 0.8, SYS + 2.2, t) * (1 - win(BACK, BACK + 1.2, t));

      // The saved system: orbits, ringed planets, names.
      for (const o of olds) {
        ellipse(ORB[o.slot], cols[2], (dark ? 0.16 : 0.22) * sysA, 1);
        const [px, py] = orbitAt(o.slot, o.phi, t), sc = PR * SMALL;
        for (const j of o.stars) {
          const L = planetLocal(j, t);
          if (L[2]) continue;
          const m = win(SYS + del[j] * 1.4, SYS + del[j] * 1.4 + 1.4, t) * back(j);
          put(j, px + L[0] * sc, py + L[1] * sc, m, alpha * L[3], rad(S.b[j]) * 0.85, 2);
        }
        api.text(ctx, o.name, cx + px * U, cy + (py + sc * 1.25) * U + 9, label, 0.55 * sysA);
      }

      // The new recipe: asteroids -> collision -> hero planet -> joins orbit 3.
      const go = win(SAVE, JOIN, t);                         // 0 at centre, 1 in orbit
      const [ox, oy] = orbitAt(2, newPhi, t);
      const hx = ox * go, hy = oy * go, hsc = PR * (1 - (1 - SMALL) * go);
      const centres = ast.map(A => astCentre(A, t));
      for (const j of heroStars) {
        const i = ingOf[j], A = ast[i], c = centres[i];
        const gather = win(GATH + del[j] * 1.2, GATH + del[j] * 1.2 + 1.6, t);
        const sp = clamp((t - DRIFT) / (MERGE - DRIFT));
        const rot = A.rot0 + A.spin * t, cr = Math.cos(rot), sr = Math.sin(rot);
        const scl = A.size * (1 - 0.3 * sp * sp);
        let ux = c[0] + (ax[j] * cr - ay[j] * sr) * scl, uy = c[1] + (ax[j] * sr + ay[j] * cr) * scl;
        let a = alpha, m = gather, r = null, bmin = 1;
        const mp = win(MERGE - 0.3 + del[j] * 0.4, MERGE + 1.3 + del[j] * 0.4, t);
        if (mp > 0) {
          const L = planetLocal(j, t);
          const px = hx + L[0] * hsc, py = hy + L[1] * hsc;
          ux += (px - ux) * mp; uy += (py - uy) * mp;
          a *= L[2] ? 1 - mp : 1 - (1 - L[3]) * mp;
          if (heroKeep[j]) { m *= back(j); r = rad(S.b[j]) * (1 - 0.15 * go); bmin = 1 + Math.round(go); }
          else { // spare stars fade and go home
            const h = 1 - win(SAVE - 0.4 + del[j] * 1.2, SAVE + 1.4 + del[j] * 1.2, t);
            m *= h; a *= h;
          }
        }
        put(j, ux, uy, m, a, r, bmin);
      }

      // Ingredient labels while the asteroids drift.
      const la = alpha * win(GATH + 1.2, GATH + 2.4, t) * (1 - win(MERGE - 2.4, MERGE - 1.2, t)) * 0.8;
      if (la > 0.01) for (let i = 0; i < ast.length; i++) {
        const A = ast[i], c = centres[i];
        api.text(ctx, A.label, cx + c[0] * U, cy + (c[1] + A.size * 1.1) * U + 10, label, la);
      }

      // Collision flash (accent).
      const ft = t - MERGE;
      if (ft > -0.1 && ft < 1.8) {
        const f = clamp(ft / 1.8);
        api.ring(ctx, cx, cy, (0.03 + 0.42 * sm(f)) * U, acc, alpha * 0.6 * (1 - f), 1.4);
        api.dot(ctx, cx, cy, (0.02 + 0.06 * sm(f)) * U, acc, alpha * 0.25 * (1 - f));
      }

      // Recipe name under the hero planet.
      const na = alpha * win(NAME - 0.4, NAME + 0.6, t) * (1 - win(BACK, BACK + 1.2, t));
      if (na > 0.01) {
        const ly = cy + (hy + hsc * 1.25) * U + 12 - 3 * go;
        api.text(ctx, recipe.name, cx + hx * U, ly, label, na * (0.95 - 0.4 * go));
        const tag = t < SAVE + 1 ? 'recipe' : 'saved';
        const ta = t < SAVE + 1 ? 1 - win(SAVE + 0.4, SAVE + 1, t) : win(JOIN - 0.6, JOIN, t);
        api.text(ctx, tag, cx + hx * U, ly + 14, acc, na * ta * 0.85);
      }

      // The new orbit appears as the planet arrives, briefly in the accent.
      const oa = win(JOIN - 1, JOIN, t) * (1 - win(BACK, BACK + 1.2, t));
      if (oa > 0.01) {
        const glow = 1 - win(JOIN + 0.3, JOIN + 2, t);
        ellipse(ORB[2], cols[2], alpha * oa * (dark ? 0.16 : 0.22) * (1 - glow), 1);
        ellipse(ORB[2], acc, alpha * oa * 0.5 * glow, 1.2);
      }
      ctx.restore();
    }
  };
  return self;
};
