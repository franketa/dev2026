// Home · un catálogo PDF por línea
(function () {
  'use strict';
  const grid = document.getElementById('lineasGrid');
  if (!grid) return;

  R5.loadLineas()
    .then(lineas => {
      grid.innerHTML = lineas.map(l => R5.lineaCard(l)).join('');
    })
    .catch(() => {
      grid.innerHTML = '<p class="lineas__empty">No pudimos cargar los catálogos. Pedilos por WhatsApp y te los mandamos.</p>';
    });
})();
