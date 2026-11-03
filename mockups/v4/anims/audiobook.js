// In-galaxy animation for 'audiobook' (AudiobookFree: PDF -> M4B, chapter detection, 28 Kokoro voices).
// The galaxy's own stars gather into an open book with a ring of 28 voice stars at the core. A voice is
// picked, then the lines of text peel off the pages one by one, stream through the ring and come out as
// a sound wave: each dot of text becomes a mirrored bar of stars. Chapter headings pass as accent
// beacons. When the book is read, every borrowed star drifts back into the spiral and the loop repeats.
GALAXY_ANIMS['audiobook'] = function (api) {
  const { TAU, clamp, mix } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };

  // Layout in units of S (set per frame from R and the free area). Origin = galaxy core.
  const SPINE = -0.56, PW = 0.27, PH = 0.36, GAP = 0.014;  // book spine x, page size, spine gap
  const RR = 0.13;                                          // voice ring radius
  const WAVE_END = 0.9;                                     // the sound wave fades out here
  const NL = 6, NLINES = NL * 2, MAXD = 13, HMAX = 5, SUB = 1 + 2 * HMAX;        // lines per page, lines, dots per line, stars per bar
  const STAG = 0.075, EVERY = 1.0, DA = 1.4, V = 0.15;      // dot stagger, line interval, flight, stream speed (S/s)
  const BAR = 0.016;                                        // vertical spacing of stars in a bar
  // Timeline (seconds).
  const G0 = 0.2, G1 = 2.6;           // gather out of the spiral
  const VS0 = 1.4, VS1 = 3.4;         // voice selector spins and lands
  const P0 = 3.0;                     // first line peels
  const R0 = 20.4, R1 = 23.2;         // relax back into the spiral
  const LOOP = 24;
  const VOICES = ['af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole',
    'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
    'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
    'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'];

  const pageL = SPINE - GAP / 2 - PW, pageR = SPINE + GAP / 2;
  // Open-book curve: the pages bow slightly down toward the spine.
  const curve = x => 0.02 * Math.pow(1 - Math.min(1, Math.abs(x - SPINE) / (PW + GAP)), 2);

  // Page outline stars, in S units.
  const outline = [];
  for (let p = 0; p < 2; p++) {
    const x0 = p ? pageR : pageL, x1 = x0 + PW, step = 0.016;
    const nx = Math.round(PW / step), ny = Math.round(PH / step);
    for (let i = 0; i <= nx; i++) {
      const x = x0 + PW * i / nx;
      outline.push({ x, y: -PH / 2 + curve(x) }, { x, y: PH / 2 + curve(x) });
    }
    for (let i = 1; i < ny; i++) {
      const y = -PH / 2 + PH * i / ny;
      outline.push({ x: x0, y: y + curve(x0) }, { x: x1, y: y + curve(x1) });
    }
  }

  // Seeded text layout: two chapter headings (short, centred), the rest words of 2..5 dots.
  const hash = n => { let t = (n * 2654435761 + 1013904223) >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const HEADS = { 0: 1, 8: 2 };   // line index -> chapter number
  const r = hash(17), lines = [];
  const lineH = (PH - 0.07) / (NL - 1), cell = (PW - 0.05) / (MAXD - 1);
  for (let k = 0; k < NLINES; k++) {
    const p = k < NL ? 0 : 1, row = k % NL;
    const x0 = (p ? pageR : pageL) + 0.025, y = -PH / 2 + 0.035 + row * lineH;
    const dots = [], head = HEADS[k] || 0;
    if (head) {
      const n = 5, start = Math.floor((MAXD - n) / 2);
      for (let i = 0; i < n; i++) dots.push({ c: start + i, amp: 1 });
    } else {
      const len = (row === NL - 1 || HEADS[k + 1]) ? 6 + Math.floor(r() * 4) : MAXD;
      let c = 0;
      while (c < len) {
        const w = Math.min(len - c, 2 + Math.floor(r() * 4)), pk = 0.35 + 0.65 * r();
        for (let i = 0; i < w; i++) dots.push({ c: c + i, amp: pk * (0.25 + 0.75 * Math.sin(Math.PI * (i + 0.5) / w)) * (0.8 + 0.2 * r()) });
        c += w + 1;
      }
    }
    dots.forEach(d => { d.x = x0 + d.c * cell; d.y = y + curve(d.x); d.h = Math.min(HMAX, Math.round(d.amp * HMAX)); });
    lines.push({ dots, head });
  }

  // Star roles -> index into api.stars(): outline, ring, then SUB stars per text dot.
  const RING0 = outline.length, LINE0 = RING0 + 28;
  const NROLE = LINE0 + NLINES * MAXD * SUB;
  const role = (k, j, s) => LINE0 + (k * MAXD + j) * SUB + s;
  const lag = new Float32Array(NROLE);          // per-role stagger for gather and release
  { const h = hash(99); for (let i = 0; i < NROLE; i++) lag[i] = h(); }
  let perm = null, pn = 0;
  function ensurePerm(n) {
    if (perm && pn === n) return;
    pn = n; perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    const h = hash(4242);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(h() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  }

  // Line timing.
  const xE = -RR * 1.7;                 // the stream straightens here, heading for the ring centre
  const tE = -xE / V;                   // seconds from xE to the centre
  const lineT0 = k => P0 + k * EVERY;
  const crossT = (k, c) => lineT0(k) + c * STAG + DA + tE;   // dot reaches the ring centre

  let T = 0, loopN = 0, spiralDim = 0;
  const out = {
    get spiralDim() { return spiralDim; },
    update(dt) {
      T += Math.min(dt, 0.7);
      if (T >= LOOP) { T -= LOOP; loopN++; }
      spiralDim = 0.94 * Math.min(smooth((T - G0) / 1.6), 1 - smooth((T - R0 - 0.8) / 2.0));
    },
    draw(ctx, cx, cy, R, alpha) {
      if (alpha < 0.01) return;
      const cw = ctx.canvas.clientWidth || ctx.canvas.width;
      const half = cw > 720 ? (cw - 400) / 2 : cw / 2;
      const S = Math.min(R * 1.5, half * 0.97);
      const st = api.stars(2000);
      if (!st.n || !(S > 0)) return;
      ensurePerm(st.n);
      const C = api.colors(), ACC = api.accent(), dark = api.dark();
      const rd = Math.max(1.2, S * 0.0042) * (dark ? 1 : 1.1);
      const A = alpha * (dark ? 1 : 1.15);
      const gin = i => smooth((T - G0 - lag[i] * 0.9) / (G1 - G0 - 0.9));
      const gout = i => 1 - smooth((T - R0 - lag[i] * 0.9) / (R1 - R0 - 0.9));
      const env = i => Math.min(gin(i), gout(i));

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // Draw role star at target (tx,ty) in S units, travelling from its live galaxy position by f.
      const put = (ro, tx, ty, f, rgb, a, rr = rd) => {
        if (a < 0.01 || f <= 0.002) return;
        const si = perm[ro % pn];
        let lx = st.x[si], ly = st.y[si];
        const X = cx + tx * S, Y = cy + ty * S;
        if (lx < -5000) { lx = X; ly = Y; }
        const x = lx + (X - lx) * f, y = ly + (Y - ly) * f;
        api.dot(ctx, x, y, rr * (0.6 + 0.4 * f), rgb, A * a * Math.min(1, f * 2.5));
      };

      // Book outline.
      outline.forEach((o, i) => put(i, o.x, o.y, env(i), C[1], 0.7));

      // Voice ring: a selector spins and lands on this loop's voice, which then pulses as text passes.
      const vSel = (loopN * 11) % 28;
      const spin = smooth((T - VS0) / (VS1 - VS0));
      const vNow = ((vSel - Math.round((1 - spin) * 34)) % 28 + 28) % 28;
      let pulse = 0, chap = 0;
      for (let k = 0; k < NLINES; k++) {
        const ds = lines[k].dots, a0 = crossT(k, ds[0].c) - 0.15, a1 = crossT(k, ds[ds.length - 1].c) + 0.15;
        const p = T < a0 ? smooth(1 - (a0 - T) / 0.3) : T > a1 ? smooth(1 - (T - a1) / 0.5) : 1;
        if (p > pulse) pulse = p;
        if (lines[k].head) { const c = clamp(1 - Math.abs(T - (a0 + a1) / 2) / 1.0); if (c > chap) chap = c; }
      }
      const ringF = i => env(RING0 + i);
      for (let i = 0; i < 28; i++) {
        const th = -Math.PI / 2 + i / 28 * TAU, on = i === vNow && T > VS0 - 0.2;
        const col = on ? (T < VS1 ? C[3] : mix(C[3], ACC, 0.55 + 0.45 * Math.max(pulse, chap))) : C[2];
        put(RING0 + i, Math.cos(th) * RR, Math.sin(th) * RR, ringF(i), col, on ? 1 : 0.7, on ? rd * (1.9 + 0.5 * pulse) : rd * 1.1);
      }
      const lab = Math.min(smooth((T - VS0) / 0.8), 1 - smooth((T - R0) / 1.2));
      if (lab > 0.01) {
        const th = -Math.PI / 2 + vNow / 28 * TAU;
        const hx = cx + Math.cos(th) * RR * S, hy = cy + Math.sin(th) * RR * S;
        api.ring(ctx, hx, hy, rd * (4.5 + 2 * pulse), T < VS1 ? C[3] : ACC, A * lab * (0.3 + 0.4 * pulse), 1);
        if (chap > 0.01) api.ring(ctx, cx, cy, RR * S * (1.12 + 0.25 * (1 - chap)), ACC, A * 0.45 * chap * lab, 1);
        api.text(ctx, VOICES[vNow], cx, cy + (RR + 0.05) * S, C[3], A * 0.8 * lab);
        api.text(ctx, 'voice ' + String(vNow + 1).padStart(2, '0') + ' / 28', cx, cy - (RR + 0.05) * S, C[2], A * 0.6 * lab);
      }

      // Text: on the page, peeling off, streaming through the ring, then opening into bars.
      const beacons = [];
      for (let k = 0; k < NLINES; k++) {
        const line = lines[k], t0 = lineT0(k), head = line.head;
        const colT = head ? C[3] : C[2];
        line.dots.forEach((d, j) => {
          const td = t0 + d.c * STAG;          // this dot leaves the page
          const r0 = role(k, j, 0), e = env(r0);
          if (T < td) {
            const lift = smooth(1 - (td - T) / 0.4) * 0.014;
            put(r0, d.x, d.y - lift, e, colT, head ? 1 : 0.85, head ? rd * 1.25 : rd);
            return;
          }
          const ta = T - td;
          if (ta < DA) {
            // cubic bezier from the page to the stream entry, ending level at stream speed
            const u = ta / DA, w = 2 * u * u - u * u * u, m = 1 - w;
            const p1x = d.x + 0.05, p1y = d.y - 0.07, p2x = xE - V * DA / 3;
            const x = m * m * m * d.x + 3 * m * m * w * p1x + 3 * m * w * w * p2x + w * w * w * xE;
            const y = m * m * m * d.y + 3 * m * m * w * p1y;
            put(r0, x, y, e, colT, head ? 1 : 0.9, head ? rd * 1.25 : rd);
            return;
          }
          const px = xE + (ta - DA) * V;      // along the stream; 0 is the ring centre
          if (px > WAVE_END) return;
          const open = smooth((px - RR * 0.4) / 0.14);
          const fade = clamp((WAVE_END - px) / 0.25);
          const inRing = clamp(1 - Math.abs(px) / (RR * 0.9));
          const breathe = 0.8 + 0.2 * Math.sin(T * 4.2 + d.c * 1.7 + k);
          const flow = Math.sin(px * 6 - T * 1.4) * 0.012 * open;
          if (head) {
            // a chapter heading passes as an accent beacon in the wave
            const col = mix(C[3], ACC, Math.max(inRing, open));
            put(r0, px, flow, e, col, fade, rd * (1.3 + 0.3 * open));
            if (j === 2 && open > 0.05) beacons.push({ px, y: flow, a: fade * open * e, ch: head });
            return;
          }
          const col = mix(colT, C[3], 0.35 * open + 0.4 * inRing);
          const hgt = d.h * open * breathe;
          for (let s = 0; s < SUB; s++) {
            const lvl = s === 0 ? 0 : Math.ceil(s / 2), sg = s % 2 ? -1 : 1;
            if (lvl > d.h) break;
            const vis = s === 0 ? 1 : clamp(hgt - lvl + 1);
            if (vis <= 0.01) continue;
            const ro = role(k, j, s);
            // bar stars split out of the line dot as the wave opens
            const y = flow + sg * Math.min(lvl, hgt) * BAR;
            put(ro, px, y, s === 0 ? e : Math.min(e, env(ro)), col, fade * (s === 0 ? 0.95 : 0.85 * vis) * (1 - 0.3 * lvl / HMAX), rd * (1 + 0.25 * inRing));
          }
        });
      }

      // Chapter beacons: a tall accent marker in the wave with a small label.
      beacons.forEach(b => {
        const X = cx + b.px * S, Y = cy + b.y * S, hgt = BAR * (HMAX + 1.5) * S;
        api.line(ctx, X, Y - hgt, X, Y + hgt, ACC, A * 0.55 * b.a, 1.2);
        api.ring(ctx, X, Y, rd * 4, ACC, A * 0.5 * b.a, 1);
        api.text(ctx, 'ch ' + b.ch, X, Y - hgt - 10, dark ? C[3] : ACC, A * 0.85 * b.a);
      });

      ctx.restore();
    }
  };
  return out;
};
