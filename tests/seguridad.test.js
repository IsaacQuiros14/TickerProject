/**
 * Pruebas de las medidas de seguridad: cabeceras HTTP, errores controlados,
 * límite de intentos de login y protección de cuentas en modo demo.
 */
process.env.DEMO_MODE = 'true';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, Cliente, sesiones } = require('./helpers');

let srv, u;

before(async () => {
  srv = await iniciar();
  u = await sesiones(srv.url, ['admin']);
});
after(() => srv.cerrar());

describe('Cabeceras y errores', () => {
  it('envía cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await fetch(srv.url + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('las respuestas de la API no se guardan en caché', async () => {
    const r = await u.admin.get('/api/tickets');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  it('la cookie de sesión es HttpOnly y SameSite', async () => {
    const res = await fetch(srv.url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ticker.cr', password: 'admin123' }),
    });
    const c = res.headers.get('set-cookie');
    assert.match(c, /HttpOnly/i);
    assert.match(c, /SameSite=Lax/i);
  });

  it('responde 400 a JSON mal formado y 404 a rutas de API desconocidas', async () => {
    const res = await fetch(srv.url + '/api/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.admin.cookie }, body: '{mal',
    });
    assert.equal(res.status, 400);
    assert.equal((await u.admin.get('/api/no-existe')).status, 404);
  });

  it('el health check informa el modo demo', async () => {
    const r = await new Cliente(srv.url).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.datos.ok, true);
    assert.equal(r.datos.demo, true);
  });
});

describe('Modo demo', () => {
  it('las cuentas de demostración no se pueden modificar', async () => {
    const { datos } = await u.admin.get('/api/usuarios');
    const carlos = datos.usuarios.find((x) => x.email === 'carlos@ticker.cr');
    assert.equal((await u.admin.patch(`/api/usuarios/${carlos.id}`, { password: 'hackeado' })).status, 403);
    assert.equal((await u.admin.patch(`/api/usuarios/${carlos.id}`, { activo: false })).status, 403);
  });

  it('los usuarios nuevos sí se pueden administrar', async () => {
    const r = await u.admin.post('/api/usuarios', { nombre: 'Prueba Demo', email: 'demo@x.com', password: '123456', rol: 'solicitante' });
    assert.equal((await u.admin.patch(`/api/usuarios/${r.datos.usuario.id}`, { activo: false })).status, 200);
  });
});

describe('Límite de intentos de login', () => {
  it('bloquea con 429 después de 10 intentos fallidos', async () => {
    const c = new Cliente(srv.url);
    const estados = [];
    for (let i = 0; i < 11; i++) {
      estados.push((await c.post('/api/auth/login', { email: 'admin@ticker.cr', password: 'incorrecta' })).status);
    }
    assert.deepEqual(estados.slice(0, 10), Array(10).fill(401));
    assert.equal(estados[10], 429);
  });
});
