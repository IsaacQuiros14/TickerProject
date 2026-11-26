/**
 * routes/tickets.js — Módulo principal de tickets.
 *
 * Reglas de permisos:
 *  - solicitante: ve y comenta solo sus tickets; puede cerrar o reabrir
 *    un ticket propio cuando está "resuelto".
 *  - tecnico: ve los tickets asignados a él y los que no tienen técnico;
 *    puede "tomar" un ticket sin asignar y avanzar su estado.
 *  - admin: ve todo, asigna a cualquier técnico y cambia cualquier estado.
 */
const express = require('express');
const { db, ahora, transaccion, CATEGORIAS, PRIORIDADES, ESTADOS } = require('../db');
const { requiereLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereLogin);

const ETIQUETA_ESTADO = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

// Consulta base: ticket + nombres del solicitante y del técnico
const SELECT_TICKET = `
  SELECT t.*,
         s.nombre AS solicitante_nombre,
         s.email  AS solicitante_email,
         tec.nombre AS tecnico_nombre
  FROM tickets t
  JOIN usuarios s        ON s.id = t.solicitante_id
  LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
`;

/* ---------------------------- Helpers de permisos ---------------------------- */

function puedeVer(u, t) {
  if (u.rol === 'admin') return true;
  if (u.rol === 'tecnico') return t.tecnico_id === u.id || t.tecnico_id === null || t.solicitante_id === u.id;
  return t.solicitante_id === u.id;
}

/** Estados a los que el usuario puede mover el ticket desde su estado actual. */
function transicionesPermitidas(u, t) {
  if (u.rol === 'admin') return ESTADOS.filter((e) => e !== t.estado);

  const opciones = [];
  if (u.rol === 'tecnico' && t.tecnico_id === u.id) {
    if (t.estado === 'abierto') opciones.push('en_proceso');
    if (t.estado === 'en_proceso') opciones.push('resuelto', 'abierto');
    if (t.estado === 'resuelto') opciones.push('en_proceso');
  }
  // El solicitante confirma (cierra) o reabre cuando el técnico lo marcó resuelto
  if (t.solicitante_id === u.id && t.estado === 'resuelto') {
    opciones.push('cerrado', 'abierto');
  }
  return [...new Set(opciones)];
}

function permisos(u, t) {
  return {
    comentar: puedeVer(u, t) && t.estado !== 'cerrado',
    asignar: u.rol === 'admin',
    tomar: u.rol === 'tecnico' && t.tecnico_id === null && t.estado !== 'cerrado',
    estados: transicionesPermitidas(u, t),
  };
}

function obtenerTicket(id) {
  return db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(id);
}

/** Carga el ticket de la URL y verifica que el usuario lo pueda ver. */
function cargarTicket(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const t = obtenerTicket(id);
  if (!t) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (!puedeVer(req.session.usuario, t)) {
    return res.status(403).json({ error: 'No tiene acceso a este ticket' });
  }
  req.ticket = t;
  next();
}

function registrarSistema(ticketId, usuarioId, texto) {
  db.prepare(
    `INSERT INTO comentarios (ticket_id, usuario_id, texto, tipo, creado_en)
     VALUES (?, ?, ?, 'sistema', ?)`
  ).run(ticketId, usuarioId, texto, ahora());
}

/* ---------------------------------- Rutas ---------------------------------- */

// GET /api/tickets — listado con filtros (estado, prioridad, categoria, tecnico_id, q)
router.get('/', (req, res) => {
  const u = req.session.usuario;
  const where = [];
  const params = [];

  // Restricción por rol
  if (u.rol === 'solicitante') {
    where.push('t.solicitante_id = ?');
    params.push(u.id);
  } else if (u.rol === 'tecnico') {
    where.push('(t.tecnico_id = ? OR t.tecnico_id IS NULL OR t.solicitante_id = ?)');
    params.push(u.id, u.id);
  }

  const { estado, prioridad, categoria, tecnico_id, q } = req.query;
  if (estado && ESTADOS.includes(estado)) {
    where.push('t.estado = ?');
    params.push(estado);
  } else if (estado === 'activos') {
    where.push("t.estado IN ('abierto','en_proceso')");
  }
  if (prioridad && PRIORIDADES.includes(prioridad)) {
    where.push('t.prioridad = ?');
    params.push(prioridad);
  }
  if (categoria && CATEGORIAS.includes(categoria)) {
    where.push('t.categoria = ?');
    params.push(categoria);
  }
  if (tecnico_id === 'sin') {
    where.push('t.tecnico_id IS NULL');
  } else if (tecnico_id && Number.isInteger(Number(tecnico_id))) {
    where.push('t.tecnico_id = ?');
    params.push(Number(tecnico_id));
  }
  if (q && String(q).trim()) {
    where.push('(t.titulo LIKE ? OR t.descripcion LIKE ? OR CAST(t.id AS TEXT) = ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, String(q).trim().replace('#', ''));
  }

  const sql = `${SELECT_TICKET}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE t.estado WHEN 'abierto' THEN 0 WHEN 'en_proceso' THEN 1 WHEN 'resuelto' THEN 2 ELSE 3 END,
      CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
      t.creado_en DESC
    LIMIT 500`;

  res.json({ tickets: db.prepare(sql).all(...params) });
});

// POST /api/tickets — crear ticket
router.post('/', (req, res) => {
  const u = req.session.usuario;
  const titulo = String(req.body?.titulo || '').trim();
  const descripcion = String(req.body?.descripcion || '').trim();
  const { categoria, prioridad } = req.body || {};

  const errores = [];
  if (titulo.length < 5) errores.push('El título debe tener al menos 5 caracteres');
  if (titulo.length > 120) errores.push('El título no puede superar 120 caracteres');
  if (descripcion.length < 10) errores.push('La descripción debe tener al menos 10 caracteres');
  if (!CATEGORIAS.includes(categoria)) errores.push('Categoría inválida');
  if (!PRIORIDADES.includes(prioridad)) errores.push('Prioridad inválida');
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });

  const id = transaccion(() => {
    const f = ahora();
    const r = db
      .prepare(
        `INSERT INTO tickets (titulo, descripcion, categoria, prioridad, estado, solicitante_id, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 'abierto', ?, ?, ?)`
      )
      .run(titulo, descripcion, categoria, prioridad, u.id, f, f);
    const nuevoId = Number(r.lastInsertRowid);
    registrarSistema(nuevoId, u.id, 'Ticket creado');
    return nuevoId;
  });

  res.status(201).json({ ticket: obtenerTicket(id) });
});

// GET /api/tickets/:id — detalle + historial + acciones permitidas
router.get('/:id', cargarTicket, (req, res) => {
  const comentarios = db
    .prepare(
      `SELECT c.*, u.nombre AS usuario_nombre, u.rol AS usuario_rol
       FROM comentarios c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.ticket_id = ?
       ORDER BY c.creado_en ASC, c.id ASC`
    )
    .all(req.ticket.id);

  res.json({
    ticket: req.ticket,
    comentarios,
    permisos: permisos(req.session.usuario, req.ticket),
  });
});

// POST /api/tickets/:id/comentarios — agregar comentario de seguimiento
router.post('/:id/comentarios', cargarTicket, (req, res) => {
  const u = req.session.usuario;
  const texto = String(req.body?.texto || '').trim();
  if (!permisos(u, req.ticket).comentar) {
    return res.status(403).json({ error: 'No puede comentar en este ticket' });
  }
  if (!texto) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  if (texto.length > 2000) return res.status(400).json({ error: 'Máximo 2000 caracteres' });

  transaccion(() => {
    const f = ahora();
    db.prepare(
      `INSERT INTO comentarios (ticket_id, usuario_id, texto, tipo, creado_en)
       VALUES (?, ?, ?, 'comentario', ?)`
    ).run(req.ticket.id, u.id, texto, f);
    db.prepare('UPDATE tickets SET actualizado_en = ? WHERE id = ?').run(f, req.ticket.id);
  });

  res.status(201).json({ ok: true });
});

// PATCH /api/tickets/:id/estado — cambiar estado  { estado }
router.patch('/:id/estado', cargarTicket, (req, res) => {
  const u = req.session.usuario;
  const t = req.ticket;
  const nuevo = req.body?.estado;

  if (!ESTADOS.includes(nuevo)) return res.status(400).json({ error: 'Estado inválido' });
  if (!transicionesPermitidas(u, t).includes(nuevo)) {
    return res.status(403).json({ error: `No puede cambiar de "${ETIQUETA_ESTADO[t.estado]}" a "${ETIQUETA_ESTADO[nuevo]}"` });
  }
  if (nuevo === 'en_proceso' && !t.tecnico_id) {
    return res.status(400).json({ error: 'Asigne un técnico antes de pasar el ticket a "En proceso"' });
  }

  transaccion(() => {
    const f = ahora();
    let resueltoEn = t.resuelto_en;
    if (nuevo === 'resuelto') resueltoEn = f;
    else if (nuevo === 'cerrado') resueltoEn = t.resuelto_en || f;
    else resueltoEn = null; // reabierto o de vuelta en proceso

    db.prepare('UPDATE tickets SET estado = ?, resuelto_en = ?, actualizado_en = ? WHERE id = ?')
      .run(nuevo, resueltoEn, f, t.id);

    const nota = String(req.body?.nota || '').trim();
    registrarSistema(
      t.id,
      u.id,
      `Estado cambiado de "${ETIQUETA_ESTADO[t.estado]}" a "${ETIQUETA_ESTADO[nuevo]}"` + (nota ? ` — ${nota}` : '')
    );
  });

  res.json({ ticket: obtenerTicket(t.id) });
});

// PATCH /api/tickets/:id/asignar — asignar técnico  { tecnico_id | null }
// admin: asigna o desasigna a cualquier técnico activo
// tecnico: solo puede tomar un ticket sin asignar (tecnico_id = él mismo)
router.patch('/:id/asignar', cargarTicket, (req, res) => {
  const u = req.session.usuario;
  const t = req.ticket;
  const raw = req.body?.tecnico_id;
  const tecnicoId = raw === null || raw === '' || raw === undefined ? null : Number(raw);

  if (t.estado === 'cerrado') return res.status(400).json({ error: 'El ticket está cerrado' });

  if (u.rol === 'tecnico') {
    if (tecnicoId !== u.id || t.tecnico_id !== null) {
      return res.status(403).json({ error: 'Solo puede tomar tickets sin asignar' });
    }
  } else if (u.rol !== 'admin') {
    return res.status(403).json({ error: 'No tiene permisos para asignar' });
  }

  let tecnico = null;
  if (tecnicoId !== null) {
    tecnico = db
      .prepare("SELECT id, nombre FROM usuarios WHERE id = ? AND rol = 'tecnico' AND activo = 1")
      .get(tecnicoId);
    if (!tecnico) return res.status(400).json({ error: 'Técnico no válido o inactivo' });
  }
  if (tecnicoId === t.tecnico_id) return res.json({ ticket: t });

  transaccion(() => {
    const f = ahora();
    // Si se quita el técnico de un ticket en proceso, vuelve a "abierto"
    const estado = tecnicoId === null && t.estado === 'en_proceso' ? 'abierto' : t.estado;
    db.prepare('UPDATE tickets SET tecnico_id = ?, estado = ?, actualizado_en = ? WHERE id = ?')
      .run(tecnicoId, estado, f, t.id);

    let texto;
    if (u.rol === 'tecnico') texto = `${u.nombre} tomó el ticket`;
    else if (tecnico) texto = t.tecnico_nombre
      ? `Reasignado de ${t.tecnico_nombre} a ${tecnico.nombre}`
      : `Asignado a ${tecnico.nombre}`;
    else texto = `Se quitó la asignación a ${t.tecnico_nombre}`;
    registrarSistema(t.id, u.id, texto);
  });

  res.json({ ticket: obtenerTicket(t.id) });
});

module.exports = router;
