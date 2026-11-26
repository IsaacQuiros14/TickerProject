/**
 * config.js — Configuración leída de variables de entorno.
 *
 *  PORT            Puerto HTTP (por defecto 3000)
 *  NODE_ENV        'production' activa cookies seguras, HSTS y trust proxy
 *  SESSION_SECRET  Clave para firmar la cookie de sesión
 *  DB_PATH         Ruta del archivo SQLite (por defecto data/ticker.db)
 *  DEMO_MODE       'true' protege las cuentas de demostración (despliegue público)
 */
const { version } = require('./package.json');

const config = {
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET || null,
  demo: process.env.DEMO_MODE === 'true',
  version,
};

if (process.env.NODE_ENV === 'production' && !config.sessionSecret) {
  console.warn('[config] SESSION_SECRET no definido: se usará una clave temporal y las sesiones se cerrarán al reiniciar.');
}

module.exports = config;
