// Aluminios Ruta 5 · Panel de administración de productos
(function () {
  'use strict';
  const TOKEN_KEY = 'ruta5_admin_token';
  const EMAIL_KEY = 'ruta5_admin_email';
  const MAX_GALLERY = 8;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PH = { 'Perfiles': 'perfil', 'Aberturas': 'abertura', 'Wall Panels': 'panel', 'Accesorios': 'accesorio', 'Herrajes': 'herraje' };
  const placeholder = c => `/assets/img/ph/${PH[c] || 'perfil'}.svg`;

  let products = [];
  let catalogos = null;
  let editing = null;
  let pendingCover = null, coverRemoved = false;
  let pendingGallery = [], removedImages = [];
  let tags = [];

  // ---------- API ----------
  async function api(path, options = {}) {
    const headers = options.headers || {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch('/api' + path, { ...options, headers });
    if (res.status === 401 && !path.startsWith('/auth/login')) { logout(); throw new Error('Sesión expirada. Ingresá de nuevo.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
    return data;
  }

  let toastTimer;
  function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg; el.classList.toggle('toast--error', !!isError); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function showView(name) {
    $('viewLogin').hidden = name !== 'login';
    $('viewDashboard').hidden = name !== 'dashboard';
    $('viewEditor').hidden = name !== 'editor';
    window.scrollTo(0, 0);
  }
  function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EMAIL_KEY); showView('login'); }

  // ---------- Login ----------
  $('loginForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('loginSubmit'); $('loginError').hidden = true; btn.disabled = true; btn.textContent = 'Ingresando…';
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email: $('loginEmail').value.trim(), password: $('loginPass').value } });
      localStorage.setItem(TOKEN_KEY, data.token); localStorage.setItem(EMAIL_KEY, data.email);
      $('loginPass').value = '';
      await enterDashboard();
    } catch (err) { $('loginError').textContent = err.message; $('loginError').hidden = false; }
    finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
  });
  $('btnLogout').addEventListener('click', logout);

  // ---------- Dashboard ----------
  async function load() {
    const data = await api('/products?all=1');
    products = data.products; catalogos = data.catalogos;
  }
  async function enterDashboard() {
    await load();
    $('topbarUser').textContent = localStorage.getItem(EMAIL_KEY) || '';
    fillCatalogos();
    renderList();
    showView('dashboard');
  }
  function fillCatalogos() {
    $('adminCat').innerHTML = '<option value="">Todas las categorías</option>' + catalogos.categorias.map(c => `<option>${esc(c)}</option>`).join('');
    $('dlCategorias').innerHTML = catalogos.categorias.map(c => `<option value="${esc(c)}">`).join('');
    $('dlLineas').innerHTML = catalogos.lineas.map(c => `<option value="${esc(c)}">`).join('');
    $('dlTerminaciones').innerHTML = catalogos.terminaciones.map(c => `<option value="${esc(c)}">`).join('');
    $('dlUnidades').innerHTML = catalogos.unidades.map(c => `<option value="${esc(c)}">`).join('');
    $('fStock').innerHTML = catalogos.stocks.map(s => `<option value="${s.value}">${esc(s.label)}</option>`).join('');
  }

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function renderList() {
    const q = norm($('adminSearch').value.trim());
    const cat = $('adminCat').value;
    const est = $('adminEstado').value;
    const list = products.filter(p =>
      (!cat || p.categoria === cat) &&
      (!est || (est === 'activo' && p.activo) || (est === 'oculto' && !p.activo) || (est === 'destacado' && p.destacado)) &&
      (!q || norm([p.nombre, p.codigo, p.linea, p.categoria, p.medidas].join(' ')).includes(q))
    );
    $('statTotal').textContent = products.length;
    $('statActivos').textContent = products.filter(p => p.activo).length;
    $('statDest').textContent = products.filter(p => p.destacado).length;
    $('statOcultos').textContent = products.filter(p => !p.activo).length;

    if (!list.length) { $('list').innerHTML = '<div class="list__empty">No hay productos con esos filtros.</div>'; return; }
    const stockPill = s => s === 'a-pedido' ? '<span class="pill pill--warn">A pedido</span>' : s === 'sin-stock' ? '<span class="pill pill--off">Sin stock</span>' : '<span class="pill pill--ok">En stock</span>';
    $('list').innerHTML = list.map(p => `
      <div class="item ${p.activo ? '' : 'item--off'}" data-id="${p.id}">
        <img class="item__img ${p.coverImage ? '' : 'item__img--ph'}" src="${esc(p.coverImage || placeholder(p.categoria))}" alt="">
        <div>
          <div class="item__name">${esc(p.nombre)} ${p.destacado ? '<span class="pill pill--blue">Destacado</span>' : ''} ${p.activo ? '' : '<span class="pill pill--off">Oculto</span>'} ${stockPill(p.stock)}</div>
          <div class="item__meta">${esc(p.categoria)}${p.linea ? ' · Línea ' + esc(p.linea) : ''}${p.codigo ? ' · ' + esc(p.codigo) : ''}${p.medidas ? ' · ' + esc(p.medidas) : ''}${p.mostrarPrecio && p.precio ? ' · ' + esc(p.moneda) + ' ' + p.precio : ''}</div>
        </div>
        <div class="item__actions">
          <button type="button" class="icon-btn ${p.destacado ? 'icon-btn--on' : ''}" data-act="star" title="Destacar"><svg viewBox="0 0 24 24" fill="${p.destacado ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z"/></svg></button>
          <button type="button" class="icon-btn ${p.activo ? 'icon-btn--on' : ''}" data-act="toggle" title="${p.activo ? 'Ocultar' : 'Publicar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.activo ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C4 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9"/>'}</svg></button>
          <a class="icon-btn" href="/producto/${esc(p.slug)}" target="_blank" title="Ver en el sitio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg></a>
          <button type="button" class="btn btn--dark btn--sm" data-act="edit">Editar</button>
        </div>
      </div>`).join('');
  }
  ['adminSearch', 'adminCat', 'adminEstado'].forEach(id => $(id).addEventListener('input', renderList));

  $('list').addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-act]'); if (!btn) return;
    const id = Number(btn.closest('.item').dataset.id);
    const p = products.find(x => x.id === id); if (!p) return;
    if (btn.dataset.act === 'edit') return openEditor(p);
    try {
      const patch = btn.dataset.act === 'star' ? { destacado: !p.destacado } : { activo: !p.activo };
      const updated = await api(`/products/${id}`, { method: 'PUT', body: { ...p, ...patch } });
      products = products.map(x => x.id === id ? updated : x);
      renderList();
      toast(btn.dataset.act === 'star' ? (updated.destacado ? 'Marcado como destacado' : 'Ya no es destacado') : (updated.activo ? 'Producto publicado' : 'Producto oculto'));
    } catch (err) { toast(err.message, true); }
  });

  $('btnNew').addEventListener('click', () => openEditor(null));

  // ---------- Editor ----------
  function openEditor(p) {
    editing = p;
    pendingCover = null; coverRemoved = false; pendingGallery = []; removedImages = [];
    $('editorTitle').textContent = p ? p.nombre : 'Nuevo producto';
    $('btnDelete').hidden = !p;
    $('fNombre').value = p?.nombre || '';
    $('fCategoria').value = p?.categoria || '';
    $('fLinea').value = p?.linea || '';
    $('fCodigo').value = p?.codigo || '';
    $('fTerminacion').value = p?.terminacion || '';
    $('fMedidas').value = p?.medidas || '';
    $('fUnidad').value = p?.unidad || 'unidad';
    $('fResumen').value = p?.resumen || '';
    $('fDescripcion').value = p?.descripcion || '';
    $('fActivo').checked = p ? p.activo : true;
    $('fDestacado').checked = !!p?.destacado;
    $('fStock').value = p?.stock || 'disponible';
    $('fOrden').value = p?.orden ?? 0;
    $('fMostrarPrecio').checked = !!p?.mostrarPrecio;
    $('fPrecio').value = p?.precio || '';
    $('fMoneda').value = p?.moneda || 'ARS';
    tags = [...(p?.tags || [])];
    renderTags();
    renderSpecs(p?.specs || []);
    renderCover();
    renderGallery();
    $('galleryHint').textContent = p ? `Hasta ${MAX_GALLERY} fotos.` : `Hasta ${MAX_GALLERY} fotos. Guardá el producto primero para subir fotos.`;
    showView('editor');
  }
  $('btnBack').addEventListener('click', () => { showView('dashboard'); renderList(); });

  // Specs
  function renderSpecs(list) {
    $('specsEditor').innerHTML = '';
    list.forEach(s => addSpecRow(s.k, s.v));
  }
  function addSpecRow(k = '', v = '') {
    const row = document.createElement('div');
    row.className = 'spec-row';
    row.innerHTML = `<input type="text" placeholder="Dato" value="${esc(k)}" data-k><input type="text" placeholder="Valor" value="${esc(v)}" data-v><button type="button" class="icon-btn" title="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('specsEditor').appendChild(row);
    return row;
  }
  $('btnAddSpec').addEventListener('click', () => addSpecRow().querySelector('input').focus());
  function readSpecs() {
    return [...$('specsEditor').querySelectorAll('.spec-row')].map(r => ({ k: r.querySelector('[data-k]').value.trim(), v: r.querySelector('[data-v]').value.trim() })).filter(s => s.k);
  }

  // Tags
  function renderTags() {
    const input = $('tagInput');
    $('tagsEditor').querySelectorAll('.tag').forEach(t => t.remove());
    tags.forEach((t, i) => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${esc(t)}<button type="button" aria-label="Quitar"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
      el.querySelector('button').addEventListener('click', () => { tags.splice(i, 1); renderTags(); });
      $('tagsEditor').insertBefore(el, input);
    });
  }
  $('tagInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      const v = ev.target.value.trim().replace(/,$/, '');
      if (v && !tags.includes(v)) { tags.push(v); renderTags(); }
      ev.target.value = '';
    } else if (ev.key === 'Backspace' && !ev.target.value && tags.length) { tags.pop(); renderTags(); }
  });
  $('tagInput').addEventListener('blur', ev => {
    const v = ev.target.value.trim();
    if (v && !tags.includes(v)) { tags.push(v); renderTags(); }
    ev.target.value = '';
  });

  // Cover
  function renderCover() {
    const src = pendingCover ? URL.createObjectURL(pendingCover) : (!coverRemoved && editing?.coverImage) || null;
    $('coverPreview').hidden = !src; $('coverEmpty').hidden = !!src;
    if (src) $('coverPreview').src = src;
    $('coverRemove').hidden = !src;
  }
  $('coverInput').addEventListener('change', ev => { pendingCover = ev.target.files[0] || null; coverRemoved = false; renderCover(); ev.target.value = ''; });
  $('coverRemove').addEventListener('click', () => { pendingCover = null; coverRemoved = true; renderCover(); });

  // Gallery
  function currentGallery() { return (editing?.images || []).filter(i => !removedImages.includes(i)); }
  function renderGallery() {
    const existing = currentGallery();
    const x = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    $('galleryGrid').innerHTML =
      existing.map(src => `<figure><img src="${esc(src)}" alt=""><button type="button" data-remove="${esc(src)}" title="Quitar">${x}</button></figure>`).join('') +
      pendingGallery.map((f, i) => `<figure class="pending"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-pending="${i}" title="Quitar">${x}</button></figure>`).join('');
    $('galleryCount').textContent = `${existing.length + pendingGallery.length} / ${MAX_GALLERY}`;
  }
  $('galleryInput').addEventListener('change', ev => {
    const files = [...ev.target.files];
    const room = MAX_GALLERY - currentGallery().length - pendingGallery.length;
    if (files.length > room) toast(`Solo podés agregar ${room} foto${room === 1 ? '' : 's'} más`, true);
    pendingGallery.push(...files.slice(0, Math.max(room, 0)));
    renderGallery(); ev.target.value = '';
  });
  $('galleryGrid').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.remove) removedImages.push(b.dataset.remove);
    else if (b.dataset.pending != null) pendingGallery.splice(Number(b.dataset.pending), 1);
    renderGallery();
  });

  // Guardar
  function readForm() {
    return {
      nombre: $('fNombre').value.trim(),
      categoria: $('fCategoria').value.trim(),
      linea: $('fLinea').value.trim(),
      codigo: $('fCodigo').value.trim(),
      terminacion: $('fTerminacion').value.trim(),
      medidas: $('fMedidas').value.trim(),
      unidad: $('fUnidad').value.trim() || 'unidad',
      resumen: $('fResumen').value.trim(),
      descripcion: $('fDescripcion').value.trim(),
      activo: $('fActivo').checked,
      destacado: $('fDestacado').checked,
      stock: $('fStock').value,
      orden: Number($('fOrden').value) || 0,
      mostrarPrecio: $('fMostrarPrecio').checked,
      precio: Number($('fPrecio').value) || 0,
      moneda: $('fMoneda').value,
      specs: readSpecs(),
      tags
    };
  }
  $('btnSave').addEventListener('click', async () => {
    const body = readForm();
    if (!body.nombre) { toast('El nombre es obligatorio', true); $('fNombre').focus(); return; }
    if (!body.categoria) { toast('La categoría es obligatoria', true); $('fCategoria').focus(); return; }
    const btn = $('btnSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      let saved = editing
        ? await api(`/products/${editing.id}`, { method: 'PUT', body })
        : await api('/products', { method: 'POST', body });
      const id = saved.id;
      if (coverRemoved && editing?.coverImage) saved = await api(`/products/${id}/cover`, { method: 'DELETE' });
      if (pendingCover) { const fd = new FormData(); fd.append('cover', pendingCover); saved = await api(`/products/${id}/cover`, { method: 'POST', body: fd }); }
      for (const img of removedImages) saved = await api(`/products/${id}/images/${encodeURIComponent(img.split('/').pop())}`, { method: 'DELETE' });
      if (pendingGallery.length) { const fd = new FormData(); pendingGallery.forEach(f => fd.append('images', f)); saved = await api(`/products/${id}/images`, { method: 'POST', body: fd }); }
      const idx = products.findIndex(p => p.id === id);
      if (idx >= 0) products[idx] = saved; else products.unshift(saved);
      await load(); fillCatalogos();
      toast(editing ? 'Producto actualizado' : 'Producto creado');
      openEditor(products.find(p => p.id === id));
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = 'Guardar'; }
  });

  // Eliminar
  let confirmAction = null;
  function confirm(title, text, action) {
    $('confirmTitle').textContent = title; $('confirmText').textContent = text; confirmAction = action; $('modalConfirm').hidden = false;
  }
  $('confirmOk').addEventListener('click', async () => { $('modalConfirm').hidden = true; if (confirmAction) await confirmAction(); });
  $('btnDelete').addEventListener('click', () => {
    if (!editing) return;
    confirm(`¿Eliminar “${editing.nombre}”?`, 'Se borra el producto y todas sus fotos. No se puede deshacer.', async () => {
      try {
        await api(`/products/${editing.id}`, { method: 'DELETE' });
        products = products.filter(p => p.id !== editing.id);
        toast('Producto eliminado'); showView('dashboard'); renderList();
      } catch (err) { toast(err.message, true); }
    });
  });

  // Contraseña
  $('btnChangePass').addEventListener('click', () => { $('passForm').reset(); $('passError').hidden = true; $('modalPass').hidden = false; });
  $('passForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if ($('passNew').value !== $('passNew2').value) { $('passError').textContent = 'Las contraseñas nuevas no coinciden'; $('passError').hidden = false; return; }
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: $('passCurrent').value, newPassword: $('passNew').value } });
      $('modalPass').hidden = true; toast('Contraseña actualizada');
    } catch (err) { $('passError').textContent = err.message; $('passError').hidden = false; }
  });
  document.querySelectorAll('.modal [data-close]').forEach(el => el.addEventListener('click', () => { el.closest('.modal').hidden = true; }));

  // Atajo guardar
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 's' && !$('viewEditor').hidden) { ev.preventDefault(); $('btnSave').click(); }
  });

  // ---------- Init ----------
  (async () => {
    if (localStorage.getItem(TOKEN_KEY)) {
      try { await api('/auth/verify'); await enterDashboard(); return; } catch (e) { /* cae al login */ }
    }
    showView('login');
  })();
})();
