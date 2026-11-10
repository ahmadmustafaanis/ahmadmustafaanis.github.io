/*
 * Story page globe: a line-drawn Earth with the great-circle route from
 * Islamabad to Pittsburgh. Canvas 2D, orthographic projection, no dependencies.
 * Coastlines are Natural Earth 1:110m (world-atlas); if they fail to load the
 * globe still draws its graticule and the route.
 */
(() => {
  'use strict';

  const figure = document.querySelector('[data-globe]');
  if (!figure) return;
  const canvas = figure.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
  const RAD = Math.PI / 180;
  const ROUTE_SECONDS = 2.4;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Unit vector for a place, in a frame where +y is north and +z faces longitude 0.
  const place = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
  const from = place(33.6844, 73.0479);   // Islamabad
  const to = place(40.4406, -79.9959);    // Pittsburgh
  const span = Math.acos(from[0] * to[0] + from[1] * to[1] + from[2] * to[2]);

  // Point on the great circle between the two cities, t in 0..1.
  function along(t) {
    const a = Math.sin((1 - t) * span) / Math.sin(span);
    const b = Math.sin(t * span) / Math.sin(span);
    return [a * from[0] + b * to[0], a * from[1] + b * to[1], a * from[2] + b * to[2]];
  }

  // Face the meridian halfway between the two cities, from well south of the route,
  // so both stay in view and the route arches over the top of the globe.
  const centreLon = ((73.0479 - 79.9959) / 2) * RAD;
  const centreLat = Math.asin(along(0.5)[1]) * 0.42;

  const ROUTE_STEPS = 96;
  const route = Array.from({ length: ROUTE_STEPS + 1 }, (_, i) => along(i / ROUTE_STEPS));

  // Graticule every 30 degrees.
  const graticule = [];
  for (let lon = -180; lon < 180; lon += 30) {
    graticule.push(Array.from({ length: 61 }, (_, i) => place(-90 + i * 3, lon)));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    graticule.push(Array.from({ length: 121 }, (_, i) => place(lat, -180 + i * 3)));
  }

  let coast = [];
  let colours = {};
  let size = 0, ratio = 1;
  let turn = 0, tilt = 0;
  let progress = 0, playing = false, clock = 0, last = 0, frame = 0, visible = true;

  function readColours() {
    const style = getComputedStyle(figure);
    const token = name => style.getPropertyValue(name).trim();
    colours = {
      ink: token('--ink'), soft: token('--ink-soft'), muted: token('--muted'),
      line: token('--line-strong'), surface: token('--surface'), wash: token('--wash'), accent: token('--accent-bright'),
    };
  }

  // Rotate into view space (x right, y up, z towards the viewer).
  function view([x, y, z]) {
    const cl = Math.cos(turn), sl = Math.sin(turn);
    const x1 = x * cl - z * sl;
    const z1 = x * sl + z * cl;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  }

  // Stroke the parts of a polyline that face the viewer. `lift` raises it off the surface.
  function trace(points, radius, centre, lift = () => 1, upTo = points.length - 1) {
    context.beginPath();
    let drawing = false;
    for (let i = 0; i <= upTo; i++) {
      const [x, y, z] = view(points[i]);
      const k = lift(i / (points.length - 1));
      const shown = z > 0 || (k > 1 && (x * x + y * y) * k * k > 1);
      if (!shown) { drawing = false; continue; }
      const px = centre + x * k * radius, py = centre - y * k * radius;
      if (drawing) context.lineTo(px, py); else context.moveTo(px, py);
      drawing = true;
    }
    context.stroke();
  }

  const arc = t => 1 + 0.13 * Math.sin(Math.PI * t);

  function label(text, point, radius, centre) {
    const [x, y, z] = view(point);
    if (z <= 0) return;
    const tx = centre + x * radius, ty = centre - y * radius + 14 * ratio;
    context.font = `500 ${11 * ratio}px "IBM Plex Mono", ui-monospace, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 4 * ratio;
    context.strokeStyle = colours.surface;
    context.lineJoin = 'round';
    context.strokeText(text, tx, ty);
    context.fillStyle = colours.ink;
    context.fillText(text, tx, ty);
  }

  function dot(point, radius, centre, r, fill, lift = 1) {
    const [x, y, z] = view(point);
    if (z <= 0 && lift === 1) return;
    context.beginPath();
    context.arc(centre + x * lift * radius, centre - y * lift * radius, r * ratio, 0, 2 * Math.PI);
    context.fillStyle = fill;
    context.fill();
  }

  function draw() {
    const centre = size / 2;
    const radius = size * 0.4;
    context.clearRect(0, 0, size, size);

    // The sphere: a soft-lit disc.
    const shade = context.createRadialGradient(centre - radius * 0.35, centre - radius * 0.45, radius * 0.1, centre, centre, radius * 1.05);
    shade.addColorStop(0, colours.surface);
    shade.addColorStop(1, colours.wash);
    context.beginPath();
    context.arc(centre, centre, radius, 0, 2 * Math.PI);
    context.fillStyle = shade;
    context.fill();

    context.lineJoin = context.lineCap = 'round';
    context.lineWidth = 0.6 * ratio;
    context.strokeStyle = colours.line;
    context.globalAlpha = 0.7;
    graticule.forEach(line => trace(line, radius, centre));
    context.globalAlpha = 1;

    context.lineWidth = 0.9 * ratio;
    context.strokeStyle = colours.soft;
    coast.forEach(line => trace(line, radius, centre));

    context.lineWidth = 1 * ratio;
    context.strokeStyle = colours.ink;
    context.beginPath();
    context.arc(centre, centre, radius, 0, 2 * Math.PI);
    context.stroke();

    // The route: its track on the ground, then the flight above it.
    const reached = Math.round(progress * ROUTE_STEPS);
    context.setLineDash([2 * ratio, 4 * ratio]);
    context.lineWidth = 1 * ratio;
    context.strokeStyle = colours.accent;
    context.globalAlpha = 0.55;
    trace(route, radius, centre, undefined, reached);
    context.setLineDash([]);
    context.globalAlpha = 1;
    context.lineWidth = 2 * ratio;
    trace(route, radius, centre, arc, reached);

    dot(from, radius, centre, 3.5, colours.accent);
    if (progress >= 1) dot(to, radius, centre, 3.5, colours.accent);
    label('Islamabad', from, radius, centre);
    if (progress >= 1) label('Pittsburgh', to, radius, centre);

    // Something always in flight once the route is drawn.
    if (progress >= 1 && !reducedMotion.matches) {
      const t = (clock * 0.16) % 1;
      const eased = t * t * (3 - 2 * t);
      dot(along(eased), radius, centre, 3, colours.ink, arc(eased));
    }
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const still = reducedMotion.matches;
    if (!still) clock += dt;
    if (playing && progress < 1) progress = still ? 1 : Math.min(1, progress + dt / ROUTE_SECONDS);
    turn = centreLon + (still ? 0 : 0.1 * Math.sin(clock * 0.3));
    tilt = centreLat;
    draw();
    if (!still || (playing && progress < 1)) request();
  }

  function request() {
    if (frame || !visible || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 2);
    size = Math.round(canvas.clientWidth * ratio);
    if (!size) return;
    canvas.width = canvas.height = size;
    turn = centreLon;
    tilt = centreLat;
    draw();
    request();
  }

  // TopoJSON arcs are delta-encoded integer pairs; coastlines only need each arc as a line.
  function decode(topology) {
    const { scale, translate } = topology.transform;
    return topology.arcs.map(deltas => {
      let x = 0, y = 0;
      return deltas.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return place(y * scale[1] + translate[1], x * scale[0] + translate[0]);
      });
    });
  }

  figure.hidden = false;
  readColours();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; request(); }).observe(canvas);
  document.addEventListener('visibilitychange', request);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColours(); draw(); });
  if (document.fonts) document.fonts.ready.then(draw);

  fetch(LAND_URL)
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(`coastlines: ${response.status}`))))
    .then(topology => { coast = decode(topology); draw(); })
    .catch(error => console.warn('Globe drawn without coastlines:', error));

  // story.js starts the route when the opening chapter is revealed.
  window.storyGlobe = {
    play(delaySeconds = 0) {
      setTimeout(() => { playing = true; request(); }, delaySeconds * 1000);
    },
  };
  if (reducedMotion.matches) window.storyGlobe.play();
})();
