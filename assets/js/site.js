/* Marks the header link for the homepage section currently being read. */
(() => {
  'use strict';
  const links = [...document.querySelectorAll('.site-nav a[href*="#"]')]
    .map(link => ({ link, target: document.getElementById(new URL(link.href).hash.slice(1)) }))
    .filter(entry => entry.target && new URL(entry.link.href).pathname === location.pathname);
  if (!links.length || !('IntersectionObserver' in window)) return;

  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
    const current = links.find(({ target }) => visible.has(target));
    links.forEach(({ link }) => (link === current?.link ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current')));
  }, { rootMargin: '-30% 0px -55% 0px' });
  links.forEach(({ target }) => observer.observe(target));
})();
