/**
 * routes/usuarios.js — Gestión de usuarios (solo administrador)
 * y listado de técnicos (técnico y administrador).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, ahora, ROLES } = require('../db');
const { requiereRol } = require('../middleware/auth');
const config = require('../config');
const { CORREOS_DEMO } = require('../seed');

const router = express.Router();

const CAMPOS = 'id, nombre, email, rol, activo, creado_en';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/usuarios/tecnicos — técnicos activos (para asignar y filtrar)
router.get('/tecnicos', requiereRol('tecnico', 'admin'), (req, res) => {
  const tecnicos = db
    .prepare("SELECT id, nombre FROM usuarios WHERE rol = 'tecnico' AND activo = 1 ORDER BY nombre")
    .all();
  res.json({ tecnicos });
});

// A partir de aquí, solo administrador
router.use(requiereRol('admin'));

// GET /api/usuarios
router.get('/', (req, res) => {
  const usuarios = db
    .prepare(
      `SELECT ${CAMPOS},
        (SELECT COUNT(*) FROM tickets WHERE solicitante_id = u.id) AS tickets_creados,
        (SELECT COUNT(*) FROM tickets WHERE tecnico_id = u.id)     AS tickets_asignados
       FROM usuarios u ORDER BY rol, nombre`
    )
    .all();
  res.json({ usuarios });
});

// POST /api/usuarios  { nombre, email, password, rol }
router.post('/', (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const rol = req.body?.rol;

  const errores = [];
  if (nombre.length < 3) errores.push('Nombre de al menos 3 caracteres');
  if (!EMAIL_RE.test(email)) errores.push('Correo inválido');
  if (password.length < 6) errores.push('Contraseña de al menos 6 caracteres');
  if (!ROLES.includes(rol)) errores.push('Rol inválido');
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });

  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
  }

  const r = db
    .prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)')
    .run(nombre, email, bcrypt.hashSync(password, 10), rol, ahora());

  console.log(`[admin] usuario=${req.session.usuario.id} creó usuario=${r.lastInsertRowid} rol=${rol}`);
  res.status(201).json({ usuario: db.prepare(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`).get(r.lastInsertRowid) });
});

// PATCH /api/usuarios/:id  { nombre?, rol?, activo?, password? }
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const yo = req.session.usuario;
  const { nombre, rol, activo, password } = req.body || {};

  // En la demo pública las cuentas de demostración no se pueden bloquear ni cambiar
  if (config.demo && CORREOS_DEMO.includes(u.email)) {
    return res.status(403).json({ error: 'Cuenta de demostración protegida: cree un usuario nuevo para probar esta acción' });
  }

  // Un administrador no puede quitarse su propio rol ni desactivarse
  if (id === yo.id && ((rol && rol !== 'admin') || activo === false || activo === 0)) {
    return res.status(400).json({ error: 'No puede quitarse el rol de administrador ni desactivarse a sí mismo' });
  }

  const cambios = [];
  const params = [];
  if (nombre !== undefined) {
    if (String(nombre).trim().length < 3) return res.status(400).json({ error: 'Nombre de al menos 3 caracteres' });
    cambios.push('nombre = ?');
    params.push(String(nombre).trim());
  }
  if (rol !== undefined) {
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    cambios.push('rol = ?');
    params.push(rol);
  }
  if (activo !== undefined) {
    cambios.push('activo = ?');
    params.push(activo ? 1 : 0);
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < 6) return res.status(400).json({ error: 'Contraseña de al menos 6 caracteres' });
    cambios.push('password_hash = ?');
    params.push(bcrypt.hashSync(String(password), 10));
  }
  if (!cambios.length) return res.status(400).json({ error: 'No hay cambios' });

  db.prepare(`UPDATE usuarios SET ${cambios.join(', ')} WHERE id = ?`).run(...params, id);
  console.log(`[admin] usuario=${yo.id} modificó usuario=${id} campos=${Object.keys(req.body).join(',')}`);

  // Si un técnico deja de serlo o se desactiva, sus tickets activos vuelven a quedar sin asignar
  const actualizado = db.prepare(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`).get(id);
  if (u.rol === 'tecnico' && (actualizado.rol !== 'tecnico' || !actualizado.activo)) {
    const f = ahora();
    const afectados = db
      .prepare("SELECT id FROM tickets WHERE tecnico_id = ? AND estado IN ('abierto','en_proceso')")
      .all(id);
    for (const t of afectados) {
      db.prepare(
        `UPDATE tickets SET tecnico_id = NULL,
           estado = CASE WHEN estado = 'en_proceso' THEN 'abierto' ELSE estado END,
           actualizado_en = ? WHERE id = ?`
      ).run(f, t.id);
      db.prepare(
        "INSERT INTO comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, ?, ?, 'sistema', ?)"
      ).run(t.id, yo.id, `Se quitó la asignación a ${u.nombre} (técnico desactivado o cambiado de rol)`, f);
    }
  }

  res.json({ usuario: actualizado });
});

module.exports = router;
