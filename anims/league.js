// In-galaxy animation for 'league' (LeagueVODreview).
// The galaxy's own stars stream out of the spiral and line up into a win-probability
// curve over a 0-30 min game, with a faint 50% midline. A playhead sweeps the game;
// at each big swing a knot of stars flares with a small label. Then it all relaxes
// back into the spiral and the loop repeats. Curve data is illustrative (seeded).
GALAXY_ANIMS['league'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { rng, TAU, clamp, rgba, ease3 } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };

  // Timeline (seconds).
  const G0 = 0, G1 = 3.6;          // gather out of the spiral
  const S0 = 4.2, S1 = 16.2;       // playhead sweeps 0..30 min
  const H1 = 19.5;                 // hold
  const R1 = 23.0;                 // relax back into the spiral
  const LOOP = 25.0;

  // Win-probability series, one sample per 15 s (121 points), seeded.
  const EVENTS = [
    { t: 6.5, d: 0.09, label: '+9% dragon' },
    { t: 12.5, d: -0.12, label: '-12% teamfight' },
    { t: 18.0, d: 0.07, label: '+7% herald' },
    { t: 24.0, d: 0.18, label: '+18% Baron', key: true }
  ];
  const K = 121, base = new Float32Array(K), WP = new Float32Array(K);
  { let v = 0, vel = 0;
    for (let k = 0; k < K; k++) { vel = vel * 0.75 + (rng() - 0.5) * 0.014; v = v * 0.96 + vel; base[k] = v; } }
  for (let k = 0; k < K; k++) {
    const t = k * 0.25;
    let p = 0.5 + base[k] - 0.015 * Math.sin(t / 30 * Math.PI);
    EVENTS.forEach(e => { p += e.d * smooth((t - e.t) / 0.9 + 0.5); });
    WP[k] = clamp(p, 0.06, 0.94);
  }
  const wpAt = u => { const f = clamp(u) * (K - 1), i = Math.min(K - 2, Math.floor(f)), r = f - i; return WP[i] + (WP[i + 1] - WP[i]) * r; };

  // Star budget per role.
  const NC = 620, NM = 72, NP = 26, NE = 26;
  const NT = NC + NM + NP + 1 + NE * EVENTS.length;

  // Curve stars spaced evenly by arc length (aspect matches the on-screen box).
  const ASP = 0.5;
  const cu = new Float32Array(NC), cj = new Float32Array(NC);
  { const M = 800, L = new Float32Array(M + 1);
    for (let i = 1; i <= M; i++) {
      const u0 = (i - 1) / M, u1 = i / M;
      L[i] = L[i - 1] + Math.hypot(u1 - u0, ASP * (wpAt(u1) - wpAt(u0)));
    }
    let j = 0;
    for (let i = 0; i < NC; i++) {
      const s = (i + 0.5) / NC * L[M];
      while (j < M && L[j + 1] < s) j++;
      cu[i] = (j + (s - L[j]) / Math.max(1e-6, L[j + 1] - L[j])) / M;
      const g = (rng() + rng() + rng() - 1.5);
      cj[i] = g * (rng() < 0.15 ? 3.2 : 1.1);
    }
  }
  // Event knots: angle and radius factor per star.
  const ea = new Float32Array(NE), er = new Float32Array(NE);
  for (let i = 0; i < NE; i++) { ea[i] = (i / NE) * TAU + (rng() - 0.5) * 0.4; er[i] = 0.55 + rng() * 0.45; }

  // Per-star motion params.
  const dIn = new Float32Array(NT), dOut = new Float32Array(NT), bend = new Float32Array(NT);
  for (let i = 0; i < NT; i++) { dIn[i] = rng() * 1.3; dOut[i] = rng() * 1.2; bend[i] = (rng() - 0.5) * 0.5; }

  let T = 0, pick = null, spiralDim = 0;
  const tx = new Float32Array(NT), ty = new Float32Array(NT), ta = new Float32Array(NT), tr = new Float32Array(NT);
  const tc = new Uint8Array(NT); // 0..3 galaxy colour bucket, 4 = accent

  function choose(n) {
    // Spread picks across the whole galaxy (stars() is innermost first), shuffled.
    const m = Math.min(NT, n), idx = new Int32Array(NT);
    for (let i = 0; i < NT; i++) idx[i] = i < m ? Math.floor((i + 0.5) * n / m) : Math.floor(rng() * n);
    for (let i = NT - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return idx;
  }

  const anim = {
    wp: WP,
    get spiralDim() { return spiralDim; },
    update(dt) { T = (T + Math.min(dt, 0.7)) % LOOP; },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const S = api.stars(3000);
      if (!S.n) return;
      if (!pick) pick = choose(S.n);
      const dark = api.dark(), col = api.colors(), acc = api.accent();

      // Plot box in the free area, centred on the galaxy core.
      const Wd = Math.min(R * 2.3, cx * 1.55, 900), Hd = Wd * ASP;
      const X0 = cx - Wd / 2, Yc = cy;
      const px = u => X0 + u * Wd, py = p => Yc + (0.5 - p) * Hd;

      // Phase envelopes.
      const gin = t => smooth((T - G0 - t) / (G1 - G0 - 1.3));
      const gout = t => 1 - smooth((T - H1 - t) / (R1 - H1 - 1.2));
      const form = T < H1 ? smooth((T - G0) / (G1 - G0)) : 1 - smooth((T - H1) / (R1 - H1));
      spiralDim = 0.92 * form;
      const ph = clamp((T - S0) / (S1 - S0));           // playhead 0..1
      const sweeping = T > S0 && T < H1;

      // Targets.
      let o = 0;
      for (let i = 0; i < NC; i++, o++) {
        const u = cu[i], ahead = u > ph;
        tx[o] = px(u); ty[o] = py(wpAt(u)) + cj[i];
        const lit = T < S0 ? 0.5 : ahead ? 0.3 : 0.72;
        ta[o] = lit * (Math.abs(cj[i]) > 2 ? 0.45 : 1); tr[o] = (dark ? 1.0 : 1.15) + (ahead ? 0 : 0.3); tc[o] = ahead ? 2 : 3;
      }
      for (let i = 0; i < NM; i++, o++) {
        tx[o] = px((i + 0.5) / NM); ty[o] = py(0.5); ta[o] = 0.3; tr[o] = 1.0; tc[o] = 2;
      }
      const hx = px(ph), hp = wpAt(ph), hy = py(hp);
      for (let i = 0; i < NP; i++, o++) {
        tx[o] = hx; ty[o] = py(0.04 + 0.92 * i / (NP - 1)); ta[o] = sweeping ? 0.32 : 0.08; tr[o] = 0.9; tc[o] = 2;
      }
      tx[o] = hx; ty[o] = hy; ta[o] = 1; tr[o] = 2.4; tc[o] = 3; o++;
      const flares = [];
      EVENTS.forEach(e => {
        const u = e.t / 30, ex = px(u), ey = py(wpAt(u));
        const k = T - (S0 + u * (S1 - S0));            // seconds since the playhead hit it
        const burst = k > 0 ? ease3(k / 0.8) : 0, settle = k > 0.8 ? smooth((k - 0.8) / 1.6) : 0;
        const big = e.key ? 1.35 : 1, rad = 0.8 + 26 * big * burst - 15 * big * settle;
        const flash = k > 0 ? Math.max(0, 1 - k / 2.0) : 0;
        for (let i = 0; i < NE; i++, o++) {
          tx[o] = ex + Math.cos(ea[i]) * rad * er[i]; ty[o] = ey + Math.sin(ea[i]) * rad * er[i];
          ta[o] = k > 0 ? 0.45 + 0.55 * flash : 0.12; tr[o] = k > 0 ? 1.1 + flash * 0.9 : 0.8;
          tc[o] = (flash > 0.3 && (e.key || i % 2 === 0)) ? 4 : 3;
        }
        if (k > 0) {
          // Label sits just beyond the swing's extreme so it never sits on the curve.
          const a0 = wpAt(u - 0.04), a1 = wpAt(u + 0.04);
          const up = e.d > 0, ly = up ? py(Math.max(a0, a1)) - 24 : py(Math.min(a0, a1)) + 24;
          flares.push({ e, ex, ey, ly, up, k, flash });
        }
      });

      // Draw: each star travels from its live spiral position to its target.
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const A = alpha * (dark ? 1 : 1.3);
      for (let i = 0; i < NT; i++) {
        const e = T < H1 ? gin(dIn[i]) : gout(dOut[i]);
        if (e <= 0.002) continue;
        const j = pick[i];
        let sx = S.x[j], sy = S.y[j];
        if (sx < -5e3) { sx = cx; sy = cy; }
        const dx = tx[i] - sx, dy = ty[i] - sy, w = Math.sin(Math.PI * e) * bend[i];
        const x = sx + dx * e - dy * w, y = sy + dy * e + dx * w;
        const c = tc[i] === 4 ? acc : col[tc[i] === 3 ? 3 : tc[i]];
        // Fade in with travel so the hand-off from the spiral is seamless.
        const a = A * Math.min(1, e * 2.5) * (0.5 + 0.5 * e) * (ta[i] * e + 0.6 * (1 - e));
        const r = (0.8 + (tr[i] - 0.8) * e) * (dark ? 1 : 1.15);
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
        if (dark && e > 0.95 && ta[i] > 0.7 && i < NC) {   // soft glow on the played curve
          ctx.fillStyle = rgba(c, a * 0.05);
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = prev;

      // Labels: minimal mono text, faded with the formed state.
      const fa = alpha * (dark ? 1 : 1.5) * smooth((form - 0.75) / 0.25);
      if (fa > 0.01) {
        const lc = col[3];
        ctx.save(); ctx.font = api.mono; ctx.textBaseline = 'middle';
        ctx.textAlign = 'right'; ctx.fillStyle = rgba(lc, fa * 0.7);
        ctx.fillText('50%', X0 - 10, py(0.5));
        ctx.textAlign = 'center'; ctx.fillStyle = rgba(lc, fa * 0.65);
        ['0:00', '10:00', '20:00', '30:00'].forEach((s, i) => ctx.fillText(s, px(i / 3), py(0) + 16));
        ctx.textAlign = 'left'; ctx.fillStyle = rgba(lc, fa * 0.6);
        ctx.fillText('win probability', X0, py(1) - 14);
        ctx.restore();
        flares.forEach(f => {
          const la = fa * smooth((f.k - 0.25) / 0.6);
          const up = f.up, ly = f.ly;
          api.line(ctx, f.ex, f.ey + (up ? -8 : 8), f.ex, ly + (up ? 7 : -7), lc, la * 0.25, 1);
          // The key swing keeps the accent; the others flash it, then settle to ink.
          api.text(ctx, f.e.label, f.ex, ly, f.e.key || f.flash > 0.25 ? acc : lc, la * 0.9);
        });
        if (sweeping) {
          const m = Math.floor(ph * 30), s = Math.floor((ph * 30 - m) * 4) * 15;
          api.text(ctx, Math.round(hp * 100) + '%', hx + 22, hy - 12, lc, fa * 0.85);
          api.text(ctx, m + ':' + (s < 10 ? '0' : '') + s, hx, py(0) + 30, lc, fa * 0.5 * (1 - smooth((T - S1) / 0.6)));
        }
      }
    }
  };
  return anim;
};
