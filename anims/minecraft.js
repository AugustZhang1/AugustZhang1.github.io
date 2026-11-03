// In-galaxy animation for 'minecraft' (AI Builder). See anims/README.md for the API.
// The galaxy's own stars leave the spiral and snap onto a voxel grid: first a faint floor
// lattice, then a small build placed block by block, bottom layer up. Each block is drawn
// as the stars on its outer faces (a 2x2 patch per face), shaded by face direction, with
// faces turned away from the viewer fading out, so the build reads as solid voxels.
// The finished build turns, an accent wave climbs it, then the stars return to the spiral.
// Three designs take turns, one per loop.
GALAXY_ANIMS['minecraft'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { clamp, ease3, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };

  // ---- designs: integer voxels [x, y, z], y up ----
  function tower() {
    const v = [];
    for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) v.push([x, 0, z]);          // plinth
    for (let y = 1; y <= 6; y++) for (let x = 1; x < 6; x++) for (let z = 1; z < 6; z++) {
      if (z === 5 && x === 3 && y <= 2) continue;                                         // door
      if (y === 4 && x === 3 && z === 1) continue;                                        // windows
      if (y === 4 && z === 3 && (x === 1 || x === 5)) continue;
      v.push([x, y, z]);
    }
    for (let x = 1; x < 6; x++) for (let z = 1; z < 6; z++) {                              // battlements
      const edge = x === 1 || x === 5 || z === 1 || z === 5;
      if (edge && (x + z) % 2 === 0) v.push([x, 7, z]);
    }
    return { name: 'castle tower', v };
  }
  function tree() {
    const v = [];
    for (let y = 0; y < 5; y++) v.push([0, y, 0]);                                        // trunk
    for (let y = 3; y <= 7; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      if (x === 0 && z === 0 && y < 5) continue;
      const d = Math.hypot(x, (y - 5) * 1.25, z);
      if (d > 3.05) continue;
      if (d > 2.3 && ((x * 7 + y * 3 + z * 5) & 3) === 0) continue;                       // ragged edge
      v.push([x, y, z]);
    }
    return { name: 'oak tree', v };
  }
  function house() {
    const v = [];
    for (let x = 0; x < 7; x++) for (let z = 0; z < 5; z++) for (let y = 0; y < 3; y++) {
      if (z === 4 && x === 3 && y <= 1) continue;                                         // door
      if (y === 1 && (x === 1 || x === 5) && (z === 0 || z === 4)) continue;               // windows
      v.push([x, y, z]);
    }
    for (let y = 3; y <= 5; y++) {                                                         // pitched roof
      const h = y - 3;
      for (let x = -1; x <= 7; x++) for (let z = h - 1; z <= 5 - h; z++) v.push([x, y, z]);
    }
    v.push([5, 6, 2], [5, 7, 2]);                                                          // chimney
    return { name: 'cottage', v };
  }
  const DESIGNS = [house(), tree(), tower()];

  // Six face directions; bottom faces are never seen from above, so they are skipped.
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];
  const L = [-0.55, 0.75, -0.35];                                                          // light, upper left
  const LN = Math.hypot(L[0], L[1], L[2]);

  function prepare(d) {
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const has = new Set(d.v.map(p => key(p[0], p[1], p[2])));
    let mx = 0, mz = 0;
    d.v.forEach(p => { mx += p[0]; mz += p[2]; });
    mx /= d.v.length; mz /= d.v.length;
    let top = 0, ext = 0;
    const blocks = d.v.map(p => {
      const b = { x: p[0] - mx, y: p[1], z: p[2] - mz, faces: [] };
      DIRS.forEach((n, fi) => { if (!has.has(key(p[0] + n[0], p[1] + n[1], p[2] + n[2]))) b.faces.push(fi); });
      top = Math.max(top, b.y); ext = Math.max(ext, Math.hypot(b.x, b.z));
      return b;
    }).filter(b => b.faces.length);                                                        // hidden blocks need no stars
    // Bottom layer up, sweeping round each layer like a print head.
    blocks.forEach(b => { b.o = b.y * 100 + (Math.atan2(b.z, b.x) + Math.PI) * 3; });
    blocks.sort((a, b) => a.o - b.o);
    d.blocks = blocks; d.top = top; d.ext = ext;
  }
  DESIGNS.forEach(prepare);

  // ---- timeline (seconds) ----
  const T_GRID = 1.8, T_BUILD = 9, FLY = 1.1, T_HOLD = 5.4, T_OUT = 2.6, T_REST = 1.2;
  const T_DONE = T_GRID + T_BUILD + FLY;                                                  // last block lands
  const T_BACK = T_GRID + T_BUILD + T_HOLD;                                               // dissolve starts
  const LOOP = T_BACK + T_OUT + T_REST;                                                   // 20.0 s
  const MAXS = 2600, FS = 0.31;                                                          // 3x3 stars per face, FS apart

  let t = 0, di = 0, yaw = 0.35, P = null;
  function plan() {
    const d = DESIGNS[di], nb = d.blocks.length;
    const pts = [];
    d.blocks.forEach((b, i) => {
      const at = T_GRID + (i / nb) * T_BUILD;
      b.faces.forEach(fi => {
        const n = DIRS[fi];
        // two in-face axes
        const u = n[0] ? [0, 1, 0] : [1, 0, 0], w = n[2] ? [0, 1, 0] : [0, 0, 1];
        const lit = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / LN);
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
          pts.push({
            x: b.x + n[0] * 0.5 + (u[0] * a + w[0] * c) * FS,
            y: b.y + n[1] * 0.5 + (u[1] * a + w[1] * c) * FS,
            z: b.z + n[2] * 0.5 + (u[2] * a + w[2] * c) * FS,
            n, lit, h: b.y, at: at + rng() * 0.15, curv: (rng() - 0.5) * 0.5
          });
        }
      });
    });
    // floor lattice: the voxel grid under the build (cell corners)
    const g = Math.ceil(d.ext) + 2, floor = [];
    for (let x = -g; x <= g; x++) for (let z = -g; z <= g; z++) {
      const r = Math.hypot(x, z) / (g + 0.3);
      if (r > 1) continue;
      floor.push({ x: x + 0.5, z: z + 0.5, fade: 1 - r * r, at: 0.3 + r * 0.9 + rng() * 0.2 });
    }
    const need = pts.length + floor.length;
    const idx = [];
    for (let i = 0; i < need; i++) idx.push(i);
    for (let i = need - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
    P = { d, nb, pts, floor, need, idx };
  }
  plan();

  const q = [0, 0, 0];
  const self = {
    spiralDim: 0,
    update(dt) {
      t += dt;
      if (t >= LOOP) { t -= LOOP; di = (di + 1) % DESIGNS.length; plan(); }
      // slow drift while building, kept clear of the flat side-on view; then a calm quarter turn
      yaw = 0.35 + 0.035 * t + (Math.PI / 2) * smooth((t - T_DONE - 0.5) / 3.6);
      // spiral fades as the stars are drawn out, returns during the dissolve
      self.spiralDim = 0.9 * smooth(t / 1.4) * (1 - smooth((t - T_BACK) / T_OUT));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01 || !P) return;
      const S = api.stars(MAXS), pool = S.n;
      if (pool < 1) return;
      const cols = api.colors(), acc = api.accent(), dark = api.dark();
      const d = P.d;
      // block size so the build (and floor) fits the galaxy at any turn
      const s = Math.min(R * 1.25 / (d.top + 3), R * 1.5 / (2 * d.ext + 4));
      const el = 0.55, ce = Math.cos(el), se = Math.sin(el);
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      const oy = cy + (d.top + 1) * s * ce * 0.5;                                          // centre the build vertically
      const proj = (x, y, z) => {
        const rx = x * cyaw - z * syaw, dz = x * syaw + z * cyaw;
        q[0] = cx + rx * s; q[1] = oy - (y + 0.5) * s * ce - dz * s * se; q[2] = dz;
      };
      const back = smooth((t - T_BACK) / T_OUT);                                          // 0 built .. 1 back in the spiral
      const vis = alpha * (1 - smooth((t - T_BACK - T_OUT * 0.7) / (T_OUT * 0.3)));
      const wait = self.spiralDim / 0.9;                                                   // how far the spiral has dimmed
      const step = Math.max(1, Math.floor(pool / P.need));
      const star = i => (P.idx[i] * step) % pool;
      const sq = clamp(s * 0.1, 1.3, 2.2) * (dark ? 1 : 1.3);                                               // star size on the build

      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

      // floor lattice
      const fl = P.floor, base = P.pts.length;
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i], j = star(base + i);
        const gx = S.x[j], gy = S.y[j];
        if (gx < -1e3) continue;
        const k = ease3((t - f.at) / 1.0) * (1 - back);
        proj(f.x, -0.5, f.z);
        const x = gx + (q[0] - gx) * k, y = gy + (q[1] - gy) * k;
        const a = vis * ((1 - k) * 0.4 * wait + k * (0.12 + 0.3 * f.fade));
        api.dot(ctx, x, y, dark ? 0.9 : 1.1, cols[1], a);
      }

      // block stars
      const tc = t - T_DONE, wave = tc > 0 && tc < 2.6 && back === 0;
      const pts = P.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], j = star(i);
        const gx = S.x[j], gy = S.y[j];
        if (gx < -1e3) continue;
        const u = clamp((t - p.at) / FLY), k = ease3(u) * (1 - back);
        if (u <= 0) {                                                                      // still in the spiral, waiting
          api.dot(ctx, gx, gy, 0.9, cols[S.b[j]], vis * 0.4 * wait);
          continue;
        }
        proj(p.x, p.y, p.z);
        // gentle arc in flight
        const cv = p.curv * (1 - Math.abs(2 * k - 1)) * 0.5;
        const x = gx + (q[0] - gx) * k - (q[1] - gy) * cv, y = gy + (q[1] - gy) * k + (q[0] - gx) * cv;
        // face shading: faces turned away fade out, lit faces brighter
        const n = p.n, ndz = n[0] * syaw + n[2] * cyaw;
        const facing = smooth((n[1] * se - ndz * ce + 0.05) / 0.35);
        const shade = n[1] > 0 ? 1 : 0.35 + 0.8 * p.lit;
        let col = k > 0.5 ? (n[1] > 0 ? cols[3] : p.lit > 0.3 ? cols[2] : cols[1]) : cols[S.b[j]];
        let a = (1 - k) * 0.6 + k * facing * (0.2 + 0.8 * shade);
        // completion: a soft accent wave climbs the finished build
        if (wave) {
          const wv = Math.exp(-Math.pow((p.h / (d.top + 1) - (tc / 2.0 - 0.15)) * 5, 2));
          col = mixC(col, acc, wv * 0.9);
          a = Math.min(1, a + wv * 0.25 * facing);
        }
        a *= vis * (dark ? 1 : 0.95);
        if (a < 0.01) continue;
        const r = u < 1 ? sq * 1.1 : sq;
        ctx.fillStyle = api.rgba(col, clamp(a));
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      ctx.restore();

      // command + block counter, small mono, below the build
      const la = vis * smooth(t / 1.2) * (1 - back);
      if (la > 0.01) {
        let placed = 0;
        for (let i = 0; i < P.nb; i++) if (t >= T_GRID + (i / P.nb) * T_BUILD + FLY) placed++;
        const ty = oy + (d.ext + 1.5) * s * se + 26;
        const done = t >= T_DONE && t < T_DONE + 2.4;
        api.text(ctx, '!design ' + d.name, cx, ty, cols[2], la * 0.7);
        api.text(ctx, placed + ' / ' + P.nb + ' blocks', cx, ty + 15, done ? acc : cols[3], la * 0.8);
      }
    }
  };
  function mixC(c1, c2, k) { return [c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k]; }
  return self;
};
