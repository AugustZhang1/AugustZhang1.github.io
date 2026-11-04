// In-galaxy animation for 'snake' (AI Snake Game). See anims/README.md for the API.
// The galaxy's stars leave their spiral and become a long, tapered ribbon. Three
// training games tell the story: a noisy rim crash, a steadier tail bite, then a
// clean hunt that holds its longest score before dissolving back into the field.
GALAXY_ANIMS['snake'] = function (api) {
  api.lightBoost();
  const { TAU, clamp, mix, rng } = api;
  const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const ease = x => { const u = clamp(x); return 1 - Math.pow(1 - u, 3); };
  const lerp = (a, b, t) => a + (b - a) * t;

  const GENS = [
    { game: 1, eps: 40, v: 0.235, turn: 1.7, noise: 1.45, smart: 0.08, life: 2.6, cap: 4, end: 'crash' },
    { game: 40, eps: 20, v: 0.27, turn: 2.8, noise: 0.48, smart: 0.58, life: 4.35, cap: 7, end: 'bite' },
    { game: 80, eps: 0, v: 0.34, turn: 4.8, noise: 0, smart: 1, life: 6.5, cap: 14, min: 11, end: 'win' }
  ];
  const MAXS = 2600, MAX_BODY = 190, GROUP = 11, LANES = 7;
  const LANE_OFF = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
  const TRAIL_MAX = 520, TRAIL_STEP = 0.018, VIS_STEP = 0.014;
  const FORM = 0.78, BOARD_FORM = 3.6, DISS = 1.45, GAP = 0.4, DIM = 0.94;
  const COLS = [0.13, 0.24, 0.42, 0.54], SIZES = [0.75, 0.9, 1.2, 1.55];

  const BOARD_COLS = 40, BOARD_ROWS = 22;
  const BOARD_BORDER = 2 * (BOARD_COLS + BOARD_ROWS) - 4;
  const BOARD_N = BOARD_BORDER + (BOARD_COLS - 1) * (BOARD_ROWS - 1);
  let view = null, vcx = 0, vcy = 0, vr = 1, T = 0, cycleT = 0, gi = -1, phase = 'board', pt = 0;
  let hx = 0, hy = 0, th = 0, trailN = 0, trailAcc = 0, wobble = 0;
  let bodyN = 0, logicalLen = 0, best = 0, bestFlash = 0, target = -1;
  let joinLive = 0;
  let labelText = '', labelLen = -1, labelBest = -1, labelGi = -1;
  let targetAge = 0, pulseT = -1, pullT = 0, pulseSlot = 0;
  let foodI = -1, foodK = 0, prevFoodI = -1, deathN = 0;
  const laneSrc = new Int16Array(MAX_BODY * LANES), laneJoin = new Float32Array(MAX_BODY * LANES);
  const laneFed = new Uint8Array(MAX_BODY * LANES);
  const deathX = new Float32Array(MAX_BODY * LANES), deathY = new Float32Array(MAX_BODY * LANES);
  const bodyMark = new Uint8Array(MAXS), foodMark = new Uint8Array(MAXS), boardMark = new Uint8Array(MAXS);
  const boardU = new Float32Array(BOARD_N), boardV = new Float32Array(BOARD_N), boardReady = new Uint8Array(BOARD_N);
  const boardPX = new Float32Array(BOARD_N), boardPY = new Float32Array(BOARD_N), boardPS = new Float32Array(BOARD_N), boardBucket = new Uint8Array(BOARD_N);
  const trailX = new Float32Array(TRAIL_MAX), trailY = new Float32Array(TRAIL_MAX);
  const resizeX = new Float32Array(TRAIL_MAX), resizeY = new Float32Array(TRAIL_MAX), resizeD = new Float32Array(TRAIL_MAX);
  const flashes = new Array(8); let flashN = 0;
  const pulseAges = new Float32Array(8), pulseDistances = new Float32Array(8);
  pulseAges.fill(-1);
  const paintX = new Float32Array(MAX_BODY * LANES), paintY = new Float32Array(MAX_BODY * LANES);
  const paintSize = new Float32Array(MAX_BODY * LANES), paintStyle = new Int8Array(MAX_BODY * LANES);
  const paintColors = new Array(8), paintAlpha = [0.22, 0.42, 0.68, 0.95];
  const laneHalf = new Float32Array(MAX_BODY), laneSlither = new Float32Array(MAX_BODY);
  const mapU = new Float32Array(MAXS), mapV = new Float32Array(MAXS), mapReady = new Uint8Array(MAXS);
  for (let i = 0; i < BOARD_N; i++) boardMark[i] = 1;
  let paletteDark = null, sourceCursor = 0;
  // The arena follows the real free stage. Bounds are normalized to the galaxy
  // radius so movement and drawing remain resolution independent.
  const arena = { l: -0.7, r: 0.7, t: -0.45, b: 0.45, w: 1.4, h: 0.9, hw: 0.7, hh: 0.45, stamp: '' };
  let stageStamp = '', layoutKey = '';
  const layout = { top: 96, bottom: 0, left: 34, right: 1000 };
  const layoutCrumbs = typeof document !== 'undefined' ? document.getElementById('crumbs') : null;
  const layoutDetail = typeof document !== 'undefined' ? document.getElementById('detail') : null;
  const layoutHeader = typeof document !== 'undefined' ? document.querySelector('.top') : null;
  const G = () => GENS[Math.max(0, gi)];
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sset(S, i) { return i >= 0 && i < S.n && S.x[i] > -1000; }
  function sx(S, i) { return (S.x[i] - vcx) / vr; }
  function sy(S, i) { return (S.y[i] - vcy) / vr; }
  function screenX(x) { return vcx + x * vr; }
  function screenY(y) { return vcy + y * vr; }
  function hash(n) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function updateArena(ctx) {
    const cw = ctx.canvas.clientWidth || ctx.canvas.width, ch = ctx.canvas.clientHeight || ctx.canvas.height;
    const mobile = cw <= 720;
    const crumbs = layoutCrumbs, detail = layoutDetail;
    const key = `${cw}|${ch}|${!!(crumbs && !crumbs.hidden)}|${!!(detail && detail.classList.contains('open'))}`;
    if (key !== layoutKey) {
      layoutKey = key;
      const cr = crumbs && !crumbs.hidden ? crumbs.getBoundingClientRect() : null;
      const dr = detail && detail.classList.contains('open') ? detail.getBoundingClientRect() : null;
      const hb = layoutHeader ? layoutHeader.getBoundingClientRect().bottom : 0;
      layout.top = Math.max(hb, cr ? cr.bottom : 0);
      layout.bottom = mobile ? Math.min(ch * 0.44, dr ? dr.top : ch * 0.44) : ch;
      layout.left = 0;
      layout.right = mobile ? cw : Math.min(cw, dr ? dr.left : cw);
    }
    const top = layout.top, bottom = layout.bottom, left = layout.left, right = layout.right;
    const sw = Math.max(80, right - left), sh = Math.max(60, bottom - top);
    // 74% of the usable stage leaves a quiet margin around the star board.
    const aw = sw * 0.74, ah = sh * 0.74;
    const stamp = `${cw}|${ch}|${Math.round(vcx)}|${Math.round(vcy)}|${Math.round(vr)}|${Math.round(aw)}|${Math.round(ah)}`;
    if (stamp === stageStamp) return;
    const old = { l: arena.l, r: arena.r, t: arena.t, b: arena.b };
    stageStamp = stamp;
    const ax = left + (sw - aw) * 0.5, ay = top + (sh - ah) * 0.5;
    arena.l = (ax - vcx) / vr; arena.r = (ax + aw - vcx) / vr;
    arena.t = (ay - vcy) / vr; arena.b = (ay + ah - vcy) / vr;
    arena.w = arena.r - arena.l; arena.h = arena.b - arena.t;
    arena.hw = arena.w * 0.5; arena.hh = arena.h * 0.5;
    arena.stamp = stamp;
    const sxr = (arena.r - arena.l) / Math.max(1e-6, old.r - old.l), syr = (arena.b - arena.t) / Math.max(1e-6, old.b - old.t);
    if (old.r !== old.l) {
      hx = arena.l + (hx - old.l) * sxr; hy = arena.t + (hy - old.t) * syr;
      const oldTrailN = trailN;
      for (let i = 0; i < oldTrailN; i++) { resizeX[i] = arena.l + (trailX[i] - old.l) * sxr; resizeY[i] = arena.t + (trailY[i] - old.t) * syr; }
      if (oldTrailN > 1) {
        resizeD[0] = Math.hypot(resizeX[0] - hx, resizeY[0] - hy);
        for (let i = 1; i < oldTrailN; i++) resizeD[i] = resizeD[i - 1] + Math.hypot(resizeX[i] - resizeX[i - 1], resizeY[i] - resizeY[i - 1]);
        const total = resizeD[oldTrailN - 1], newTrailN = Math.min(TRAIL_MAX, Math.max(1, Math.floor(total / TRAIL_STEP) + 1));
        for (let k = 0, j = 0; k < newTrailN; k++) { const d = k * TRAIL_STEP; while (j < oldTrailN - 2 && resizeD[j + 1] < d) j++; const span = Math.max(1e-6, resizeD[j + 1] - resizeD[j]), f = clamp((d - resizeD[j]) / span); trailX[k] = lerp(resizeX[j], resizeX[j + 1], f); trailY[k] = lerp(resizeY[j], resizeY[j + 1], f); }
        trailN = newTrailN;
      }
      trailX[0] = hx; trailY[0] = hy; trailAcc = 0;
      for (let i = 0; i < deathN * LANES; i++) { deathX[i] = arena.l + (deathX[i] - old.l) * sxr; deathY[i] = arena.t + (deathY[i] - old.t) * syr; }
      th = Math.atan2(Math.sin(th) * syr, Math.cos(th) * sxr);
      for (let i = 0; i < flashN; i++) { flashes[i].x = arena.l + (flashes[i].x - old.l) * sxr; flashes[i].y = arena.t + (flashes[i].y - old.t) * syr; }
    }
  }
  function mapPoint(i, out) {
    // Food targets fill the whole rectangle on a quiet, deterministic lattice.
    if (!mapReady[i]) {
      const cols = 31, rows = 19, q = i % (cols * rows), col = q % cols, row = Math.floor(q / cols);
      const x = -0.84 + 1.68 * col / (cols - 1), y = -0.84 + 1.68 * row / (rows - 1);
      mapU[i] = x; mapV[i] = y; mapReady[i] = 1;
    }
    out[0] = (arena.l + arena.r) * 0.5 + arena.hw * mapU[i];
    out[1] = (arena.t + arena.b) * 0.5 + arena.hh * mapV[i];
    return out;
  }
  function boardPoint(i, out) {
    if (!boardReady[i]) {
      const borderN = BOARD_BORDER;
      let x, y;
      if (i < borderN) {
        const topN = BOARD_COLS - 1, sideN = BOARD_ROWS - 1;
        if (i < topN) { x = -1 + 2 * i / topN; y = -1; }
        else if (i < topN + sideN) { x = 1; y = -1 + 2 * (i - topN) / sideN; }
        else if (i < topN * 2 + sideN) { x = 1 - 2 * (i - topN - sideN) / topN; y = 1; }
        else { x = -1; y = 1 - 2 * (i - topN * 2 - sideN) / sideN; }
      } else {
        const q = i - borderN, row = Math.floor(q / (BOARD_COLS - 1)), col = q % (BOARD_COLS - 1);
        x = -1 + 2 * (col + 1) / BOARD_COLS; y = -1 + 2 * (row + 1) / BOARD_ROWS;
      }
      boardU[i] = x; boardV[i] = y; boardReady[i] = 1;
    }
    out[0] = (arena.l + arena.r) * 0.5 + arena.hw * boardU[i];
    out[1] = (arena.t + arena.b) * 0.5 + arena.hh * boardV[i];
    return out;
  }
  const mapTmp = [0, 0];
  function mapX(i) { mapPoint(i, mapTmp); return mapTmp[0]; }
  function mapY(i) { mapPoint(i, mapTmp); return mapTmp[1]; }
  function insideArena(x, y, pad) {
    const px = arena.w * (pad || 0), py = arena.h * (pad || 0);
    return x > arena.l + px && x < arena.r - px && y > arena.t + py && y < arena.b - py;
  }
  function edgeHeading() {
    const dl = hx - arena.l, dr = arena.r - hx, dt = hy - arena.t, db = arena.b - hy;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return Math.PI;
    if (m === dr) return 0;
    if (m === dt) return -Math.PI * 0.5;
    return Math.PI * 0.5;
  }
  function boundPoint(x, y, out) {
    const pad = Math.max(0.012, 3 / Math.max(1, vr));
    out[0] = clamp(x, arena.l + pad, arena.r - pad);
    out[1] = clamp(y, arena.t + pad, arena.b - pad);
    return out;
  }
  const tmp = [0, 0], tmp2 = [0, 0], tmp3 = [0, 0];
  function at(d, out) {
    if (!trailN) { out[0] = hx; out[1] = hy; return; }
    if (d <= trailAcc) { const f = trailAcc > 0 ? d / trailAcc : 0; out[0] = lerp(hx, trailX[0], f); out[1] = lerp(hy, trailY[0], f); return; }
    const q = (d - trailAcc) / TRAIL_STEP, i = Math.floor(q), f = q - i;
    if (i >= trailN - 1) { out[0] = trailX[trailN - 1]; out[1] = trailY[trailN - 1]; return; }
    out[0] = lerp(trailX[i], trailX[i + 1], f); out[1] = lerp(trailY[i], trailY[i + 1], f);
  }
  function prepareLanes() {
    const den = Math.max(0.58, (bodyN - 1) * VIS_STEP);
    for (let k = 0; k < bodyN; k++) {
      const d = k * VIS_STEP, u = clamp(d / den);
      const head = Math.exp(-Math.pow((d - 0.045) / 0.035, 2));
      laneHalf[k] = (Math.max(0.027, 3.8 / vr) * Math.pow(1 - u, 0.8) + 0.012 * head) * (0.5 + 0.5 * smooth(d / 0.035));
      laneSlither[k] = 0.002 * Math.sin(d * 19 - T * 2.7) * (1 - u);
    }
  }
  function lanePoint(d, lane, out) {
    // Interleaved strands, rather than transverse rows: each point is a different star.
    const along = Math.max(0, d + ((lane * 3 % LANES) / LANES - 0.5) * VIS_STEP);
    at(Math.max(0, along), tmp2); at(along + 0.012, tmp);
    const tx = tmp[0] - tmp2[0], ty = tmp[1] - tmp2[1], tl = Math.hypot(tx, ty) || 1;
    const seg = Math.min(MAX_BODY - 1, Math.max(0, Math.round(d / VIS_STEP)));
    let half = laneHalf[seg], slither = laneSlither[seg];
    // The swallowed star travels continuously between the cached segments.
    if (Math.abs(d - seg * VIS_STEP) > 1e-6) {
      const u = clamp(d / Math.max(0.58, (bodyN - 1) * VIS_STEP));
      const head = Math.exp(-Math.pow((d - 0.045) / 0.035, 2));
      half = (Math.max(0.027, 3.8 / vr) * Math.pow(1 - u, 0.8) + 0.012 * head) * (0.5 + 0.5 * smooth(d / 0.035));
      slither = 0.002 * Math.sin(d * 19 - T * 2.7) * (1 - u);
    }
    const across = half * LANE_OFF[lane] + slither + 0.001 * Math.sin(d * 127 + lane * 2.4);
    out[0] = tmp2[0] - ty / tl * across;
    out[1] = tmp2[1] + tx / tl * across;
    boundPoint(out[0], out[1], out);
  }
  function used(i) { return i >= 0 && i < MAXS && (bodyMark[i] || foodMark[i] || boardMark[i]); }
  // Growth recruits from a rotating cursor; avoid a full pool search for every new star.
  function recruit(S) {
    for (let j = 0; j < S.n; j++) {
      const i = sourceCursor++ % S.n;
      if (!used(i) && sset(S, i)) { bodyMark[i] = 1; return i; }
    }
    return -1;
  }
  function addFlash(x, y, big) {
    if (flashN >= flashes.length) return;
    flashes[flashN++] = { x, y, t: 0, big: big ? 1 : 0 };
  }
  function fillFood(S) {
    if (foodI >= 0) foodMark[foodI] = 0;
    let picked = -1;
    for (let q = 0; q < 120; q++) {
      const i = (rng() * S.n) | 0;
      // Source stars can share a lattice cell; the next food must move cells too.
      if ((prevFoodI >= 0 && i % (31 * 19) === prevFoodI % (31 * 19)) || used(i) || !sset(S, i)) continue;
      const x = mapX(i), y = mapY(i);
      if (!insideArena(x, y, 0.08) || Math.hypot(x - hx, y - hy) < Math.min(arena.w, arena.h) * 0.13) continue;
      picked = i; break;
    }
    if (picked < 0) for (let i = BOARD_N + 1; i < S.n; i++) if ((prevFoodI < 0 || i % (31 * 19) !== prevFoodI % (31 * 19)) && !used(i) && sset(S, i) && insideArena(mapX(i), mapY(i), 0.08)) { picked = i; break; }
    foodI = picked; foodK = foodI >= 0 ? 1 : 0; prevFoodI = picked; if (foodI >= 0) foodMark[foodI] = 1;
  }
  function clearFood() { if (foodI >= 0) foodMark[foodI] = 0; foodI = -1; target = -1; }
  function spawn() {
    const S = api.stars(MAXS);
    gi++; phase = 'form'; pt = 0; cycleT = 0; logicalLen = 3; best = Math.max(best, logicalLen); bodyN = 0; deathN = 0;
    for (let i = 0; i < MAXS; i++) bodyMark[i] = 0;
    laneFed.fill(0);
    clearFood();
    const a = rng() * TAU;
    hx = lerp(arena.l + arena.w * 0.22, arena.r - arena.w * 0.22, rng());
    hy = lerp(arena.t + arena.h * 0.22, arena.b - arena.h * 0.22, rng());
    th = a; wobble = rng() * TAU;
    trailN = 180; trailAcc = 0;
    const rr = Math.min(arena.w, arena.h) * 0.22;
    for (let i = 0; i < trailN; i++) { const u = i / trailN; trailX[i] = hx - Math.cos(th) * rr * u; trailY[i] = hy - Math.sin(th) * rr * u; }
    bodyN = 45;
    sourceCursor = (rng() * S.n) | 0;
    for (let k = 0; k < bodyN; k++) for (let lane = 0; lane < LANES; lane++) { const q = k * LANES + lane; laneSrc[q] = recruit(S); laneJoin[q] = 0; }
    joinLive = bodyN * LANES;
    fillFood(S); pulseT = -1; pulseAges.fill(-1); pullT = 0;
  }
  function chooseTarget(S) {
    if (foodI < 0 || foodK < 0.45) { target = -1; return; }
    target = foodI; targetAge = 0;
  }
  function eat(S) {
    if (foodI < 0 || bodyN >= MAX_BODY - GROUP || logicalLen >= G().cap) return;
    const fi = foodI, ex = mapX(fi), ey = mapY(fi);
    pulseT = 0; pulseAges[pulseSlot++ % pulseAges.length] = 0; addFlash(ex, ey, false);
    // Extend at the tail. Existing stars keep their place on the path when length grows.
    bodyMark[fi] = 1; foodMark[fi] = 0;
    for (let k = bodyN; k < bodyN + GROUP; k++) for (let lane = 0; lane < LANES; lane++) {
      const q = k * LANES + lane;
      laneSrc[q] = k === bodyN && lane === 3 ? fi : recruit(S);
      laneFed[q] = k === bodyN && lane === 3 ? 1 : 0;
      laneJoin[q] = 0;
    }
    bodyN += GROUP; logicalLen++; best = Math.max(best, logicalLen);
    joinLive = bodyN * LANES;
    foodI = -1; target = -1; targetAge = 0; pullT = 0; fillFood(S);
  }
  function die(big) {
    prepareLanes();
    deathN = bodyN; for (let k = 0; k < deathN; k++) for (let lane = 0; lane < LANES; lane++) { lanePoint(k * VIS_STEP, lane, tmp3); const q = k * LANES + lane; deathX[q] = tmp3[0]; deathY[q] = tmp3[1]; }
    if (big) addFlash(hx, hy, true);
    best = Math.max(best, logicalLen); bestFlash = 1; phase = 'die'; pt = 0;
  }
  function move(S, h) {
    const g = G(); cycleT += h; targetAge += h;
    if (target < 0 || targetAge > (1.2 + 2.5 * g.smart)) chooseTarget(S);
    let desired = th, turn = g.turn, speed = g.v * clamp(Math.min(arena.w, arena.h) / 1.55, 0.72, 1.75), noise = g.noise;
    if (phase === 'end') {
      if (g.end === 'crash') { desired = edgeHeading(); speed *= 1.8; turn = 2.2; noise = 0; }
      else if (g.end === 'bite') { at(Math.max(0, (bodyN - LANES) * VIS_STEP), tmp3); desired = Math.atan2(tmp3[1] - hy, tmp3[0] - hx); turn = 5.4; noise = 0; }
      else { desired = th + 0.5; speed *= Math.max(0, 1 - pt / 0.45); turn = 1.2; noise = 0; }
    } else if (target >= 0) desired = Math.atan2(mapY(target) - hy, mapX(target) - hx);
    if (phase !== 'end' || g.end !== 'crash') {
      const margin = Math.min(arena.w, arena.h) * 0.075;
      const ex = Math.min(hx - arena.l, arena.r - hx), ey = Math.min(hy - arena.t, arena.b - hy);
      if (ex < margin || ey < margin) {
        let bx = 0, by = 0;
        if (hx - arena.l < margin) bx += 1;
        if (arena.r - hx < margin) bx -= 1;
        if (hy - arena.t < margin) by += 1;
        if (arena.b - hy < margin) by -= 1;
        const back = Math.atan2(by, bx), w = clamp(1 - Math.min(ex, ey) / margin);
        desired = Math.atan2(lerp(Math.sin(desired), Math.sin(back), w), lerp(Math.cos(desired), Math.cos(back), w));
      }
    }
    let d = desired - th; d = Math.atan2(Math.sin(d), Math.cos(d));
    th += clamp(d, -turn * h, turn * h) + noise * (Math.sin(T * 2.1 + wobble) + 0.5 * Math.sin(T * 3.7 + wobble * 1.7)) * h;
    hx += Math.cos(th) * speed * h; hy += Math.sin(th) * speed * h;
    const pad = Math.max(0.012, 3 / Math.max(1, vr));
    const hitX = hx < arena.l + pad || hx > arena.r - pad, hitY = hy < arena.t + pad || hy > arena.b - pad;
    if (hitX || hitY) {
      hx = clamp(hx, arena.l + pad, arena.r - pad); hy = clamp(hy, arena.t + pad, arena.b - pad);
      if (phase === 'end' && g.end === 'crash') { const leftHit = hx <= arena.l + pad, topHit = hy <= arena.t + pad; const bx = hitX ? (leftHit ? arena.l : arena.r) : hx, by = hitY ? (topHit ? arena.t : arena.b) : hy; addFlash(bx, by, true); die(false); }
    }
    trailAcc += speed * h;
    while (trailAcc >= TRAIL_STEP) { trailAcc -= TRAIL_STEP; for (let i = Math.min(trailN, TRAIL_MAX - 1); i > 0; i--) { trailX[i] = trailX[i - 1]; trailY[i] = trailY[i - 1]; } trailX[0] = hx; trailY[0] = hy; if (trailN < TRAIL_MAX) trailN++; }
    if (phase === 'run' && logicalLen < g.cap && target >= 0) {
      const capture = Math.hypot(mapX(target) - hx, mapY(target) - hy);
      if (pullT <= 0 && capture < Math.min(arena.w, arena.h) * 0.09) pullT = 0.001;
      if (pullT > 0) { pullT += h; if (pullT > 0.24) eat(S); }
    }
    if (phase === 'run' && cycleT > g.life && (g.end !== 'win' || logicalLen >= (g.min || 0))) { phase = 'end'; pt = 0; target = -1; pullT = 0; }
    if (phase !== 'end') return;
    if (g.end === 'bite') { at(Math.max(0, (bodyN - LANES) * VIS_STEP), tmp3); if (Math.hypot(hx - tmp3[0], hy - tmp3[1]) < 0.055) die(true); }
    else if (g.end === 'win') { best = Math.max(best, logicalLen); if (pt > 0.06 && pt - h <= 0.06) addFlash(hx, hy, true); if (pt > 2.7) die(false); }
  }

  const self = {
    spiralDim: 0, warm: false, quietChunks: true,   // chunk stars stay faint so the food is the only star that reads as food
    update(dt) {
      if (!view || self.warm) return;
      const S = api.stars(MAXS); let left = Math.min(dt, 1);
      while (left > 1e-6) {
        const h = Math.min(1 / 60, left); left -= h; T += h;
        for (let j = flashN - 1; j >= 0; j--) { flashes[j].t += h; if (flashes[j].t > 1.25) { flashes[j] = flashes[--flashN]; flashes[flashN] = null; } }
        if (pulseT >= 0) { pulseT += h; if (pulseT > 1.7) pulseT = -1; }
        for (let j = 0; j < pulseAges.length; j++) if (pulseAges[j] >= 0) { pulseAges[j] += h; if (pulseAges[j] > 1.7) pulseAges[j] = -1; }
        bestFlash = Math.max(0, bestFlash - h * 0.8);
        if (foodI >= 0) foodK = Math.min(1, foodK + h * 1.5);
        if (joinLive > 0) { let all = 1; for (let k = 0; k < joinLive; k++) { const v = Math.min(1, laneJoin[k] + h * 1.9); laneJoin[k] = v; if (v < 1) all = 0; } if (all) joinLive = 0; }
        pt += h;
        if (phase === 'board') { if (pt > BOARD_FORM) spawn(); }
        else if (phase === 'relax') { if (pt > 1.1) { phase = 'board'; pt = 0; } }
        else if (phase === 'wait') { if (pt > GAP) spawn(); }
        else if (phase === 'form') { move(S, h * smooth(pt / FORM)); if (pt > FORM) { phase = 'run'; pt = 0; cycleT = 0; } }
        else if (phase === 'run' || phase === 'end') move(S, h);
        else if (phase === 'die' && pt > DISS) {
          for (let k = 0; k < bodyN * LANES; k++) if (laneSrc[k] >= 0) bodyMark[laneSrc[k]] = 0;
          bodyN = 0; trailN = 0; phase = 'wait'; pt = 0;
          if (gi >= GENS.length - 1) { gi = -1; best = 0; phase = 'relax'; clearFood(); pt = 0; }
        }
      }
      const field = phase === 'board' ? smooth(pt / BOARD_FORM) : phase === 'relax' ? 1 - smooth(pt / 1.1) : 1;
      self.spiralDim = DIM * field;
    },
    draw(ctx, cx, cy, R, alpha) {
      vcx = cx; vcy = cy; vr = R; view = true; if (!(R > 0)) return;
      updateArena(ctx);
      const S = api.stars(MAXS), C = api.colors(), A = api.accent(), dark = api.dark();
      const X = screenX, Y = screenY;
      for (let i = 0; i < Math.min(BOARD_N, S.n); i++) boardMark[i] = 1;
      // Reduced motion invokes draw before update; construct a complete frozen win state.
      if (reducedMotion && !self.warm && gi < 0) {
        for (let k = 0; k < BOARD_FORM + 1; k += 0.5) self.update(0.5);
        while (phase === 'form') self.update(0.08);
        for (let i = 0; i < bodyN * LANES; i++) laneJoin[i] = 1;
        pulseT = -1; pulseAges.fill(-1); flashN = 0; self.spiralDim = DIM; self.warm = true;
      }
      if (alpha < 0.01) return;
      const vis = self.spiralDim / DIM, boardE = phase === 'board' ? smooth(pt / BOARD_FORM) : phase === 'relax' ? 1 - smooth(pt / 1.1) : 1;
      ctx.save(); ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      for (let b = 0; b < 4; b++) {
        const a = alpha * vis * (1 - boardE) * COLS[b] * (dark ? 0.18 : 0.22), r = SIZES[b]; ctx.fillStyle = api.rgba(C[b], a);
        if (a <= 0.001) continue;
        for (let i = b; i < S.n; i += (b < 2 ? 5 : 2)) {
          if (S.b[i] !== b || bodyMark[i] || foodMark[i] || boardMark[i] || !sset(S, i)) continue;
          const px = S.x[i], py = S.y[i];
          ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);
        }
      }
      for (let i = 0; i < Math.min(BOARD_N, S.n); i++) {
        if (!sset(S, i)) continue;
        boardPoint(i, mapTmp); const p = phase === 'board' ? ease(clamp(pt / BOARD_FORM * 1.4 - (i / BOARD_N) * 0.4)) : phase === 'relax' ? boardE : 1;
        const bx = screenX(mapTmp[0]), by = screenY(mapTmp[1]);
        const border = i < BOARD_BORDER; let ripple = 0;
        if (border && flashN) for (let j = 0; j < flashN; j++) { const f = flashes[j]; if (!f.big) continue; const e = clamp(f.t / 1.15), rr = 10 + 46 * e, d = Math.hypot(bx - X(f.x), by - Y(f.y)); ripple = Math.max(ripple, (1 - e) * Math.exp(-d * d / (rr * rr))); }
        boardPX[i] = lerp(S.x[i], bx, p); boardPY[i] = lerp(S.y[i], by, p); boardPS[i] = border ? 2.6 + ripple * 0.8 : 1.5;
        boardBucket[i] = border ? (p < 0.5 ? 1 : 2) : (p < 0.5 ? 3 : 4); if (ripple > 0.08) boardBucket[i] = 5;
      }
      for (let b = 1; b < 6; b++) { const col = b === 5 ? A : b < 3 ? C[2] : C[1], aa = b === 1 ? 0.18 : b === 2 ? 0.42 : b === 3 ? 0.05 : b === 4 ? 0.12 : 0.58; ctx.fillStyle = api.rgba(col, alpha * aa); for (let i = 0; i < Math.min(BOARD_N, S.n); i++) if (boardBucket[i] === b) { const ss = boardPS[i]; ctx.fillRect(boardPX[i] - ss * 0.5, boardPY[i] - ss * 0.5, ss, ss); } }
      if (foodI >= 0 && sset(S, foodI)) {
        const q = 0.82 + 0.18 * Math.sin(T * 2.2 + foodI), pulling = pullT > 0, pe = pulling ? ease(pullT / 0.24) : 0;
        mapPoint(foodI, mapTmp); const homeX = screenX(mapTmp[0]), homeY = screenY(mapTmp[1]);
        const fx = pulling ? lerp(homeX, screenX(hx), pe) : homeX, fy = pulling ? lerp(homeY, screenY(hy), pe) : homeY;
        api.dot(ctx, fx, fy, 9, A, alpha * foodK * q * 0.14); api.dot(ctx, fx, fy, 3.4, A, alpha * foodK * q); if (!pulling) api.ring(ctx, fx, fy, 8 + 2 * q, A, alpha * foodK * 0.45, 0.9);
      }
      for (let j = 0; j < flashN; j++) { const f = flashes[j], e = clamp(f.t / (f.big ? 1.15 : 0.72)); api.ring(ctx, X(f.x), Y(f.y), f.big ? 5 + 22 * e : 3 + 11 * e, A, alpha * (1 - e) * 0.8, f.big ? 1.25 : 1); api.dot(ctx, X(f.x), Y(f.y), f.big ? 2.8 : 2, A, alpha * (1 - e) * (1 - e)); }
      if (trailN > 4 && phase !== 'form' && phase !== 'die') for (let i = 4; i < trailN; i += 7) api.dot(ctx, X(trailX[i]), Y(trailY[i]), dark ? 0.8 : 0.95, C[1], alpha * 0.065 * (1 - i / trailN));
      const dying = phase === 'die', de = dying ? smooth((pt - 0.16) / (DISS - 0.16)) : 0;
      if (paletteDark !== dark) {
        paletteDark = dark;
        // Restrained silver in the dark, substantial ink in the light. One accent only.
        const bodyColor = dark ? mix(C[3], [225, 233, 229], 0.65) : mix(C[2], api.ink, 0.48);
        for (let b = 0; b < 4; b++) { paintColors[b] = bodyColor; paintColors[b + 4] = A; }
      }
      paintStyle.fill(-1, 0, bodyN * LANES);
      prepareLanes();
      for (let j = 0; j < pulseAges.length; j++) pulseDistances[j] = pulseAges[j] < 0 ? -10 : pulseAges[j] * Math.max(0.5, bodyN * VIS_STEP / 1.25);
      for (let k = bodyN - 1; k >= 0; k--) {
        const u = bodyN > 1 ? k / (bodyN - 1) : 0, taper = 1 - u;
        let pulse = 0;
        for (let j = 0; j < pulseDistances.length; j++) {
          const d = Math.abs(pulseDistances[j] - k * VIS_STEP);
          if (d < 0.15) pulse = Math.max(pulse, Math.exp(-d * d / 0.005625));
        }
        const finish = phase === 'end' && G().end === 'win' && Math.abs(u - clamp((pt - 0.35) / 1.35)) < 0.16;
        const base = Math.max(1.05, Math.min(1.85, vr * 0.0046)) * (0.76 + 0.24 * taper);
        const aaBase = (0.5 + 0.5 * Math.pow(taper, 0.4)) * (1 - 0.8 * de);
        for (let lane = 0; lane < LANES; lane++) {
          const q = k * LANES + lane, src = laneSrc[q]; if (src < 0) continue;
          lanePoint(k * VIS_STEP, lane, tmp3); let x = tmp3[0], y = tmp3[1];
          const homeX = sset(S, src) ? sx(S, src) : x, homeY = sset(S, src) ? sy(S, src) : y;
          const join = ease(laneJoin[q]); x = lerp(homeX, x, join); y = lerp(homeY, y, join);
          // The swallowed star follows the pulse to its new place, without jumping home.
          if (laneFed[q] && join < 1 && !dying) { lanePoint(k * VIS_STEP * join, lane, tmp3); x = tmp3[0]; y = tmp3[1]; }
          if (dying) { const df = smooth((pt - 0.16 - u * 0.25) / 1.03); x = lerp(deathX[q], homeX, df); y = lerp(deathY[q], homeY, df); }
          const edge = Math.abs(LANE_OFF[lane]);
          const aa = aaBase * (0.74 + 0.26 * (1 - edge)) * Math.max(0.2, join);
          paintStyle[q] = Math.min(3, Math.floor(aa * 4)) + (pulse > 0.22 || finish ? 4 : 0);
          paintX[q] = X(x); paintY[q] = Y(y);
          paintSize[q] = base * (0.78 + 0.34 * ((q * 37 % 19) / 18)) * (1 + pulse * 0.3);
          if (k === 3 && (lane === 1 || lane === 5)) { paintStyle[q] = 3; paintSize[q] *= 1.55; }
        }
      }
      // Eight batched inks; no gradients, per-star styles, temporary points, or paths.
      // Tiny squares keep their star texture on a phone instead of merging into beads.
      for (let b = 0; b < 8; b++) {
        ctx.fillStyle = api.rgba(paintColors[b], alpha * paintAlpha[b % 4]);
        for (let q = 0; q < bodyN * LANES; q++) if (paintStyle[q] === b) {
          const s = paintSize[q]; ctx.fillRect(paintX[q] - s * 0.5, paintY[q] - s * 0.5, s, s);
        }
      }
      if (gi >= 0) { if (logicalLen !== labelLen || best !== labelBest || gi !== labelGi) { labelLen = logicalLen; labelBest = best; labelGi = gi; labelText = `game ${G().game}   random ${G().eps}%   length ${logicalLen}   best ${best}`; } const cw = ctx.canvas.clientWidth || ctx.canvas.width, ch = ctx.canvas.clientHeight || ctx.canvas.height, floor = cw < 720 ? ch * 0.44 - 8 : ch - 24, ly = Math.min(screenY(arena.b) + 18, floor), lx = screenX((arena.l + arena.r) * 0.5); api.text(ctx, labelText, lx, ly, bestFlash > 0.25 ? A : C[2], alpha * 0.78 * vis); }
      ctx.restore();
    }
  };
  return self;
};
