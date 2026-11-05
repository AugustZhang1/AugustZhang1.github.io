// In-galaxy animation for 'senseway' (SenseWay, Software Developer).
// Phase 1: the galaxy's own stars swirl in and form the SenseWay logo (walker with a cane).
// Phase 2: the logo opens into a starlit crosswalk. A walker crosses it while a LiDAR sweep
// lights up the stripes and GPS satellites fix its position; packets stream to a small
// star dashboard (GPS track, LiDAR trace) that flags "crosswalk detected". Then the stars
// fold back into the logo, and it loops.
GALAXY_ANIMS['senseway'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { TAU, clamp, mix, ease3, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const INTRO = 4.2, HOLD = 4.6, TO_S = 2.6, SCENE = 13.4, TO_L = 2.6;
  const P = HOLD + TO_S + SCENE + TO_L;            // 23.2 s loop after the intro

  // Scene layout, in units of the galaxy radius around the core (y down).
  const CURB_L = -0.95, CURB_R = 0.15, ROAD_Y0 = -0.66, ROAD_Y1 = 0.7;
  const BAR_X0 = -0.86, BAR_STEP = 0.14, BAR_W = 0.08, NBAR = 7, BAR_Y0 = -0.24, BAR_Y1 = 0.34;
  const WALK_Y = 0.12, WX0 = -1.1, WX1 = 0.25, WALK_T0 = 1.0, WALK_T1 = 11.6, WH = 0.28;
  const DB_X0 = 0.44, DB_X1 = 1.06, DB_Y0 = -0.36, DB_Y1 = 0.36;
  const SATS = [[-0.92, -0.86], [-0.4, -0.95], [0.12, -0.86]];
  const LIDAR_R = 0.34, LIDAR_W = 2.4;
  const P_ON = (BAR_X0 - WX0) / (WX1 - WX0), P_OFF = (BAR_X0 + (NBAR - 1) * BAR_STEP + BAR_W - WX0) / (WX1 - WX0);
  const S_DET = WALK_T0 + P_ON * (WALK_T1 - WALK_T0);
  const FIXES = [2.2, 5.0, 7.8, 10.6];
  const NPK = 28, NSP = 48, NTR = 26;

  let T = 0, N = 0, ready = false, pitch = 0.02;
  let LX, LY, LS, DL, SPH, ROLE, SX, SY, SI;      // logo target, size, stagger; scene role/target/index
  const SPV = new Float32Array(NSP), TRW = new Float32Array(NTR);
  for (let i = 0; i < NSP; i++) SPV[i] = 0.5 + 0.28 * Math.sin(i * 0.37) + 0.12 * Math.sin(i * 1.13 + 1) + 0.08 * (rng() - 0.5);
  for (let i = 0; i < NTR; i++) TRW[i] = 0.012 * (rng() - 0.5);

  // The logo, sampled from the image at a higher resolution than api.grid() so the word reads.
  // The image is a knockout (white with the walker, ring and band cut out), so it is read per region.
  let own = null, ownFailed = false;
  const im = new Image();
  im.onload = () => { own = im; };
  im.onerror = () => { ownFailed = true; };
  im.src = 'img/senseway.png';

  function sample(cols) {
    const c = document.createElement('canvas');
    c.width = cols; c.height = cols;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(own, 0, 0, cols, cols);
    const d = g.getImageData(0, 0, cols, cols).data, cells = [];
    for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) {
      const u = (x + 0.5) / cols - 0.5, v = (y + 0.5) / cols - 0.5, r = Math.hypot(u, v);
      const al = d[4 * (y * cols + x) + 3] / 255;
      let ink;
      if (r > 0.495) continue;
      else if (r > 0.458) ink = 1;                   // the outer ring, as an even outline
      else if (v < 0.125) ink = r > 0.405 ? 0 : 1 - al; // walker and cane are cut out of the disc
      else ink = al;                                 // the ground edge and the word
      if (ink > 0.3) cells.push([x, y, ink]);
    }
    return { cols, cells };
  }
  function fromApiGrid(G) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) if (G.al[y * G.cols + x] > 0.5) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, rr = 0.49 * Math.max(1, x1 - x0 + 1), cells = [];
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) {
      const ink = G.al[y * G.cols + x];
      if (ink > 0.3 && Math.hypot(x - mx, y - my) < rr) cells.push([x, y, ink]);
    }
    return { cols: G.cols, cells };
  }

  // Static scene targets (role, x, y, index within role). Moving roles are filled per frame.
  // Roles: 0 stripe, 1 curb, 2 lane, 3 walker, 4 satellite, 5 frame, 6 track, 7 spark, 8 packet, 9 free.
  function sceneList(n) {
    const L = [];
    const push = (r, x, y, i) => L.push([r, x, y, i]);
    for (let i = 0; i < NWK; i++) push(3, WX0, WALK_Y, i);
    SATS.forEach((s, k) => {
      push(4, s[0], s[1], k * 5); push(4, s[0] - 0.026, s[1], k * 5 + 1); push(4, s[0] - 0.046, s[1], k * 5 + 2);
      push(4, s[0] + 0.026, s[1], k * 5 + 3); push(4, s[0] + 0.046, s[1], k * 5 + 4);
    });
    const fp = 0.021, fw = DB_X1 - DB_X0, fh = DB_Y1 - DB_Y0;
    const nfx = Math.round(fw / fp), nfy = Math.round(fh / fp);
    for (let i = 0; i <= nfx; i++) { push(5, DB_X0 + fw * i / nfx, DB_Y0, 0); push(5, DB_X0 + fw * i / nfx, DB_Y1, 0); }
    for (let i = 1; i < nfy; i++) { push(5, DB_X1, DB_Y0 + fh * i / nfy, 0); push(5, DB_X0, DB_Y0 + fh * i / nfy, 0); }
    for (let i = 0; i < NTR; i++) push(6, 0, 0, i);
    for (let i = 0; i < NSP; i++) push(7, 0, 0, i);
    for (let i = 0; i < NPK; i++) push(8, 0, 0, i);
    for (let y = ROAD_Y0; y <= ROAD_Y1 + 1e-6; y += 0.026) { push(1, CURB_L, y, 0); push(1, CURB_R, y, 0); }
    const lane = (a, b) => { for (let y = a; y < b - 0.06; y += 0.12) for (let q = 0; q < 4; q++) push(2, (CURB_L + CURB_R) / 2, y + q * 0.02, 0); };
    lane(ROAD_Y0, BAR_Y0 - 0.06); lane(BAR_Y1 + 0.1, ROAD_Y1 + 0.06);
    // Stripes take what is left, up to a pleasant density; any remainder rejoins the dim spiral.
    const left = n - L.length;
    if (left > 0) {
      const area = NBAR * BAR_W * (BAR_Y1 - BAR_Y0);
      let p = Math.max(0.0135, Math.sqrt(area / left));
      const nx = Math.max(2, Math.round(BAR_W / p)), ny = Math.max(2, Math.round((BAR_Y1 - BAR_Y0) / p));
      for (let b = 0; b < NBAR; b++) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        if (L.length >= n) break;
        push(0, BAR_X0 + b * BAR_STEP + BAR_W * (i + 0.5) / nx, BAR_Y0 + (BAR_Y1 - BAR_Y0) * (j + 0.5) / ny, b);
      }
    }
    L.length = Math.min(L.length, n);
    while (L.length < n) push(9, 0, 0, 0);
    return L;
  }

  function build() {
    const st = api.stars(4000), max = Math.floor(st.n * 0.97);
    let S = null;
    if (own) {
      for (let cols = 124; cols >= 48; cols -= 4) { S = sample(cols); if (S.cells.length <= max) break; }
    } else if (ownFailed && api.grid()) S = fromApiGrid(api.grid());
    if (!S || !S.cells.length) return false;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    S.cells.forEach(c => { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    pitch = 1.55 / Math.max(x1 - x0 + 1, y1 - y0 + 1);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const T0 = S.cells.slice(0, max).map(c => [(c[0] - mx) * pitch, (c[1] - my) * pitch, c[2]]);
    T0.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    N = T0.length;
    LX = new Float32Array(N); LY = new Float32Array(N); LS = new Float32Array(N);
    DL = new Float32Array(N); SPH = new Float32Array(N);
    ROLE = new Uint8Array(N); SX = new Float32Array(N); SY = new Float32Array(N); SI = new Int16Array(N);
    for (let j = 0; j < N; j++) {
      LX[j] = T0[j][0]; LY[j] = T0[j][1]; LS[j] = 0.3 + 0.7 * clamp((T0[j][2] - 0.3) / 0.6);
      DL[j] = 0.55 * (j / N) + 0.25 * rng(); SPH[j] = rng() * TAU;
    }
    // Pair logo stars with scene targets spatially: free stars at random, the rest by x bins then y.
    const L = sceneList(N);
    const tg = [], fr = [];
    L.forEach(t => (t[0] === 9 ? fr : tg).push(t));
    const ids = Array.from({ length: N }, (_, j) => j);
    for (let j = N - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); const t = ids[j]; ids[j] = ids[k]; ids[k] = t; }
    const free = ids.slice(0, fr.length), used = ids.slice(fr.length);
    free.forEach(j => { ROLE[j] = 9; });
    const px = t => (t[0] >= 6 && t[0] <= 8 ? 0.75 : t[0] === 3 ? WX0 : t[1]);
    const py = t => (t[0] >= 6 && t[0] <= 8 ? 0 : t[2]);
    const tgS = tg.map(t => [px(t), py(t), t]).sort((a, b) => a[0] - b[0]);
    used.sort((a, b) => LX[a] - LX[b]);
    const B = Math.max(1, Math.round(Math.sqrt(used.length)));
    for (let b = 0; b < B; b++) {
      const lo = Math.floor(b * used.length / B), hi = Math.floor((b + 1) * used.length / B);
      const A = used.slice(lo, hi).sort((p, q) => LY[p] - LY[q]);
      const C = tgS.slice(lo, hi).sort((p, q) => p[1] - q[1]);
      A.forEach((j, k) => { const t = C[k][2]; ROLE[j] = t[0]; SX[j] = t[1]; SY[j] = t[2]; SI[j] = t[3]; });
    }
    return true;
  }

  // Walker pictogram (NWK points), feet at (0,0), height 1, facing right, cane forward.
  const NWK = 44, WK = new Float32Array(2 * NWK);
  function walkerPose(ph) {
    let k = 0;
    const put = (x, y) => { WK[k++] = x; WK[k++] = y; };
    put(0.06, -0.89); put(0.06, -0.89);
    for (let i = 0; i < 8; i++) put(0.06 + Math.cos(i * TAU / 8) * 0.075, -0.89 + Math.sin(i * TAU / 8) * 0.075);
    for (let i = 0; i < 7; i++) { const t = i / 6; put(0.03 - 0.07 * t, -0.77 + 0.41 * t); }
    const sw = Math.sin(ph) * 0.42;
    [sw, -sw].forEach(a => { for (let i = 1; i <= 6; i++) { const t = i / 6; put(-0.04 + Math.sin(a) * 0.38 * t, -0.36 + Math.cos(a) * 0.38 * t); } });
    for (let i = 1; i <= 4; i++) { const t = i / 4; put(0.02 + 0.2 * t, -0.7 + 0.28 * t); }
    for (let i = 1; i <= 4; i++) { const t = i / 4; put(0.0 - (0.08 + 0.08 * sw) * t, -0.7 + 0.28 * t); }
    const tip = 0.5 + 0.05 * Math.sin(ph * 2);
    for (let i = 1; i <= 7; i++) { const t = i / 7; put(0.22 + (tip - 0.22) * t, -0.42 + 0.42 * t); }
  }

  // Scene state at scene time s (seconds): walker position and dashboard progress.
  const walkP = s => smooth((s - WALK_T0) / (WALK_T1 - WALK_T0)) * 0.12 + clamp((s - WALK_T0) / (WALK_T1 - WALK_T0)) * 0.88;
  const spRev = i => 1.6 + (i / (NSP - 1)) * 9.6;
  const pkT = k => 1.3 + k * 0.36;                     // packet k leaves the walker
  const PK_FLY = 1.1;
  const trX = i => DB_X0 + 0.07 + (DB_X1 - DB_X0 - 0.12) * i / (NTR - 1);
  const spX = i => DB_X0 + 0.07 + (DB_X1 - DB_X0 - 0.12) * i / (NSP - 1);
  const TR_Y = -0.19, SP_Y0 = 0.16, SP_H = 0.17;

  const self = {
    spiralDim: 0,
    pending: () => !ready,
    update(dt) {
      if (!ready) { ready = build(); return; }
      T += dt;
      self.spiralDim = 0.9 * ease3(clamp(T / 2.2));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (!ready || alpha < 0.01 || !(R > 0)) return;
      const col = api.colors(), acc = api.accent(), dark = api.dark();
      const st = api.stars(4000);
      const cyc = T < INTRO ? -1 : (T - INTRO) % P;
      const logoCol = dark ? col[2] : col[3];
      const pitchPx = pitch * R;

      // Scene time and the logo <-> scene mix phase.
      let s = 0, phase = 0;                           // phase: 0 logo, 1 to scene, 2 scene, 3 to logo
      if (cyc >= 0) {
        if (cyc < HOLD) phase = 0;
        else if (cyc < HOLD + TO_S) phase = 1;
        else if (cyc < HOLD + TO_S + SCENE) { phase = 2; s = cyc - HOLD - TO_S; }
        else { phase = 3; s = SCENE; }
      }
      const p = walkP(s), wx = WX0 + (WX1 - WX0) * p;
      const walking = s > WALK_T0 && s < WALK_T1;
      walkerPose(walking ? (wx - WX0) * 34 : 0);
      const det = smooth((s - S_DET) / 0.5);            // crosswalk detected (stays on)
      const onX = p >= P_ON && p <= P_OFF;
      const ovA = alpha * (phase === 2 ? smooth(s / 0.9) * smooth((SCENE - s) / 0.9) : 0);
      // LiDAR sweep: origin at the cane hand, angle turns steadily.
      const lx = cx + (wx + 0.22 * WH) * R, ly = cy + (WALK_Y - 0.42 * WH) * R;
      const lOn = smooth((s - 0.8) / 0.6) * smooth((WALK_T1 + 0.6 - s) / 0.6);
      const bAng = s * LIDAR_W;
      // GPS fix strength at this moment, 0..1.
      let fix = 0, fixU = -1;
      FIXES.forEach(f => { const u = s - f; if (u > 0 && u < 1.6) { fix = Math.max(fix, clamp(u / 0.45) * clamp((1.6 - u) / 0.6)); fixU = u; } });

      // Overlays under the stars: LiDAR beam, GPS lines, rings.
      if (ovA > 0.01) {
        const A = ovA * lOn;
        if (A > 0.01) {
          for (let k = 0; k < 7; k++) {
            const a = bAng - k * 0.07;
            api.line(ctx, lx, ly, lx + Math.cos(a) * LIDAR_R * R, ly + Math.sin(a) * LIDAR_R * R, col[3], A * (dark ? 0.32 : 0.4) * (1 - k / 7), 1);
          }
          api.arc(ctx, lx, ly, LIDAR_R * R, bAng - 0.9, bAng, col[2], A * 0.22, 1);
        }
        if (fix > 0.01) {
          SATS.forEach(sv => {
            const sx = cx + sv[0] * R, sy = cy + sv[1] * R;
            const hx = cx + (wx + 0.06 * WH) * R, hy = cy + (WALK_Y - 0.88 * WH) * R;
            const e = clamp(fixU / 0.45);
            ctx.setLineDash([2, 4]);
            api.line(ctx, sx, sy, sx + (hx - sx) * e, sy + (hy - sy) * e, col[2], ovA * 0.45 * fix, 1);
            ctx.setLineDash([]);
          });
          if (fixU > 0.45) {
            const q = clamp((fixU - 0.45) / 0.9);
            api.ring(ctx, cx + wx * R, cy + (WALK_Y - 0.5 * WH) * R, (0.1 + 0.08 * q) * R, col[2], ovA * 0.5 * (1 - q), 1);
          }
        }
        // Crosswalk detected: one accent pulse at the walker.
        const du = s - S_DET;
        if (du > 0 && du < 1.4) {
          const q = du / 1.4;
          api.ring(ctx, cx + wx * R, cy + (WALK_Y - 0.5 * WH) * R, (0.08 + 0.22 * q) * R, acc, ovA * 0.8 * (1 - q), 1.2);
        }
      }

      // Stars.
      for (let j = 0; j < N; j++) {
        const lgx = cx + LX[j] * R, lgy = cy + LY[j] * R;
        const rLogo = Math.max(0.7, 0.6 * pitchPx * LS[j]);
        let sx = st.x[j], sy = st.y[j];
        if (!(sx > -5000)) { sx = lgx; sy = lgy; }
        let x, y, r, a, c;
        if (cyc < 0) {
          // Intro: swirl in from the spiral onto the logo.
          const e = ease3(clamp((T - DL[j] * 2.2) / 2.0));
          const a0 = Math.atan2(sy - cy, sx - cx), r0 = Math.hypot(sx - cx, sy - cy);
          const a1 = Math.atan2(lgy - cy, lgx - cx), r1 = Math.hypot(lgy - cy, lgx - cx);
          let dA = a1 - a0; while (dA > Math.PI) dA -= TAU; while (dA < -Math.PI) dA += TAU;
          const ang = a0 + dA * e + 0.7 * Math.sin(Math.PI * e), rr = r0 + (r1 - r0) * e;
          x = e >= 1 ? lgx : cx + Math.cos(ang) * rr; y = e >= 1 ? lgy : cy + Math.sin(ang) * rr;
          r = 0.9 + (rLogo - 0.9) * e;
          a = (0.55 + 0.4 * e) * clamp(T / 0.6 + 0.2);
          c = e < 0.5 ? col[Math.min(3, st.b[j])] : logoCol;
          api.dot(ctx, x, y, r, c, a * alpha);
          continue;
        }
        let m;
        if (phase === 0) m = 0;
        else if (phase === 1) m = smooth(((cyc - HOLD) - DL[j] * 1.1) / 1.4);
        else if (phase === 2) m = 1;
        else m = 1 - smooth(((cyc - HOLD - TO_S - SCENE) - (0.8 - DL[j]) * 1.1) / 1.4);

        // Scene target, radius, alpha and colour by role.
        let qx, qy, rs = 1.2, as = 0.8, cs = col[2];
        const R0 = ROLE[j], idx = SI[j];
        if (R0 === 0) {
          qx = SX[j]; qy = SY[j]; rs = 1.1; as = dark ? 0.5 : 0.45; cs = col[1];
          if (ovA > 0.01) {
            const dx = qx - (wx + 0.22 * WH), dy = qy - (WALK_Y - 0.42 * WH), d = Math.hypot(dx, dy);
            if (d < LIDAR_R && lOn > 0) {
              let dA = bAng - Math.atan2(dy, dx); dA = ((dA % TAU) + TAU) % TAU;
              const h = Math.exp(-dA * 2.2) * (1 - d / LIDAR_R) * lOn * (ovA / alpha);
              as += 0.5 * h; rs += 0.9 * h; cs = mix(cs, col[2], clamp(h * 1.8));
            }
          }
        } else if (R0 === 1) { qx = SX[j]; qy = SY[j]; rs = 0.95; as = 0.5; cs = col[1]; }
        else if (R0 === 2) { qx = SX[j]; qy = SY[j]; rs = 0.9; as = 0.42; cs = col[1]; }
        else if (R0 === 3) {
          qx = wx + WK[2 * idx] * WH; qy = WALK_Y + WK[2 * idx + 1] * WH; rs = 1.75; as = 1; cs = col[3];
        } else if (R0 === 4) {
          qx = SX[j]; qy = SY[j]; rs = idx % 5 === 0 ? 1.8 : 1.1; as = 0.6 + 0.4 * fix; cs = idx % 5 === 0 ? col[3] : col[2];
        } else if (R0 === 5) { qx = SX[j]; qy = SY[j]; rs = 0.9; as = 0.45; cs = col[1]; }
        else if (R0 === 6) {
          // GPS track: a point lights once the walker has covered that much of the crossing.
          const f = idx / (NTR - 1), on = smooth((p - f) / 0.04 + 1);
          qx = trX(idx); qy = TR_Y + TRW[idx] * on;
          const inX = f >= P_ON && f <= P_OFF ? det : 0;
          rs = 0.9 + 0.4 * on; as = 0.22 + 0.7 * on; cs = inX > 0.01 ? mix(col[2], acc, inX) : col[2];
        } else if (R0 === 7) {
          // LiDAR trace: points rise from the baseline as their readings arrive.
          const on = smooth((s - spRev(idx)) / 0.45);
          qx = spX(idx); qy = SP_Y0 - SP_H * SPV[idx] * on;
          rs = 0.9 + 0.35 * on; as = 0.2 + 0.7 * on; cs = col[3];
        } else if (R0 === 8) {
          // Packets: wait in the device, fly to the dashboard, then join its left edge.
          const t0 = pkT(idx), u = (s - t0) / PK_FLY;
          const hx = wx + 0.22 * WH, hy = WALK_Y - 0.42 * WH;
          const ex = DB_X0, ey = DB_Y0 + 0.02 + (DB_Y1 - DB_Y0 - 0.04) * idx / (NPK - 1);
          if (u <= 0) { qx = hx; qy = hy; as = 0.25; rs = 1.0; cs = col[3]; }
          else if (u >= 1) { qx = ex; qy = ey; as = 0.45 * (1 - smooth(u - 1)); rs = 0.9; cs = col[1]; }
          else {
            const e = ease3(u), mx = (hx + ex) / 2, my = Math.min(hy, ey) - 0.32;
            qx = (1 - e) * (1 - e) * hx + 2 * (1 - e) * e * mx + e * e * ex;
            qy = (1 - e) * (1 - e) * hy + 2 * (1 - e) * e * my + e * e * ey;
            as = 0.95; rs = 1.6; cs = col[3];
          }
        } else {
          // Free: rejoins the dim spiral at its own live position.
          x = sx + (lgx - sx) * (1 - m); y = sy + (lgy - sy) * (1 - m);
          r = rLogo + (1.0 - rLogo) * m;
          a = 0.95 + (0.13 - 0.95) * m;
          c = m < 0.5 ? logoCol : col[Math.min(3, st.b[j])];
          if (m === 0) a *= 0.88 + 0.12 * Math.sin(T * 1.3 + SPH[j]);
          api.dot(ctx, x, y, r, c, a * alpha);
          continue;
        }
        if (!dark && R0 !== 3) rs += 0.25;                // light: slightly larger dots so the dashboard reads
        const tx = cx + qx * R, ty = cy + qy * R;
        if (m <= 0) { x = lgx; y = lgy; }
        else if (m >= 1) { x = tx; y = ty; }
        else {
          // Slight arc on the way, so the stars drift rather than slide.
          const bend = 0.12 * Math.sin(Math.PI * m) * (j % 2 ? 1 : -1);
          const dx = tx - lgx, dy = ty - lgy;
          x = lgx + dx * m - dy * bend; y = lgy + dy * m + dx * bend;
        }
        r = rLogo + (rs - rLogo) * m;
        a = 0.95 + (as - 0.95) * m;
        c = m < 0.5 ? logoCol : cs;
        if (m === 0) a *= 0.88 + 0.12 * Math.sin(T * 1.3 + SPH[j]);
        api.dot(ctx, x, y, r, c, a * alpha);
      }

      // Minimal labels, only while the scene holds.
      if (ovA > 0.01) {
        const tc = dark ? col[3] : mix(col[3], api.ink, 0.6);
        ctx.save();
        ctx.font = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = api.rgba(tc, clamp(ovA * (dark ? 0.82 : 0.9)));
        ctx.fillText('GPS', cx + SATS[1][0] * R, cy + (SATS[1][1] + 0.07) * R);
        const lOnA = clamp(ovA * (dark ? 0.75 : 0.85) * lOn * clamp((5 - s) / 1));
        if (lOnA > 0.01) {
          ctx.fillStyle = api.rgba(tc, lOnA);
          ctx.fillText('LiDAR', lx, ly - (LIDAR_R + 0.06) * R);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = api.rgba(tc, clamp(ovA * (dark ? 0.88 : 0.92)));
        ctx.fillText('dashboard', cx + (DB_X0 + 0.05) * R, cy + (DB_Y0 + 0.05) * R);
        ctx.fillText('GPS track', cx + (DB_X0 + 0.05) * R, cy + (TR_Y - 0.06) * R);
        ctx.fillText('LiDAR m', cx + (DB_X0 + 0.05) * R, cy + (SP_Y0 - SP_H - 0.07) * R);

        const sy = cy + (DB_Y1 - 0.08) * R;
        if (det > 0.01) {
          const pulse = onX ? 0.75 + 0.25 * Math.sin(T * 5) : 0.6;
          api.dot(ctx, cx + (DB_X0 + 0.07) * R, sy, 2.6, acc, ovA * det * pulse);
          ctx.fillStyle = api.rgba(acc, clamp(ovA * det * 0.95));
          ctx.fillText('crosswalk detected', cx + (DB_X0 + 0.11) * R, sy);
        } else {
          api.dot(ctx, cx + (DB_X0 + 0.07) * R, sy, 2.2, tc, ovA * (dark ? 0.5 : 0.65));
          ctx.fillStyle = api.rgba(tc, clamp(ovA * (dark ? 0.72 : 0.82)));
          ctx.fillText('scanning', cx + (DB_X0 + 0.11) * R, sy);
        }
        ctx.restore();
      }
    }
  };
  return self;
};
