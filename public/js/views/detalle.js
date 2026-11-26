/**
 * views/detalle.js — Detalle del ticket: datos, historial/comentarios y
 * acciones según el rol (cambiar estado, asignar, tomar, comentar).
 * Las acciones disponibles las decide el servidor (campo `permisos`).
 */
import { api, esc, badgeEstado, badgePrioridad, fechaLarga, fecha, hace, duracion, toast, CATEGORIAS, ROLES } from '../util.js';
import { estado } from '../state.js';

const ACCION_ESTADO = {
  en_proceso: { abierto: 'Iniciar atención', resuelto: 'Volver a "En proceso"', default: 'Pasar a "En proceso"' },
  resuelto: { default: 'Marcar como resuelto' },
  cerrado: { resuelto: 'Confirmar solución y cerrar', default: 'Cerrar ticket' },
  abierto: { resuelto: 'Reabrir (no se resolvió)', default: 'Regresar a "Abierto"' },
};
const etiquetaAccion = (destino, actual) => ACCION_ESTADO[destino][actual] || ACCION_ESTADO[destino].default;

export async function vistaDetalle($view, id) {
  const u = estado.usuario;
  const [{ ticket: t, comentarios, permisos }, tec] = await Promise.all([
    api(`/api/tickets/${id}`),
    u.rol === 'admin' ? api('/api/usuarios/tecnicos') : Promise.resolve({ tecnicos: [] }),
  ]);

  const tiempoResolucion = t.resuelto_en
    ? duracion((new Date(t.resuelto_en) - new Date(t.creado_en)) / 36e5)
    : null;

  const historial = comentarios.map((c) =>
    c.tipo === 'sistema'
      ? `<li class="ev-sistema"><strong>${esc(c.usuario_nombre)}</strong> · ${esc(c.texto)}
           <span class="time" title="${fechaLarga(c.creado_en)}"> · ${fecha(c.creado_en)}</span></li>`
      : `<li class="ev-comentario"><article class="comment">
           <header><strong>${esc(c.usuario_nombre)}</strong>
             <span class="role-tag">${ROLES[c.usuario_rol]}</span>
             <span class="time" title="${fechaLarga(c.creado_en)}">${hace(c.creado_en)}</span></header>
           <p>${esc(c.texto)}</p>
         </article></li>`
  ).join('');

  // Panel de acciones
  const bloques = [];
  if (permisos.estados.length) {
    bloques.push(`
      <h3>Cambiar estado</h3>
      <textarea id="nota-estado" rows="2" style="min-height: 0" placeholder="Nota para el historial (opcional)"></textarea>
      ${permisos.estados.map((e) => `
        <button class="btn ${e === 'resuelto' || e === 'cerrado' ? 'btn--primary' : ''}" data-estado="${e}">
          ${esc(etiquetaAccion(e, t.estado))}</button>`).join('')}`);
  }
  if (permisos.tomar) {
    bloques.push(`<h3>Asignación</h3><button class="btn btn--accent" id="tomar">Tomar este ticket</button>`);
  }
  if (permisos.asignar && t.estado !== 'cerrado') {
    bloques.push(`
      <h3>Asignar técnico</h3>
      <div class="row">
        <select id="sel-tecnico">
          <option value="">— Sin asignar —</option>
          ${tec.tecnicos.map((x) => `<option value="${x.id}" ${x.id === t.tecnico_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}
        </select>
        <button class="btn" id="asignar">Guardar</button>
      </div>`);
  }
  if (!bloques.length) {
    const msg = t.estado === 'cerrado' ? 'Este ticket está cerrado.'
      : u.rol === 'solicitante' ? 'Un técnico está atendiendo su solicitud. Podrá confirmar el cierre cuando se marque como resuelto.'
      : 'No hay acciones disponibles para usted en este ticket.';
    bloques.push(`<p class="muted small" style="margin: 0">${msg}</p>`);
  }

  $view.innerHTML = `
    <a class="crumb" href="#/tickets">← Volver a tickets</a>
    <header class="page-head">
      <div>
        <span class="ticket-id">Ticket #${t.id}</span>
        <h1 style="margin-top: 4px">${esc(t.titulo)}</h1>
      </div>
      ${badgeEstado(t.estado)}
    </header>

    <div class="detail">
      <div style="display: grid; gap: 20px">
        <section class="panel panel-pad">
          <h2 style="margin-bottom: 10px">Descripción</h2>
          <p class="desc">${esc(t.descripcion)}</p>
        </section>

        <section class="panel panel-pad">
          <h2 style="margin-bottom: 16px">Historial y seguimiento</h2>
          <ul class="timeline">${historial}</ul>
          ${permisos.comentar ? `
            <form id="form-comentario" style="margin-top: 8px">
              <label style="margin-bottom: 8px">Agregar comentario
                <textarea name="texto" rows="3" style="min-height: 80px" required
                  placeholder="${u.rol === 'solicitante' ? 'Agregue información adicional para el técnico…' : 'Registre el diagnóstico, avance o solución aplicada…'}"></textarea>
              </label>
              <button class="btn btn--primary" type="submit">Comentar</button>
            </form>` : ''}
        </section>
      </div>

      <aside style="display: grid; gap: 20px">
        <section class="panel panel-pad">
          <dl class="meta">
            <div><dt>Prioridad</dt><dd>${badgePrioridad(t.prioridad)}</dd></div>
            <div><dt>Categoría</dt><dd>${CATEGORIAS[t.categoria]}</dd></div>
            <div><dt>Solicitante</dt><dd>${esc(t.solicitante_nombre)}</dd></div>
            <div><dt>Técnico</dt><dd>${t.tecnico_nombre ? esc(t.tecnico_nombre) : '<span class="unassigned">Sin asignar</span>'}</dd></div>
            <div><dt>Creado</dt><dd class="small">${fechaLarga(t.creado_en)}</dd></div>
            <div><dt>Actualizado</dt><dd class="small">${hace(t.actualizado_en)}</dd></div>
            ${tiempoResolucion ? `<div><dt>Tiempo de resolución</dt><dd class="mono">${tiempoResolucion}</dd></div>` : ''}
          </dl>
        </section>
        <section class="panel panel-pad actions">${bloques.join('')}</section>
      </aside>
    </div>`;

  /* ----------------------------- Eventos ----------------------------- */
  const recargar = () => vistaDetalle($view, id);
  const accion = async (btn, fn, ok) => {
    btn.disabled = true;
    try {
      await fn();
      toast(ok);
      await recargar();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };

  $view.querySelectorAll('[data-estado]').forEach((b) =>
    b.addEventListener('click', () =>
      accion(b, () => api(`/api/tickets/${id}/estado`, {
        method: 'PATCH',
        body: { estado: b.dataset.estado, nota: document.getElementById('nota-estado')?.value },
      }), 'Estado actualizado')
    )
  );

  document.getElementById('tomar')?.addEventListener('click', (e) =>
    accion(e.currentTarget, () => api(`/api/tickets/${id}/asignar`, { method: 'PATCH', body: { tecnico_id: u.id } }), 'Ticket asignado a usted')
  );

  document.getElementById('asignar')?.addEventListener('click', (e) =>
    accion(e.currentTarget, () => api(`/api/tickets/${id}/asignar`, {
      method: 'PATCH', body: { tecnico_id: document.getElementById('sel-tecnico').value || null },
    }), 'Asignación actualizada')
  );

  document.getElementById('form-comentario')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = e.target.texto.value.trim();
    if (!texto) return toast('Escriba un comentario', 'error');
    accion(e.target.querySelector('button'), () =>
      api(`/api/tickets/${id}/comentarios`, { method: 'POST', body: { texto } }), 'Comentario agregado');
  });
}
