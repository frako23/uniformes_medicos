# Quickstart: Validación de la migración a panel propio y PostgreSQL

Este documento describe cómo demostrar la feature cuando sea implementada. No contiene cuerpos completos de código, migraciones ni suites de prueba.

## Prerequisites

- Node.js 20.x y npm.
- Docker Desktop con PostgreSQL local, o una base PostgreSQL de desarrollo separada de producción.
- Proyecto de Vercel enlazado y un store Vercel Blob de desarrollo, o credenciales equivalentes para el proveedor elegido.
- Acceso de lectura a Strapi: `STRAPI_URL` y `STRAPI_TOKEN`.
- Una cuenta de propietaria configurada mediante el script de inicialización; no se crea desde la interfaz pública.

## Environment

Crear `.env.local` sin incluirlo en Git:

```text
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=...
STRAPI_URL=https://...
STRAPI_TOKEN=...
ADMIN_EMAIL=...
PUBLIC_SITE_URL=http://localhost:4321
MIGRATION_REPORT_DIR=.local/migration-reports
```

Usar valores independientes para desarrollo, preview y producción. No reutilizar tokens de Strapi ni de Blob entre entornos.

## Setup and Schema Validation

```bash
npm ci
npm run db:migrate
npm run build
```

Expected results:

- All versioned PostgreSQL migrations apply without data-loss prompts.
- `astro check` and the production build finish successfully.
- No secret appears in build output or generated client assets.

## Migration Validation

1. Run `npm run migrate:strapi -- --dry-run` and save the report.
2. Confirm that pagination reaches the source total and that the report contains no malformed mandatory records hidden by a page limit.
3. Run `npm run migrate:strapi -- --run-id <id>` against the development database and Blob store.
4. Run `npm run migrate:verify -- --run-id <id>`.
5. Run the same import/verification again and confirm no duplicate products, variants or images and no changed public identifiers.
6. Resolve every missing image, relationship mismatch and legacy URL compatibility decision before allowing `readyForCutover: true`.

## Admin Acceptance Scenarios

Start the app with `npm run dev` and verify:

1. `/admin` redirects an unauthenticated browser to `/admin/login`.
2. Invalid credentials do not reveal whether the owner email exists.
3. The owner can log in, create/edit a product, change stock per size, reorder an image and deactivate/reactivate the product.
4. Invalid price, negative stock, unsupported image type and missing required fields return field-level errors and leave prior data intact.
5. Direct requests to protected API routes without the session or CSRF/origin proof are rejected.
6. A session expires/revokes server-side and cannot be reused after logout.

## Public Regression Scenarios

1. `/` shows the migrated published catalog, existing filters and useful empty/error states.
2. A sample of every migrated product opens through its preserved `/productos/:publicId` URL.
3. Images load from the new storage URL and no browser/network request goes to Strapi during normal public use.
4. Products with zero stock are clearly unavailable and do not appear as selectable.
5. A stale favorite/cart ID produces a useful missing-item response without breaking `/cart`.
6. The WhatsApp message contains exactly the current selected products.
7. Test the public catalog and `/admin` on mobile, desktop and keyboard-only navigation.

## Automated Gates

```bash
npm run test
npm run test:e2e
npm run build
```

Vitest must cover normalization, validators, availability, sessions, migration matching and WhatsApp composition. Playwright must cover unauthorized admin access, owner CRUD, image/stock changes, public detail, stale cart handling and the WhatsApp preparation flow. The deployment gate fails if inventory is misleading, an admin route is unprotected, a secret is exposed or migration verification is not green.

## Production Cutover Checklist

- [ ] Final source export and migration report stored securely.
- [ ] Strapi catalog edits frozen during final import.
- [ ] All mandatory product, variant, category and image comparisons pass.
- [ ] Public product URLs and any external media URL compatibility decision verified.
- [ ] Production environment variables point to production PostgreSQL and Blob only.
- [ ] Smoke tests pass with Strapi runtime access disabled.
- [ ] Rollback/export instructions retained for the observation window.
- [ ] Strapi disabled only after all gates pass.
