/**
 * Pruebas de integración del módulo de tickets: creación, permisos por rol,
 * asignación, ciclo de estados, historial y filtros.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, Cliente, sesiones } = require('./helpers');

let srv, u;

before(async () => {
  srv = await iniciar();
  u = await sesiones(srv.url, ['admin', 'carlos', 'ana', 'maria', 'pedro']);
});
after(() => srv.cerrar());

describe('Autenticación', () => {
  it('rechaza la API sin sesión', async () => {
    const r = await new Cliente(srv.url).get('/api/tickets');
    assert.equal(r.status, 401);
  });

  it('rechaza credenciales incorrectas con un mensaje genérico', async () => {
    const r = await new Cliente(srv.url).post('/api/auth/login', { email: 'admin@ticker.cr', password: 'x' });
    assert.equal(r.status, 401);
    const r2 = await new Cliente(srv.url).post('/api/auth/login', { email: 'noexiste@x.com', password: 'x' });
    assert.equal(r2.datos.error, r.datos.error);
  });

  it('devuelve el usuario de la sesión y no expone el hash', async () => {
    const r = await u.maria.get('/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.datos.usuario.rol, 'solicitante');
    assert.equal(r.datos.usuario.password_hash, undefined);
  });
});

describe('Creación y validación de tickets', () => {
  it('crea un ticket abierto a nombre del solicitante', async () => {
    const r = await u.maria.post('/api/tickets', {
      titulo: 'No hay red en mi puesto', descripcion: 'Desde hoy no tengo conexión a internet', categoria: 'red', prioridad: 'alta',
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.ticket.estado, 'abierto');
    assert.equal(r.datos.ticket.tecnico_id, null);
    assert.equal(r.datos.ticket.solicitante_nombre, 'María Jiménez');
  });

  for (const [caso, cuerpo] of [
    ['título corto', { titulo: 'ab', descripcion: 'descripción válida', categoria: 'red', prioridad: 'alta' }],
    ['descripción corta', { titulo: 'Título válido', descripcion: 'corta', categoria: 'red', prioridad: 'alta' }],
    ['categoría inválida', { titulo: 'Título válido', descripcion: 'descripción válida', categoria: 'x', prioridad: 'alta' }],
    ['prioridad inválida', { titulo: 'Título válido', descripcion: 'descripción válida', categoria: 'red', prioridad: 'x' }],
  ]) {
    it(`rechaza ${caso} con 400`, async () => {
      const r = await u.maria.post('/api/tickets', cuerpo);
      assert.equal(r.status, 400);
    });
  }
});

describe('Visibilidad por rol', () => {
  it('el solicitante solo ve sus propios tickets', async () => {
    const { datos } = await u.maria.get('/api/tickets');
    assert.ok(datos.tickets.length > 0);
    assert.ok(datos.tickets.every((t) => t.solicitante_nombre === 'María Jiménez'));
  });

  it('el solicitante no puede abrir un ticket ajeno (403)', async () => {
    const { datos } = await u.pedro.get('/api/tickets');
    const r = await u.maria.get(`/api/tickets/${datos.tickets[0].id}`);
    assert.equal(r.status, 403);
  });

  it('el técnico ve los suyos y los sin asignar, no los de otro técnico', async () => {
    const { datos } = await u.carlos.get('/api/tickets');
    const yo = (await u.carlos.get('/api/auth/me')).datos.usuario.id;
    assert.ok(datos.tickets.every((t) => t.tecnico_id === yo || t.tecnico_id === null));
  });

  it('el administrador ve todos los tickets', async () => {
    const admin = (await u.admin.get('/api/tickets')).datos.tickets.length;
    const maria = (await u.maria.get('/api/tickets')).datos.tickets.length;
    assert.ok(admin > maria);
  });

  it('un ID inexistente devuelve 404', async () => {
    assert.equal((await u.admin.get('/api/tickets/99999')).status, 404);
  });
});

describe('Ciclo de vida completo de un ticket', () => {
  let id, carlosId, anaId;

  before(async () => {
    const r = await u.maria.post('/api/tickets', {
      titulo: 'Impresora sin tóner', descripcion: 'La impresora de recepción no imprime', categoria: 'hardware', prioridad: 'media',
    });
    id = r.datos.ticket.id;
    carlosId = (await u.carlos.get('/api/auth/me')).datos.usuario.id;
    anaId = (await u.ana.get('/api/auth/me')).datos.usuario.id;
  });

  it('no permite pasar a "en proceso" sin técnico', async () => {
    assert.equal((await u.admin.patch(`/api/tickets/${id}/estado`, { estado: 'en_proceso' })).status, 400);
  });

  it('el solicitante no puede asignar ni resolver', async () => {
    assert.equal((await u.maria.patch(`/api/tickets/${id}/asignar`, { tecnico_id: carlosId })).status, 403);
    assert.equal((await u.maria.patch(`/api/tickets/${id}/estado`, { estado: 'resuelto' })).status, 403);
  });

  it('un técnico no puede asignar el ticket a otro técnico', async () => {
    assert.equal((await u.carlos.patch(`/api/tickets/${id}/asignar`, { tecnico_id: anaId })).status, 403);
  });

  it('el técnico toma el ticket y deja de ser visible para otros técnicos', async () => {
    const r = await u.carlos.patch(`/api/tickets/${id}/asignar`, { tecnico_id: carlosId });
    assert.equal(r.status, 200);
    assert.equal(r.datos.ticket.tecnico_id, carlosId);
    assert.equal((await u.ana.get(`/api/tickets/${id}`)).status, 403);
  });

  it('el técnico no puede saltar de "abierto" a "resuelto"', async () => {
    assert.equal((await u.carlos.patch(`/api/tickets/${id}/estado`, { estado: 'resuelto' })).status, 403);
  });

  it('el técnico inicia, comenta y resuelve', async () => {
    assert.equal((await u.carlos.patch(`/api/tickets/${id}/estado`, { estado: 'en_proceso' })).status, 200);
    assert.equal((await u.carlos.post(`/api/tickets/${id}/comentarios`, { texto: 'Se cambió el cartucho' })).status, 201);
    assert.equal((await u.carlos.post(`/api/tickets/${id}/comentarios`, { texto: '   ' })).status, 400);
    const r = await u.carlos.patch(`/api/tickets/${id}/estado`, { estado: 'resuelto', nota: 'Cartucho nuevo' });
    assert.equal(r.status, 200);
    assert.ok(r.datos.ticket.resuelto_en);
  });

  it('el técnico no puede cerrar; el solicitante sí', async () => {
    assert.equal((await u.carlos.patch(`/api/tickets/${id}/estado`, { estado: 'cerrado' })).status, 403);
    assert.equal((await u.maria.patch(`/api/tickets/${id}/estado`, { estado: 'cerrado' })).status, 200);
  });

  it('un ticket cerrado no admite comentarios', async () => {
    assert.equal((await u.maria.post(`/api/tickets/${id}/comentarios`, { texto: 'hola' })).status, 403);
  });

  it('el administrador reabre y reasigna; reabrir limpia la fecha de resolución', async () => {
    const r = await u.admin.patch(`/api/tickets/${id}/estado`, { estado: 'abierto' });
    assert.equal(r.status, 200);
    assert.equal(r.datos.ticket.resuelto_en, null);
    assert.equal((await u.admin.patch(`/api/tickets/${id}/asignar`, { tecnico_id: anaId })).status, 200);
  });

  it('no se puede asignar a un usuario que no es técnico', async () => {
    const mariaId = (await u.maria.get('/api/auth/me')).datos.usuario.id;
    assert.equal((await u.admin.patch(`/api/tickets/${id}/asignar`, { tecnico_id: mariaId })).status, 400);
  });

  it('el historial registra cada paso en orden', async () => {
    const { datos } = await u.admin.get(`/api/tickets/${id}`);
    const textos = datos.comentarios.map((c) => c.texto);
    assert.deepEqual(textos, [
      'Ticket creado',
      'Carlos Rojas tomó el ticket',
      'Estado cambiado de "Abierto" a "En proceso"',
      'Se cambió el cartucho',
      'Estado cambiado de "En proceso" a "Resuelto" — Cartucho nuevo',
      'Estado cambiado de "Resuelto" a "Cerrado"',
      'Estado cambiado de "Cerrado" a "Abierto"',
      'Reasignado de Carlos Rojas a Ana Vargas',
    ]);
  });
});

describe('Filtros del listado', () => {
  const lista = async (qs) => (await u.admin.get(`/api/tickets?${qs}`)).datos.tickets;

  it('filtra por estado', async () => {
    const t = await lista('estado=cerrado');
    assert.ok(t.length > 0 && t.every((x) => x.estado === 'cerrado'));
  });

  it('filtra activos (abierto + en proceso)', async () => {
    const t = await lista('estado=activos');
    assert.ok(t.every((x) => ['abierto', 'en_proceso'].includes(x.estado)));
  });

  it('filtra sin asignar', async () => {
    const t = await lista('tecnico_id=sin');
    assert.ok(t.length > 0 && t.every((x) => x.tecnico_id === null));
  });

  it('combina prioridad y categoría', async () => {
    const t = await lista('prioridad=alta&categoria=red');
    assert.ok(t.length > 0 && t.every((x) => x.prioridad === 'alta' && x.categoria === 'red'));
  });

  it('la búsqueda trata la entrada como texto (sin inyección SQL)', async () => {
    const t = await lista(`q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(t.length, 0);
  });
});
