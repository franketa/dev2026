// Veloce Automotores — Main JS
(function() {
  'use strict';

  const fmt = n => new Intl.NumberFormat('es-AR').format(n);

  // --- Vehicle Data ---
  const vehiculos = [
    { id:1, marca:'Ford', modelo:'Ranger XLS 4x4 AT', anio:2023, km:45000, combustible:'Nafta', tipo:'Pickup', color:'Gris', precio:18500000, es0km:false },
    { id:2, marca:'Toyota', modelo:'Hilux SRV', anio:2022, km:62000, combustible:'Diesel', tipo:'Pickup', color:'Blanca', precio:22000000, es0km:false },
    { id:3, marca:'VW', modelo:'Amarok V6 Extreme', anio:2024, km:15000, combustible:'Diesel', tipo:'Pickup', color:'Negra', precio:28500000, es0km:false },
    { id:4, marca:'Chevrolet', modelo:'Cruze LTZ', anio:2023, km:30000, combustible:'Nafta', tipo:'Sedan', color:'Rojo', precio:12800000, es0km:false },
    { id:5, marca:'Fiat', modelo:'Cronos Drive', anio:2024, km:8000, combustible:'Nafta', tipo:'Sedan', color:'Plata', precio:9200000, es0km:true },
    { id:6, marca:'Peugeot', modelo:'208 GT', anio:2023, km:22000, combustible:'Nafta', tipo:'Hatchback', color:'Azul', precio:11500000, es0km:false },
    { id:7, marca:'Ford', modelo:'Territory Titanium', anio:2024, km:5000, combustible:'Nafta', tipo:'SUV', color:'Blanca', precio:19800000, es0km:true },
    { id:8, marca:'Renault', modelo:'Duster Iconic', anio:2022, km:55000, combustible:'Nafta', tipo:'SUV', color:'Verde', precio:10500000, es0km:false }
  ];

  const colors = { Gris:'#6c757d', Blanca:'#dee2e6', Negra:'#2c3e50', Rojo:'#c0392b', Plata:'#95a5a6', Azul:'#2980b9', Verde:'#27ae60' };

  function calcularCuota(precio, plazo, tasa) {
    tasa = tasa || 0.04;
    return Math.round((precio * tasa) / (1 - Math.pow(1 + tasa, -plazo)));
  }

  function renderVehiculos(filtrados) {
    const grid = document.getElementById('stockGrid');
    const empty = document.getElementById('stockEmpty');
    if (!filtrados.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    grid.innerHTML = filtrados.map(v => {
      const cuota48 = calcularCuota(v.precio, 48);
      const waText = encodeURIComponent('Hola, me interesa el ' + v.marca + ' ' + v.modelo + ' ' + v.anio + '. Sigue disponible?');
      return '<div class="vehicle-card">' +
        '<div class="vehicle-card__img" style="background:' + (colors[v.color] || '#888') + '">' +
          (v.es0km ? '<span class="vehicle-card__badge">0KM</span>' : '') +
        '</div>' +
        '<div class="vehicle-card__body">' +
          '<h3 class="vehicle-card__name">' + v.anio + ' ' + v.marca + ' ' + v.modelo + '</h3>' +
          '<div class="vehicle-card__specs">' +
            '<span class="vehicle-card__spec">' + fmt(v.km) + ' km</span>' +
            '<span class="vehicle-card__spec">' + v.combustible + '</span>' +
            '<span class="vehicle-card__spec">' + v.color + '</span>' +
          '</div>' +
          '<div class="vehicle-card__price">$' + fmt(v.precio) + '</div>' +
          '<div class="vehicle-card__cuota">o 48 cuotas de $' + fmt(cuota48) + '</div>' +
          '<div class="vehicle-card__cta">' +
            '<a href="https://wa.me/5493415559876?text=' + waText + '" class="btn btn--primary btn--sm" target="_blank">Consultar</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Initial render
  renderVehiculos(vehiculos);

  // --- Filters ---
  const filtroTipo = document.getElementById('filtroTipo');
  const filtroMarca = document.getElementById('filtroMarca');
  const filtroPrecio = document.getElementById('filtroPrecio');

  function aplicarFiltros() {
    let result = vehiculos;
    const tipo = filtroTipo.value;
    const marca = filtroMarca.value;
    const precio = parseInt(filtroPrecio.value) || 0;
    if (tipo) result = result.filter(v => v.tipo === tipo);
    if (marca) result = result.filter(v => v.marca === marca);
    if (precio) result = result.filter(v => v.precio <= precio);
    renderVehiculos(result);
  }

  filtroTipo.addEventListener('change', aplicarFiltros);
  filtroMarca.addEventListener('change', aplicarFiltros);
  filtroPrecio.addEventListener('change', aplicarFiltros);
  document.getElementById('filtroLimpiar').addEventListener('click', () => {
    filtroTipo.value = ''; filtroMarca.value = ''; filtroPrecio.value = '';
    renderVehiculos(vehiculos);
  });

  // --- Loan Calculator ---
  function calcular() {
    const precio = parseInt(document.getElementById('calcPrecio').value) || 0;
    const plazo = parseInt(document.getElementById('calcPlazo').value);
    const cuota = calcularCuota(precio, plazo);
    document.getElementById('calcAmount').textContent = '$' + fmt(cuota);
  }
  document.getElementById('calcBtn').addEventListener('click', calcular);
  calcular();

  // --- Nav ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('nav--scrolled', window.scrollY > 60));

  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  toggle.addEventListener('click', () => menu.classList.toggle('nav__menu--open'));
  menu.querySelectorAll('.nav__link').forEach(l => l.addEventListener('click', () => menu.classList.remove('nav__menu--open')));

  // --- Smooth scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth' }); }
    });
  });

  // --- Counter animation ---
  const statsEl = document.querySelector('.elegir__grid');
  if (statsEl) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.querySelectorAll('[data-target]').forEach(c => {
          const target = parseInt(c.dataset.target);
          const start = performance.now();
          (function update(now) {
            const p = Math.min((now - start) / 2000, 1);
            c.textContent = Math.round(target * (1 - Math.pow(1-p, 3)));
            if (p < 1) requestAnimationFrame(update);
          })(start);
        });
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 }).observe(statsEl);
  }

  // --- Scroll reveal ---
  const revObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('reveal--visible'); revObs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => revObs.observe(el));
})();
