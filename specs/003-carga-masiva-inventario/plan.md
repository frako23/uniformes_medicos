# Implementation Plan: Carga y edición masiva de inventario con plantilla de Excel

**Branch**: `003-carga-masiva-inventario` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-carga-masiva-inventario/spec.md`

## Summary

El panel tendrá una pantalla “Carga masiva” en `/admin/productos/carga-masiva` con cuatro pasos:

1. **Descargar**: la plantilla vacía o el inventario actual, en formato `.xlsx`.
2. **Subir y validar**: subir el archivo completado y ver una vista previa con los valores actuales y nuevos de cada cambio, más los errores y las advertencias.
3. **Confirmar**: aplicar todo en una sola operación de todo o nada.
4. **Resultado**: ver un resumen con enlaces para agregar fotos a los productos creados.

El libro usa una fila por producto y una columna `Talla <etiqueta>` por talla. Las cantidades reemplazan la existencia actual, y la carga masiva nunca elimina productos, tallas ni fotos.

Técnicamente:

- **Ubicación**: la funcionalidad vive en la misma aplicación Astro, en un módulo server-only `src/server/inventory/` con cuatro endpoints bajo `/api/admin/inventory/`.
- **Lectura y escritura del Excel**: los archivos se leen con `read-excel-file` y se generan con `write-excel-file` más su complemento de validación de datos. `fflate` inspecciona el zip antes de leerlo.
- **Sin estado en el servidor**: la vista previa no guarda nada. Devuelve un token HMAC ligado a la sesión, y la confirmación reenvía el mismo archivo con ese token.
- **Aplicación**: ocurre en una transacción de PostgreSQL con bloqueo consultivo, `FOR UPDATE` sobre los productos afectados, verificación de que el inventario no cambió desde la vista previa y escrituras por lotes.
- **Esquema**: no cambia. Solo se agrega una migración de datos que sincroniza la secuencia de `legacy_id`. Sin esa corrección, las altas en bloque podrían chocar con los identificadores migrados desde Strapi.

## Technical Context

**Language/Version**: TypeScript 5.3 sobre Node.js 24.x; Astro 4.4.5 con salida `server` (adaptador de Vercel en producción y Node standalone en local).

**Primary Dependencies**:

- Existentes: Astro, Tailwind CSS, Drizzle ORM con `postgres` (Postgres.js) y Zod 4.
- Nuevas:
  - `read-excel-file` 9.x, para leer `.xlsx`.
  - `write-excel-file` 4.x, para generar `.xlsx`.
  - `@onparallel/write-excel-file-data-validation` 1.0.2, fijado a esa versión, para listas desplegables y validaciones dentro de Excel.
  - `fflate` 0.8.x, ya transitiva, para inspeccionar el zip.
- Las cuatro suman 9 paquetes y 0 vulnerabilidades en `npm audit` al 2026-10-17.

**Storage**:

- PostgreSQL, tablas existentes:
  - `products` y `product_variants`, en lectura y escritura;
  - `product_images`, solo para contar las imágenes activas.
- Sin tablas ni columnas nuevas. Una migración de datos, `drizzle/0002_sync_product_legacy_id_sequence.sql`.
- Los archivos subidos no se almacenan: se procesan en memoria durante la petición. El estado entre la vista previa y la confirmación es un token firmado.

**Testing**:

- Vitest unitario para celdas, filas, diferencias, advertencias, incidencias y token.
- Vitest de contrato para la ida y vuelta del libro con inspección del XML, y para el esquema y tamaño de las respuestas.
- Integración con PostgreSQL real, condicionada por `TEST_DATABASE_URL`, para atomicidad, concurrencia, intercambio de SKU, secuencia e idempotencia.
- Playwright condicionado por `E2E=1`, en escritorio y móvil.
- `astro check` y `npm run build`.

**Target Platform**: Vercel Functions con Node.js 24. Su límite de 4,5 MB por petición y respuesta es el que fija el tope de 4 MB por archivo. Fluid compute da 300 s de duración por defecto, pero el diseño apunta a pocos segundos por petición, así que no depende de Fluid. En desarrollo, Node local con PostgreSQL de `docker-compose.yml`.

**Project Type**: Aplicación web Astro server-rendered con vitrina pública y panel privado de una única propietaria.

**Performance Goals**: Vista previa de un archivo de 1.000 productos en menos de 30 s y aplicación en menos de 1 min (SC-003). Lo esperado según la prueba realizada es mucho menos:

- leer 5.000 × 22 celdas: unos 0,2 s;
- generar el mismo libro: unos 0,6 s;
- aplicar 1.000 productos: unas 15 a 20 sentencias por lotes.

Las descargas deben generarse en menos de 3 s.

**Constraints**:

- **Archivo**: `.xlsx` de hasta 4 MB, 5.000 filas de productos y 50 MB / 200 entradas descomprimido. Sin macros ni contraseña.
- **Respuestas**: menos de 4 MB, con incidencias agrupadas.
- **Vista previa**: vence a los 60 min, y la sesión puede caducar antes (30 min de inactividad).
- **Aplicación**: una sola transacción con `lock_timeout` de 10 s. Nunca ejecuta `DELETE` ni toca `category_id`, los campos `source_*` ni las imágenes.
- **Autorización y privacidad**: `requireOwner` o `requireMutation` en cada endpoint. Ningún valor de celda se escribe en los registros. Ningún secreto ni variable de entorno nuevos.
- **Interfaz**: en español, accesible con teclado y lector de pantalla, y usable a 320 px sin desplazamiento horizontal.

**Scale/Scope**:

- Catálogo actual de unos 300 productos, con objetivo de hasta 1.000, y decenas de etiquetas de talla. Una sola usuaria.
- Una página nueva y un enlace en `/admin/productos`.
- Cuatro endpoints y nueve módulos de servidor.
- Ajustes menores en `admin-variants.ts` y `admin-products.ts`.
- Una migración de datos, sin cambios en la vitrina pública.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Estado | Evidencia del diseño |
|---|---|---|
| I. Catálogo completo y fuente de verdad | PASS | PostgreSQL sigue siendo la fuente de verdad. La descarga incluye todos los productos. La disponibilidad se calcula con la regla vigente (publicado, activo y alguna talla con existencias positivas) y se anticipa en la vista previa. No se inventan datos ni se eliminan productos o tallas. |
| II. Compra simple y orientada a la conversión | PASS | No cambia el recorrido público. La vitrina se renderiza en cada petición sin caché, así que los cambios aplicados se reflejan de inmediato en catálogo, detalle y bolsa. |
| III. Diseño claro, atractivo y accesible | PASS | Una pantalla de una sola columna en móvil, áreas táctiles de 44 px, sin desplazamiento horizontal, foco gestionado, `aria-live` y alertas, errores con texto y no solo color ([bulk-inventory-ui.md](./contracts/bulk-inventory-ui.md)). |
| IV. Rendimiento y resiliencia | PASS | Archivos y respuestas acotados, escrituras por lotes en una transacción, comprobaciones en el navegador antes de subir y estados de carga, rechazo, error, conflicto, fallo y sesión caducada con mensajes sin detalles técnicos. |
| V. Seguridad, calidad y evolución responsable | PASS | Autenticación y CSRF en el servidor para cada endpoint. Tokens ligados a la sesión. Archivos no persistidos ni registrados. Aplicación de todo o nada con control de concurrencia. Pruebas de las rutas críticas de existencias. Dependencias nuevas mínimas, auditadas y justificadas ([research.md](./research.md), Decision 1). |
| Restricciones de producto y plataforma | PASS | Se conserva Astro con TypeScript. No hay cambio de esquema, y el ajuste de la secuencia va en una migración versionada. Funciona igual en local y en producción, sin secretos nuevos. El panel comunica el resultado de cada operación. Sin pagos ni ventas. |
| Flujo de desarrollo y puertas de calidad | PASS | La especificación y los contratos describen éxito, carga, vacío y error. Las entradas se validan y nunca quedan estados parciales. Hay pruebas de acceso no autorizado. El quickstart incluye la revisión en móvil, teclado y compatibilidad de hojas de cálculo, y detiene la publicación ante existencias engañosas. |

**Resultado**: PASS. No hay violaciones que requieran una excepción ni una entrada en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-carga-masiva-inventario/
├── spec.md                          # Especificación (clarificada)
├── plan.md                          # Este plan
├── research.md                      # Decisiones, alternativas y evidencias
├── data-model.md                    # Mapeo a tablas, estructuras transitorias, reglas y transacción
├── quickstart.md                    # Validación automatizada y manual
├── contracts/
│   ├── inventory-workbook.md        # Formato del libro de Excel (formato 1)
│   ├── admin-inventory-api.md       # Endpoints, respuestas y códigos de incidencia
│   └── bulk-inventory-ui.md         # Estados de la pantalla, accesibilidad y móvil
├── checklists/
│   └── requirements.md              # Calidad de la especificación
└── tasks.md                         # Lo generará $speckit-tasks
```

### Source Code (repository root)

```text
src/
├── pages/
│   ├── admin/productos/
│   │   ├── index.astro                  # + acceso “Carga masiva” junto a “Nuevo producto”
│   │   └── carga-masiva.astro           # Nueva: descargas, subida, vista previa y resultado
│   └── api/admin/inventory/
│       ├── template.ts                  # GET plantilla vacía (.xlsx)
│       ├── export.ts                    # GET inventario actual (.xlsx)
│       ├── preview.ts                   # POST archivo → vista previa + token
│       └── apply.ts                     # POST archivo + token → aplicación atómica
├── components/admin/
│   └── BulkInventoryUpload.astro        # Formulario, estados y render de la vista previa (script de navegador)
├── server/
│   ├── inventory/
│   │   ├── workbook-format.ts           # Hojas, columnas, encabezados, metadatos y límites
│   │   ├── workbook-writer.ts           # Plantilla y exportación con validaciones de datos
│   │   ├── workbook-reader.ts           # Guardas del archivo y lectura de hojas y metadatos
│   │   ├── rows.ts                      # Normalización y validación de celdas por fila
│   │   ├── changes.ts                   # Diferencias, tallas, SKU, disponibilidad y advertencias (funciones puras)
│   │   ├── issues.ts                    # Códigos, mensajes y agrupación por rangos de filas
│   │   ├── preview-token.ts             # Firma y verificación HMAC ligada a la sesión
│   │   ├── repository.ts                # Instantánea del catálogo, línea base y aplicación transaccional
│   │   └── service.ts                   # Orquestación de descargas, vista previa y aplicación
│   ├── catalog/
│   │   ├── admin-products.ts            # createProduct usa el helper de secuencia
│   │   └── admin-variants.ts            # updateVariantQuantity también actualiza products.updated_at
│   └── validation/catalog.ts            # Reglas de campo reutilizadas (productInputSchema / variantInputSchema)
└── utils/catalog-filters.ts             # compareSizeLabels reutilizado para el orden de tallas

drizzle/
├── 0002_sync_product_legacy_id_sequence.sql   # Sincroniza la secuencia de legacy_id (sin cambio de esquema)
└── meta/_journal.json                         # Nueva entrada idx 1

tests/
├── unit/
│   ├── inventory-rows.test.ts
│   ├── inventory-changes.test.ts
│   ├── inventory-issues.test.ts
│   └── inventory-preview-token.test.ts
├── contract/
│   ├── inventory-workbook.test.ts
│   └── inventory-api-response.test.ts
├── integration/
│   └── inventory-apply.test.ts          # Requiere TEST_DATABASE_URL; se omite sin ella
└── e2e/
    └── admin-bulk-inventory.spec.ts     # Requiere E2E=1
```

**Structure Decision**: Se mantiene la aplicación única Astro y la separación vigente:

- **Páginas y endpoints**: en `src/pages`.
- **Lógica**: un dominio server-only nuevo, `src/server/inventory`, junto a `catalog`, `auth` y `migration`.
- **Funciones puras**: la interpretación del archivo y el cálculo de diferencias son funciones puras (`rows.ts`, `changes.ts`, `issues.ts`), probadas sin base de datos. El acceso a PostgreSQL se concentra en `repository.ts`.
- **Reglas de campo**: se reutilizan de `src/server/validation/catalog.ts`, para que el formulario individual y la carga masiva no diverjan.
- **Interfaz**: componente Astro con script de navegador, como `ProductForm.astro` e `ImageManager.astro`, sin introducir islas React.

## Phase 0: Research Decisions

Las decisiones, alternativas y fuentes están en [research.md](./research.md):

1. Leer con `read-excel-file`, escribir con `write-excel-file` y su complemento de validación, e inspeccionar el zip con `fflate`. Se descartan ExcelJS por falta de mantenimiento, 194 paquetes y avisos heredados, y SheetJS de npm por avisos de severidad alta sin corrección. La prueba aislada confirmó la numeración de filas, las celdas `null`, los textos que no se convierten en fórmulas, los errores de formato y el rendimiento.
2. Libro de tres hojas (Instrucciones, Inventario, Listas) con metadatos visibles, ayudas de validación dentro de Excel y sin protección de hoja.
3. Guardas del archivo antes de leerlo (tamaño, extensión, firma, zip, macros) y validación con los esquemas del formulario individual, más las comprobaciones de celdas vacías y de límites numéricos.
4. Vista previa sin estado en el servidor con un token HMAC ligado a la sesión, de 60 minutos, y confirmación reenviando el mismo archivo.
5. Una transacción con `pg_advisory_xact_lock`, `FOR UPDATE`, línea base y marcador del catálogo, y escrituras por lotes que admiten intercambios de SKU.
6. Sincronizar la secuencia de `legacy_id`, atrasada por la migración desde Strapi, con una migración versionada y un helper compartido.
7. Reglas de comparación y advertencias en funciones puras, y `updated_at` fiable en todas las modificaciones de existencias.
8. Respuestas compactas con incidencias agrupadas por rangos de filas, por debajo del límite de 4,5 MB.
9. Página Astro con script de navegador, comprobaciones antes de subir y gestión de foco y anuncios.
10. Pruebas en cuatro niveles, con archivos de prueba generados en tiempo de ejecución.

No quedan elementos `NEEDS CLARIFICATION`.

## Phase 1: Design Summary

- [data-model.md](./data-model.md): mapeo de columnas del libro a `products` y `product_variants`, invariante de la secuencia, estructuras transitorias (libro, filas, instantánea, conjunto de cambios, incidencias, token y resultado), reglas derivadas, estados de la carga y límite transaccional.
- [contracts/inventory-workbook.md](./contracts/inventory-workbook.md): hojas, columnas fijas y de talla, significado de celdas vacías y del 0, reconocimiento de encabezados, valores aceptados, ayudas de Excel, límites, compatibilidad y ejemplo.
- [contracts/admin-inventory-api.md](./contracts/admin-inventory-api.md): `GET template`, `GET export`, `POST preview` y `POST apply`, con estados HTTP, esquemas `PreviewResponse` y `ApplyResponse`, mensajes de conflicto y catálogo de códigos de incidencia.
- [contracts/bulk-inventory-ui.md](./contracts/bulk-inventory-ui.md): acceso desde productos, doce estados visibles, presentación de la vista previa, reglas de interacción, accesibilidad y móvil.
- [quickstart.md](./quickstart.md): preparación, pruebas unitarias, de contrato, de integración y E2E, validación manual por historia, seguridad, móvil, teclado y compatibilidad con Google Sheets y LibreOffice.

### Notas para la generación de tareas

- **Orden**: primero dependencias, formato y reglas puras (con sus pruebas); luego `repository.ts` y la migración 0002; después endpoints e interfaz; por último la documentación.
- **Documentación que actualizar**:
  - `AGENTS.md`, en “Stack y decisiones vigentes”, con las librerías de hoja de cálculo y la regla de no persistir archivos;
  - la tabla de rutas de `README.md`, con `/admin/productos/carga-masiva`;
  - `docs/documentacion.md`.
- **Ajustes a código existente**:
  - `updateVariantQuantity` actualiza también `products.updated_at`;
  - `createProduct` llama al helper de secuencia.
  - Ambos necesitan prueba propia.
- **MVP**: las historias P1 (1, 2 y 3) se entregan juntas porque comparten el flujo de subida, validación y aplicación. La historia 4, de advertencias, puede añadirse después sin cambiar los contratos, porque los códigos de advertencia ya están definidos.

## Constitution Re-check after Phase 1 Design

- **I. Fuente de verdad**: PASS. El modelo escribe solo en `products` y `product_variants` dentro de una transacción. La disponibilidad derivada es la misma de la vitrina y se muestra antes de confirmar.
- **II. Compra simple**: PASS. Los contratos no modifican rutas públicas, y la vitrina refleja los cambios en la siguiente petición.
- **III. Accesibilidad**: PASS. El contrato de interfaz fija estados, foco, anuncios, áreas táctiles, contraste y diseño a 320 px.
- **IV. Rendimiento y resiliencia**: PASS. Hay límites explícitos de archivo, filas y respuesta, cada fallo tiene su respuesta definida sin cambios parciales, y el rendimiento medido queda muy por debajo de los objetivos.
- **V. Seguridad y calidad**: PASS. Cada endpoint documenta su autorización, los 401 y 403 están cubiertos en pruebas y en el quickstart, el token está ligado a la sesión, no se persisten archivos y existen pruebas de integración para la atomicidad y la concurrencia.
- **Restricciones**: PASS. Hay una migración versionada solo de datos, sin secretos nuevos, sin pagos y con la aplicación Astro única.

No quedan decisiones técnicas abiertas.

## Complexity Tracking

No se registran violaciones de la constitución. Las dependencias nuevas (`read-excel-file`, `write-excel-file`, `@onparallel/write-excel-file-data-validation` y `fflate`) responden a la necesidad explícita de trabajar con archivos de Excel. Su elección frente a alternativas más pesadas o con vulnerabilidades está documentada en [research.md](./research.md), Decision 1.
