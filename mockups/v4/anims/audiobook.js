// In-galaxy animation for 'audiobook' (AudiobookFree: PDF -> M4B, chapter detection, 28 Kokoro voices).
// The galaxy's own stars gather into an open book. Lines of text peel off one by one, stream through
// a ring of 28 voice stars at the centre, and re-form as a flowing waveform ribbon that drifts right
// and fades back into the galaxy. Chapter headings pass as a beacon; empty spreads turn the page.
GALAXY_ANIMS['audiobook'] = function (api) {
  const { TAU, clamp, mix, ease3 } = api;

  // Layout in units of S (set per frame from R and the free area). Origin = free-area centre.
  const BOOKX = -0.6, PW = 0.27, PH = 0.4, GAP = 0.012;   // book centre x, page width/height, spine gap
  const RR = 0.1;                                          // voice ring radius
  const WAVE_END = 0.92;                                   // waveform travels to here then fades
  const NL = 9, NLINES = NL * 2, MAXD = 14;                // lines per page, per spread, dots per line
  const STAG = 0.075, EVERY = 1.25, DA = 1.5, V = 0.2;     // dot stagger, line interval, flight, wave speed (S/s)
  const GATHER = 1.8, TURN = 1.6;
  const SPREAD = GATHER + NLINES * EVERY + DA + TURN;      // seconds per page spread
  const VOICES = ['af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole',
    'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
    'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
    'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'];
  const VOICE_EVERY = 7;

  const spine = BOOKX;
  const pageL = spine - GAP / 2 - PW, pageR = spine + GAP / 2;   // left x of each page
  // Open-book curve: edges dip slightly toward the spine.
  const curve = x => 0.018 * Math.pow(1 - Math.min(1, Math.abs(x - spine) / (PW + GAP)), 2);

  // Page outline stars (left page then right page), in S units.
  const outline = [];
  for (let p = 0; p < 2; p++) {
    const x0 = p ? pageR : pageL, x1 = x0 + PW, step = 0.017;
    const nx = Math.round(PW / step), ny = Math.round(PH / step);
    for (let i = 0; i <= nx; i++) {
      const x = x0 + PW * i / nx;
      outline.push({ p, x, y: -PH / 2 + curve(x) }, { p, x, y: PH / 2 + curve(x) });
    }
    for (let i = 1; i < ny; i++) {
      const y = -PH / 2 + PH * i / ny;
      outline.push({ p, x: p ? x1 : x0, y: y + curve(p ? x1 : x0) });
      if (!p) outline.push({ p: 2, x: x1, y: y + curve(x1) });   // spine edge (static)
    }
  }

  // Seeded per-spread text layout, cached.
  const hash = n => { let t = (n * 2654435761 + 1013904223) >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const isHead = g => g % 9 === 4;
  const chapterOf = g => 3 + Math.floor((g - 4) / 9);
  const layouts = new Map();
  function layout(s) {
    if (layouts.has(s)) return layouts.get(s);
    const r = hash(s + 17), lines = [];
    const lineH = (PH - 0.08) / (NL - 1), cell = (PW - 0.05) / (MAXD - 1);
    for (let k = 0; k < NLINES; k++) {
      const g = s * NLINES + k, p = k < NL ? 0 : 1, row = k % NL;
      const x0 = (p ? pageR : pageL) + 0.025, y = -PH / 2 + 0.04 + row * lineH;
      const dots = [];
      if (isHead(g)) {
        const n = 5, start = Math.floor((MAXD - n) / 2);
        for (let i = 0; i < n; i++) dots.push({ x: x0 + (start + i) * cell, amp: 1, head: true });
      } else {
        // Words of 2..5 dots separated by one empty cell; last line of a paragraph is shorter.
        const len = (row === NL - 1 || isHead(g + 1)) ? 6 + Math.floor(r() * 4) : MAXD;
        let c = 0;
        while (c < len) {
          const w = Math.min(len - c, 2 + Math.floor(r() * 4));
          for (let i = 0; i < w; i++) dots.push({ x: x0 + (c + i) * cell, amp: (0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / w)) * (0.65 + 0.35 * r()) });
          c += w + 1;
        }
      }
      dots.forEach(d => { d.y = y + curve(d.x); });
      lines.push({ g, dots, head: isHead(g) });
    }
    layouts.set(s, lines);
    if (layouts.size > 4) layouts.delete(layouts.keys().next().value);
    return lines;
  }

  // Star roles -> index into api.stars(): outline, ring, then two alternating sets of line slots.
  const OUT0 = 0, RING0 = outline.length, LINE0 = RING0 + 28;
  const slot = (set, k, j) => LINE0 + (set * NLINES + k) * MAXD + j;
  let perm = null, pn = 0;
  function ensurePerm(n) {
    if (perm && pn === n) return;
    pn = n; perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    const r = hash(4242);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  }

  let T = 0;
  const T0 = 0.6;   // first spread starts here
  const out = {
    spiralDim: 0,
    update(dt) {
      T += dt;
      out.spiralDim = 0.93 * ease3(clamp(T / 2.5));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const cw = ctx.canvas.clientWidth || ctx.canvas.width;
      const half = cw > 720 ? (cw - 400) / 2 : cw / 2;
      const S = Math.min(R * 1.5, half * 0.97);
      const st = api.stars(1500);
      if (!st.n) return;
      ensurePerm(st.n);
      const C = api.colors(), ACC = api.accent(), dark = api.dark();
      const rd = Math.max(1, S * 0.0042);
      const F = ease3(clamp(T / 2.5));

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // Draw a role star at target (tx,ty) in S units, blended from its live galaxy position by f.
      const put = (role, tx, ty, f, rgb, a, r = rd) => {
        if (a < 0.01) return;
        const si = perm[role % pn];
        let lx = st.x[si], ly = st.y[si];
        const X = cx + tx * S, Y = cy + ty * S;
        if (lx < -5000) { lx = X; ly = Y; }
        const x = lx + (X - lx) * f, y = ly + (Y - ly) * f;
        api.dot(ctx, x, y, r * (0.7 + 0.3 * f), rgb, alpha * a * (0.25 + 0.75 * f));
      };

      // Spread timing.
      const tt = T - T0;
      const sNow = Math.max(0, Math.floor(tt / SPREAD));
      const Ts = s => T0 + s * SPREAD;
      const lineT0 = (s, k) => Ts(s) + GATHER + k * EVERY;
      const turnStart = s => Ts(s) + GATHER + NLINES * EVERY + DA - 0.4;
      const uTurn = clamp((T - turnStart(sNow)) / TURN);

      // Book outline. Right page leaf flips over the spine during a page turn.
      const colO = C[1];
      outline.forEach((o, i) => {
        if (o.p === 1 && uTurn > 0 && uTurn < 1) {
          const u = ease3(uTurn), cs = Math.cos(Math.PI * u);
          const x = spine + (o.x - spine) * cs;
          const y = o.y - Math.sin(Math.PI * u) * (0.05 + 0.04 * Math.abs(o.x - spine) / PW) + (curve(x) - curve(o.x));
          put(OUT0 + i, x, y, F, colO, 0.6 * (uTurn > 0.85 ? (1 - uTurn) / 0.15 : 1));
          // the next page underneath fades in
          put(OUT0 + i, o.x, o.y, F, colO, 0.6 * clamp((uTurn - 0.4) / 0.6));
        } else put(OUT0 + i, o.x, o.y, F, colO, 0.6);
      });

      // Voice ring.
      const vi = Math.floor(T / VOICE_EVERY) % 28, vt = (T % VOICE_EVERY);
      const flash = clamp(1 - vt / 1.2);
      for (let i = 0; i < 28; i++) {
        const th = -Math.PI / 2 + i / 28 * TAU, on = i === vi;
        const f = ease3(clamp((T - 0.4 - i * 0.03) / 2));
        const col = on ? mix(C[3], ACC, flash * 0.8) : C[2];
        put(RING0 + i, Math.cos(th) * RR, Math.sin(th) * RR, f, col, on ? 1 : 0.75, on ? rd * 2 : rd * 1.1);
      }
      if (F > 0.5) {
        const th = -Math.PI / 2 + vi / 28 * TAU;
        api.ring(ctx, cx + Math.cos(th) * RR * S, cy + Math.sin(th) * RR * S, rd * 4.5, C[3], alpha * (0.25 + 0.5 * flash) * F, 1);
        api.text(ctx, VOICES[vi], cx, cy + (RR + 0.06) * S, C[2], alpha * 0.55 * F);
        api.text(ctx, String(vi + 1).padStart(2, '0') + ' / 28', cx, cy - (RR + 0.06) * S, C[1], alpha * 0.4 * F);
      }

      // Lines of text: on the page, peeling off, streaming through the ring, then waveform.
      const xE = -RR * 1.8;            // where the stream straightens toward the ring centre
      const tE = (-xE) / V;            // seconds from xE to the centre
      const tWave = WAVE_END / V;      // seconds from centre to end of ribbon
      const ampMax = 0.09;
      const beacons = [];
      for (let s = Math.max(0, sNow - 1); s <= sNow; s++) {
        if (T < Ts(s)) continue;
        const L = layout(s), set = s % 2;
        for (let k = 0; k < NLINES; k++) {
          const line = L[k], t0 = lineT0(s, k);
          const colT = line.head ? C[3] : C[2];
          line.dots.forEach((d, j) => {
            const role = slot(set, k, j);
            const td = t0 + j * STAG;           // this dot leaves the page
            if (T < td) {
              if (s < sNow) return;
              const g = ease3(clamp((T - Ts(s) - 0.15 - k * 0.06 - j * 0.01) / 1.3));
              // a gentle lift as the line is about to peel
              const lift = clamp(1 - (td - T) / 0.4) * 0.012;
              put(role, d.x, d.y - lift, g, colT, line.head ? 0.95 : 0.8);
              return;
            }
            const ta = T - td;
            if (ta < DA) {
              // cubic bezier from page dot to the stream entry, ending horizontal
              const u = ta / DA, e = 2 * u * u - u * u * u;   // starts still, ends moving at stream speed
              const p0x = d.x, p0y = d.y, p3x = xE, p3y = 0;
              const p1x = p0x + 0.06, p1y = p0y - 0.05;
              const p2x = p3x - V * DA / 3, p2y = 0;   // matches stream speed at the joint
              const m = 1 - e;
              const x = m * m * m * p0x + 3 * m * m * e * p1x + 3 * m * e * e * p2x + e * e * e * p3x;
              const y = m * m * m * p0y + 3 * m * m * e * p1y + 3 * m * e * e * p2y + e * e * e * p3y;
              put(role, x, y, 1, colT, line.head ? 1 : 0.85);
              return;
            }
            const tc = T - td - DA - tE;        // time since passing the ring centre
            const px = tc < 0 ? xE + (ta - DA) * V : tc * V;
            if (px > WAVE_END) return;
            // waveform: amplitude opens up after the ring, alternating above/below the axis
            const open = ease3(clamp((px - RR * 0.6) / 0.16));
            const sign = (j % 2) ? 1 : -1;
            const flow = Math.sin(px * 7 - T * 1.6) * 0.022 * open;
            const y = flow + sign * d.amp * ampMax * open * (0.85 + 0.15 * Math.sin(T * 3 + j));
            const fade = clamp((WAVE_END - px) / 0.3);
            const inRing = clamp(1 - Math.abs(px) / (RR * 0.9));
            const col = mix(mix(colT, C[3], 0.5 * open), ACC, line.head ? 0.0 : 0.25 * inRing);
            put(role, px, y, 1, col, (line.head ? 1 : 0.9) * fade, rd * (1 + 0.4 * inRing));
            if (line.head && j === 0 && tc > 0) beacons.push({ px, y: flow, fade, ch: chapterOf(line.g) });
          });
        }
      }

      // Chapter beacons: an accent star in the ribbon with a tiny label.
      beacons.forEach(b => {
        const X = cx + b.px * S, Y = cy + b.y * S;
        api.dot(ctx, X, Y, rd * 2.4, ACC, alpha * b.fade);
        api.ring(ctx, X, Y, rd * 6, ACC, alpha * 0.35 * b.fade, 1);
        api.line(ctx, X, Y - ampMax * S * 1.3, X, Y + ampMax * S * 1.3, ACC, alpha * 0.25 * b.fade, 1);
        api.text(ctx, 'ch ' + b.ch, X, Y - ampMax * S * 1.3 - 10, dark ? C[3] : ACC, alpha * 0.8 * b.fade);
      });

      ctx.restore();
    }
  };
  return out;
};
