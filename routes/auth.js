/**
 * routes/auth.js — Inicio y cierre de sesión.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { limiteIntentos } = require('../middleware/seguridad');
const { requiereLogin } = require('../middleware/auth');

const router = express.Router();

// Máximo 10 intentos de login por IP cada 15 minutos (los exitosos reinician el contador)
const limiteLogin = limiteIntentos({ max: 10, ventanaMs: 15 * 60 * 1000 });

// Hash ficticio para comparar cuando el correo no existe: así la respuesta tarda
// lo mismo y no revela qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('contraseña-inexistente', 10);

// POST /api/auth/login  { email, password }
router.post('/login', limiteLogin, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
  }

  const correo = String(email).trim().toLowerCase();
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(correo);
  const valida = bcrypt.compareSync(String(password), u ? u.password_hash : HASH_FICTICIO);

  // Mismo mensaje para usuario inexistente o contraseña incorrecta
  if (!u || !valida) {
    console.warn(`[auth] login fallido email=${correo} ip=${req.ip}`);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  if (!u.activo) {
    return res.status(403).json({ error: 'El usuario está desactivado' });
  }

  limiteLogin.reiniciar(req.ip);
  // Se regenera la sesión para evitar fijación de sesión
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión' });
    req.session.usuario = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
    console.log(`[auth] login usuario=${u.id} rol=${u.rol}`);
    res.json({ usuario: req.session.usuario });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ticker.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me — usuario de la sesión actual (revalidado contra la base)
router.get('/me', requiereLogin, (req, res) => res.json({ usuario: req.session.usuario }));

module.exports = router;
