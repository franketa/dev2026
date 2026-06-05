// Gran Palace — Main JS
(function() {
  'use strict';

  // --- Nav scroll effect ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 60);
  });

  // --- Mobile nav toggle ---
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  toggle.addEventListener('click', () => {
    menu.classList.toggle('nav__menu--open');
  });
  menu.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => menu.classList.remove('nav__menu--open'));
  });

  // --- Smooth scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Counter animation ---
  function animateCounters(entries, observer) {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const counters = entry.target.querySelectorAll('[data-target]');
      counters.forEach(counter => {
        const target = parseInt(counter.dataset.target);
        const duration = 2000;
        const start = performance.now();
        function update(now) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          counter.textContent = Math.round(target * eased);
          if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
      });
      observer.unobserve(entry.target);
    });
  }
  const statsSection = document.querySelector('.stats');
  if (statsSection) {
    new IntersectionObserver(animateCounters, { threshold: 0.5 }).observe(statsSection);
  }

  // --- Scroll reveal ---
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal--visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 0.1}s`;
    revealObserver.observe(el);
  });

  // --- Parallax hero ---
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
      }
    });
  }
})();
