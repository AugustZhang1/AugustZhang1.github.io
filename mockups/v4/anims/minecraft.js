// In-galaxy animation for 'minecraft' (AI Builder). See anims/README.md for the API.
// The galaxy's own stars leave the spiral, snap onto a voxel grid and assemble a small
// build block by block, bottom layer up (each block a 2x2x2 cluster of stars). The build
// turns slowly, holds, then dissolves back into the spiral. Three designs rotate.
GALAXY_ANIMS['minecraft'] = function (api) {
  const { TAU, clamp, ease3, rng } = api;

  // ---- designs: lists of [x, y, z] voxels (y up), centred later ----
  function tower() {
    const v = [];
    for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) v.push([x, 0, z]);       // plinth
    for (let y = 1; y <= 7; y++)
      for (let x = 1; x < 6; x++) for (let z = 1; z < 6; z++) {
        const edge = x === 1 || x === 5 || z === 1 || z === 5;
        if (!edge) continue;
        if (z === 5 && x === 3 && y <= 2) continue;                                    // door
        if ((y === 4 || y === 5) && x === 3 && (z === 1 || z === 5)) continue;          // windows
        if ((y === 4 || y === 5) && z === 3 && (x === 1 || x === 5)) continue;
        v.push([x, y, z]);
      }
    for (let x = 1; x < 6; x++) for (let z = 1; z < 6; z++) {                           // battlements
      const edge = x === 1 || x === 5 || z === 1 || z === 5;
      if (edge && (x + z) % 2 === 0) v.push([x, 8, z]);
    }
    return { name: 'castle tower', v };
  }
  function tree() {
    const v = [];
    for (let y = 0; y < 6; y++) v.push([0, y, 0]);
    for (let y = 3; y <= 8; y++)
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
        if (x === 0 && z === 0 && y < 6) continue;
        const d = Math.hypot(x, (y - 5.6) * 1.15, z);
        if (d > 3.1) continue;
        if (d > 2.2 && ((x * 7 + y * 3 + z * 5) & 3) === 0) continue;                  // ragged edge
        v.push([x, y, z]);
      }
    return { name: 'oak tree', v };
  }
  function statue() {
    const v = [], box = (x0, x1, y0, y1, z0, z1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) v.push([x, y, z]);
    };
    box(0, 4, 0, 0, -1, 2);      // pedestal
    box(1, 1, 1, 4, 0, 1);       // left leg
    box(3, 3, 1, 4, 0, 1);       // right leg
    box(1, 3, 5, 8, 0, 1);       // torso
    box(0, 0, 5, 8, 0, 1);       // arms
    box(4, 4, 5, 8, 0, 1);
    box(1, 3, 9, 11, -0.5, 1.5); // head (3x3x3, centred on the torso)
    return { name: 'voxel statue', v: v.map(p => [p[0], p[1], Math.round(p[2] * 2) / 2]) };
  }
  const DESIGNS = [tower(), tree(), statue()];

  // ---- star budget: up to 8 stars per block (corners of a small cube) ----
  const MAXS = 1600;
  const sub = [];
  for (let i = 0; i < 8; i++) sub.push([(i & 1) ? 0.17 : -0.17, (i & 2) ? 0.17 : -0.17, (i & 4) ? 0.17 : -0.17]);

  // Ordered so blocks go bottom layer up, sweeping around each layer like a print head.
  function prepare(d) {
    let mx = 0, mz = 0;
    d.v.forEach(p => { mx += p[0]; mz += p[2]; });
    mx /= d.v.length; mz /= d.v.length;
    const blocks = d.v.map(p => ({ x: p[0] - mx, y: p[1], z: p[2] - mz }));
    blocks.forEach(b => { b.o = b.y * 100 + (Math.atan2(b.z, b.x) + Math.PI) * 3 + Math.hypot(b.x, b.z) * 0.01; });
    blocks.sort((a, b) => a.o - b.o);
    let top = 0, ext = 0;
    blocks.forEach(b => { top = Math.max(top, b.y); ext = Math.max(ext, Math.abs(b.x), Math.abs(b.z)); });
    d.blocks = blocks; d.top = top; d.ext = ext;
  }
  DESIGNS.forEach(prepare);

  // ---- timeline (seconds) ----
  const T_GRID = 1.6, T_BUILD = 9, T_HOLD = 5, T_OUT = 2.6, T_REST = 1.2, FLY = 1.1;
  const LOOP = T_GRID + T_BUILD + T_HOLD + T_OUT + T_REST;

  let t = 0, di = 0, yaw = 0.6;
  let P = null;            // per-design plan
  function plan() {
    const d = DESIGNS[di];
    const nb = d.blocks.length;
    const per = Math.max(1, Math.min(8, Math.floor((MAXS - 140) / nb)));
    const pts = [];        // { bx, by, bz, block, k }
    d.blocks.forEach((b, i) => {
      for (let k = 0; k < per; k++) {
        const s = per === 8 ? sub[k] : sub[[0, 7, 3, 4, 1, 6, 2, 5][k]];
        pts.push({ x: b.x + s[0], y: b.y + s[1], z: b.z + s[2], blk: i, at: T_GRID + (i / nb) * T_BUILD + rng() * 0.12 });
      }
    });
    // floor lattice (the voxel grid) under the build
    const g = Math.ceil(d.ext) + 2, floor = [];
    for (let x = -g; x <= g; x++) for (let z = -g; z <= g; z++) {
      const r = Math.hypot(x, z) / (g + 0.5);
      if (r > 1) continue;
      floor.push({ x, y: -0.5, z, fade: 1 - r * r, at: rng() * T_GRID * 0.7 });
    }
    // random galaxy stars for each target, without repeats
    const need = pts.length + floor.length;
    const idx = [];
    for (let i = 0; i < need; i++) idx.push(i);
    for (let i = need - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
    // spread the picks over the whole available pool rather than only the innermost stars
    P = { d, nb, per, pts, floor, need, idx, curv: pts.map(() => (rng() - 0.5) * 0.6) };
  }
  plan();

  const self = {
    spiralDim: 0,
    update(dt) {
      t += dt;
      yaw += dt * (t > T_GRID + T_BUILD ? 0.28 : 0.16);
      if (t >= LOOP) { t -= LOOP; di = (di + 1) % DESIGNS.length; plan(); }
      // spiral fades as the stars are drawn out, returns during the dissolve
      const tin = clamp(t / 1.4), tout = clamp((t - (T_GRID + T_BUILD + T_HOLD)) / T_OUT);
      self.spiralDim = 0.9 * ease3(tin) * (1 - ease3(tout));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01 || !P) return;
      const S = api.stars(MAXS), cols = api.colors(), acc = api.accent();
      const d = P.d;
      const pool = S.n;
      // block size so the build (plus floor) fits within ~0.95 R tall and wide
      const s = Math.min(R * 1.2 / (d.top + 2.5), R * 0.95 / (Math.ceil(d.ext) + 2.5));
      const el = 0.5, ce = Math.cos(el), se = Math.sin(el);
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      const oy = cy + (d.top + 1) * s * ce * 0.5;        // vertical centring of the build
      const proj = (x, y, z, out) => {
        const rx = x * cyaw - z * syaw, dz = x * syaw + z * cyaw;
        out[0] = cx + rx * s; out[1] = oy - y * s * ce - dz * s * se; out[2] = dz;
      };
      const tb = T_GRID + T_BUILD + T_HOLD;
      const back = ease3(clamp((t - tb) / T_OUT));       // 0 built .. 1 returned to the spiral
      const vis = alpha * (1 - clamp((t - tb - T_OUT * 0.75) / (T_OUT * 0.25)));
      const q = [0, 0, 0];
      const step = Math.max(1, Math.floor(pool / P.need));
      const star = i => (P.idx[i] * step) % pool;
      const r0 = Math.max(0.9, Math.min(1.7, s * 0.075));

      // floor lattice
      const fl = P.floor, base = P.pts.length;
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i], j = star(base + i);
        const gx = S.x[j], gy = S.y[j];
        if (gx < -1e3) continue;
        const k = ease3(clamp((t - f.at) / 1.0)) * (1 - back);
        proj(f.x, f.y, f.z, q);
        const x = gx + (q[0] - gx) * k, y = gy + (q[1] - gy) * k;
        api.dot(ctx, x, y, r0 * 0.8, cols[1], vis * mixA(0.45 * self.spiralDim / 0.9, 0.3 * f.fade + 0.08, k));
      }

      // block stars
      let placed = 0;
      const pts = P.pts, per = P.per;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], j = star(i);
        const gx = S.x[j], gy = S.y[j];
        if (gx < -1e3) continue;
        const u = clamp((t - p.at) / FLY), k = ease3(u) * (1 - back);
        if (u >= 1 && i % per === 0) placed++;
        proj(p.x, p.y, p.z, q);
        // gentle arc in flight
        const nx = -(q[1] - gy) * P.curv[i], ny = (q[0] - gx) * P.curv[i];
        const w = 1 - Math.abs(2 * k - 1);
        let x = gx + (q[0] - gx) * k + nx * w * 0.5, y = gy + (q[1] - gy) * k + ny * w * 0.5;
        // shading: top of the build lighter, near faces brighter
        const h = p.y / (d.top + 1), near = clamp(0.5 - q[2] / (2 * (d.ext + 1)));
        let col = cols[k > 0.5 ? (h > 0.6 ? 3 : 2) : S.b[j]];
        let a;
        if (u <= 0) a = 0.4 * self.spiralDim / 0.9;                   // still in the spiral, waiting
        else a = mixA(0.6, 0.45 + 0.5 * near, k);
        // completion moment: a soft accent wave climbs the finished build
        const tc = t - (T_GRID + T_BUILD + FLY);
        if (tc > 0 && tc < 2.2 && back === 0) {
          const wv = Math.exp(-Math.pow((h - tc / 1.6) * 6, 2));
          col = mixC(col, acc, wv * 0.85);
          a = Math.min(1, a + wv * 0.3);
        }
        api.dot(ctx, x, y, r0 * (u > 0 && u < 1 ? 1.15 : 1), col, vis * a);
      }

      // counter + label, small mono, below the build
      const la = vis * clamp(t / 1.2) * (1 - back);
      if (la > 0.01) {
        const ty = oy + (Math.ceil(d.ext) + 2) * s * se + 22;
        const done = t > T_GRID + T_BUILD + FLY && t < T_GRID + T_BUILD + FLY + 1.6;
        const n = Math.min(P.nb, placed);
        api.text(ctx, '/build ' + d.name, cx, ty, cols[2], la * 0.7);
        api.text(ctx, String(n).padStart(4, '0') + ' / ' + P.nb + ' blocks', cx, ty + 15, done ? acc : cols[3], la * 0.85);
      }
    }
  };
  function mixA(a, b, k) { return a + (b - a) * k; }
  function mixC(c1, c2, k) { return [c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k]; }
  return self;
};
