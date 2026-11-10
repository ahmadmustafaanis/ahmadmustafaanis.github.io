/*
 * Patch field: the homepage portrait drawn as a grid of image patches. At rest
 * the patches around the subject float off the picture plane; on request all
 * of them regroup by their position in a vision model's feature space.
 *
 * One instanced draw call in WebGL2, no dependencies. Without WebGL2 (or if
 * anything fails to load) the plain <img> underneath stays visible.
 * Data comes from tools/build_patch_field.py.
 */
(() => {
  'use strict';

  const figure = document.querySelector('[data-patch-field]');
  if (!figure) return;

  const stage = figure.querySelector('.field-stage');
  const canvas = figure.querySelector('canvas');
  const caption = figure.querySelector('[data-field-caption]');
  const buttons = [...figure.querySelectorAll('[data-view]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const CAMERA = 4.2;          // camera distance; the flat picture exactly fills the frame from here
  const FLIGHT_SECONDS = 2.1;  // picture plane <-> feature space
  const REST_ZOOM = 0.86;      // the picture steps back so its loose patches stay in frame

  const VERTEX = `#version 300 es
    precision highp float;

    layout(location = 0) in vec2 aCorner;   // unit quad corner, 0..1
    layout(location = 1) in vec2 aCell;     // column, row
    layout(location = 2) in vec3 aFeature;  // position in feature space
    layout(location = 3) in vec4 aSeed;     // per-patch random numbers

    uniform mat4 uProjection;
    uniform mat3 uRotation;
    uniform float uGrid;
    uniform float uMix;      // 0 = picture plane, 1 = feature space
    uniform float uWake;     // 0 = flat photograph, 1 = resting pose with loose patches
    uniform float uZoom;
    uniform float uTime;
    uniform vec3 uPointer;   // xy on the plane, z = strength

    out vec2 vUv;
    out vec2 vLocal;
    out float vRound;
    out float vShade;
    out float vFog;

    const float PI = 3.14159265;
    const float CAMERA = ${CAMERA.toFixed(1)};
    const float SPREAD = 0.98;            // feature cloud radius
    const float SPACE_TILE = 1.12;        // patch size in feature space, in cells
    const vec2 SUBJECT = vec2(0.08, 0.1); // where the sitter is on the plane

    mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

    void main() {
      float cell = 2.0 / uGrid;
      vec2 plane = vec2((aCell.x + 0.5) * cell - 1.0, 1.0 - (aCell.y + 0.5) * cell);

      // Flight: patches near the centre leave first; a little noise keeps it organic.
      float delay = clamp(0.72 * length(plane) / 1.4142 + 0.28 * aSeed.x, 0.0, 1.0);
      float t = clamp(uMix * 1.75 - delay * 0.75, 0.0, 1.0);
      t = t * t * t * (t * (6.0 * t - 15.0) + 10.0);

      // Rest: the further a patch is from the sitter, the looser it hangs. Below a
      // threshold a patch stays put, so the middle of the picture has no hairline gaps.
      float rim = uWake * smoothstep(0.62, 1.42, distance(plane, SUBJECT));
      rim *= smoothstep(0.07, 0.12, rim);
      float hang = rim * ((aSeed.x - 0.26) * 0.62 + 0.022 * sin(uTime * 0.55 + aSeed.w * 2.0 * PI));

      vec2 away = plane - uPointer.xy;
      float lifted = uPointer.z * exp(-dot(away, away) / 0.12);
      lifted *= smoothstep(0.06, 0.16, lifted);

      vec3 onPlane = vec3(plane * uZoom, lifted * 0.3 + hang);
      vec3 inSpace = aFeature * SPREAD;
      inSpace.y += 0.012 * sin(uTime * 0.7 + aSeed.y * 2.0 * PI);
      vec3 centre = mix(onPlane, inSpace, t);
      centre.z += sin(PI * t) * (0.15 + 0.55 * aSeed.z);

      // Patches part wherever something lifts them; the rest of the picture stays seamless.
      float open = clamp(step(0.001, lifted) * 0.03 + lifted * 0.1 + step(0.001, rim) * 0.04 + rim * 0.1, 0.0, 0.5);
      float size = cell * mix(uZoom * (1.0 - open) * 1.004 * (1.0 + lifted * 0.06), SPACE_TILE, t);

      // Each patch tumbles once in flight and settles with a slight lean.
      vec2 q = turn((aSeed.w - 0.5) * 2.6 * sin(PI * t)) * (vec2(aCorner.x - 0.5, 0.5 - aCorner.y) * size);
      float leanY = (aSeed.y - 0.5) * mix(rim * 0.55, 0.9, t);
      float leanX = (aSeed.z - 0.5) * mix(rim * 0.45, 0.7, t);
      vec3 offset = vec3(q.x * cos(leanY), q.y, -q.x * sin(leanY));
      offset = vec3(offset.x, offset.y * cos(leanX) - offset.z * sin(leanX), offset.y * sin(leanX) + offset.z * cos(leanX));
      vec3 normal = vec3(sin(leanY) * cos(leanX), -sin(leanX), cos(leanY) * cos(leanX));

      // On the plane a patch is part of a rigid sheet; in space it mostly faces the viewer.
      float facing = t * 0.72;
      vec3 world = mix(uRotation * (centre + offset), uRotation * centre + offset, facing);
      normal = normalize(mix(uRotation * normal, normal, facing));

      vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
      float lit = dot(normal, light) / light.z;
      float loose = max(max(t, rim), 0.6 * uPointer.z);
      vShade = mix(1.0, clamp(0.6 + 0.4 * lit, 0.45, 1.1), loose) + lifted * 0.03;
      vFog = max(t * 0.62 * smoothstep(0.75, -1.15, world.z), (1.0 - t) * rim * 0.5 * smoothstep(0.02, -0.3, world.z));
      vRound = mix(min(0.16, open * 1.6), 0.15, t);
      vLocal = aCorner - 0.5;
      vUv = (aCell + aCorner) / uGrid;

      gl_Position = uProjection * vec4(world.xy, world.z - CAMERA, 1.0);
    }
  `;

  const FRAGMENT = `#version 300 es
    precision highp float;

    uniform sampler2D uImage;
    uniform vec3 uFog;

    in vec2 vUv;
    in vec2 vLocal;
    in float vRound;
    in float vShade;
    in float vFog;
    out vec4 colour;

    void main() {
      // Rounded square. Flush patches (no rounding) stay fully opaque so the picture has no seams.
      vec2 d = abs(vLocal) - (0.5 - vRound);
      float edge = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - vRound;
      float alpha = mix(1.0, clamp(0.5 - edge / max(fwidth(edge), 1e-5), 0.0, 1.0), step(0.002, vRound));
      if (alpha < 0.02) discard;
      vec3 rgb = texture(uImage, vUv).rgb * vShade;
      colour = vec4(mix(rgb, uFog, vFog), alpha);
    }
  `;

  const BACKDROP_VERTEX = `#version 300 es
    out vec2 vAt;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vAt = p - 0.5;
      gl_Position = vec4(p * 2.0 - 1.0, 0.999, 1.0);
    }
  `;

  const BACKDROP_FRAGMENT = `#version 300 es
    precision highp float;
    uniform vec3 uInner;
    uniform vec3 uOuter;
    in vec2 vAt;
    out vec4 colour;
    void main() {
      float fall = smoothstep(0.05, 0.85, length(vAt - vec2(0.0, 0.06)));
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      colour = vec4(mix(uInner, uOuter, fall) + grain / 255.0, 1.0);
    }
  `;

  const state = {
    view: 'pixels',
    mix: 0, mixTarget: 0,
    wake: 0, wakeTarget: 0,
    hover: 0, hoverTarget: 0,
    pointer: [0, 0], pointerTarget: [0, 0],
    yaw: 0, pitch: 0,           // what is drawn
    orbitYaw: 0, orbitPitch: 0, // set by dragging in feature space
    spinYaw: 0, spinPitch: 0,   // drag inertia
    clock: 0,                   // drives the idle sway
    dragging: false,
    visible: true,
    frame: 0, last: 0,
  };

  let gl, program, backdrop, uniforms, backdropUniforms, vao;
  let count = 0, grid = 0, modelLabel = '', projectionLabel = '';
  let stageInner = [0, 0, 0], stageOuter = [0, 0, 0];

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function link(vertex, fragment) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function locate(p, names) {
    return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(p, name)]));
  }

  // Deterministic noise so the figure looks the same on every visit.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build(data, image) {
    grid = data.grid;
    count = grid * grid;
    modelLabel = data.model;
    projectionLabel = data.projection;
    if (!Array.isArray(data.points) || data.points.length !== count) throw new Error('patch-field.json does not match its grid');

    gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');

    program = link(VERTEX, FRAGMENT);
    backdrop = link(BACKDROP_VERTEX, BACKDROP_FRAGMENT);
    uniforms = locate(program, ['uProjection', 'uRotation', 'uGrid', 'uMix', 'uWake', 'uZoom', 'uTime', 'uPointer', 'uImage', 'uFog']);
    backdropUniforms = locate(backdrop, ['uInner', 'uOuter']);

    const random = seeded(20);
    const instances = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = data.points[i];
      instances.set([i % grid, Math.floor(i / grid), x, y, z, random(), random(), random(), random()], i * 9);
    }

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STATIC_DRAW);
    [[1, 2, 0], [2, 3, 8], [3, 4, 20]].forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset);
      gl.vertexAttribDivisor(location, 1);
    });
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));

    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.depthFunc(gl.LEQUAL);
  }

  // Stage colours live in CSS so the figure follows the page theme.
  function cssColour(name) {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    stage.append(probe);
    const [r, g, b] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
    probe.remove();
    return [r / 255, g / 255, b / 255];
  }

  function readTheme() {
    stageInner = cssColour('--stage-inner');
    stageOuter = cssColour('--stage-outer');
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(stage.clientWidth * ratio));
    const height = Math.max(1, Math.round(stage.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    request();
  }

  function draw(zoom) {
    const aspect = canvas.width / canvas.height;
    const near = 0.5, far = 12;
    // tan(fov / 2) = 1 / CAMERA, so the unit plane exactly fills the frame when it is flat.
    const projection = new Float32Array([
      CAMERA / Math.max(aspect, 1), 0, 0, 0,
      0, CAMERA * Math.min(aspect, 1), 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cx = Math.cos(state.pitch), sx = Math.sin(state.pitch);
    // Column-major R = Ry(yaw) * Rx(pitch).
    const rotation = new Float32Array([cy, 0, -sy, sy * sx, cx, cy * sx, sy * cx, -sx, cy * cx]);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(backdrop);
    gl.uniform3fv(backdropUniforms.uInner, stageInner);
    gl.uniform3fv(backdropUniforms.uOuter, stageOuter);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
    gl.uniformMatrix3fv(uniforms.uRotation, false, rotation);
    gl.uniform1f(uniforms.uGrid, grid);
    gl.uniform1f(uniforms.uMix, state.mix);
    gl.uniform1f(uniforms.uWake, state.wake);
    gl.uniform1f(uniforms.uZoom, zoom);
    gl.uniform1f(uniforms.uTime, state.clock);
    gl.uniform3f(uniforms.uPointer, state.pointer[0], state.pointer[1], state.hover);
    gl.uniform3fv(uniforms.uFog, stageOuter);
    gl.uniform1i(uniforms.uImage, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  const approach = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);
  const settled = (value, target) => Math.abs(value - target) < 0.001;

  function tick(now) {
    state.frame = 0;
    const dt = Math.min(0.05, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const still = reducedMotion.matches;
    const onPlane = 1 - Math.min(1, state.mix * 3);  // the pointer only matters while the picture is whole
    if (!still && !state.dragging) state.clock += dt;

    // Flight between the two arrangements, and the opening move into the resting pose.
    const step = still ? 1 : dt / FLIGHT_SECONDS;
    state.mix += Math.max(-step, Math.min(step, state.mixTarget - state.mix));
    state.wake = still ? state.wakeTarget : approach(state.wake, state.wakeTarget, 1.9, dt);
    if (settled(state.wake, state.wakeTarget)) state.wake = state.wakeTarget;

    // Pointer: the sheet leans away under the cursor and nearby patches rise.
    state.hover = approach(state.hover, state.hoverTarget * onPlane, 7, dt);
    state.pointer[0] = approach(state.pointer[0], state.pointerTarget[0], 9, dt);
    state.pointer[1] = approach(state.pointer[1], state.pointerTarget[1], 9, dt);
    const ease = state.wake * state.wake * (3 - 2 * state.wake);
    const zoom = 1 - (1 - REST_ZOOM) * ease - 0.025 * state.hover;

    // Feature space: whatever the visitor has dragged, with a little inertia.
    if (!state.dragging) {
      state.orbitYaw += state.spinYaw * dt;
      state.orbitPitch += state.spinPitch * dt;
      state.spinYaw = approach(state.spinYaw, 0, 2.6, dt);
      state.spinPitch = approach(state.spinPitch, 0, 2.6, dt);
    }
    state.orbitPitch = Math.max(-1.1, Math.min(1.1, state.orbitPitch));
    if (state.mixTarget === 0) {
      // Heading home: unwind the orbit so the picture lands square.
      state.orbitYaw = approach(state.orbitYaw, Math.round(state.orbitYaw / (2 * Math.PI)) * 2 * Math.PI, 4, dt);
      state.orbitPitch = approach(state.orbitPitch, 0, 4, dt);
      state.spinYaw = state.spinPitch = 0;
    }

    // Both arrangements sway slowly; the picture also turns to follow the pointer.
    const restYaw = ease * 0.1 * Math.sin(state.clock * 0.42);
    const restPitch = ease * 0.045 * Math.sin(state.clock * 0.31);
    const planeYaw = restYaw + (state.pointer[0] * 0.22 - restYaw) * state.hover;
    const planePitch = restPitch + (-state.pointer[1] * 0.17 - restPitch) * state.hover;
    const spaceYaw = state.orbitYaw + 0.55 * Math.sin(state.clock * 0.32);
    const spacePitch = state.orbitPitch + 0.12 * Math.sin(state.clock * 0.23) - 0.08;
    const blend = state.mix * state.mix * (3 - 2 * state.mix);
    state.yaw = planeYaw + (spaceYaw - planeYaw) * blend;
    state.pitch = planePitch + (spacePitch - planePitch) * blend;

    draw(zoom);

    // With motion allowed the figure never quite stops; otherwise draw only while something changes.
    const changing = state.mix !== state.mixTarget || state.wake !== state.wakeTarget || state.dragging
      || !settled(state.hover, state.hoverTarget * onPlane)
      || (state.hover > 0.001 && !(settled(state.pointer[0], state.pointerTarget[0]) && settled(state.pointer[1], state.pointerTarget[1])))
      || Math.abs(state.spinYaw) + Math.abs(state.spinPitch) > 0.002
      || (state.mixTarget === 0 && Math.abs(state.orbitPitch) > 0.001);
    if (!still || changing) request();
  }

  function request() {
    if (!gl || state.frame || !state.visible || document.hidden) return;
    state.last = performance.now();
    state.frame = requestAnimationFrame(tick);
  }

  function describe() {
    const n = count.toLocaleString('en-US');
    if (caption) {
      caption.textContent = state.view === 'features'
        ? `The same ${n} patches, grouped by what ${modelLabel} sees in them (${projectionLabel} of its patch features). Drag to rotate.`
        : `A portrait as ${n} patches, each where the camera put it.`;
    }
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    figure.dataset.view = state.view;
  }

  function show(view) {
    if (view === state.view) return;
    state.view = view;
    state.mixTarget = view === 'features' ? 1 : 0;
    state.wakeTarget = 1;
    describe();
    request();
  }

  function planePoint(event) {
    const box = stage.getBoundingClientRect();
    return [
      (((event.clientX - box.left) / box.width) * 2 - 1) / REST_ZOOM,
      (1 - ((event.clientY - box.top) / box.height) * 2) / REST_ZOOM,
    ];
  }

  function bind() {
    buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.view)));

    stage.addEventListener('pointermove', event => {
      if (state.dragging) {
        const box = stage.getBoundingClientRect();
        const dx = (event.movementX / box.width) * 3.4;
        const dy = (event.movementY / box.height) * 2.4;
        state.orbitYaw += dx;
        state.orbitPitch += dy;
        state.spinYaw = dx / 0.016;
        state.spinPitch = dy / 0.016;
        request();
        return;
      }
      if (event.pointerType !== 'mouse') return;
      state.pointerTarget = planePoint(event);
      if (state.hoverTarget === 0 && state.hover < 0.01) state.pointer = [...state.pointerTarget];
      state.hoverTarget = 1;
      request();
    });
    stage.addEventListener('pointerleave', () => { state.hoverTarget = 0; request(); });
    stage.addEventListener('pointerdown', event => {
      if (state.mixTarget !== 1 || (event.pointerType === 'mouse' && event.button !== 0)) return;
      state.dragging = true;
      state.spinYaw = state.spinPitch = 0;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-dragging');
    });
    const release = event => {
      if (!state.dragging) return;
      state.dragging = false;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      stage.classList.remove('is-dragging');
      request();
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    new ResizeObserver(resize).observe(stage);
    new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; request(); }).observe(stage);
    document.addEventListener('visibilitychange', request);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); request(); });
    new MutationObserver(() => { readTheme(); request(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    reducedMotion.addEventListener('change', request);

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      gl = null;
      figure.classList.remove('is-live');
    });
  }

  async function start() {
    const image = new Image();
    image.src = figure.dataset.image;
    const [data] = await Promise.all([
      fetch(figure.dataset.points).then(response => {
        if (!response.ok) throw new Error(`patch data: ${response.status}`);
        return response.json();
      }),
      image.decode(),
    ]);
    build(data, image);
    readTheme();
    bind();
    describe();
    resize();
    draw(1);  // first frame matches the <img> underneath exactly
    figure.classList.add('is-live');
    // Hold the flat photograph for a beat, then let it settle into its resting pose.
    setTimeout(() => { state.wakeTarget = 1; request(); }, reducedMotion.matches ? 0 : 650);
  }

  start().catch(error => console.warn('Patch field disabled:', error));
})();
