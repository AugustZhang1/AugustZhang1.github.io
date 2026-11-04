// The background sky: starfield layers and small far galaxies, drawn with raw WebGL into an
// offscreen canvas that the main 2D canvas copies. Star positions upload once, so a frame
// costs a few GPU draws instead of thousands of fillRect calls. Each star covers pixels the
// same way an antialiased fillRect does, so the sky looks the same as the 2D fallback.
// Returns null without hardware WebGL; the caller then draws the stars in 2D.
window.createSky = function (layers, fill, tints) {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, failIfMajorPerformanceCaveat: true });
  if (!gl) return null;

  const RECT = `
    uniform vec3 uView;   // width and height in CSS pixels, device pixel ratio
    varying vec3 vRect;   // left, top and size in device pixels
    varying vec4 vCol;
    void rect(vec2 xy, float s, vec3 rgb, float a) {
      float d = uView.z;
      vRect = vec3(xy * d, s * d);
      vCol = vec4(rgb / 255.0, clamp(a, 0.0, 1.0));
      vec2 c = (xy + s * 0.5) / uView.xy * 2.0 - 1.0;
      gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
      gl_PointSize = ceil(s * d) + 2.0;
    }
    void skip() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
  `;
  const FRAG = `
    precision highp float;
    uniform vec3 uView;
    varying vec3 vRect;
    varying vec4 vCol;
    void main() {
      vec2 p = vec2(gl_FragCoord.x, uView.y * uView.z - gl_FragCoord.y);
      vec2 o = min(p + 0.5, vRect.xy + vRect.z) - max(p - 0.5, vRect.xy);
      float a = vCol.a * max(o.x, 0.0) * max(o.y, 0.0);
      if (a <= 0.0) discard;
      gl_FragColor = vec4(vCol.rgb * a, a);
    }
  `;
  // One parallax layer: a shell of stars turned by this layer's share of the scene rotation.
  const LAYER = `
    precision highp float;
    attribute vec3 aPos;
    attribute vec3 aTint;
    uniform vec4 uRot;      // cos and sin of yaw, cos and sin of pitch
    uniform float uR0, uSize, uA, uTinted;
    uniform vec3 uBase;
    ${RECT}
    void main() {
      float x1 = uRot.x * aPos.x + uRot.y * aPos.z, z1 = -uRot.y * aPos.x + uRot.x * aPos.z;
      if (uRot.w * aPos.y + uRot.z * z1 >= 0.0) { skip(); return; }
      vec2 xy = uView.xy * 0.5 + vec2(x1, -(uRot.z * aPos.y - uRot.w * z1)) * uR0;
      rect(xy, uSize, uTinted > 0.5 ? aTint : uBase, uA);
    }
  `;
  // Far galaxies: the same rules as the 2D path, worked out per point from the galaxy's centre.
  const FILL = `
    precision highp float;
    attribute vec3 aCentre;
    attribute vec3 aOff;
    attribute vec3 aCol;
    attribute vec4 aInfo;   // radius, brightness, kind (0 core, 1 arm, 2 lone dot), detail level
    uniform vec4 uRot;
    uniform vec4 uCam;      // camera distance, reference distance, scale, overall alpha
    uniform vec3 uFocus;
    uniform vec2 uCentre;
    ${RECT}
    vec3 project(vec3 w) {
      float x1 = uRot.x * w.x + uRot.y * w.z, z1 = -uRot.y * w.x + uRot.x * w.z;
      float dep = uCam.x - (uRot.w * w.y + uRot.z * z1 - uFocus.z);
      if (dep < 0.3) return vec3(0.0);
      float k = uCam.y / dep;
      return vec3(uCentre + vec2(x1 - uFocus.x, -(uRot.z * w.y - uRot.w * z1 - uFocus.y)) * k * uCam.z, k);
    }
    void main() {
      vec3 c = project(aCentre);
      float k = c.z, px = aInfo.x * k * uCam.z, kind = aInfo.z;
      if (k == 0.0 || k > 2.0 || px < 0.4 || c.x < -px || c.x > uView.x + px || c.y < -px || c.y > uView.y + px) { skip(); return; }
      float a = aInfo.y * uCam.w * clamp((2.0 - k) / 0.8, 0.0, 1.0) * clamp(0.5 + 0.5 / k, 0.4, 1.0);
      if (px < 1.5) {
        if (kind < 1.5) { skip(); return; }
        rect(c.xy - 0.6, 1.2, aCol, a * 0.9);
        return;
      }
      if (kind > 1.5 || aInfo.w > (px < 6.0 ? 0.5 : px < 15.0 ? 1.5 : 2.5)) { skip(); return; }
      vec3 p = project(aCentre + aOff);
      if (p.z == 0.0) { skip(); return; }
      rect(p.xy, (kind > 0.5 ? 0.8 : 1.0) * clamp(p.z, 0.6, 1.3), aCol, a * (kind > 0.5 ? 0.5 : 0.8));
    }
  `;
  function program(vert) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, FRAG]].forEach(([type, src]) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return { p, u: name => gl.getUniformLocation(p, name), a: name => gl.getAttribLocation(p, name) };
  }
  const layerP = program(LAYER), fillP = program(FILL);
  if (!layerP || !fillP) return null;

  function buffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  function attrs(prog, buf, list, floats) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let at = 0;
    list.forEach(([name, size]) => {
      const loc = prog.a(name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, floats * 4, at * 4);
      at += size;
    });
  }

  // Layers sit one after another in a single buffer: x, y, z, then the star's tint.
  const layerData = [];
  const spans = layers.map(L => {
    const first = layerData.length / 6;
    L.pts.forEach(p => layerData.push(p[0], p[1], p[2], ...tints[p[3]]));
    return { L, first, count: L.pts.length };
  });
  const layerBuf = buffer(new Float32Array(layerData));

  // Far galaxies: one lone dot each for when they are tiny, then every point. The detail level
  // matches the 2D stride: 0 is every 6th point of a part, 1 every 2nd, 2 the rest.
  const FLOATS = 13;
  const total = fill.reduce((s, F) => s + F.n + 1, 0);
  const fillData = new Float32Array(total * FLOATS);
  let w = 0;
  const put = (F, x, y, z, col, kind, level) => { fillData.set([F.c[0], F.c[1], F.c[2], x, y, z, col[0], col[1], col[2], F.R, F.a, kind, level], w); w += FLOATS; };
  fill.forEach(F => {
    put(F, 0, 0, 0, F.core, 2, 0);
    for (let j = 0; j < F.n; j++) {
      const part = j < F.nb ? 0 : 1, i = part ? j - F.nb : j;
      put(F, F.pts[3 * j], F.pts[3 * j + 1], F.pts[3 * j + 2], part ? F.arm : F.core, part, i % 6 === 0 ? 0 : i % 2 === 0 ? 1 : 2);
    }
  });
  const fillBuf = buffer(fillData);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  function begin(prog, v) {
    const pw = Math.round(v.W * v.DPR), ph = Math.round(v.H * v.DPR);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    gl.viewport(0, 0, pw, ph);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.uniform3f(prog.u('uView'), v.W, v.H, v.DPR);
  }
  return {
    ok: () => !gl.isContextLost(),
    layers(v) {
      begin(layerP, v);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // source-over, as the 2D stars
      attrs(layerP, layerBuf, [['aPos', 3], ['aTint', 3]], 6);
      gl.uniform1f(layerP.u('uR0'), v.R0);
      gl.uniform1f(layerP.u('uTinted'), v.dark ? 1 : 0);
      gl.uniform3f(layerP.u('uBase'), v.base[0], v.base[1], v.base[2]);
      spans.forEach(({ L, first, count }) => {
        if (!v.dark && L.a < 0.85) return;
        gl.uniform4f(layerP.u('uRot'), Math.cos(v.angY * L.f), Math.sin(v.angY * L.f), Math.cos(v.angX * L.f), Math.sin(v.angX * L.f));
        gl.uniform1f(layerP.u('uSize'), L.size);
        gl.uniform1f(layerP.u('uA'), L.a * (v.dark ? 1 : 0.1) * v.fade);
        gl.drawArrays(gl.POINTS, first, count);
      });
      return cv;
    },
    fill(v) {
      begin(fillP, v);
      gl.blendFunc(gl.ONE, gl.ONE);   // adds light, as 'lighter' does in 2D
      attrs(fillP, fillBuf, [['aCentre', 3], ['aOff', 3], ['aCol', 3], ['aInfo', 4]], FLOATS);
      gl.uniform4f(fillP.u('uRot'), v.cA, v.sA, v.cB, v.sB);
      gl.uniform4f(fillP.u('uCam'), v.cam, v.CAM, v.SC, v.al);
      gl.uniform3f(fillP.u('uFocus'), v.FR[0], v.FR[1], v.FR[2]);
      gl.uniform2f(fillP.u('uCentre'), v.CX, v.CY);
      gl.drawArrays(gl.POINTS, 0, total);
      return cv;
    }
  };
};
