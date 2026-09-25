import { get, post } from './lib.js';

const form = document.getElementById('form-ingreso');
const aviso = document.getElementById('ingreso-error');
const sesion = document.getElementById('sesion-abierta');

// Si el celular ya tiene una sesión (por ejemplo, la de tesorería), se avisa con quién
// y se ofrece cambiar de usuario, en vez de entrar directo.
fetch('/api/auth/me', { credentials: 'same-origin' })
  .then(r => (r.ok ? r.json() : null))
  .then(d => {
    if (!d?.usuario) return;
    document.getElementById('sesion-nombre').textContent = `${d.usuario.nombre} ${d.usuario.apellido}`;
    sesion.hidden = false;
    form.hidden = true;
  })
  .catch(() => {});

document.getElementById('otro-usuario').addEventListener('click', async () => {
  try { await post('/api/auth/logout'); } catch { /* igual se muestra el formulario */ }
  sesion.hidden = true;
  form.hidden = false;
  form.email.focus();
});

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
