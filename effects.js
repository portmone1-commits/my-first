(() => {
  "use strict";

  // =========================
  //  Respect Reduced Motion
  // =========================
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) return;

  // =========================
  //  DOM
  // =========================
  const bgEl = document.querySelector(".bg");
  const canvas = document.querySelector(".ripples");
  if (!bgEl || !canvas) return;

  // =========================
  //  Emitters (UV 0..1)
  // =========================
  const EMITTERS = [
    { x: 0.40488, y: 0.79203, r: 49 },
    { x: 0.83848, y: 0.65852, r: 46 },
    { x: 0.71309, y: 0.65852, r: 31 },
    { x: 0.87363, y: 0.10797, r: 28 },
    { x: 0.40371, y: 0.7772, r: 28 },
    { x: 0.90879, y: 0.13104, r: 27 },
    { x: 0.82559, y: 0.61236, r: 26 },
    { x: 0.72246, y: 0.67995, r: 24 },
    { x: 0.39668, y: 0.81346, r: 23 },
    { x: 0.9491, y: 0.48506, r: 22 },
    { x: 0.83069, y: 0.63788, r: 22 },
    { x: 0.8075, y: 0.51425, r: 22 },
    { x: 0.6842, y: 0.74777, r: 22 },
    { x: 0.89539, y: 0.11933, r: 20 },
    { x: 0.59473, y: 0.94863, r: 16 },
    { x: 0.82214, y: 0.65505, r: 16 },
    { x: 0.93079, y: 0.05879, r: 15 },
    { x: 0.70459, y: 0.68134, r: 15 },
    { x: 0.80566, y: 0.51663, r: 15 },
    { x: 0.60254, y: 0.91549, r: 14 },
    { x: 0.45728, y: 0.94863, r: 14 },
    { x: 0.68335, y: 0.77102, r: 13 },
    { x: 0.87451, y: 0.11548, r: 13 },
    { x: 0.91846, y: 0.0667, r: 13 },
    { x: 0.69763, y: 0.74948, r: 12 },
    { x: 0.63457, y: 0.87115, r: 11 },
    { x: 0.71838, y: 0.6705, r: 11 },
    { x: 0.78552, y: 0.50738, r: 11 },
    { x: 0.37415, y: 0.85422, r: 11 },
    { x: 0.79529, y: 0.51425, r: 10 },
    { x: 0.39668, y: 0.76401, r: 10 },
    { x: 0.39001, y: 0.81988, r: 10 },
    { x: 0.38784, y: 0.80804, r: 9 },
    { x: 0.71472, y: 0.68424, r: 8 },
    { x: 0.90027, y: 0.11075, r: 8 },
    { x: 0.21899, y: 0.70268, r: 8 },
    { x: 0.1314, y: 0.79375, r: 7 },
    { x: 0.88684, y: 0.10731, r: 7 },
    { x: 0.86243, y: 0.56405, r: 7 },
    { x: 0.85266, y: 0.56233, r: 7 },
  ];

  // =========================
  //  Utils
  // =========================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);

  // =========================
  //  WebGL init
  // =========================
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    canvas.style.display = "none";
    return;
  }

  // Precision fallback: highp not guaranteed in fragment on all devices
  const hasHighp = (() => {
    try {
      const hp = gl.getShaderPrecisionFormat(
        gl.FRAGMENT_SHADER,
        gl.HIGH_FLOAT
      );
      return hp && hp.precision > 0;
    } catch {
      return false;
    }
  })();
  const PRECISION = hasHighp ? "highp" : "mediump";

  // If WebGL is on, prefer it. Keep bg as fallback (opacity toggle)
  // (you can set display:none after texture loads if you want)
  bgEl.style.opacity = "0";

  const MAX_RIPPLES = 28;

  // =========================
  //  Shaders
  // =========================
  const vs = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fs = `
    precision ${PRECISION} float;

    uniform sampler2D uTex;
    uniform vec2  uRes;
    uniform vec2  uTexSize;
    uniform float uTime;
    uniform int   uCount;

    uniform vec2  uCenter[${MAX_RIPPLES}];
    uniform float uStart[${MAX_RIPPLES}];
    uniform float uDur[${MAX_RIPPLES}];
    uniform float uAmp[${MAX_RIPPLES}];

    varying vec2 vUv;

    vec2 coverUV(vec2 st) {
      float sAspect = uRes.x / uRes.y;
      float tAspect = uTexSize.x / uTexSize.y;
      vec2 uv = st;

      if (sAspect > tAspect) {
        float scale = tAspect / sAspect;
        uv.y = (uv.y - 0.5) * scale + 0.5;
      } else {
        float scale = sAspect / tAspect;
        uv.x = (uv.x - 0.5) * scale + 0.5;
      }
      return uv;
    }

    void main() {
      vec2 uv0 = coverUV(vUv);
      vec2 disp = vec2(0.0);
      float spec = 0.0;

      // “Water” params
      float speed = 0.18;      // front speed (UV/sec)
      float freq  = 120.0;     // wave frequency
      float sharp = 900.0;     // gaussian sharpness (front thickness)

      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        if (i >= uCount) break;

        float dt = uTime - uStart[i];
        if (dt <= 0.0 || dt >= uDur[i]) continue;

        float t = dt / uDur[i];
        float radius = dt * speed;

        float d = distance(uv0, uCenter[i]);
        float x = d - radius;

        float env  = exp(-x * x * sharp);
        float wave = sin(x * freq) * env;

        vec2 dir = normalize(uv0 - uCenter[i] + 1e-6);

        disp += dir * wave * uAmp[i] * (1.0 - t);
        spec += env * (1.0 - t) * 0.12;
      }

      vec2 uv = clamp(uv0 + disp, 0.0, 1.0);

      // Chromatic aberration for “glass”
      vec2 ca = disp * 0.55;
      vec3 col;
      col.r = texture2D(uTex, clamp(uv + ca, 0.0, 1.0)).r;
      col.g = texture2D(uTex, uv).g;
      col.b = texture2D(uTex, clamp(uv - ca, 0.0, 1.0)).b;

      col += spec;

      // Saturation/contrast tweak
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.05);
      col = (col - 0.5) * 1.02 + 0.5;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  const vsh = compile(gl.VERTEX_SHADER, vs);
  const fsh = compile(gl.FRAGMENT_SHADER, fs);
  if (!vsh || !fsh) {
    canvas.style.display = "none";
    bgEl.style.opacity = "1";
    return;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    canvas.style.display = "none";
    bgEl.style.opacity = "1";
    return;
  }
  gl.useProgram(prog);

  // =========================
  //  Fullscreen quad
  // =========================
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // =========================
  //  Uniforms
  // =========================
  const uTex = gl.getUniformLocation(prog, "uTex");
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTexSize = gl.getUniformLocation(prog, "uTexSize");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uCount = gl.getUniformLocation(prog, "uCount");
  const uCenter0 = gl.getUniformLocation(prog, "uCenter[0]");
  const uStart0 = gl.getUniformLocation(prog, "uStart[0]");
  const uDur0 = gl.getUniformLocation(prog, "uDur[0]");
  const uAmp0 = gl.getUniformLocation(prog, "uAmp[0]");

  // =========================
  //  Texture
  // =========================
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uTex, 0);

  // Load background image as texture
  const img = new Image();
  img.decoding = "async";
  // If you ever load from another domain, you'll need img.crossOrigin = "anonymous";
  img.src = "./images/background1.jpg";

  let texW = 0;
  let texH = 0;

  img.onerror = () => {
    console.warn("Failed to load background texture:", img.src);
    canvas.style.display = "none";
    bgEl.style.opacity = "1";
    cleanup();
  };

  // =========================
  //  Resize handling (RAF-throttled)
  // =========================
  let resizeQueued = false;

  function resize() {
    const dpr = DPR();
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, window.innerWidth, window.innerHeight);
    gl.uniform2f(uTexSize, texW, texH);
  }

  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (!destroyed) resize();
    });
  }

  window.addEventListener("resize", queueResize, { passive: true });
  window.addEventListener("orientationchange", queueResize, { passive: true });

  // =========================
  //  Scheduler params
  // =========================
  const ripples = [];
  const emitters = EMITTERS.map((e) => ({ ...e, next: null }));

  function intervalFor(r) {
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return (2.8 - 1.7 * t) * rand(0.85, 1.15);
  }
  function ampFor(r) {
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return 0.002 + 0.0035 * t;
  }
  function durFor(r) {
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return 2.2 + 0.8 * (1.0 - t) * rand(0.9, 1.1);
  }

  function spawnAt(e, tSec) {
    ripples.push({
      x: e.x,
      y: e.y,
      start: tSec,
      dur: durFor(e.r),
      amp: ampFor(e.r) * rand(0.9, 1.12),
    });
  }

  // SHIFT+click: add emitter point in UV (cover-mapped exactly like shader)
  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (!ev.shiftKey) return;
      if (!texW || !texH) return;

      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const sAspect = sw / sh;
      const tAspect = texW / texH;

      let u = ev.clientX / sw;
      let v = 1.0 - ev.clientY / sh;

      if (sAspect > tAspect) {
        const scale = tAspect / sAspect;
        v = (v - 0.5) * scale + 0.5;
      } else {
        const scale = sAspect / tAspect;
        u = (u - 0.5) * scale + 0.5;
      }

      u = clamp(u, 0, 1);
      v = clamp(v, 0, 1);

      emitters.push({ x: u, y: v, r: 14, next: null });
      console.log("[emit] add:", { x: +u.toFixed(5), y: +v.toFixed(5) });
    },
    { passive: true }
  );

  // =========================
  //  Render loop (pause/resume)
  // =========================
  const centerArr = new Float32Array(MAX_RIPPLES * 2);
  const startArr = new Float32Array(MAX_RIPPLES);
  const durArr = new Float32Array(MAX_RIPPLES);
  const ampArr = new Float32Array(MAX_RIPPLES);

  let rafId = 0;
  let paused = document.visibilityState === "hidden";
  let destroyed = false;
  let glLost = false;

  function frame(ms) {
    rafId = 0;
    if (destroyed || paused || glLost) return;

    const tSec = ms * 0.001;

    // schedule spawns
    for (const e of emitters) {
      if (e.next === null) e.next = tSec + intervalFor(e.r);
      if (tSec >= e.next) {
        spawnAt(e, tSec);
        e.next = tSec + intervalFor(e.r);
      }
    }

    // remove old ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (tSec - ripples[i].start >= ripples[i].dur) ripples.splice(i, 1);
    }

    // cap
    if (ripples.length > MAX_RIPPLES) {
      ripples.splice(0, ripples.length - MAX_RIPPLES);
    }

    // pack arrays
    const n = ripples.length;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (i < n) {
        const r = ripples[i];
        centerArr[i * 2 + 0] = r.x;
        centerArr[i * 2 + 1] = r.y;
        startArr[i] = r.start;
        durArr[i] = r.dur;
        ampArr[i] = r.amp;
      } else {
        centerArr[i * 2 + 0] = 0;
        centerArr[i * 2 + 1] = 0;
        startArr[i] = -9999;
        durArr[i] = 0;
        ampArr[i] = 0;
      }
    }

    gl.uniform1f(uTime, tSec);
    gl.uniform1i(uCount, n);
    gl.uniform2fv(uCenter0, centerArr);
    gl.uniform1fv(uStart0, startArr);
    gl.uniform1fv(uDur0, durArr);
    gl.uniform1fv(uAmp0, ampArr);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (destroyed || paused || glLost) return;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      paused = document.visibilityState === "hidden";
      if (!paused) startLoop();
      else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    { passive: true }
  );

  // Minimal context lost handler (fallback to CSS background)
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      glLost = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      canvas.style.display = "none";
      bgEl.style.opacity = "1";
    },
    false
  );

  // =========================
  //  Image load -> upload tex -> start
  // =========================
  img.onload = () => {
    texW = img.naturalWidth || img.width;
    texH = img.naturalHeight || img.height;

    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        img
      );
    } catch (e) {
      console.warn("texImage2D failed:", e);
      canvas.style.display = "none";
      bgEl.style.opacity = "1";
      cleanup();
      return;
    }

    resize();
    startLoop();
  };

  // =========================
  //  WIND TITLE
  // =========================
  const titleEl = document.querySelector(".title");
  let titleRaf = 0;

  function wind(t) {
    titleRaf = 0;
    if (!titleEl || destroyed || paused) return;

    const wx =
      Math.sin(t * 0.00125) * 2.1 + Math.sin(t * 0.00077 + 1.6) * 1.2;
    const wy = Math.sin(t * 0.00092 + 2.1) * 0.8;
    const wr = Math.sin(t * 0.00105 + 0.7) * 0.7;

    titleEl.style.setProperty("--wx", `${wx.toFixed(3)}px`);
    titleEl.style.setProperty("--wy", `${wy.toFixed(3)}px`);
    titleEl.style.setProperty("--wr", `${wr.toFixed(3)}deg`);

    titleRaf = requestAnimationFrame(wind);
  }

  if (titleEl) {
    titleRaf = requestAnimationFrame(wind);
  }

  // =========================
  //  Cleanup
  // =========================
  function cleanup() {
    if (destroyed) return;
    destroyed = true;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    if (titleRaf) cancelAnimationFrame(titleRaf);
    titleRaf = 0;

    window.removeEventListener("resize", queueResize);
    window.removeEventListener("orientationchange", queueResize);

    // Optionally: release GL resources (not strictly required on page unload,
    // but helps in SPA hot-reload scenarios)
    try {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vsh);
      gl.deleteShader(fsh);
    } catch {
      // ignore
    }
  }

  window.addEventListener("pagehide", cleanup, { passive: true });
})();
