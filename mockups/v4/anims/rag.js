// In-galaxy animation for 'rag': retrieval through the galaxy's own stars.
// A query star drifts in, a radar ring sweeps outward and makes the stars glint,
// the 5 nearest matches swell into planets with moons, rank into a list beside
// the query, then a judge pass ticks them and strikes one hallucination in accent.
GALAXY_ANIMS['rag'] = function (api) {
  const { rng, TAU, clamp, ease3 } = api;
  const K = 5;
  // Phase boundaries (seconds within one cycle).
  const T_IN = 2.2, T_SWEEP = 7.2, T_RANK = 9.6, T_JUDGE = 13.4, T_HOLD = 15.4, T_END = 17.2;
  let t = 0, cycle = 0;
  let Q = null;          // query position in R units relative to core
  let picks = null;      // [{ i, d, score }] star index, distance from query (R units)
  let bad = 2;           // which rank gets struck through
  let qFrom = null, anchor = -1, listAt = null; // query rides on an anchor star

  function newQuery() {
    // Keep the query on the left half, so the list and lines stay clear of the panel.
    const ang = Math.PI * (0.62 + rng() * 0.76);
    const rr = 0.32 + rng() * 0.22;
    Q = { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr * 0.8 };
    qFrom = { x: Q.x + Math.cos(ang) * 0.9, y: Q.y + Math.sin(ang) * 0.5 - 0.25 };
    picks = null; anchor = -1; listAt = null;
    bad = 1 + Math.floor(rng() * 3);
  }
  newQuery();

  // Choose 5 bright stars at increasing distance from the query (lazily, needs screen positions).
  // Anchor the query on a mid-disc star in the left half (by index, so it is camera-independent).
  function findAnchor(S, cx, cy, R) {
    for (let tries = 0; tries < 400; tries++) {
      const j = Math.floor(S.n * (0.25 + rng() * 0.35));
      if (S.x[j] < -1e3 || S.b[j] < 1) continue;
      if (S.x[j] < cx - 0.12 * R) return j;
    }
    return Math.floor(S.n * 0.4);
  }

  function choose(S, qx, qy, cx, cy, R) {
    const cand = [];
    for (let j = 0; j < S.n; j++) {
      if (S.b[j] < 2) continue;
      const dx = S.x[j] - qx, dy = S.y[j] - qy, d = Math.hypot(dx, dy) / R;
      const dc = Math.hypot(S.x[j] - cx, S.y[j] - cy) / R;
      if (d > 0.1 && d < 0.58 && dc > 0.16 && dc < 0.8) cand.push({ i: j, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const out = [];
    for (const c of cand) {
      if (out.length >= K) break;
      let ok = true;
      for (const o of out) if (Math.hypot(S.x[c.i] - S.x[o.i], S.y[c.i] - S.y[o.i]) < Math.max(46, 0.16 * R)) { ok = false; break; }
      if (ok && (out.length === 0 || c.d - out[out.length - 1].d > 0.05)) out.push(c);
    }
    let s = 0.91 + rng() * 0.04;
    for (const o of out) { o.score = s; s -= 0.03 + rng() * 0.03; }
    return out;
  }

  const seg = (a, b) => clamp((t - a) / (b - a));
  const ringR = () => 0.02 + ease3(seg(T_IN, T_SWEEP)) * 0.62; // R units

  return {
    spiralDim: 0,
    update(dt) {
      t += dt;
      if (t >= T_END) { t = 0; cycle++; newQuery(); }
      // Dim the spiral during the search so glints and planets read; restore at the end.
      const dim = t < T_IN ? seg(0.4, T_IN) : t > T_HOLD ? 1 - seg(T_HOLD, T_END) : 1;
      this.spiralDim = 0.42 * dim;
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const col = api.colors(), acc = api.accent();
      const hi = col[3], mid = col[2];
      const S = api.stars(6000);
      // Re-check while the camera may still be flying in, so the query lands left of the core.
      if (anchor < 0 || (t < 0.9 && S.x[anchor] > cx - 0.12 * R)) anchor = findAnchor(S, cx, cy, R);
      const fade = alpha * (t > T_HOLD ? 1 - seg(T_HOLD, T_END) : 1);

      // Query star: drifts in from outside, settles with a soft ring.
      const pin = ease3(seg(0, T_IN));
      const ax = S.x[anchor], ay = S.y[anchor];
      const qx = cx + qFrom.x * R + (ax - cx - qFrom.x * R) * pin;
      const qy = cy + qFrom.y * R + (ay - cy - qFrom.y * R) * pin;
      if (!picks && t >= T_IN) picks = choose(S, qx, qy, cx, cy, R);
      const qa = fade * Math.min(1, t / 0.6);
      api.dot(ctx, qx, qy, 2.6, hi, qa);
      api.ring(ctx, qx, qy, 6 + Math.sin(t * 2) * 0.8, hi, qa * 0.35, 1);

      // Radar sweep: an expanding hairline ring; stars it passes glint and fade.
      const rr = ringR();
      if (t > T_IN && t < T_SWEEP + 0.6) {
        const ra = fade * (1 - seg(T_SWEEP - 0.8, T_SWEEP + 0.6));
        api.ring(ctx, qx, qy, rr * R, mid, ra * 0.3, 0.8);
        api.ring(ctx, qx, qy, rr * R - 3, mid, ra * 0.07, 4);
        const w = 0.09;
        for (let j = 0; j < S.n; j++) {
          const sx = S.x[j], sy = S.y[j];
          if (sx < -1e3) continue;
          const d = Math.hypot(sx - qx, sy - qy) / R, lag = rr - d;
          if (lag < 0 || lag > w * 3) continue;
          const g = Math.exp(-lag / w) * ra;
          api.dot(ctx, sx, sy, 0.9 + g * 1.1, col[Math.min(3, S.b[j] + 1)], g * (0.55 + 0.15 * S.b[j]));
        }
      }
      if (!picks || !picks.length) return;

      // List slots beside the query (to its left).
      const rowH = Math.max(18, R * 0.06);
      if (!listAt && t > T_SWEEP) listAt = { x: Math.max(80, Math.min(qx - Math.max(110, R * 0.42), cx - R * 0.8)), y: qy };
      const lx = listAt ? listAt.x : 0, ly0 = (listAt ? listAt.y : 0) - rowH * (picks.length - 1) / 2;
      const rankP = ease3(seg(T_SWEEP + 0.3, T_RANK));

      picks.forEach((p, k) => {
        const sx = S.x[p.i], sy = S.y[p.i];
        if (sx < -1e3) return;
        // A match is found when the ring reaches it.
        const found = clamp((rr - p.d) / 0.05);
        if (found <= 0) return;
        const isBad = k === bad;
        const tick = T_RANK + 0.4 + k * 0.6;     // judge reaches this row
        const judged = seg(tick, tick + 0.35);
        const badHit = isBad ? judged : 0;
        const pa = fade * found;

        // Hairline from query to planet, with cosine score near the planet.
        const la = pa * (1 - 0.6 * badHit);
        api.line(ctx, qx, qy, sx, sy, isBad && badHit > 0 ? acc : hi, la * 0.28, 0.6);
        const ux = (sx - qx), uy = (sy - qy), ul = Math.hypot(ux, uy) || 1;
        api.text(ctx, p.score.toFixed(2), sx + ux / ul * 16, sy + uy / ul * 12 - 1, mid, la * 0.75);

        // Star swells into a planet with a small orbiting moon.
        const sw = ease3(found);
        const pr = 1.2 + sw * 2.6;
        api.dot(ctx, sx, sy, pr, isBad && badHit > 0 ? acc : hi, pa * (1 - 0.5 * badHit));
        api.ring(ctx, sx, sy, pr + 2.5, hi, pa * 0.18, 1);
        const ma = t * (1.1 + k * 0.17) + k * 1.3, mr = pr + 5.5;
        api.dot(ctx, sx + Math.cos(ma) * mr, sy + Math.sin(ma) * mr * 0.55, 1.0, mid, pa * 0.8);
        if (isBad && badHit > 0) api.ring(ctx, sx, sy, pr + 6 + badHit * 4, acc, pa * (1 - badHit) * 0.8, 1);

        // Ranked row: a copy of the planet travels into its slot beside the query.
        if (rankP > 0) {
          const rx = lx, ry = ly0 + k * rowH;
          const mx = sx + (rx - sx) * rankP, my = sy + (ry - sy) * rankP;
          const ra = fade * rankP;
          api.dot(ctx, mx, my, 2.2, isBad && badHit > 0 ? acc : hi, ra * (1 - 0.4 * badHit));
          const tx = rx - 26;
          api.text(ctx, String(k + 1), rx - 52, ry, mid, ra * 0.55 * rankP);
          api.text(ctx, p.score.toFixed(2), tx, ry, hi, ra * 0.85 * rankP);
          // Judge mark: a small tick, or an accent strike-through for the hallucination.
          if (judged > 0) {
            const kx = rx + 20;
            if (!isBad) {
              const e = ease3(judged);
              api.line(ctx, kx - 3, ry, kx - 3 + 2.5 * Math.min(1, e * 2), ry + 2.5 * Math.min(1, e * 2), hi, ra * 0.85, 1.1);
              if (e > 0.5) api.line(ctx, kx - 0.5, ry + 2.5, kx - 0.5 + 5 * (e - 0.5) * 2, ry + 2.5 - 6 * (e - 0.5) * 2, hi, ra * 0.85, 1.1);
            } else {
              const e = ease3(judged);
              api.line(ctx, rx - 60, ry, rx - 60 + (rx + 8 - (rx - 60)) * e, ry, acc, ra * 0.95, 1.2);
              if (e > 0.9) api.text(ctx, '×', kx, ry, acc, ra);
            }
          }
        }
      });

      // Small mono labels.
      const lab = fade * clamp((t - 0.6) / 0.8);
      api.text(ctx, 'query', qx, qy - 15, mid, lab * 0.7);
      if (rankP > 0.6) api.text(ctx, 'top-5', lx - 26, ly0 - rowH * 1.2, mid, fade * (rankP - 0.6) * 2.5 * 0.6);
      if (t > T_RANK + 0.2) {
        const ja = fade * seg(T_RANK + 0.2, T_RANK + 0.8);
        api.text(ctx, 'judge', lx + 20, ly0 - rowH * 1.2, mid, ja * 0.6);
        if (t > T_JUDGE - 0.6) api.text(ctx, 'hallucination caught', lx - 16, ly0 + rowH * picks.length + 2, acc, fade * seg(T_JUDGE - 0.6, T_JUDGE) * 0.85);
      }
    }
  };
};
