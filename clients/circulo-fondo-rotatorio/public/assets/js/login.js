import { post, verContrasenas } from './lib.js';

const form = document.getElementById('login');
const err = document.getElementById('error');
verContrasenas(form);

// Si ya hay sesión, directo al sistema.
fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => { if (r.ok) location.replace('/app'); }).catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true;
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await post('/api/auth/login', { email: form.email.value, password: form.password.value });
    location.replace('/app');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
});
