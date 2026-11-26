/**
 * middleware/sesiones.js — Almacén de sesiones de express-session sobre SQLite.
 *
 * El almacén en memoria que trae express-session por defecto no elimina las
 * sesiones vencidas y se pierde al reiniciar. Este guarda cada sesión en la
 * tabla `sesiones` y borra periódicamente las expiradas.
 */
const session = require('express-session');
const { db } = require('../db');

const UNA_HORA = 60 * 60 * 1000;

class SQLiteStore extends session.Store {
  constructor({ ttlPorDefecto = 8 * UNA_HORA } = {}) {
    super();
    this.ttl = ttlPorDefecto;
    this.sql = {
      get: db.prepare('SELECT datos FROM sesiones WHERE sid = ? AND expira > ?'),
      set: db.prepare(
        `INSERT INTO sesiones (sid, datos, expira) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET datos = excluded.datos, expira = excluded.expira`
      ),
      destroy: db.prepare('DELETE FROM sesiones WHERE sid = ?'),
      touch: db.prepare('UPDATE sesiones SET expira = ? WHERE sid = ?'),
      limpiar: db.prepare('DELETE FROM sesiones WHERE expira <= ?'),
    };
    // Limpieza de sesiones vencidas; unref() para no impedir que el proceso termine
    this.timer = setInterval(() => this.sql.limpiar.run(Date.now()), UNA_HORA);
    this.timer.unref();
  }

  expiracion(sess) {
    const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(exp) ? exp : Date.now() + this.ttl;
  }

  get(sid, cb) {
    try {
      const fila = this.sql.get.get(sid, Date.now());
      cb(null, fila ? JSON.parse(fila.datos) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.sql.set.run(sid, JSON.stringify(sess), this.expiracion(sess));
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.sql.destroy.run(sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.sql.touch.run(this.expiracion(sess), sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }
}

module.exports = { SQLiteStore };
