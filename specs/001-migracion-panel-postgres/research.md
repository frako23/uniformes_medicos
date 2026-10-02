# Research: Migración a panel propio y PostgreSQL

## Decision: Mantener un único proyecto Astro con endpoints y middleware server-side

**Rationale**: El proyecto ya usa Astro con salida `server` y el adaptador de Vercel. Astro documenta endpoints server-side, middleware con `locals` y despliegue de páginas bajo demanda en Vercel, por lo que el panel puede vivir dentro de la misma aplicación y compartir tipos, layout y rutas públicas. La versión instalada es Astro 4.4.5; las Astro Actions se incorporaron después, en Astro 4.15, así que la primera implementación usará endpoints HTTP existentes y middleware en lugar de exigir una actualización mayor antes de resolver la migración.

**Alternatives considered**:

- Backend separado: descartado porque duplica despliegue, autenticación y contratos, y contradice la intención de un panel dentro de la aplicación.
- Astro Actions: útil para validación tipada, pero no está disponible en la versión instalada; puede evaluarse en una actualización posterior.
- Mantener Strapi como backend: descartado por el objetivo explícito de eliminarlo.

**Sources**:

- [Astro Middleware](https://docs.astro.build/guides/middleware/)
- [Astro Actions](https://docs.astro.build/en/guides/actions/)
- [Astro Vercel adapter](https://v5.docs.astro.build/en/guides/integrations-guide/vercel/)

## Decision: PostgreSQL alojado con Drizzle ORM, Postgres.js y migraciones versionadas

**Rationale**: Drizzle ofrece soporte PostgreSQL, generación y aplicación de migraciones mediante Drizzle Kit y una integración compatible con PostgreSQL alojado. Postgres.js permite transacciones para guardar de forma atómica un producto y sus variantes/imágenes, y conserva portabilidad frente a un proveedor específico. Neon es el proveedor inicial recomendado porque encaja con Vercel y ofrece una URL PostgreSQL estándar; la aplicación debe depender de `DATABASE_URL`, no de APIs propietarias del proveedor.

El flujo será code-first: el esquema TypeScript versionado genera SQL revisable; producción aplicará migraciones explícitas. `push` se limitará a iteraciones locales rápidas y no será el mecanismo de publicación.

**Alternatives considered**:

- SQL manual sin capa de esquema: descartado por mayor riesgo de divergencia y menor trazabilidad.
- Prisma: viable, pero añade un cliente y flujo de generación innecesarios para un catálogo pequeño que necesita consultas y transacciones directas.
- Driver HTTP sin transacciones interactivas: no elegido para las mutaciones compuestas de inventario; el guardado de producto, variantes y relaciones debe ser atómico.
- Base de datos local o archivos JSON: descartados porque PostgreSQL es una restricción del producto y no sirve para producción multiinstancia.

**Sources**:

- [Drizzle PostgreSQL and Neon](https://orm.drizzle.team/docs/connect-neon)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit overview](https://orm.drizzle.team/docs/kit-overview)

## Decision: Vercel Blob público para imágenes de catálogo

**Rationale**: Las imágenes son contenido público y deben cargarse rápido desde una red de distribución. Vercel Blob ofrece almacenamiento público, URLs directas, CDN y uso desde aplicaciones desplegadas en Vercel. El panel subirá archivos únicamente después de autorizar la acción en el servidor; el navegador nunca recibirá el token de escritura. Los objetos nuevos se tratarán como inmutables: reemplazar una imagen crea una nueva URL y la base de datos se actualiza antes de limpiar el objeto anterior, evitando contenido obsoleto en caché.

Se almacenarán en PostgreSQL la URL, pathname, tipo MIME, dimensiones, tamaño, checksum, texto alternativo, orden y URL de origen. La URL de Strapi queda como referencia de migración, no como dependencia runtime.

**Alternatives considered**:

- Archivos locales o `public/`: no son persistentes ni adecuados para funciones serverless.
- Mantener el proveedor multimedia de Strapi: contradice el retiro de Strapi y no resuelve el problema de lentitud.
- Almacenamiento privado: innecesario para imágenes de catálogo público y obligaría a proxificar cada lectura.
- S3-compatible genérico: técnicamente viable y más portable, pero requiere configurar CDN, credenciales y ciclo de vida adicional; se deja como alternativa si Vercel Blob no satisface coste o portabilidad.

**Sources**:

- [Vercel Blob](https://vercel.com/docs/vercel-blob)
- [Using the Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Vercel storage overview](https://vercel.com/docs/storage)

## Decision: Sesiones server-side para una única propietaria

**Rationale**: El panel tiene una sola cuenta y no requiere federación ni cuentas de cliente. Se almacenará un hash de contraseña fuerte y se generarán sesiones aleatorias persistidas en PostgreSQL. El navegador recibirá únicamente una cookie de sesión `HttpOnly`, `Secure`, `SameSite=Lax` o `Strict` en producción y con expiración idle/absoluta server-side. Las mutaciones administrativas validarán el origen y un token CSRF asociado a la sesión. No se almacenarán tokens en `localStorage` ni se usarán JWT como sesión principal.

**Alternatives considered**:

- Proveedor externo de identidad: añade coste, configuración y una dependencia fuera de alcance para una sola propietaria.
- JWT en `localStorage`: descartado por exposición innecesaria ante XSS y dificultad de revocación inmediata.
- Cookie firmada sin sesión persistida: simplifica el esquema, pero complica revocación, expiración server-side y cierre global de sesiones.

**Sources**:

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## Decision: Migración por lotes, reanudable, idempotente y con corte explícito

**Rationale**: La consulta actual está limitada a tres páginas de 100 productos, pero la migración debe importar todos los resultados. Un script independiente leerá `pagination.pageCount` o continuará hasta una página vacía, normalizará respuestas Strapi v4/v5, descargará las imágenes, las subirá al nuevo almacenamiento y hará upsert mediante los identificadores de origen. Cada ejecución tendrá un registro, conteos, errores y checksum; una segunda ejecución no duplicará productos, variantes ni imágenes.

La validación comparará una instantánea del origen con PostgreSQL: cantidad de productos, identificadores, campos obligatorios, relaciones, cantidades por talla, imágenes y apertura de las URLs nuevas. El corte requiere un informe sin errores obligatorios, pruebas públicas y una copia del informe/exportación antes de desactivar Strapi.

**Alternatives considered**:

- Importación manual por CSV: no conserva de forma fiable relaciones ni multimedia.
- Script único sin reanudación: aumenta el riesgo ante fallos de red, límites de tiempo serverless o imágenes corruptas.
- Migrar solo los primeros 300 productos: contradice la necesidad de importar todo el catálogo.

## Decision: Conservar rutas públicas de producto y separar compatibilidad multimedia

**Rationale**: La aplicación actual usa `documentId` para las URLs de detalle y el identificador numérico para la bolsa. El modelo conservará ambos valores (`legacy_document_id` y `legacy_id`) y las rutas `/productos/[id]` seguirán resolviendo por el identificador público. Las URLs físicas de las imágenes cambiarán al nuevo almacenamiento; se guardará la URL de Strapi para auditoría y comparación.

Una URL de imagen que apunte directamente al dominio eliminado de Strapi no puede conservarse sin mantener ese dominio o configurar una redirección. Por eso el corte debe comprobar si existen consumidores externos de esas URLs y decidir explícitamente si se conserva temporalmente el host antiguo. La vitrina no tendrá ninguna consulta runtime a Strapi.

## Decision: Vitest para lógica y Playwright para flujos críticos

**Rationale**: La documentación de Astro recomienda Vitest para pruebas unitarias/integrales con `getViteConfig()` y Playwright para flujos end-to-end. Vitest cubre normalización de Strapi, validadores, autorización y composición de mensajes; Playwright cubre login, CRUD de producto, publicación, detalle, bolsa y WhatsApp. `astro check` y `npm run build` continúan siendo puertas obligatorias.

**Alternatives considered**:

- Solo pruebas manuales: insuficientes para migración, autorización y regresiones públicas.
- Cypress: viable, pero Playwright está documentado directamente en la guía de testing de Astro y cubre varios motores.

**Sources**:

- [Astro Testing](https://docs.astro.build/en/guides/testing/)
- [Vitest Writing Tests](https://vitest.dev/guide/learn/writing-tests)
- [Playwright Writing Tests](https://playwright.dev/docs/writing-tests)
