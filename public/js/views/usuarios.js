/**
 * views/usuarios.js — Gestión de usuarios (solo administrador):
 * crear usuarios, cambiar rol, activar/desactivar y restablecer contraseña.
 */
import { api, esc, opciones, toast, ROLES } from '../util.js';
import { estado } from '../state.js';

export async function vistaUsuarios($view) {
  const { usuarios } = await api('/api/usuarios');
  const yo = estado.usuario;

  $view.innerHTML = `
    <header class="page-head"><div><h1>Usuarios</h1><p>Cuentas, roles y acceso al sistema.</p></div></header>

    <div class="detail" style="grid-template-columns: 1fr 320px">
      <section class="panel">
        <table class="table">
          <thead><tr><th>Nombre</th><th>Rol</th><th class="num">Creados</th><th class="num">Asignados</th><th>Estado</th><th></th></tr></thead>
          <tbody>${usuarios.map((u) => `
            <tr data-id="${u.id}" style="${u.activo ? '' : 'opacity: .55'}">
              <td><div class="t-title">${esc(u.nombre)}${u.id === yo.id ? ' <span class="muted small">(usted)</span>' : ''}</div>
                <div class="t-sub">${esc(u.email)}</div></td>
              <td><select data-accion="rol" ${u.id === yo.id ? 'disabled' : ''} style="width: auto; padding: 5px 8px; font-size: 13px">
                ${opciones(ROLES, u.rol)}</select></td>
              <td class="num">${u.tickets_creados}</td>
              <td class="num">${u.rol === 'tecnico' ? u.tickets_asignados : '—'}</td>
              <td>${u.activo ? '<span class="badge st-resuelto">Activo</span>' : '<span class="badge st-cerrado">Inactivo</span>'}</td>
              <td style="white-space: nowrap; text-align: right">
                <button class="btn btn--sm" data-accion="password">Contraseña</button>
                ${u.id === yo.id ? '' : `<button class="btn btn--sm ${u.activo ? 'btn--danger' : ''}" data-accion="activo">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
              </td>
            </tr>
            <tr class="pw-row" data-for="${u.id}" hidden><td colspan="6" style="background: var(--bg)">
              <form class="pw-form" style="display: flex; gap: 8px; align-items: center">
                <span class="small muted">Nueva contraseña para ${esc(u.nombre)}:</span>
                <input type="password" name="password" minlength="6" placeholder="Mínimo 6 caracteres" style="max-width: 220px" required />
                <button class="btn btn--sm btn--primary" type="submit">Guardar</button>
              </form></td></tr>`).join('')}
          </tbody>
        </table>
      </section>

      <form id="form-usuario" class="panel panel-pad" novalidate>
        <h2 style="margin-bottom: 14px">Nuevo usuario</h2>
        <label>Nombre completo <input name="nombre" required /></label>
        <label>Correo <input type="email" name="email" required /></label>
        <label>Contraseña <input type="password" name="password" minlength="6" required /></label>
        <label>Rol <select name="rol">${opciones(ROLES, 'solicitante')}</select></label>
        <p class="form-error" id="usuario-error" role="alert"></p>
        <button class="btn btn--primary btn--block" type="submit">Crear usuario</button>
      </form>
    </div>`;

  const recargar = () => vistaUsuarios($view);
  const actualizar = async (id, body, ok) => {
    try {
      await api(`/api/usuarios/${id}`, { method: 'PATCH', body });
      toast(ok);
      await recargar();
    } catch (err) {
      toast(err.message, 'error');
      await recargar();
    }
  };

  $view.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = Number(tr.dataset.id);
    const u = usuarios.find((x) => x.id === id);
    tr.querySelector('[data-accion=rol]').addEventListener('change', (e) =>
      actualizar(id, { rol: e.target.value }, `Rol de ${u.nombre} actualizado`));
    tr.querySelector('[data-accion=activo]')?.addEventListener('click', () =>
      actualizar(id, { activo: !u.activo }, u.activo ? 'Usuario desactivado' : 'Usuario activado'));
    tr.querySelector('[data-accion=password]').addEventListener('click', () => {
      const fila = $view.querySelector(`.pw-row[data-for="${id}"]`);
      fila.hidden = !fila.hidden;
      if (!fila.hidden) fila.querySelector('input').focus();
    });
  });

  $view.querySelectorAll('.pw-form').forEach((f) =>
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = Number(f.closest('tr').dataset.for);
      actualizar(id, { password: f.password.value }, 'Contraseña actualizada');
    })
  );

  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const $err = document.getElementById('usuario-error');
    $err.textContent = '';
    try {
      await api('/api/usuarios', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('Usuario creado');
      await recargar();
    } catch (err) {
      $err.textContent = err.message;
    }
  });
}
