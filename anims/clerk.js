// In-galaxy animation for 'clerk' (Calendar Clerk). See anims/README.md for the API.
// Everything is the galaxy's own stars. The core stars become an extraction ring, a star
// calendar grid forms on the right. Three emails per loop (rows of stars = text lines) arrive
// on the left and drift into the ring; their title and date stars split out, cross the ring
// and land in a day cell as a dim, hollow DRAFT. A star button below the grid is pressed
// (the only accent), and the draft fills in as an approved event. Then it calms and the
// next email arrives. At the end the month dissolves back into the spiral.
GALAXY_ANIMS['clerk'] = function (api) {
  const { TAU, clamp, rng } = api;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const BA = [0.3, 0.5, 0.75, 0.92];

  // Layout, in galaxy radii from the core.
  const RCX = -0.295, EMX = -0.78, EMX_IN = RCX - 0.04, RING_R = 0.15, RING_R2 = 0.085, ES = 1.3;
  const CALX = 0.485, CW = 0.14, CH = 0.125, COLS = 7, ROWS = 5;
  const GX0 = CALX - COLS * CW / 2, GY0 = -ROWS * CH / 2 + 0.02;
  const APX = CALX + 0.12, APY = GY0 + ROWS * CH + 0.14;     // approval star
  const NE = 3, P = 6.0, EST = 0.1, TREL = 21, LOOP = 23.5;
  const cellXY = d => [GX0 + (d % COLS + 0.5) * CW, GY0 + (Math.floor(d / COLS) + 0.5) * CH];

  // Three event days per loop: different rows and columns.
  let days = [];
  function pickDays() {
    days = [];
    const rows = [0, 1, 2, 3, 4].sort(() => rng() - 0.5).slice(0, NE);
    const cols = [0, 1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5).slice(0, NE);
    for (let e = 0; e < NE; e++) days.push(rows[e] * COLS + cols[e]);
  }
  pickDays();

  // Target list. Each item becomes one galaxy star.
  const items = [];
  const add = o => items.push(o);
  for (let i = 0; i < 90; i++) add({ t: 1, r: RING_R, th: i * TAU / 90 });
  for (let i = 0; i < 44; i++) add({ t: 1, r: RING_R2, th: i * TAU / 44, inner: 1 });
  const em = (e, kind, u, v, row, m) => add({ t: 2, e, kind, u: u * ES, v: v * ES, row, m });
  for (let e = 0; e < NE; e++) {
    const W = 0.3, H = 0.36, n = 36;                           // card outline
    for (let i = 0; i < n; i++) {
      const s = i / n * 2 * (W + H);
      let u, v;
      if (s < W) { u = -W / 2 + s; v = -H / 2; }
      else if (s < W + H) { u = W / 2; v = -H / 2 + (s - W); }
      else if (s < 2 * W + H) { u = W / 2 - (s - W - H); v = H / 2; }
      else { u = -W / 2; v = H / 2 - (s - 2 * W - H); }
      em(e, 0, u, v, -1, 0);
    }
    const row = (cnt, y, w, kind, rw) => { for (let i = 0; i < cnt; i++) em(e, kind, -0.11 + w * i / (cnt - 1), y, rw, i); };
    row(10, -0.1, 0.2, 2, 0);                                  // title -> event
    row(5, -0.045, 0.1, 2, 1);                                 // date  -> event
    row(11, 0.02, 0.22, 1, 2); row(9, 0.07, 0.19, 1, 3); row(6, 0.12, 0.12, 1, 4);
  }
  for (let r = 0; r <= ROWS; r++) for (let i = 0; i <= COLS * 3; i++) add({ t: 0, x: GX0 + i * CW / 3, y: GY0 + r * CH });
  for (let c = 0; c <= COLS; c++) for (let r = 0; r < ROWS; r++) for (let i = 1; i < 3; i++) add({ t: 0, x: GX0 + c * CW, y: GY0 + r * CH + i * CH / 3 });
  for (let c = 0; c < COLS; c++) add({ t: 0, x: GX0 + (c + 0.5) * CW, y: GY0 - 0.075, head: 1 });
  add({ t: 3 });                                               // approval star
  const NI = items.length;
  // Event star index within its email: title 10 + date 5 = 15 stars of the cluster.
  const evIdx = it => (it.row === 0 ? it.m : 10 + it.m);

  let T = 0, loopNo = 0, ready = false, n = 0, sj;             // sj: galaxy star index per item
  let home = null;
  const dlay = items.map(() => rng());

  function init(S, cx, cy, R) {
    n = S.n;
    const used = new Uint8Array(n);
    sj = new Int32Array(NI).fill(-1);
    const tp = it => {                                         // rough target, screen px
      if (it.t === 1) return [cx + RCX * R + Math.cos(it.th) * it.r * R, cy + Math.sin(it.th) * it.r * R];
      if (it.t === 2) return [cx + (EMX + it.u) * R, cy + it.v * R];
      if (it.t === 0) return [cx + it.x * R, cy + it.y * R];
      return [cx + APX * R, cy + APY * R];
    };
    const order = items.map((_, i) => i);
    // Ring, emails and approval star first so they get nearby stars; the grid takes the rest.
    const pri = it => (it.t === 1 ? 0 : it.t === 3 ? 1 : it.t === 2 ? 2 : 3);
    order.sort((a, b) => pri(items[a]) - pri(items[b]) || rng() - 0.5);
    for (const i of order) {
      const [tx, ty] = tp(items[i]);
      let best = -1, bd = 1e12;
      for (let j = 0; j < n; j++) {
        if (used[j] || S.x[j] < -1e3) continue;
        const d = (S.x[j] - tx) ** 2 + (S.y[j] - ty) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { used[best] = 1; sj[i] = best; }
    }
    ready = true;
  }

  function bez(x0, y0, x1, y1, q, bow) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const kx = mx - dy * bow, ky = my + dx * bow, u = 1 - q;
    return [u * u * x0 + 2 * u * q * kx + q * q * x1, u * u * y0 + 2 * u * q * ky + q * q * y1];
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      if (T >= LOOP) { T -= LOOP; loopNo++; pickDays(); }
      self.spiralDim = 0.92 * Math.min(smooth((T - 0.2) / 1.3), 1 - smooth((T - TREL - 0.6) / 1.6));
    },
    draw(c, cx, cy, R, A) {
      if (A < 0.01) return;
      const S = api.stars(2600);
      if (!ready) { if (S.n < 200 || A < 0.995) return; init(S, cx, cy, R); }
      if (S.n < n) return;
      const dk = api.dark(), acc = api.accent();
      const col = api.colors();
      const vis = self.spiralDim / 0.92, sz = Math.max(1, R / 330), lt = dk ? 1 : 1.3;
      const X = x => cx + x * R, Y = y => cy + y * R;
      c.save();
      c.globalCompositeOperation = dk ? 'lighter' : 'source-over';

      // Which email is active (for the extraction ring and the approval button).
      const ae = clamp(Math.floor((T - EST) / P), 0, NE - 1);
      const tea = T - EST - ae * P;
      const busy = T < EST ? 0 : Math.sin(Math.PI * clamp((tea - 1.9) / 1.5));
      const press = T < EST ? 0 : Math.sin(Math.PI * clamp((tea - 5.3) / 0.55));
      const rel = e => smooth((T - TREL - e) / 1.9);

      for (let i = 0; i < NI; i++) {
        const j = sj[i];
        if (j < 0) continue;
        const hx = S.x[j], hy = S.y[j], b = S.b[j];
        if (hx < -1e3) continue;
        const it = items[i], dl = dlay[i];
        const idle = BA[b] * 0.14;
        let x = hx, y = hy, a = idle, r = 0.8 * sz, cl = col[b];

        if (it.t === 0) {                                      // calendar lattice
          const f = smooth((T - 0.3 - (it.x + 0.2) * 0.9 - dl * 0.4) / 1.3), g = f * (1 - rel(dl * 0.5));
          x = lerp(hx, X(it.x), g); y = lerp(hy, Y(it.y), g);
          a = idle + ((it.head ? 0.7 : 0.55) - idle) * g; cl = col[it.head ? 3 : 2]; r = (it.head ? 1.3 : 1.0) * sz;
        } else if (it.t === 1) {                               // extraction ring
          const f = smooth((T - 0.2 - dl * 0.6) / 1.4), g = f * (1 - rel(dl * 0.5));
          const sp = (it.inner ? -0.5 : 0.28) * (1 + 3 * busy), th = it.th + T * sp;
          const rr = it.r * (1 + 0.14 * busy) * R;
          x = lerp(hx, cx + RCX * R + Math.cos(th) * rr, g); y = lerp(hy, cy + Math.sin(th) * rr, g);
          a = idle + ((it.inner ? 0.4 : 0.5) + 0.4 * busy - idle) * g; cl = col[busy > 0.3 ? 3 : 2]; r = (1.2 + 0.5 * busy) * sz;
        } else if (it.t === 3) {                               // approval star
          const f = smooth((T - 1.0) / 1.2), g = f * (1 - rel(0.2));
          x = lerp(hx, X(APX), g); y = lerp(hy, Y(APY), g);
          a = idle + (0.9 - idle) * g; cl = press > 0.05 ? api.mix(col[3], acc, press) : col[3];
          r = (2.2 - 0.9 * press) * sz;
          if (g > 0.05) {
            const ex = ((T - EST - ae * P) - 5.3) / 1.3;
            api.ring(c, x, y, 7 * sz * (1 - 0.15 * press), col[2], A * vis * g * 0.55, 1);
            if (T >= EST && ex > 0 && ex < 1) api.ring(c, x, y, (7 + 24 * smooth(ex)) * sz, acc, A * vis * 0.8 * (1 - ex), 1.4);
          }
        } else {                                               // email star
          const te = T - EST - it.e * P;
          if (te > -0.1 && (te < 6 || it.kind === 2)) {
            const qf = smooth((te - dl * 0.8) / 1.1);
            const d = smooth((te - 1.6) / 0.9);
            const ex = lerp(EMX, EMX_IN, d), s = lerp(1, 0.62, d);
            let px = X(ex + it.u * s), py = Y(it.v * s);
            x = lerp(hx, px, qf); y = lerp(hy, py, qf);
            const full = it.kind === 2 ? 0.85 : it.kind === 1 ? 0.6 : 0.5;
            let pres = qf;
            r = (it.kind === 2 ? 1.5 : 1.15) * sz;
            cl = col[it.kind === 2 ? 3 : 2];
            if (it.kind === 2) {
              const k = evIdx(it), cell = cellXY(days[it.e]);
              // Cluster: 11 star outline of a rounded tag plus 4 inner stars.
              let tx, ty, ring = k < 11;
              if (ring) { const an = k / 11 * TAU + 0.4; tx = cell[0] + Math.cos(an) * CW * 0.34; ty = cell[1] + Math.sin(an) * CH * 0.28; }
              else { const q2 = k - 11; tx = cell[0] + ((q2 & 1) - 0.5) * CW * 0.2; ty = cell[1] + ((q2 >> 1) - 0.5) * CH * 0.2; }
              const fl = smooth((te - 2.3 - k * 0.02) / 0.9);
              [x, y] = bez(x, y, X(tx), Y(ty), fl, 0.18);
              if (rel(dl * 0.4) > 0) { const g = rel(dl * 0.4); x = lerp(x, hx, g); y = lerp(y, hy, g); }
              const ap = smooth((te - 5.4) / 0.45) * (1 - rel(dl * 0.4));
              const draftA = ring ? 0.62 : 0.22;
              a = idle + (lerp(draftA, ring ? 0.95 : 0.9, ap) * (dk ? 1 : 1.0) - idle) * pres * (1 - rel(dl * 0.4)) + (ap < 1 && fl > 0 ? 0 : 0);
              r = lerp(1.5, ring ? 1.9 : 1.3, fl) * sz * (1 + 0.4 * ap * (ring ? 1 : 1.4));
              cl = api.mix(col[3], acc, ap);
              if (fl > 0.95 && ap < 0.5 && ring) r *= 0.85;
            } else {
              const ab = smooth((te - 2.2 - dl * 0.5) / 0.8);
              if (ab >= 1) { x = hx; y = hy; pres = 0; }
              else {
                const an = it.u * 40 + it.v * 27;
                x = lerp(x, cx + RCX * R + Math.cos(an) * RING_R * R * 0.6, ab); y = lerp(y, cy + Math.sin(an) * RING_R * R * 0.6, ab);
                pres = qf * (1 - ab);
              }
              a = idle + (full - idle) * pres;
            }
          }
        }
        a *= A * vis * lt;
        if (a < 0.01) continue;
        c.fillStyle = api.rgba(cl, clamp(a));
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }

      // Labels: a status word above the grid, and the button caption.
      c.font = '600 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const g0 = smooth((T - 1.6) / 0.8) * (1 - rel(0)), te = T - EST - ae * P;
      if (T >= EST && g0 > 0.02) {
        const dr = smooth((te - 3.6) / 0.4) * (1 - smooth((te - 5.3) / 0.2));
        const ok = smooth((te - 5.5) / 0.3) * (1 - smooth((te - 6.1) / 0.1));
        c.fillStyle = api.rgba(api.ink, clamp(A * vis * g0 * dr)); if (dr > 0.02) c.fillText('draft', X(CALX), Y(GY0 - 0.15));
        c.fillStyle = api.rgba(acc, clamp(A * vis * g0 * ok * 1.2)); if (ok > 0.02) c.fillText('approved', X(CALX), Y(GY0 - 0.15));
      }
      c.fillStyle = api.rgba(col[3], clamp(A * vis * g0 * 0.85));
      if (g0 > 0.02) c.fillText('approve', X(APX), Y(APY + 0.065));
      c.restore();
    }
  };
  return self;
};
