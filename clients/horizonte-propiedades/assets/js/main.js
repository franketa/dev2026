// Horizonte Propiedades — Main JS
(function() {
  'use strict';

  const WA = '5492234558899';
  const fmt = n => new Intl.NumberFormat('es-AR').format(n);

  // --- Property Data ---
  const propiedades = [
    { id:1, tipo:'Casa', operacion:'Venta', titulo:'Casa 3 dorm en Los Troncos', zona:'Los Troncos', precio:185000, moneda:'USD', m2:220, m2cub:160, dorm:3, banos:2, garaje:true, destacada:true, badge:'DESTACADA', color:'#1B3A5C' },
    { id:2, tipo:'Departamento', operacion:'Alquiler', titulo:'Depto 2 amb frente al mar', zona:'La Perla', precio:450000, moneda:'ARS', m2:55, m2cub:55, dorm:1, banos:1, garaje:false, destacada:false, badge:'', color:'#2980b9' },
    { id:3, tipo:'PH', operacion:'Venta', titulo:'PH reciclado en Güemes', zona:'Güemes', precio:120000, moneda:'USD', m2:90, m2cub:80, dorm:2, banos:1, garaje:false, destacada:false, badge:'', color:'#8e44ad' },
    { id:4, tipo:'Casa', operacion:'Venta', titulo:'Casa 5 dorm en Playa Grande', zona:'Playa Grande', precio:320000, moneda:'USD', m2:350, m2cub:280, dorm:5, banos:3, garaje:true, destacada:true, badge:'DESTACADA', color:'#27ae60' },
    { id:5, tipo:'Local', operacion:'Alquiler', titulo:'Local comercial en Av. Colón', zona:'Centro', precio:380000, moneda:'ARS', m2:65, m2cub:65, dorm:0, banos:1, garaje:false, destacada:false, badge:'', color:'#e67e22' },
    { id:6, tipo:'Departamento', operacion:'Venta', titulo:'Depto 3 amb en Centro', zona:'Centro', precio:95000, moneda:'USD', m2:75, m2cub:75, dorm:2, banos:1, garaje:false, destacada:false, badge:'', color:'#3498db' },
    { id:7, tipo:'Casa', operacion:'Temporario', titulo:'Cabaña en Sierra de los Padres', zona:'Sierra de los Padres', precio:85000, moneda:'ARS', m2:100, m2cub:80, dorm:2, banos:1, garaje:false, destacada:false, badge:'', color:'#2D4A22' },
    { id:8, tipo:'Terreno', operacion:'Venta', titulo:'Terreno en Batán', zona:'Batán', precio:45000, moneda:'USD', m2:800, m2cub:0, dorm:0, banos:0, garaje:false, destacada:false, badge:'NUEVO', color:'#C8A96E' }
  ];

  function renderPropiedades(lista) {
    const grid = document.getElementById('propiedadesGrid');
    if (!grid) return;
    if (!lista.length) {
      grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;grid-column:1/-1">No se encontraron propiedades con esos filtros.</p>';
      return;
    }
    grid.innerHTML = lista.map(p => {
      const precioStr = p.moneda === 'USD' ? 'USD ' + fmt(p.precio) : '$' + fmt(p.precio) + (p.operacion === 'Alquiler' ? '/mes' : p.operacion === 'Temporario' ? '/día' : '');
      const waText = encodeURIComponent('Hola, me interesa la propiedad: ' + p.titulo + '. Podrian darme mas informacion?');
      const badgeHtml = p.badge ? '<span class="propiedad-card__badge" style="background:' + (p.badge === 'NUEVO' ? '#27ae60' : 'var(--color-secundario)') + '">' + p.badge + '</span>' : '';
      return '<div class="propiedad-card animate-reveal">' +
        '<div class="propiedad-card__img" style="background:' + p.color + ';height:220px;display:flex;align-items:center;justify-content:center">' + badgeHtml +
          '<span class="propiedad-card__tipo">' + p.operacion + ' · ' + p.tipo + '</span>' +
        '</div>' +
        '<div class="propiedad-card__body">' +
          '<div class="propiedad-card__precio">' + precioStr + '</div>' +
          '<h3 class="propiedad-card__titulo">' + p.titulo + '</h3>' +
          '<div class="propiedad-card__zona"><svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-secundario)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg> ' + p.zona + '</div>' +
          '<div class="propiedad-card__attrs">' +
            '<span class="propiedad-card__attr">' + p.m2 + ' m²</span>' +
            (p.dorm ? '<span class="propiedad-card__attr">' + p.dorm + ' dorm</span>' : '') +
            (p.banos ? '<span class="propiedad-card__attr">' + p.banos + ' baño' + (p.banos > 1 ? 's' : '') + '</span>' : '') +
            (p.garaje ? '<span class="propiedad-card__attr">Garaje</span>' : '') +
          '</div>' +
          '<div class="propiedad-card__actions">' +
            '<a href="https://wa.me/' + WA + '?text=' + waText + '" class="btn btn--whatsapp" target="_blank">Consultar</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  renderPropiedades(propiedades);

  // --- Filters ---
  function filtrar() {
    let result = propiedades;
    const tipo = (document.getElementById('filtroTipo') || {}).value;
    const op = (document.getElementById('filtroOperacion') || {}).value;
    const dorm = (document.getElementById('filtroDormitorios') || {}).value;
    const zona = (document.getElementById('filtroZona') || {}).value;
    const pMin = parseInt((document.getElementById('filtroPrecioMin') || {}).value) || 0;
    const pMax = parseInt((document.getElementById('filtroPrecioMax') || {}).value) || Infinity;

    if (tipo) result = result.filter(p => p.tipo === tipo);
    if (op) result = result.filter(p => p.operacion === op);
    if (dorm) result = result.filter(p => p.dorm >= parseInt(dorm));
    if (zona) result = result.filter(p => p.zona === zona);
    if (pMin) result = result.filter(p => p.precio >= pMin);
    if (pMax < Infinity) result = result.filter(p => p.precio <= pMax);

    renderPropiedades(result);
  }

  ['filtroTipo', 'filtroOperacion', 'filtroDormitorios', 'filtroZona', 'filtroPrecioMin', 'filtroPrecioMax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', filtrar);
    if (el) el.addEventListener('input', filtrar);
  });

  const clearBtn = document.getElementById('filtroClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      ['filtroTipo', 'filtroOperacion', 'filtroDormitorios', 'filtroZona', 'filtroPrecioMin', 'filtroPrecioMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      renderPropiedades(propiedades);
    });
  }

  // --- Hero search ---
  const heroBtn = document.getElementById('heroSearchBtn');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      const tipo = document.getElementById('heroTipo').value;
      const op = document.getElementById('heroOperacion').value;
      if (tipo) { const el = document.getElementById('filtroTipo'); if (el) el.value = tipo; }
      if (op) { const el = document.getElementById('filtroOperacion'); if (el) el.value = op; }
      filtrar();
      document.getElementById('propiedades').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // --- Nav ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('nav--scrolled', window.scrollY > 60));

  const toggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => navLinks.classList.toggle('nav__links--open'));
    navLinks.querySelectorAll('a').forEach(l => l.addEventListener('click', () => navLinks.classList.remove('nav__links--open')));
  }

  // --- Smooth scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // --- Scroll reveal ---
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('animate-reveal--visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-reveal').forEach(el => obs.observe(el));

  // --- Contact form → WhatsApp ---
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const inputs = form.querySelectorAll('input');
      const nombre = inputs[0].value;
      const tel = inputs[2].value;
      const prop = inputs[3].value;
      const texto = encodeURIComponent('Hola, soy ' + nombre + '. ' + (prop ? 'Me interesa: ' + prop + '. ' : '') + 'Mi tel: ' + tel);
      window.open('https://wa.me/' + WA + '?text=' + texto, '_blank');
    });
  }
})();
