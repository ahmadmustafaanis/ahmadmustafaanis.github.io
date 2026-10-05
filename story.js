(() => {
  'use strict';
  const M = window.Motion;
  const animated = Boolean(M) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.storyReady = true;
  if (!animated) document.documentElement.classList.remove('motion');

  const chapters = [...document.querySelectorAll('.chapter')];
  const links = [...document.querySelectorAll('.story-index a')];
  const nav = document.querySelector('.story-index');
  const highlight = document.getElementById('index-highlight');
  const progressBar = document.getElementById('progress-bar');
  const railFill = document.getElementById('rail-fill');
  const number = document.getElementById('chapter-number');
  const name = document.getElementById('chapter-name');
  const ease = [0.22, 1, 0.36, 1];
  const spring = { type: 'spring', stiffness: 380, damping: 34 };
  let active = -1, pending = false;

  // Swap text with a quick blur-out / blur-in, keeping only the latest value if changes overlap.
  function morph(el, text) {
    el.dataset.next = text;
    if (!animated) { el.textContent = text; return; }
    M.animate(el, { opacity: 0, y: -6, filter: 'blur(4px)' }, { duration: 0.16 }).then(() => {
      el.textContent = el.dataset.next;
      M.animate(el, { opacity: [0, 1], y: [6, 0], filter: ['blur(4px)', 'blur(0px)'] }, { duration: 0.32, ease });
    });
  }

  function placeHighlight(instant) {
    const link = links[active];
    if (!link || !nav.offsetParent) return;
    const y = link.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    const frame = { y, height: link.offsetHeight, opacity: 1 };
    if (M) M.animate(highlight, frame, animated && !instant ? spring : { duration: 0 });
    else Object.assign(highlight.style, { transform: `translateY(${y}px)`, height: `${frame.height}px`, opacity: 1 });
  }

  function setActive(index) {
    if (index === active) return;
    const first = active === -1;
    active = index;
    links.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    morph(number, String(index).padStart(2, '0'));
    morph(name, chapters[index].dataset.title);
    placeHighlight(first);
  }

  function update() {
    pending = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const progress = max > 0 ? Math.min(1, scrollY / max) : 0;
    progressBar.style.transform = `scaleX(${progress})`;
    railFill.style.transform = `scaleY(${progress})`;
    const marker = innerHeight * 0.45;
    let index = 0;
    chapters.forEach((chapter, i) => { if (chapter.getBoundingClientRect().top <= marker) index = i; });
    setActive(index);
  }

  function goTo(index) {
    if (index < 0 || index >= chapters.length) return;
    chapters[index].scrollIntoView({ behavior: animated ? 'smooth' : 'instant', block: 'start' });
    history.replaceState(null, '', '#' + chapters[index].id);
  }

  // Wrap each word of a heading so it can blur in on its own; counters stay whole.
  function splitWords(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = child.textContent.split(/(\s+)/).filter(Boolean);
        child.replaceWith(...parts.map(part => {
          if (/^\s+$/.test(part)) return document.createTextNode(part);
          const word = document.createElement('span');
          word.className = 'word'; word.textContent = part;
          return word;
        }));
      } else if (child.classList?.contains('count')) child.classList.add('word');
      else if (child.nodeType === Node.ELEMENT_NODE) splitWords(child);
    });
  }

  function countUp(el, delay) {
    const target = Number(el.dataset.to), suffix = el.dataset.suffix || '';
    const format = value => Math.round(value).toLocaleString('en-US') + suffix;
    el.textContent = format(0);
    M.animate(0, target, { duration: 1.6, delay, ease: [0.16, 1, 0.3, 1], onUpdate: v => { el.textContent = format(v); } })
      .then(() => { el.textContent = format(target); });
  }

  function reveal(chapter) {
    const eyebrow = chapter.querySelector('.eyebrow');
    const heading = chapter.querySelector('h1, h2');
    const words = heading.querySelectorAll('.word');
    const blocks = chapter.querySelectorAll('[data-reveal]');
    const settled = 0.15 + words.length * 0.06;

    M.animate(eyebrow, { opacity: [0, 1], y: [10, 0] }, { duration: 0.5, ease });
    heading.style.opacity = 1;
    M.animate(words, { opacity: [0, 1], y: [22, 0], filter: ['blur(10px)', 'blur(0px)'] }, { duration: 0.8, ease, delay: M.stagger(0.06, { startDelay: 0.15 }) });
    setTimeout(() => heading.querySelectorAll('em').forEach(em => em.classList.add('lit')), (settled + 0.25) * 1000);
    M.animate(blocks, { opacity: [0, 1], y: [16, 0], filter: ['blur(6px)', 'blur(0px)'] }, { duration: 0.7, ease, delay: M.stagger(0.12, { startDelay: settled }) });
    chapter.querySelectorAll('.count').forEach(el => countUp(el, settled));

    const route = chapter.querySelector('.route');
    if (route) {
      const start = settled + 0.3;
      M.animate(route.querySelector('.route-track'), { strokeDashoffset: [1, 0] }, { duration: 1.8, delay: start, ease: [0.65, 0, 0.35, 1] });
      M.animate(route.querySelector('.route-end'), { opacity: [0, 1], scale: [0, 1] }, { ...spring, delay: start + 1.6 });
      M.animate(route.querySelector('.route-traveller'), { opacity: [0, 1] }, { duration: 0.4, delay: start + 1.9 });
    }
    chapter.querySelectorAll('.tally path').forEach((path, i) => {
      M.animate(path, { strokeDashoffset: [1, 0] }, { duration: 0.5, delay: settled + 0.5 + i * 0.35, ease });
    });
  }

  if (animated) {
    chapters.forEach(chapter => {
      splitWords(chapter.querySelector('h1, h2'));
      let shown = false;
      M.inView(chapter, () => {
        if (shown) return;
        shown = true;
        reveal(chapter);
      }, { margin: '0px 0px -20% 0px' });
    });
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(active + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(active - 1); }
  });
  addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener('resize', () => { update(); placeHighlight(true); });
  update();
  if (document.fonts) document.fonts.ready.then(() => placeHighlight(true));
})();
