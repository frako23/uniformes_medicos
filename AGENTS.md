# Memoria técnica del proyecto

## Qué es

Catálogo web de uniformes médicos con vitrina pública, bolsa/WhatsApp y panel privado para que una propietaria gestione productos, variantes, stock e imágenes.

## Stack y decisiones vigentes

- Astro 4 con TypeScript, React 18 y Tailwind CSS; aplicación única server-rendered (`output: "server"`) desplegada en Vercel Serverless con Node.js 20.
- PostgreSQL es la fuente de verdad. Drizzle ORM/Kit y `postgres` gestionan el acceso y las migraciones SQL versionadas en `drizzle/`; Neon es el proveedor inicial recomendado.
- Vercel Blob público almacena imágenes; sus metadatos y relaciones viven en PostgreSQL. No se introduce un frontend/backend separado.
- El dominio vive en `src/server`; las rutas y endpoints en `src/pages`; esquema/cliente DB en `src/db`; operaciones de migración en `scripts/`.
- Zod valida entradas. La autenticación usa sesiones server-side revocables, cookies HttpOnly/Secure/SameSite y controles Origin/CSRF; no hay registro público ni secretos en el cliente.
- Strapi solo es fuente temporal para la migración: los scripts deben ser paginados, reanudables, idempotentes y generar verificación antes del corte.
- Vitest cubre unitarias/integración y Playwright las pruebas de navegador; `astro check` forma parte del build.

## Desarrollo local

Requiere Node.js 20.x, npm, PostgreSQL y un token de Blob. Configura en `.env` `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `PUBLIC_SITE_URL` (`.env` nunca se versiona).

```bash
npm install
npm run db:migrate
npm run owner:seed
npm run dev
```

Validación habitual:

```bash
npm run test
npm run test:e2e
npm run build
```

Para migración controlada: `npm run migrate:strapi -- --dry-run` y luego `npm run migrate:verify -- --run-id <id>`; `STRAPI_URL` y `STRAPI_TOKEN` solo se usan en esos scripts.

## Convenciones

- Mantener una sola aplicación Astro y separar presentación, servicios server-only, acceso a datos y scripts según las carpetas anteriores.
- PostgreSQL manda para productos, variantes y existencias; un producto es disponible solo si está publicado, activo y tiene alguna variante con stock positivo.
- Preservar los identificadores `legacy_id`/`legacy_document_id` y las URLs públicas existentes; no hacer llamadas runtime a Strapi.
- Proteger cada ruta `/admin/**` y `/api/admin/**` en servidor; validar mutaciones y entradas, redactor errores/secrets y no procesar pagos ni ventas confirmadas.
- Añadir migraciones versionadas y pruebas para cambios de esquema o reglas críticas; conservar estados de carga, vacío y error, accesibilidad y responsive.

Las reglas de producto viven en .specify/memory/constitution.md y el estado del producto en specs/README.md
