// In-galaxy animation for 'arbitrage'. See anims/README.md for the API.
// Five bookmaker stations condense out of the galaxy's own stars at its rim. Each book's
// two-way odds drift; stars stream from every station into the core, where a ring of stars
// gauges the combined implied probability 1/bestA + 1/bestB. Normally the ring laps past 100%
// (the overlap drawn as a second track). When a stale line makes it fall short, a gap opens
// in accent, two stake packets fly to the two books and return merged, then the window closes.
GALAXY_ANIMS['arbitrage'] = function (api) {
  const { TAU, clamp, ease3, rng } = api;
  const NB = 5, SR = 0.8, PER = 13;                 // books, station radius (xR), arb cycle (s)
  const N_ST = 90, N_FL = 46, N_RING = 210, N_PK = 56;
  const POOL = 2600;
  const ang = i => -Math.PI / 2 + Math.PI / NB + i * TAU / NB;

  // ---- odds model --------------------------------------------------------------------------
  const ph = [], marg = [];
  for (let i = 0; i < NB; i++) { ph.push([rng() * TAU, rng() * TAU]); marg.push(0.05 + 0.014 * i / (NB - 1)); }
  const oA = new Array(NB), oB = new Array(NB);
  let T = 0, S = 1.03, iA = 0, iB = 1;
  const bump = t => {                                 // smooth 0..1 window: the stale line
    const p = (t % PER) - 4.5;
    return p < 0 || p > 5.5 ? 0 : clamp(1.6 * Math.sin(Math.PI * p / 5.5));
  };
  function odds() {
    const p = 0.5 + 0.035 * Math.sin(0.11 * T + 1);
    const k = Math.floor(T / PER) % NB, bp = bump(T);
    let bA = 0, bB = 0;
    for (let i = 0; i < NB; i++) {
      let qa = p + marg[i] / 2 + 0.006 * Math.sin(0.7 * T + ph[i][0]);
      let qb = 1 - p + marg[i] / 2 + 0.006 * Math.sin(0.55 * T + ph[i][1]);
      if (i === k) { qa -= 0.062 * bp; qb += 0.02 * bp; }
      oA[i] = 1 / qa; oB[i] = 1 / qb;
      if (oA[i] > bA) { bA = oA[i]; iA = i; }
      if (oB[i] > bB) { bB = oB[i]; iB = i; }
    }
    S = 1 / bA + 1 / bB;
  }
  odds();

  // ---- arb window + stake packets ----------------------------------------------------------
  let arbOn = false, pk = null;                       // pk: { t0, a, b, profit }
  const OUT = 1.3, HOLD = 0.35, BACK = 1.4, SHOW = 1.8;

  // ---- star roles (assigned once, from the galaxy's own stars) -------------------------------
  let roles = null, t0 = 0;
  const eph = 0, ek = 0.62;                           // stations on a flattened rim, like the tilted disc
  const stPos = (i, cx, cy, R, sc = SR) => {
    const a = ang(i), u = Math.cos(a) * sc * R, v = Math.sin(a) * sc * R * ek;
    return [cx + u * Math.cos(eph) - v * Math.sin(eph), cy + u * Math.sin(eph) + v * Math.cos(eph)];
  };
  const jit = [];                                     // per role star: [u, v, delay, speed/phase]
  function assign(cx, cy, R) {
    let st, n, used;
    const near = (tx, ty, count) => {                 // nearest unused stars to a point
      const d = [];
      for (let j = 0; j < n; j++) {
        if (used[j] || st.x[j] < -1e3) continue;
        const dx = (st.x[j] - tx) / R, dy = (st.y[j] - ty) / R;
        d.push([dx * dx + dy * dy, j]);
      }
      d.sort((a, b) => a[0] - b[0]);
      const out = [];
      for (let q = 0; q < count && q < d.length; q++) { used[d[q][1]] = 1; out.push(d[q][1]); }
      return out;
    };
    const pick = count => {                           // spread picks over the rest of the galaxy
      const out = [];
      for (let j = 0; j < n && out.length < count; j++) {
        const s = (j * 7919) % n;
        if (!used[s] && st.x[s] > -1e3 && rng() < 0.5) { used[s] = 1; out.push(s); }
      }
      return out;
    };
    st = api.stars(POOL); n = st.n;
    used = new Uint8Array(n);
    roles = { st: [], fl: [], ring: [], pk: [] };
    for (let i = 0; i < NB; i++) { const [x, y] = stPos(i, cx, cy, R); roles.st.push(near(x, y, N_ST)); }
    roles.ring = near(cx, cy, N_RING);
    roles.pk = near(cx, cy, N_PK);
    for (let i = 0; i < NB; i++) roles.fl.push(pick(N_FL));
    for (let j = 0; j < n; j++) {
      const r = Math.sqrt(rng()), a = rng() * TAU;
      jit[j] = [Math.cos(a) * r, Math.sin(a) * r, rng() * 1.2, rng()];
    }
    t0 = T;
  }

  const fOf = j => ease3(clamp((T - t0 - jit[j][2]) / 2));
  let cols = api.colors(), acc = api.accent();

  // gauge sweep: 100% is one full turn; the deviation from 100% is drawn 3x so it reads
  const G = () => 1 + (S - 1) * 3;
  // ring stars on the gauge: lap 1 inside, any overlap past 100% on a second, outer track
  const ringPos = (u, cx, cy, gr) => {
    const th = u * G() * TAU, lap = th > TAU ? 1 : 0;
    const r = gr + lap * Math.max(4, gr * 0.09);
    return [cx + Math.cos(th - Math.PI / 2) * r, cy + Math.sin(th - Math.PI / 2) * r, lap];
  };

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt; odds();
      const arb = S < 1;
      if (arb && !arbOn && roles && (!pk || T - pk.t0 > OUT + HOLD + BACK + SHOW))
        pk = { t0: T, a: iA, b: iB, profit: 1 / S - 1 };
      arbOn = arb;
      if (pk && T - pk.t0 > OUT + HOLD + BACK + SHOW + 1) pk = null;
      if (roles) self.spiralDim = 0.72 * ease3(clamp((T - t0) / 2.5));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.02) return;
      const st = api.stars(POOL);
      if (!roles) { if (alpha > 0.8) assign(cx, cy, R); else return; }
      cols = api.colors(); acc = api.accent();
      const dark = api.dark();
      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const SP = []; for (let i = 0; i < NB; i++) SP.push(stPos(i, cx, cy, R));
      const sx = i => SP[i][0], sy = i => SP[i][1];
      const gr = 0.15 * R, cr = 0.035 * R;
      const put = (j, tx, ty, rad, col, a) => {      // star j drawn between its home and target
        const f = fOf(j);
        let x = st.x[j], y = st.y[j];
        if (x < -1e3) { x = tx; y = ty; }
        x += (tx - x) * f; y += (ty - y) * f;
        api.dot(ctx, x, y, rad, col, alpha * a * (0.35 + 0.65 * f));
      };
      const arbA = S < 1 ? 1 : 0;

      // Stations: dense clusters slowly breathing.
      for (let i = 0; i < NB; i++) {
        const best = i === iA || i === iB, hot = pk && (i === pk.a || i === pk.b) && T - pk.t0 < OUT + HOLD + 0.3;
        roles.st[i].forEach((j, q) => {
          const J = jit[j], w = 0.06 * R * (1 + 0.06 * Math.sin(T * 0.8 + q));
          const rot = T * 0.15 * (J[3] - 0.5);
          const u = J[0] * Math.cos(rot) - J[1] * Math.sin(rot), v = J[0] * Math.sin(rot) + J[1] * Math.cos(rot);
          const bb = Math.min(3, st.b[j] + (best ? 1 : 0));
          put(j, sx(i) + u * w, sy(i) + v * w * 0.8, 0.7 + 0.22 * bb, hot && q % 4 === 0 ? acc : cols[Math.max(1, bb)], 0.2 + 0.1 * bb);
        });
      }

      // Streams: stars flowing from each station into the core, carrying its line.
      for (let i = 0; i < NB; i++) {
        const best = i === iA || i === iB;
        const x0 = sx(i), y0 = sy(i), dx = cx - x0, dy = cy - y0, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L, span = 1 - (gr + 6) / L - 0.06;
        roles.fl[i].forEach(j => {
          const J = jit[j], s = (J[3] + T * (0.09 + 0.05 * J[2])) % 1;
          const q = 0.06 + s * span, off = J[0] * 0.012 * R * (1 - s) + Math.sin(s * 9 + J[3] * 6) * 0.004 * R;
          const fade = Math.sin(Math.PI * s);
          put(j, x0 + dx * q + nx * off, y0 + dy * q + ny * off, best ? 1.25 : 1, cols[best ? 3 : 2], (best ? 0.75 : 0.35) * (0.25 + 0.75 * fade));
        });
      }

      // Ring gauge: combined implied probability of the best two lines.
      const N = roles.ring.length;
      roles.ring.forEach((j, q) => {
        const [x, y, lap] = ringPos((q + 0.5) / N, cx, cy, gr);
        put(j, x, y, lap ? 1.1 : 0.95, cols[lap ? 3 : 2 + (st.b[j] > 1 ? 1 : 0)], lap ? 0.85 : 0.5);
      });
      if (arbA) {                                      // the gap, lit in accent
        const g0 = G() * TAU, g1 = TAU, steps = Math.max(3, Math.round((g1 - g0) * gr / 5));
        const pulse = 0.65 + 0.35 * Math.sin(T * 5);
        for (let k = 0; k <= steps; k++) {
          const th = g0 + (g1 - g0) * k / steps - Math.PI / 2;
          api.dot(ctx, cx + Math.cos(th) * gr, cy + Math.sin(th) * gr, 1.1, acc, alpha * 0.55 * pulse);
        }
        for (const th of [g0, g1]) {
          const a = th - Math.PI / 2;
          api.line(ctx, cx + Math.cos(a) * (gr - 5), cy + Math.sin(a) * (gr - 5), cx + Math.cos(a) * (gr + 5), cy + Math.sin(a) * (gr + 5), acc, alpha * 0.9, 1);
        }
      }

      // Stake packets: a stake cluster at the core splits to the two books, returns merged and larger.
      const pq = pk ? T - pk.t0 : -1;
      let pxA = cx, pyA = cy, pxB = cx, pyB = cy, spread = cr, merged = false, pkA = 0.55, pkCol = cols[3];
      if (pk && pq < OUT + HOLD + BACK + SHOW + 1) {
        pkCol = acc; pkA = 0.95;
        if (pq < OUT) {
          const e = ease3(pq / OUT);
          pxA = cx + (sx(pk.a) - cx) * e; pyA = cy + (sy(pk.a) - cy) * e;
          pxB = cx + (sx(pk.b) - cx) * e; pyB = cy + (sy(pk.b) - cy) * e;
          spread = cr * (1 - 0.35 * e);
        } else if (pq < OUT + HOLD) {
          pxA = sx(pk.a); pyA = sy(pk.a); pxB = sx(pk.b); pyB = sy(pk.b); spread = cr * 0.65;
        } else {
          const e = ease3(clamp((pq - OUT - HOLD) / BACK));
          const mx = (sx(pk.a) + sx(pk.b)) / 2, my = (sy(pk.a) + sy(pk.b)) / 2;
          // both packets converge as they come home: merge partway, arrive as one
          const m = clamp(e * 1.6);
          pxA = sx(pk.a) + (mx - sx(pk.a)) * m * 0.35; pyA = sy(pk.a) + (my - sy(pk.a)) * m * 0.35;
          pxB = sx(pk.b) + (mx - sx(pk.b)) * m * 0.35; pyB = sy(pk.b) + (my - sy(pk.b)) * m * 0.35;
          pxA += (cx - pxA) * e; pyA += (cy - pyA) * e; pxB += (cx - pxB) * e; pyB += (cy - pyB) * e;
          spread = cr * (0.65 + 0.75 * e);
          merged = e > 0.98;
          const fadeOut = clamp((pq - OUT - HOLD - BACK - SHOW) / 1);
          pkA = 0.95 - 0.4 * fadeOut;
          if (fadeOut > 0) { spread = cr * (1.4 - 0.4 * fadeOut); }
          if (fadeOut > 0.5) pkCol = cols[3];
        }
      }
      roles.pk.forEach((j, q) => {
        const J = jit[j], first = q % 2 === 0;
        const ox = first ? pxA : pxB, oy = first ? pyA : pyB;
        const rr = merged || !pk ? 1.35 : 1.25;
        put(j, ox + J[0] * spread, oy + J[1] * spread, rr + (pk && pq > OUT + HOLD + BACK ? 0.4 : 0), pkCol, pkA);
      });

      // Labels: odds by each station, the gauge reading, the locked-in profit.
      ctx.globalCompositeOperation = 'source-over';
      const dim = cols[1], bright = cols[3];
      for (let i = 0; i < NB; i++) {
        const dx = sx(i) - cx, dy = sy(i) - cy, L = Math.hypot(dx, dy) || 1;
        const lx = sx(i) + dx / L * (0.06 * R + 34), ly = sy(i) + dy / L * (0.05 * R + 14);
        const hotA = arbA && i === iA, hotB = arbA && i === iB;
        api.text(ctx, oA[i].toFixed(2), lx - 17, ly, hotA ? acc : i === iA ? bright : dim, (i === iA ? 0.95 : 0.6) * alpha);
        api.text(ctx, oB[i].toFixed(2), lx + 17, ly, hotB ? acc : i === iB ? bright : dim, (i === iB ? 0.95 : 0.6) * alpha);
      }
      api.text(ctx, (S * 100).toFixed(1) + '%', cx, cy + gr + 16, arbA ? acc : dim, alpha * (arbA ? 1 : 0.55));
      if (pk && pq > OUT + HOLD + BACK * 0.9 && pq < OUT + HOLD + BACK + SHOW + 0.8) {
        const la = clamp((pq - OUT - HOLD - BACK * 0.9) / 0.4) * (1 - clamp((pq - OUT - HOLD - BACK - SHOW) / 0.8));
        api.text(ctx, '+' + (pk.profit * 100).toFixed(1) + '%', cx, cy - gr - 16, acc, alpha * la);
      }
      ctx.restore();
    }
  };
  return self;
};
