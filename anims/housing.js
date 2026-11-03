// In-galaxy animation for 'housing'. See anims/README.md for the API.
// Every star is a house. The stars leave the spiral and become a scatter plot
// (x = size, y = price). A decision tree regressor then splits the size axis,
// depth by depth, and each leaf's stars settle onto its predicted price: the
// stepped prediction surface a tree really produces. Then they relax back.
GALAXY_ANIMS['housing'] = function (api) {
  const { rng, clamp } = api;
  const N = 1800;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rng(); return (s - 2) / 0.577; };

  // Seeded plausible houses: size skewed small, price grows with size, noise grows too.
  const sz = new Float32Array(N), pr = new Float32Array(N), dl = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = 0.03 + 0.94 * Math.pow(rng(), 1.35);
    const p = 0.1 + 0.48 * s + 0.3 * s * s + gauss() * 0.045 * (0.6 + s);
    sz[i] = s; pr[i] = clamp(p, 0.03, 0.97);
    dl[i] = (i / N) * 0.75 + rng() * 0.25; // inner stars leave first
  }

  // Decision tree regressor on size, greedy SSE splits, depth 4.
  const ord = Array.from({ length: N }, (_, i) => i).sort((a, b) => sz[a] - sz[b]);
  const splits = [], leaves = [], leafOf = new Int16Array(N), mean = new Float32Array(N);
  (function grow(lo, hi, d) {
    let best = -1, bestE = Infinity;
    if (d < 4 && hi - lo >= 120) {
      let tS = 0, tQ = 0;
      for (let k = lo; k < hi; k++) { const v = pr[ord[k]]; tS += v; tQ += v * v; }
      let lS = 0, lQ = 0;
      for (let k = lo; k < hi - 1; k++) {
        const v = pr[ord[k]]; lS += v; lQ += v * v;
        const nl = k - lo + 1, nr = hi - lo - nl;
        if (nl < 50 || nr < 50) continue;
        const rS = tS - lS, rQ = tQ - lQ;
        const e = lQ - lS * lS / nl + rQ - rS * rS / nr;
        if (e < bestE) { bestE = e; best = k + 1; }
      }
    }
    if (best < 0) {
      let m = 0;
      for (let k = lo; k < hi; k++) m += pr[ord[k]];
      m /= hi - lo;
      const li = leaves.length;
      leaves.push({ x0: sz[ord[lo]], x1: sz[ord[hi - 1]], m });
      for (let k = lo; k < hi; k++) { leafOf[ord[k]] = li; mean[ord[k]] = m; }
      return;
    }
    splits.push({ x: (sz[ord[best - 1]] + sz[ord[best]]) / 2, d });
    grow(lo, best, d + 1); grow(best, hi, d + 1);
  })(0, N, 0);
  const NL = leaves.length;

  // Timeline (seconds).
  const LIFT = 1.2, LIFTD = 2.2, AX = 4.6, SPL = 6.0, SPLD = 1.3, SET = 11.6, HOLD = 17.6, BACK = 17.6, LOOP = 23;
  const BA = [0.3, 0.5, 0.75, 0.92], BS = [1.0, 1.15, 1.45, 1.9];
  let T = 0;

  const self = {
    spiralDim: 0,
    update(dt) {
      T = (T + dt) % LOOP;
      const up = smooth((T - LIFT) / 0.9), down = 1 - smooth((T - (BACK + 3.4)) / 1.4);
      self.spiralDim = 0.93 * Math.min(up, down);
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const st = api.stars(N), n = st.n;
      const col = api.colors(), acc = api.accent(), dark = api.dark();
      const vis = self.spiralDim / 0.93;
      if (vis < 0.005) return;

      // Plot frame around the galaxy centre.
      const PW = 2.2 * R, PH = 1.35 * R;
      const L = cx - PW / 2, B = cy + PH / 2;
      const X = s => L + s * PW, Y = p => B - p * PH;

      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

      // Axes and tiny labels.
      const axA = alpha * smooth((T - AX) / 1.0) * (1 - smooth((T - BACK) / 1.0));
      if (axA > 0.01) {
        const ink = col[2];
        api.line(ctx, L, B, L + PW, B, ink, 0.28 * axA, 1);
        api.line(ctx, L, B, L, B - PH, ink, 0.28 * axA, 1);
        ctx.font = api.mono; ctx.textBaseline = 'middle';
        ctx.fillStyle = api.rgba(ink, 0.6 * axA);
        ctx.textAlign = 'right'; ctx.fillText('size →', L + PW, B + 14);
        ctx.save(); ctx.translate(L - 12, B - PH); ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right'; ctx.fillText('price →', 0, 0); ctx.restore();
      }

      // Split lines, one depth level at a time, drawn top to bottom.
      const lnFade = 1 - smooth((T - BACK) / 1.0);
      for (const s of splits) {
        const t0 = SPL + s.d * SPLD, g = smooth((T - t0) / 0.9);
        if (g <= 0) continue;
        const x = X(s.x), settled = smooth((T - SET) / 2.5);
        const a = alpha * lnFade * (0.5 - 0.08 * s.d) * (1 - 0.5 * settled);
        api.line(ctx, x, B - PH, x, B - PH + PH * g, acc, a, 1);
      }
      // Depth counter while the tree grows.
      const dNow = Math.min(4, Math.floor((T - SPL) / SPLD) + 1);
      if (T > SPL && axA > 0.01) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = api.mono;
        ctx.fillStyle = api.rgba(col[2], 0.55 * axA);
        const txt = T < SET ? 'decision tree · depth ' + dNow : 'decision tree · ' + NL + ' leaves';
        ctx.fillText(txt, L + 8, B - PH + 4);
      }

      // Stars: live spiral position mixed with plot position.
      const back = smooth((T - BACK) / 3.6);
      for (let b = 0; b < 4; b++) {
        const r = BS[b];
        for (let i = 0; i < n; i++) {
          if (st.b[i] !== b) continue;
          const k = smooth((T - LIFT - dl[i] * 1.8) / LIFTD) * (1 - smooth((back * 1.25 - (1 - dl[i]) * 0.25))) ;
          const li = leafOf[i];
          const se = smooth((T - SET - (li / NL) * 1.4) / 1.6);
          const py = pr[i] + (mean[i] + (pr[i] - mean[i]) * 0.12 - pr[i]) * se;
          const tx = X(sz[i]), ty = Y(py);
          let x, y, a;
          const sx = st.x[i], sy = st.y[i];
          if (sx < -1e3) { x = tx; y = ty; a = k; } else { x = sx + (tx - sx) * k; y = sy + (ty - sy) * k; a = 1; }
          a *= BA[b] * vis * alpha * (1 + 0.25 * k) * (dark ? 1 : 0.9);
          if (a < 0.01) continue;
          ctx.fillStyle = api.rgba(col[b], Math.min(1, a));
          ctx.fillRect(x - r / 2, y - r / 2, r, r);
        }
      }

      // Leaf predictions: faint accent ticks once settled.
      const tk = alpha * smooth((T - SET - 1.6) / 1.4) * lnFade;
      if (tk > 0.01) for (const lf of leaves) {
        api.line(ctx, X(lf.x0), Y(lf.m), X(lf.x1), Y(lf.m), acc, 0.35 * tk, 1);
      }
      ctx.restore();
    }
  };
  return self;
};
