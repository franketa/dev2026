// Garrahan — Negocio de Automotores · Ficha de vehículo
(function () {
  'use strict';

  const fmt = n => new Intl.NumberFormat('es-AR').format(n);
  const wa = (num, txt) => 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  const WA_FELIPE = '5492345428151';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let photos = [];
  let current = 0;

  // ===== Nav (compartido con index) =====
  const toggle = $('navToggle');
  const menu = $('navMenu');
  toggle.addEventListener('click', () => {
    menu.classList.toggle('nav__menu--open');
    toggle.classList.toggle('nav__toggle--open');
  });

  function precioLabel(v) {
    if (!v.mostrarPrecio || !v.precio) return null;
    return (v.moneda === 'USD' ? 'US$ ' : '$ ') + fmt(v.precio);
  }

  function nombre(v) {
    return `${v.marca} ${v.modelo}${v.version ? ' ' + v.version : ''}`;
  }

  // ===== Galería =====
  function setPhoto(i) {
    if (!photos.length) return;
    current = (i + photos.length) % photos.length;
    $('fgalImg').src = photos[current];
    $('fgalCounter').textContent = `${current + 1} / ${photos.length}`;
    document.querySelectorAll('.fgal__thumb').forEach((t, idx) =>
      t.classList.toggle('fgal__thumb--active', idx === current)
    );
  }

  function buildGallery(v) {
    photos = [v.coverImage, ...(v.images || [])].filter(Boolean);
    photos = [...new Set(photos)];
    if (!photos.length) {
      photos = ['assets/img/logo.png'];
      $('fgalMain').style.cursor = 'default';
    }

    const multi = photos.length > 1;
    $('fgalPrev').hidden = !multi;
    $('fgalNext').hidden = !multi;
    $('fgalCounter').hidden = !multi;

    if (multi) {
      const thumbs = $('fgalThumbs');
      thumbs.hidden = false;
      thumbs.innerHTML = photos.map((p, i) =>
        `<button type="button" class="fgal__thumb" data-i="${i}" aria-label="Foto ${i + 1}"><img src="${esc(p)}" alt="" loading="lazy"></button>`
      ).join('');
      thumbs.addEventListener('click', e => {
        const b = e.target.closest('.fgal__thumb');
        if (b) setPhoto(Number(b.dataset.i));
      });
    }

    $('fgalPrev').addEventListener('click', e => { e.stopPropagation(); setPhoto(current - 1); });
    $('fgalNext').addEventListener('click', e => { e.stopPropagation(); setPhoto(current + 1); });
    $('fgalMain').addEventListener('click', () => openLightbox());

    // Swipe en mobile
    let startX = null;
    $('fgalMain').addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    $('fgalMain').addEventListener('touchend', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) setPhoto(current + (dx < 0 ? 1 : -1));
      startX = null;
    }, { passive: true });

    setPhoto(0);
  }

  // ===== Lightbox =====
  const lightbox = $('lightbox');
  function openLightbox() {
    if (photos.length === 1 && photos[0].includes('logo.png')) return;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    updateLightbox();
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }
  function updateLightbox() {
    $('lbImg').src = photos[current];
    $('lbCounter').textContent = `${current + 1} / ${photos.length}`;
    $('lbPrev').hidden = $('lbNext').hidden = photos.length < 2;
  }
  $('lbClose').addEventListener('click', closeLightbox);
  $('lbPrev').addEventListener('click', () => { setPhoto(current - 1); updateLightbox(); });
  $('lbNext').addEventListener('click', () => { setPhoto(current + 1); updateLightbox(); });
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') { setPhoto(current - 1); updateLightbox(); }
    if (e.key === 'ArrowRight') { setPhoto(current + 1); updateLightbox(); }
  });

  // ===== Render =====
  function render(v, all) {
    document.title = `${nombre(v)} ${v.anio} | Garrahan — Negocio de Automotores`;
    $('bcName').textContent = `${v.marca} ${v.modelo}`;

    // Banner de estado
    if (v.estado === 'vendido') {
      const b = $('fichaBanner');
      b.hidden = false;
      b.classList.add('ficha__banner--vendido');
      b.innerHTML = 'Este vehículo <strong>ya fue vendido</strong>. Mirá otras unidades disponibles en nuestro <a href="index.html#stock" style="color:var(--naranja)">stock</a>, o consultanos: conseguimos el modelo que buscás.';
    } else if (v.estado === 'reservado') {
      const b = $('fichaBanner');
      b.hidden = false;
      b.textContent = 'Este vehículo está reservado. Consultanos por disponibilidad o unidades similares.';
    }

    // Badges de galería
    $('fgalBadges').innerHTML =
      `<span class="fgal__badge fgal__badge--${v.condicion === '0km' ? '0km' : 'usado'}">${v.condicion === '0km' ? '0KM' : 'Usado'}</span>` +
      (v.estado !== 'disponible' ? `<span class="fgal__badge fgal__badge--${v.estado}">${v.estado}</span>` : '');

    buildGallery(v);

    // Panel
    $('fpBrand').textContent = v.marca;
    $('fpTitle').textContent = `${v.modelo}`;
    $('fpVersion').textContent = [v.version, v.anio].filter(Boolean).join(' · ');

    const precio = precioLabel(v);
    if (precio && v.precioDescuento) {
      const sym = v.moneda === 'USD' ? 'US$ ' : '$ ';
      $('fpPriceLabel').textContent = 'Precio con descuento';
      $('fpPrice').innerHTML =
        `<s class="fpanel__price-old">${precio}</s><span class="fpanel__price-desc">${sym}${fmt(v.precioDescuento)}</span>`;
    } else if (precio) {
      $('fpPriceLabel').textContent = 'Precio de lista';
      $('fpPrice').textContent = precio;
    } else {
      $('fpPriceLabel').textContent = 'Precio';
      $('fpPrice').textContent = 'Consultar';
    }
    const perks = [];
    if (v.financiacion) perks.push('💳 Financiación disponible');
    if (v.permuta) perks.push('🔄 Recibimos tu usado');
    $('fpPerks').innerHTML = perks.map(p => `<span class="fpanel__perk">${p}</span>`).join('');

    const quick = [
      { l: 'Año', v: v.anio },
      { l: 'Kilometraje', v: v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km' },
      { l: 'Transmisión', v: v.transmision },
      { l: 'Combustible', v: v.combustible }
    ];
    $('fpQuick').innerHTML = quick.map(q => `<li><span>${q.l}</span><strong>${esc(q.v)}</strong></li>`).join('');

    const msg = v.estado === 'vendido'
      ? `Hola, vi que el ${nombre(v)} ${v.anio} ya se vendió. ¿Tienen algo similar disponible?`
      : `Hola, me interesa el ${nombre(v)} ${v.anio} que vi en la web. ¿Sigue disponible?`;
    $('fpWhatsApp').href = wa(WA_FELIPE, msg + '\n' + location.href);

    $('fpShare').addEventListener('click', async () => {
      const shareData = { title: document.title, text: `${nombre(v)} ${v.anio} — Garrahan, Negocio de Automotores`, url: location.href };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(location.href);
          $('fpShare').textContent = '¡Enlace copiado!';
          setTimeout(() => { $('fpShare').textContent = 'Compartir'; }, 2200);
        }
      } catch { /* usuario canceló */ }
    });

    // Ficha técnica
    const specs = [
      ['Marca', v.marca],
      ['Modelo', v.modelo],
      ['Versión', v.version],
      ['Año', v.anio],
      ['Condición', v.condicion === '0km' ? '0KM' : 'Usado'],
      ['Kilometraje', v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km'],
      ['Tipo', v.tipo],
      ['Motor', v.motor],
      ['Combustible', v.combustible],
      ['Transmisión', v.transmision],
      ['Tracción', v.traccion],
      ['Puertas', v.puertas],
      ['Color', v.color]
    ].filter(([, val]) => val !== '' && val !== null && val !== undefined);
    $('fspecsGrid').innerHTML = specs.map(([l, val]) =>
      `<div class="fspec"><span>${l}</span><strong>${esc(val)}</strong></div>`
    ).join('');

    // Equipamiento
    if ((v.equipamiento || []).length) {
      $('fequipSection').hidden = false;
      $('fequipList').innerHTML = v.equipamiento.map(e => `<li>${esc(e)}</li>`).join('');
    }

    // Descripción
    if (v.descripcion) {
      $('fdescSection').hidden = false;
      $('fdescText').textContent = v.descripcion;
    }

    // Simulador de cuota
    if (v.financiacion && v.estado !== 'vendido') {
      $('fsimSection').hidden = false;
      const TASA = 0.055;
      const precioARS = (v.mostrarPrecio && v.precio && v.moneda === 'ARS') ? (v.precioDescuento || v.precio) : 8000000;
      $('calcPrecio').value = precioARS;
      const calcular = () => {
        const monto = parseInt($('calcPrecio').value) || 0;
        const plazo = parseInt($('calcPlazo').value);
        const c = monto ? Math.round((monto * TASA) / (1 - Math.pow(1 + TASA, -plazo))) : 0;
        $('calcAmount').textContent = '$' + fmt(c);
        $('calcTotal').textContent = c ? plazo + ' cuotas fijas' : '';
      };
      $('calcPrecio').addEventListener('input', calcular);
      $('calcPlazo').addEventListener('change', calcular);
      calcular();
      $('fsimWA').href = wa(WA_FELIPE, `Hola, quiero consultar financiación para el ${nombre(v)} ${v.anio}.`);
    }

    // Relacionados
    const rel = all
      .filter(o => o.id !== v.id && o.estado === 'disponible')
      .sort((a, b) => {
        const score = o => (o.tipo === v.tipo ? 2 : 0) + (o.marca === v.marca ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, 3);
    if (rel.length) {
      $('frelSection').hidden = false;
      $('frelGrid').innerHTML = rel.map(cardHTML).join('');
      $('frelGrid').addEventListener('click', e => {
        const card = e.target.closest('.card--click');
        if (card && !e.target.closest('a')) location.href = 'vehiculo.html?id=' + card.dataset.id;
      });
    }

    $('fichaLoading').hidden = true;
    $('fichaMain').hidden = false;
  }

  function cardHTML(v) {
    const badge = v.condicion === '0km'
      ? '<span class="card__badge card__badge--0km">0KM</span>'
      : '<span class="card__badge card__badge--usado">Usado</span>';
    let precio = 'Consultar precio<small>Financiación disponible</small>';
    if (precioLabel(v) && v.precioDescuento) {
      const sym = v.moneda === 'USD' ? 'US$ ' : '$ ';
      precio = `<s class="card__price-old">${precioLabel(v)}</s><span class="card__price-desc">${sym}${fmt(v.precioDescuento)}</span><small>Precio con descuento</small>`;
    } else if (precioLabel(v)) {
      precio = precioLabel(v) + '<small>Precio de lista</small>';
    }
    const km = v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km';
    return `
      <article class="card card--click" data-id="${v.id}">
        <div class="card__media">${badge}
          <img src="${esc(v.coverImage || 'assets/img/logo.png')}" alt="${esc(v.marca + ' ' + v.modelo)}" loading="lazy">
        </div>
        <div class="card__body">
          <span class="card__brand">${esc(v.marca)}</span>
          <h3 class="card__name">${esc(v.modelo)} ${esc(v.version)}</h3>
          <div class="card__specs">
            <span class="card__spec">📅 <b>${v.anio}</b></span>
            <span class="card__spec">🛣️ <b>${km}</b></span>
            <span class="card__spec">⚙️ <b>${esc(v.transmision)}</b></span>
            <span class="card__spec">🔧 <b>${esc(v.motor)}</b></span>
          </div>
          <div class="card__foot">
            <div class="card__price">${precio}</div>
            <a href="vehiculo.html?id=${v.id}" class="btn btn--primary btn--sm card__cta">Ver ficha</a>
          </div>
        </div>
      </article>`;
  }

  // ===== Init =====
  (async function init() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { $('fichaLoading').hidden = true; $('fichaError').hidden = false; return; }
    try {
      const [vRes, allRes] = await Promise.all([
        fetch('/api/vehicles/' + encodeURIComponent(id)),
        fetch('/api/vehicles')
      ]);
      if (!vRes.ok) throw new Error('not found');
      const v = await vRes.json();
      const all = allRes.ok ? (await allRes.json()).vehicles : [];
      render(v, all);
    } catch {
      $('fichaLoading').hidden = true;
      $('fichaError').hidden = false;
    }
  })();
})();
