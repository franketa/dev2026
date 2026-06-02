// Garrahan Automotores — Main JS
(function () {
  'use strict';

  const fmt = n => new Intl.NumberFormat('es-AR').format(n);
  const wa = (num, txt) => 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  const WA_FELIPE = '5492345428151';

  // ===== Vehículos (datos de muestra basados en el stock de la concesionaria) =====
  // precio en ARS; null => "Consultar precio"
  const vehiculos = [
    // --- 0KM ---
    { marca: 'Chery', modelo: 'Tiggo 4 Hybrid', version: 'Comfort', anio: 2025, km: 0, motor: '1.5T Híbrido', transmision: 'Automática', tipo: 'SUV', condicion: '0km', precio: null,
      img: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80' },
    { marca: 'Chery', modelo: 'Tiggo 7 Pro Hybrid', version: 'Luxury', anio: 2025, km: 0, motor: '1.5T Híbrido', transmision: 'Automática', tipo: 'SUV', condicion: '0km', precio: null,
      img: 'https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=800&q=80' },
    { marca: 'Fiat', modelo: 'Titano', version: 'Ranch 4x4', anio: 2025, km: 0, motor: '2.2 Turbodiésel', transmision: 'Automática', tipo: 'Pickup', condicion: '0km', precio: null,
      img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80' },
    { marca: 'Fiat', modelo: 'Strada', version: 'Volcano CD', anio: 2025, km: 0, motor: '1.3 Nafta', transmision: 'Manual', tipo: 'Pickup', condicion: '0km', precio: null,
      img: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800&q=80' },

    // --- USADOS ---
    { marca: 'Toyota', modelo: 'Corolla Cross', version: 'XEI', anio: 2023, km: 38000, motor: '2.0 Nafta', transmision: 'Automática CVT', tipo: 'SUV', condicion: 'usado', precio: 32500000,
      img: 'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800&q=80' },
    { marca: 'Renault', modelo: 'Alaskan', version: 'Intens 4x4', anio: 2022, km: 61000, motor: '2.3 Biturbo Diésel', transmision: 'Automática', tipo: 'Pickup', condicion: 'usado', precio: 38900000,
      img: 'https://images.unsplash.com/photo-1599912027806-cfec9f5944b6?w=800&q=80' },
    { marca: 'Volkswagen', modelo: 'Voyage', version: 'Comfortline', anio: 2019, km: 78000, motor: '1.6 Nafta', transmision: 'Manual', tipo: 'Sedán', condicion: 'usado', precio: 14500000,
      img: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&q=80' },
    { marca: 'Volkswagen', modelo: 'Suran', version: 'Highline', anio: 2018, km: 95000, motor: '1.6 Nafta', transmision: 'Manual', tipo: 'Hatchback', condicion: 'usado', precio: 12800000,
      img: 'https://images.unsplash.com/photo-1471444928139-48c5bf5173f8?w=800&q=80' },
    { marca: 'Volkswagen', modelo: 'Fox', version: 'Trendline', anio: 2017, km: 102000, motor: '1.6 Nafta', transmision: 'Manual', tipo: 'Hatchback', condicion: 'usado', precio: 11200000,
      img: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80' },
    { marca: 'Citroën', modelo: 'C4', version: 'Pack Look', anio: 2016, km: 110000, motor: '1.6 Nafta', transmision: 'Manual', tipo: 'Hatchback', condicion: 'usado', precio: 10500000,
      img: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80' },
    { marca: 'DS', modelo: 'DS3', version: 'So Chic', anio: 2017, km: 88000, motor: '1.6 THP Nafta', transmision: 'Manual', tipo: 'Hatchback', condicion: 'usado', precio: 13900000,
      img: 'https://images.unsplash.com/photo-1542362567-b07e54358753?w=800&q=80' }
  ];

  // ===== Render de vehículos =====
  const grid = document.getElementById('stockGrid');
  const empty = document.getElementById('stockEmpty');

  function tarjeta(v) {
    const badge = v.condicion === '0km'
      ? '<span class="card__badge card__badge--0km">0KM</span>'
      : '<span class="card__badge card__badge--usado">Usado</span>';
    const precio = v.precio
      ? '$' + fmt(v.precio) + '<small>Precio de lista</small>'
      : 'Consultar precio<small>Financiación disponible</small>';
    const km = v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km';
    const msg = 'Hola, me interesa el ' + v.marca + ' ' + v.modelo + ' ' + v.version + ' ' + v.anio + '. ¿Sigue disponible?';
    return '' +
      '<article class="card">' +
        '<div class="card__media">' + badge +
          '<img src="' + v.img + '" alt="' + v.marca + ' ' + v.modelo + '" loading="lazy">' +
        '</div>' +
        '<div class="card__body">' +
          '<span class="card__brand">' + v.marca + '</span>' +
          '<h3 class="card__name">' + v.modelo + ' ' + v.version + '</h3>' +
          '<div class="card__specs">' +
            '<span class="card__spec">📅 <b>' + v.anio + '</b></span>' +
            '<span class="card__spec">🛣️ <b>' + km + '</b></span>' +
            '<span class="card__spec">⚙️ <b>' + v.transmision + '</b></span>' +
            '<span class="card__spec">🔧 <b>' + v.motor + '</b></span>' +
          '</div>' +
          '<div class="card__foot">' +
            '<div class="card__price">' + precio + '</div>' +
            '<a href="' + wa(WA_FELIPE, msg) + '" class="btn btn--primary btn--sm card__cta" target="_blank" rel="noopener">Consultar</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render(lista) {
    if (!lista.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = lista.map(tarjeta).join('');
  }
  render(vehiculos);

  // ===== Filtros =====
  const fCond = document.getElementById('filtroCondicion');
  const fMarca = document.getElementById('filtroMarca');
  const fTipo = document.getElementById('filtroTipo');

  function filtrar() {
    let r = vehiculos;
    if (fCond.value) r = r.filter(v => v.condicion === fCond.value);
    if (fMarca.value) r = r.filter(v => v.marca === fMarca.value);
    if (fTipo.value) r = r.filter(v => v.tipo === fTipo.value);
    render(r);
  }
  [fCond, fMarca, fTipo].forEach(s => s.addEventListener('change', filtrar));
  document.getElementById('filtroLimpiar').addEventListener('click', () => {
    fCond.value = ''; fMarca.value = ''; fTipo.value = '';
    render(vehiculos);
  });

  // ===== Calculadora de financiación =====
  const TASA = 0.055; // tasa mensual estimada
  function cuota(monto, plazo) {
    if (!monto || !plazo) return 0;
    return Math.round((monto * TASA) / (1 - Math.pow(1 + TASA, -plazo)));
  }
  function calcular() {
    const monto = parseInt(document.getElementById('calcPrecio').value) || 0;
    const plazo = parseInt(document.getElementById('calcPlazo').value);
    const c = cuota(monto, plazo);
    document.getElementById('calcAmount').textContent = '$' + fmt(c);
    document.getElementById('calcTotal').textContent = c ? plazo + ' cuotas fijas' : '';
  }
  document.getElementById('calcPrecio').addEventListener('input', calcular);
  document.getElementById('calcPlazo').addEventListener('change', calcular);
  calcular();

  // ===== Galería (placeholders profesionales) =====
  const galImgs = [
    { src: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80', cls: 'galeria__item--wide', alt: 'Local Garrahan Automotores' },
    { src: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80', cls: '', alt: 'Vehículo en exhibición' },
    { src: 'https://images.unsplash.com/photo-1493238792000-8113da705763?w=600&q=80', cls: '', alt: 'Entrega de unidad' },
    { src: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80', cls: 'galeria__item--tall', alt: 'Vehículo deportivo' },
    { src: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&q=80', cls: '', alt: 'Auto usado seleccionado' },
    { src: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&q=80', cls: 'galeria__item--wide', alt: 'Showroom' },
    { src: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&q=80', cls: '', alt: 'Entrega de llaves' }
  ];
  const galGrid = document.getElementById('galeriaGrid');
  if (galGrid) {
    galGrid.innerHTML = galImgs.map(g =>
      '<figure class="galeria__item ' + g.cls + '"><img src="' + g.src + '" alt="' + g.alt + '" loading="lazy"></figure>'
    ).join('');
  }

  // ===== Nav =====
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('nav--scrolled', window.scrollY > 50));

  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  toggle.addEventListener('click', () => {
    menu.classList.toggle('nav__menu--open');
    toggle.classList.toggle('nav__toggle--open');
  });
  menu.querySelectorAll('.nav__link').forEach(l => l.addEventListener('click', () => {
    menu.classList.remove('nav__menu--open');
    toggle.classList.remove('nav__toggle--open');
  }));

  // ===== Smooth scroll =====
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const t = document.querySelector(id);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // ===== Contador de stats =====
  const statsEl = document.querySelector('.stats__grid');
  if (statsEl) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.querySelectorAll('[data-target]').forEach(c => {
          const target = parseInt(c.dataset.target);
          const start = performance.now();
          (function step(now) {
            const p = Math.min((now - start) / 1800, 1);
            c.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(step);
          })(start);
        });
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.4 }).observe(statsEl);
  }

  // ===== Scroll reveal =====
  const revObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('reveal--visible'); revObs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revObs.observe(el));
})();
