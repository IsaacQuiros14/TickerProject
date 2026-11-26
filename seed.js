/**
 * seed.js — Datos de demostración.
 *
 * - Al iniciar el servidor, si la base está vacía, se cargan automáticamente.
 * - `npm run seed` borra todo y vuelve a cargar los datos de demostración.
 */
const bcrypt = require('bcryptjs');
const { db, transaccion } = require('./db');

const USUARIOS = [
  { nombre: 'Laura Méndez',   email: 'admin@ticker.cr',      rol: 'admin',       password: 'admin123' },
  { nombre: 'Carlos Rojas',   email: 'carlos@ticker.cr',     rol: 'tecnico',     password: 'tecnico123' },
  { nombre: 'Ana Vargas',     email: 'ana@ticker.cr',        rol: 'tecnico',     password: 'tecnico123' },
  { nombre: 'José Solís',     email: 'jose@ticker.cr',       rol: 'tecnico',     password: 'tecnico123' },
  { nombre: 'María Jiménez',  email: 'maria@empresa.com',    rol: 'solicitante', password: 'usuario123' },
  { nombre: 'Pedro Castro',   email: 'pedro@empresa.com',    rol: 'solicitante', password: 'usuario123' },
  { nombre: 'Sofía Mora',     email: 'sofia@empresa.com',    rol: 'solicitante', password: 'usuario123' },
];

// [título, descripción, categoría, prioridad, estado final, días atrás, horas hasta resolver, índice técnico (1-3) o null]
const TICKETS = [
  ['No enciende la computadora de recepción', 'La PC de recepción no enciende desde esta mañana. Se escucha un pitido al presionar el botón de encendido.', 'hardware', 'alta', 'cerrado', 18, 3, 1],
  ['Outlook no sincroniza el correo', 'Desde ayer Outlook muestra "Desconectado" y no llegan correos nuevos. En el webmail sí aparecen.', 'software', 'media', 'cerrado', 17, 20, 2],
  ['Sin internet en el segundo piso', 'Ninguna computadora del segundo piso tiene acceso a internet. El Wi-Fi conecta pero sin navegación.', 'red', 'alta', 'cerrado', 16, 2, 3],
  ['Solicitud de instalación de Adobe Reader', 'Necesito Adobe Reader instalado para abrir los contratos en PDF que envían los proveedores.', 'software', 'baja', 'cerrado', 15, 46, 2],
  ['Impresora de contabilidad atasca papel', 'La impresora HP del área de contabilidad atasca el papel en cada impresión doble cara.', 'hardware', 'media', 'cerrado', 14, 26, 1],
  ['Teclado con teclas que no responden', 'Las teclas A, S y D del teclado no responden. Ya probé desconectarlo y conectarlo de nuevo.', 'hardware', 'baja', 'cerrado', 13, 30, 1],
  ['VPN no conecta desde casa', 'Al intentar conectarme a la VPN desde casa aparece el error 809. Necesito acceso para trabajar remoto.', 'red', 'alta', 'resuelto', 11, 5, 3],
  ['Excel se cierra al abrir archivos grandes', 'Excel se cierra solo al abrir el archivo de inventario (35 MB). Con archivos pequeños funciona bien.', 'software', 'media', 'resuelto', 10, 18, 2],
  ['Monitor parpadea constantemente', 'El monitor de mi estación parpadea cada pocos segundos. Ya cambié el cable y sigue igual.', 'hardware', 'media', 'cerrado', 9, 22, 1],
  ['Crear cuenta de correo para nuevo colaborador', 'Ingresa un nuevo colaborador al área de ventas el lunes, se requiere cuenta de correo y acceso al ERP.', 'otro', 'media', 'cerrado', 8, 12, 2],
  ['Wi-Fi lento en sala de reuniones', 'En la sala de reuniones el Wi-Fi es muy lento, las videollamadas se cortan constantemente.', 'red', 'media', 'en_proceso', 6, null, 3],
  ['Error al imprimir facturas desde el ERP', 'Al imprimir facturas desde el sistema ERP aparece "Error de spooler" y no sale nada.', 'software', 'alta', 'en_proceso', 4, null, 2],
  ['Laptop muy lenta al iniciar', 'Mi laptop tarda más de 10 minutos en iniciar y los programas se congelan con frecuencia.', 'hardware', 'media', 'en_proceso', 3, null, 1],
  ['Restablecer contraseña del sistema de planillas', 'Olvidé mi contraseña del sistema de planillas y quedó bloqueado tras varios intentos.', 'software', 'alta', 'resuelto', 2, 1, 2],
  ['Cable de red dañado en puesto 14', 'El cable de red del puesto 14 está pelado y la conexión se cae cada vez que se mueve la silla.', 'red', 'baja', 'abierto', 2, null, 3],
  ['Mouse inalámbrico no funciona', 'El mouse inalámbrico dejó de funcionar, ya le cambié las baterías y no responde.', 'hardware', 'baja', 'abierto', 1, null, null],
  ['No puedo acceder a la carpeta compartida de RR.HH.', 'Al entrar a \\\\servidor\\rrhh aparece "Acceso denegado". La semana pasada sí podía entrar.', 'red', 'media', 'abierto', 1, null, null],
  ['Pantalla azul al conectar el proyector', 'La laptop muestra pantalla azul (error DRIVER_IRQL) cada vez que conecto el proyector por HDMI.', 'hardware', 'alta', 'abierto', 0, null, null],
  ['Actualizar antivirus en equipos de bodega', 'Los tres equipos de bodega muestran que el antivirus está desactualizado desde hace un mes.', 'software', 'media', 'abierto', 0, null, null],
  ['Solicitud de segundo monitor', 'Solicito un segundo monitor para el puesto de diseño, para trabajar con planos y referencias.', 'otro', 'baja', 'abierto', 0, null, null],
];

const COMENTARIOS_TECNICO = [
  'Reviso el caso en sitio durante la mañana.',
  'Se realizó diagnóstico inicial, el problema está identificado.',
  'Se aplicó la corrección y se hicieron pruebas con el usuario.',
];
const COMENTARIOS_SOLICITANTE = [
  '¡Gracias! Ya funciona correctamente.',
  'Confirmo que quedó resuelto.',
];

/** Borra todos los datos (orden respetando llaves foráneas). */
function limpiar() {
  db.exec('DELETE FROM sesiones; DELETE FROM comentarios; DELETE FROM tickets; DELETE FROM usuarios;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('comentarios','tickets','usuarios');");
}

function sembrar() {
  transaccion(() => {
    const insUsuario = db.prepare(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)'
    );
    const creadoUsuarios = new Date(Date.now() - 30 * 864e5).toISOString();
    const ids = USUARIOS.map((u) =>
      Number(insUsuario.run(u.nombre, u.email, bcrypt.hashSync(u.password, 10), u.rol, creadoUsuarios).lastInsertRowid)
    );
    const admin = ids[0];
    const tecnicos = ids.slice(1, 4);
    const solicitantes = ids.slice(4);
    const nombre = (id) => USUARIOS[ids.indexOf(id)].nombre;

    const insTicket = db.prepare(
      `INSERT INTO tickets (titulo, descripcion, categoria, prioridad, estado, solicitante_id, tecnico_id, creado_en, actualizado_en, resuelto_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insComentario = db.prepare(
      'INSERT INTO comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, ?, ?, ?, ?)'
    );

    TICKETS.forEach(([titulo, desc, cat, prio, estado, diasAtras, horasRes, tecIdx], i) => {
      const solicitante = solicitantes[i % solicitantes.length];
      const tecnico = tecIdx ? tecnicos[tecIdx - 1] : null;
      // Hora de creación en horario laboral, con variación por ticket
      const creado = new Date(Date.now() - diasAtras * 864e5);
      creado.setHours(diasAtras === 0 ? Math.max(0, new Date().getHours() - 1 - (i % 3)) : 8 + (i % 8), (i * 17) % 60, 0, 0);
      const t0 = creado.getTime();
      const h = (horas) => new Date(t0 + horas * 36e5).toISOString();

      const resueltoEn = horasRes != null ? h(horasRes) : null;
      const actualizado = estado === 'cerrado' ? h(horasRes + 2) : resueltoEn || h(tecnico ? 1 : 0);

      const id = Number(
        insTicket.run(titulo, desc, cat, prio, estado, solicitante, tecnico, creado.toISOString(), actualizado, resueltoEn)
          .lastInsertRowid
      );

      // Historial coherente con el estado final
      insComentario.run(id, solicitante, 'Ticket creado', 'sistema', h(0));
      if (!tecnico) return;
      insComentario.run(id, admin, `Asignado a ${nombre(tecnico)}`, 'sistema', h(0.3));
      if (estado === 'abierto') return;
      insComentario.run(id, tecnico, 'Estado cambiado de "Abierto" a "En proceso"', 'sistema', h(0.6));
      insComentario.run(id, tecnico, COMENTARIOS_TECNICO[i % 2], 'comentario', h(0.8));
      if (estado === 'en_proceso') return;
      insComentario.run(id, tecnico, COMENTARIOS_TECNICO[2], 'comentario', h(horasRes - 0.1));
      insComentario.run(id, tecnico, 'Estado cambiado de "En proceso" a "Resuelto"', 'sistema', h(horasRes));
      if (estado === 'resuelto') return;
      insComentario.run(id, solicitante, COMENTARIOS_SOLICITANTE[i % 2], 'comentario', h(horasRes + 1.9));
      insComentario.run(id, solicitante, 'Estado cambiado de "Resuelto" a "Cerrado"', 'sistema', h(horasRes + 2));
    });
  });
}

/** Carga los datos solo si no hay usuarios registrados. */
function sembrarSiVacio() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
  if (n === 0) {
    sembrar();
    return true;
  }
  return false;
}

const CORREOS_DEMO = USUARIOS.map((u) => u.email);

module.exports = { sembrarSiVacio, limpiar, sembrar, CORREOS_DEMO, USUARIOS };

// Ejecución directa: `npm run seed` → reinicia la base con datos de demostración
if (require.main === module) {
  limpiar();
  sembrar();
  console.log('Base de datos reiniciada con datos de demostración.');
  console.log('Usuarios: admin@ticker.cr / admin123 · carlos@ticker.cr / tecnico123 · maria@empresa.com / usuario123');
}
