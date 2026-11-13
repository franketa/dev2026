/* Nahuel Lemme Peluquería — movimiento del sitio y página de modo demo. Sin dependencias. */
(function () {
  var quieto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Página de modo demo ---------- */
  // Cada botón de turno llega a demo.html con ?desde=<clave>; acá se cuenta de dónde vino.
  var MOTIVOS = {
    'balayage': 'Ibas a pedir turno para un balayage.',
    'mechas': 'Ibas a pedir turno para mechas.',
    'correccion': 'Ibas a pedir turno para una corrección de color.',
    'corte': 'Ibas a pedir turno para un corte.',
    'peinado': 'Ibas a pedir turno para un peinado.',
    'primera-vez': 'Ibas a escribirle a Nahuel para ver por dónde empezar.',
    'nahuel': 'Ibas a escribirle a Nahuel.',
    'staff': 'Ibas a entrar al panel del salón, donde se maneja la agenda.'
  };
  var motivoEl = document.getElementById('demo-motivo');
  if (motivoEl) {
    var clave = '';
    try { clave = new URLSearchParams(window.location.search).get('desde') || ''; } catch (e) {}
    if (Object.prototype.hasOwnProperty.call(MOTIVOS, clave)) {
      motivoEl.textContent = MOTIVOS[clave];
      motivoEl.hidden = false;
    }
  }
  // "Volver" regresa al punto de la landing desde donde se hizo clic, si se llegó desde ahí.
  var volver = document.getElementById('volver');
  if (volver) {
    volver.addEventListener('click', function (e) {
      var origen = window.location.origin;
      if (origen && origen !== 'null' && document.referrer.indexOf(origen + '/') === 0 && window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  /* ---------- Avance de lectura y mechones del hero ---------- */
  var visual = document.querySelector('.hero__visual');
  var barra = document.querySelector('.barra');
  var pendiente = false;

  function medir() {
    pendiente = false;
    var y = window.scrollY || 0;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (barra) barra.style.setProperty('--avance', visual && max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
    if (!quieto && visual) visual.style.setProperty('--sy', String(Math.round(Math.min(600, Math.max(0, y)))));
  }
  function pedirMedida() {
    if (pendiente) return;
    pendiente = true;
    window.requestAnimationFrame(medir);
  }
  window.addEventListener('scroll', pedirMedida, { passive: true });
  window.addEventListener('resize', pedirMedida);
  pedirMedida();

  /* ---------- Cinta de servicios ---------- */
  // Se repite el grupo para que corra sin corte.
  var cinta = document.querySelector('.cinta');
  if (cinta && !quieto) {
    var grupo = cinta.querySelector('.cinta__grupo');
    var base = grupo.innerHTML;
    grupo.innerHTML = base + base + base;
    grupo.parentNode.appendChild(grupo.cloneNode(true));
    cinta.classList.add('cinta--viva');
  }

  /* ---------- Entradas al hacer scroll ---------- */
  // Cada bloque se oculta recién cuando está por entrar en pantalla y aparece al entrar.
  // Lo que ya está a la vista no se toca, y sin script todo queda visible.
  var REV = {
    sube: '.manifiesto .nl-sobretitulo,.manifiesto .cuerpo-lg,.cabecera>.nl-sobretitulo,.cabecera__bajada,.nl-servicio,.tonos__texto>*,.nl-mechon__nombre,.obra figcaption,.galeria__cierre,.quien__texto>:not(h2),.sede,.cierre',
    cortina: '.nl-mechon__tono,.obra .nl-foto,.quien__foto',
    palabras: '.manifiesto h2,.cabecera h2,.quien__texto h2'
  };

  function partir(el) {
    var palabras = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    palabras.forEach(function (p, i) {
      var caja = document.createElement('span');
      var dentro = document.createElement('span');
      caja.className = 'pal';
      dentro.style.setProperty('--i', i);
      dentro.textContent = p;
      caja.appendChild(dentro);
      el.appendChild(caja);
      if (i < palabras.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }

  if (!quieto && 'IntersectionObserver' in window) {
    Object.keys(REV).forEach(function (tipo) {
      Array.prototype.forEach.call(document.querySelectorAll(REV[tipo]), function (el) {
        el.setAttribute('data-rev', tipo);
        if (tipo === 'palabras') partir(el);
      });
    });

    var entrar = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        entrar.unobserve(el);
        el.classList.remove('espera');
        el.classList.add('entra');
        window.setTimeout(function () { el.classList.remove('entra'); }, 3200);
      });
    }, { rootMargin: '0px 0px -6% 0px' });

    var armar = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        armar.unobserve(el);
        if (e.boundingClientRect.top > window.innerHeight * 0.94) {
          el.classList.add('espera');
          entrar.observe(el);
        }
      });
    }, { rootMargin: '0px 0px 35% 0px' });

    Array.prototype.forEach.call(document.querySelectorAll('[data-rev]'), function (el) { armar.observe(el); });
  }
})();
