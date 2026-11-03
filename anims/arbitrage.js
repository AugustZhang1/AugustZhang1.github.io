// In-galaxy animation for 'arbitrage'. See anims/README.md for the API.
// The galaxy's own stars leave the spiral and form four bookmaker stations around a big
// ring gauge. Each station beams its two-way odds into the ring as a stream of stars; the
// ring fills to the combined implied probability of the best lines, 1/bestA + 1/bestB.
// Normally it laps past 100% (the bookmakers' margin, drawn on an outer track). Then one
// book's line goes stale, the ring falls short, and the gap lights in accent: stakes fly
// from the bankroll at the core to the two best books and return larger as locked profit.
// The line corrects, the gap closes, and the stars drift back into the spiral.
GALAXY_ANIMS['arbitrage'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { TAU, clamp, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const LOOP = 24;
  const NB = 4, GR = 0.34;                              // books, gauge radius (xR)
  const N_ST = 70, N_SR = 30, N_FL = 34, N_RING = 240, N_OV = 70, N_PK = 56;
  const POOL = 2600;
  const FONT = (w, px) => `${w} ${px}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  // Stations sit on a wide ellipse at the four diagonals (galaxy-radius units).
  const SA = [-0.62, 0.62, Math.PI - 0.62, Math.PI + 0.62];
  const SPOS = SA.map(a => [Math.cos(a) * 0.92, Math.sin(a) * 0.62]);

  // ---- Timeline (seconds within the loop) -------------------------------------------------
  const FORM = 0.3, STALE0 = 8.6, STALE1 = 15.2, LOCK = 11.0;
  const OUT0 = 11.2, OUT = 1.4, HOLD = 0.7, BACK = 1.5;
  const RET = OUT0 + OUT + HOLD + BACK;                 // packets home: 14.8
  const REL = 20.6;                                     // stars start drifting home

  // ---- Odds model: seamless in the loop time ----------------------------------------------
  const marg = [0.05, 0.047, 0.054, 0.045], ph = [], kk = [];
  for (let i = 0; i < NB; i++) { ph.push([rng() * TAU, rng() * TAU]); kk.push([2 + (i % 3), 3 + ((i + 1) % 3)]); }
  const STALE = 1, PAIR = 3;                            // lower right lags; upper left is the other leg
  const oA = new Float64Array(NB), oB = new Float64Array(NB);
  let iA = 0, iB = 0, S = 1.05;
  function odds(t) {
    const w = TAU * t / LOOP, p = 0.52 + 0.012 * Math.sin(w + 0.7);
    const st = smooth((t - STALE0) / 1.8) * (1 - smooth((t - STALE1) / 1.6));
    let bA = 0, bB = 0;
    for (let i = 0; i < NB; i++) {
      let qa = p + marg[i] / 2 + 0.006 * Math.sin(kk[i][0] * w + ph[i][0]);
      let qb = 1 - p + marg[i] / 2 + 0.006 * Math.sin(kk[i][1] * w + ph[i][1]);
      if (i === STALE) qa -= 0.06 * st;                // its home price lags the market
      if (i === PAIR) qb -= 0.01 * st;                 // while the opposite book leans away
      oA[i] = 1 / qa; oB[i] = 1 / qb;
      if (oA[i] > bA) { bA = oA[i]; iA = i; }
      if (oB[i] > bB) { bB = oB[i]; iB = i; }
    }
    S = 1 / bA + 1 / bB;
  }

  // ---- Per-star jitter (indexed by star) ---------------------------------------------------
  const J = [];
  for (let j = 0; j < POOL; j++) {
    const r = Math.sqrt(rng()), a = rng() * TAU;
    J.push([Math.cos(a) * r, Math.sin(a) * r, rng(), rng()]);
  }
  // Form / release weight of star j: inner stars leave first, all are home by the loop end.
  const fw = (j, t) => smooth((t - FORM - J[j][2] * 0.9) / 1.8) * (1 - smooth((t - REL - J[j][3] * 0.9) / 2.2));

  let roles = null, T = 0, lock = null;                 // lock: { a, b, profit, sa }
  function assign(cx, cy, R) {
    const st = api.stars(POOL), n = st.n, used = new Uint8Array(n);
    const near = (tx, ty, count) => {
      const d = [];
      for (let j = 0; j < n; j++) {
        if (used[j] || st.x[j] < -1e3) continue;
        const dx = st.x[j] - tx, dy = st.y[j] - ty;
        d.push([dx * dx + dy * dy, j]);
      }
      d.sort((a, b) => a[0] - b[0]);
      const out = [];
      for (let q = 0; q < count && q < d.length; q++) { used[d[q][1]] = 1; out.push(d[q][1]); }
      return out;
    };
    roles = { st: [], sr: [], fl: [], ring: [], ov: [], pk: [] };
    roles.pk = near(cx, cy, N_PK);
    roles.ring = near(cx, cy, N_RING);
    roles.ov = near(cx, cy, N_OV);
    for (let i = 0; i < NB; i++) {
      const x = cx + SPOS[i][0] * R, y = cy + SPOS[i][1] * R;
      roles.st.push(near(x, y, N_ST));
      roles.sr.push(near(x, y, N_SR));
      roles.fl.push(near((x + cx) / 2, (y + cy) / 2, N_FL));
    }
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      T = (T + dt) % LOOP;
      odds(T);
      if (T >= LOCK && T < LOCK + 0.5 && !lock) {
        const sa = (1 / oA[iA]) / S;                     // stake share on side A
        lock = { a: iA, b: iB, profit: 1 / S - 1, sa };
      }
      if (T < LOCK) lock = null;
      const up = smooth((T - FORM) / 1.4), down = 1 - smooth((T - REL - 0.6) / 2.2);
      self.spiralDim = 0.93 * Math.min(up, down);
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.02) return;
      if (!roles) { if (alpha > 0.8) assign(cx, cy, R); else return; }
      const st = api.stars(POOL);
      const col = api.colors(), acc = api.accent(), dark = api.dark();
      const t = T;
      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const lit = dark ? 1 : 0.95;
      const put = (j, tx, ty, r, c, a) => {             // star j between its home and target
        const f = fw(j, t);
        let x = st.x[j], y = st.y[j];
        if (x < -1e3) { x = tx; y = ty; }
        x += (tx - x) * f; y += (ty - y) * f;
        const aa = alpha * a * f * lit;
        if (aa > 0.01) api.dot(ctx, x, y, r, c, aa);
      };
      const vis = smooth((t - FORM - 1.2) / 1.2) * (1 - smooth((t - REL) / 1.2));
      const gr = GR * R;
      const SX = i => cx + SPOS[i][0] * R, SY = i => cy + SPOS[i][1] * R;

      // Gauge value: one full turn is 100%; the distance from 100% is drawn 5x so it reads.
      const g = 1 + (S - 1) * 5, gap = Math.max(0, 1 - g), over = Math.min(0.3, Math.max(0, g - 1));
      const arb = smooth((1 - g) / 0.02);              // 0..1, eases in as the ring falls short
      const pkT = lock ? t - OUT0 : -1;
      const hotBook = i => lock && (i === lock.a || i === lock.b) && pkT > -0.4 && pkT < OUT + HOLD + 0.4;

      // Stations: a bright core and a thin ring of stars, slowly turning.
      for (let i = 0; i < NB; i++) {
        const x0 = SX(i), y0 = SY(i), best = i === iA || i === iB, hot = hotBook(i);
        const br = 0.07 * R;
        roles.st[i].forEach((j, q) => {
          const rr = 0.045 * R * (1 + 0.05 * Math.sin(t * 1.3 + q));
          put(j, x0 + J[j][0] * rr, y0 + J[j][1] * rr, 1.35, hot && q % 3 === 0 ? acc : col[best ? 3 : 2], best ? 0.85 : 0.6);
        });
        roles.sr[i].forEach((j, q) => {
          const a = q / N_SR * TAU + t * 0.25 * (i % 2 ? 1 : -1);
          put(j, x0 + Math.cos(a) * br, y0 + Math.sin(a) * br, 1.1, hot ? acc : col[2], hot ? 0.9 : 0.45);
        });
      }

      // Beams: each station streams its line into the ring.
      for (let i = 0; i < NB; i++) {
        const best = i === iA || i === iB, hot = arb > 0.5 && best;
        const x0 = SX(i), y0 = SY(i), dx = cx - x0, dy = cy - y0, L = Math.hypot(dx, dy) || 1;
        const s0 = (0.09 * R) / L, s1 = 1 - (gr + 0.04 * R) / L;
        roles.fl[i].forEach(j => {
          const s = (J[j][3] + t * (0.16 + 0.05 * J[j][2])) % 1, q = s0 + (s1 - s0) * s;
          const off = J[j][0] * 0.006 * R;
          const fade = Math.sin(Math.PI * s);
          put(j, x0 + dx * q - dy / L * off, y0 + dy * q + dx / L * off, best ? 1.3 : 1.05,
            hot ? acc : col[best ? 3 : 2], (best ? 0.85 : 0.4) * (0.2 + 0.8 * fade));
        });
      }

      // Ring gauge: filled up to min(g,1); the shortfall lights in accent.
      const pulse = 0.7 + 0.3 * Math.sin(t * 4.5);
      roles.ring.forEach((j, q) => {
        const u = (q + 0.5) / N_RING, th = u * TAU - Math.PI / 2;
        const x = cx + Math.cos(th) * gr, y = cy + Math.sin(th) * gr;
        const fill = smooth((Math.min(g, 1) - u) / 0.006 + 0.5);
        if (fill > 0.5) put(j, x, y, 1.6, col[3], 0.9 - 0.3 * arb);
        else if (gap > 0.004) put(j, x, y, 2.3, acc, (0.6 + 0.4 * pulse) * arb);
        else put(j, x, y, 1.4, col[1], 0.4);
      });
      // Outer track: the overround past 100%, a second lap on a slightly larger radius.
      roles.ov.forEach((j, q) => {
        const u = (q + 0.5) / N_OV * 0.3, th = u * TAU - Math.PI / 2, r = gr + 0.035 * R;
        const on = smooth((over - u) / 0.006 + 0.5);
        put(j, cx + Math.cos(th) * r, cy + Math.sin(th) * r, 1.35, col[2], 0.08 + 0.62 * on);
      });
      // 100% tick at twelve o'clock.
      api.line(ctx, cx, cy - gr - 0.065 * R, cx, cy - gr + 0.03 * R, arb > 0.5 ? acc : col[3], 0.8 * alpha * vis, 1.5);

      // Stake packets: the bankroll at the core splits to the two best books and returns larger.
      let pxA = cx, pyA = cy, pxB = cx, pyB = cy, spread = 0.05 * R, pc = col[2], pa = 0.7, pr = 1.35, split = 0.5;
      if (lock && pkT > 0) {
        split = lock.sa;
        const ax = SX(lock.a), ay = SY(lock.a), bx = SX(lock.b), by = SY(lock.b);
        pc = acc; pa = 0.95;
        if (pkT < OUT) {
          const e = smooth(pkT / OUT);
          pxA = cx + (ax - cx) * e; pyA = cy + (ay - cy) * e; pxB = cx + (bx - cx) * e; pyB = cy + (by - cy) * e;
          spread = 0.05 * R * (1 - 0.3 * e);
        } else if (pkT < OUT + HOLD) {
          pxA = ax; pyA = ay; pxB = bx; pyB = by; spread = 0.035 * R;
        } else {
          const e = smooth((pkT - OUT - HOLD) / BACK);
          pxA = ax + (cx - ax) * e; pyA = ay + (cy - ay) * e; pxB = bx + (cx - bx) * e; pyB = by + (cy - by) * e;
          spread = 0.035 * R + 0.035 * R * e;           // returns bigger: the payout
          pr = 1.35 + 0.35 * e;
          const cool = smooth((t - RET - 3.2) / 2);
          spread *= 1 - 0.3 * cool; pr -= 0.35 * cool; pa = 0.95 - 0.25 * cool;
          if (cool > 0.5) pc = col[2];
        }
      }
      roles.pk.forEach((j, q) => {
        const a = (q + 0.5) / N_PK < split;
        put(j, (a ? pxA : pxB) + J[j][0] * spread, (a ? pyA : pyB) + J[j][1] * spread, pr, pc, pa);
      });

      // Labels: each book's two prices, the gauge reading, the locked profit.
      ctx.globalCompositeOperation = 'source-over';
      const ink = col[3], soft = dark ? col[2] : col[3];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = (s, x, y, c, a, f) => { if (a < 0.01) return; ctx.font = f; ctx.fillStyle = api.rgba(c, clamp(a)); ctx.fillText(s, x, y); };
      const tv = alpha * vis;
      for (let i = 0; i < NB; i++) {
        const x0 = SX(i), y0 = SY(i), down = SPOS[i][1] > 0;
        const ly = y0 + (down ? 1 : -1) * (0.07 * R + 18);
        const aA = i === iA, bB = i === iB;
        const cA = arb > 0.5 && aA ? acc : aA ? ink : soft, cB = arb > 0.5 && bB ? acc : bB ? ink : soft;
        txt(oA[i].toFixed(2), x0 - 24, ly, cA, tv * (aA ? 1 : 0.6), FONT(aA ? 600 : 400, 13));
        txt(oB[i].toFixed(2), x0 + 24, ly, cB, tv * (bB ? 1 : 0.6), FONT(bB ? 600 : 400, 13));
      }
      const pct = (S * 100).toFixed(1) + '%';
      txt(pct, cx, cy + gr + 0.075 * R + 10, arb > 0.5 ? acc : ink, tv * 0.95, FONT(600, 17));
      txt('implied', cx, cy + gr + 0.075 * R + 30, soft, tv * 0.6, FONT(400, 11));
      if (lock) {
        const la = smooth((t - RET + 0.3) / 0.6) * (1 - smooth((t - 19.2) / 0.9)) * tv;
        txt('+' + (lock.profit * 100).toFixed(1) + '% locked', cx, cy - gr - 0.065 * R - 18, acc, la, FONT(600, 15));
      }
      ctx.restore();
    }
  };
  return self;
};
