/**
 * routes/metricas.js — Función adicional: Dashboard de métricas.
 *
 * Indicadores calculados directamente sobre las tablas existentes:
 *  - Conteo por estado, prioridad y categoría
 *  - Tickets sin asignar y tickets de prioridad alta activos
 *  - Tiempo promedio de resolución (general y por prioridad)
 *  - Desempeño por técnico (activos, resueltos, tiempo promedio)
 *  - Tendencia diaria de tickets creados vs. resueltos
 *
 * Filtro opcional por rango de fechas de creación: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
const express = require('express');
const { db } = require('../db');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereRol('tecnico', 'admin'));

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Horas entre creación y resolución (julianday trabaja en días)
const HORAS_RESOLUCION = '(julianday(t.resuelto_en) - julianday(t.creado_en)) * 24';

router.get('/', (req, res) => {
  const { desde, hasta } = req.query;
  const where = ['1 = 1'];
  const params = [];
  if (desde && FECHA_RE.test(desde)) {
    where.push("date(t.creado_en, 'localtime') >= ?");
    params.push(desde);
  }
  if (hasta && FECHA_RE.test(hasta)) {
    where.push("date(t.creado_en, 'localtime') <= ?");
    params.push(hasta);
  }
  const W = where.join(' AND ');
  const q = (sql) => db.prepare(sql).all(...params);
  const q1 = (sql) => db.prepare(sql).get(...params);

  const resumen = q1(`
    SELECT
      COUNT(*)                                                         AS total,
      SUM(t.estado = 'abierto')                                        AS abiertos,
      SUM(t.estado = 'en_proceso')                                     AS en_proceso,
      SUM(t.estado = 'resuelto')                                       AS resueltos,
      SUM(t.estado = 'cerrado')                                        AS cerrados,
      SUM(t.tecnico_id IS NULL AND t.estado IN ('abierto','en_proceso')) AS sin_asignar,
      SUM(t.prioridad = 'alta' AND t.estado IN ('abierto','en_proceso')) AS alta_activos,
      ROUND(AVG(CASE WHEN t.resuelto_en IS NOT NULL THEN ${HORAS_RESOLUCION} END), 1) AS horas_promedio
    FROM tickets t WHERE ${W}`);

  // SUM() devuelve NULL si no hay filas; se normaliza a 0
  for (const k of Object.keys(resumen)) if (resumen[k] === null && k !== 'horas_promedio') resumen[k] = 0;

  const porCategoria = q(`
    SELECT t.categoria AS clave, COUNT(*) AS total,
           SUM(t.estado IN ('abierto','en_proceso')) AS activos
    FROM tickets t WHERE ${W} GROUP BY t.categoria ORDER BY total DESC`);

  const porPrioridad = q(`
    SELECT t.prioridad AS clave, COUNT(*) AS total,
           SUM(t.estado IN ('abierto','en_proceso')) AS activos,
           ROUND(AVG(CASE WHEN t.resuelto_en IS NOT NULL THEN ${HORAS_RESOLUCION} END), 1) AS horas_promedio
    FROM tickets t WHERE ${W} GROUP BY t.prioridad
    ORDER BY CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END`);

  const porTecnico = db.prepare(`
    SELECT u.id, u.nombre,
           COUNT(t.id)                                              AS asignados,
           COALESCE(SUM(t.estado IN ('abierto','en_proceso')), 0)   AS activos,
           COALESCE(SUM(t.estado IN ('resuelto','cerrado')), 0)     AS resueltos,
           ROUND(AVG(CASE WHEN t.resuelto_en IS NOT NULL THEN ${HORAS_RESOLUCION} END), 1) AS horas_promedio
    FROM usuarios u
    LEFT JOIN tickets t ON t.tecnico_id = u.id AND ${W}
    WHERE u.rol = 'tecnico' AND u.activo = 1
    GROUP BY u.id ORDER BY resueltos DESC, u.nombre`).all(...params);

  // Tendencia diaria (hora local): últimos 14 días o el rango pedido (máximo 60 días)
  const fechaLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fin = hasta && FECHA_RE.test(hasta) ? parse(hasta) : new Date();
  let inicio = desde && FECHA_RE.test(desde) ? parse(desde) : new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - 13);
  if ((fin - inicio) / 864e5 > 59) inicio = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - 59);

  const dias = [];
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) dias.push(fechaLocal(d));
  if (!dias.length) dias.push(fechaLocal(fin));

  const contarPorDia = (col) => Object.fromEntries(
    db.prepare(`SELECT date(${col}, 'localtime') AS dia, COUNT(*) AS n FROM tickets
                WHERE ${col} IS NOT NULL AND date(${col}, 'localtime') BETWEEN ? AND ? GROUP BY dia`)
      .all(dias[0], dias[dias.length - 1]).map((r) => [r.dia, r.n])
  );
  const creados = contarPorDia('creado_en');
  const resueltos = contarPorDia('resuelto_en');
  const tendencia = dias.map((dia) => ({ dia, creados: creados[dia] || 0, resueltos: resueltos[dia] || 0 }));

  res.json({ resumen, porCategoria, porPrioridad, porTecnico, tendencia });
});

module.exports = router;
