// In-galaxy animation for 'jobapply'. See anims/README.md for the API.
// The galaxy's own stars become job postings. Four job boards on the left stream
// postings (a bright head and a short title line) into an inbox; duplicates slide onto
// their twin and merge; a ranking pass lines the rest up by score; the top posting gets
// an AI-written document page and a form whose fields fill themselves, and it all stops
// at an unpressed "you submit" button. Then every star flies home and the spiral returns.
GALAXY_ANIMS['jobapply'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { rng, clamp, mix, TAU } = api;
  const L = 25;                                   // loop length, seconds
  const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const N = Math.max(1, api.stars(1500).n);       // only the count; positions are read live each frame
  const perm = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  let next = 0;
  const actors = [];
  // Keyframes: p = null means "at home" (the star's live spiral position), a = alpha,
  // r = radius in 1/100 of the galaxy radius, c = colour level 0..3, k = accent mix.
  const actor = () => { const A = { j: perm[next++ % N], kf: [] }; actors.push(A); return A; };
  const key = (A, t, p, a, r, c, k = 0) => A.kf.push({ t, p, a, r, c, k });
  const lastOf = A => A.kf[A.kf.length - 1];
  const RET = 21.2, END = 22.6;                   // return flights start; native spiral comes back END..L-0.4
  // Waiting at home the star is invisible (the native spiral shows it); it fades in as it flies out.
  const begin = (A, tLeave, r = 1, c = 2) => { key(A, 0, null, 0, r, c); key(A, tLeave, null, 0, r, c); };
  const finish = A => {
    const l = lastOf(A), t0 = RET + rng() * 0.6;
    if (l.t < t0) key(A, t0, l.p, l.a, l.r, l.c, l.k);
    key(A, t0 + 1.5, null, 0.35, 0.6, 1.5);
    key(A, L - 0.4, null, 0, 0.6, 1.5);
  };

  // ---- Job boards: small rings of stars down the left edge.
  const SRC = [[-1.22, -0.6], [-1.22, -0.2], [-1.22, 0.2], [-1.22, 0.6]];
  const SRC_NAME = ['job bank', 'indeed', 'linkedin', 'workday'];
  SRC.forEach((s, si) => {
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * TAU, A = actor();
      begin(A, 0.6 + si * 0.15 + i * 0.03);
      key(A, lastOf(A).t + 1.3, [s[0] + Math.cos(th) * 0.045, s[1] + Math.sin(th) * 0.045], 0.75, 0.75, 2.6);
      key(A, 6.6, [s[0] + Math.cos(th) * 0.045, s[1] + Math.sin(th) * 0.045], 0.75, 0.75, 2.6);
      key(A, 7.6, [s[0] + Math.cos(th) * 0.045, s[1] + Math.sin(th) * 0.045], 0, 0.75, 2.6);
      key(A, 7.7, null, 0, 0.6, 1.5);
    }
  });

  // ---- Postings: U unique + D duplicates. Each is a row: a head star and four title stars.
  const U = 13, D = 4, NP = U + D, BODY = 4, GAP = 0.052;
  const HEAD_R = 1.7, BODY_R = 0.95;
  const score = Array.from({ length: U }, () => 0.1 + 0.9 * rng());
  const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]);
  const rank = []; order.forEach((u, r) => (rank[u] = r));
  // Inbox slots: a jittered 3 x 6 grid in the middle, shuffled.
  const slots = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) slots.push([-0.62 + c * 0.5 + (rng() - 0.5) * 0.08, -0.72 + r * 0.29 + (rng() - 0.5) * 0.06]);
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const rowP = (o, i) => [o[0] + i * GAP, o[1]];
  // Ranked list, top to bottom, on the left.
  const LX = -1.08, rankY = r => -0.78 + r * (1.56 / (U - 1));
  const tMerge = d => 6.0 + d * 0.5;
  const tRank = r => 8.9 + r * 0.09;
  const T_TOP = 10.9;                             // the top posting is picked

  for (let p = 0; p < NP; p++) {
    const dup = p >= U, d = p - U, u = dup ? d * 3 : p;   // duplicate d is a twin of posting d*3
    const src = dup ? (p + 1) % 4 : p % 4, tEmit = 1.9 + p * 0.17;
    const slot = slots[p], tw = slots[u];
    const q = 1 - rank[u] / (U - 1);
    for (let i = 0; i <= BODY; i++) {
      const A = actor(), head = i === 0, r0 = head ? HEAD_R : BODY_R, c0 = head ? 2.6 : 2;
      const s = SRC[src], sp = [s[0] + (rng() - 0.5) * 0.02, s[1] + (rng() - 0.5) * 0.02];
      begin(A, tEmit - 1.1, r0, c0);
      key(A, tEmit, sp, 0.9, r0 * 0.7, 3);                   // gathers inside its board
      key(A, tEmit + 1.3, rowP(slot, i), 0.9, r0, c0);       // streams out into the inbox
      if (dup) {
        const tm = tMerge(d);
        key(A, tm, rowP(slot, i), 0.9, r0, c0);
        key(A, tm + 0.8, rowP(tw, i), 0.9, r0, c0);          // slides onto its twin
        key(A, tm + 1.0, rowP(tw, i), 0, r0, c0);            // and merges into it
        key(A, RET, rowP(tw, i), 0, r0, c0);
        key(A, RET + 1.5, null, 0.35, 0.6, 1.5);
        key(A, L - 0.4, null, 0, 0.6, 1.5);
        continue;
      }
      if (p % 3 === 0 && p / 3 < D) {                        // this posting receives a duplicate
        const tm = tMerge(p / 3);
        key(A, tm + 0.8, rowP(slot, i), 0.9, r0, c0);
        key(A, tm + 1.0, rowP(slot, i), 1, r0 * 1.35, 3, head ? 1 : 0.4);
        key(A, tm + 1.8, rowP(slot, i), 0.9, r0, c0);
      }
      // Ranking: move into the list, brightness by score.
      const tr = tRank(rank[u]), lp = rowP([LX, rankY(rank[u])], i);
      const aS = 0.4 + 0.55 * q, cS = 0.7 + 2.3 * q;
      key(A, tr, rowP(slot, i), 0.9, r0, c0);
      key(A, tr + 1.4, lp, aS, r0, cS);
      if (rank[u] === 0) {
        key(A, T_TOP, lp, aS, r0, cS);
        key(A, T_TOP + 0.6, lp, 1, r0 * 1.15, 3, head ? 1 : 0.35);
      } else {
        key(A, T_TOP, lp, aS, r0, cS);
        key(A, T_TOP + 1, lp, aS * 0.5, r0, cS);
      }
      finish(A);
    }
  }

  // ---- Document page for the top posting: an outline, then lines of text typed in.
  const PX0 = -0.62, PX1 = -0.1, PY0 = -0.66, PY1 = 0.66;
  const T_PAGE = 11.4;
  {
    const per = [], st = 0.065;
    const w = PX1 - PX0, h = PY1 - PY0, nx = Math.round(w / st), ny = Math.round(h / st);
    for (let i = 0; i <= nx; i++) per.push([PX0 + (i / nx) * w, PY0], [PX0 + (i / nx) * w, PY1]);
    for (let i = 1; i < ny; i++) per.push([PX0, PY0 + (i / ny) * h], [PX1, PY0 + (i / ny) * h]);
    per.forEach(p => { const A = actor(); begin(A, T_PAGE + rng() * 0.5, 0.7, 1); key(A, lastOf(A).t + 1.3, p, 0.4, 0.7, 1.2); finish(A); });
    const lens = [0.55, 0, 1, 0.9, 1, 0.75, 0, 1, 0.95, 0.6, 0, 0.85, 1, 0.5];
    const DS = 0.032, LS = (PY1 - PY0 - 0.16) / (lens.length - 1);
    let tt = T_PAGE + 1.2;
    lens.forEach((len, li) => {
      if (!len) { tt += 0.15; return; }
      const y = PY0 + 0.08 + li * LS, n = Math.floor(((PX1 - PX0 - 0.1) * len) / DS), title = li === 0;
      for (let d = 0; d <= n; d++) {
        const A = actor(), ta = tt + d * 0.03;
        begin(A, ta - 1.3, 0.9, 2);
        key(A, ta, [PX0 + 0.05 + d * DS, y], title ? 1 : 0.8, title ? 1.2 : 0.85, title ? 3 : 2.2);
        finish(A);
      }
      tt += 0.2 + n * 0.012;
    });
  }

  // ---- Form: three fields (dim outlined boxes) that autofill left to right.
  const FX0 = 0.1, FX1 = 0.78, FH = 0.11, FY = [-0.56, -0.28, 0];
  const T_FORM = 13.6, T_FILL = 15.4;
  FY.forEach((fy, fi) => {
    const st = 0.05, w = FX1 - FX0, nx = Math.round(w / st);
    const per = [];
    for (let i = 0; i <= nx; i++) per.push([FX0 + (i / nx) * w, fy - FH / 2], [FX0 + (i / nx) * w, fy + FH / 2]);
    per.push([FX0, fy], [FX1, fy]);
    per.forEach(p => { const A = actor(); begin(A, T_FORM + fi * 0.25 + rng() * 0.4, 0.7, 1); key(A, lastOf(A).t + 1.3, p, 0.4, 0.7, 1.2); finish(A); });
    const DS = 0.034, nf = Math.floor((w - 0.08) * (0.45 + 0.5 * rng()) / DS);
    for (let d = 0; d <= nf; d++) {
      const A = actor(), ta = T_FILL + fi * 0.9 + d * 0.045;
      begin(A, ta - 1.2, 1, 2.6);
      key(A, ta, [FX0 + 0.04 + d * DS, fy], 0.95, 1.05, 2.8);
      finish(A);
    }
  });

  // ---- The unpressed submit button: an accent ring of stars below the form.
  const SUB = [(FX0 + FX1) / 2, 0.4], SR = 0.12, NR = 26, T_SUB = 18.0;
  for (let i = 0; i < NR; i++) {
    const A = actor(), th = (i / NR) * TAU - Math.PI / 2;
    begin(A, T_SUB + i * 0.03, 1, 3);
    key(A, lastOf(A).t + 1.3, [SUB[0] + Math.cos(th) * SR, SUB[1] + Math.sin(th) * SR], 0.95, 1, 3, 1);
    finish(A);
  }

  // ---- Evaluation.
  let T = 0;
  const dimAt = t => 0.94 * sm(t / 1.4) * (1 - sm((t - END) / (L - 0.4 - END)));
  const st = { x: 0, y: 0, a: 0, r: 0, c: 0, k: 0 };
  function evalA(A, t, cx, cy, R, S) {
    const kf = A.kf;
    let i = 0;
    while (i < kf.length - 1 && kf[i + 1].t <= t) i++;
    const f0 = kf[i], f1 = kf[Math.min(i + 1, kf.length - 1)];
    const e = f1 === f0 || f1.t <= f0.t ? 0 : sm((t - f0.t) / (f1.t - f0.t));
    st.a = f0.a + (f1.a - f0.a) * e;
    if (st.a <= 0.003) { st.a = 0; return st; }
    const hx = S.x[A.j], hy = S.y[A.j];
    if ((!f0.p || !f1.p) && !(hx > -9e3)) { st.a = 0; return st; }   // home star off screen
    const x0 = f0.p ? cx + f0.p[0] * R : hx, y0 = f0.p ? cy + f0.p[1] * R : hy;
    const x1 = f1.p ? cx + f1.p[0] * R : hx, y1 = f1.p ? cy + f1.p[1] * R : hy;
    // Slight bow on flights so stars arc rather than slide.
    const dx = x1 - x0, dy = y1 - y0, bow = Math.sin(Math.PI * e) * 0.12;
    st.x = x0 + dx * e - dy * bow; st.y = y0 + dy * e + dx * bow;
    st.r = f0.r + (f1.r - f0.r) * e;
    st.c = f0.c + (f1.c - f0.c) * e; st.k = f0.k + (f1.k - f0.k) * e;
    return st;
  }
  const colAt = (cols, c) => { const i = Math.max(0, Math.min(2, Math.floor(c))); return mix(cols[i], cols[i + 1], clamp(c - i)); };
  const win = (t, a, b, f = 0.6) => sm((t - a) / f) * (1 - sm((t - b) / f));

  return {
    spiralDim: 0,
    update(dt) { T = (T + dt) % L; this.spiralDim = dimAt(T); },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01 || !(R > 0)) return;
      const t = T, S = api.stars(1500), cols = api.colors(), acc = api.accent(), dark = api.dark();
      const lab = dark ? mix(cols[2], cols[3], 0.4) : mix(cols[3], api.ink, 0.45), LA = alpha * (dark ? 0.7 : 0.85), U2 = R / 100;
      const X = u => cx + u * R, Y = v => cy + v * R;
      // Labels (minimal).
      const sa = win(t, 1.0, 7.2) * LA;
      SRC.forEach((s, i) => api.text(ctx, SRC_NAME[i], X(s[0]), Y(s[1] - 0.1), lab, sa));
      api.text(ctx, 'dedupe', X(0.13), Y(-0.92), lab, win(t, 5.8, 8.6) * LA);
      api.text(ctx, 'ranked', X(LX + 0.1), Y(-0.92), lab, win(t, 9.4, RET) * LA);
      api.text(ctx, 'ai document', X((PX0 + PX1) / 2), Y(PY0 - 0.08), lab, win(t, T_PAGE + 1, RET) * LA);
      api.text(ctx, 'autofill', X((FX0 + FX1) / 2), Y(FY[0] - 0.16), lab, win(t, T_FORM + 1, RET) * LA);
      // A faint thread from the picked posting to its document.
      const th = win(t, T_PAGE + 0.8, RET, 0.8) * alpha;
      if (th > 0.01) api.line(ctx, X(LX + BODY * GAP + 0.05), Y(rankY(0)), X(PX0 - 0.02), Y(PY0 + 0.08), acc, th * 0.35, 1);
      // The ranking pass: a faint accent bar sweeps down the list as rows settle into it.
      const rs = clamp((t - tRank(0) - 1.4) / (tRank(U - 1) - tRank(0)));
      const ra = win(t, tRank(0) + 1.1, tRank(U - 1) + 1.8, 0.35) * alpha;
      if (ra > 0.01) { const y = Y(rankY(0) - 0.06 + rs * (rankY(U - 1) - rankY(0) + 0.12)); api.line(ctx, X(LX - 0.06), y, X(LX + BODY * GAP + 0.06), y, acc, ra * 0.5, 1); }
      // Merge flashes.
      for (let d = 0; d < D; d++) {
        const f = clamp((t - tMerge(d) - 0.9) / 0.9);
        if (f > 0 && f < 1) { const o = slots[d * 3]; api.ring(ctx, X(o[0]), Y(o[1]), (0.03 + 0.06 * f) * R, acc, (1 - f) * 0.7 * alpha, 1.2); }
      }
      // Stars.
      for (let n = 0; n < actors.length; n++) {
        const s = evalA(actors[n], t, cx, cy, R, S);
        const a = s.a * alpha;
        if (a < 0.01) continue;
        const base = colAt(cols, s.c), col = s.k > 0 ? mix(base, acc, s.k) : base;
        ctx.fillStyle = api.rgba(col.map(Math.round), clamp(a));
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.8, s.r * U2), 0, TAU); ctx.fill();
      }
      // Submit: a breathing accent halo and label; never pressed.
      const ka = win(t, T_SUB + 1.2, RET, 0.8) * alpha;
      if (ka > 0.01) {
        const sx = X(SUB[0]), sy = Y(SUB[1]), br = 0.5 + 0.5 * Math.sin((t - T_SUB) * 2.0);
        api.ring(ctx, sx, sy, (SR + 0.03 + 0.012 * br) * R, acc, ka * (0.18 + 0.2 * br), 1);
        api.text(ctx, 'you submit', sx, sy, acc, ka * (dark ? 0.95 : 1));
      }
    }
  };
};
