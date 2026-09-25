import { post } from './lib.js';

const form = document.getElementById('form-ingreso');
const aviso = document.getElementById('ingreso-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  aviso.hidden = true;
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    aviso.textContent = 'Completá tu email y tu contraseña.';
    aviso.hidden = false;
    return;
  }
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await post('/api/auth/login', { email, password });
    location.href = '/app';
  } catch (err) {
    aviso.textContent = err.message;
    aviso.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Entrar';
    form.password.select();
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
