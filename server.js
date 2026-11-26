/**
 * server.js — Punto de entrada: prepara la base de datos e inicia el servidor HTTP.
 */
const app = require('./app');
const config = require('./config');
const { DB_PATH } = require('./db');
const { sembrarSiVacio } = require('./seed');

if (sembrarSiVacio()) {
  console.log('Base de datos vacía: se cargaron los datos de demostración.');
}

const server = app.listen(config.port, () => {
  console.log(`Ticker v${config.version} corriendo en http://localhost:${config.port}`);
  console.log(`Base de datos: ${DB_PATH}${config.demo ? ' · modo demo activo' : ''}`);
});

// Cierre ordenado (Render envía SIGTERM al detener o redeplegar el servicio)
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => server.close(() => process.exit(0)));
}
