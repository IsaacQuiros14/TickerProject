# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/).

## [1.0.0] — 2026-11-25

### Agregado
- Módulo de tickets: creación, asignación, ciclo de estados e historial con comentarios y eventos automáticos.
- Roles solicitante, técnico y administrador con permisos validados en el servidor.
- Listado con filtros por estado, prioridad, categoría, técnico y búsqueda.
- Gestión de usuarios para el administrador.
- Dashboard de métricas (función adicional): indicadores, tendencia diaria, categorías, prioridades, desempeño por técnico y filtro por fechas.
- Seguridad: cabeceras HTTP, límite de intentos de login, sesiones en SQLite, revalidación del usuario en cada petición y modo demo.
- 49 pruebas de integración, ESLint y CI en GitHub Actions.
- Despliegue en Render con `render.yaml`.
- Manual técnico y manual de usuario en PDF.
