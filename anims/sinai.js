// In-galaxy animation for 'sinai' (Sinai Foundation, Software Developer).
// Phase 1: the galaxy's own stars swirl in and form the Sinai Foundation logo as a halftone.
// Phase 2: the logo collapses into a sun; three planets (the 3 sites) ride a shared
// component-library ring. A component update sweeps around the ring, then deploy pulses
// run from the sun to all three planets at once ("deploy 4 min"). Twice, then the stars
// return to the logo, and it loops (24.2 s after a 4.2 s intro).
GALAXY_ANIMS['sinai'] = function (api) {
  api.lightBoost({ dots: false });   // light theme: dense clusters keep their dot size
  const { TAU, clamp, mix, ease3, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const INTRO = 4.2, HOLD = 6, TO_SYS = 2.6, SYS = 13, TO_LOGO = 2.6;
  const P = HOLD + TO_SYS + SYS + TO_LOGO;
  const SUN_R = 0.15, ORBIT = 0.64, PLANET_R = 0.085;
  const WAVES = [1.4, 7.2], DEPLOYS = [3.2, 9.0], WAVE_D = 1.6, FLY = 1.1;

  let T = 0, N = 0, ready = false;
  let LX, LY, LS, LC, DL;        // logo target (units of R), dot size, colour class, stagger
  let KIND, SA, SB, SPH;         // system role (0 sun, 1-3 planet, 4 ring), params
  let pitch = 0.02;

  // A higher-resolution grid of the logo than api.grid() (60 cols is too coarse for its text).
  // Falls back to api.grid() if the image cannot be read.
  let own = null, ownFailed = false;
  const im = new Image();
  im.onload = () => { own = im; };
  im.onerror = () => { ownFailed = true; };
  im.src = 'img/sinai.jpg';

  function sample(cols) {
    const sw = own.naturalWidth, sh = own.naturalHeight;
    const rows = Math.round(cols * sh / sw);
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff'; g.fillRect(0, 0, cols, rows);
    g.drawImage(own, 0, 0, cols, rows);
    const d = g.getImageData(0, 0, cols, rows).data, cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const q = 4 * (y * cols + x), r = d[q] / 255, gg = d[q + 1] / 255, b = d[q + 2] / 255;
      const ink = 1 - (0.2126 * r + 0.7152 * gg + 0.0722 * b);
      if (ink > 0.2) cells.push([x, y, ink, r - (gg + b) / 2 > 0.22 ? 1 : 0]);
    }
    return { cols, rows, cells };
  }
  function fromApiGrid(G) {
    const cells = [];
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) {
      const i = y * G.cols + x, ink = (1 - G.lum[i]) * G.al[i];
      if (ink > 0.2) cells.push([x, y, ink, 0]);
    }
    return { cols: G.cols, rows: G.rows, cells };
  }

  function build() {
    const st = api.stars(6000), max = Math.floor(st.n * 0.97);
    let S = null;
    if (own) {
      for (let cols = 120; cols >= 48; cols -= 6) { S = sample(cols); if (S.cells.length <= max) break; }
    } else if (ownFailed && api.grid()) S = fromApiGrid(api.grid());
    if (!S || !S.cells.length) return false;
    // Tight bounding box of the ink, then fit to 1.5R on the longer side.
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    S.cells.forEach(c => { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    const span = Math.max(x1 - x0 + 1, y1 - y0 + 1);
    pitch = 1.5 / span;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const T0 = S.cells.slice(0, max).map(c => [(c[0] - mx) * pitch, (c[1] - my) * pitch, c[2], c[3]]);
    T0.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    N = T0.length;
    LX = new Float32Array(N); LY = new Float32Array(N); LS = new Float32Array(N);
    LC = new Uint8Array(N); DL = new Float32Array(N);
    KIND = new Uint8Array(N); SA = new Float32Array(N); SB = new Float32Array(N); SPH = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const t = T0[j];
      LX[j] = t[0]; LY[j] = t[1]; LS[j] = 0.2 + 0.8 * Math.sqrt(clamp((t[2] - 0.2) / 0.7)); LC[j] = t[3];
      DL[j] = 0.55 * (j / N) + 0.25 * rng();
      SPH[j] = rng() * TAU;
    }
    // System roles: innermost logo stars -> sun, middle band -> planets, outer -> ring.
    const nSun = Math.floor(N * 0.34), nPl = Math.floor(N * 0.27);
    for (let j = 0; j < nSun; j++) {
      KIND[j] = 0; SA[j] = j * 2.39996; SB[j] = SUN_R * Math.sqrt((j + 0.5) / nSun);
    }
    const ang = j => Math.atan2(LY[j], LX[j]);
    const band = []; for (let j = nSun; j < nSun + nPl; j++) band.push(j);
    band.sort((a, b) => ang(a) - ang(b));
    const per = Math.ceil(band.length / 3);
    band.forEach((j, r) => {
      const k = Math.min(2, Math.floor(r / per)), m = r - k * per;
      KIND[j] = 1 + k; SA[j] = m * 2.39996; SB[j] = PLANET_R * Math.sqrt((m + 0.5) / per);
    });
    const ring = []; for (let j = nSun + nPl; j < N; j++) ring.push(j);
    ring.sort((a, b) => ang(a) - ang(b));
    ring.forEach((j, r) => { KIND[j] = 4; SA[j] = -Math.PI + (r / ring.length) * TAU; SB[j] = 0.0065 * ((r % 3) - 1); });   // three clean lanes
    return true;
  }

  // System clock: planets and ring turn slowly; planet k sits 120 degrees apart.
  const W_ORB = 0.11, TILT = 0.92;   // slight ellipse, like a tilted orbit
  const planetAng = (k, t) => -Math.PI / 2 + k * TAU / 3 + W_ORB * t;
  const planetXY = (k, t) => { const a = planetAng(k, t); return [Math.cos(a) * ORBIT, Math.sin(a) * ORBIT * TILT]; };
  function sysXY(j, t, out) {
    const K = KIND[j];
    if (K === 0) {
      const a = SA[j] + 0.18 * t;
      out[0] = Math.cos(a) * SB[j]; out[1] = Math.sin(a) * SB[j];
    } else if (K === 4) {
      const a = SA[j] + W_ORB * t, r = ORBIT + SB[j];
      out[0] = Math.cos(a) * r; out[1] = Math.sin(a) * r * TILT;
    } else {
      const p = planetXY(K - 1, t), a = SA[j] + 0.5 * t;
      out[0] = p[0] + Math.cos(a) * SB[j]; out[1] = p[1] + Math.sin(a) * SB[j];
    }
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      if (!ready) { ready = build(); return; }
      T += dt;
      self.spiralDim = 0.9 * ease3(clamp(T / 2.2));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (!ready || alpha < 0.01) return;
      const col = api.colors(), acc = api.accent(), dark = api.dark();
      const st = api.stars(6000);
      const cyc = T < INTRO ? -1 : (T - INTRO) % P;
      const sysT = T;                                     // continuous clock for orbits
      const mode = cyc < 0 ? 0 : 1;                       // 0 intro swirl, 1 logo <-> system
      const out = [0, 0];
      const pitchPx = pitch * R;
      const textCol = dark ? col[2] : col[3];
      const leafCol = mix(col[3], acc, 0.35);
      // Planet flash (deploy arrivals), computed once per frame.
      const sysLocal = cyc - HOLD - TO_SYS;              // seconds into the system phase
      let flash = 0, waveE = -1;
      if (cyc >= 0 && sysLocal > 0 && sysLocal < SYS) {
        DEPLOYS.forEach(t0 => { const u = sysLocal - t0 - FLY; if (u > 0 && u < 1.6) flash = Math.max(flash, 1 - u / 1.6); });
        WAVES.forEach(t0 => { const u = (sysLocal - t0) / WAVE_D; if (u > 0 && u < 1.25) waveE = u; });
      }
      const waveHead = -Math.PI / 2 + W_ORB * sysT + TAU * smooth(waveE);
      const waveFade = waveE < 0 ? 0 : clamp((1.25 - waveE) / 0.3);
      for (let j = 0; j < N; j++) {
        let x, y, r, a, c;
        const lx = cx + LX[j] * R, ly = cy + LY[j] * R;
        const rLogo = Math.max(0.7, 0.62 * pitchPx * LS[j]);
        const cLogo = LC[j] ? leafCol : textCol;
        if (mode === 0) {
          const e = ease3(clamp((T - DL[j] * 2.2) / 2.0));
          let sx = st.x[j], sy = st.y[j];
          if (!(sx > -5000)) { sx = lx; sy = ly; }
          // Polar interpolation around the core: the stars swirl in rather than slide.
          const a0 = Math.atan2(sy - cy, sx - cx), r0 = Math.hypot(sx - cx, sy - cy);
          const a1 = Math.atan2(ly - cy, lx - cx), r1 = Math.hypot(ly - cy, lx - cx);
          let dA = a1 - a0; while (dA > Math.PI) dA -= TAU; while (dA < -Math.PI) dA += TAU;
          const ang = a0 + dA * e + 0.7 * Math.sin(Math.PI * e), rr = r0 + (r1 - r0) * e;
          x = cx + Math.cos(ang) * rr; y = cy + Math.sin(ang) * rr;
          if (e >= 1) { x = lx; y = ly; }
          r = 0.9 + (rLogo - 0.9) * e;
          a = (0.55 + 0.4 * e) * clamp(T / 0.6 + 0.2);
          c = e < 0.5 ? col[Math.min(3, st.b[j])] : cLogo;
        } else {
          let m;
          if (cyc < HOLD) m = 0;
          else if (cyc < HOLD + TO_SYS) m = ease3(clamp(((cyc - HOLD) - DL[j] * 1.1) / 1.4));
          else if (cyc < HOLD + TO_SYS + SYS) m = 1;
          else m = 1 - ease3(clamp(((cyc - HOLD - TO_SYS - SYS) - (0.8 - DL[j]) * 1.1) / 1.4));
          sysXY(j, sysT, out);
          const qx = cx + out[0] * R, qy = cy + out[1] * R;
          if (m <= 0) { x = lx; y = ly; }
          else if (m >= 1) { x = qx; y = qy; }
          else {
            const a0 = Math.atan2(ly - cy, lx - cx), r0 = Math.hypot(lx - cx, ly - cy);
            const a1 = Math.atan2(qy - cy, qx - cx), r1 = Math.hypot(qx - cx, qy - cy);
            let dA = a1 - a0; while (dA > Math.PI) dA -= TAU; while (dA < -Math.PI) dA += TAU;
            const ang = a0 + dA * m, rr = r0 + (r1 - r0) * m;
            x = cx + Math.cos(ang) * rr; y = cy + Math.sin(ang) * rr;
          }
          const K = KIND[j];
          let rs, as, cs;
          if (K === 0) { rs = 1.15; as = dark ? 0.6 : 0.7; cs = col[3]; }
          else if (K === 4) {
            rs = 0.95; as = dark ? 0.5 : 0.6; cs = dark ? col[2] : col[3];
            if (waveFade > 0) {
              let d = waveHead - (SA[j] + W_ORB * sysT); d = ((d % TAU) + TAU) % TAU;
              const w = waveFade * clamp(1 - d / 1.4);
              if (w > 0.02) { rs += 0.9 * w; as += (1 - as) * w; cs = mix(cs, acc, w); }
            }
          }
          else { const f = flash; rs = 1.1; as = 0.75 + 0.25 * f; cs = f > 0.05 ? mix(col[3], acc, 0.75 * f) : col[3]; }
          r = rLogo + (rs - rLogo) * m;
          a = 0.95 + (as - 0.95) * m;
          c = m < 0.5 ? cLogo : cs;
          if (m === 0) a *= 0.88 + 0.12 * Math.sin(T * 1.3 + SPH[j]);   // faint shimmer while held
        }
        api.dot(ctx, x, y, r, c, a * alpha);
      }

      // Phase 2 overlays: deploy packets, arrival rings, labels, coins. Only while the system holds.
      if (cyc < 0) return;
      const inSys = sysLocal > 0 && sysLocal < SYS;
      if (!inSys) return;
      const fadeSys = clamp(sysLocal / 0.8) * clamp((SYS - sysLocal) / 0.8);
      const A = alpha * fadeSys;
      const P2 = k => { const p = planetXY(k, sysT); return [cx + p[0] * R, cy + p[1] * R]; };
      // Sun glow core
      api.dot(ctx, cx, cy, SUN_R * R * 0.45, col[3], A * 0.12);
      // Labels: the ring and the sites, briefly at the start.
      const labA = A * (dark ? 0.7 : 0.85) * clamp(sysLocal / 1) * clamp((5.6 - sysLocal) / 1);
      api.text(ctx, 'shared components', cx, cy + ORBIT * TILT * R + 18, textCol, labA);
      for (let k = 0; k < 3; k++) {
        const p = P2(k), dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1, o = PLANET_R * R + 20;
        api.text(ctx, 'site ' + (k + 1), p[0] + dx / L * o, p[1] + dy / L * o, textCol, labA);
      }
      // Deploys: pulses from the sun to all three planets at once.
      DEPLOYS.forEach(t0 => {
        const u = sysLocal - t0;
        if (u < 0 || u > FLY + 2.4) return;
        for (let k = 0; k < 3; k++) {
          const p = P2(k), dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1;
          const sx = cx + dx / L * SUN_R * R, sy = cy + dy / L * SUN_R * R;
          const ex = p[0] - dx / L * PLANET_R * R, ey = p[1] - dy / L * PLANET_R * R;
          if (u < FLY) {
            const e = ease3(u / FLY), hx = sx + (ex - sx) * e, hy = sy + (ey - sy) * e;
            api.line(ctx, sx, sy, hx, hy, acc, A * 0.35, 1);
            for (let s = 0; s < 5; s++) {
              const ee = Math.max(0, e - s * 0.03);
              api.dot(ctx, sx + (ex - sx) * ee, sy + (ey - sy) * ee, 3.4 - s * 0.5, acc, A * (1 - s * 0.18));
            }
          } else {
            const q = (u - FLY) / 1.3;
            if (q < 1) {
              api.line(ctx, sx, sy, ex, ey, acc, A * 0.35 * (1 - q), 1);
              api.ring(ctx, p[0], p[1], PLANET_R * R + 4 + 26 * q, acc, A * 0.7 * (1 - q), 1.3);
            }
          }
        }
        const q = u - FLY, la = clamp(q / 0.3) * clamp((2.4 - q) / 0.5);
        if (q > 0) api.text(ctx, 'deploy  4 min', cx, cy + SUN_R * R + 20, acc, A * 0.95 * la);
      });
    }
  };
  return self;
};
