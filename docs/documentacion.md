# Documentación técnica

## Arquitectura

```text
PostgreSQL ──► servicios de catálogo ──► Astro: catálogo, detalle y bolsa
     │                  │
     │                  └──► API administrativa protegida
     └── metadatos de imágenes

Vercel Blob ──► URLs públicas de imágenes optimizadas/cacheables
```

La aplicación usa Astro con salida server. En un VPS se compila con el adaptador Node en modo standalone; si el build se ejecuta en Vercel, se selecciona el adaptador serverless de Vercel. PostgreSQL es la fuente de verdad del catálogo después del corte. Strapi solo interviene en los scripts controlados de importación y verificación.

## Módulos principales

- `src/db/schema.ts`: tablas, enums, relaciones e índices PostgreSQL.
- `src/server/catalog/public-products.ts`: consultas públicas y disponibilidad derivada.
- `src/server/catalog/admin-products.ts`: listado, creación y edición administrativa.
- `src/server/auth/`: propietario, sesiones revocables, expiración, hash de contraseñas y CSRF.
- `src/server/storage/blob.ts`: carga validada e inmutable de imágenes.
- `src/server/migration/`: cliente paginado, normalización, importación, reportes y verificación.
- `src/pages/admin/`: interfaz privada para productos, stock e imágenes.
- `src/pages/index.astro`, `src/pages/productos/[id].astro` y `src/pages/cart.astro`: experiencia pública sin llamadas runtime a Strapi.

## Datos y disponibilidad

Los productos mantienen el `legacyId` numérico y el `legacyDocumentId` de origen. Un producto solo se muestra como disponible cuando está publicado, activo y tiene al menos una variante con existencia mayor que cero. El mismo criterio se usa en catálogo, detalle y bolsa.

Las imágenes conservan URL/ID de origen y metadatos en PostgreSQL, pero el navegador usa `storageUrl` del nuevo almacenamiento. Las posiciones activas son únicas por producto y las eliminaciones se registran de forma lógica.

## Panel administrativo

Existe una única cuenta con rol `owner`, creada mediante `npm run owner:seed`. Si se necesita restablecer su contraseña, `npm run owner:reset` actualiza el hash desde `.env` y revoca sus sesiones anteriores. No hay registro público ni asignación de roles desde el navegador. Las rutas `/admin/**` y `/api/admin/**` exigen sesión; las mutaciones requieren cookie de sesión, origen válido y token CSRF.

## Bolsa y WhatsApp

`POST /api/cart-details` recibe una lista acotada de IDs numéricos positivos, devuelve los productos disponibles y enumera `missingIds` para favoritos obsoletos o productos sin stock. El mensaje de WhatsApp se compone exclusivamente a partir de esos registros actuales.

## Desarrollo

La aplicación se conecta al PostgreSQL instalado directamente mediante `DATABASE_URL`. Si la aplicación y la base de datos están en el mismo servidor, se recomienda usar `127.0.0.1` o `localhost` en esa URL. Docker no es un requisito de ejecución; el `docker-compose.yml` del repositorio solo sirve como alternativa para un entorno local aislado.

```bash
npm install
npm run db:migrate
npm run owner:seed
npm run dev
npm run test
npm run build
```

Usa variables separadas para desarrollo, preview y producción. Nunca envíes credenciales al cliente ni las incluyas en reportes de migración.
