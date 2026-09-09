(function () {
  'use strict';

  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-story-chapter]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-chapter-link]'));
  var currentLabel = document.getElementById('current-chapter');
  var progress = document.querySelector('.story-progress span');
  var previous = document.querySelector('[data-story-prev]');
  var next = document.querySelector('[data-story-next]');
  var activeIndex = 0;

  function setActive(index) {
    activeIndex = Math.max(0, Math.min(index, scenes.length - 1));
    var chapter = scenes[activeIndex].getAttribute('data-story-chapter');
    currentLabel.textContent = chapter;
    links.forEach(function (link) {
      var isActive = link.getAttribute('data-chapter-link') === chapter;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === scenes.length - 1;
  }

  function goTo(index) {
    if (scenes[index]) scenes[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  previous.addEventListener('click', function () { goTo(activeIndex - 1); });
  next.addEventListener('click', function () { goTo(activeIndex + 1); });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) setActive(scenes.indexOf(entry.target));
    });
  }, { threshold: 0.52 });

  scenes.forEach(function (scene) { observer.observe(scene); });

  function updateProgress() {
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    var value = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progress.style.width = Math.max(0, Math.min(value, 100)) + '%';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
  setActive(0);
}());
