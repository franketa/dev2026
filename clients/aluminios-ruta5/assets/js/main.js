// Aluminios Ruta 5 · comportamiento compartido (nav, menú, reveal, barra mobile)
(function () {
  'use strict';

  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const menu = document.querySelector('.menu');
  const mobileBar = document.querySelector('.mobile-bar');

  // ----- Nav: fondo al scrollear + ocultar al bajar / mostrar al subir -----
  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    if (nav) {
      nav.classList.toggle('nav--scrolled', y > 24);
      const goingDown = y > lastY && y > 240;
      nav.classList.toggle('nav--hidden', goingDown && !document.body.classList.contains('menu-open'));
    }
    if (mobileBar) mobileBar.classList.toggle('mobile-bar--visible', y > 420);
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  // ----- Menú mobile -----
  function setMenu(open) {
    if (!menu || !toggle) return;
    document.body.classList.toggle('menu-open', open);
    menu.classList.toggle('menu--open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) nav.classList.remove('nav--hidden');
  }
  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(!menu.classList.contains('menu--open')));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });
  }

  // ----- Reveal on scroll -----
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-in'));
  }

  // ----- Link activo según sección visible (solo home) -----
  const sections = document.querySelectorAll('main section[id]');
  const navLinks = document.querySelectorAll('.nav__links a[href^="#"]');
  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          navLinks.forEach(a => a.removeAttribute('aria-current'));
          const active = document.querySelector(`.nav__links a[href="#${en.target.id}"]`);
          if (active) active.setAttribute('aria-current', 'page');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => spy.observe(s));
  }

  // ----- Helpers globales -----
  window.R5 = window.R5 || {};
  R5.WA_NUMBER = '5492346411139';
  R5.waLink = function (text) {
    return `https://wa.me/${R5.WA_NUMBER}?text=${encodeURIComponent(text || 'Hola Aluminios Ruta 5, quiero hacer una consulta.')}`;
  };
  R5.fmtPrice = function (n, moneda) {
    const cur = moneda === 'USD' ? 'USD ' : '$ ';
    return cur + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  };
  R5.escape = function (s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  R5.placeholderFor = function (categoria) {
    const map = {
      'Perfiles': 'perfil', 'Aberturas': 'abertura', 'Wall Panels': 'panel',
      'Accesorios': 'accesorio', 'Herrajes': 'herraje'
    };
    return `/assets/img/ph/${map[categoria] || 'perfil'}.svg`;
  };
  R5.stockBadge = function (stock) {
    if (stock === 'a-pedido') return '<span class="badge badge--warn">A pedido</span>';
    if (stock === 'sin-stock') return '<span class="badge badge--off">Sin stock</span>';
    return '<span class="badge badge--ok">En stock</span>';
  };
  // Tarjeta de producto (misma en home y catálogo)
  R5.productCard = function (p, opts) {
    opts = opts || {};
    const e = R5.escape;
    const hasImg = !!p.coverImage;
    const img = hasImg ? p.coverImage : R5.placeholderFor(p.categoria);
    const meta = [p.linea && `Línea ${p.linea}`, p.medidas, p.terminacion].filter(Boolean).join(' · ');
    const price = p.mostrarPrecio && p.precio > 0
      ? `<span class="pcard__price">${R5.fmtPrice(p.precio, p.moneda)} <small>/ ${e(p.unidad)}</small></span>`
      : `<span class="pcard__price pcard__price--ask"><small>Precio a consultar</small></span>`;
    return `
      <article class="pcard ${opts.className || ''}" data-id="${p.id}">
        <div class="pcard__media ${hasImg ? '' : 'pcard__media--placeholder'}">
          <img src="${e(img)}" alt="${e(p.nombre)}" loading="lazy" decoding="async">
          <div class="pcard__badges">
            ${p.destacado ? '<span class="badge badge--blue">Destacado</span>' : ''}
            ${R5.stockBadge(p.stock)}
          </div>
        </div>
        <div class="pcard__body">
          <span class="pcard__cat">${e(p.categoria)}</span>
          <h3 class="pcard__title"><a href="/producto/${e(p.slug)}">${e(p.nombre)}</a></h3>
          ${meta ? `<p class="pcard__meta">${e(meta)}</p>` : ''}
          <div class="pcard__foot">
            ${price}
            <span class="pcard__cta">Ver <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
          </div>
        </div>
      </article>`;
  };

  // Año en footer
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
