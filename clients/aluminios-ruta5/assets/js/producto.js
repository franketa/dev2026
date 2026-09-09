// Ficha de producto
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = R5.escape;

  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const params = new URLSearchParams(location.search);
  const key = params.get('id') || (slug !== 'producto' && slug !== 'producto.html' ? slug : '');

  let images = [];
  let current = 0;

  function notFound() {
    $('loading').innerHTML = `
      <h1 style="font-size:var(--text-2xl);margin-bottom:.6rem">No encontramos ese producto</h1>
      <p style="margin-bottom:1.4rem">Puede que ya no esté publicado o que el enlace esté incompleto.</p>
      <a href="/catalogo" class="btn btn--primary">Ir al catálogo</a>`;
  }

  function stockLabel(s) {
    return s === 'a-pedido' ? 'A pedido' : s === 'sin-stock' ? 'Sin stock' : 'En stock';
  }

  function renderGallery(p) {
    const hasImg = !!p.coverImage;
    images = hasImg ? [p.coverImage, ...(p.images || []).filter(i => i !== p.coverImage)] : [];
    const main = hasImg ? images[0] : R5.placeholderFor(p.categoria);
    $('gallery').innerHTML = `
      <div class="gallery__main ${hasImg ? '' : 'gallery__main--placeholder'}" id="galleryMain">
        <img src="${e(main)}" alt="${e(p.nombre)}" id="galleryImg" fetchpriority="high">
        <div class="gallery__badges">${p.destacado ? '<span class="badge badge--blue">Destacado</span>' : ''}${R5.stockBadge(p.stock)}</div>
      </div>
      ${images.length > 1 ? `<div class="gallery__thumbs" id="thumbs">${images.map((src, i) => `<button type="button" data-i="${i}" aria-current="${i === 0}"><img src="${e(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;

    if (images.length) {
      $('galleryMain').addEventListener('click', () => openLightbox(current));
      const thumbs = $('thumbs');
      if (thumbs) thumbs.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        show(Number(b.dataset.i));
      });
    }
  }

  function show(i) {
    current = i;
    $('galleryImg').src = images[i];
    document.querySelectorAll('#thumbs button').forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
  }

  function renderInfo(p) {
    const waText = `Hola Aluminios Ruta 5, quiero consultar por: ${p.nombre}${p.codigo ? ' (cód. ' + p.codigo + ')' : ''}. ¿Precio y disponibilidad?`;
    const wa = R5.waLink(waText);
    const price = p.mostrarPrecio && p.precio > 0
      ? `<div class="info__price"><strong>${R5.fmtPrice(p.precio, p.moneda)}</strong><span>por ${e(p.unidad)} · IVA a confirmar</span></div>`
      : `<div class="info__price info__price--ask"><strong>Precio a consultar</strong><span>te lo cotizamos por WhatsApp</span></div>`;
    const specs = [
      p.linea && { k: 'Línea', v: p.linea },
      p.medidas && { k: 'Medidas', v: p.medidas },
      p.terminacion && { k: 'Terminación', v: p.terminacion },
      p.unidad && { k: 'Se vende por', v: p.unidad },
      ...(p.specs || []),
      { k: 'Disponibilidad', v: stockLabel(p.stock) }
    ].filter(Boolean);

    $('info').innerHTML = `
      <div class="info__cat">
        <a href="/catalogo?categoria=${encodeURIComponent(p.categoria)}">${e(p.categoria)}</a>
        ${p.codigo ? `<span class="info__code">Cód. ${e(p.codigo)}</span>` : ''}
      </div>
      <h1>${e(p.nombre)}</h1>
      ${p.resumen ? `<p class="info__resumen">${e(p.resumen)}</p>` : ''}
      ${price}
      <div class="info__actions">
        <a class="btn btn--primary" href="${wa}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>
          Consultar por WhatsApp
        </a>
        <button type="button" class="btn btn--ghost" id="btnShare">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M8 7l4-4 4 4"/></svg>
          Compartir
        </button>
      </div>
      <div class="specs">
        <h3>Ficha técnica</h3>
        <dl>${specs.map(s => `<dt>${e(s.k)}</dt><dd>${e(s.v)}</dd>`).join('')}</dl>
      </div>
      ${(p.tags || []).length ? `<div class="tags">${p.tags.map(t => `<span>${e(t)}</span>`).join('')}</div>` : ''}
      ${p.descripcion ? `<div class="desc"><h3>Descripción</h3><p>${e(p.descripcion)}</p></div>` : ''}
      <ul class="trust">
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg><div><strong>Stock en nave propia</strong>Parque Industrial Chivilcoy</div></li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v10M17 7v10"/></svg><div><strong>Embalaje protegido</strong>Film, esquineros y flejado</div></li>
      </ul>`;

    $('mobileWa').href = wa;
    $('btnShare').addEventListener('click', async () => {
      const data = { title: p.nombre, text: `${p.nombre} · Aluminios Ruta 5`, url: location.href };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(location.href); toast('Enlace copiado'); }
      } catch (err) { /* cancelado */ }
    });
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // Lightbox
  const lb = $('lightbox');
  function openLightbox(i) {
    if (!images.length) return;
    current = i; $('lbImg').src = images[i];
    lb.classList.add('lightbox--open'); lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const single = images.length < 2;
    $('lbPrev').hidden = single; $('lbNext').hidden = single;
  }
  function closeLightbox() { lb.classList.remove('lightbox--open'); lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  function step(d) { show((current + d + images.length) % images.length); $('lbImg').src = images[current]; }
  $('lbClose').addEventListener('click', closeLightbox);
  $('lbPrev').addEventListener('click', () => step(-1));
  $('lbNext').addEventListener('click', () => step(1));
  lb.addEventListener('click', ev => { if (ev.target === lb) closeLightbox(); });
  document.addEventListener('keydown', ev => {
    if (!lb.classList.contains('lightbox--open')) return;
    if (ev.key === 'Escape') closeLightbox();
    if (ev.key === 'ArrowLeft') step(-1);
    if (ev.key === 'ArrowRight') step(1);
  });

  // Carga
  if (!key) { notFound(); return; }
  fetch(`/api/products/${encodeURIComponent(key)}`)
    .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
    .then(({ product: p, related }) => {
      document.title = `${p.nombre} · Aluminios Ruta 5`;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.content = p.resumen || `${p.nombre} en Aluminios Ruta 5, Chivilcoy.`;
      $('crumbCat').textContent = p.categoria;
      $('crumbCat').href = `/catalogo?categoria=${encodeURIComponent(p.categoria)}`;
      $('crumbName').textContent = p.nombre;
      renderGallery(p);
      renderInfo(p);
      $('loading').hidden = true;
      $('product').hidden = false;
      if (related && related.length) {
        $('relatedGrid').innerHTML = related.map(r => R5.productCard(r)).join('');
        $('related').hidden = false;
      }
    })
    .catch(notFound);
})();
