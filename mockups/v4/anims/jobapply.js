// In-galaxy animation for 'jobapply'. See anims/README.md for the API.
// The galaxy's own stars become job postings: they gather at four board sources, scatter
// across the field, duplicates merge, a ranking pass lines them up by score, the top three
// get a document page and autofilled form fields, and it all stops at an unpressed
// "you submit" ring. Then every star flies home and the spiral returns.
GALAXY_ANIMS['jobapply'] = function (api) {
  const { rng, clamp, mix, TAU } = api;
  const L = 25;                                   // loop length, seconds
  const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const N = api.stars(1500).n;
  const perm = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  let next = 0;
  const actors = [];
  // Keyframes: p = null means "at home" (the star's live galaxy position); c = colour level 0..3; k = accent mix.
  const actor = () => { const A = { j: perm[next++ % N], kf: [] }; actors.push(A); return A; };
  const key = (A, t, p, a, r, c, k = 0) => A.kf.push({ t, p, a, r, c, k });
  const RET = 22.4, END = 23.8;                   // return flight, then fade back to the native spiral
  const homeA = 0.55;
  const begin = (A, tLeave) => { key(A, 0, null, 0, 1.1, 1.5); key(A, Math.min(1.4, tLeave), null, homeA, 1.1, 1.5); if (tLeave > 1.4) key(A, tLeave, null, homeA, 1.1, 1.5); };
  const finish = (A, last) => {
    const t0 = RET + rng() * 0.5;
    key(A, t0, last.p, last.a, last.r, last.c, last.k);
    key(A, t0 + 1.2, null, homeA, 1.1, 1.5);
    key(A, END, null, homeA, 1.1, 1.5);
    key(A, L, null, 0, 1.1, 1.5);
  };
  const lastOf = A => A.kf[A.kf.length - 1];

  // ---- Board sources at the edges.
  const SRC = [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]];
  const SRC_NAME = ['job bank', 'indeed', 'linkedin', 'workday'];
  const srcCount = [0, 0, 0, 0];
  const jit = s => [(rng() - 0.5) * s, (rng() - 0.5) * s];

  // ---- Postings: U unique, D duplicates that merge into a partner.
  const U = 28, D = 8, TOP = 3;
  const score = Array.from({ length: U }, () => rng());
  const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]);
  const rank = []; order.forEach((u, r) => (rank[u] = r));
  const field = Array.from({ length: U }, () => [(rng() * 2 - 1) * 0.78, (rng() * 2 - 1) * 0.7]);
  const colY = r => -0.76 + r * (1.52 / (U - 1));
  const COLX = -0.84;
  const SHORT = [-0.52, 0, 0.52];                 // y of the three shortlisted rows
  const SHX = -0.62;

  const arrive = (A, src, tLeave, tRelease, f, a, r, c) => {
    begin(A, tLeave);
    const s = SRC[src], j = jit(0.07), sp = [s[0] + j[0], s[1] + j[1]];
    key(A, tLeave + 1.3, sp, 0.85, 1.3, 2);
    key(A, tRelease, sp, 0.85, 1.3, 2);
    key(A, tRelease + 1.6, f, a, r, c);
  };
  const release = src => 3.6 + 0.09 * srcCount[src]++;

  const mergeT = [];
  for (let d = 0; d < D; d++) mergeT.push(7.0 + d * 0.22);

  for (let u = 0; u < U; u++) {
    const A = actor(), src = u % 4, rk = rank[u], q = 1 - rk / (U - 1);
    const cS = 0.8 + 2.0 * q, aS = 0.45 + 0.5 * q, rS = 1.15 + 0.5 * q;
    arrive(A, src, 1.2 + rng() * 1.2, release(src), field[u], 0.9, 1.8, 2.4);
    if (u < D) { // a duplicate lands on this one and snaps in
      const tm = mergeT[u];
      key(A, tm + 0.65, field[u], 0.9, 1.8, 2.4);
      key(A, tm + 0.8, field[u], 1, 3, 3);
      key(A, tm + 1.4, field[u], 0.9, 1.8, 2.4);
    }
    const tR = 9.4 + rk * 0.05, slot = [COLX, colY(rk)];
    key(A, tR, field[u], 0.9, 1.8, 2.4);
    key(A, tR + 1.4, slot, aS, rS, cS);
    if (rk < TOP) {
      key(A, 11.6, slot, aS, rS, cS);
      key(A, 12.2, slot, 1, 2.4, 3);
      const t0 = 12.6 + rk * 0.25, sh = [SHX, SHORT[rk]];
      key(A, t0, slot, 1, 2.4, 3);
      key(A, t0 + 1.1, sh, 1, 2.4, 3);
    } else {
      key(A, 12.8, slot, aS, rS, cS);
      key(A, 13.6, slot, aS * 0.55, rS, cS);
    }
    finish(A, lastOf(A));
  }
  for (let d = 0; d < D; d++) {
    const A = actor(), src = (d + 1 + (d % 3)) % 4, tm = mergeT[d];
    const ang = rng() * TAU, f = [field[d][0] + Math.cos(ang) * 0.09, field[d][1] + Math.sin(ang) * 0.09];
    arrive(A, src, 1.2 + rng() * 1.2, release(src), f, 0.9, 1.8, 2.4);
    key(A, tm, f, 0.9, 1.8, 2.4);
    key(A, tm + 0.65, field[d], 0.9, 1.8, 2.4);
    key(A, tm + 0.8, field[d], 0, 1.4, 2);
    // Once merged it stays hidden on its partner until the return flight.
    key(A, RET, field[d], 0, 1.1, 1.5);
    key(A, RET + 1.2, null, homeA, 1.1, 1.5);
    key(A, END, null, homeA, 1.1, 1.5);
    key(A, L, null, 0, 1.1, 1.5);
  }

  // ---- For each of the top three: a document page and three autofilled form fields.
  const PX = -0.5, PW = 0.36, PH = 0.3, LS = 0.05, DS = 0.021;
  const FX = 0.0, FW = 0.34, FS = 0.026;
  const pageAt = [], formAt = [];
  for (let k = 0; k < TOP; k++) {
    const Y = SHORT[k], tP = 13.4 + k * 1.3;
    pageAt.push([PX + 0.08 + PW / 2, Y - PH / 2 - 0.04]);
    // Outline.
    const x0 = PX + 0.08, x1 = x0 + PW, y0 = Y - PH / 2, y1 = Y + PH / 2;
    const per = [];
    for (let x = x0; x <= x1 + 1e-6; x += 0.04) per.push([x, y0], [x, y1]);
    for (let y = y0 + 0.04; y < y1 - 1e-6; y += 0.04) per.push([x0, y], [x1, y]);
    per.forEach(p => { const A = actor(); begin(A, tP + rng() * 0.4); key(A, lastOf(A).t + 1.4, p, 0.32, 0.9, 1); finish(A, lastOf(A)); });
    // Text lines.
    const lens = [0.5, 1, 0.92, 1, 0.7, 0.4];
    lens.forEach((len, li) => {
      const y = y0 + 0.045 + li * LS, n = Math.floor(((PW - 0.07) * len) / DS);
      for (let d = 0; d <= n; d++) {
        const A = actor();
        begin(A, tP + 0.2 + li * 0.14 + d * 0.012);
        key(A, lastOf(A).t + 1.4, [x0 + 0.035 + d * DS, y], li === 0 ? 0.95 : 0.7, li === 0 ? 1.3 : 1.05, li === 0 ? 3 : 2);
        finish(A, lastOf(A));
      }
    });
    // Form fields: a dim underline slot, then stars fill it left to right.
    formAt.push([FX + 0.1 + FW / 2, Y - PH / 2 - 0.04]);
    for (let row = 0; row < 3; row++) {
      const y = Y - 0.09 + row * 0.09, fx = FX + 0.1;
      const ns = Math.floor(FW / FS);
      for (let d = 0; d <= ns; d++) {
        const A = actor();
        begin(A, tP + 0.5 + row * 0.1 + d * 0.01);
        key(A, lastOf(A).t + 1.3, [fx + d * FS, y + 0.026], 0.3, 0.85, 1);
        finish(A, lastOf(A));
      }
      const nf = 5 + Math.floor(rng() * (ns - 5));
      for (let d = 0; d <= nf; d++) {
        const A = actor(), tArr = 16.2 + k * 1.2 + row * 0.4 + d * 0.035;
        begin(A, tArr - 1.3);
        key(A, tArr, [fx + d * FS, y], 0.9, 1.2, 2.6);
        finish(A, lastOf(A));
      }
    }
  }

  // ---- The final, unpressed submit ring beside the top application.
  const SUB = [FX + 0.1 + FW + 0.14, SHORT[0]], SR = 0.045, NR = 18;
  for (let i = 0; i < NR; i++) {
    const A = actor(), th = (i / NR) * TAU - Math.PI / 2;
    begin(A, 18.6 + i * 0.03);
    key(A, lastOf(A).t + 1.4, [SUB[0] + Math.cos(th) * SR, SUB[1] + Math.sin(th) * SR], 0.95, 1.2, 3, 1);
    finish(A, lastOf(A));
  }

  // ---- Evaluation.
  let T = 0;
  const cur = () => (typeof window.__jobapplyT === 'number' ? window.__jobapplyT : T) % L; // debug scrub hook
  const dimAt = t => 0.9 * sm(t / 1.4) * (1 - sm((t - END) / (L - END)));
  const st = { x: 0, y: 0, a: 0, r: 0, c: 0, k: 0 };
  function evalA(A, t, cx, cy, R, S) {
    const kf = A.kf;
    let i = 0;
    while (i < kf.length - 1 && kf[i + 1].t <= t) i++;
    const f0 = kf[i], f1 = kf[Math.min(i + 1, kf.length - 1)];
    const e = f1 === f0 || f1.t <= f0.t ? 0 : sm((t - f0.t) / (f1.t - f0.t));
    const hx = S.x[A.j], hy = S.y[A.j];
    const x0 = f0.p ? cx + f0.p[0] * R : hx, y0 = f0.p ? cy + f0.p[1] * R : hy;
    const x1 = f1.p ? cx + f1.p[0] * R : hx, y1 = f1.p ? cy + f1.p[1] * R : hy;
    if ((!f0.p || !f1.p) && hx < -9e3) { st.a = 0; return st; }
    // Slight bow on long flights so stars arc rather than slide.
    const dx = x1 - x0, dy = y1 - y0, bow = Math.sin(Math.PI * e) * 0.12;
    st.x = x0 + dx * e - dy * bow; st.y = y0 + dy * e + dx * bow;
    st.a = f0.a + (f1.a - f0.a) * e; st.r = f0.r + (f1.r - f0.r) * e;
    st.c = f0.c + (f1.c - f0.c) * e; st.k = f0.k + (f1.k - f0.k) * e;
    return st;
  }
  const colAt = (cols, c) => { const i = Math.min(2, Math.floor(c)); return mix(cols[i], cols[i + 1], clamp(c - i)); };
  const win = (t, a, b, f = 0.6) => sm((t - a) / f) * (1 - sm((t - b) / f));

  return {
    spiralDim: 0,
    update(dt) { T += dt; this.spiralDim = dimAt(cur()); },
    draw(ctx, cx, cy, R, alpha) {
      const t = cur(), S = api.stars(1500), cols = api.colors(), acc = api.accent();
      const lab = mix(cols[2], cols[3], 0.3);
      // Source labels.
      const sa = win(t, 1.6, 6.4) * alpha * 0.6;
      SRC.forEach((s, i) => api.text(ctx, SRC_NAME[i], cx + s[0] * R, cy + (s[1] + (s[1] < 0 ? -0.07 : 0.07)) * R, lab, sa));
      api.text(ctx, 'dedupe', cx, cy - 0.84 * R, lab, win(t, 6.8, 9.2) * alpha * 0.5);
      api.text(ctx, 'ranked', cx + COLX * R, cy - 0.85 * R, lab, win(t, 10.2, RET) * alpha * 0.55);
      const la = win(t, 14.2, RET) * alpha * 0.5;
      api.text(ctx, 'ai doc', cx + pageAt[0][0] * R, cy + pageAt[0][1] * R, lab, la);
      api.text(ctx, 'autofill', cx + formAt[0][0] * R, cy + formAt[0][1] * R, lab, win(t, 16, RET) * alpha * 0.5);
      // Stars.
      for (let n = 0; n < actors.length; n++) {
        const s = evalA(actors[n], t, cx, cy, R, S);
        const a = s.a * alpha;
        if (a < 0.01) continue;
        const col = s.k > 0 ? mix(colAt(cols, s.c), acc, s.k) : colAt(cols, s.c);
        ctx.fillStyle = api.rgba(col.map(Math.round), a);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
      // Submit: a thin accent ring that breathes but is never pressed.
      const ka = win(t, 19.8, RET, 0.8) * alpha;
      if (ka > 0.01) {
        const sx = cx + SUB[0] * R, sy = cy + SUB[1] * R, br = 0.5 + 0.5 * Math.sin(t * 2.2);
        api.ring(ctx, sx, sy, (SR + 0.025 + 0.008 * br) * R, acc, ka * (0.25 + 0.2 * br), 1);
        api.text(ctx, 'you submit', sx, sy + (SR + 0.075) * R, acc, ka * 0.85);
      }
    }
  };
};
