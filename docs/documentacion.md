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

## Carga masiva de inventario

`/admin/productos/carga-masiva` permite crear productos y editar existencias, precios y demás datos con un archivo de Excel.

- **Formato**: libro `.xlsx` con las hojas `Instrucciones`, `Inventario` y `Listas`. `Inventario` tiene una fila por producto, las columnas `ID`, `Tipo`, `Fabricante`, `Marca`, `Género`, `Precio`, `SKU`, `Color`, `Publicado`, `Activo` y una columna `Talla <etiqueta>` por talla. La plantilla vacía y la descarga del inventario actual comparten formato; los metadatos (tipo de archivo, fecha de generación UTC y versión) están en `Instrucciones`. El contrato completo está en `specs/003-carga-masiva-inventario/contracts/`.
- **Límites**: `.xlsx` de hasta 4 MB (Vercel rechaza cuerpos de más de 4,5 MB), 5.000 productos, 200 entradas y 50 MB descomprimidos. Sin macros ni contraseña.
- **Celdas**: una fila con ID edita ese producto y una fila sin ID lo crea (Publicado vacío = No, Activo vacío = Sí). Una talla vacía significa que el producto no usa esa talla; si ya la tiene, es un error y hay que escribir `0`. Una columna de talla ausente no cambia nada. La carga nunca elimina productos, tallas ni fotografías.
- **Flujo**: `POST /api/admin/inventory/preview` analiza el archivo sin guardar nada y devuelve cambios, errores y advertencias agrupados por filas. Si no hay errores, emite un token firmado (HMAC ligado a la sesión, válido 60 minutos). `POST /api/admin/inventory/apply` recibe el mismo archivo y el token, y aplica todo en una sola transacción con bloqueo consultivo; si el inventario cambió, responde `409` sin modificar datos. El archivo subido nunca se almacena.
- **Secuencia de `legacy_id`**: la migración `0002_sync_product_legacy_id_sequence.sql` lleva la secuencia de `products.legacy_id` al máximo existente (la importación de Strapi insertó identificadores explícitos). `createProduct` y la carga masiva repiten la comprobación de forma idempotente antes de insertar.
- **Pruebas**: las de integración con PostgreSQL se ejecutan con `TEST_DATABASE_URL` apuntando a una base cuyo nombre termine en `_test`; las E2E, con `E2E=1` contra una base aislada.

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
