// In-galaxy animation for 'reels' (Video To Reels).
// The galaxy's own stars pour into a tall phone frame and fill its screen as a dot-matrix
// picture. Under the picture a bar graph of stars is the "most replayed" curve: its peak
// lifts in the accent colour, those bars are the 30 s window that plays, then a swipe sends
// the picture streaming upward and the next reel forms from the stars below. After four
// reels the stars relax back into the spiral. Pictures are procedural dot-matrix scenes.
GALAXY_ANIMS['reels'] = function (api) {
  const { rng, TAU, clamp, rgba, mix } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

  // Timeline (seconds).
  const G1 = 4.0, REEL = 4.6, SW = 0.7, NREEL = 4;
  const R0 = G1 + NREEL * REEL, R1 = R0 + 3.4, LOOP = 26.4;

  // Dot-matrix screen: picture rows, one gap row, then the replay graph.
  const COLS = 24, PR = 36, GAP = 1, CR = 6, ROWS = PR + GAP + CR;
  const NPIC = COLS * PR, NCH = COLS * CR;

  // Pictures (lum 0..1 per cell), drawn in cell units.
  const tri = z => 1 - Math.abs(2 * (z - Math.floor(z)) - 1);
  function lum(s, c, r, t) {
    const x = c + 0.5, y = r + 0.5;
    if (s === 0) {                                   // sunset over hills
      const sy = 19 + 0.8 * Math.sin(t * 0.6), d = Math.hypot(x - 12, y - sy);
      const h1 = 27 + 2.2 * Math.sin(x * 0.35 + 1) + 1.4 * Math.sin(x * 0.8);
      const h2 = 31 + 1.8 * Math.sin(x * 0.28 + 3) + 1.0 * Math.sin(x * 0.9 + 1);
      if (y > h2) return 0.3;
      if (y > h1) return Math.abs(y - h2) < 0.9 ? 0.7 : 0.14;
      const sun = d < 5.5 ? 1 : 0.55 * Math.exp(-(d - 5.5) / 5);
      return clamp(Math.max(sun, 0.2 + 0.35 * y / 27));
    }
    if (s === 1) {                                   // moon over mountains
      const ridge = 31 - 9 * tri(x / 10 + 0.15) - 4 * tri(x / 4.4 + 0.6);
      if (y > ridge) return Math.abs(y - ridge) < 0.9 ? 0.9 : 0.3 - 0.2 * (y - ridge) / 12;
      const dm = Math.hypot(x - 16.5, y - 9), dc = Math.hypot(x - 17.9, y - 8.2);
      if (dm < 3.6) return dc < 3.2 ? 0.14 : 1;
      const star = hash(c, r, 3) > 0.93 ? 0.4 + 0.5 * Math.sin(t * 2 + hash(c, r, 1) * 9) : 0;
      return clamp(Math.max(star, 0.18 + 0.45 * Math.exp(-(dm - 3.6) / 7)));
    }
    if (s === 2) {                                   // sun on the sea
      if (y < 17) {
        const d = Math.hypot(x - 12, y - 12.5);
        return clamp(d < 3.3 ? 1 : Math.max(0.5 * Math.exp(-(d - 3.3) / 4), 0.2 + 0.3 * y / 17));
      }
      const w = 1.6 + (y - 17) * 0.45, refl = Math.exp(-(((x - 12) / w) ** 2));
      const ripple = 0.5 + 0.5 * Math.sin(y * 1.9 - t * 3 + Math.sin(x * 0.9) * 1.6);
      return clamp(0.14 + 0.3 * ripple + 0.7 * refl * ripple);
    }
    const bi = Math.floor(c / 4), top = 36 - (9 + 17 * hash(bi, 7, 2));   // city at night
    if (Math.hypot(x - 19.5, y - 6.5) < 2) return 1;
    if (y < top) return 0.18 + 0.3 * y / 36;
    const wcol = c % 4 === 1 || c % 4 === 2;
    if (wcol && r % 3 !== 0 && hash(c, r, bi) > 0.42) return 0.55 + 0.4 * Math.sin(t * 0.7 + hash(c, r, 5) * 6) ** 2;
    return Math.abs(y - top) < 1 ? 0.8 : 0.22;
  }

  // Replay graph per reel: base bar heights, a peak column, and the 3-bar window around it.
  const REELS = [];
  for (let n = 0; n < NREEL; n++) {
    const base = new Float32Array(COLS);
    let v = 1.6;
    for (let c = 0; c < COLS; c++) { v = clamp(v * 0.7 + (0.3 + 1.4 * rng()) * 0.5 + 0.35, 0.8, 3.0); base[c] = v; }
    REELS.push({ base, pc: [8, 16, 5, 13][n] });
  }
  // Bar height of column c for reel n at local time u; the peak lifts, then holds.
  function barH(n, c, u) {
    const R = REELS[n], d = c - R.pc, L = smooth((u - 0.3) / 0.9);
    const tgt = R.base[c] + (CR - R.base[c]) * Math.exp(-d * d / 1.1);
    return R.base[c] + (tgt - R.base[c]) * L;
  }

  // Phone frame outline as a rounded rectangle, N points by arc length.
  function frame(w, h, rad, N) {
    const a = w / 2 - rad, b = h / 2 - rad, seg = [2 * a, rad * Math.PI / 2, 2 * b, rad * Math.PI / 2, 2 * a, rad * Math.PI / 2, 2 * b, rad * Math.PI / 2];
    const per = seg.reduce((p, q) => p + q, 0), cor = [[a, -b, -Math.PI / 2], [a, b, 0], [-a, b, Math.PI / 2], [-a, -b, Math.PI]], out = [];
    for (let j = 0; j < N; j++) {
      let d = (j / N) * per, s = 0;
      while (d > seg[s]) { d -= seg[s]; s = (s + 1) % 8; }
      if (s === 0) out.push([-a + d, -h / 2]);
      else if (s === 2) out.push([w / 2, -b + d]);
      else if (s === 4) out.push([a - d, h / 2]);
      else if (s === 6) out.push([-w / 2, b - d]);
      else { const q = cor[(s - 1) / 2], an = q[2] + d / rad; out.push([q[0] + Math.cos(an) * rad, q[1] + Math.sin(an) * rad]); }
    }
    return out;
  }
  const NF = 170;
  const NT = NF + NPIC + NCH;

  // Per-star motion params.
  const dIn = new Float32Array(NT), dOut = new Float32Array(NT), bend = new Float32Array(NT), jit = new Float32Array(NT);
  for (let i = 0; i < NT; i++) { dIn[i] = rng() * 1.3; dOut[i] = rng() * 1.2; bend[i] = (rng() - 0.5) * 0.5; jit[i] = 0.65 + 0.35 * rng(); }
  // Picture stars arrive roughly top to bottom so the picture "pours" in.
  for (let i = 0; i < NPIC; i++) dIn[NF + i] = 0.25 + 0.6 * Math.floor(i / COLS) / PR + rng() * 0.45;

  let T = 0, pick = null, spiralDim = 0;
  function choose(n) {
    const m = Math.min(NT, n), idx = new Int32Array(NT);
    for (let i = 0; i < NT; i++) idx[i] = i < m ? Math.floor((i + 0.5) * n / m) : Math.floor(rng() * n);
    for (let i = NT - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return idx;
  }

  return {
    get spiralDim() { return spiralDim; },
    update(dt) { T = (T + Math.min(dt, 0.7)) % LOOP; },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const S = api.stars(3000);
      if (!S.n) return;
      if (!pick) pick = choose(S.n);
      const dark = api.dark(), C = api.colors(), acc = api.accent();

      // Layout: the screen grid is centred on the galaxy core.
      const small = window.innerWidth < 700;
      const halfH = small ? Math.min(cy - 138, window.innerHeight * 0.44 - cy - 6) : cy * 0.81;
      const P = Math.min(13, halfH * 2 / (ROWS + 4), (cx * 1.6) / (COLS + 5), R * 0.06);
      const X0 = cx - COLS * P / 2, Y0 = cy - ROWS * P / 2;
      const gx = c => X0 + (c + 0.5) * P, gy = r => Y0 + (r + 0.5) * P;
      const picTop = Y0, picBot = Y0 + PR * P;
      const FR = frame(COLS * P + 2.6 * P, ROWS * P + 2.6 * P, 2.4 * P, NF);

      // Phase envelopes.
      const form = T < R0 ? smooth(T / G1) : 1 - smooth((T - R0) / (R1 - R0));
      spiralDim = 0.95 * form;
      const gin = t => smooth((T - t) / (G1 - 1.3));
      const gout = t => 1 - smooth((T - R0 - t) / (R1 - R0 - 1.2));
      const env = i => (T < R0 ? gin(dIn[i]) : gout(dOut[i]));

      // Reel clock.
      const tt = Math.min(Math.max(0, T - G1), NREEL * REEL - 0.001);
      const n = Math.min(NREEL - 1, Math.floor(tt / REEL)), u = tt - n * REEL;
      const sw = n < NREEL - 1 ? smooth((u - (REEL - SW)) / SW) : 0;
      const nxt = (n + 1) % NREEL;

      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const A = alpha * (dark ? 1 : 1.3);

      // One star flying from its live galaxy position to its target on the phone.
      function emit(i, tx, ty, ta, tr, col, trail) {
        const e = env(i);
        if (e <= 0.002) return;
        if (ta < 0.01 && e >= 1) return;
        const j = pick[i];
        let sx = S.x[j], sy = S.y[j];
        if (sx < -5e3) { sx = cx; sy = cy; }
        const dx = tx - sx, dy = ty - sy, w = Math.sin(Math.PI * e) * bend[i];
        const x = sx + dx * e - dy * w, y = sy + dy * e + dx * w;
        const a = A * Math.min(1, e * 2.5) * (0.5 + 0.5 * e) * (ta * e + 0.6 * (1 - e));
        const r = 0.8 + (tr - 0.8) * e;
        if (trail > 0.5 && e >= 1) { ctx.fillStyle = rgba(col, a * 0.3); ctx.fillRect(x - r * 0.5, y, r, trail); }
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }

      // Phone frame.
      for (let i = 0; i < NF; i++) emit(i, cx + FR[i][0], cy + FR[i][1], 0.8, dark ? 1.5 : 1.7, C[2], 0);

      // Picture. During a swipe each star streams up and out, then the next picture's star
      // rises into the same cell from below.
      const pr = Math.max(0.9, Math.min(3.2, P * 0.3));
      for (let k = 0; k < NPIC; k++) {
        const i = NF + k, c = k % COLS, r = (k / COLS) | 0;
        let sc = n, ox = 0, oy = 0, fade = 1, trail = 0;
        if (sw > 0) {
          const q = sw < 0.5 ? sw * 2 : 2 - sw * 2;      // 1 at the swap, 0 at both ends
          const dist = (PR + 3) * P * jit[i];
          if (sw < 0.5) oy = -smooth(sw * 2) * dist;
          else { sc = nxt; oy = (1 - smooth(sw * 2 - 1)) * dist; }
          trail = q * P * 1.6;
        }
        const y = gy(r) + oy;
        const out = Math.max(0, picTop - y, y - picBot);
        fade = 1 - clamp(out / (2 * P));
        if (fade <= 0.01) continue;
        const L = lum(sc, c, r, T);
        const col = C[L < 0.25 ? 0 : L < 0.5 ? 1 : L < 0.75 ? 2 : 3];
        emit(i, gx(c) + ox, y, (0.2 + 0.8 * L) * fade, pr * (0.55 + 0.6 * L), col, trail * fade);
      }

      // Replay graph. The peak lifts in accent; its window plays; then it re-forms for the next reel.
      const R_ = REELS[n], Rn = REELS[nxt];
      const selA = smooth((u - 0.95) / 0.4) * (1 - smooth(sw * 2));
      const prog = clamp((u - 1.7) / (REEL - SW - 0.25 - 1.7));
      for (let c = 0; c < COLS; c++) {
        let h = barH(n, c, u);
        if (sw > 0) h = h + (Rn.base[c] - h) * smooth((sw - 0.35) / 0.5);
        const win = Math.abs(c - R_.pc) <= 1;
        let w = 0, boost = 1;
        if (win) {
          w = selA;
          const idx = c - R_.pc + 1, played = clamp(prog * 3 - idx);
          boost = 0.65 + 0.35 * played;
        }
        const col = w > 0.02 ? mix(C[2], acc, w) : C[2];
        for (let k = 0; k < CR; k++) {
          const i = NF + NPIC + c * CR + k;
          const ta = clamp(h - k) * (win ? boost : 0.6) * (0.5 + 0.5 * (k / CR) + 0.35);
          emit(i, gx(c), gy(PR + GAP + CR - 1 - k), Math.min(1, ta), pr * 0.85 + 0.2, col, 0);
        }
      }
      ctx.globalCompositeOperation = prev;

      // The one label: the length of the peak window, under the phone.
      const la = alpha * (dark ? 1 : 1.5) * smooth((form - 0.75) / 0.25) * selA;
      if (la > 0.02) api.text(ctx, '30 s', gx(R_.pc), Y0 + ROWS * P + 2.2 * P, acc, la * 0.95);
    }
  };
};
