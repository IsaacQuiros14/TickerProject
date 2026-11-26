/**
 * middleware/seguridad.js — Cabeceras de seguridad y límite de intentos de login.
 * Implementado sin dependencias externas para mantener el proyecto liviano.
 */

const PRODUCCION = process.env.NODE_ENV === 'production';

/** Cabeceras HTTP de seguridad para una app renderizada en el navegador. */
function cabeceras(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // atributos style= en las vistas
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (PRODUCCION) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // Las respuestas de la API nunca deben quedar en caché (contienen datos por usuario)
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Límite de intentos por IP en una ventana de tiempo (memoria del proceso).
 * Se usa en el login para frenar ataques de fuerza bruta.
 */
function limiteIntentos({ max = 10, ventanaMs = 15 * 60 * 1000 } = {}) {
  const intentos = new Map(); // ip -> { n, reinicio }

  const timer = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, r] of intentos) if (r.reinicio <= ahora) intentos.delete(ip);
  }, ventanaMs);
  timer.unref();

  const middleware = (req, res, next) => {
    const ahora = Date.now();
    const ip = req.ip;
    let r = intentos.get(ip);
    if (!r || r.reinicio <= ahora) {
      r = { n: 0, reinicio: ahora + ventanaMs };
      intentos.set(ip, r);
    }
    r.n += 1;
    if (r.n > max) {
      const seg = Math.ceil((r.reinicio - ahora) / 1000);
      res.setHeader('Retry-After', String(seg));
      console.warn(`[seguridad] límite de login excedido ip=${ip}`);
      return res.status(429).json({ error: `Demasiados intentos. Intente de nuevo en ${Math.ceil(seg / 60)} min.` });
    }
    next();
  };
  // Permite reiniciar el contador de una IP tras un login exitoso
  middleware.reiniciar = (ip) => intentos.delete(ip);
  return middleware;
}

module.exports = { cabeceras, limiteIntentos, PRODUCCION };
