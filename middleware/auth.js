/**
 * middleware/auth.js — Control de sesión y de roles.
 *
 * En cada petición se vuelve a leer el usuario de la base de datos: si el
 * administrador lo desactiva o le cambia el rol, el cambio aplica de inmediato
 * aunque la sesión siga abierta.
 */
const { db } = require('../db');

const buscarUsuario = db.prepare('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?');

/** Carga el usuario vigente de la sesión en req.session.usuario, o responde 401. */
function requiereLogin(req, res, next) {
  const s = req.session.usuario;
  if (!s) return res.status(401).json({ error: 'Debe iniciar sesión' });

  const u = buscarUsuario.get(s.id);
  if (!u || !u.activo) {
    return req.session.destroy(() => res.status(401).json({ error: 'Su sesión ya no es válida' }));
  }
  req.session.usuario = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
  next();
}

/** Exige sesión y que el usuario tenga alguno de los roles indicados. */
function requiereRol(...roles) {
  return (req, res, next) =>
    requiereLogin(req, res, () => {
      if (!roles.includes(req.session.usuario.rol)) {
        return res.status(403).json({ error: 'No tiene permisos para esta acción' });
      }
      next();
    });
}

module.exports = { requiereLogin, requiereRol };
