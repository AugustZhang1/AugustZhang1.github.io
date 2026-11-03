// In-galaxy animation for 'ark-eagle' (Ark Eagle Volunteer Scheduler).
// The galaxy's own stars condense into 7 tilted orbits (Mon..Sun). Small star clusters
// launch from the arms and dock into each day's slots until the week is full. Reminder
// pings run round each orbit; one volunteer cancels, drifts off, and the system picks a
// replacement from the arms (accent scan), which docks with an accent pulse. New week.
GALAXY_ANIMS['ark-eagle'] = function (api) {
  const { TAU, clamp, ease3, rng } = api;
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const NSL = [4, 4, 3, 4, 4, 3, 3];               // slots per orbit
  const RINGS = 7, MAXS = 2600, MEM = 5, SPARES = 8;
  const TILT = -0.32, FLAT = 0.44;
  const rr = d => 0.24 + 0.105 * d;                  // orbit semi-major axis (x R)
  const spd = d => 0.11 / (1 + 0.35 * d);            // inner orbits run faster
  const ph = d => d * 0.9;                           // slot phase per orbit
  const cT = Math.cos(TILT), sT = Math.sin(TILT);
  // Ellipse point for orbit d at parameter th, as offset from the core in R units.
  const ell = (d, th) => {
    const ex = Math.cos(th) * rr(d), ey = Math.sin(th) * rr(d) * FLAT;
    return [ex * cT - ey * sT, ex * sT + ey * cT];
  };
  const slotTh = (d, s, T) => ph(d) + s * TAU / NSL[d] + spd(d) * T;
  const ringTh = (d, T) => spd(d) * T;
  const FL = 1.9;                                     // flight time

  let T = 0, ready = false, n = 0;
  let role, ringD, ringTh0, satOf, memOf;            // per star
  const sats = [];                                   // { stars: [j..] }
  const slotList = [];                               // { d, s }
  for (let d = 0; d < RINGS; d++) for (let s = 0; s < NSL[d]; s++) slotList.push({ d, s });
  const NSLOT = slotList.length;
  let wk = null, weekNo = 0;

  function newWeek(t0) {
    weekNo++;
    const first = weekNo === 1;
    const st = t0 + (first ? 3.0 : 0.8);
    const launch = slotList.map((_, i) => st + i * 0.34 + rng() * 0.12);
    const c = 1 + ((rng() * 5) | 0);                // cancel day
    let ck = 0; for (let i = 0; i < NSLOT; i++) if (slotList[i].d === c) { ck = i; if (rng() < 0.45) break; }
    const pingStart = launch[NSLOT - 1] + FL + 0.9;
    const ping = [];
    for (let d = 0; d <= c; d++) ping[d] = pingStart + d * 1.5;
    const tc = ping[c] + 1.35;
    const tScan = tc + 1.9, tRepL = tScan + 1.4, tDock = tRepL + FL + 0.3;
    for (let d = c + 1; d < RINGS; d++) ping[d] = tDock + 1.4 + (d - c - 1) * 1.5;
    const tRel = ping[RINGS - 1] + 1.3 + 1.8;
    const rep = NSLOT + ((weekNo - 1) % SPARES);
    // which satellite fills each slot
    const satAt = slotList.map((_, i) => i);
    wk = { t0, launch, c, ck, ping, tc, tScan, tRepL, tDock, tRel, tEnd: tRel + 3.0, rep, satAt };
  }

  function init(S, cx, cy, R) {
    n = S.n;
    role = new Int8Array(n);        // 0 ghost, 1 core, 2 ring, 3 satellite
    ringD = new Int8Array(n); ringTh0 = new Float32Array(n);
    satOf = new Int16Array(n).fill(-1); memOf = new Int8Array(n);
    const rad = new Float32Array(n), ang = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const dx = (S.x[j] - cx) / R, dy = (S.y[j] - cy) / R;
      // undo tilt + flattening so angle/radius are in the orbit frame
      const ux = dx * cT + dy * sT, uy = (-dx * sT + dy * cT) / FLAT;
      rad[j] = S.x[j] < -1e3 ? 99 : Math.hypot(dx, dy);
      ang[j] = Math.atan2(uy, ux);
      if (rad[j] < 0.075) role[j] = 1;
    }
    // Ring stars: nearest-in-radius free stars, then spread evenly in order of angle.
    for (let d = RINGS - 1; d >= 0; d--) {
      const per = 2 * Math.PI * rr(d) * Math.sqrt((1 + FLAT * FLAT) / 2);
      const m = Math.round(per / 0.021);
      const cand = [];
      for (let j = 0; j < n; j++) if (role[j] === 0 && rad[j] < 1.2) cand.push(j);
      cand.sort((a, b) => Math.abs(rad[a] - rr(d) * 0.8) - Math.abs(rad[b] - rr(d) * 0.8));
      const pick = cand.slice(0, m).sort((a, b) => ang[a] - ang[b]);
      const off = rng() * TAU;
      pick.forEach((j, i) => { role[j] = 2; ringD[j] = d; ringTh0[j] = off + i * TAU / pick.length; });
    }
    // Satellites: tight clusters of MEM free stars out in the arms.
    const free = [];
    for (let j = 0; j < n; j++) if (role[j] === 0 && rad[j] > 0.55 && rad[j] < 1.05 && S.x[j] > -1e3) free.push(j);
    for (let i = free.length - 1; i > 0; i--) { const k = (rng() * (i + 1)) | 0; [free[i], free[k]] = [free[k], free[i]]; }
    const used = new Uint8Array(n);
    for (const seed of free) {
      if (sats.length >= NSLOT + SPARES) break;
      if (used[seed]) continue;
      const nb = free.filter(j => !used[j] && j !== seed)
        .map(j => [j, (S.x[j] - S.x[seed]) ** 2 + (S.y[j] - S.y[seed]) ** 2])
        .sort((a, b) => a[1] - b[1]).slice(0, MEM - 1).map(p => p[0]);
      const stars = [seed, ...nb];
      stars.forEach((j, m) => { used[j] = 1; role[j] = 3; satOf[j] = sats.length; memOf[j] = m; });
      sats.push({ stars });
    }
    newWeek(0);
    ready = true;
  }

  // Bezier from p0 via a bowed control point to p1.
  function bez(x0, y0, x1, y1, q, bow) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const kx = mx - dy * bow, ky = my + dx * bow, u = 1 - q;
    return [u * u * x0 + 2 * u * q * kx + q * q * x1, u * u * y0 + 2 * u * q * ky + q * q * y1];
  }

  const self = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      if (wk && T >= wk.tEnd) newWeek(T);
      self.spiralDim = 0.96 * ease3(clamp(T / 2.6));
    },
    draw(c, cx, cy, R, A) {
      const S = api.stars(MAXS);
      if (!ready) { if (S.n < 200) return; init(S, cx, cy, R); }
      const col = api.colors(), acc = api.accent(), dk = api.dark();
      const BA = [0.28, 0.5, 0.75, 0.92], GH = 0.32;
      c.save();
      c.globalCompositeOperation = dk ? 'lighter' : 'source-over';
      const P = (d, th) => { const e = ell(d, th); return [cx + e[0] * R, cy + e[1] * R]; };
      const W = wk;

      // Form progress per orbit, and ping state per orbit.
      const form = d => ease3(clamp((T - 0.3 - d * 0.22) / 2.2));
      const pingQ = d => (T - W.ping[d]) / 1.3;  // 0..1 while running

      // Slot occupancy helpers.
      const slotPos = (k, t) => { const sl = slotList[k]; return P(sl.d, slotTh(sl.d, sl.s, t)); };
      const memOff = (m, t) => m === 0 ? [0, 0] : [Math.cos(m * TAU / 4 + t * 0.6) * 2.5, Math.sin(m * TAU / 4 + t * 0.6) * 2.5];

      // Per-satellite state this frame: target position and weights.
      const satState = new Array(sats.length).fill(null);
      for (let k = 0; k < NSLOT; k++) {
        const si = W.satAt[k];
        satState[si] = { k, tL: W.launch[k], cancel: k === W.ck ? W.tc : Infinity };
      }
      satState[W.rep] = { k: W.ck, tL: W.tRepL, cancel: Infinity, rep: true };

      // 1. Stars.
      for (let j = 0; j < n; j++) {
        const lx = S.x[j], ly = S.y[j];
        const b = S.b[j];
        let x = lx, y = ly, a = BA[b] * GH, cl = col[b], r = 0;
        if (role[j] === 1) { a = BA[b] * 0.6; }
        else if (role[j] === 2) {
          const d = ringD[j], f = form(d);
          const th = ringTh0[j] + ringTh(d, T);
          const [tx, ty] = P(d, th);
          x = lx + (tx - lx) * f; y = ly + (ty - ly) * f;
          a = BA[b] * GH + (0.42 - BA[b] * GH) * f;
          cl = col[Math.max(1, b)];
          // reminder ping: brighten stars just behind the travelling ping
          const q = pingQ(d);
          if (q > 0 && q < 1.25) {
            const head = slotTh(d, 0, T) - 0.4 + q * TAU;
            let dd = ((head - th) % TAU + TAU) % TAU;
            if (dd < 1.4 && q * TAU > dd) { a += 0.5 * (1 - dd / 1.4) * clamp(1.25 - q, 0, 0.25) * 4; cl = col[3]; }
          }
        } else if (role[j] === 3) {
          const st = satState[satOf[j]];
          const m = memOf[j];
          if (!st || T < st.tL - 0.8) { a = BA[b] * GH; }
          else {
            const [sx, sy] = slotPos(st.k, T), mo = memOff(m, T);
            const tx = sx + mo[0], ty = sy + mo[1];
            cl = col[3];
            if (T < st.tL) {                                         // glows in the arm, about to launch
              a = BA[b] * GH + 0.6 * clamp((T - st.tL + 0.8) / 0.8);
            } else {
              const q = ease3(clamp((T - st.tL - m * 0.07) / FL));
              [x, y] = bez(lx, ly, tx, ty, q, 0.28);
              a = 0.85; r = 1.25;
              if (st.rep && T > W.tDock) { const e = clamp((T - W.tDock) / 2.2); cl = api.mix(acc, col[3], e); }
              else if (st.rep) cl = acc;
              // cancellation: flicker, dim, drift off the orbit, rejoin the arms
              if (T > st.cancel) {
                const u = T - st.cancel;
                const fl = u < 1.3 ? 0.35 + 0.65 * Math.abs(Math.sin(u * 23 + m * 2)) * (Math.sin(u * 7.3 + m) > -0.2 ? 1 : 0.2) : 0.35;
                const dr = ease3(clamp((u - 1.0) / 2.4));
                const ox = (sx - cx), oy = (sy - cy), L = Math.hypot(ox, oy) || 1;
                const dx = sx + (ox / L) * 0.32 * R * dr + mo[0] * (1 + 4 * dr), dy = sy + (oy / L) * 0.32 * R * dr + 18 * dr + mo[1] * (1 + 4 * dr);
                const back = ease3(clamp((u - 3.6) / 2.2));
                x = dx + (lx - dx) * back; y = dy + (ly - dy) * back;
                a = (0.85 * fl) * (1 - 0.55 * dr) * (1 - back) + BA[b] * GH * back;
                cl = api.mix(col[3], col[0], clamp(u / 1.3));
                r = 1.25 - 0.4 * dr;
              }
              // week over: everyone flies back to the arms
              if (T > W.tRel) {
                const e = ease3(clamp((T - W.tRel - m * 0.05 - (st.k % 7) * 0.12) / 2.2));
                x = x + (lx - x) * e; y = y + (ly - y) * e;
                a = a + (BA[b] * GH - a) * e; r = r * (1 - e);
              }
            }
          }
        }
        if (a * A < 0.01 || x < -50) continue;
        c.fillStyle = api.rgba(cl, clamp(a * A * (dk ? 1 : 0.95)));
        if (r > 0.6) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
        else { const s = [0.9, 1.0, 1.3, 1.7][b]; c.fillRect(x - s / 2, y - s / 2, s, s); }
      }

      // 2. Reminder ping heads, day labels.
      for (let d = 0; d < RINGS; d++) {
        const f = form(d);
        const q = pingQ(d);
        if (q > 0 && q < 1) {
          const [hx, hy] = P(d, slotTh(d, 0, T) - 0.4 + q * TAU);
          api.dot(c, hx, hy, 1.8, col[3], A * 0.95 * Math.sin(Math.PI * q) ** 0.3);
        }
        const [lx, ly] = P(d, Math.PI);
        const lit = q > -0.1 && q < 1.3 ? 1 : 0;
        c.font = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = api.rgba(lit ? col[3] : col[2], clamp(A * f * (lit ? 0.95 : 0.5)));
        c.fillText(DAYS[d], lx, ly - 9);
      }

      // 3. The cancelled slot: empty marker, scan line, docking pulse.
      const [ex, ey] = slotPos(W.ck, T);
      if (T > W.tc + 1.6 && T < W.tDock) api.ring(c, ex, ey, 4.5, col[1], A * 0.45 * (0.6 + 0.4 * Math.sin(T * 4)), 1);
      if (T > W.tc + 0.2 && T < W.tc + 3.0) {
        c.font = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace'; c.textAlign = 'left';
        c.fillStyle = api.rgba(col[2], clamp(A * 0.7 * Math.min(1, (T - W.tc - 0.2) * 2, (W.tc + 3.0 - T) * 2)));
        c.fillText('cancelled', ex + 9, ey - 9);
      }
      const rs = sats[W.rep];
      if (rs && T > W.tScan && T < W.tRepL + 0.3) {
        // centroid of the replacement cluster, still in the arm
        let gx = 0, gy = 0; rs.stars.forEach(j => { gx += S.x[j]; gy += S.y[j]; }); gx /= MEM; gy /= MEM;
        const tgt = Math.atan2(gy - cy, gx - cx), u = clamp((T - W.tScan) / 1.0);
        const an = tgt - 1.3 * (1 - ease3(u)), len = Math.hypot(gx - cx, gy - cy) * 1.12;
        const fade = T < W.tRepL - 0.2 ? 1 : clamp((W.tRepL + 0.3 - T) / 0.5);
        api.line(c, cx, cy, cx + Math.cos(an) * len, cy + Math.sin(an) * len, acc, A * 0.55 * fade, 1);
        if (u >= 1) api.ring(c, gx, gy, 9, acc, A * 0.8 * fade, 1);
      }
      if (T > W.tDock && T < W.tDock + 1.4) {
        const u = (T - W.tDock) / 1.4;
        api.ring(c, ex, ey, 4 + 16 * ease3(u), acc, A * 0.85 * (1 - u), 1.2);
      }
      if (T > W.tDock && T < W.tDock + 2.8) {
        c.font = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace'; c.textAlign = 'left';
        c.fillStyle = api.rgba(acc, clamp(A * 0.8 * Math.min(1, (T - W.tDock) * 2, (W.tDock + 2.8 - T) * 2)));
        c.fillText('auto-filled', ex + 9, ey - 9);
      }

      // 4. Week counter, small, below the orbits.
      const [wx, wy] = P(RINGS - 1, Math.PI / 2);
      c.font = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace'; c.textAlign = 'center';
      c.fillStyle = api.rgba(col[2], clamp(A * 0.5 * form(RINGS - 1)));
      c.fillText('week ' + String(weekNo).padStart(2, '0'), wx, wy + 22);
      c.restore();
    }
  };
  return self;
};
