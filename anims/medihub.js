// In-galaxy animation for 'medihub'. See anims/README.md for the API.
// The inner stars leave the spiral and build a station: a hub, spokes and six
// docking bays. Two bays are specialist bays, marked with a small cross. Outer
// stars gather into patient ships that book a bay (its bracket lights), fly in
// and dock. A regular ship tries a specialist bay and is turned away; a
// specialist ship (a cross) docks where it matches; one ship cancels, backs
// out and rebooks into another bay. Then the ships leave and the stars return.
GALAXY_ANIMS['medihub'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { rng, clamp, TAU } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };

  // ---- Geometry, in galaxy-radius units around the core (y down). ----
  const NB = 6, BR = 0.5, RB = 0.068;          // bays, bay ring radius, bay bracket radius
  const SPEC = [true, false, false, true, false, false];
  const bang = i => -Math.PI / 2 + i * TAU / NB;
  const rad = i => [Math.cos(bang(i)), Math.sin(bang(i))];
  const at = (i, r, t = 0) => { const [ux, uy] = rad(i); return [ux * r - uy * t, uy * r + ux * t]; };

  // Station target points: { x, y, role, bay }.
  // roles: 0 core, 1 hub ring, 2 spoke, 3 bay bracket, 4 specialist cross
  const P = [];
  for (let k = 0; k < 46; k++) { const a = rng() * TAU, r = 0.045 * Math.sqrt(rng()); P.push({ x: r * Math.cos(a), y: r * Math.sin(a), role: 0, bay: -1 }); }
  for (let k = 0; k < 120; k++) { const a = k / 120 * TAU; P.push({ x: 0.14 * Math.cos(a), y: 0.14 * Math.sin(a), role: 1, bay: -1 }); }
  for (let i = 0; i < NB; i++) {
    const r1 = SPEC[i] ? 0.355 : BR - RB - 0.012, m = 14;
    for (let k = 0; k < m; k++) { const p = at(i, 0.16 + (r1 - 0.16) * k / (m - 1)); P.push({ x: p[0], y: p[1], role: 2, bay: i }); }
    // U-shaped bracket opening outward: back semicircle plus two short sides.
    for (let k = 0; k < 22; k++) {
      const a = Math.PI / 2 + k / 21 * Math.PI, p = at(i, BR + RB * Math.cos(a), RB * Math.sin(a));
      P.push({ x: p[0], y: p[1], role: 3, bay: i });
    }
    for (let s = -1; s <= 1; s += 2) for (let k = 1; k <= 5; k++) {
      const p = at(i, BR + RB * 0.95 * k / 5, s * RB); P.push({ x: p[0], y: p[1], role: 3, bay: i });
    }
    if (SPEC[i]) {
      const c = BR - RB - 0.05, h = 0.026;
      for (let k = -3; k <= 3; k++) {
        let p = at(i, c + h * k / 3, 0); P.push({ x: p[0], y: p[1], role: 4, bay: i });
        if (k) { p = at(i, c, h * k / 3); P.push({ x: p[0], y: p[1], role: 4, bay: i }); }
      }
    }
  }
  const NS = P.length;
  const dl = P.map((p, j) => (Math.hypot(p.x, p.y) / 0.6) * 0.7 + rng() * 0.3); // core first

  // Ship shapes (unit size, nose along +x).
  const CHEV = [[1, 0]];
  for (let k = 1; k <= 6; k++) { const f = k / 6; CHEV.push([1 - 1.75 * f, 0.62 * f], [1 - 1.75 * f, -0.62 * f]); }
  CHEV.push([-0.35, 0], [0.05, 0]);
  const CROSS = [[0, 0]];
  for (let k = 1; k <= 3; k++) { const f = 0.8 * k / 3; CROSS.push([f, 0], [-f, 0], [0, f], [0, -f]); }
  const SS = 0.038; // ship size

  // ---- Ships: legs are cubic Beziers [t0, t1, p0, c0, c1, p1, rev]. ----
  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
  const spawn = a => [1.0 * Math.cos(a), 1.0 * Math.sin(a)];
  const dock = i => at(i, BR + 0.006);
  const inward = (p, turn) => { const r = Math.hypot(p[0], p[1]) || 1, a = Math.atan2(-p[1], -p[0]) + turn; return [Math.cos(a) * 0.32 * r, Math.sin(a) * 0.32 * r]; };
  const approach = (from, i, t0, t1, turn) => [t0, t1, from, add(from, inward(from, turn)), at(i, BR + 0.24), dock(i), false];
  const leave = (i, t0, t1, turn) => {
    const a = bang(i) + turn;
    return [t0, t1, dock(i), at(i, BR + 0.22), [0.82 * Math.cos(a), 0.82 * Math.sin(a)], [1.15 * Math.cos(a), 1.15 * Math.sin(a)], false];
  };
  const ships = [];
  const ship = (spec, a0, tg, legs, tx) => {
    const s = { spec, home: spawn(a0), tg, legs, tx, shape: spec ? CROSS : CHEV, idx: [] };
    ships.push(s); return s;
  };
  // 1: regular, books bay 1 and docks.
  ship(false, bang(1) - 1.0, 4.0, [approach(spawn(bang(1) - 1.0), 1, 4.9, 7.1, -0.5), leave(1, 18.6, 20.6, 0.35)], 19.5);
  // 2: specialist, docks at specialist bay 0.
  ship(true, bang(0) - 1.1, 5.2, [approach(spawn(bang(0) - 1.1), 0, 6.1, 8.3, -0.5), leave(0, 18.9, 20.9, -0.35)], 19.8);
  // 3: regular, tries specialist bay 3, is turned away, takes bay 2.
  const h3 = at(3, BR + 0.17);
  ship(false, bang(3) + 1.0, 7.0, [
    [7.9, 9.8, spawn(bang(3) + 1.0), add(spawn(bang(3) + 1.0), inward(spawn(bang(3) + 1.0), 0.5)), at(3, BR + 0.4), h3, false],
    [10.4, 12.6, h3, at(3, BR + 0.36), at(2, BR + 0.26), dock(2), false],
    leave(2, 19.2, 21.2, 0.35)], 20.1);
  // 4: regular, books bay 4, cancels, backs out, rebooks bay 5.
  const w4 = at(4, BR + 0.2, 0.11);
  ship(false, bang(4) + 0.9, 8.4, [
    approach(spawn(bang(4) + 0.9), 4, 9.3, 11.5, 0.5),
    [12.9, 14.3, dock(4), at(4, BR + 0.12), at(4, BR + 0.2, 0.04), w4, true],
    [15.0, 17.0, w4, at(4, BR + 0.22, 0.2), at(5, BR + 0.24), dock(5), false],
    leave(5, 19.4, 21.4, -0.35)], 20.3);

  // Bay brackets light while booked: [on, off] per bay.
  const BOOK = [[[5.2, 18.9]], [[4.0, 18.6]], [[10.4, 19.2]], [], [[8.4, 12.9]], [[14.7, 19.4]]];
  const booked = (i, T) => { let v = 0; for (const [a, b] of BOOK[i]) v = Math.max(v, smooth((T - a) / 0.5) * (1 - smooth((T - b) / 0.6))); return v; };
  // Key moments: accent ring on a bay plus a short label.
  const EV = [
    { t: 4.0, bay: 1, s: 'booked' },
    { t: 8.3, bay: 0, s: 'specialist' },
    { t: 9.8, bay: 3, s: 'specialist only' },
    { t: 12.9, bay: 4, s: 'cancelled' },
    { t: 14.7, bay: 5, s: 'rebooked' }
  ];

  // Ship stars come from the outer part of the star list.
  const N = 1500, SHIP0 = 900;
  let nxt = SHIP0;
  for (const s of ships) for (let k = 0; k < s.shape.length; k++) s.idx.push(nxt++);

  const bez = (L, u) => {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * L[2][0] + b * L[3][0] + c * L[4][0] + d * L[5][0], a * L[2][1] + b * L[3][1] + c * L[4][1] + d * L[5][1]];
  };
  // Ship pose at time T: [x, y, heading].
  const pose = (s, T) => {
    let L = s.legs[0], u = 0;
    for (const l of s.legs) { if (T >= l[0]) { L = l; u = smooth((T - l[0]) / (l[1] - l[0])); } }
    const p = bez(L, u);
    // Heading from the leg's direction (ends tangent along c1 -> p1).
    const q0 = bez(L, Math.max(0, Math.min(u, 0.995) - 0.004)), q1 = bez(L, Math.min(1, Math.max(u, 0.005) + 0.004));
    let h = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
    if (L[6]) h += Math.PI;
    if (!isFinite(h)) h = 0;
    return [p[0], p[1], h];
  };

  const LIFT = 1.0, LIFTD = 2.0, DIS = 19.9, LOOP = 24;
  let T = 0;

  const self = {
    spiralDim: 0,
    update(dt) {
      if (!(dt > 0)) return;
      T = (T + dt) % LOOP;
      const up = smooth((T - LIFT) / 0.9), down = 1 - smooth((T - 21.9) / 1.5);
      self.spiralDim = 0.9 * Math.min(up, down);
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const vis = self.spiralDim / 0.9;
      if (vis < 0.005) return;
      const st = api.stars(N), n = st.n;
      const col = api.colors(), acc = api.accent(), dark = api.dark();
      const X = x => cx + x * R, Y = y => cy + y * R;
      const tone = dark ? 1 : 0.92;

      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const plot = (j, tx, ty, k, rgb, a, r) => {
        let x, y;
        const sx = j < n ? st.x[j] : -1e4, sy = j < n ? st.y[j] : -1e4;
        if (sx < -1e3) { x = tx; y = ty; a *= k; } else { x = sx + (tx - sx) * k; y = sy + (ty - sy) * k; }
        a *= alpha * tone;
        if (a < 0.01 || !isFinite(x) || !isFinite(y)) return;
        ctx.fillStyle = api.rgba(rgb, Math.min(1, a));
        if (!dark) r *= 1.25;                               // light: larger squares so the icons read
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      };

      // Station.
      const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const bk = []; for (let i = 0; i < NB; i++) bk.push(booked(i, T));
      for (let j = 0; j < NS; j++) {
        const p = P[j], d = dl[j];
        const k = smooth((T - LIFT - d * 1.6) / LIFTD) * (1 - smooth((T - DIS - (1 - d) * 1.2) / 1.8));
        let rgb, a, r;
        switch (p.role) {
          case 0: rgb = col[3]; a = 0.75; r = 1.8; break;
          case 1: rgb = col[2]; a = 0.6; r = 1.4; break;
          case 2: rgb = col[1]; a = 0.55; r = 1.2; break;
          case 3: {
            const b = bk[p.bay];
            rgb = mixc(col[1], SPEC[p.bay] ? col[3] : col[2], b);
            a = 0.6 + 0.4 * b; r = 1.5 + 0.4 * b; break;
          }
          default: rgb = col[3]; a = 0.95; r = 1.7;
        }
        plot(j, X(p.x), Y(p.y), k, rgb, a * vis * (0.3 + 0.7 * k), r);
      }

      // Ships.
      for (const s of ships) {
        const g = smooth((T - s.tg) / 0.9) * (1 - smooth((T - s.tx) / 1.3));
        if (g <= 0.001) continue;
        const [px, py, h] = pose(s, T), c = Math.cos(h), sn = Math.sin(h);
        const rgb = s.spec ? col[3] : col[2];
        for (let k = 0; k < s.shape.length; k++) {
          const [lx, ly] = s.shape[k];
          const tx = X(px + (lx * c - ly * sn) * SS), ty = Y(py + (lx * sn + ly * c) * SS);
          plot(s.idx[k], tx, ty, g, rgb, (0.2 + 0.8 * g) * vis, 2.0);
        }
      }

      // Key moments: accent ring on the bay and a small label outside it.
      ctx.globalCompositeOperation = 'source-over';
      for (const e of EV) {
        const q = (T - e.t) / 1.4;
        const b = at(e.bay, BR), bx = X(b[0]), by = Y(b[1]);
        if (q > 0 && q < 1) api.ring(ctx, bx, by, RB * R * (1.1 + 0.9 * smooth(q)), acc, alpha * 0.7 * (1 - q), 1.2);
        const la = alpha * smooth((T - e.t) / 0.4) * (1 - smooth((T - e.t - 2.2) / 0.6));
        if (la > 0.01) {
          const l = at(e.bay, BR + RB + 0.26);
          api.text(ctx, e.s, X(l[0]), Y(l[1]), acc, 0.9 * la);
        }
      }
      ctx.restore();
    }
  };
  return self;
};
