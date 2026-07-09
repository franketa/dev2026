// Garrahan — Negocio de Automotores · Main JS
(function () {
  'use strict';

  const fmt = n => new Intl.NumberFormat('es-AR').format(n);
  const wa = (num, txt) => 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  const WA_FELIPE = '5492345428151';

  // ===== Vehículos (desde la API — se cargan en el panel de administración) =====
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let vehiculos = [];

  // ===== Render de vehículos =====
  const grid = document.getElementById('stockGrid');
  const empty = document.getElementById('stockEmpty');

  function precioLabel(v) {
    if (!v.mostrarPrecio || !v.precio) return 'Consultar precio<small>Financiación disponible</small>';
    const sym = v.moneda === 'USD' ? 'US$' : '$';
    if (v.precioDescuento) {
      return '<s class="card__price-old">' + sym + fmt(v.precio) + '</s>' +
        '<span class="card__price-desc">' + sym + fmt(v.precioDescuento) + '</span>' +
        '<small>Precio con descuento</small>';
    }
    return sym + fmt(v.precio) + '<small>Precio de lista</small>';
  }

  function tarjeta(v) {
    let badge = v.condicion === '0km'
      ? '<span class="card__badge card__badge--0km">0KM</span>'
      : '<span class="card__badge card__badge--usado">Usado</span>';
    if (v.estado === 'reservado') badge += '<span class="card__badge card__badge--reservado" style="left:auto;right:14px">Reservado</span>';
    const km = v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km';
    return '' +
      '<article class="card card--click" data-id="' + v.id + '">' +
        '<div class="card__media">' + badge +
          '<img src="' + esc(v.coverImage || 'assets/img/logo.png') + '" alt="' + esc(v.marca + ' ' + v.modelo) + '" loading="lazy">' +
        '</div>' +
        '<div class="card__body">' +
          '<span class="card__brand">' + esc(v.marca) + '</span>' +
          '<h3 class="card__name">' + esc(v.modelo) + ' ' + esc(v.version) + '</h3>' +
          '<div class="card__specs">' +
            '<span class="card__spec">📅 <b>' + v.anio + '</b></span>' +
            '<span class="card__spec">🛣️ <b>' + km + '</b></span>' +
            '<span class="card__spec">⚙️ <b>' + esc(v.transmision) + '</b></span>' +
            '<span class="card__spec">🔧 <b>' + esc(v.motor) + '</b></span>' +
          '</div>' +
          '<div class="card__foot">' +
            '<div class="card__price">' + precioLabel(v) + '</div>' +
            '<a href="vehiculo.html?id=' + v.id + '" class="btn btn--primary btn--sm card__cta">Ver ficha</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render(lista) {
    if (!lista.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = lista.map(tarjeta).join('');
  }

  // Tarjeta entera clickeable hacia la ficha
  grid.addEventListener('click', e => {
    const card = e.target.closest('.card--click');
    if (card && !e.target.closest('a')) location.href = 'vehiculo.html?id=' + card.dataset.id;
  });

  // ===== Filtros =====
  const fCond = document.getElementById('filtroCondicion');
  const fMarca = document.getElementById('filtroMarca');
  const fTipo = document.getElementById('filtroTipo');

  function opciones(select, values, labelTodos) {
    const current = select.value;
    select.innerHTML = '<option value="">' + labelTodos + '</option>' +
      values.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
    select.value = current;
  }

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

  // Carga inicial desde la API
  fetch('/api/vehicles')
    .then(r => r.json())
    .then(data => {
      // Los vendidos no se muestran en la grilla pública
      vehiculos = data.vehicles.filter(v => v.estado !== 'vendido');
      opciones(fMarca, [...new Set(vehiculos.map(v => v.marca))].sort((a, b) => a.localeCompare(b, 'es')), 'Todas las marcas');
      opciones(fTipo, [...new Set(vehiculos.map(v => v.tipo))].sort((a, b) => a.localeCompare(b, 'es')), 'Todos los tipos');
      filtrar();
    })
    .catch(() => {
      empty.hidden = false;
      empty.textContent = 'No pudimos cargar el stock en este momento. Escribinos por WhatsApp y te pasamos las unidades disponibles.';
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
    { src: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80', cls: 'galeria__item--wide', alt: 'Local de Garrahan — Negocio de Automotores' },
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
