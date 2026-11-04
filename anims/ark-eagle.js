// In-galaxy animation for 'ark-eagle' (Ark Eagle Volunteer Scheduler). See anims/README.md.
// The galaxy's own stars leave the spiral and condense into 7 tilted day-orbits (MON..SUN).
// Volunteer satellites (small clusters of arm stars) launch one by one and dock into each
// day's shift slots until the week is full. A reminder pulse runs out across the orbits.
// Then one volunteer drops out: it flickers, dims and drifts back into the field. The system
// scans the arms (accent), picks a replacement, which auto-launches and docks with an accent
// pulse. The week holds, then everything relaxes back into the spiral and the loop repeats.
GALAXY_ANIMS['ark-eagle'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { TAU, clamp, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const NSL = [2, 3, 2, 3, 2, 3, 2];                 // shift slots per day-orbit
  const RINGS = 7, MAXS = 2600, MEM = 5, SPARES = 3;
  const TILT = -0.3, FLAT = 0.5;
  const rr = d => 0.24 + 0.11 * d;                   // orbit semi-major axis (x R)
  const spd = d => 0.16 / (1 + 0.3 * d);             // inner orbits run faster
  const cT = Math.cos(TILT), sT = Math.sin(TILT);
  const ell = (d, th) => {                           // offset from the core, R units
    const ex = Math.cos(th) * rr(d), ey = Math.sin(th) * rr(d) * FLAT;
    return [ex * cT - ey * sT, ex * sT + ey * cT];
  };
  const slotTh = (d, s, t) => d * 0.9 + s * TAU / NSL[d] + spd(d) * t;
  const slots = [];
  for (let d = 0; d < RINGS; d++) for (let s = 0; s < NSL[d]; s++) slots.push({ d, s });
  const NSLOT = slots.length;

  // Timeline (seconds). One loop is one scheduling week.
  const LOOP = 24, FORM = 0.3, FL = 1.6;
  const LAUNCH = slots.map((_, i) => 2.6 + i * 0.36);
  const FULL = LAUNCH[NSLOT - 1] + FL + 0.2;         // every slot docked
  const PING = FULL + 0.3;                           // reminder pulse runs outward
  const TC = 12.2, TSCAN = 14.0, TREPL = 15.3, TDOCK = TREPL + 2.0, TREL = 20.2;
  const CANCEL = [9, 4, 13];                         // slot that drops out, per loop
  const BA = [0.3, 0.5, 0.75, 0.92], GH = 0.13;      // field stars kept very faint

  let T = 0, loopNo = 0, ready = false, n = 0;
  let role, ringD, ringTh0, satOf, memOf, dl;
  const sats = [];                                   // { stars, ang }
  let satAt = [], repFor = [];

  function init(S, cx, cy, R) {
    n = S.n;
    role = new Int8Array(n);                         // 0 field, 1 core, 2 orbit, 3 satellite
    ringD = new Int8Array(n); ringTh0 = new Float32Array(n); dl = new Float32Array(n);
    satOf = new Int16Array(n).fill(-1); memOf = new Int8Array(n);
    const rad = new Float32Array(n), ang = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const dx = (S.x[j] - cx) / R, dy = (S.y[j] - cy) / R;
      const ux = dx * cT + dy * sT, uy = (-dx * sT + dy * cT) / FLAT;
      rad[j] = S.x[j] < -1e3 ? 99 : Math.hypot(dx, dy);
      ang[j] = Math.atan2(uy, ux);
      dl[j] = rng();
      if (rad[j] < 0.06) role[j] = 1;
    }
    // Satellites first: tight clusters of MEM stars out in the arms, seeds kept apart.
    const free = [];
    for (let j = 0; j < n; j++) if (role[j] === 0 && rad[j] > 0.45 && rad[j] < 1.2) free.push(j);
    for (let i = free.length - 1; i > 0; i--) { const k = (rng() * (i + 1)) | 0; [free[i], free[k]] = [free[k], free[i]]; }
    const used = new Uint8Array(n);
    for (let pass = 0; pass < 2 && sats.length < NSLOT + SPARES; pass++) {
      const minD = pass ? 0.04 : 0.14;
      for (const seed of free) {
        if (sats.length >= NSLOT + SPARES) break;
        if (used[seed]) continue;
        if (sats.some(s => Math.hypot(S.x[s.stars[0]] - S.x[seed], S.y[s.stars[0]] - S.y[seed]) < minD * R)) continue;
        const nb = free.filter(j => !used[j] && j !== seed)
          .map(j => [j, (S.x[j] - S.x[seed]) ** 2 + (S.y[j] - S.y[seed]) ** 2])
          .sort((a, b) => a[1] - b[1]).slice(0, MEM - 1);
        if (!pass && nb[MEM - 2] && nb[MEM - 2][1] > (0.07 * R) ** 2) continue;   // keep clusters tight
        const stars = [seed, ...nb.map(p => p[0])];
        stars.forEach((j, m) => { used[j] = 1; role[j] = 3; satOf[j] = sats.length; memOf[j] = m; });
        sats.push({ stars, ang: Math.atan2(S.y[seed] - cy, S.x[seed] - cx), rad: rad[seed] });
      }
    }
    // Orbit stars: free stars nearest each orbit's radius, spread evenly in angle order.
    for (let d = RINGS - 1; d >= 0; d--) {
      const per = TAU * rr(d) * Math.sqrt((1 + FLAT * FLAT) / 2);
      const m = Math.round(per / 0.017);
      const cand = [];
      for (let j = 0; j < n; j++) if (role[j] === 0 && rad[j] < 1.3) cand.push(j);
      const tr = rr(d) * 0.75;
      cand.sort((a, b) => Math.abs(rad[a] - tr) - Math.abs(rad[b] - tr));
      const pick = cand.slice(0, m).sort((a, b) => ang[a] - ang[b]);
      const off = rng() * TAU;
      pick.forEach((j, i) => { role[j] = 2; ringD[j] = d; ringTh0[j] = off + i * TAU / pick.length; });
    }
    // Each slot takes the free satellite closest in angle to where the slot is at launch.
    const angAt = (k, t) => { const e = ell(slots[k].d, slotTh(slots[k].d, slots[k].s, t)); return Math.atan2(e[1], e[0]); };
    const adiff = (a, b) => Math.abs(((a - b) % TAU + 3 * Math.PI) % TAU - Math.PI);
    const taken = new Uint8Array(sats.length);
    const pickSat = (a, from, to, minR = 0) => {
      let best = -1, bd = 9;
      for (let i = from; i < to; i++) if (!taken[i] && sats[i].rad >= minR && adiff(sats[i].ang, a) < bd) { bd = adiff(sats[i].ang, a); best = i; }
      if (best >= 0) taken[best] = 1;
      return best;
    };
    const NS = Math.min(sats.length, NSLOT + SPARES);
    // Reserve the spares first: for each cancel scenario, the satellite nearest the empty slot.
    // Spares come from the outer arms, so the replacement's launch is a real flight.
    repFor = CANCEL.map(k => { const i = pickSat(angAt(k, TREPL) + 0.5, 0, NS, 0.62); return i >= 0 ? i : pickSat(angAt(k, TREPL), 0, NS); });
    satAt = slots.map((_, k) => pickSat(angAt(k, LAUNCH[k]), 0, NS));
    ready = true;
  }

  // Quadratic Bezier with a bowed control point.
  function bez(x0, y0, x1, y1, q, bow) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const kx = mx - dy * bow, ky = my + dx * bow, u = 1 - q;
    return [u * u * x0 + 2 * u * q * kx + q * q * x1, u * u * y0 + 2 * u * q * ky + q * q * y1];
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      if (T >= LOOP) { T -= LOOP; loopNo++; }
      self.spiralDim = 0.97 * Math.min(smooth((T - 0.4) / 1.6), 1 - smooth((T - 22.0) / 1.8));
    },
    draw(c, cx, cy, R, A) {
      if (A < 0.01) return;
      const S = api.stars(MAXS);
      if (!ready) { if (S.n < 200 || A < 0.995) return; init(S, cx, cy, R); }
      if (S.n < n) return;
      const dk = api.dark(), acc = api.accent();
      const col = api.colors();
      const vis = self.spiralDim / 0.97;
      c.save();
      c.globalCompositeOperation = dk ? 'lighter' : 'source-over';
      const P = (d, th) => { const e = ell(d, th); return [cx + e[0] * R, cy + e[1] * R]; };
      const slotPos = (k, t) => P(slots[k].d, slotTh(slots[k].d, slots[k].s, t));
      const ck = CANCEL[loopNo % CANCEL.length], cd = slots[ck].d, rep = repFor[loopNo % CANCEL.length];
      const rel = smooth((T - TREL) / 2.2);                      // week over: back to the spiral
      const form = d => smooth((T - FORM - d * 0.16) / 2.0) * (1 - smooth((T - TREL - 0.6 - (RINGS - 1 - d) * 0.12) / 2.0));
      const sz = Math.max(1, R / 320);                           // satellite scale

      // Day labels sit on each orbit's left end, in a small gap cut in its stars.
      const labX = [], labY = [], labA = [];
      for (let d = 0; d < RINGS; d++) { const p = P(d, Math.PI); labX[d] = p[0]; labY[d] = p[1]; labA[d] = smooth((form(d) - 0.55) / 0.4); }

      // Satellite schedule this loop: slot index, launch time, cancel time.
      const st = new Array(sats.length).fill(null);
      satAt.forEach((si, k) => { if (si >= 0) st[si] = { k, tL: LAUNCH[k], cancel: k === ck ? TC : Infinity }; });
      if (rep >= 0) st[rep] = { k: ck, tL: TREPL, cancel: Infinity, rep: true };

      // 1. Stars.
      for (let j = 0; j < n; j++) {
        const lx = S.x[j], ly = S.y[j], b = S.b[j];
        if (lx < -1e3) continue;
        let x = lx, y = ly, a = BA[b] * GH, cl = col[b], r = 0;
        if (role[j] === 1) { a = BA[b] * 0.45; }
        else if (role[j] === 2) {
          const d = ringD[j], f = smooth((form(d) - dl[j] * 0.25) / 0.75);
          const th = ringTh0[j] + spd(d) * T;
          const [tx, ty] = P(d, th);
          x = lx + (tx - lx) * f; y = ly + (ty - ly) * f;
          const gx = (x - labX[d]) / (17 * sz), gy = (y - labY[d]) / (9 * sz), gq = gx * gx + gy * gy;
          const gm = gq < 1.6 ? 1 - labA[d] * (1 - smooth((gq - 0.9) / 0.7)) : 1;
          const lit = d === cd && T > TC && T < TDOCK + 1.5 ? 0.12 * Math.sin(clamp((T - TC) / (TDOCK + 1.5 - TC)) * Math.PI) : 0;
          a = (BA[b] * GH + (0.44 + lit - BA[b] * GH) * f) * gm;
          cl = col[Math.max(2, b)];
          // reminder pulse: a bright band runs outward across the orbits once the week is full
          const pq = (T - PING - d * 0.18) / 0.9;
          if (pq > 0 && pq < 1) { a += 0.45 * Math.sin(pq * Math.PI) * f; cl = col[3]; }
        } else if (role[j] === 3) {
          const s = st[satOf[j]], m = memOf[j];
          if (s && T > s.tL - 0.9) {
            const [sx, sy] = slotPos(s.k, T);
            const ma = m * TAU / 4 + T * 0.9 + s.k, mr = m ? 6.5 * sz : 0;
            const tx = sx + Math.cos(ma) * mr, ty = sy + Math.sin(ma) * mr * 0.8;
            const pre = smooth((T - s.tL + 0.9) / 0.9);          // glows in the arm before launch
            cl = s.rep ? acc : col[3];
            if (T < s.tL) {
              a = BA[b] * GH + (0.85 - BA[b] * GH) * pre; r = (m ? 1.3 : 2.4) * sz * pre;
            } else {
              const q = smooth((T - s.tL - m * 0.06) / (s.rep ? 2.0 : FL));
              [x, y] = bez(lx, ly, tx, ty, q, s.rep ? -0.25 : 0.22);
              a = m ? 0.75 : 0.95; r = (m ? 1.3 : 2.4 + 0.8 * q) * sz;
              if (s.rep && T > TDOCK + 0.6) cl = api.mix(acc, col[3], smooth((T - TDOCK - 0.6) / 2.5) * 0.55);
              // drop-out: flicker, fade to the faint colour, drift out and rejoin the field
              if (T > s.cancel) {
                const u = T - s.cancel;
                const fl = u < 1.4 ? 0.45 + 0.55 * (Math.sin(u * 19 + m * 1.7) > -0.3 ? 1 : 0.15) : 0.5;
                const dr = smooth((u - 0.9) / 2.6);
                const ox = sx - cx, oy = sy - cy, L = Math.hypot(ox, oy) || 1;
                const dx = sx + (ox / L) * 0.28 * R * dr + (tx - sx) * 2.5 * dr;
                const dy = sy + (oy / L) * 0.28 * R * dr + (ty - sy) * 2.5 * dr;
                const back = smooth((u - 3.0) / 2.2);
                x = dx + (lx - dx) * back; y = dy + (ly - dy) * back;
                cl = api.mix(col[3], col[1], smooth(u / 1.4));
                a = a * fl * (1 - 0.4 * dr) * (1 - back) + BA[b] * GH * back;
                r = r * (1 - 0.3 * dr) * (1 - back);
              }
            }
            if (T > TREL) {                                        // fly home with the week's end
              const e = smooth((T - TREL - m * 0.05 - (s.k % 5) * 0.1) / 2.0);
              x += (lx - x) * e; y += (ly - y) * e;
              a += (BA[b] * GH - a) * e; r *= 1 - e;
            }
          }
        }
        a *= A * vis;
        if (a < 0.01) continue;
        c.fillStyle = api.rgba(cl, clamp(a * (dk ? 1 : 0.95)));
        if (r > 0.7) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
        else { const q = [0.9, 1.0, 1.3, 1.7][b]; c.fillRect(x - q / 2, y - q / 2, q, q); }
      }

      // 2. Day labels at the left end of each orbit.
      c.font = api.mono; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let d = 0; d < RINGS; d++) {
        const f = labA[d];
        if (f < 0.02) continue;
        const lx = labX[d], ly = labY[d];
        const hot = d === cd ? smooth((T - TC) / 0.5) * (1 - smooth((T - TDOCK - 1.6) / 0.8)) : 0;
        const tx = dk ? col[2] : col[3];                          // light: darker ink for text
        const cl = hot > 0.01 ? api.mix(tx, acc, hot) : tx;
        c.fillStyle = api.rgba(cl, clamp(A * vis * f * (0.75 + 0.25 * hot)));
        c.fillText(DAYS[d], lx, ly + 0.5);
      }

      // 3. Drop-out and auto-fill: empty slot marker, accent scan, docking pulse, two words.
      const [ex, ey] = slotPos(ck, T);
      const lab = (s, col1, t0, t1) => {
        const k = Math.min(smooth((T - t0) / 0.4), 1 - smooth((T - t1 + 0.4) / 0.4));
        if (k < 0.01) return;
        c.textAlign = 'left'; c.fillStyle = api.rgba(col1, clamp(A * vis * 0.9 * k));
        c.fillText(s, ex + 14 * sz, ey - 14 * sz);
      };
      if (T > TC + 1.4 && T < TDOCK + 0.1) {
        const k = smooth((T - TC - 1.4) / 0.6);
        api.ring(c, ex, ey, 7 * sz, col[2], A * vis * k * (0.4 + 0.25 * Math.sin(T * 4)), 1);
      }
      lab('dropped out', dk ? col[2] : col[3], TC + 0.3, TSCAN + 0.3);
      const rs = rep >= 0 ? sats[rep] : null;
      if (rs && T > TSCAN && T < TREPL + 0.4) {
        const g0 = rs.stars[0], gx = S.x[g0], gy = S.y[g0];
        const tgt = Math.atan2(gy - cy, gx - cx), u = smooth((T - TSCAN) / 1.0);
        const an = tgt - 1.6 * (1 - u), len = Math.hypot(gx - cx, gy - cy) * 1.1;
        const fade = A * vis * (1 - smooth((T - TREPL) / 0.4));
        api.line(c, cx, cy, cx + Math.cos(an) * len, cy + Math.sin(an) * len, acc, 0.5 * fade, 1);
        if (u > 0.98) api.ring(c, gx, gy, 11 * sz, acc, 0.85 * fade, 1.2);
      }
      if (T > TDOCK && T < TDOCK + 1.5) {
        const u = (T - TDOCK) / 1.5;
        api.ring(c, ex, ey, (6 + 22 * smooth(u)) * sz, acc, A * vis * 0.9 * (1 - u), 1.5);
      }
      lab('auto-filled', acc, TDOCK, TDOCK + 2.6);

      // 4. Shift counter under the orbits.
      let filled = 0;
      for (let k = 0; k < NSLOT; k++) if (T > LAUNCH[k] + FL * 0.9) filled++;
      if (T > TC + 0.3 && T < TDOCK) filled--;
      const cf = smooth((T - 2.4) / 0.8) * (1 - rel);
      if (cf > 0.01) {
        const [wx, wy] = P(RINGS - 1, Math.PI / 2);
        const short = T > TC + 0.3 && T < TDOCK;
        c.textAlign = 'center';
        c.fillStyle = api.rgba(short ? acc : dk ? col[2] : col[3], clamp(A * vis * cf * (short ? 0.9 : 0.75)));
        c.fillText(filled + ' / ' + NSLOT + ' shifts filled', wx, wy + 30 * sz);
      }
      c.restore();
    }
  };
  return self;
};
