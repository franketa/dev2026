/* ============================================================
   Step Form — solicitud.html
   Navegación paso a paso + envío a Web3Forms
   ============================================================ */
(function () {
  'use strict';

  // 👉 REEMPLAZÁ ESTO POR TU ACCESS KEY DE web3forms.com (gratis)
  //    Registrate en https://web3forms.com con venturebytedigital@gmail.com
  //    Copiá el access key y pegalo acá abajo.
  const WEB3FORMS_ACCESS_KEY = '27365ceb-64f5-4ac4-aa6b-206fc3a9f443';
  const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
  const MAX_FILE_SIZE_MB = 5;

  const form = document.getElementById('stepForm');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.step'));
  const lastFormStep = steps.filter(s => !s.classList.contains('step--success')).length; // 12
  const successStep = steps.find(s => s.classList.contains('step--success'));

  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnSkip = document.getElementById('btnSkip');
  const btnSubmit = document.getElementById('btnSubmit');
  const stepNav = document.getElementById('stepNav');
  const progressFill = document.getElementById('progressFill');
  const stepCurrentEl = document.getElementById('stepCurrent');
  const stepTotalEl = document.getElementById('stepTotal');
  const submitErrorEl = document.getElementById('submitError');

  stepTotalEl.textContent = lastFormStep;

  let currentIndex = 0; // index in `steps` array

  // ----- Render paso actual -----
  function renderStep(newIndex, direction) {
    const oldStep = steps[currentIndex];
    const newStep = steps[newIndex];

    oldStep.classList.remove('step--active');
    oldStep.classList.add('step--leaving');

    // small delay for fade out
    setTimeout(() => {
      oldStep.classList.remove('step--leaving');
      newStep.classList.add('step--active');
      currentIndex = newIndex;
      updateControls();
      // focus primer input del paso nuevo
      const firstInput = newStep.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([hidden]), textarea, select');
      if (firstInput && !newStep.classList.contains('step--success')) {
        setTimeout(() => firstInput.focus({ preventScroll: false }), 120);
      }
      // scroll top suave
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
  }

  function updateControls() {
    const step = steps[currentIndex];
    const stepNumber = parseInt(step.dataset.step, 10);
    const isSuccess = step.classList.contains('step--success');
    const isLast = stepNumber === lastFormStep;
    const isRequired = step.dataset.required === 'true';

    if (isSuccess) {
      stepNav.hidden = true;
      progressFill.style.width = '100%';
      stepCurrentEl.textContent = lastFormStep;
      return;
    }
    stepNav.hidden = false;

    // Progreso (paso actual sobre total)
    const pct = Math.round((stepNumber / lastFormStep) * 100);
    progressFill.style.width = pct + '%';
    stepCurrentEl.textContent = stepNumber;

    btnPrev.disabled = stepNumber === 1;
    btnNext.hidden = isLast;
    btnSubmit.hidden = !isLast;
    btnSkip.hidden = isRequired;
  }

  // ----- Validación del paso actual -----
  function validateCurrent() {
    const step = steps[currentIndex];
    const isRequired = step.dataset.required === 'true';

    // Si es opcional, no valida
    if (!isRequired) return true;

    let valid = true;
    step.classList.remove('step--error');

    // Inputs text/email/tel/textarea requeridos
    const inputs = step.querySelectorAll('input[required], textarea[required]');
    inputs.forEach(input => {
      const group = input.closest('.form-group');
      group && group.classList.remove('form-group--error');

      if (!input.value.trim()) {
        group && group.classList.add('form-group--error');
        valid = false;
        return;
      }
      if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
        group && group.classList.add('form-group--error');
        valid = false;
      }
    });

    // Radios: al menos uno marcado
    const radioGroups = step.querySelectorAll('[role="radiogroup"]');
    radioGroups.forEach(rg => {
      const radios = rg.querySelectorAll('input[type="radio"]');
      if (radios.length && !Array.from(radios).some(r => r.checked)) {
        step.classList.add('step--error');
        valid = false;
      }
    });

    // Files: tamaño máx
    const files = step.querySelectorAll('input[type="file"]');
    files.forEach(f => {
      if (f.files && f.files[0] && f.files[0].size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        const group = f.closest('.form-group');
        group && group.classList.add('form-group--error');
        const hint = group.querySelector('.form-group__hint');
        if (hint) hint.textContent = `El archivo supera los ${MAX_FILE_SIZE_MB} MB. Subí uno más chico.`;
        valid = false;
      }
    });

    return valid;
  }

  // ----- Navegación -----
  function goNext() {
    if (!validateCurrent()) return;
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];
      // Si el próximo es success, no entrar por next (sale por submit)
      if (nextStep.classList.contains('step--success')) return;
      renderStep(currentIndex + 1, 'forward');
    }
  }
  function goPrev() {
    if (currentIndex > 0) renderStep(currentIndex - 1, 'back');
  }
  function skip() {
    const step = steps[currentIndex];
    if (step.dataset.required === 'true') return;
    // limpia inputs del paso saltado
    step.querySelectorAll('input:not([type="radio"]), textarea').forEach(i => { if (i.type !== 'file') i.value = ''; });
    step.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(i => { i.checked = false; });
    goNext();
  }

  btnNext.addEventListener('click', goNext);
  btnPrev.addEventListener('click', goPrev);
  btnSkip.addEventListener('click', skip);

  // Enter avanza (excepto en textarea)
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const step = steps[currentIndex];
      const stepNum = parseInt(step.dataset.step, 10);
      if (stepNum === lastFormStep) {
        form.requestSubmit();
      } else {
        goNext();
      }
    }
  });

  // ----- Chips (paso 6) -----
  const chipContainer = document.getElementById('estiloChips');
  if (chipContainer) {
    const textarea = document.getElementById('imagen_a_transmitir');
    chipContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const text = chip.dataset.chip;
      chip.classList.toggle('chip--active');
      if (chip.classList.contains('chip--active')) {
        textarea.value = textarea.value ? textarea.value + (textarea.value.endsWith('.') ? ' ' : '. ') + text : text;
      }
      textarea.focus();
    });
  }

  // ----- Toggles (logo sí/no + acción otro) -----
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type !== 'radio') return;

    // recalcular visibilidad de todos los toggles del grupo
    document.querySelectorAll(`input[type="radio"][name="${el.name}"]`).forEach(r => {
      if (r.dataset.toggle) {
        const t = document.getElementById(r.dataset.toggle);
        if (t) t.hidden = !r.checked;
      }
      if (r.dataset.toggleOff) {
        const t = document.getElementById(r.dataset.toggleOff);
        if (t) t.hidden = r.checked;
      }
    });

    // radio dentro de grupo: quita error
    const step = el.closest('.step');
    step && step.classList.remove('step--error');
  });

  // Limpiar error en input al escribir
  form.addEventListener('input', (e) => {
    const group = e.target.closest('.form-group');
    group && group.classList.remove('form-group--error');
    submitErrorEl.hidden = true;
  });

  // ----- Helpers de upload al backend -----
  // Sube un archivo a /api/upload y devuelve su URL pública.
  async function uploadToBackend(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'No pudimos subir ' + file.name);
    }
    return data.url;
  }

  // ----- Submit -----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateCurrent()) return;

    submitErrorEl.hidden = true;
    form.classList.add('step-form__form--sending');
    btnSubmit.disabled = true;
    const originalText = btnSubmit.innerHTML;

    try {
      if (WEB3FORMS_ACCESS_KEY === 'REEMPLAZAR_CON_KEY_DE_WEB3FORMS') {
        throw new Error('Access key no configurado. Registrate en web3forms.com y pegá el key en solicitud.js.');
      }

      // 1) Subir archivos al backend de Coolify primero, sacar URLs.
      //    Esto evita la feature paga de Web3Forms para adjuntos.
      const logoInput = form.querySelector('#logo');
      const manualInput = form.querySelector('#manual_marca');
      const logoFile = logoInput && logoInput.files && logoInput.files[0];
      const manualFile = manualInput && manualInput.files && manualInput.files[0];

      let logoUrl = '';
      let manualUrl = '';

      if (logoFile || manualFile) {
        btnSubmit.innerHTML = 'Subiendo archivos…';
        const tasks = [];
        if (logoFile)   tasks.push(uploadToBackend(logoFile).then(u => (logoUrl = u)));
        if (manualFile) tasks.push(uploadToBackend(manualFile).then(u => (manualUrl = u)));
        await Promise.all(tasks);
      }

      // 2) Armar payload para Web3Forms (sin los files, con las URLs como texto).
      btnSubmit.innerHTML = 'Enviando…';
      const fd = new FormData(form);
      fd.delete('logo');
      fd.delete('manual_marca');
      if (logoUrl)   fd.append('logo_url', logoUrl);
      if (manualUrl) fd.append('manual_marca_url', manualUrl);

      fd.append('access_key', WEB3FORMS_ACCESS_KEY);
      const nombre = (fd.get('nombre_negocio') || 'sin nombre').toString().trim();
      fd.append('subject', `Nueva solicitud de landing — ${nombre}`);
      fd.append('from_name', 'VentureByte · Formulario de solicitud');
      fd.append('botcheck', '');

      // 3) Enviar a Web3Forms
      const res = await fetch(WEB3FORMS_ENDPOINT, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No pudimos enviar el formulario.');
      }

      // éxito — pasar a la pantalla 13
      const successIndex = steps.indexOf(successStep);
      renderStep(successIndex, 'forward');

    } catch (err) {
      console.error('[solicitud] error:', err);
      submitErrorEl.hidden = false;
    } finally {
      form.classList.remove('step-form__form--sending');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  });

  // Init
  updateControls();
})();
