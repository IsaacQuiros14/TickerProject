/**
 * views/dashboard.js — Función adicional: Dashboard de métricas.
 * Gráficos dibujados en SVG/CSS sin librerías externas (funciona sin internet).
 */
import { api, esc, duracion, CATEGORIAS, PRIORIDADES } from '../util.js';

const COLOR_CREADOS = '#1c1b19';
const COLOR_RESUELTOS = '#e8590c';

/** Gráfico de barras agrupadas: creados vs. resueltos por día. */
function graficoTendencia(datos) {
  const W = 640, H = 220, padL = 26, padB = 26, padT = 10;
  const max = Math.max(1, ...datos.flatMap((d) => [d.creados, d.resueltos]));
  const paso = Math.ceil(max / 4);
  const tope = paso * 4;
  const ancho = (W - padL) / datos.length;
  const barra = Math.min(14, ancho / 2 - 3);
  const y = (v) => H - padB - (v / tope) * (H - padB - padT);

  const grilla = [0, 1, 2, 3, 4].map((i) => {
    const v = i * paso;
    return `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#ece9e2" />
            <text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  }).join('');

  const barras = datos.map((d, i) => {
    const cx = padL + ancho * i + ancho / 2;
    const [, m, dd] = d.dia.split('-');
    const etiqueta = datos.length <= 16 || i % 2 === 0
      ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${dd}/${m}</text>` : '';
    return `
      <rect x="${cx - barra - 1}" y="${y(d.creados)}" width="${barra}" height="${H - padB - y(d.creados)}" rx="2" fill="${COLOR_CREADOS}">
        <title>${d.dia}: ${d.creados} creado(s)</title></rect>
      <rect x="${cx + 1}" y="${y(d.resueltos)}" width="${barra}" height="${H - padB - y(d.resueltos)}" rx="2" fill="${COLOR_RESUELTOS}">
        <title>${d.dia}: ${d.resueltos} resuelto(s)</title></rect>
      ${etiqueta}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tickets creados y resueltos por día">${grilla}${barras}</svg>`;
}

/** Barras horizontales: total y porción activa. */
function barrasHorizontales(filas, etiquetas) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  if (!filas.length) return '<p class="muted">Sin datos en el rango.</p>';
  return `<div class="hbars">${filas.map((f) => `
    <div class="hbar">
      <header><span>${esc(etiquetas[f.clave] || f.clave)}</span>
        <span class="mono muted">${f.total} <span class="small">(${f.activos} activos)</span></span></header>
      <div class="track">
        <div class="fill" style="width:${(f.activos / max) * 100}%"></div>
        <div class="fill fill--soft" style="width:${((f.total - f.activos) / max) * 100}%"></div>
      </div>
    </div>`).join('')}</div>`;
}

export async function vistaDashboard($view) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const desde = qs.get('desde') || '';
  const hasta = qs.get('hasta') || '';
  const m = await api(`/api/metricas?${qs}`);
  const r = m.resumen;
  const activos = r.abiertos + r.en_proceso;
  const atendidos = r.resueltos + r.cerrados;
  const tasa = r.total ? Math.round((atendidos / r.total) * 100) : 0;

  $view.innerHTML = `
    <header class="page-head">
      <div><h1>Dashboard de métricas</h1><p>Indicadores de atención de la mesa de ayuda.</p></div>
      <form id="rango" class="filters" style="border: 0; padding: 0">
        <label style="margin: 0">Desde <input type="date" name="desde" value="${esc(desde)}" /></label>
        <label style="margin: 0">Hasta <input type="date" name="hasta" value="${esc(hasta)}" /></label>
        <button class="btn btn--sm" type="submit" style="align-self: end">Aplicar</button>
        ${desde || hasta ? '<a class="btn btn--sm" href="#/dashboard" style="align-self: end">Todo</a>' : ''}
      </form>
    </header>

    <section class="kpis">
      <a class="kpi" href="#/tickets?estado=activos" style="text-decoration:none">
        <span>Tickets activos</span><strong>${activos}</strong>
        <span class="small">${r.abiertos} abiertos · ${r.en_proceso} en proceso</span></a>
      <a class="kpi ${r.sin_asignar ? 'kpi--alert' : ''}" href="#/tickets?tecnico_id=sin&estado=activos" style="text-decoration:none">
        <span>Sin asignar</span><strong>${r.sin_asignar}</strong><span class="small">esperando técnico</span></a>
      <a class="kpi ${r.alta_activos ? 'kpi--alert' : ''}" href="#/tickets?prioridad=alta&estado=activos" style="text-decoration:none">
        <span>Prioridad alta activos</span><strong>${r.alta_activos}</strong><span class="small">requieren atención</span></a>
      <div class="kpi"><span>Resueltos y cerrados</span><strong>${atendidos}<small>/ ${r.total}</small></strong>
        <span class="small">${tasa}% del total</span></div>
      <div class="kpi"><span>Tiempo prom. de resolución</span>
        <strong style="font-size: 24px; margin-top: 10px">${duracion(r.horas_promedio)}</strong>
        <span class="small">desde creación hasta resuelto</span></div>
    </section>

    <div class="dash-grid">
      <section class="panel">
        <div class="panel-head"><h2>Creados vs. resueltos por día</h2>
          <div class="chart-legend"><span><i style="background:${COLOR_CREADOS}"></i>Creados</span>
            <span><i style="background:${COLOR_RESUELTOS}"></i>Resueltos</span></div></div>
        <div class="panel-pad chart">${graficoTendencia(m.tendencia)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Tickets por categoría</h2></div>
        <div class="panel-pad">${barrasHorizontales(m.porCategoria, CATEGORIAS)}
          <p class="small muted" style="margin: 14px 0 0">Tramo oscuro: activos · tramo claro: resueltos/cerrados</p></div>
      </section>
    </div>

    <div class="dash-grid" style="grid-template-columns: 1.6fr 1fr">
      <section class="panel">
        <div class="panel-head"><h2>Desempeño por técnico</h2></div>
        <table class="table">
          <thead><tr><th>Técnico</th><th class="num">Asignados</th><th class="num">Activos</th><th class="num">Resueltos</th><th class="num">Tiempo prom.</th></tr></thead>
          <tbody>${m.porTecnico.map((t) => `
            <tr class="clickable" data-tec="${t.id}">
              <td class="t-title">${esc(t.nombre)}</td>
              <td class="num">${t.asignados}</td><td class="num">${t.activos}</td><td class="num">${t.resueltos}</td>
              <td class="num">${duracion(t.horas_promedio)}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin técnicos activos</td></tr>'}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Por prioridad</h2></div>
        <table class="table">
          <thead><tr><th>Prioridad</th><th class="num">Total</th><th class="num">Activos</th><th class="num">Tiempo prom.</th></tr></thead>
          <tbody>${m.porPrioridad.map((p) => `
            <tr><td><span class="prio prio-${p.clave}">${PRIORIDADES[p.clave]}</span></td>
              <td class="num">${p.total}</td><td class="num">${p.activos}</td><td class="num">${duracion(p.horas_promedio)}</td></tr>`).join('')
            || '<tr><td colspan="4" class="empty">Sin datos</td></tr>'}
          </tbody>
        </table>
      </section>
    </div>`;

  document.getElementById('rango').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(e.target)) if (v) p.set(k, v);
    location.hash = `#/dashboard${p.toString() ? '?' + p : ''}`;
  });
  $view.querySelectorAll('tr[data-tec]').forEach((tr) =>
    tr.addEventListener('click', () => (location.hash = `#/tickets?tecnico_id=${tr.dataset.tec}`))
  );
}
