// Garrahan — Negocio de Automotores · Panel de Administración
(function () {
  'use strict';

  const TOKEN_KEY = 'garrahan_admin_token';
  const EMAIL_KEY = 'garrahan_admin_email';
  const MAX_GALLERY = 10;
  const fmt = n => new Intl.NumberFormat('es-AR').format(n);
  const $ = id => document.getElementById(id);

  const SUGGESTED_TAGS = [
    'Único dueño', 'Service oficial', 'Aire acondicionado', 'Dirección asistida',
    'Levantavidrios eléctricos', 'Cierre centralizado', 'ABS + Airbags', 'Bluetooth',
    'Pantalla multimedia', 'Cámara de retroceso', 'Sensores de estacionamiento',
    'Control crucero', 'Climatizador automático', 'Tapizado de cuero',
    'Llantas de aleación', 'Faros LED', 'Techo panorámico', 'Cubiertas nuevas',
    'VTV al día', 'Papeles al día', 'GNC instalado'
  ];

  let vehicles = [];
  let catalogos = null;

  // Editor state
  let editing = null;            // vehicle being edited (null = new)
  let pendingCover = null;       // File queued as new cover
  let coverRemoved = false;      // remove existing cover on save
  let pendingGallery = [];       // Files queued for the gallery
  let removedImages = [];        // existing gallery paths queued for deletion
  let tags = [];

  // ===== API helper =====
  async function api(path, options = {}) {
    const headers = options.headers || {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch('/api' + path, { ...options, headers });
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      logout();
      throw new Error('Sesión expirada. Ingresá de nuevo.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
    return data;
  }

  // ===== Toast =====
  let toastTimer;
  function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('toast--error', !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ===== Views =====
  function showView(name) {
    $('viewLogin').hidden = name !== 'login';
    $('viewDashboard').hidden = name !== 'dashboard';
    $('viewEditor').hidden = name !== 'editor';
    window.scrollTo(0, 0);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    showView('login');
  }

  // ===== Login =====
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('loginSubmit');
    const errEl = $('loginError');
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Ingresando...';
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: $('loginEmail').value.trim(), password: $('loginPass').value }
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EMAIL_KEY, data.email);
      $('loginPass').value = '';
      await enterDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });

  $('btnLogout').addEventListener('click', logout);

  // ===== Dashboard =====
  async function loadVehicles() {
    const data = await api('/vehicles');
    vehicles = data.vehicles;
    catalogos = data.catalogos;
  }

  async function enterDashboard() {
    await loadVehicles();
    $('topbarUser').textContent = localStorage.getItem(EMAIL_KEY) || '';
    renderList();
    showView('dashboard');
  }

  function precioLabel(v) {
    if (!v.mostrarPrecio || !v.precio) return 'Consultar precio';
    const sym = v.moneda === 'USD' ? 'US$ ' : '$ ';
    if (v.precioDescuento) {
      return `<span class="vrow__price-desc">${sym}${fmt(v.precioDescuento)}</span> <s>${sym}${fmt(v.precio)}</s>`;
    }
    return sym + fmt(v.precio);
  }

  function renderList() {
    const q = $('searchInput').value.trim().toLowerCase();
    const fc = $('filterCondicion').value;
    const fe = $('filterEstado').value;

    let list = vehicles;
    if (q) list = list.filter(v => `${v.marca} ${v.modelo} ${v.version}`.toLowerCase().includes(q));
    if (fc) list = list.filter(v => v.condicion === fc);
    if (fe) list = list.filter(v => v.estado === fe);

    $('statTotal').textContent = vehicles.length;
    $('statDisp').textContent = vehicles.filter(v => v.estado === 'disponible').length;
    $('statRes').textContent = vehicles.filter(v => v.estado === 'reservado').length;
    $('statVend').textContent = vehicles.filter(v => v.estado === 'vendido').length;

    const box = $('vehicleList');
    $('vehicleEmpty').hidden = list.length > 0;
    box.innerHTML = list.map(v => `
      <div class="vrow" data-id="${v.id}">
        <div class="vrow__thumb">${v.coverImage ? `<img src="${v.coverImage}" alt="" loading="lazy">` : '🚗'}</div>
        <div class="vrow__info">
          <div class="vrow__name">${v.destacado ? '<span class="star" title="Destacado">★</span>' : ''}${esc(v.marca)} ${esc(v.modelo)} <small style="color:var(--texto-3);font-family:Inter;font-size:.82rem">${esc(v.version)}</small></div>
          <div class="vrow__meta">
            <span class="badge badge--${v.condicion === '0km' ? '0km' : 'usado'}">${v.condicion === '0km' ? '0KM' : 'Usado'}</span>
            <span class="badge badge--${v.estado}">${v.estado}</span>
            <span>${v.anio}</span>
            <span>${v.condicion === '0km' ? '0 km' : fmt(v.km) + ' km'}</span>
            <span>${(v.images || []).length + (v.coverImage ? 1 : 0)} 📷</span>
          </div>
          <div class="vrow__price">${precioLabel(v)}</div>
        </div>
        <div class="vrow__actions">
          <a class="chipbtn" href="vehiculo.html?id=${v.id}" target="_blank" rel="noopener">Ver ficha</a>
          <button class="chipbtn" data-action="edit" type="button">Editar</button>
          <button class="chipbtn chipbtn--danger" data-action="delete" type="button">Eliminar</button>
        </div>
      </div>
    `).join('');
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  ['searchInput', 'filterCondicion', 'filterEstado'].forEach(id =>
    $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderList)
  );

  // Row actions (edit / delete with inline confirm)
  $('vehicleList').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('.vrow').dataset.id);
    const v = vehicles.find(x => x.id === id);
    if (!v) return;

    if (btn.dataset.action === 'edit') {
      openEditor(v);
      return;
    }

    if (btn.dataset.action === 'delete') {
      if (!btn.classList.contains('chipbtn--confirm')) {
        btn.classList.add('chipbtn--confirm');
        btn.textContent = '¿Eliminar?';
        setTimeout(() => {
          btn.classList.remove('chipbtn--confirm');
          btn.textContent = 'Eliminar';
        }, 3500);
        return;
      }
      btn.disabled = true;
      try {
        await api('/vehicles/' + id, { method: 'DELETE' });
        toast(`${v.marca} ${v.modelo} eliminado`);
        await loadVehicles();
        renderList();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    }
  });

  $('btnNew').addEventListener('click', () => openEditor(null));

  // ===== Editor =====
  function fillSelect(id, values, selected) {
    $(id).innerHTML = values.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }

  function openEditor(v) {
    editing = v;
    pendingCover = null;
    coverRemoved = false;
    pendingGallery = [];
    removedImages = [];
    tags = v ? [...(v.equipamiento || [])] : [];

    $('editorTitle').textContent = v ? `Editar · ${v.marca} ${v.modelo}` : 'Nuevo vehículo';

    // Catalog-driven selects
    fillSelect('fTipo', catalogos.tipos, v?.tipo || 'SUV');
    fillSelect('fCombustible', catalogos.combustibles, v?.combustible || 'Nafta');
    fillSelect('fTransmision', catalogos.transmisiones, v?.transmision || 'Manual');
    fillSelect('fTraccion', catalogos.tracciones, v?.traccion || '4x2');
    $('marcasList').innerHTML = catalogos.marcas.map(m => `<option value="${esc(m)}">`).join('');

    // Fields
    $('fCondicion').value = v?.condicion || 'usado';
    $('fMarca').value = v?.marca || '';
    $('fModelo').value = v?.modelo || '';
    $('fVersion').value = v?.version || '';
    $('fAnio').value = v?.anio || '';
    $('fKm').value = v ? v.km : '';
    $('fColor').value = v?.color || '';
    $('fPuertas').value = String(v?.puertas || 5);
    $('fMotor').value = v?.motor || '';
    $('fPrecio').value = v?.precio || '';
    $('fPrecioDescuento').value = v?.precioDescuento || '';
    $('fMoneda').value = v?.moneda || 'ARS';
    $('fEstado').value = v?.estado || 'disponible';
    $('fMostrarPrecio').checked = v ? v.mostrarPrecio : true;
    $('fFinanciacion').checked = v ? v.financiacion : true;
    $('fPermuta').checked = v ? v.permuta : true;
    $('fDestacado').checked = v ? v.destacado : false;
    $('fDescripcion').value = v?.descripcion || '';

    toggleKmField();
    renderCover();
    renderGallery();
    renderTags();
    renderSuggested();
    showView('editor');
  }

  function toggleKmField() {
    const is0km = $('fCondicion').value === '0km';
    $('fieldKm').style.display = is0km ? 'none' : '';
  }
  $('fCondicion').addEventListener('change', toggleKmField);

  // ----- Cover -----
  function currentCoverURL() {
    if (pendingCover) return URL.createObjectURL(pendingCover);
    if (editing && editing.coverImage && !coverRemoved) return editing.coverImage;
    return null;
  }

  function renderCover() {
    const url = currentCoverURL();
    $('coverEmpty').hidden = !!url;
    $('coverPreview').hidden = !url;
    if (url) $('coverImg').src = url;
  }

  function setCoverFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('La portada debe ser JPG, PNG o WebP', true); return; }
    pendingCover = file;
    coverRemoved = false;
    renderCover();
  }

  $('coverEmpty').addEventListener('click', () => $('coverInput').click());
  $('btnCoverReplace').addEventListener('click', () => $('coverInput').click());
  $('coverInput').addEventListener('change', e => { setCoverFile(e.target.files[0]); e.target.value = ''; });
  $('btnCoverRemove').addEventListener('click', () => {
    pendingCover = null;
    coverRemoved = true;
    renderCover();
  });

  const coverZone = $('coverZone');
  ['dragover', 'dragleave', 'drop'].forEach(evt => coverZone.addEventListener(evt, e => {
    e.preventDefault();
    $('coverEmpty').classList.toggle('dragover', evt === 'dragover');
    if (evt === 'drop') setCoverFile(e.dataTransfer.files[0]);
  }));

  // ----- Gallery -----
  function existingGallery() {
    return editing ? (editing.images || []).filter(img => !removedImages.includes(img)) : [];
  }

  function galleryTotal() {
    return existingGallery().length + pendingGallery.length;
  }

  function renderGallery() {
    const grid = $('galleryGrid');
    const parts = [];
    existingGallery().forEach(img => {
      parts.push(`<div class="gitem"><img src="${img}" alt=""><button type="button" class="gitem__del" data-img="${esc(img)}" title="Quitar foto">✕</button></div>`);
    });
    pendingGallery.forEach((file, i) => {
      parts.push(`<div class="gitem gitem--pending"><img src="${URL.createObjectURL(file)}" alt=""><button type="button" class="gitem__del" data-pending="${i}" title="Quitar foto">✕</button></div>`);
    });
    grid.innerHTML = parts.join('');
    const total = galleryTotal();
    $('galleryCount').textContent = `${total} / ${MAX_GALLERY}`;
    $('btnGalleryAdd').disabled = total >= MAX_GALLERY;
  }

  function addGalleryFiles(fileList) {
    const files = Array.from(fileList).filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    const room = MAX_GALLERY - galleryTotal();
    if (files.length > room) {
      toast(`Solo podés agregar ${room} foto${room === 1 ? '' : 's'} más (máx. ${MAX_GALLERY})`, true);
    }
    pendingGallery.push(...files.slice(0, Math.max(0, room)));
    renderGallery();
  }

  $('btnGalleryAdd').addEventListener('click', () => $('galleryInput').click());
  $('galleryInput').addEventListener('change', e => { addGalleryFiles(e.target.files); e.target.value = ''; });
  $('galleryGrid').addEventListener('click', e => {
    const btn = e.target.closest('.gitem__del');
    if (!btn) return;
    if (btn.dataset.img !== undefined) {
      removedImages.push(btn.dataset.img);
    } else {
      pendingGallery.splice(Number(btn.dataset.pending), 1);
    }
    renderGallery();
  });

  const galleryAdd = $('btnGalleryAdd');
  ['dragover', 'dragleave', 'drop'].forEach(evt => galleryAdd.addEventListener(evt, e => {
    e.preventDefault();
    galleryAdd.classList.toggle('dragover', evt === 'dragover');
    if (evt === 'drop') addGalleryFiles(e.dataTransfer.files);
  }));

  // ----- Tags -----
  function renderTags() {
    $('tagsList').innerHTML = tags.map((t, i) =>
      `<span class="tag">${esc(t)}<button type="button" data-i="${i}" title="Quitar">✕</button></span>`
    ).join('');
  }

  function renderSuggested() {
    $('tagsSuggested').innerHTML = SUGGESTED_TAGS.filter(t => !tags.includes(t)).map(t =>
      `<button type="button" class="chipbtn" data-tag="${esc(t)}">+ ${esc(t)}</button>`
    ).join('');
  }

  function addTag(t) {
    t = t.trim();
    if (!t || tags.includes(t)) return;
    tags.push(t);
    renderTags();
    renderSuggested();
  }

  $('tagsInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(e.target.value);
      e.target.value = '';
    }
  });
  $('tagsList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    tags.splice(Number(btn.dataset.i), 1);
    renderTags();
    renderSuggested();
  });
  $('tagsSuggested').addEventListener('click', e => {
    const btn = e.target.closest('button[data-tag]');
    if (btn) addTag(btn.dataset.tag);
  });

  // ----- Save -----
  async function saveVehicle() {
    const marca = $('fMarca').value.trim();
    const modelo = $('fModelo').value.trim();
    const anio = parseInt($('fAnio').value);
    if (!marca || !modelo || !anio) {
      toast('Marca, modelo y año son obligatorios', true);
      return;
    }
    const pendingTag = $('tagsInput').value.trim();
    if (pendingTag) { addTag(pendingTag); $('tagsInput').value = ''; }

    const payload = {
      marca, modelo, anio,
      version: $('fVersion').value.trim(),
      km: $('fCondicion').value === '0km' ? 0 : (parseInt($('fKm').value) || 0),
      condicion: $('fCondicion').value,
      tipo: $('fTipo').value,
      combustible: $('fCombustible').value,
      transmision: $('fTransmision').value,
      motor: $('fMotor').value.trim(),
      puertas: parseInt($('fPuertas').value),
      color: $('fColor').value.trim(),
      traccion: $('fTraccion').value,
      precio: parseInt($('fPrecio').value) || 0,
      precioDescuento: parseInt($('fPrecioDescuento').value) || 0,
      moneda: $('fMoneda').value,
      mostrarPrecio: $('fMostrarPrecio').checked,
      financiacion: $('fFinanciacion').checked,
      permuta: $('fPermuta').checked,
      equipamiento: tags,
      descripcion: $('fDescripcion').value.trim(),
      destacado: $('fDestacado').checked,
      estado: $('fEstado').value
    };

    const btns = [$('btnSave'), $('btnSaveBottom')];
    btns.forEach(b => { b.disabled = true; b.textContent = 'Guardando...'; });

    try {
      let saved;
      if (editing) {
        saved = await api('/vehicles/' + editing.id, { method: 'PUT', body: payload });
      } else {
        saved = await api('/vehicles', { method: 'POST', body: payload });
      }

      // Cover
      if (coverRemoved && editing && editing.coverImage && !pendingCover) {
        await api(`/vehicles/${saved.id}/cover`, { method: 'DELETE' });
      }
      if (pendingCover) {
        const fd = new FormData();
        fd.append('cover', pendingCover);
        await api(`/vehicles/${saved.id}/cover`, { method: 'POST', body: fd });
      }

      // Gallery deletions
      for (const img of removedImages) {
        const filename = img.split('/').pop();
        await api(`/vehicles/${saved.id}/images/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      }

      // Gallery uploads
      if (pendingGallery.length) {
        const fd = new FormData();
        pendingGallery.forEach(f => fd.append('images', f));
        await api(`/vehicles/${saved.id}/images`, { method: 'POST', body: fd });
      }

      toast(`${saved.marca} ${saved.modelo} guardado ✔`);
      await enterDashboard();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btns.forEach(b => { b.disabled = false; });
      $('btnSave').textContent = 'Guardar';
      $('btnSaveBottom').textContent = 'Guardar vehículo';
    }
  }

  $('btnSave').addEventListener('click', saveVehicle);
  $('editorForm').addEventListener('submit', e => { e.preventDefault(); saveVehicle(); });
  $('btnBack').addEventListener('click', () => showView('dashboard'));
  $('btnCancel').addEventListener('click', () => showView('dashboard'));

  // ===== Change password =====
  const passDialog = $('passDialog');
  $('btnChangePass').addEventListener('click', () => {
    $('passForm').reset();
    $('passError').hidden = true;
    passDialog.showModal();
  });
  $('passCancel').addEventListener('click', () => passDialog.close());
  $('passForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('passError');
    errEl.hidden = true;
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: $('passCurrent').value, newPassword: $('passNew').value }
      });
      passDialog.close();
      toast('Contraseña actualizada ✔');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  // ===== Init =====
  (async function init() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { showView('login'); return; }
    try {
      await api('/auth/verify');
      await enterDashboard();
    } catch {
      showView('login');
    }
  })();
})();
