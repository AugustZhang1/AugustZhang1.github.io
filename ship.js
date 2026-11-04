// The search-tour ship: one sculpted needle hull, drawn with raw WebGL into a small
// offscreen canvas that the main 2D canvas copies each frame. A lofted surface with
// smooth normals gives the continuous skin: ceramic above the chine, heat shield below.
// Returns null when WebGL is missing; the caller draws a flat silhouette instead.
window.createShip = function () {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;

  // Hull profile along its length (t = 0 at the nose, 1 at the tail): half width,
  // height above the chine, depth below it.
  const KEYS = [
    [0.00, 0.000, 0.000, 0.000], [0.06, 0.040, 0.024, 0.020], [0.25, 0.086, 0.052, 0.040],
    [0.48, 0.126, 0.080, 0.056], [0.64, 0.156, 0.128, 0.062], [0.80, 0.196, 0.100, 0.064],
    [0.93, 0.232, 0.066, 0.052], [1.00, 0.206, 0.050, 0.044]
  ];
  const profile = t => {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
    const u = (t - k1[0]) / (k2[0] - k1[0]), out = [0, 0, 0];
    for (let c = 1; c <= 3; c++) {   // Catmull-Rom keeps the skin free of creases
      const a = k0[c], b = k1[c], d = k2[c], e = k3[c];
      out[c - 1] = Math.max(0, 0.5 * (2 * b + (d - a) * u + (2 * a - 5 * b + 4 * d - e) * u * u + (3 * b - a - 3 * d + e) * u * u * u));
    }
    return out;
  };

  const RINGS = 72, SEG = 40, CAP = 4;
  const point = (t, th) => {
    const [w, up, down] = profile(t), s = Math.sin(th), c = Math.cos(th);
    const y = (s >= 0 ? up : down) * Math.sign(s) * Math.pow(Math.abs(s), 1.25);   // sharp chine
    return [1 - 2 * Math.pow(t, 1.08), y, w * c];
  };
  const rows = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = Math.pow(r / RINGS, 1.5), row = [];   // denser rings at the fine nose
    for (let s = 0; s <= SEG; s++) row.push(point(Math.max(t, 1e-4), s / SEG * Math.PI * 2));
    rows.push(row);
  }
  const verts = [], index = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let r = 0; r <= RINGS; r++) for (let s = 0; s <= SEG; s++) {
    const p = rows[r][s], th = s / SEG * Math.PI * 2;
    const along = sub(rows[Math.min(RINGS, r + 1)][s], rows[Math.max(0, r - 1)][s]);
    const round = sub(rows[r][(s + 1) % SEG], rows[r][(s + SEG - 1) % SEG]);
    let n = crossV(along, round);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const outward = n[1] * p[1] + n[2] * p[2];
    if (outward < 0) n = [-n[0], -n[1], -n[2]];
    verts.push(p[0], p[1], p[2], n[0], n[1], n[2], Math.sin(th), 0);
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = r * (SEG + 1) + s, b = a + SEG + 1;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // Tail: a recessed nozzle, rings stepping inward and forward to a hot centre.
  const tail = rows[RINGS], base = (RINGS + 1) * (SEG + 1);
  for (let k = 1; k <= CAP; k++) for (let s = 0; s <= SEG; s++) {
    const f = 1 - k / CAP, p = tail[s];
    verts.push(p[0] + 0.05 * (1 - f), p[1] * f, p[2] * f, -1, 0, 0, 0, 1 - f * 0.999);
  }
  for (let k = 0; k < CAP; k++) for (let s = 0; s < SEG; s++) {
    const a = k === 0 ? RINGS * (SEG + 1) + s : base + (k - 1) * (SEG + 1) + s, b = base + k * (SEG + 1) + s;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, `
    attribute vec3 aP; attribute vec3 aN; attribute vec2 aS;
    uniform mat3 uM; varying vec3 vN; varying vec3 vL; varying vec2 vS;
    void main() {
      vec3 p = uM * aP;
      vN = uM * aN; vL = aP; vS = aS;
      gl_Position = vec4(p.xy * 0.86, -p.z * 0.5, 1.0);
    }`));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `
    precision highp float;
    varying vec3 vN; varying vec3 vL; varying vec2 vS;
    uniform float uThrust; uniform float uLight; uniform vec3 uGlow;
    float seam(float x, float at) { return 1.0 - 0.28 * smoothstep(0.009, 0.0, abs(x - at)); }
    void main() {
      vec3 n = normalize(vN), v = vec3(0.0, 0.0, 1.0);
      if (vS.y > 0.0) {   // nozzle: dark throat, hot centre
        float hot = smoothstep(0.55, 1.0, vS.y);
        vec3 c = mix(vec3(0.02), uGlow * 1.3 + vec3(0.5, 0.4, 0.3) * hot, hot * (0.35 + 0.65 * uThrust));
        gl_FragColor = vec4(c, 1.0); return;
      }
      // Ceramic deck with dark shoulders running down each side, over a dark belly.
      float top = smoothstep(0.34, 0.42, vS.x);
      vec3 graphite = vec3(0.035, 0.04, 0.05);
      vec3 ceramic = mix(vec3(0.62, 0.615, 0.59), vec3(0.42, 0.42, 0.42), uLight);
      vec3 albedo = mix(graphite, ceramic, top);
      albedo = mix(albedo, graphite, smoothstep(0.84, 0.88, vL.x));   // dark nose tip
      albedo *= seam(vL.x, 0.42) * seam(vL.x, -0.12) * seam(vL.x, -0.62);
      // Slim dorsal window, set just behind the nose.
      vec2 w = vec2((vL.x - 0.34) / 0.2, vL.z / 0.026);
      float glass = smoothstep(1.0, 0.86, dot(w, w)) * step(0.0, vS.x);
      vec3 l = normalize(vec3(-0.55, 0.62, 0.46));
      float d = max(dot(n, l), 0.0);
      vec3 h = normalize(l + v);
      float gloss = max(top, glass);
      float spec = pow(max(dot(n, h), 0.0), mix(22.0, 70.0, gloss)) * mix(0.3, 0.55, gloss);
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      albedo = mix(albedo, vec3(0.012, 0.016, 0.022), glass);
      vec3 c = albedo * (0.05 + 0.95 * d) + spec + rim * vec3(1.0, 0.74, 0.5) * 0.34;
      c += uGlow * uThrust * 0.16 * smoothstep(-0.7, -1.0, vL.x);   // engine light on the hull
      gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.6)), 1.0);
    }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  [['aP', 3, 0], ['aN', 3, 12], ['aS', 2, 24]].forEach(([name, size, off]) => {
    const at = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, 32, off);
  });
  const U = n => gl.getUniformLocation(prog, n);
  const uM = U('uM'), uThrust = U('uThrust'), uLight = U('uLight'), uGlow = U('uGlow');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  // fwd and up are unit vectors with y up and +z toward the viewer. px is the canvas size.
  return function render(fwd, up, px, thrust, light, glow) {
    if (cv.width !== px) { cv.width = cv.height = px; gl.viewport(0, 0, px, px); }
    const r = crossV(fwd, up);
    gl.uniformMatrix3fv(uM, false, [fwd[0], fwd[1], fwd[2], up[0], up[1], up[2], r[0], r[1], r[2]]);
    gl.uniform1f(uThrust, thrust);
    gl.uniform1f(uLight, light ? 1 : 0);
    gl.uniform3f(uGlow, glow[0] / 255, glow[1] / 255, glow[2] / 255);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
    return cv;
  };
};
