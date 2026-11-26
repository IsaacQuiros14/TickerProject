/**
 * app.js — Construye la aplicación Express (sin iniciar el servidor).
 *
 * Arquitectura: cliente-servidor en una sola aplicación.
 *  - Express expone una API REST bajo /api
 *  - La misma app sirve el frontend estático (HTML/CSS/JS) desde /public
 *  - Los datos se guardan en SQLite (data/ticker.db)
 *
 * Se separa de server.js para que las pruebas automáticas puedan levantar
 * la app en un puerto aleatorio con una base de datos en memoria.
 */
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const { SQLiteStore } = require('./middleware/sesiones');
const { cabeceras, PRODUCCION } = require('./middleware/seguridad');
const config = require('./config');

const app = express();

app.disable('x-powered-by');
// Detrás del proxy de Render (HTTPS): necesario para cookies "secure" e IP real del cliente
if (PRODUCCION) app.set('trust proxy', 1);

app.use(cabeceras);
app.use(express.json({ limit: '100kb' }));
app.use(
  session({
    name: 'ticker.sid',
    secret: config.sessionSecret || crypto.randomBytes(32).toString('hex'),
    store: new SQLiteStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: PRODUCCION, // solo por HTTPS en producción
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  })
);

// Estado del servicio (usado por Render como health check y por el login para el modo demo)
app.get('/api/health', (req, res) => res.json({ ok: true, demo: config.demo, version: config.version }));

// API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/metricas', require('./routes/metricas'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Frontend (SPA con rutas por hash)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PRODUCCION ? '1h' : 0 }));

// Manejo centralizado de errores: se registra el detalle y se responde un mensaje genérico
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande' });
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
