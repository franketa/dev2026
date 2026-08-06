// Garrahan — Negocio de Automotores · Compramos tu auto
(function () {
  'use strict';

  var WA_FELIPE = '5492345428151';
  var TOTAL_PASOS = 4;

  var $  = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };
  var fmt = function (n) { return new Intl.NumberFormat('es-AR').format(n); };

  /* =========================================================
     Nav (mismo comportamiento que el resto del sitio)
     ========================================================= */
  var nav = $('#nav');
  var toggle = $('#navToggle');
  var menu = $('#navMenu');

  window.addEventListener('scroll', function () {
    nav.classList.toggle('nav--scrolled', window.scrollY > 50);
  });
  toggle.addEventListener('click', function () {
    menu.classList.toggle('nav__menu--open');
    toggle.classList.toggle('nav__toggle--open');
  });
  $$('.nav__link', menu).forEach(function (l) {
    l.addEventListener('click', function () {
      menu.classList.remove('nav__menu--open');
      toggle.classList.remove('nav__toggle--open');
    });
  });

  // Smooth scroll para anclas internas
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  /* =========================================================
     Años del selector (año actual + 1 hasta 1995)
     ========================================================= */
  var selAnio = $('#wzAnio');
  var anioMax = new Date().getFullYear() + 1;
  var opts = '';
  for (var y = anioMax; y >= 1995; y--) opts += '<option>' + y + '</option>';
  opts += '<option value="1994 o anterior">1994 o anterior</option>';
  selAnio.insertAdjacentHTML('beforeend', opts);

  /* =========================================================
     Campos
     ========================================================= */
  var form        = $('#wzForm');
  var marca       = $('#wzMarca');
  var marcaOtra   = $('#wzMarcaOtra');
  var marcaOtraW  = $('#wzMarcaOtraWrap');
  var modelo      = $('#wzModelo');
  var version     = $('#wzVersion');
  var km          = $('#wzKm');
  var combustible = $('#wzCombustible');
  var precio      = $('#wzPrecio');
  var monedaSym   = $('#wzMonedaSym');
  var parte       = $('#wzParte');
  var interesW    = $('#wzInteresWrap');
  var interes     = $('#wzInteres');
  var nombre      = $('#wzNombre');
  var tel         = $('#wzTel');
  var localidad   = $('#wzLocalidad');

  var btnBack  = $('#wzBack');
  var btnNext  = $('#wzNext');
  var btnSend  = $('#wzSend');
  var foot     = $('#wzFoot');
  var bar      = $('#wzBar');
  var current  = $('#wzCurrent');
  var paneles  = $$('.wz__panel');
  var steps    = $$('.wz__step');

  var paso = 1;

  var radio = function (name) {
    var r = form.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  };

  /* =========================================================
     Formato de números mientras se escribe
     ========================================================= */
  $$('[data-num]').forEach(function (input) {
    input.addEventListener('input', function () {
      var digitos = input.value.replace(/\D/g, '').slice(0, 12);
      input.value = digitos ? fmt(parseInt(digitos, 10)) : '';
    });
  });

  /* =========================================================
     Campos condicionales
     ========================================================= */
  marca.addEventListener('change', function () {
    var otra = marca.value === 'Otra';
    marcaOtraW.hidden = !otra;
    if (otra) marcaOtra.focus(); else { marcaOtra.value = ''; limpiarError(marcaOtra); }
  });

  parte.addEventListener('change', function () {
    interesW.hidden = !parte.checked;
    if (!parte.checked) interes.value = '';
  });

  $$('input[name="moneda"]').forEach(function (r) {
    r.addEventListener('change', function () {
      monedaSym.textContent = r.value === 'USD' ? 'US$' : '$';
    });
  });

  /* =========================================================
     Validación
     ========================================================= */
  function campoDe(el) { return el.closest('.wz__field'); }

  function marcarError(el, msg) {
    var f = campoDe(el);
    if (!f) return;
    f.classList.add('has-error');
    var p = f.querySelector('.wz__error');
    if (p) { p.textContent = msg; p.hidden = false; }
  }

  function limpiarError(el) {
    var f = campoDe(el);
    if (!f) return;
    f.classList.remove('has-error');
    var p = f.querySelector('.wz__error');
    if (p) p.hidden = true;
  }

  // Reglas por paso. `si` permite reglas condicionales.
  var REGLAS = {
    1: [
      { el: marca,     msg: 'Elegí la marca de tu vehículo.' },
      { el: marcaOtra, msg: 'Escribinos qué marca es.', si: function () { return marca.value === 'Otra'; } },
      { el: modelo,    msg: 'Contanos qué modelo es.' }
    ],
    2: [
      { el: selAnio, msg: 'Elegí el año del vehículo.' },
      { el: km,      msg: 'Necesitamos el kilometraje aproximado.' },
      { grupo: 'estado', ancla: $('input[name="estado"]'), msg: 'Contanos en qué estado está.' }
    ],
    3: [],
    4: [
      { el: nombre, msg: '¿Cómo te llamás?' },
      { el: tel,    msg: 'Dejanos un teléfono para contactarte.', test: function (v) { return v.replace(/\D/g, '').length >= 6; }, msgTest: 'Ese teléfono parece incompleto.' }
    ]
  };

  function validar(n) {
    var reglas = REGLAS[n] || [];
    var primerError = null;

    reglas.forEach(function (r) {
      if (r.si && !r.si()) { if (r.el) limpiarError(r.el); return; }

      if (r.grupo) {
        if (!radio(r.grupo)) {
          marcarError(r.ancla, r.msg);
          if (!primerError) primerError = r.ancla;
        } else {
          limpiarError(r.ancla);
        }
        return;
      }

      var v = r.el.value.trim();
      if (!v) {
        marcarError(r.el, r.msg);
        if (!primerError) primerError = r.el;
      } else if (r.test && !r.test(v)) {
        marcarError(r.el, r.msgTest);
        if (!primerError) primerError = r.el;
      } else {
        limpiarError(r.el);
      }
    });

    if (primerError) {
      var f = campoDe(primerError);
      if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (primerError.type !== 'radio') { try { primerError.focus({ preventScroll: true }); } catch (e) { primerError.focus(); } }
      return false;
    }
    return true;
  }

  // Al corregir un campo, el error se va solo
  $$('#wzForm input, #wzForm select').forEach(function (el) {
    var ev = (el.tagName === 'SELECT' || el.type === 'radio') ? 'change' : 'input';
    el.addEventListener(ev, function () {
      if (el.type === 'radio') {
        var ancla = form.querySelector('input[name="' + el.name + '"]');
        if (ancla) limpiarError(ancla);
      } else if (el.value.trim()) {
        limpiarError(el);
      }
    });
  });

  /* =========================================================
     Navegación entre pasos
     ========================================================= */
  function pintar() {
    paneles.forEach(function (p) {
      p.classList.toggle('is-active', Number(p.dataset.panel) === paso);
    });

    steps.forEach(function (s) {
      var n = Number(s.dataset.step);
      s.classList.toggle('is-active', n === paso);
      s.classList.toggle('is-done', n < paso || paso > TOTAL_PASOS);
    });

    var pct = paso > TOTAL_PASOS ? 100 : (paso / TOTAL_PASOS) * 100;
    bar.style.width = pct + '%';
    current.textContent = Math.min(paso, TOTAL_PASOS);

    var fin = paso > TOTAL_PASOS;
    foot.hidden = fin;
    btnBack.hidden = fin || paso === 1;
    btnNext.hidden = fin || paso === TOTAL_PASOS;
    btnSend.hidden = fin || paso !== TOTAL_PASOS;
  }

  function irA(n, opts) {
    paso = n;
    pintar();
    if (n === TOTAL_PASOS) resumen();

    if (!opts || !opts.silencioso) {
      var wz = $('#wz');
      var top = wz.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top || window.innerWidth <= 1024) {
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
      var panel = form.querySelector('.wz__panel.is-active');
      var primero = panel && panel.querySelector('input:not([type=radio]):not([type=checkbox]), select');
      if (primero && window.innerWidth > 768) {
        setTimeout(function () { try { primero.focus({ preventScroll: true }); } catch (e) {} }, 260);
      }
    }
  }

  btnNext.addEventListener('click', function () {
    if (!validar(paso)) return;
    irA(paso + 1);
  });

  btnBack.addEventListener('click', function () {
    if (paso > 1) irA(paso - 1);
  });

  // Enter avanza en lugar de recargar la página
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (paso < TOTAL_PASOS) { btnNext.click(); }
    else { btnSend.click(); }
  });

  /* =========================================================
     Resumen del paso 4
     ========================================================= */
  function datos() {
    var m = marca.value === 'Otra' ? marcaOtra.value.trim() : marca.value;
    var moneda = radio('moneda');
    var sym = moneda === 'USD' ? 'US$' : '$';
    return {
      vehiculo:    [m, modelo.value.trim(), version.value.trim()].filter(Boolean).join(' '),
      anio:        selAnio.value,
      km:          km.value ? km.value + ' km' : '',
      combustible: combustible.value,
      transmision: radio('transmision'),
      estado:      radio('estado'),
      precio:      precio.value ? sym + ' ' + precio.value : '',
      parte:       parte.checked,
      interes:     interes.value.trim(),
      nombre:      nombre.value.trim(),
      tel:         tel.value.trim(),
      localidad:   localidad.value.trim()
    };
  }

  function resumen() {
    var d = datos();
    var filas = [
      ['Vehículo', d.vehiculo],
      ['Año', d.anio],
      ['Kilometraje', d.km],
      ['Combustible', d.combustible],
      ['Transmisión', d.transmision],
      ['Estado', d.estado],
      ['Precio pretendido', d.precio || 'A tasar por Garrahan'],
      ['Parte de pago', d.parte ? (d.interes ? 'Sí · ' + d.interes : 'Sí') : 'No']
    ].filter(function (f) { return f[1]; });

    $('#wzResumenList').innerHTML = filas.map(function (f) {
      return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>';
    }).join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* =========================================================
     Mensaje de WhatsApp
     ========================================================= */
  function mensaje() {
    var d = datos();
    var sep = '━━━━━━━━━━━━━━━';
    var l = [];

    l.push('*Quiero vender mi vehículo* 🚗');
    l.push(sep);
    l.push('*' + d.vehiculo + '*');
    l.push('📅 Año: ' + d.anio);
    l.push('🛣️ Kilometraje: ' + d.km);
    if (d.combustible) l.push('⛽ Combustible: ' + d.combustible);
    if (d.transmision) l.push('⚙️ Transmisión: ' + d.transmision);
    l.push('✨ Estado: ' + d.estado);
    l.push(sep);
    l.push('💰 Precio pretendido: ' + (d.precio || 'a tasar por ustedes'));
    l.push('🔄 Parte de pago: ' + (d.parte ? 'Sí' + (d.interes ? ' — me interesa ' + d.interes : '') : 'No, lo vendo directo'));
    l.push(sep);
    l.push('👤 ' + d.nombre);
    l.push('📱 ' + d.tel);
    if (d.localidad) l.push('📍 ' + d.localidad);
    l.push(sep);
    l.push('_Consulta enviada desde la web_');

    return l.join('\n');
  }

  btnSend.addEventListener('click', function (e) {
    if (!validar(TOTAL_PASOS)) { e.preventDefault(); return; }

    var url = 'https://wa.me/' + WA_FELIPE + '?text=' + encodeURIComponent(mensaje());
    btnSend.href = url;
    $('#wzDoneLink').href = url;

    // El anchor navega solo (sin bloqueo de pop-ups); mostramos el paso final después.
    setTimeout(function () { irA(TOTAL_PASOS + 1, { silencioso: true }); }, 350);
  });

  $('#wzRestart').addEventListener('click', function () {
    form.reset();
    marcaOtraW.hidden = true;
    interesW.hidden = true;
    monedaSym.textContent = '$';
    $$('.wz__field.has-error').forEach(function (f) {
      f.classList.remove('has-error');
      var p = f.querySelector('.wz__error');
      if (p) p.hidden = true;
    });
    irA(1);
  });

  pintar();

  /* =========================================================
     FAQ
     ========================================================= */
  $$('.faq__q').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.faq__item');
      var body = $('.faq__a', item);
      var abierto = item.classList.contains('is-open');

      $$('.faq__item.is-open').forEach(function (otro) {
        otro.classList.remove('is-open');
        $('.faq__a', otro).style.maxHeight = null;
        $('.faq__q', otro).setAttribute('aria-expanded', 'false');
      });

      if (!abierto) {
        item.classList.add('is-open');
        body.style.maxHeight = body.scrollHeight + 'px';
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Si cambia el ancho, recalculamos la altura del FAQ abierto
  window.addEventListener('resize', function () {
    var abierto = $('.faq__item.is-open');
    if (abierto) {
      var body = $('.faq__a', abierto);
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  });

  /* =========================================================
     Scroll reveal
     ========================================================= */
  var revObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('reveal--visible'); revObs.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(function (el) { revObs.observe(el); });
})();
