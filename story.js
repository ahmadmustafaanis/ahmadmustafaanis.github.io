(() => {
  'use strict';
  const chapters = [...document.querySelectorAll('.chapter')];
  const stops = [...document.querySelectorAll('.journey-stops a')];
  const dock = document.querySelector('.journey-dock');
  const previous = document.getElementById('previous-chapter');
  const next = document.getElementById('next-chapter');
  const toggle = document.getElementById('reading-toggle');
  const number = document.getElementById('chapter-number');
  const name = document.getElementById('chapter-name');
  const caption = document.getElementById('orbit-caption');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.getElementById('universe-canvas');
  const ctx = canvas.getContext('2d');
  const colors = chapters.map(chapter => chapter.dataset.color.match(/../g).map(c => parseInt(c, 16)));
  let active = -1, positions = [], reading = false, pending = false;
  let animation = 0, lastFrame = 0, time = 0, width = 0, height = 0;
  let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0, transition = 1;
  let blendColor = [...colors[0]];
  const TAU = Math.PI * 2;
  const count = 1500;
  let seed = 47;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: 150 }, () => ({ x: random(), y: random(), size: .2 + random() * 1.05, alpha: .12 + random() * .45 }));

  // The same points travel between chapter-specific geometries.
  const shapes = chapters.map((chapter, scene) => Array.from({ length: count }, (_, i) => {
    const u = i / count, a = u * TAU, b = ((i * .61803398875) % 1) * TAU;
    const phi = Math.acos(1 - 2 * u);
    const sphere = [Math.sin(phi) * Math.cos(b), Math.sin(phi) * Math.sin(b), Math.cos(phi)];
    if (scene === 0) {
      const tube = .2 + .06 * Math.sin(a * 7);
      return [(1 + tube * Math.cos(b)) * Math.cos(a), tube * Math.sin(b), (1 + tube * Math.cos(b)) * Math.sin(a)];
    }
    if (scene === 1) {
      const x = (i % 30) / 15 - 1, z = Math.floor(i / 30) / 25 - 1;
      return [x, Math.sin(x * 3 + z * 2) * .3, z];
    }
    if (scene === 2) {
      const r = 1 + .1 * Math.sin(b * 6) * Math.sin(phi * 7);
      return sphere.map(v => v * r);
    }
    if (scene === 3) {
      const layer = i % 5, wave = a * 2 + layer * .5;
      return [Math.cos(wave) * (.75 + layer * .075), (layer - 2) * .32 + Math.sin(wave * 3) * .05, Math.sin(wave) * (.75 + layer * .075)];
    }
    if (scene === 4) {
      const angle = (i % 3) * TAU / 3;
      return [sphere[0] * .38 + Math.cos(angle) * .72, sphere[1] * .38 + Math.sin(angle) * .55, sphere[2] * .38];
    }
    if (scene === 5) {
      const angle = a * 3.4;
      return [Math.cos(angle) * (.6 + u * .45), (u - .5) * 1.7, Math.sin(angle) * (.6 + u * .45)];
    }
    if (scene === 6) {
      const x = u * 2.8 - 1.4, radius = .07 + Math.pow(Math.abs(x) / 1.4, 3) * .5;
      return [x, Math.cos(b) * radius, Math.sin(b) * radius];
    }
    if (scene === 7) {
      const band = Math.round(phi / .24) * .24;
      return [Math.sin(band) * Math.cos(b), Math.cos(band), Math.sin(band) * Math.sin(b)];
    }
    if (scene === 8) {
      const angle = a * 5, r = Math.sqrt(u) * 1.35;
      return [Math.cos(angle) * r, (random() - .5) * .16, Math.sin(angle) * r];
    }
    if (scene === 9) {
      const group = i % 3, x = Math.cos(a) * 1.1, y = Math.sin(a) * 1.1, z = Math.sin(b) * .07;
      return group === 0 ? [x, y, z] : group === 1 ? [x, z, y] : [z, x, y];
    }
    if (scene === 10) {
      const ring = i % 4;
      return [Math.cos(a) * .85, (ring - 1.5) * .38 + Math.cos(b) * .025, Math.sin(a) * .85];
    }
    const r = .95 + .12 * Math.cos(b);
    return [Math.cos(a) * r, Math.sin(a) * r, Math.sin(b) * .12];
  }));
  const points = shapes[0].map(p => [...p]);
  let origins = points.map(p => [...p]);

  function measure() {
    positions = chapters.map(chapter => chapter.getBoundingClientRect().top + scrollY);
    if (ctx) {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    update(); wake();
  }

  function setActive(index) {
    if (index === active) return;
    active = index;
    origins = points.map(p => [...p]);
    transition = reducedMotion.matches ? 1 : 0;
    document.documentElement.style.setProperty('--accent', '#' + chapters[index].dataset.color);
    number.textContent = String(index).padStart(2, '0');
    name.textContent = chapters[index].dataset.title;
    caption.textContent = chapters[index].dataset.caption;
    stops.forEach((stop, i) => {
      if (i === index) stop.setAttribute('aria-current', 'step');
      else stop.removeAttribute('aria-current');
      stop.classList.toggle('visited', i < index);
    });
    previous.disabled = index === 0; next.disabled = index === chapters.length - 1;
    wake();
  }

  function update() {
    pending = false;
    const marker = scrollY + innerHeight * .47;
    let index = 0;
    positions.forEach((top, i) => { if (top <= marker) index = i; });
    setActive(index);
  }

  function goTo(index) {
    if (index < 0 || index >= chapters.length) return;
    chapters[index].scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + chapters[index].id);
  }

  function render(stamp) {
    animation = 0;
    if (!ctx || reading || document.hidden) return;
    if (!reducedMotion.matches && stamp - lastFrame < 32) { animation = requestAnimationFrame(render); return; }
    const dt = Math.min((stamp - lastFrame) / 1000 || .033, .06);
    lastFrame = stamp;
    if (!reducedMotion.matches) time += dt;
    transition = Math.min(1, transition + dt * .9);
    const ease = transition * transition * (3 - 2 * transition);
    const target = shapes[Math.max(0, active)], color = colors[Math.max(0, active)];
    blendColor = blendColor.map((c, i) => reducedMotion.matches ? color[i] : c + (color[i] - c) * .06);
    const rgb = blendColor.map(Math.round).join(',');
    const small = width <= 760;
    const centerX = width * (small ? .64 : .77), centerY = height * (small ? .27 : .46);
    const scale = Math.min(width * (small ? .34 : .255), height * (small ? .245 : .36));
    mouseX += (targetX - mouseX) * .035; mouseY += (targetY - mouseY) * .035;
    const angleY = time * .07 + mouseX * .13, angleX = -.43 + mouseY * .1;
    const cy = Math.cos(angleY), sy = Math.sin(angleY), cx = Math.cos(angleX), sx = Math.sin(angleX);
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(centerX, centerY, scale * .1, centerX, centerY, scale * 1.65);
    glow.addColorStop(0, `rgba(${rgb},.085)`); glow.addColorStop(.5, `rgba(${rgb},.045)`); glow.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    stars.forEach(star => {
      const x = (star.x * width + time * (star.size * .9) + mouseX * star.size * 8) % width;
      const y = star.y * height + mouseY * star.size * 6;
      ctx.fillStyle = `rgba(202,218,227,${star.alpha})`; ctx.fillRect(x, y, star.size, star.size);
    });
    const projected = points.map((point, i) => {
      for (let axis = 0; axis < 3; axis++) point[axis] = origins[i][axis] + (target[i][axis] - origins[i][axis]) * ease;
      const x = point[0] * cy - point[2] * sy, z = point[0] * sy + point[2] * cy;
      const y = point[1] * cx - z * sx, depth = point[1] * sx + z * cx;
      const perspective = 3.5 / (3.5 + depth);
      return { x: centerX + (x * .966 - y * .259) * scale * perspective, y: centerY + (x * .259 + y * .966) * scale * perspective, z: depth, alpha: Math.max(.12, .63 - depth * .28), size: Math.max(.55, 1.15 - depth * .3) };
    });
    ctx.lineWidth = .55;
    projected.forEach((p, i) => {
      if (i % 3 !== 0) return;
      const q = projected[(i + 17) % count], distance = Math.hypot(p.x - q.x, p.y - q.y);
      if (distance < scale * .19 && distance > 2) {
        ctx.strokeStyle = `rgba(${rgb},${(1 - distance / (scale * .19)) * .11})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    });
    projected.sort((a, b) => b.z - a.z);
    projected.forEach(p => {
      ctx.fillStyle = `rgba(${rgb},${p.alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    });
    ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(-.27);
    ctx.strokeStyle = `rgba(${rgb},.14)`; ctx.lineWidth = .65; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.ellipse(0, 0, scale * 1.52, scale * .66, 0, .3, 5.8); ctx.stroke(); ctx.restore();
    if (!reducedMotion.matches) animation = requestAnimationFrame(render);
  }

  function wake() {
    if (ctx && !animation && !reading && !document.hidden) animation = requestAnimationFrame(render);
  }

  previous.addEventListener('click', () => goTo(active - 1));
  next.addEventListener('click', () => goTo(active + 1));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(active + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(active - 1); }
  });
  addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener('resize', measure);
  addEventListener('pointermove', event => {
    if (reducedMotion.matches || event.pointerType !== 'mouse') return;
    targetX = event.clientX / innerWidth - .5; targetY = event.clientY / innerHeight - .5;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(animation); animation = 0; }
    else wake();
  });
  toggle.addEventListener('click', () => {
    const chapter = chapters[active];
    reading = !reading;
    document.body.classList.toggle('reading-view', reading);
    toggle.setAttribute('aria-pressed', String(reading));
    toggle.textContent = reading ? 'Journey view' : 'Reading view';
    measure(); chapter.scrollIntoView({ behavior: 'instant', block: 'start' }); update();
  });
  reducedMotion.addEventListener('change', () => { transition = 1; measure(); });
  if (ctx) document.body.classList.add('has-canvas');
  dock.hidden = false; toggle.hidden = false;
  measure();
  if (document.fonts) document.fonts.ready.then(measure);
  addEventListener('load', measure, { once: true });
})();
