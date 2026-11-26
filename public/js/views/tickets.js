/**
 * views/tickets.js — Listado general de tickets con filtros.
 * Los filtros se reflejan en la URL (#/tickets?estado=abierto...) para poder
 * compartir o recargar la vista sin perderlos.
 */
import { api, esc, opciones, badgeEstado, badgePrioridad, hace, ESTADOS, PRIORIDADES, CATEGORIAS } from '../util.js';
import { estado } from '../state.js';

function leerFiltros() {
  const qs = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(qs));
}

export async function vistaTickets($view) {
  const u = estado.usuario;
  const f = leerFiltros();
  const verTecnicos = u.rol !== 'solicitante';

  const [{ tickets }, tec] = await Promise.all([
    api(`/api/tickets?${new URLSearchParams(f)}`),
    verTecnicos ? api('/api/usuarios/tecnicos') : Promise.resolve({ tecnicos: [] }),
  ]);

  const opTecnicos = verTecnicos
    ? `<select name="tecnico_id" aria-label="Técnico">
         <option value="">Todos los técnicos</option>
         <option value="sin" ${f.tecnico_id === 'sin' ? 'selected' : ''}>Sin asignar</option>
         ${tec.tecnicos.map((t) => `<option value="${t.id}" ${String(t.id) === f.tecnico_id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}
       </select>`
    : '';

  const titulo = u.rol === 'solicitante' ? 'Mis tickets' : u.rol === 'tecnico' ? 'Tickets' : 'Todos los tickets';
  const subtitulo = {
    solicitante: 'Solicitudes que usted ha reportado.',
    tecnico: 'Tickets asignados a usted y tickets sin asignar.',
    admin: 'Vista completa de la mesa de ayuda.',
  }[u.rol];

  $view.innerHTML = `
    <header class="page-head">
      <div><h1>${titulo}</h1><p>${subtitulo}</p></div>
      <a class="btn btn--accent" href="#/tickets/nuevo">+ Nuevo ticket</a>
    </header>

    <section class="panel">
      <form class="filters" id="filtros">
        <input type="search" name="q" placeholder="Buscar por título, descripción o #número" value="${esc(f.q || '')}" />
        <select name="estado" aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="activos" ${f.estado === 'activos' ? 'selected' : ''}>Activos (abierto + en proceso)</option>
          ${opciones(ESTADOS, f.estado)}
        </select>
        <select name="prioridad" aria-label="Prioridad"><option value="">Toda prioridad</option>${opciones(PRIORIDADES, f.prioridad)}</select>
        <select name="categoria" aria-label="Categoría"><option value="">Toda categoría</option>${opciones(CATEGORIAS, f.categoria)}</select>
        ${opTecnicos}
        <button type="button" class="btn btn--sm" id="limpiar">Limpiar</button>
      </form>

      ${tickets.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Ticket</th><th>Prioridad</th><th>Estado</th>
          ${u.rol !== 'solicitante' ? '<th class="hide-sm">Solicitante</th>' : ''}
          <th class="hide-sm">Técnico</th><th class="hide-sm">Actualizado</th>
        </tr></thead>
        <tbody>
          ${tickets.map((t) => `
            <tr class="clickable" data-id="${t.id}">
              <td class="mono muted">${t.id}</td>
              <td><div class="t-title">${esc(t.titulo)}</div><div class="cat">${CATEGORIAS[t.categoria]}</div></td>
              <td>${badgePrioridad(t.prioridad)}</td>
              <td>${badgeEstado(t.estado)}</td>
              ${u.rol !== 'solicitante' ? `<td class="hide-sm">${esc(t.solicitante_nombre)}</td>` : ''}
              <td class="hide-sm">${t.tecnico_nombre ? esc(t.tecnico_nombre) : '<span class="unassigned">Sin asignar</span>'}</td>
              <td class="hide-sm muted small" title="${esc(t.actualizado_en)}">${hace(t.actualizado_en)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="muted small" style="padding: 10px 14px; margin: 0; border-top: 1px solid var(--line)">${tickets.length} ticket(s)</p>`
      : `<div class="empty">No hay tickets con estos filtros.</div>`}
    </section>`;

  // Filtros → URL
  const $f = document.getElementById('filtros');
  const aplicar = () => {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData($f)) if (v) params.set(k, v);
    const qs = params.toString();
    location.hash = `#/tickets${qs ? '?' + qs : ''}`;
  };
  $f.querySelectorAll('select').forEach((s) => s.addEventListener('change', aplicar));
  $f.addEventListener('submit', (e) => { e.preventDefault(); aplicar(); });
  let t;
  $f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(aplicar, 400); });
  document.getElementById('limpiar').addEventListener('click', () => (location.hash = '#/tickets'));

  // Mantener foco en el buscador tras re-render
  if (f.q) { $f.q.focus(); $f.q.setSelectionRange(f.q.length, f.q.length); }

  $view.querySelectorAll('tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => (location.hash = `#/tickets/${tr.dataset.id}`))
  );
}
