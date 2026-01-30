(() => {
  "use strict";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) return;

  const bgEl = document.querySelector(".bg");
  const canvas = document.querySelector(".ripples");
  if (!bgEl || !canvas) return;

  // ====== Точки бульбашок у UV (0..1) для background1.jpg ======
  // (це саме з твоєї картинки; ripple рахується в UV текстури => попадання точне при cover-мапінгу)
  const EMITTERS = [
    { x:0.40488, y:0.79203, r:49 },
    { x:0.83848, y:0.65852, r:46 },
    { x:0.71309, y:0.65852, r:31 },
    { x:0.87363, y:0.10797, r:28 },
    { x:0.40371, y:0.77720, r:28 },
    { x:0.90879, y:0.13104, r:27 },
    { x:0.82559, y:0.61236, r:26 },
    { x:0.72246, y:0.67995, r:24 },
    { x:0.39668, y:0.81346, r:23 },
    { x:0.94910, y:0.48506, r:22 },
    { x:0.83069, y:0.63788, r:22 },
    { x:0.80750, y:0.51425, r:22 },
    { x:0.68420, y:0.74777, r:22 },
    { x:0.89539, y:0.11933, r:20 },
    { x:0.59473, y:0.94863, r:16 },
    { x:0.82214, y:0.65505, r:16 },
    { x:0.93079, y:0.05879, r:15 },
    { x:0.70459, y:0.68134, r:15 },
    { x:0.80566, y:0.51663, r:15 },
    { x:0.60254, y:0.91549, r:14 },
    { x:0.45728, y:0.94863, r:14 },
    { x:0.68335, y:0.77102, r:13 },
    { x:0.87451, y:0.11548, r:13 },
    { x:0.91846, y:0.06670, r:13 },
    { x:0.69763, y:0.74948, r:12 },
    { x:0.63457, y:0.87115, r:11 },
    { x:0.71838, y:0.67050, r:11 },
    { x:0.78552, y:0.50738, r:11 },
    { x:0.37415, y:0.85422, r:11 },
    { x:0.79529, y:0.51425, r:10 },
    { x:0.39668, y:0.76401, r:10 },
    { x:0.39001, y:0.81988, r:10 },
    { x:0.38784, y:0.80804, r:9  },
    { x:0.71472, y:0.68424, r:8  },
    { x:0.90027, y:0.11075, r:8  },
    { x:0.21899, y:0.70268, r:8  },
    { x:0.13140, y:0.79375, r:7  },
    { x:0.88684, y:0.10731, r:7  },
    { x:0.86243, y:0.56405, r:7  },
    { x:0.85266, y:0.56233, r:7  },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ====== WebGL init ======
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) {
    // fallback: лишається CSS background
    canvas.style.display = "none";
    return;
  }

  // Якщо WebGL стартував — ховаємо CSS-бекграунд, щоб не було “подвійного”
  bgEl.style.opacity = "0";

  const MAX_RIPPLES = 28;

  const vs = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fs = `
    precision highp float;

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

      // Параметри “води”
      float speed = 0.18;      // швидкість фронту в UV/сек
      float freq  = 120.0;     // частота хвилі
      float sharp = 900.0;     // “товщина” фронту

      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        if (i >= uCount) break;

        float dt = uTime - uStart[i];
        if (dt <= 0.0 || dt >= uDur[i]) continue;

        float t = dt / uDur[i];
        float radius = dt * speed;

        float d = distance(uv0, uCenter[i]);
        float x = d - radius;

        // Профіль: гаус + синус => справжня хвиля (не просто кільце)
        float env  = exp(-x * x * sharp);
        float wave = sin(x * freq) * env;

        vec2 dir = normalize(uv0 - uCenter[i] + 1e-6);

        // Рефракція (зміщення UV) + затухання по часу
        disp += dir * wave * uAmp[i] * (1.0 - t);

        // Спекулярний “блік” на фронті
        spec += env * (1.0 - t) * 0.12;
      }

      vec2 uv = clamp(uv0 + disp, 0.0, 1.0);

      // Невелика хроматична аберація для “скла”
      vec2 ca = disp * 0.55;
      vec3 col;
      col.r = texture2D(uTex, clamp(uv + ca, 0.0, 1.0)).r;
      col.g = texture2D(uTex, uv).g;
      col.b = texture2D(uTex, clamp(uv - ca, 0.0, 1.0)).b;

      // М’який блиск
      col += spec;

      // Легка сатурація/контраст (як у твоєму CSS)
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

  // fullscreen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // uniforms
  const uTex     = gl.getUniformLocation(prog, "uTex");
  const uRes     = gl.getUniformLocation(prog, "uRes");
  const uTexSize = gl.getUniformLocation(prog, "uTexSize");
  const uTime    = gl.getUniformLocation(prog, "uTime");
  const uCount   = gl.getUniformLocation(prog, "uCount");
  const uCenter0 = gl.getUniformLocation(prog, "uCenter[0]");
  const uStart0  = gl.getUniformLocation(prog, "uStart[0]");
  const uDur0    = gl.getUniformLocation(prog, "uDur[0]");
  const uAmp0    = gl.getUniformLocation(prog, "uAmp[0]");

  // texture
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uTex, 0);

  // ====== load background1.jpg as texture ======
  const img = new Image();
  img.decoding = "async";
  img.src = "./images/background1.jpg";

  let texW = 0, texH = 0;

  img.onload = () => {
    texW = img.naturalWidth || img.width;
    texH = img.naturalHeight || img.height;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    resize();
    requestAnimationFrame(loop);
  };

  // ====== resize ======
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
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
  window.addEventListener("resize", resize, { passive: true });

  // ====== ripple scheduler ======
  const ripples = [];
  const emitters = EMITTERS.map(e => ({ ...e, next: 0 }));

  function intervalFor(r) {
    // великі бульбашки => частіші імпульси
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return (2.8 - 1.7 * t) * rand(0.85, 1.15); // секунди
  }
  function ampFor(r) {
    // амплітуда в UV (0..1)
    // (не роби занадто великою — буде “желатин”)
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return 0.0020 + 0.0035 * t; // ~0.0025..0.007
  }
  function durFor(r) {
    const t = clamp((r - 7) / (49 - 7), 0, 1);
    return 2.2 + 0.8 * (1.0 - t) * rand(0.9, 1.1); // 2.0..3.2 сек
  }

  function spawnAt(e, tSec) {
    ripples.push({
      x: e.x, y: e.y,
      start: tSec,
      dur: durFor(e.r),
      amp: ampFor(e.r) * rand(0.9, 1.12),
    });
  }

  // SHIFT+клік => додати точку вручну (у UV картинки) — якщо захочеш точну ручну прив’язку
  canvas.addEventListener("pointerdown", (ev) => {
    if (!ev.shiftKey) return;

    // перетворюємо screen->uv з урахуванням cover прямо так само як у шейдері
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const sAspect = sw / sh;
    const tAspect = texW / texH;

    let u = ev.clientX / sw;
    let v = 1.0 - (ev.clientY / sh);

    if (sAspect > tAspect) {
      const scale = tAspect / sAspect;
      v = (v - 0.5) * scale + 0.5;
    } else {
      const scale = sAspect / tAspect;
      u = (u - 0.5) * scale + 0.5;
    }

    u = clamp(u, 0, 1);
    v = clamp(v, 0, 1);

    emitters.push({ x: u, y: v, r: 14, next: 0 });
    console.log("[emit] add:", { x: +u.toFixed(5), y: +v.toFixed(5) });
  }, { passive: true });

  // ====== render loop ======
  const centerArr = new Float32Array(MAX_RIPPLES * 2);
  const startArr  = new Float32Array(MAX_RIPPLES);
  const durArr    = new Float32Array(MAX_RIPPLES);
  const ampArr    = new Float32Array(MAX_RIPPLES);

  function loop(ms) {
    if (document.visibilityState === "hidden") {
      requestAnimationFrame(loop);
      return;
    }

    const tSec = ms * 0.001;

    // плануємо спавн з еммітерів
    for (const e of emitters) {
      if (!e.next) e.next = tSec + intervalFor(e.r);
      if (tSec >= e.next) {
        spawnAt(e, tSec);
        e.next = tSec + intervalFor(e.r);
      }
    }

    // чистимо старі
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (tSec - ripples[i].start >= ripples[i].dur) ripples.splice(i, 1);
    }

    // ліміт
    if (ripples.length > MAX_RIPPLES) ripples.splice(0, ripples.length - MAX_RIPPLES);

    // uniforms arrays
    const n = ripples.length;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (i < n) {
        centerArr[i * 2 + 0] = r.x;
        centerArr[i * 2 + 1] = r.y;
        startArr[i] = r.start;
        durArr[i]   = r.dur;
        ampArr[i]   = r.amp;
      } else {
        centerArr[i * 2 + 0] = 0;
        centerArr[i * 2 + 1] = 0;
        startArr[i] = -9999;
        durArr[i]   = 0;
        ampArr[i]   = 0;
      }
    }

    gl.uniform1f(uTime, tSec);
    gl.uniform1i(uCount, n);
    gl.uniform2fv(uCenter0, centerArr);
    gl.uniform1fv(uStart0, startArr);
    gl.uniform1fv(uDur0, durArr);
    gl.uniform1fv(uAmp0, ampArr);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(loop);
  }

  // ====== WIND TITLE ======
  const titleEl = document.querySelector(".title");
  if (titleEl) {
    const wind = (t) => {
      const wx = Math.sin(t * 0.00125) * 2.1 + Math.sin(t * 0.00077 + 1.6) * 1.2;
      const wy = Math.sin(t * 0.00092 + 2.1) * 0.8;
      const wr = Math.sin(t * 0.00105 + 0.7) * 0.7;

      titleEl.style.setProperty("--wx", `${wx.toFixed(3)}px`);
      titleEl.style.setProperty("--wy", `${wy.toFixed(3)}px`);
      titleEl.style.setProperty("--wr", `${wr.toFixed(3)}deg`);

      requestAnimationFrame(wind);
    };
    requestAnimationFrame(wind);
  }
})();


