// Catálogo · búsqueda, filtros (URL-sync), grilla y bottom sheet mobile
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = R5.escape;

  let products = [];
  let catalogos = { categorias: [], lineas: [] };
  const state = { q: '', categoria: '', linea: '', orden: 'relevancia' };
  const draft = { categoria: '', linea: '', orden: 'relevancia' }; // estado provisorio del sheet

  const TITLES = {
    'Perfiles': 'Perfiles de aluminio, barra por barra.',
    'Aberturas': 'Aberturas de todo tipo, a medida.',
    'Wall Panels': 'Wall panels para fachadas con carácter.',
    'Accesorios': 'Accesorios para que todo cierre bien.',
    'Herrajes': 'Herrajes que aguantan el uso diario.'
  };

  // ----- URL -----
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.categoria = p.get('categoria') || '';
    state.linea = p.get('linea') || '';
    state.orden = p.get('orden') || 'relevancia';
  }
  function writeURL() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.categoria) p.set('categoria', state.categoria);
    if (state.linea) p.set('linea', state.linea);
    if (state.orden !== 'relevancia') p.set('orden', state.orden);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  // ----- Normalización para búsqueda -----
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function matches(p, q) {
    if (!q) return true;
    const hay = norm([p.nombre, p.codigo, p.categoria, p.linea, p.medidas, p.terminacion, p.resumen, (p.tags || []).join(' ')].join(' '));
    return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }

  function filtered() {
    let list = products.filter(p =>
      (!state.categoria || p.categoria === state.categoria) &&
      (!state.linea || p.linea === state.linea) &&
      matches(p, state.q)
    );
    if (state.orden === 'nombre') list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    else if (state.orden === 'nuevos') list = [...list].sort((a, b) => b.id - a.id);
    return list;
  }

  // ----- Render -----
  function chip(label, value, pressed, count) {
    return `<button type="button" class="chip" data-value="${e(value)}" aria-pressed="${pressed}">${e(label)}${count != null ? `<span class="chip__count">${count}</span>` : ''}</button>`;
  }

  function renderChips() {
    const counts = {};
    products.forEach(p => { counts[p.categoria] = (counts[p.categoria] || 0) + 1; });
    const cats = catalogos.categorias.filter(c => counts[c]);
    $('chipsCategoria').innerHTML = chip('Todo', '', !state.categoria, products.length) +
      cats.map(c => chip(c, c, state.categoria === c, counts[c])).join('');
    $('sheetCategoria').innerHTML = chip('Todo', '', !draft.categoria) + cats.map(c => chip(c, c, draft.categoria === c)).join('');

    const lineas = catalogos.lineas.filter(l => products.some(p => p.linea === l));
    $('selectLinea').innerHTML = '<option value="">Todas las líneas</option>' + lineas.map(l => `<option value="${e(l)}" ${state.linea === l ? 'selected' : ''}>${e(l)}</option>`).join('');
    $('sheetLinea').innerHTML = chip('Todas', '', !draft.linea) + lineas.map(l => chip(l, l, draft.linea === l)).join('');

    const ordenes = [['relevancia', 'Relevancia'], ['nombre', 'Nombre A–Z'], ['nuevos', 'Más nuevos']];
    $('sheetOrden').innerHTML = ordenes.map(([v, l]) => chip(l, v, draft.orden === v)).join('');
    $('selectOrden').value = state.orden;

    const has = !!(state.categoria || state.linea || state.orden !== 'relevancia');
    $('btnFilters').classList.toggle('has-filters', has);
  }

  function renderActive() {
    const out = [];
    const x = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    if (state.categoria) out.push(`<button type="button" data-clear="categoria">${e(state.categoria)} ${x}</button>`);
    if (state.linea) out.push(`<button type="button" data-clear="linea">Línea ${e(state.linea)} ${x}</button>`);
    if (state.q) out.push(`<button type="button" data-clear="q">“${e(state.q)}” ${x}</button>`);
    $('activeFilters').innerHTML = out.join('');
  }

  function render() {
    const list = filtered();
    $('resultsCount').innerHTML = list.length === 1 ? '<strong>1</strong> producto' : `<strong>${list.length}</strong> productos`;
    $('catTitle').textContent = TITLES[state.categoria] || 'Perfiles, aberturas y todo lo demás.';
    document.title = (state.categoria ? state.categoria + ' · ' : '') + 'Catálogo · Aluminios Ruta 5';
    if (!list.length) {
      $('grid').innerHTML = `
        <div class="empty">
          <h3>No encontramos productos con esos filtros</h3>
          <p>Probá con otra palabra o limpiá los filtros. Si sabés lo que necesitás, consultanos directo.</p>
          <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
            <button type="button" class="btn btn--ghost" id="btnReset">Limpiar filtros</button>
            <a class="btn btn--primary" href="${R5.waLink('Hola, busco: ' + (state.q || state.categoria || 'un producto') + '. ¿Lo tienen?')}" target="_blank" rel="noopener">Consultar por WhatsApp</a>
          </div>
        </div>`;
      $('btnReset').addEventListener('click', resetAll);
    } else {
      $('grid').innerHTML = list.map((p, i) => R5.productCard(p)).join('');
      [...$('grid').children].forEach((el, i) => { el.style.animationDelay = `${Math.min(i, 12) * 40}ms`; });
    }
    renderChips();
    renderActive();
    writeURL();
  }

  function resetAll() {
    state.q = ''; state.categoria = ''; state.linea = ''; state.orden = 'relevancia';
    $('searchInput').value = ''; $('searchClear').hidden = true;
    render();
  }

  // ----- Eventos -----
  let t;
  $('searchInput').addEventListener('input', ev => {
    $('searchClear').hidden = !ev.target.value;
    clearTimeout(t);
    t = setTimeout(() => { state.q = ev.target.value.trim(); render(); }, 220);
  });
  $('searchClear').addEventListener('click', () => { $('searchInput').value = ''; $('searchClear').hidden = true; state.q = ''; render(); $('searchInput').focus(); });
  $('chipsCategoria').addEventListener('click', ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    state.categoria = b.dataset.value; render();
  });
  $('selectLinea').addEventListener('change', ev => { state.linea = ev.target.value; render(); });
  $('selectOrden').addEventListener('change', ev => { state.orden = ev.target.value; render(); });
  $('activeFilters').addEventListener('click', ev => {
    const b = ev.target.closest('[data-clear]'); if (!b) return;
    state[b.dataset.clear] = '';
    if (b.dataset.clear === 'q') { $('searchInput').value = ''; $('searchClear').hidden = true; }
    render();
  });

  // Bottom sheet
  const sheet = $('sheet');
  function openSheet() {
    Object.assign(draft, { categoria: state.categoria, linea: state.linea, orden: state.orden });
    renderChips();
    sheet.classList.add('sheet--open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() { sheet.classList.remove('sheet--open'); document.body.style.overflow = ''; }
  $('btnFilters').addEventListener('click', openSheet);
  sheet.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeSheet));
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });
  [['sheetCategoria', 'categoria'], ['sheetLinea', 'linea'], ['sheetOrden', 'orden']].forEach(([id, key]) => {
    $(id).addEventListener('click', ev => {
      const b = ev.target.closest('.chip'); if (!b) return;
      draft[key] = b.dataset.value;
      renderChips();
    });
  });
  $('sheetReset').addEventListener('click', () => { Object.assign(draft, { categoria: '', linea: '', orden: 'relevancia' }); renderChips(); });
  $('sheetApply').addEventListener('click', () => { Object.assign(state, draft); closeSheet(); render(); });

  // ----- Carga -----
  readURL();
  $('searchInput').value = state.q;
  $('searchClear').hidden = !state.q;

  fetch('/api/products')
    .then(r => r.json())
    .then(data => {
      products = data.products || [];
      catalogos = data.catalogos || catalogos;
      $('catTotal').textContent = products.length;
      render();
    })
    .catch(() => {
      $('grid').innerHTML = '<div class="empty"><h3>No pudimos cargar el catálogo</h3><p>Probá de nuevo en unos segundos.</p></div>';
      $('resultsCount').textContent = '';
    });
})();
