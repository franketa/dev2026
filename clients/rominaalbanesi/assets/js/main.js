/* Romina Albanesi — interacciones del sitio */
(function () {
  'use strict';

  /* ---- Header: fondo sólido al scrollear fuera del hero ---- */
  var header = document.querySelector('.site-header');
  var hero = document.querySelector('.hero');
  function onScroll() {
    var threshold = hero ? hero.offsetHeight - 120 : 80;
    if (window.scrollY > threshold) header.classList.add('site-header--solid');
    else header.classList.remove('site-header--solid');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Menú mobile ---- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('siteNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('site-nav--open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.site-nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('site-nav--open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
