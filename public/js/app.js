/**
 * app.js — Arranque del frontend: sesión, navegación y enrutador por hash.
 *
 * Rutas:
 *   #/tickets            Listado con filtros
 *   #/tickets/nuevo      Crear ticket
 *   #/tickets/:id        Detalle, historial y acciones
 *   #/dashboard          Dashboard de métricas (técnico y admin)
 *   #/usuarios           Gestión de usuarios (admin)
 */
import { api, esc, ROLES, toast } from './util.js';
import { vistaTickets } from './views/tickets.js';
import { vistaNuevo } from './views/nuevo.js';
import { vistaDetalle } from './views/detalle.js';
import { vistaDashboard } from './views/dashboard.js';
import { vistaUsuarios } from './views/usuarios.js';
import { estado } from './state.js';

const $login = document.getElementById('login');
const $app = document.getElementById('app');
const $view = document.getElementById('view');

/* ------------------------------ Sesión ------------------------------ */

function mostrarLogin() {
  estado.usuario = null;
  $app.hidden = true;
  $login.hidden = false;
  document.querySelector('#login-form input[name=email]').focus();
}

function mostrarApp() {
  $login.hidden = true;
  $app.hidden = false;
  document.getElementById('me-nombre').textContent = estado.usuario.nombre;
  document.getElementById('me-rol').textContent = ROLES[estado.usuario.rol];
  pintarNav();
  if (!location.hash || location.hash === '#/') location.hash = '#/tickets';
  else enrutar();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const $err = document.getElementById('login-error');
  $err.textContent = '';
  try {
    const { usuario } = await api('/api/auth/login', {
      method: 'POST',
      body: { email: f.get('email'), password: f.get('password') },
    });
    estado.usuario = usuario;
    e.target.reset();
    location.hash = '#/tickets';
    mostrarApp();
  } catch (err) {
    $err.textContent = err.message;
  }
});

// Botones de usuarios de demostración: rellenan el formulario
document.querySelectorAll('[data-demo]').forEach((b) =>
  b.addEventListener('click', () => {
    const [email, pass] = b.dataset.demo.split('|');
    const form = document.getElementById('login-form');
    form.email.value = email;
    form.password.value = pass;
    form.requestSubmit();
  })
);

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.hash = '';
  mostrarLogin();
});

/* ---------------------------- Navegación ---------------------------- */

function pintarNav() {
  const rol = estado.usuario.rol;
  const items = [
    ['#/tickets', rol === 'solicitante' ? 'Mis tickets' : 'Tickets'],
    ['#/tickets/nuevo', 'Nuevo ticket'],
  ];
  if (rol !== 'solicitante') items.push(['#/dashboard', 'Dashboard']);
  if (rol === 'admin') items.push(['#/usuarios', 'Usuarios']);
  document.getElementById('nav').innerHTML = items
    .map(([href, txt]) => `<a href="${href}" data-href="${href}">${esc(txt)}</a>`)
    .join('');
}

function marcarActivo(ruta) {
  document.querySelectorAll('#nav a').forEach((a) => {
    const h = a.dataset.href;
    const activo = h === ruta || (h === '#/tickets' && /^#\/tickets\/\d+/.test(ruta));
    a.classList.toggle('active', activo);
  });
}

/* ----------------------------- Enrutador ----------------------------- */

async function enrutar() {
  if (!estado.usuario) return;
  const ruta = location.hash || '#/tickets';
  const rol = estado.usuario.rol;
  marcarActivo(ruta.split('?')[0]);
  $view.innerHTML = '<p class="muted">Cargando…</p>';

  try {
    let m;
    if (ruta.startsWith('#/tickets/nuevo')) await vistaNuevo($view);
    else if ((m = ruta.match(/^#\/tickets\/(\d+)/))) await vistaDetalle($view, Number(m[1]));
    else if (ruta.startsWith('#/tickets')) await vistaTickets($view);
    else if (ruta.startsWith('#/dashboard') && rol !== 'solicitante') await vistaDashboard($view);
    else if (ruta.startsWith('#/usuarios') && rol === 'admin') await vistaUsuarios($view);
    else location.hash = '#/tickets';
    $view.focus({ preventScroll: true });
  } catch (err) {
    if (err.status === 401) return mostrarLogin();
    $view.innerHTML = `<div class="panel panel-pad"><h2>No se pudo cargar</h2><p class="muted">${esc(err.message)}</p>
      <a class="btn" href="#/tickets">Volver a tickets</a></div>`;
  }
}

window.addEventListener('hashchange', enrutar);

// Si el servidor responde 401 en cualquier acción, se vuelve al login
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.status === 401) mostrarLogin();
  else if (e.reason?.message) toast(e.reason.message, 'error');
});

/* ------------------------------ Inicio ------------------------------ */

// Modo demo y versión (no bloquea el arranque si falla)
api('/api/health')
  .then(({ demo, version }) => {
    document.getElementById('demo-note').hidden = !demo;
    document.getElementById('version').textContent = `v${version}`;
  })
  .catch(() => {});

(async () => {
  try {
    const { usuario } = await api('/api/auth/me');
    estado.usuario = usuario;
    mostrarApp();
  } catch {
    mostrarLogin();
  }
})();
