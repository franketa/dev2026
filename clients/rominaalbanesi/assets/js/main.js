/* Romina Albanesi — interacciones del sitio */
(function () {
  'use strict';

  /* ---- Header: en el inicio, fondo sólido al scrollear fuera del hero.
         En páginas interiores el header ya es sólido por CSS (.page-interior). ---- */
  var header = document.querySelector('.site-header');
  var hero = document.querySelector('.hero');
  if (header && hero) {
    var onScroll = function () {
      var threshold = hero.offsetHeight - 120;
      if (window.scrollY > threshold) header.classList.add('site-header--solid');
      else header.classList.remove('site-header--solid');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

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

  /* ---- Libros: abrir el detalle al hacer click en el libro ---- */
  var bookCards = document.querySelectorAll('.book-card');
  if (bookCards.length) {
    var details = document.querySelectorAll('.book-detail');
    var closeAllBooks = function () {
      bookCards.forEach(function (c) { c.setAttribute('aria-expanded', 'false'); });
      details.forEach(function (d) { d.hidden = true; });
    };
    bookCards.forEach(function (card) {
      card.addEventListener('click', function () {
        var panel = document.getElementById(card.getAttribute('aria-controls'));
        var wasOpen = card.getAttribute('aria-expanded') === 'true';
        closeAllBooks();
        if (!wasOpen && panel) {
          card.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  }
})();
