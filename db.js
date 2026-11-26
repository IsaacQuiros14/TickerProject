/**
 * db.js — Conexión y esquema de la base de datos SQLite.
 *
 * Se usa el módulo nativo `node:sqlite` (incluido en Node.js >= 22.13),
 * por lo que no hace falta compilar dependencias nativas.
 * El archivo de base de datos se guarda en data/ticker.db
 * (configurable con la variable DB_PATH; ':memory:' se usa en las pruebas).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'ticker.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Integridad referencial y mejor concurrencia de lectura
db.exec('PRAGMA foreign_keys = ON;');
if (DB_PATH !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');

// Valores válidos (se reutilizan en validaciones de la API)
const ROLES = ['solicitante', 'tecnico', 'admin'];
const CATEGORIAS = ['hardware', 'software', 'red', 'otro'];
const PRIORIDADES = ['baja', 'media', 'alta'];
const ESTADOS = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    rol           TEXT    NOT NULL CHECK (rol IN ('solicitante','tecnico','admin')),
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo          TEXT    NOT NULL,
    descripcion     TEXT    NOT NULL,
    categoria       TEXT    NOT NULL CHECK (categoria IN ('hardware','software','red','otro')),
    prioridad       TEXT    NOT NULL CHECK (prioridad IN ('baja','media','alta')),
    estado          TEXT    NOT NULL DEFAULT 'abierto'
                            CHECK (estado IN ('abierto','en_proceso','resuelto','cerrado')),
    solicitante_id  INTEGER NOT NULL REFERENCES usuarios(id),
    tecnico_id      INTEGER REFERENCES usuarios(id),
    creado_en       TEXT    NOT NULL,
    actualizado_en  TEXT    NOT NULL,
    resuelto_en     TEXT
  );

  CREATE TABLE IF NOT EXISTS comentarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    texto       TEXT    NOT NULL,
    tipo        TEXT    NOT NULL DEFAULT 'comentario' CHECK (tipo IN ('comentario','sistema')),
    creado_en   TEXT    NOT NULL
  );

  -- Sesiones de login (ver middleware/sesiones.js)
  CREATE TABLE IF NOT EXISTS sesiones (
    sid     TEXT PRIMARY KEY,
    datos   TEXT    NOT NULL,
    expira  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_estado      ON tickets(estado);
  CREATE INDEX IF NOT EXISTS idx_tickets_tecnico     ON tickets(tecnico_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_solicitante ON tickets(solicitante_id);
  CREATE INDEX IF NOT EXISTS idx_comentarios_ticket  ON comentarios(ticket_id);
`);

/** Fecha/hora actual en ISO 8601 (UTC). Todas las fechas se guardan así. */
const ahora = () => new Date().toISOString();

/** Ejecuta `fn` dentro de una transacción; revierte si lanza error. */
function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, ahora, transaccion, ROLES, CATEGORIAS, PRIORIDADES, ESTADOS, DB_PATH };
