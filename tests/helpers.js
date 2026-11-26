/**
 * tests/helpers.js — Levanta la app con una base SQLite en memoria y datos de
 * demostración, y ofrece un cliente HTTP mínimo que conserva la cookie de sesión.
 *
 * Node ejecuta cada archivo de prueba en su propio proceso, así que cada archivo
 * obtiene una base de datos limpia.
 */
process.env.DB_PATH = ':memory:';

const app = require('../app');
const { sembrar } = require('../seed');

sembrar();

/** Inicia el servidor en un puerto libre. Devuelve { url, cerrar }. */
function iniciar() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({ url, cerrar: () => new Promise((r) => server.close(r)) });
    });
  });
}

/** Cliente HTTP con cookie de sesión. */
class Cliente {
  constructor(url) {
    this.url = url;
    this.cookie = '';
  }

  async pedir(metodo, ruta, cuerpo) {
    const res = await fetch(this.url + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    let datos = null;
    try { datos = await res.json(); } catch { /* sin cuerpo JSON */ }
    return { status: res.status, datos, headers: res.headers };
  }

  get(ruta) { return this.pedir('GET', ruta); }
  post(ruta, cuerpo = {}) { return this.pedir('POST', ruta, cuerpo); }
  patch(ruta, cuerpo = {}) { return this.pedir('PATCH', ruta, cuerpo); }

  async login(email, password) {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login falló para ${email}: ${r.status}`);
    return this;
  }
}

// Credenciales de los datos de demostración
const CUENTAS = {
  admin: ['admin@ticker.cr', 'admin123'],
  carlos: ['carlos@ticker.cr', 'tecnico123'],
  ana: ['ana@ticker.cr', 'tecnico123'],
  maria: ['maria@empresa.com', 'usuario123'],
  pedro: ['pedro@empresa.com', 'usuario123'],
};

/** Crea clientes con sesión iniciada para las cuentas pedidas. */
async function sesiones(url, nombres) {
  const r = {};
  for (const n of nombres) r[n] = await new Cliente(url).login(...CUENTAS[n]);
  return r;
}

module.exports = { iniciar, Cliente, sesiones, CUENTAS };
