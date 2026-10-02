# Implementation Plan: Migración a panel propio y PostgreSQL

**Branch**: `001-migracion-panel-postgres` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-migracion-panel-postgres/spec.md`

## Summary

Se reemplazará la dependencia de Strapi por un backend integrado en la aplicación Astro existente. La aplicación mantendrá sus rutas públicas y su flujo de WhatsApp, pero consultará PostgreSQL para el catálogo y las existencias, y un almacenamiento de objetos público para las imágenes. Se añadirá un panel privado para una única propietaria, con autenticación server-side, gestión completa de productos/variantes/imágenes y validaciones de inventario.

La migración se ejecutará con scripts reanudables e idempotentes: leerá todas las páginas disponibles de Strapi, conservará los identificadores de origen, copiará las imágenes, generará un informe de comparación y bloqueará el retiro de Strapi hasta validar los datos. El plan conserva Astro con Node.js 20 y Vercel; no crea un frontend ni un backend separado.

## Technical Context

**Language/Version**: TypeScript sobre Node.js 20.x; Astro 4 existente con salida `server`.

**Primary Dependencies**: Astro/Vercel/Tailwind/React existentes; Drizzle ORM y Drizzle Kit para PostgreSQL y migraciones; Postgres.js para conexiones server-side; Zod para validar entradas; `@vercel/blob` para imágenes; Vitest y Playwright para pruebas.

**Storage**: PostgreSQL alojado, con Neon como proveedor inicial recomendado por su compatibilidad con Vercel y su conexión PostgreSQL estándar; Vercel Blob en modo público para imágenes de catálogo. Strapi se conserva únicamente como fuente de migración hasta el corte validado.

**Testing**: `astro check` y `npm run build`; pruebas unitarias e integrales con Vitest; pruebas de navegador con Playwright; scripts de migración en modo simulación, comparación e idempotencia.

**Target Platform**: Desarrollo local con Node.js 20 y PostgreSQL local o rama de desarrollo; producción en Vercel con funciones Node.js 20, PostgreSQL y Vercel Blob configurados por entorno.

**Project Type**: Aplicación web Astro server-rendered con vitrina pública, panel administrativo privado, endpoints HTTP y scripts de migración operativa.

**Performance Goals**: Al menos el 95% de las consultas normales de catálogo y detalle debe mostrar contenido esencial en menos de 3 segundos bajo la carga esperada; las imágenes públicas deben servirse desde CDN y no bloquear las acciones esenciales. La propietaria debe poder completar una edición normal de producto y stock en menos de 5 minutos.

**Constraints**: Una sola administradora propietaria; sin registro público, pagos, pedidos confirmados ni clientes. Toda mutación administrativa requiere sesión autorizada y protección CSRF/origen. Los secretos solo viven en el servidor. PostgreSQL es la fuente de verdad final. Las migraciones de esquema son versionadas. La eliminación exacta de URLs antiguas alojadas bajo el dominio de Strapi requiere conservar temporalmente ese dominio o disponer de una redirección; las rutas públicas de producto sí se conservarán dentro de la aplicación.

**Scale/Scope**: Se debe importar el catálogo completo sin el límite actual de tres páginas; la documentación existente indica hasta aproximadamente 300 productos en el estado actual. El diseño debe paginar el origen de Strapi y no depender de ese límite. El primer alcance contempla productos, tipos/categorías, tallas, existencias, imágenes, cuenta propietaria y continuidad de la vitrina.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Gates before Phase 0

- **I. Catálogo completo y fuente de verdad — PASS**: el modelo y los servicios públicos usarán PostgreSQL para productos, variantes y existencias; las consultas respetarán estado publicado/disponible y estados de error/vacío.
- **II. Compra simple y conversión — PASS**: se conservan catálogo, filtros, detalle, favoritos, bolsa y WhatsApp; el contrato de bolsa seguirá reflejando la selección real.
- **III. Diseño claro y accesible — PASS**: el panel y la vitrina se validarán en móvil/escritorio, teclado, foco, contraste y textos alternativos; las imágenes se gestionarán con metadatos accesibles.
- **IV. Rendimiento y resiliencia — PASS**: se eliminan consultas a Strapi en runtime, se usan consultas acotadas e índices, imágenes públicas con CDN y estados controlados para fallos de DB/almacenamiento.
- **V. Seguridad y calidad — PASS**: autorización server-side en todas las rutas administrativas, sesión HttpOnly/Secure/SameSite, secretos fuera del repositorio, validación de entradas, migración comparable y pruebas de rutas críticas.
- **Restricciones de plataforma — PASS**: se conserva Astro/TypeScript, PostgreSQL es la fuente final, el esquema tendrá migraciones versionadas, el backend corre localmente y en producción, y no se agregan pagos ni ventas confirmadas.

No hay violaciones conocidas que requieran justificar complejidad adicional. La compatibilidad con URLs multimedia antiguas queda como condición de corte: si apuntan directamente al dominio de Strapi, la propietaria debe conservar una redirección o aceptar que solo se preserve la URL pública del producto.

## Project Structure

### Documentation (this feature)

```text
specs/001-migracion-panel-postgres/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-api.md
│   ├── public-catalog.md
│   └── migration-cli.md
└── tasks.md              # Lo generará $speckit-tasks; no forma parte de este plan
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── client.ts
│   └── schema.ts
├── middleware.ts
├── server/
│   ├── auth/
│   ├── catalog/
│   ├── migration/
│   └── storage/
├── pages/
│   ├── admin/
│   │   ├── index.astro
│   │   ├── login.astro
│   │   └── productos/
│   ├── api/
│   │   ├── admin/
│   │   └── cart-details.ts
│   ├── productos/[id].astro
│   └── index.astro
├── components/
├── stores/
└── utils/

drizzle/
scripts/
├── migrate-strapi.ts
├── verify-migration.ts
└── seed-owner.ts

tests/
├── unit/
├── integration/
└── e2e/
```

**Structure Decision**: Se mantiene un solo proyecto Astro. Las páginas y endpoints públicos y administrativos viven bajo `src/pages`; las consultas, validaciones, autenticación, almacenamiento y migración se separan en `src/server`; el esquema y el cliente de PostgreSQL se centralizan en `src/db`; las migraciones se versionan en `drizzle/`; y las operaciones de importación/validación se ejecutan desde `scripts/`. No se introduce una aplicación frontend/backend separada porque la constitución exige conservar Astro y el panel debe formar parte de la aplicación.

## Phase 0: Research Decisions

Las decisiones investigadas y sus alternativas están documentadas en [research.md](./research.md). Las principales son:

1. Usar endpoints HTTP y middleware de Astro sobre el runtime Node actual, en lugar de introducir otro backend o depender de Astro Actions que no existen en la versión actualmente instalada.
2. Usar Drizzle con PostgreSQL y migraciones SQL versionadas; el proveedor inicial recomendado es Neon por el despliegue existente en Vercel, manteniendo la interfaz estándar de PostgreSQL.
3. Usar Vercel Blob público para imágenes de catálogo, con objetos inmutables y metadatos en PostgreSQL.
4. Usar sesiones server-side para la única propietaria, cookies protegidas y hash de contraseña con primitivas criptográficas de Node, sin JWT ni credenciales en `localStorage`.
5. Ejecutar una migración por lotes, reanudable, idempotente y con informe de comparación antes del corte.

## Phase 1: Design Summary

- [data-model.md](./data-model.md) define cuentas, sesiones, categorías, productos, variantes, imágenes y registros de migración, junto con restricciones e invariantes.
- [contracts/admin-api.md](./contracts/admin-api.md) define autenticación y operaciones privadas de productos, variantes e imágenes.
- [contracts/public-catalog.md](./contracts/public-catalog.md) define las rutas públicas conservadas y el contrato de la bolsa/WhatsApp.
- [contracts/migration-cli.md](./contracts/migration-cli.md) define entradas, comandos, salidas, estados y puertas de corte de la migración.
- [quickstart.md](./quickstart.md) define la preparación local, migración de prueba, pruebas de regresión y validación del corte.

## Constitution Re-check after Phase 1 Design

- **I. Fuente de verdad**: PASS; los contratos públicos leen el catálogo desde PostgreSQL y las existencias tienen reglas explícitas.
- **II. Compra simple**: PASS; se conserva la navegación actual y el contrato `POST /api/cart-details` valida la correspondencia con WhatsApp.
- **III. Accesibilidad**: PASS; el diseño incluye `alt`, foco visible, teclado, estados de carga/error y revisión responsive para panel y vitrina.
- **IV. Rendimiento/resiliencia**: PASS; se eliminan llamadas runtime a Strapi, se agregan índices, CDN de imágenes y respuestas controladas para fallos.
- **V. Seguridad/calidad**: PASS; el panel exige sesión server-side, las mutaciones validan origen/CSRF y el plan incluye pruebas de autorización, migración e idempotencia.
- **Restricciones**: PASS; PostgreSQL, migraciones versionadas, separación de entornos, validación antes del retiro de Strapi y ausencia de pagos están reflejados en el modelo y contratos.

No quedan decisiones técnicas abiertas. La selección concreta del proveedor PostgreSQL puede cambiarse durante la implementación siempre que mantenga PostgreSQL, conexión por entorno, migraciones versionadas y las mismas interfaces documentadas.

## Complexity Tracking

No se registran violaciones de la constitución.
