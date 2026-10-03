# Uniformes Médicos 2015

Catálogo web de uniformes médicos construido con Astro. El catálogo público y el panel privado usan PostgreSQL; las imágenes se sirven desde almacenamiento de objetos. Strapi se conserva únicamente como fuente temporal para la migración y no participa en las solicitudes normales de la aplicación.

## Requisitos

- Node.js 24.x y npm.
- PostgreSQL de desarrollo o producción.
- Vercel Blob (o un proveedor compatible con el adaptador configurado).
- PostgreSQL 16 o superior instalado y ejecutándose en el servidor.

## Instalación

```bash
npm install
Copy-Item .env.example .env
# Ajusta DATABASE_URL en .env para tu PostgreSQL instalado directamente.
npm run db:migrate
npm run owner:seed
npm run dev
```

Configura primero `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. El archivo `.env` nunca debe publicarse.

Para ejecutar la aplicación compilada en el VPS:

```bash
npm run build
HOST=0.0.0.0 PORT=4321 npm run start
```

En producción, si la app y PostgreSQL están en el mismo VPS, usa `127.0.0.1` en `DATABASE_URL` y no expongas el puerto 5432 a Internet. Coloca un proxy HTTPS (por ejemplo, Nginx) delante del puerto de Astro.

## Variables de entorno

La aplicación en ejecución necesita:

```env
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=...
ADMIN_EMAIL=propietaria@example.com
PUBLIC_SITE_URL=http://localhost:4321
```

`STRAPI_URL` y `STRAPI_TOKEN` solo se usan por los comandos de migración (`migrate:strapi` y `migrate:verify`) y deben estar disponibles únicamente durante esa operación controlada.

## Rutas principales

| Ruta | Descripción |
| --- | --- |
| `/` | Catálogo, filtros, favoritos y acceso al detalle. |
| `/productos/[id]` | Detalle con el `documentId` heredado. |
| `/cart` | Bolsa y preparación del pedido por WhatsApp. |
| `/admin/login` | Inicio de sesión del propietario. |
| `/admin/productos` | Gestión de productos, stock e imágenes. |
| `POST /api/cart-details` | Resuelve IDs numéricos contra PostgreSQL. |

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | `astro check` y compilación de producción. |
| `npm run db:migrate` | Aplica migraciones versionadas. |
| `npm run owner:seed` | Crea una sola cuenta propietaria. |
| `npm run owner:reset` | Restablece la contraseña propietaria desde `.env` y revoca sesiones anteriores. |
| `npm run migrate:strapi -- --dry-run` | Lee y reporta la fuente sin escribir datos. |
| `npm run migrate:strapi` | Importa productos, variantes e imágenes y crea un `runId`. |
| `npm run migrate:strapi -- --run-id <runId>` | Reanuda una ejecución de importación existente. |
| `npm run migrate:verify -- --run-id <id>` | Verifica datos, relaciones y URLs nuevas. |
| `npm run test` | Pruebas Vitest. |
| `npm run test:e2e` | Pruebas Playwright configuradas para aceptación. |

Consulta [`docs/migration.md`](docs/migration.md) para el corte desde Strapi y [`docs/documentacion.md`](docs/documentacion.md) para la arquitectura.

El proyecto usa el PostgreSQL indicado por `DATABASE_URL`; no necesita Docker para ejecutarse. El archivo `docker-compose.yml` y los comandos `docker:*` se conservan únicamente como alternativa para quienes quieran levantar una base local aislada. En VPS se usa el adaptador Node standalone; los builds ejecutados dentro de Vercel conservan el adaptador serverless de Vercel automáticamente.
