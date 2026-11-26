/**
 * views/nuevo.js — Formulario de creación de tickets.
 */
import { api, opciones, toast, CATEGORIAS } from '../util.js';

export async function vistaNuevo($view) {
  $view.innerHTML = `
    <a class="crumb" href="#/tickets">← Volver a tickets</a>
    <header class="page-head"><div><h1>Nuevo ticket</h1><p>Describa el problema con el mayor detalle posible.</p></div></header>

    <form id="form-nuevo" class="panel panel-pad" style="max-width: 720px" novalidate>
      <label>Título
        <input name="titulo" maxlength="120" required placeholder="Ej.: La impresora del segundo piso no imprime" />
      </label>
      <label>Descripción
        <textarea name="descripcion" required placeholder="¿Qué pasa? ¿Desde cuándo? ¿Qué ya intentó? ¿Qué equipo o ubicación?"></textarea>
        <span class="hint">Mínimo 10 caracteres.</span>
      </label>
      <div class="grid-2">
        <label>Categoría
          <select name="categoria" required>${opciones(CATEGORIAS, 'hardware')}</select>
        </label>
        <div>
          <span style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px">Prioridad</span>
          <div class="segmented" role="radiogroup" aria-label="Prioridad">
            <label><input type="radio" name="prioridad" value="baja" /><span><i class="prio prio-baja"></i>Baja</span></label>
            <label><input type="radio" name="prioridad" value="media" checked /><span><i class="prio prio-media"></i>Media</span></label>
            <label><input type="radio" name="prioridad" value="alta" /><span><i class="prio prio-alta"></i>Alta</span></label>
          </div>
        </div>
      </div>
      <p class="form-error" id="nuevo-error" role="alert"></p>
      <div style="display: flex; gap: 8px">
        <button class="btn btn--primary" type="submit">Crear ticket</button>
        <a class="btn" href="#/tickets">Cancelar</a>
      </div>
    </form>`;

  const $form = document.getElementById('form-nuevo');
  $form.titulo.focus();
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData($form));
    const $err = document.getElementById('nuevo-error');
    $err.textContent = '';
    const btn = $form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const { ticket } = await api('/api/tickets', { method: 'POST', body: d });
      toast(`Ticket #${ticket.id} creado`);
      location.hash = `#/tickets/${ticket.id}`;
    } catch (err) {
      $err.textContent = err.message;
      btn.disabled = false;
    }
  });
}
