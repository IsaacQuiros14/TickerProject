/**
 * Pruebas de gestión de usuarios (administrador) y del dashboard de métricas.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, Cliente, sesiones } = require('./helpers');

let srv, u;

before(async () => {
  srv = await iniciar();
  u = await sesiones(srv.url, ['admin', 'carlos', 'ana', 'maria']);
});
after(() => srv.cerrar());

describe('Gestión de usuarios', () => {
  it('solo el administrador accede', async () => {
    assert.equal((await u.maria.get('/api/usuarios')).status, 403);
    assert.equal((await u.carlos.get('/api/usuarios')).status, 403);
    assert.equal((await u.admin.get('/api/usuarios')).status, 200);
  });

  it('la lista de usuarios no expone hashes de contraseña', async () => {
    const { datos } = await u.admin.get('/api/usuarios');
    assert.ok(datos.usuarios.every((x) => !('password_hash' in x)));
  });

  it('crea un usuario y rechaza correos duplicados', async () => {
    const nuevo = { nombre: 'Técnico Nuevo', email: 'nuevo@ticker.cr', password: '123456', rol: 'tecnico' };
    assert.equal((await u.admin.post('/api/usuarios', nuevo)).status, 201);
    assert.equal((await u.admin.post('/api/usuarios', nuevo)).status, 409);
    await new Cliente(srv.url).login('nuevo@ticker.cr', '123456');
  });

  it('valida los datos del usuario nuevo', async () => {
    const r = await u.admin.post('/api/usuarios', { nombre: 'X', email: 'malo', password: '1', rol: 'jefe' });
    assert.equal(r.status, 400);
  });

  it('el administrador no puede desactivarse a sí mismo', async () => {
    const yo = (await u.admin.get('/api/auth/me')).datos.usuario.id;
    assert.equal((await u.admin.patch(`/api/usuarios/${yo}`, { activo: false })).status, 400);
  });

  it('desactivar a un técnico cierra su sesión y libera sus tickets activos', async () => {
    const anaId = (await u.ana.get('/api/auth/me')).datos.usuario.id;
    assert.equal((await u.admin.patch(`/api/usuarios/${anaId}`, { activo: false })).status, 200);

    // La sesión abierta de Ana deja de ser válida de inmediato
    assert.equal((await u.ana.get('/api/tickets')).status, 401);
    // Y ya no puede iniciar sesión
    const r = await new Cliente(srv.url).post('/api/auth/login', { email: 'ana@ticker.cr', password: 'tecnico123' });
    assert.equal(r.status, 403);
    // Sus tickets activos quedan sin asignar
    const { datos } = await u.admin.get(`/api/tickets?tecnico_id=${anaId}&estado=activos`);
    assert.equal(datos.tickets.length, 0);
  });

  it('un cambio de rol aplica en la sesión abierta', async () => {
    const carlosId = (await u.carlos.get('/api/auth/me')).datos.usuario.id;
    assert.equal((await u.carlos.get('/api/metricas')).status, 200);
    await u.admin.patch(`/api/usuarios/${carlosId}`, { rol: 'solicitante' });
    assert.equal((await u.carlos.get('/api/metricas')).status, 403);
    await u.admin.patch(`/api/usuarios/${carlosId}`, { rol: 'tecnico' });
  });
});

describe('Dashboard de métricas', () => {
  it('el solicitante no tiene acceso', async () => {
    assert.equal((await u.maria.get('/api/metricas')).status, 403);
  });

  it('el resumen es coherente con el listado', async () => {
    const { datos: m } = await u.admin.get('/api/metricas');
    const { datos: l } = await u.admin.get('/api/tickets');
    const r = m.resumen;
    assert.equal(r.total, l.tickets.length);
    assert.equal(r.abiertos + r.en_proceso + r.resueltos + r.cerrados, r.total);
    assert.equal(r.abiertos, l.tickets.filter((t) => t.estado === 'abierto').length);
    assert.ok(r.horas_promedio > 0);
  });

  it('los conteos por categoría y prioridad suman el total', async () => {
    const { datos: m } = await u.admin.get('/api/metricas');
    const suma = (xs) => xs.reduce((a, x) => a + x.total, 0);
    assert.equal(suma(m.porCategoria), m.resumen.total);
    assert.equal(suma(m.porPrioridad), m.resumen.total);
  });

  it('la tendencia cubre 14 días por defecto', async () => {
    const { datos: m } = await u.admin.get('/api/metricas');
    assert.equal(m.tendencia.length, 14);
  });

  it('filtra por rango de fechas', async () => {
    const { datos: m } = await u.admin.get('/api/metricas?desde=2000-01-01&hasta=2000-01-31');
    assert.equal(m.resumen.total, 0);
    assert.equal(m.resumen.horas_promedio, null);
  });
});
