// In-galaxy animation for 'rag' (RAG Toolkit). See anims/README.md for the API.
// A star leaves the spiral and becomes the query. A radar beam sweeps once around
// it; stars glint as it passes, and the 5 best matches detach, swell into planets
// and pull two neighbouring stars in as moons. They rank by score into a list,
// then a judge pass ticks each row and strikes one hallucination in the accent.
// Finally every borrowed star drifts back into the spiral and the loop repeats.
GALAXY_ANIMS['rag'] = function (api) {
  api.lightBoost();   // light theme: a little more weight (see index.html makeApi)
  const { rng, TAU, clamp } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const K = 5, RANGE = 0.62;               // matches, beam range (R units)
  const QX = -0.3, QY = 0.0;               // query point, left of the core (R units)
  // Timeline (seconds).
  const Q0 = 0.4, Q1 = 2.6;                // query star detaches and settles
  const S0 = 2.8, S1 = 9.8;                // beam sweeps one turn
  const RK0 = 10.4, RK1 = 12.4;            // ranking into the list
  const J0 = 13.0, JS = 0.7;               // judge reaches row k at J0 + k*JS
  const BACK = 19.0, LOOP = 22.5;          // relax into the spiral, loop

  let T = 0, spiralDim = 0;
  let qStar = -1, qFrom = null;            // query star index and where it left from
  let picks = null;                        // [{ i, x, y, a, d, score, found, from, moons }]
  let bad = 2;

  function reset() { qStar = -1; qFrom = null; picks = null; bad = 1 + Math.floor(rng() * 3); }
  reset();

  const rel = (S, j, cx, cy, R) => ({ x: (S.x[j] - cx) / R, y: (S.y[j] - cy) / R });
  const ok = (S, j) => S.x[j] > -1e3;
  const beamAng = () => -Math.PI / 2 + TAU * smooth((T - S0) / (S1 - S0)) * 0.98 + TAU * 0.01;

  // Query: a bright star near the query point.
  function pickQuery(S, cx, cy, R) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < S.n; j++) {
      if (!ok(S, j) || S.b[j] < 2) continue;
      const p = rel(S, j, cx, cy, R), d = Math.hypot(p.x - QX, p.y - QY);
      if (d > 0.08 && d < bd) { bd = d; best = j; }
    }
    return best;
  }

  // Five bright stars spread in angle around the query, scored by distance.
  function choose(S, cx, cy, R) {
    const cand = [];
    for (let j = 0; j < S.n; j++) {
      if (!ok(S, j) || S.b[j] < 2 || j === qStar) continue;
      const p = rel(S, j, cx, cy, R), dx = p.x - QX, dy = p.y - QY, d = Math.hypot(dx, dy);
      const dc = Math.hypot(p.x, p.y);
      if (d > 0.16 && d < RANGE * 0.88 && dc > 0.24) cand.push({ i: j, x: p.x, y: p.y, d, a: Math.atan2(dy, dx), r: rng() });
    }
    // One star per 72-degree sector around the query, so the beam finds them one by one.
    const out = [], off = rng() * TAU;
    for (let k = 0; k < K; k++) {
      let best = null;
      for (const c of cand) {
        const sec = Math.floor((((c.a - off) % TAU + TAU) % TAU) / (TAU / K));
        if (sec !== k) continue;
        const sc = c.r + (c.d > 0.22 ? 0 : 1);
        if (!best || sc < best.sc) best = Object.assign(c, { sc });
      }
      if (best) out.push(best);
    }
    // Thin sectors (above and below the tilted disc) may be empty: top up with spaced stars.
    for (const c of cand.slice().sort((a, b) => a.r - b.r)) {
      if (out.length >= K) break;
      if (out.every(o => o !== c && Math.hypot(c.x - o.x, c.y - o.y) > 0.16)) out.push(c);
    }
    out.sort((a, b) => a.d - b.d);
    let s = 0.89 + rng() * 0.05;
    out.forEach(o => { o.score = s; s -= 0.035 + rng() * 0.03; o.found = -1; o.moons = null; });
    // Sweep time when the beam passes each one.
    out.forEach(o => {
      const rel0 = ((o.a + Math.PI / 2) % TAU + TAU) % TAU;
      const u = (rel0 / TAU - 0.01) / 0.98;
      // invert smoothstep numerically
      let lo = 0, hi = 1;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (smooth(m) < u) lo = m; else hi = m; }
      o.tf = S0 + (lo + hi) / 2 * (S1 - S0);
    });
    return out;
  }

  // Two neighbours of a planet become its moons.
  function moonsFor(S, o, cx, cy, R) {
    const used = new Set([qStar, ...picks.map(p => p.i)]);
    const near = [];
    for (let j = 0; j < S.n; j++) {
      if (!ok(S, j) || used.has(j)) continue;
      const p = rel(S, j, cx, cy, R), d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d > 0.02 && d < 0.12) near.push({ j, d, x: p.x, y: p.y });
    }
    near.sort((a, b) => a.d - b.d);
    const m = near.slice(0, 2);
    while (m.length < 2) m.push({ j: -1, x: o.x + 0.05 * (m.length + 1), y: o.y });
    return m.map((n, k) => ({ x: n.x, y: n.y, ph: rng() * TAU, sp: 0.9 + k * 0.5 + rng() * 0.2, r: 7 + k * 4.5 }));
  }

  const anim = {
    get spiralDim() { return spiralDim; },
    update(dt) {
      T += dt;
      if (T >= LOOP) { T -= LOOP; reset(); }
      spiralDim = 0.55 * smooth((T - Q0) / 1.6) * (1 - smooth((T - BACK) / 3.2));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const col = api.colors(), acc = api.accent();
      const hi = col[3], mid = col[2];
      const S = api.stars(6000);
      const X = u => cx + u * R, Y = v => cy + v * R;
      const qx = X(QX), qy = Y(QY);
      const back = smooth((T - BACK) / 3.0);         // 0 → 1 as everything returns
      const fade = alpha * (1 - back);

      // Query star leaves the spiral and settles at the query point.
      if (qStar < 0) { qStar = pickQuery(S, cx, cy, R); if (qStar >= 0) qFrom = rel(S, qStar, cx, cy, R); }
      if (qStar < 0) return;
      const qm = smooth((T - Q0) / (Q1 - Q0)) * (1 - back);
      const qLive = ok(S, qStar) ? rel(S, qStar, cx, cy, R) : qFrom;
      const qsrc = T < BACK ? qFrom : qLive;
      const qpx = X(qsrc.x + (QX - qsrc.x) * qm), qpy = Y(qsrc.y + (QY - qsrc.y) * qm);
      api.dot(ctx, qpx, qpy, 1.4 + 1.4 * qm, hi, alpha * (0.6 + 0.4 * qm));
      if (qm > 0.02) {
        api.ring(ctx, qpx, qpy, 6 + Math.sin(T * 2) * 0.7, hi, alpha * qm * 0.35, 1);
        api.text(ctx, 'query', qpx, qpy - 16, mid, fade * smooth((T - Q1 + 0.6) / 0.8) * 0.7);
      }

      // Radar: faint range circle, rotating beam with a fading wedge, glints in its wake.
      if (!picks && T >= S0 - 0.1) picks = choose(S, cx, cy, R);
      const sw = smooth((T - S0 + 0.4) / 0.6) * (1 - smooth((T - S1) / 0.8));
      if (sw > 0.01) {
        const a = beamAng(), rp = RANGE * R;
        api.ring(ctx, qx, qy, rp, mid, alpha * sw * 0.12, 1);
        ctx.save();
        for (let k = 0; k < 14; k++) {
          ctx.fillStyle = api.rgba(mid, alpha * sw * 0.07 * (1 - k / 14));
          ctx.beginPath(); ctx.moveTo(qx, qy);
          ctx.arc(qx, qy, rp, a - (k + 1) * 0.035, a - k * 0.035);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        api.line(ctx, qx, qy, qx + Math.cos(a) * rp, qy + Math.sin(a) * rp, hi, alpha * sw * 0.4, 0.8);
        for (let j = 0; j < S.n; j++) {
          if (!ok(S, j)) continue;
          const dx = S.x[j] - qx, dy = S.y[j] - qy, d = Math.hypot(dx, dy);
          if (d > rp || d < 8) continue;
          const lag = ((a - Math.atan2(dy, dx)) % TAU + TAU) % TAU;
          if (lag > 0.45) continue;
          const g = Math.exp(-lag / 0.12) * sw;
          api.dot(ctx, S.x[j], S.y[j], 0.8 + g * 0.9, col[Math.min(3, S.b[j] + 1)], alpha * g * (0.45 + 0.17 * S.b[j]));
        }
      }
      if (!picks || !picks.length) return;

      // List beside the galaxy, left of the query.
      const rowH = Math.max(18, R * 0.065);
      const lx = Math.max(84, X(-1.0)), ly0 = qy - rowH * (picks.length - 1) / 2;
      const rankP = smooth((T - RK0) / (RK1 - RK0));

      picks.forEach((p, k) => {
        if (T >= p.tf && p.found < 0) { p.found = T; p.moons = moonsFor(S, p, cx, cy, R); }
        if (p.found < 0) return;
        const f = smooth((T - p.found) / 0.9);
        const isBad = k === bad;
        const tick = J0 + k * JS, judged = smooth((T - tick) / 0.45);
        const rej = isBad ? judged : 0;                // rejected hallucination
        const pc = rej > 0.05 ? acc : hi;

        // The planet: the star itself, frozen where the beam found it; it rejoins at the end.
        const live = ok(S, p.i) ? rel(S, p.i, cx, cy, R) : p;
        const px = X(p.x + (live.x - p.x) * back), py = Y(p.y + (live.y - p.y) * back);
        const pr = 1.3 + 2.4 * f * (1 - back) * (1 - 0.25 * rej);
        api.dot(ctx, px, py, pr, pc, alpha * (0.75 + 0.25 * f) * (1 - 0.35 * rej));
        if (isBad && judged > 0 && judged < 1) api.ring(ctx, px, py, pr + 4 + judged * 10, acc, fade * (1 - judged) * 0.8, 1);
        if (T - p.found < 1.2) api.ring(ctx, px, py, pr + 3 + (T - p.found) * 14, hi, fade * (1 - (T - p.found) / 1.2) * 0.5, 1);

        // Moons: two neighbouring stars pulled into orbit; a rejected planet loses them.
        p.moons.forEach((m, mi) => {
          const cap = smooth((T - p.found - 0.2 - mi * 0.25) / 1.2) * (1 - back) * (1 - rej);
          const ang = m.ph + T * m.sp;
          const ox = px + Math.cos(ang) * m.r, oy = py + Math.sin(ang) * m.r * 0.5;
          const drift = rej * 0.06 * (mi ? 1 : -1);
          const sx = X(m.x + drift), sy = Y(m.y + drift);
          api.dot(ctx, sx + (ox - sx) * cap, sy + (oy - sy) * cap, 1.0 + 0.4 * cap, mi ? mid : hi, alpha * (0.5 + 0.45 * cap) * (1 - back * 0.5));
          if (cap > 0.02) { ctx.strokeStyle = api.rgba(mid, alpha * cap * 0.14); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(px, py, m.r, m.r * 0.5, 0, 0, TAU); ctx.stroke(); }
        });

        // Hairline to the query with the score.
        const la = fade * f * (1 - 0.8 * rej);
        api.line(ctx, qx, qy, px, py, pc, la * 0.22, 0.6);
        const ux = px - qx, uy = py - qy, ul = Math.hypot(ux, uy) || 1;
        api.text(ctx, p.score.toFixed(2), px + ux / ul * 24, py + uy / ul * 13, mid, la * 0.8 * (1 - 0.5 * rankP));

        // Ranked row: a light copy travels from the planet into its slot.
        if (rankP > 0) {
          const rx = lx, ry = ly0 + k * rowH, ra = fade * rankP;
          const e = smooth((T - RK0 - k * 0.18) / (RK1 - RK0 - 0.7));
          api.dot(ctx, px + (rx - px) * e, py + (ry - py) * e, 1.2 + e, pc, fade * Math.min(1, e * 3) * (1 - 0.4 * rej));
          if (e > 0.6) {
            const ta = fade * smooth((e - 0.6) / 0.4);
            api.text(ctx, String(k + 1), rx - 52, ry, mid, ta * 0.55);
            api.text(ctx, p.score.toFixed(2), rx - 26, ry, rej > 0.05 ? acc : hi, ta * 0.85);
          }
          if (judged > 0) {
            const kx = rx + 20;
            if (!isBad) {
              const a1 = Math.min(1, judged * 2), a2 = clamp(judged * 2 - 1);
              api.line(ctx, kx - 3, ry, kx - 3 + 2.5 * a1, ry + 2.5 * a1, hi, ra * 0.85, 1.1);
              if (a2 > 0) api.line(ctx, kx - 0.5, ry + 2.5, kx - 0.5 + 5 * a2, ry + 2.5 - 6 * a2, hi, ra * 0.85, 1.1);
            } else {
              api.line(ctx, rx - 62, ry, rx - 62 + 72 * judged, ry, acc, ra * 0.95, 1.2);
              if (judged > 0.8) api.text(ctx, '×', kx, ry, acc, ra * smooth((judged - 0.8) / 0.2));
            }
          }
        }
      });

      // Headers and the verdict.
      const hy = ly0 - rowH * 1.25;
      api.text(ctx, 'top-5', lx - 26, hy, mid, fade * smooth((T - RK1 + 0.6) / 0.6) * 0.6);
      api.text(ctx, 'judge', lx + 20, hy, mid, fade * smooth((T - J0 + 0.4) / 0.5) * 0.6);
      const vT = J0 + bad * JS + 0.5;
      api.text(ctx, 'hallucination caught', lx - 16, ly0 + rowH * picks.length + 4, acc, fade * smooth((T - vT) / 0.6) * 0.85);
    }
  };
  return anim;
};
