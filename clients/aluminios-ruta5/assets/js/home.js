// Home · productos destacados desde la API
(function () {
  'use strict';
  const track = document.getElementById('featuredTrack');
  if (!track) return;

  fetch('/api/products')
    .then(r => r.json())
    .then(data => {
      const list = data.products || [];
      const featured = list.filter(p => p.destacado);
      const items = (featured.length >= 4 ? featured : list).slice(0, 8);
      if (!items.length) {
        track.innerHTML = '<p class="featured__empty">Muy pronto vas a ver acá nuestros productos destacados.</p>';
        return;
      }
      track.innerHTML = items.map(p => R5.productCard(p, { className: 'featured__card reveal is-in' })).join('') +
        `<a href="/catalogo" class="featured__more"><span>Ver todo el catálogo</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>`;
    })
    .catch(() => {
      track.innerHTML = '<p class="featured__empty">No pudimos cargar los productos. <a href="/catalogo">Ir al catálogo</a></p>';
    });
})();
