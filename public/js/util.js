/**
 * util.js — Utilidades compartidas del frontend.
 */

/** Cliente de la API: envía/recibe JSON y lanza Error con el mensaje del servidor. */
export async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Escapa HTML para evitar inyección de código (XSS) al pintar datos del usuario. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ESTADOS = { abierto: 'Abierto', en_proceso: 'En proceso', resuelto: 'Resuelto', cerrado: 'Cerrado' };
export const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' };
export const CATEGORIAS = { hardware: 'Hardware', software: 'Software', red: 'Red', otro: 'Otro' };
export const ROLES = { solicitante: 'Solicitante', tecnico: 'Técnico', admin: 'Administrador' };

export const badgeEstado = (e) => `<span class="badge st-${esc(e)}">${ESTADOS[e] || esc(e)}</span>`;
export const badgePrioridad = (p) => `<span class="prio prio-${esc(p)}">${PRIORIDADES[p] || esc(p)}</span>`;

const fmtFecha = new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtFechaLarga = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

export const fecha = (iso) => (iso ? fmtFecha.format(new Date(iso)) : '—');
export const fechaLarga = (iso) => (iso ? fmtFechaLarga.format(new Date(iso)) : '—');

/** "hace 3 h", "hace 2 d"… */
export function hace(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Duración legible a partir de horas: 1.5 → "1 h 30 min", 50 → "2 d 2 h". */
export function duracion(horas) {
  if (horas == null) return '—';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(horas / 24);
  const h = Math.round(horas % 24);
  return h ? `${d} d ${h} h` : `${d} d`;
}

let toastTimer;
export function toast(msg, tipo = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${tipo === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2800);
}

/** Opciones <option> a partir de un objeto { valor: etiqueta }. */
export const opciones = (obj, sel = '') =>
  Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
