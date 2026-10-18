# Tasks: Carga y edición masiva de inventario con plantilla de Excel

**Input**: Design documents from `/specs/003-carga-masiva-inventario/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/inventory-workbook.md](./contracts/inventory-workbook.md), [contracts/admin-inventory-api.md](./contracts/admin-inventory-api.md), [contracts/bulk-inventory-ui.md](./contracts/bulk-inventory-ui.md), [quickstart.md](./quickstart.md)

**Tests**: Se incluyen tareas de pruebas porque la constitución exige verificar antes de publicar las rutas críticas de gestión de productos y existencias, `AGENTS.md` pide pruebas para reglas críticas, y el plan define cuatro niveles de verificación (research.md, Decision 10). En cada fase, las pruebas se escriben antes de la implementación correspondiente y deben comenzar fallando.

**Organization**: Las tareas están agrupadas por historia de usuario. La Fase 2 deja listas las reglas compartidas, de modo que cualquier historia ya valida los datos antes de guardar.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Instalar las dependencias aprobadas y preparar la infraestructura de pruebas, sin tocar todavía el código de la aplicación.

- [X] T001 Agregar en `package.json` las dependencias `read-excel-file` (`^9.3.12`), `write-excel-file` (`^4.1.1`), `fflate` (`^0.8.3`) y `@onparallel/write-excel-file-data-validation`, esta última fijada exactamente en `1.0.2`, sin `^` (research.md, Decision 1). Ejecutar `npm.cmd install` para actualizar `package-lock.json` y confirmar con `npm.cmd audit --omit=dev` que no aparecen vulnerabilidades nuevas.
- [X] T002 [P] Crear `tests/integration/helpers/test-database.ts` con estas funciones:
  - `hasTestDatabase()`: devuelve `false` si no existe `TEST_DATABASE_URL`.
  - Una guarda que lanza un error si el nombre de la base no termina en `_test`.
  - `setupTestDatabase()`: asigna `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL` y aplica las migraciones de `drizzle/` con `migrate` de `drizzle-orm/postgres-js/migrator` sobre `getDb()` de `src/db/client.ts`.
  - `resetCatalog()`: ejecuta `TRUNCATE product_images, product_variants, products RESTART IDENTITY CASCADE`.
  - `seedProduct(input)`: permite un `legacyId` explícito, como la importación de Strapi, además de variantes, imágenes activas o eliminadas y `categoryId`.
  - `teardownTestDatabase()`: llama a `closeDb()`.
- [X] T003 Crear `tests/fixtures/inventory/workbook-builder.ts`, que depende de T001. Usa `write-excel-file/node` con el complemento de validación y ofrece:
  - `buildInventoryBuffer({ header, rows, instructions, extraSheets })`: genera en memoria un `.xlsx` con las hojas `Instrucciones`, `Inventario` y `Listas`.
  - `metadataRows({ kind, generatedAt, version })`: devuelve los pares `Tipo de archivo`, `Generado (UTC)` y `Versión del formato`.
  - Generadores de entradas inválidas con `zipSync` de `fflate`:
    - texto plano;
    - un contenedor OLE que empieza con `D0 CF 11 E0 A1 B1 1A E1`;
    - un zip sin `xl/workbook.xml`;
    - un zip con `xl/vbaProject.bin`;
    - un zip con 201 entradas;
    - un zip truncado.
  - No se versionan archivos `.xlsx` binarios.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Crear el formato del libro, las incidencias, la interpretación de celdas con las reglas del formulario individual, el token de vista previa, la lectura del catálogo y la transacción con bloqueo. Todas las historias usan estas piezas.

**⚠️ CRITICAL**: No comenzar ninguna historia de usuario hasta completar esta fase.

- [X] T004 Crear `src/server/inventory/workbook-format.ts` con estas constantes y funciones:
  - **Hojas**: `Instrucciones`, `Inventario` y `Listas`, en ese orden.
  - **Columnas fijas**, en orden y con su clave: `ID`→`id`, `Tipo`→`type`, `Fabricante`→`manufacturer`, `Marca`→`brand`, `Género`→`gender`, `Precio`→`price`, `SKU`→`sku`, `Color`→`color`, `Publicado`→`isPublished`, `Activo`→`isActive`. “Todas deben existir”.
  - **`parseSizeHeader(header)`**: reconoce `Talla <etiqueta>`; “La etiqueta tiene de 1 a 40 caracteres”.
  - **`normalizeHeader(text)`**: “se recortan espacios, se unen los espacios repetidos y se ignoran mayúsculas y tildes”.
  - **`normalizeSizeKey(label)`**: elimina espacios y pasa a mayúsculas, para comparar tallas “sin distinguir mayúsculas ni espacios”.
  - **Metadatos**: las etiquetas `Tipo de archivo` (valores `Plantilla vacía` o `Inventario actual`), `Generado (UTC)` y `Versión del formato` (`1`).
  - **Límites**:
    - `MAX_FILE_BYTES` = 4 MB;
    - `MAX_REQUEST_BYTES` = 4,5 MB;
    - `MAX_PRODUCT_ROWS` = 5.000;
    - `MAX_UNCOMPRESSED_BYTES` = 50 MB;
    - `MAX_ZIP_ENTRIES` = 200;
    - `PREVIEW_TTL_MS` = 60 minutos;
    - rango de validaciones de las filas 2 a 5001.
  - **Descarga**: el tipo MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y los nombres `plantilla-inventario.xlsx` e `inventario-AAAA-MM-DD.xlsx`, con fecha UTC.
- [X] T005 [P] Escribir `tests/unit/inventory-issues.test.ts`, que debe fallar inicialmente. Debe comprobar:
  - la agrupación por gravedad, código, columna y mensaje, con filas compactadas en rangos (`["4", "9-12"]`) y `count` igual al número de ocurrencias;
  - el orden errores → advertencias → avisos;
  - que las incidencias de archivo completo tienen `column: null` y `rows: []`;
  - que los mensajes coinciden literalmente con las plantillas de `contracts/admin-inventory-api.md`.
- [X] T006 [P] Escribir `tests/unit/inventory-rows.test.ts`, que debe fallar inicialmente. Debe cubrir las reglas por celda de data-model.md:
  - **ID**: “Entero positivo”; un número o texto numérico es válido y `"abc"` da `INVALID_ID`. Vacío significa producto nuevo.
  - **Textos** (Tipo, Fabricante, Marca, Color): “Texto de 1 a 160 caracteres”, con `REQUIRED` o `TOO_LONG`. Una fecha en una columna de texto da `INVALID_TYPE`.
  - **Género**: “`Dama`, `Caballero` o `Unisex`, sin distinguir mayúsculas ni tildes”. `"mujer"` da `INVALID_GENDER`.
  - **Precio**: “≥ 0, como máximo 2 decimales y como máximo 99.999.999,99”.
    - Se aceptan `"45.5"`, `"45,5"` y `49.990000000000002`.
    - `"$50"` da `INVALID_PRICE`.
    - `"1.250"` y `49.999` dan `PRICE_DECIMALS`.
    - `100000000` da `PRICE_TOO_HIGH`.
    - Un precio vacío da `REQUIRED`, no 0.
  - **SKU**: “Hasta 160 caracteres”; un número se convierte a texto y vacío es `null`.
  - **Publicado/Activo**: “`Sí`/`No`, sin distinguir mayúsculas ni tildes; también se aceptan valores booleanos de Excel”. En un producto nuevo, vacío equivale a “No” en Publicado y a “Sí” en Activo. En un producto existente, vacío da `REQUIRED`.
  - **Cantidades**: “Entero entre 0 y 2.147.483.647”. `"7"` es válido; `2.5`, `-1` y `"x"` dan `INVALID_QUANTITY`.
  - **Celda vacía o con error de fórmula** en un campo obligatorio: `REQUIRED`, con el mensaje que menciona “error de fórmula”.
- [X] T007 [P] Escribir `tests/unit/inventory-preview-token.test.ts`, que debe fallar inicialmente. Debe comprobar:
  - que firmar y verificar devuelve `v: 1`, `fileSha256`, `baseline`, `issuedAt` y `expiresAt`;
  - que un contenido alterado o una firma generada con otro `sessionToken` es inválida;
  - que el token vence exactamente con “`expiresAt = issuedAt + 60 min`”, usando un reloj inyectable;
  - que la comparación de firmas no lanza errores con entradas de distinta longitud.
- [X] T008 Implementar `src/server/inventory/issues.ts`. Depende de T004.
  - Tipos `IssueSeverity` (`error | warning | notice`), `IssueCode` (todos los códigos de incidencia y los códigos `FILE_*` de rechazo de `contracts/admin-inventory-api.md`) y `ValidationIssue`.
  - Constructores de mensajes con las plantillas exactas del contrato.
  - `groupIssues(issues)`: agrupa y compacta filas en rangos.
  - `countIssues(issues)`: cuenta errores y advertencias por ocurrencias.
- [X] T009 Implementar `src/server/inventory/rows.ts`. Depende de T004 y T008.
  - `parseInventoryRow(cells, columns, excelRow)` produce un `ParsedProductRow` con `excelRow`, `legacyId` (`null` si es nuevo), `values` (precio como texto con 2 decimales, como `"50.00"`), `sizes` (mapa `sizeKey → { label, quantity: entero | null }`) e `issues`, según T006.
  - Reutiliza `productInputSchema.shape` (`legacyTypeLabel`, `manufacturer`, `brand`, `color`, `sku`) y `variantInputSchema.shape.quantity` de `src/server/validation/catalog.ts`.
  - Antes de aplicar esos esquemas, trata como vacías las celdas vacías, porque `z.coerce.number()` convierte `""` en 0, y aplica los límites de decimales y de máximo.
- [X] T010 [P] Implementar `src/server/inventory/preview-token.ts`. Depende de T004.
  - `signPreviewToken(payload, sessionToken, now)` y `verifyPreviewToken(token, sessionToken, now)`; la verificación devuelve `{ ok: true, payload }` o `{ ok: false, reason: "invalid" | "expired" }`.
  - El contenido se codifica en base64url y se firma con HMAC-SHA256 (`createHmac` de `node:crypto`). La clave es “`sha256(sessionToken + "|inventory-preview")`”.
  - La firma se compara con `timingSafeEqual`.
- [X] T011 [P] Crear `tests/unit/inventory-fixtures.ts`, usando `import type` desde `src/server/inventory/changes.ts`. Es una fábrica determinista de `CatalogSnapshot` que incluye:
  - un producto publicado con 2 imágenes y tallas `S`, `M` y `L`;
  - uno publicado sin imágenes;
  - uno no publicado;
  - uno inactivo;
  - uno con SKU `BAT-001`;
  - uno con tallas ambiguas `M` y `m`;
  - etiquetas `XS`, `XXL`, `2XL` y `Única`;
  - valores `updatedAt` controlados y el marcador `{ productCount, maxLegacyId }`.
- [X] T012 [P] Añadir en `tests/unit/inventory-changes.test.ts` un bloque `describe("fundamentos")`, que debe fallar inicialmente, para:
  - **`computeBaseline`**:
    - es estable aunque cambie el orden de entrada;
    - cambia si cambia un campo o una talla de un producto referenciado, o si cambian `productCount` o `maxLegacyId`;
    - no cambia si se edita un producto no referenciado.
  - **`buildCanonicalSizes`**: “se elige la escritura más usada en el catálogo; en caso de empate, la que va primero según `compareSizeLabels`”.
  - **`isAvailable`**: publicado, activo y alguna talla con cantidad > 0.
  - **`productLabel`**: produce “`Tipo · Marca · Color · Género`”.
- [X] T013 Implementar los fundamentos de `src/server/inventory/changes.ts`. Depende de T004.
  - Tipos `CatalogSnapshot`, `SnapshotProduct`, `ProductChange`, `InventoryChangeSet` y `ChangeSetStatus` (`ready | invalid | no_changes`), según data-model.md.
  - Funciones `buildCanonicalSizes`, `isAvailable`, `productLabel` y `formatDisplayValue` (precio con dos decimales, “Sí”/“No”).
  - `computeBaseline(snapshot, referencedLegacyIds)`: hash SHA-256 del JSON canónico “`["v1", productCount, maxLegacyId, [[legacyId, tipo, fabricante, marca, género, precio, sku, color, publicado, activo, [[talla, cantidad], …]], …]]`”, con productos ordenados por `legacyId` y tallas por etiqueta.
  - Debe pasar T012.
- [X] T014 Implementar el lado de lectura y el bloqueo de `src/server/inventory/repository.ts`. Depende de T013.
  - **`loadCatalogSnapshot(source: DbOrTransaction)`**: lee todos los productos con sus variantes y el número de imágenes activas (`deleted_at IS NULL`), y calcula `distinctValues` con `normalizeAdminProductFilterValues`, `skuOwners` y el marcador del catálogo.
  - **`withInventoryLock({ referencedLegacyIds, lockTimeoutMs = 10000 }, callback)`**: dentro de `withTransaction`, en este orden:
    1. `SET LOCAL lock_timeout`;
    2. `SELECT pg_advisory_xact_lock(<clave fija>)`;
    3. `SELECT … FOR UPDATE` sobre los productos con esos `legacy_id` y sus variantes;
    4. cargar la instantánea dentro de la transacción;
    5. invocar `callback(tx, snapshot)`.

**Checkpoint**: Las reglas puras, el token, las incidencias y la transacción con bloqueo están listos y probados. Todavía no hay endpoints, pantalla ni escrituras en el catálogo.

---

## Phase 3: User Story 1 - Actualizar el inventario existente desde un archivo de Excel (Priority: P1) 🎯 MVP

**Goal**: La propietaria descarga el inventario actual, cambia existencias, precios y demás datos, agrega tallas a productos existentes y aplica todo en una sola operación después de revisar la vista previa.

**Independent Test**: Con productos ya registrados:

1. Descargar el inventario.
2. Cambiar las cantidades de varias tallas y el precio de un producto, y escribir una cantidad en una talla que un producto no tenía.
3. Subir el archivo y revisar el valor actual y el nuevo en la vista previa.
4. Confirmar y comprobar los cambios en `/admin/productos` y en la vitrina.
5. Subir otra vez el mismo archivo: debe indicar que no hay cambios.

### Tests for User Story 1

- [X] T015 [P] [US1] Añadir en `tests/unit/inventory-changes.test.ts` el bloque `describe("ediciones")`, que debe fallar inicialmente:
  - **Campos**: solo aparecen los que cambian. Los textos se comparan exactos tras recortar espacios, y un cambio de mayúsculas cuenta como cambio. El precio se compara con 2 decimales.
  - **Tallas**:
    - “m” se empareja con la talla “M” del producto;
    - una cantidad en una talla que el producto no tiene la crea con la etiqueta resuelta según la regla de `size_label` de data-model.md;
    - una celda vacía en una talla que el producto no tiene no cambia nada;
    - una columna ausente no cambia nada;
    - una celda vacía en una talla existente da `EXISTING_SIZE_BLANK`;
    - un producto con `M` y `m` da `AMBIGUOUS_SIZES`.
  - **ID**: un ID inexistente da `UNKNOWN_ID`, y un ID repetido da `DUPLICATE_ID` en todas sus filas.
  - **SKU**:
    - `SKU_IN_USE` y `SKU_REPEATED` se evalúan sobre el resultado final;
    - el intercambio de SKU entre dos filas es válido;
    - un SKU vacío produce `null`.
  - **Resultado**:
    - conteos `updatedProducts`, `unchangedProducts`, `newSizes` y `changedStocks`;
    - `availability.from` y `availability.to`;
    - estados `ready`, `no_changes` e `invalid`;
    - nunca hay eliminaciones;
    - aplicar el estado resultante a la instantánea y volver a comparar no produce cambios (SC-006).
- [X] T016 [P] [US1] Escribir `tests/contract/inventory-workbook.test.ts` para la exportación, generando el libro con `buildInventoryWorkbook({ kind: "inventario", snapshot, generatedAt })` y leyéndolo con `read-excel-file/node`. Debe comprobar:
  - **Hojas y metadatos**: las hojas `Instrucciones`, `Inventario` y `Listas`, en orden; los metadatos `Tipo de archivo` = `Inventario actual`, `Generado (UTC)` en ISO 8601 y `Versión del formato` = `1`.
  - **Encabezado**: las columnas fijas y después `Talla …`, en el orden de `compareSizeLabels`.
  - **Filas**:
    - una por producto, incluidos los no publicados e inactivos, ordenadas por Tipo, Marca, Color, Género e ID;
    - el ID es el `legacy_id`;
    - Publicado y Activo como “Sí”/“No”;
    - celdas vacías en las tallas que el producto no usa y `0` en las existentes sin existencias;
    - “Unificar tallas” en el producto ambiguo.
  - **XML de `xl/worksheets/sheet2.xml`**, inspeccionado con `fflate`:
    - un texto que empieza con `=` no genera elementos `<f>`;
    - `<dataValidations>` incluye la lista `Dama,Caballero,Unisex` (`stop`), `Sí,No` en Publicado y Activo, entero ≥ 0 en las tallas, decimal ≥ 0 en el precio y listas `information` hacia `Listas` en Tipo, Fabricante, Marca y Color, en las filas 2–5001.
  - **Errores de estructura** con `buildInventoryBuffer`:
    - falta la hoja `Inventario` (`SHEET_NOT_FOUND`, con la lista de hojas);
    - columna “Color” renombrada (`MISSING_COLUMNS`);
    - “Precio” duplicada (`DUPLICATE_COLUMN`);
    - `Talla` sin etiqueta (`INVALID_SIZE_COLUMN`);
    - `Talla m` junto a `Talla M` (`DUPLICATE_COLUMN`);
    - solo encabezado (`NO_PRODUCTS`);
    - 5.001 filas (`TOO_MANY_PRODUCTS`);
    - columna desconocida (aviso `IGNORED_COLUMNS`);
    - sin metadatos (aviso `MISSING_METADATA`).
  - **Encabezados y filas**: se reconocen encabezados reordenados y con otra capitalización, y el número de fila de cada error coincide con la fila de Excel aunque haya filas vacías intermedias.
- [X] T017 [P] [US1] Escribir `tests/contract/inventory-api-response.test.ts` con esquemas Zod equivalentes a `PreviewResponse` y `ApplyResponse` de `contracts/admin-inventory-api.md`.
  - **`toPreviewResponse`**, para conjuntos de cambios de edición:
    - con `ready` incluye `preview.token` y `expiresAt`; con `invalid` o `no_changes`, `preview` es `null`;
    - `fields[].from` y `to` vienen listos para mostrar (`"55.00"`, “Sí”/“No”);
    - `rows` contiene rangos de texto;
    - `changes` excluye los productos sin cambios.
  - **`toApplyResponse`**: incluye `updated` con `editUrl` = `/admin/productos/<documentId>`.
- [X] T018 [P] [US1] Escribir `tests/integration/inventory-apply.test.ts`, que se omite sin `TEST_DATABASE_URL` y usa el helper de T002. En el bloque `describe("ediciones")`:
  1. Sembrar productos.
  2. Generar la exportación con `buildInventoryExport()` y modificar con `buildInventoryBuffer` cantidades, un precio y una talla nueva de un producto existente.
  3. `previewInventoryFile` debe devolver `ready` con token; `applyInventoryFile` debe dejar en PostgreSQL los nuevos valores y variantes.
  4. Verificar en la base:
     - `updated_at` se actualiza en cada producto cambiado, “incluso si solo cambian existencias”;
     - `category_id`, `source_*`, `legacy_document_id` e imágenes no cambian;
     - no se elimina ninguna fila;
     - una nueva vista previa del mismo archivo devuelve `no_changes` (SC-006).
- [X] T019 [P] [US1] Escribir `tests/e2e/admin-bulk-inventory.spec.ts`, que se omite sin `E2E` igual que `tests/e2e/admin.spec.ts`:
  1. Iniciar sesión.
  2. Comprobar que `/admin/productos` muestra el enlace “Carga masiva” (FR-002).
  3. En `/admin/productos/carga-masiva`, pulsar “Descargar inventario actual” y comprobar con `page.waitForEvent("download")` el nombre `inventario-*.xlsx`.
  4. Leer la descarga con `read-excel-file`, cambiar una cantidad y generar un nuevo archivo con el builder.
  5. Subirlo con `setInputFiles` y pulsar “Validar archivo”: la vista previa muestra “→” en el cambio.
  6. Confirmar: aparece “Cambios aplicados”.
  7. En el proyecto `mobile`, verificar que `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

### Implementation for User Story 1

- [X] T020 [P] [US1] Implementar `src/server/inventory/workbook-writer.ts` con `buildInventoryWorkbook({ kind: "inventario", snapshot, generatedAt })`, usando `write-excel-file/node` con varias hojas (`[{ data, sheet, ... }]`) y `features: [dataValidation]`.
  - **Instrucciones**: pasos, significado de cada columna, reglas de celda vacía y 0, límites, lista de productos con tallas ambiguas y metadatos etiqueta/valor.
  - **Inventario**:
    - encabezado en la fila 1 con `stickyRowsCount: 1`;
    - una fila por producto en el orden de T016;
    - ID en gris con el mensaje de ayuda “No modifiques este valor”;
    - formato `@` en los textos y en SKU;
    - precio numérico y tallas en el orden de `compareSizeLabels`, usando `buildCanonicalSizes`;
    - las validaciones de `contracts/inventory-workbook.md` para las filas 2–5001.
  - **Listas**: tipos, fabricantes, marcas, colores y tallas.
  - Debe pasar la parte de exportación de T016.
- [X] T021 [P] [US1] Implementar `src/server/inventory/workbook-reader.ts` con `readInventoryWorkbook({ fileName, bytes })`. Devuelve `{ workbook, columns, rows, issues }`, donde `workbook` incluye `sha256`, `kind`, `generatedAt`, `formatVersion` e `ignoredColumns`.
  - **Rechazos**: lanza `InventoryFileError` con código `FILE_REQUIRED`, `FILE_TOO_LARGE` o `FILE_NOT_XLSX` cuando el tamaño no está “Entre 1 byte y 4 MB”, la extensión no es `.xlsx` o el archivo no empieza con la firma zip `PK`.
  - **Lectura**: usa `readExcelFile` de `read-excel-file/node`.
  - **Hoja `Inventario`**:
    - el encabezado es la primera fila no vacía, mapeada con `normalizeHeader` y `parseSizeHeader`;
    - devuelve las incidencias de archivo de T016;
    - ignora las filas vacías;
    - `excelRow` es el índice + 1.
  - **Metadatos**: los lee de `Instrucciones` buscando la etiqueta, no la posición.
- [X] T022 [P] [US1] Implementar en `src/server/inventory/changes.ts` la función `buildChangeSet({ rows, workbook, snapshot })` para filas con ID, según T015 y las reglas 1 a 6 de data-model.md. Comprende identificación, celdas vacías, emparejamiento de tallas, SKU sobre el resultado final, comparación, disponibilidad, conteos, estado y `baseline` con los IDs referenciados.
- [X] T023 [P] [US1] Implementar en `src/server/inventory/repository.ts` la función `applyProductUpdates(tx, updates, now)`:
  1. Poner a `NULL` el SKU de los productos cuyo SKU cambia.
  2. Actualizar por lotes de hasta 1.000 filas los productos con cambios, con valores distintos por fila (guía de Drizzle “update many with different value” o `UPDATE … FROM (VALUES …)` con `sql`), asignando `updated_at = now` en cada producto cambiado.
  3. Insertar o actualizar variantes con `INSERT … ON CONFLICT (product_id, size_label) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`.
  - Nunca ejecutar `DELETE`. Nunca modificar `category_id`, `source_*`, `legacy_document_id` ni imágenes, porque “La carga masiva nunca los modifica”.
- [X] T024 [US1] Implementar `src/server/inventory/service.ts`. Depende de T010 y T020–T023.
  - **`buildInventoryExport(now)`**: devuelve `{ fileName, bytes }`.
  - **`previewInventoryFile({ fileName, bytes, sessionToken, now })`**:
    1. leer el archivo, interpretar las filas, cargar la instantánea y calcular el conjunto de cambios;
    2. si el estado es `ready`, firmar el token `{ v: 1, fileSha256, baseline, issuedAt, expiresAt }`;
    3. devolver `toPreviewResponse`.
  - **`applyInventoryFile({ fileName, bytes, previewToken, sessionToken, now, lockTimeoutMs })`**:
    1. verificar el token. Si es inválido: `HttpError` 409 `CONFLICT` con `fields.previewToken` “La vista previa no es válida. Valida el archivo de nuevo.” Si venció: “La vista previa venció. Valida el archivo de nuevo.”
    2. comparar el hash del archivo. Si difiere: 409 con `fields.file` “El archivo no coincide con el de la vista previa.”
    3. dentro de `withInventoryLock`, recalcular la línea base y el conjunto de cambios. Si la línea base difiere o aparecen errores: 409 “El inventario cambió desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”
    4. ejecutar `applyProductUpdates` y devolver `toApplyResponse`, con `summary` y `updated`.
  - **Registros**: solo códigos, conteos y duración, nunca valores de celdas.
- [X] T025 [P] [US1] Crear `src/pages/api/admin/inventory/export.ts`. Depende de T024.
  - `GET` con `requireOwner`.
  - Devuelve un `Response` binario con `Content-Type` XLSX, `Content-Disposition: attachment; filename="inventario-AAAA-MM-DD.xlsx"`, `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.
  - Los errores se devuelven con `errorResponse`.
- [X] T026 [P] [US1] Crear `src/pages/api/admin/inventory/preview.ts` y `src/pages/api/admin/inventory/apply.ts`. Dependen de T024.
  - `POST` con `requireMutation`, que lee `x-csrf-token`, y `request.formData()`.
  - Si `file` no es un `File`, responder 422 `VALIDATION_ERROR` con `fields.file` “Selecciona un archivo de Excel (.xlsx).”
  - `apply` exige además `previewToken`.
  - El token de sesión se obtiene con `getSessionToken(request)`.
  - `InventoryFileError` se convierte en 422 con el mensaje de `contracts/admin-inventory-api.md` en `fields.file`.
  - Las respuestas se envían con `jsonOk`.
- [X] T027 [P] [US1] Crear `src/components/admin/BulkInventoryUpload.astro` (markup y script de navegador) con los estados de `contracts/bulk-inventory-ui.md` que usa esta historia: `inicial`, `validando`, `con_errores`, `sin_cambios`, `lista`, `aplicando` y `aplicada`.
  - **Descarga**: enlace “Descargar inventario actual” a `/api/admin/inventory/export`.
  - **Selector**: `accept=".xlsx"`, con los límites asociados mediante `aria-describedby`.
  - **Validar**: “Validar archivo” envía `multipart` con `x-csrf-token` a `/api/admin/inventory/preview`.
  - **Vista previa**:
    - resumen de siete contadores;
    - incidencias agrupadas con columna, motivo y filas (“Filas 9–12 y 20”);
    - tarjetas de cambios: “Fila N · ID n · etiqueta”, “Precio: $50.00 → $55.00”, “M: 5 → 8”, “4XL: nueva → 2” y la disponibilidad resultante;
    - secciones `<details>` con bloques de 50 y “Mostrar más”.
  - **Confirmar**: “Confirmar y aplicar cambios” reenvía el mismo `File` con `previewToken` a `/api/admin/inventory/apply`.
  - **Resultado**: resumen, lista de productos actualizados con enlace, “Ver productos” y “Hacer otra carga”.
  - **Sin servidor**: “Cancelar” limpia la vista previa sin llamar al servidor, y cambiar de archivo descarta la vista previa.
  - **Accesibilidad**: región `role="status"` / `aria-live="polite"`, foco al encabezado de la vista previa y del resultado, botones de al menos 44 px.
  - **Errores**: ante una respuesta no 200, se muestra `error.message`.
- [X] T028 [US1] Crear `src/pages/admin/productos/carga-masiva.astro`. Depende de T027. Usa `src/pages/admin/layout.astro` con el título “Carga masiva”, muestra el enlace “← Volver a productos” y el encabezado “Carga masiva de inventario”, y renderiza `BulkInventoryUpload` con `Astro.locals.csrfToken`.
- [X] T029 [P] [US1] Modificar `src/pages/admin/productos/index.astro` para mostrar, junto a “Nuevo producto”, el enlace secundario “Carga masiva” hacia `/admin/productos/carga-masiva` (FR-002), conservando el diseño adaptable de la cabecera.

**Checkpoint**: La propietaria puede editar en bloque productos existentes, revisar cada diferencia y aplicarla de forma atómica. Volver a aplicar el mismo archivo no cambia nada.

---

## Phase 4: User Story 2 - Dar de alta productos nuevos en bloque con la plantilla (Priority: P1)

**Goal**: La propietaria descarga la plantilla vacía, registra varios productos nuevos (uno por fila, con la cantidad de cada talla) y los crea todos a la vez, con enlaces para agregar sus fotos.

**Independent Test**:

1. Descargar la plantilla vacía y registrar tres productos nuevos, uno con “Publicado” vacío y otro con la columna nueva “Talla 4XL”.
2. Subirla y comprobar en la vista previa los conteos de productos, tallas y unidades.
3. Confirmar y verificar en el panel los tres productos con identificador, URL pública, tallas y existencias. El de “Publicado” vacío debe quedar no publicado.

### Tests for User Story 2

- [X] T030 [P] [US2] Añadir en `tests/unit/inventory-changes.test.ts` el bloque `describe("altas")`, que debe fallar inicialmente:
  - una fila sin ID es una alta, con “Vacía equivale a `No`” en Publicado y “Vacía equivale a `Sí`” en Activo;
  - los campos obligatorios se exigen;
  - solo se crean las tallas con cantidad, con la etiqueta canónica del catálogo si existe una equivalente o, si no, la del encabezado;
  - un SKU que ya existe en el catálogo da `SKU_IN_USE`, y uno repetido entre altas o entre altas y ediciones da `SKU_REPEATED`;
  - se calculan los conteos `newProducts` y `newSizes`;
  - un archivo mixto distingue `create` de `update`.
- [X] T031 [P] [US2] Añadir en `tests/contract/inventory-workbook.test.ts` el bloque de la plantilla: `buildInventoryWorkbook({ kind: "plantilla", snapshot, generatedAt })` produce `Tipo de archivo` = `Plantilla vacía`, una hoja `Inventario` con solo el encabezado (columnas fijas y una `Talla …` por talla del catálogo), las mismas validaciones en las filas 2–5001 y `Listas` con los valores existentes.
- [X] T032 [P] [US2] Añadir en `tests/integration/inventory-apply.test.ts` el bloque `describe("altas y secuencia")`:
  - **Secuencia atrasada**: sembrar productos con `legacy_id` explícito del 1 al N, como la importación de Strapi. Después de la vista previa y la aplicación de un archivo con 3 altas no hay colisión en `products_legacy_id_unique`:
    - los nuevos `legacy_id` son mayores que `MAX(legacy_id)`;
    - `legacy_document_id` tiene formato UUID;
    - las variantes se crean con `legacy_id` `NULL`;
    - “Publicado” vacío queda en `is_published = false`.
  - **`createProduct`** de `src/server/catalog/admin-products.ts` también funciona con la secuencia atrasada.
  - **Migración 0002**: ejecutar su SQL sobre un estado atrasado deja `last_value ≥ MAX(legacy_id)`, y ejecutarlo de nuevo no hace retroceder la secuencia.
- [X] T033 [P] [US2] Añadir en `tests/e2e/admin-bulk-inventory.spec.ts` el escenario de altas:
  1. “Descargar plantilla vacía” descarga `plantilla-inventario.xlsx`.
  2. Generar un archivo con dos productos nuevos, uno con “Talla 4XL”, y subirlo: aparece “Productos nuevos (2)”.
  3. Confirmar: el resultado lista los dos productos creados, y su enlace “Agregar fotos” abre `/admin/productos/<documentId>`.

### Implementation for User Story 2

- [X] T034 [P] [US2] Crear `drizzle/0002_sync_product_legacy_id_sequence.sql`, escrita a mano como `0001_initial_catalog.sql`, sin cambios de esquema.
  - El SQL ejecuta `setval(pg_get_serial_sequence('products', 'legacy_id'), …)` con el mayor valor entre `COALESCE(MAX(legacy_id), 0)`, el `last_value` actual de la secuencia y `1`, de modo que “nunca la retrocede”.
  - Agregar en `drizzle/meta/_journal.json` la entrada `{ "idx": 1, "version": "7", "when": 1792195200000, "tag": "0002_sync_product_legacy_id_sequence", "breakpoints": true }`. El valor `when` debe ser mayor que el `1769904000000` de 0001.
- [X] T035 [P] [US2] Exportar en `src/server/catalog/admin-products.ts` la función `ensureProductLegacyIdSequence(transaction)`, que ejecuta dentro de la transacción la misma sentencia idempotente de T034, y llamarla en `createProduct` antes de insertar. Invariante: “el siguiente valor generado debe ser mayor que `MAX(legacy_id)`”.
- [X] T036 [P] [US2] Extender `src/server/inventory/workbook-writer.ts` con `kind: "plantilla"`:
  - `Tipo de archivo` = `Plantilla vacía`;
  - `Inventario` con solo el encabezado: columnas fijas y una `Talla …` por talla del catálogo;
  - las mismas validaciones y `Listas`;
  - instrucciones que expliquen “Fila sin ID = producto nuevo”, Publicado vacío = No y Activo vacío = Sí.
- [X] T037 [P] [US2] Extender `buildChangeSet` en `src/server/inventory/changes.ts` para las filas sin ID (acción `create`), según T030:
  - valores por defecto de Publicado y Activo;
  - tallas con cantidad y etiqueta resuelta según la regla de `size_label` de data-model.md;
  - SKU evaluado contra el catálogo y contra las demás filas sobre el resultado final;
  - conteos `newProducts` y `newSizes`.
- [X] T038 [US2] Implementar en `src/server/inventory/repository.ts` la función `insertNewProducts(tx, creates, now)`. Depende de T035.
  1. Llamar a `ensureProductLegacyIdSequence(tx)`.
  2. Insertar productos por lotes de hasta 1.000 con `legacyDocumentId: crypto.randomUUID()` (“`crypto.randomUUID()`, igual que `createProduct`”), los campos del archivo y `categoryId: null`, con `RETURNING id, legacy_id, legacy_document_id`, conservando el orden de fila.
  3. Insertar las variantes por lotes con `legacyId: null`.
- [X] T039 [US2] Extender `src/server/inventory/service.ts`. Depende de T036–T038.
  - Agregar `buildInventoryTemplate(now)`.
  - En `applyInventoryFile`, ejecutar `insertNewProducts` después de `applyProductUpdates`, dentro de la misma transacción.
  - Completar `toApplyResponse` con `created` (`id`, `documentId`, `label`, `editUrl`).
- [X] T040 [P] [US2] Crear `src/pages/api/admin/inventory/template.ts`. Depende de T039. `GET` con `requireOwner`, con las mismas cabeceras que la exportación y `filename="plantilla-inventario.xlsx"`.
- [X] T041 [P] [US2] Extender `src/components/admin/BulkInventoryUpload.astro` con:
  - el botón “Descargar plantilla vacía” hacia `/api/admin/inventory/template`, con su línea explicativa;
  - la sección “Productos nuevos (N)” en la vista previa, con tarjetas que muestran “Nuevo” en lugar del ID, los valores y las tallas;
  - en el resultado, la lista de productos creados con un enlace “Agregar fotos” por producto (`editUrl`).

**Checkpoint**: La plantilla vacía permite crear productos en bloque sin chocar con los identificadores migrados, y un mismo archivo puede combinar altas y ediciones.

---

## Phase 5: User Story 3 - Corregir errores del archivo sin afectar el inventario (Priority: P1)

**Goal**: Todo archivo inválido, toda confirmación vencida o en conflicto y toda falla deja el inventario intacto, con mensajes que indican qué corregir o cómo continuar.

**Independent Test**:

1. Subir un archivo con errores deliberados: cantidad negativa, precio con texto, género no permitido, identificador inexistente y una talla existente vaciada. Deben listarse todos con fila, columna y motivo, la confirmación debe quedar deshabilitada y ningún dato debe cambiar.
2. Subir archivos `.xls`, `.xlsm`, protegidos o de más de 4 MB: deben rechazarse con su mensaje.
3. Una confirmación vencida, duplicada o con el inventario cambiado no debe aplicar nada.

### Tests for User Story 3

- [X] T042 [P] [US3] Añadir en `tests/contract/inventory-workbook.test.ts` el bloque de rechazos, usando los generadores de T003. Cada caso debe producir `InventoryFileError` con el código y el mensaje exactos de `contracts/admin-inventory-api.md`:
  - contenedor OLE → `FILE_PROTECTED_OR_XLS`;
  - texto plano, zip sin `xl/workbook.xml` o un `.xlsx` con extensión `.csv` → `FILE_NOT_XLSX`;
  - zip con `xl/vbaProject.bin` → `FILE_HAS_MACROS`;
  - 201 entradas, tamaño declarado mayor de 50 MB o zip truncado → `FILE_UNREADABLE`;
  - más de 4 MB → `FILE_TOO_LARGE`;
  - 0 bytes → `FILE_REQUIRED`.
- [X] T043 [P] [US3] Añadir en `tests/integration/inventory-apply.test.ts` el bloque `describe("atomicidad y concurrencia")`:
  - **Atomicidad**: un fallo provocado en `insertNewProducts` (con `vi.spyOn`) después de las ediciones deja productos y variantes exactamente como antes (SC-005).
  - **Doble envío**: dos `applyInventoryFile` simultáneos con el mismo token y archivo terminan con un resultado aplicado y un 409.
  - **Producto editado**: un `updateProduct` sobre un producto referenciado entre la vista previa y la confirmación da 409 “El inventario cambió…” sin cambios.
  - **Producto creado**: crear un producto entre la vista previa y la confirmación de un archivo que solo tiene altas da 409, por el marcador del catálogo.
  - **SKU**: un SKU tomado por otro producto entre ambos pasos da 409.
  - **Bloqueo**: otra conexión que retiene el bloqueo consultivo con `lockTimeoutMs` corto da 409 “Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.”
- [X] T044 [P] [US3] Añadir en `tests/e2e/admin-bulk-inventory.spec.ts` los escenarios de error y seguridad:
  - un archivo con errores muestra la alerta con filas y columnas, y la confirmación no está disponible;
  - elegir un `.csv` o un archivo de más de 4 MB muestra el mensaje local sin enviar ninguna petición, comprobado con `page.on("request")`;
  - con un `request` sin sesión, `GET /api/admin/inventory/export` y `POST /api/admin/inventory/preview` responden 401;
  - con sesión iniciada pero sin `x-csrf-token`, `POST /api/admin/inventory/preview` responde 403 (SC-008).
- [X] T045 [P] [US3] Añadir en `tests/unit/inventory-changes.test.ts` el bloque `describe("catálogo de errores")`. Un único libro generado con `buildInventoryBuffer`, procesado por `readInventoryWorkbook`, `parseInventoryRow` y `buildChangeSet` sobre la instantánea de prueba, debe producir cada código de error de fila de `contracts/admin-inventory-api.md`, con `rows` no vacío y la `column` esperada (SC-004).

### Implementation for User Story 3

- [X] T046 [P] [US3] Endurecer `src/server/inventory/workbook-reader.ts`:
  - la firma OLE `D0 CF 11 E0 A1 B1 1A E1` da `FILE_PROTECTED_OR_XLS`;
  - inspeccionar con `unzipSync(bytes, { filter })` de `fflate`, devolviendo `false` en el filtro para no descomprimir:
    - más de 200 entradas o más de 50 MB sumando `originalSize` → `FILE_UNREADABLE`;
    - sin `xl/workbook.xml` → `FILE_NOT_XLSX`;
    - con `xl/vbaProject.bin` → `FILE_HAS_MACROS`;
  - convertir los errores de `read-excel-file`: `InvalidInputError` con código `XLS_FILE_NOT_SUPPORTED` → `FILE_PROTECTED_OR_XLS`; `FILE_NOT_SUPPORTED` → `FILE_NOT_XLSX`; `InvalidSpreadsheetError` y cualquier otro → `FILE_UNREADABLE`.
- [X] T047 [P] [US3] Completar en `src/server/inventory/service.ts` la conversión de errores de `applyInventoryFile`:
  - código PostgreSQL `55P03` (`lock_not_available`) → 409 “Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.”;
  - `23505` (violación de unicidad) → 409 “El inventario cambió desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”;
  - cualquier otro error durante la transacción → `HttpError` 500 `DATABASE_ERROR` “No se aplicó ningún cambio. Inténtalo de nuevo.”, sin trazas ni valores de celdas;
  - propagar `lockTimeoutMs` a `withInventoryLock`.
- [X] T048 [P] [US3] Agregar en `src/pages/api/admin/inventory/preview.ts` y `src/pages/api/admin/inventory/apply.ts` el rechazo previo a leer el cuerpo cuando `Content-Length` supera 4,5 MB (`MAX_REQUEST_BYTES`): 422 con `fields.file` “El archivo supera 4 MB. Divide el inventario en varios archivos.”
- [X] T049 [P] [US3] Extender `src/components/admin/BulkInventoryUpload.astro` con los estados `archivo_no_admitido`, `rechazado`, `con_errores`, `no_aplicada`, `fallo` y `sesion_caducada` de `contracts/bulk-inventory-ui.md`:
  - **Antes de subir**: comprobar la extensión `.xlsx` y el tamaño de 4 MB en el navegador, sin enviar la petición.
  - **`rechazado`** (422): mensaje y acceso a “Descargar plantilla”.
  - **`con_errores`**: alerta `role="alert"` con “Corrige N errores y vuelve a subir el archivo”, el foco en la alerta y la confirmación oculta o deshabilitada.
  - **`no_aplicada`** (409): mensaje y “Validar de nuevo”, que reenvía el mismo `File` a la vista previa. La confirmación no se reintenta de forma automática.
  - **`fallo`** (error de red o 500): “No se aplicó ningún cambio. Inténtalo de nuevo.”, con la opción de reintentar la última acción.
  - **`sesion_caducada`** (401): enlace a `/admin/login`.
  - **Vencimiento**: un temporizador deshabilita la confirmación al llegar a `expiresAt` y muestra “La vista previa venció; valida el archivo de nuevo.”
  - **Una petición a la vez**: un segundo clic no genera otra petición.

**Checkpoint**: Ningún error, conflicto, vencimiento ni falla modifica datos, y cada caso indica cómo continuar. Las tres historias P1 quedan listas para publicarse juntas.

---

## Phase 6: User Story 4 - Revisar advertencias antes de confirmar (Priority: P2)

**Goal**: La vista previa advierte de valores nuevos, posibles duplicados, productos que quedarán publicados sin fotos o sin existencias, cambios de disponibilidad y productos modificados después de la descarga, sin impedir la confirmación.

**Independent Test**: Subir un archivo válido con una marca nueva, un producto nuevo idéntico a uno existente, un producto publicado sin fotografías y un producto cuyas existencias pasan a cero. Debe aparecer una advertencia por caso y la confirmación debe seguir habilitada.

### Tests for User Story 4

- [X] T050 [P] [US4] Añadir en `tests/unit/inventory-changes.test.ts` el bloque `describe("advertencias")`, que debe fallar inicialmente. Debe cubrir cada regla 7 de data-model.md:
  - `NEW_VALUE`: comparado sin distinguir mayúsculas ni tildes, de modo que “azul marino” frente a “Azul Marino” no advierte.
  - `NEW_SIZE`: una vez por etiqueta nueva.
  - `POSSIBLE_DUPLICATE`: contra un producto existente y dentro del archivo.
  - `PUBLISHED_WITHOUT_IMAGES`: solo si el producto queda publicado y activo sin imágenes activas, y es nuevo o su publicación o actividad pasa a “Sí”.
  - `PUBLISHED_WITHOUT_STOCK`.
  - `BECOMES_AVAILABLE` y `BECOMES_UNAVAILABLE`.
  - `MODIFIED_AFTER_DOWNLOAD`: solo con `generatedAt`, con cambios y con `updatedAt` posterior.
  - Además: no hay advertencias en productos sin cambios, y las advertencias no alteran el estado `ready`.
- [X] T051 [P] [US4] Añadir en `tests/integration/inventory-apply.test.ts` el bloque `describe("updated_at fiable")`:
  - `updateVariantQuantity` de `src/server/catalog/admin-variants.ts` actualiza `products.updated_at` del producto padre;
  - una exportación generada antes de ese cambio produce `MODIFIED_AFTER_DOWNLOAD` en la vista previa.

### Implementation for User Story 4

- [X] T052 [US4] Implementar en `src/server/inventory/changes.ts` las advertencias de T050 según la regla 7 de data-model.md. Se agregan a `ProductChange.warnings` y como incidencias de gravedad `warning`, con filas y columna, sin cambiar `status`.
- [X] T053 [P] [US4] Modificar `updateVariantQuantity` en `src/server/catalog/admin-variants.ts` para que, dentro de `withTransaction`, actualice la variante y además `products.updated_at` de su producto, conservando el 404 cuando la talla no pertenece al producto.
- [X] T054 [P] [US4] Extender `src/components/admin/BulkInventoryUpload.astro` con:
  - la sección de advertencias después de los errores, con una explicación por código;
  - etiquetas en las tarjetas de cambio: “Sin fotos”, “Sin existencias”, “Pasará a estar disponible”, “Dejará de estar disponible” y “Cambió después de la descarga”, con texto además del color;
  - la confirmación habilitada cuando solo hay advertencias.

**Checkpoint**: Las cuatro historias funcionan: la propietaria ve los riesgos antes de confirmar y la marca de modificación es fiable en todas las ediciones de existencias.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentar las decisiones, verificar los límites y ejecutar las puertas de calidad del proyecto.

- [X] T055 [P] Actualizar `AGENTS.md`:
  - en “Stack y decisiones vigentes”, indicar que las hojas de cálculo se leen con `read-excel-file` y se generan con `write-excel-file` y `@onparallel/write-excel-file-data-validation`, versión fijada cuyo código se revisa antes de actualizarla; que los archivos subidos nunca se almacenan; y que la vista previa usa un token firmado ligado a la sesión;
  - en “Convenciones”, indicar que la carga masiva es de todo o nada y nunca elimina productos, tallas ni fotos.
- [X] T056 [P] Agregar `/admin/productos/carga-masiva` a la tabla de rutas de `README.md`, y en `docs/documentacion.md` una sección sobre la carga masiva: formato, límites, reglas de celda vacía y 0, flujo de vista previa y confirmación, y la migración 0002.
- [X] T057 [P] Añadir en `tests/contract/inventory-api-response.test.ts` las comprobaciones de tamaño y rendimiento:
  - la respuesta de vista previa de un archivo de 5.000 productos, generado con el builder, ocupa menos de 4 MB al serializarse;
  - leer el archivo y calcular el conjunto de cambios de 1.000 productos tarda menos de 10 s, un margen amplio frente a SC-003.
- [X] T058 Revisar `src/server/inventory/*.ts` y `src/pages/api/admin/inventory/*.ts`:
  - cada endpoint llama a `requireOwner` o `requireMutation`;
  - todas las respuestas llevan `Cache-Control: no-store`, y las descargas `X-Content-Type-Options: nosniff` y un nombre de archivo seguro;
  - ningún `console.*`, mensaje de error ni respuesta incluye valores de celdas, tokens o datos de sesión.
- [X] T059 Revisar la accesibilidad y el uso en móvil de `src/pages/admin/productos/carga-masiva.astro` y `src/components/admin/BulkInventoryUpload.astro` según `contracts/bulk-inventory-ui.md`: 320 px sin desplazamiento horizontal, áreas táctiles de 44 px, foco visible, anuncios `aria-live`, contraste de 4.5:1 y estados que no dependen solo del color. Corregir los hallazgos.
- [ ] T060 Ejecutar la validación de `specs/003-carga-masiva-inventario/quickstart.md` y corregir los fallos:
  - `npm.cmd run test`;
  - la integración con `TEST_DATABASE_URL` contra `uniformes_medicos_test`;
  - `npx playwright test tests/e2e/admin-bulk-inventory.spec.ts --project=chromium --project=mobile` con `E2E=1`, contra una base aislada;
  - `npm.cmd run build`;
  - la ida y vuelta manual en Google Sheets y LibreOffice Calc, que debe dar “sin cambios”.
- [X] T061 Actualizar `specs/003-carga-masiva-inventario/quickstart.md` si durante la implementación cambiaron comandos, rutas, mensajes o límites, manteniendo los escenarios manuales por historia.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 va primero. T002 puede ejecutarse en paralelo con T001, y T003 depende de T001.
- **Foundational (Phase 2)**:
  - Depende de Setup y bloquea todas las historias.
  - T005, T006, T007, T011 y T012 son pruebas o datos de prueba y pueden escribirse en paralelo desde el inicio de la fase.
  - T008 depende de T004; T009 de T004 y T008; T010 de T004; T013 de T004; T014 de T013.
- **User Story 1 (Phase 3)**:
  - Depende de la fase 2.
  - T015–T019 preceden a la implementación.
  - T020, T021, T022 y T023 pueden avanzar en paralelo.
  - T024 depende de T020–T023; T025 y T026, de T024. T027 puede avanzar en paralelo con el backend; T028 depende de T027; T029 es independiente.
- **User Story 2 (Phase 4)**:
  - Depende de US1, porque extiende el lector, el servicio, los endpoints y la pantalla.
  - T030–T033 preceden a la implementación.
  - T034, T035, T036 y T037 pueden ir en paralelo. T038 depende de T035, T039 de T036–T038 y T040 de T039. T041 puede ir en paralelo con T038–T040.
- **User Story 3 (Phase 5)**:
  - Depende de US1, y de US2 para los casos con altas de T043.
  - T042–T045 preceden a la implementación. T046, T047, T048 y T049 tocan archivos distintos y pueden ir en paralelo.
- **User Story 4 (Phase 6)**:
  - Depende de US1 y US2, porque las advertencias evalúan altas y ediciones.
  - T050 y T051 preceden a T052–T054. T053 y T054 pueden ir en paralelo con T052.
- **Polish (Phase 7)**: Depende de las historias que se vayan a publicar. T060 es la puerta final, y T061 se ejecuta después de T060.

### User Story Dependencies

- **User Story 1 (P1)**: Puede iniciar después de la fase 2. Es el MVP demostrable y deja el flujo completo para ediciones.
- **User Story 2 (P1)**: Depende de US1, cuyo flujo de vista previa y aplicación extiende con altas. Se verifica de forma independiente con la plantilla vacía.
- **User Story 3 (P1)**: Depende de US1 y US2 para ejercitar rechazos, conflictos y fallos sobre ediciones y altas.
- **User Story 4 (P2)**: Depende de US1 y US2. No cambia contratos, porque los códigos de advertencia ya están definidos.

### Within Each User Story

- Las pruebas de la historia se escriben primero y deben fallar antes de implementar.
- El orden es: funciones puras (`rows.ts`, `changes.ts`, `issues.ts`) → acceso a datos (`repository.ts`) → servicio (`service.ts`) → endpoints → pantalla.
- Las tareas sobre el mismo archivo (`changes.ts`, `service.ts`, `BulkInventoryUpload.astro`, `tests/unit/inventory-changes.test.ts`) se ejecutan en orden de historia y nunca en paralelo entre sí.
- Cada checkpoint se valida antes de pasar a la siguiente historia.

## Parallel Opportunities

- **Setup**: T001 y T002.
- **Foundational**: T005, T006, T007, T011 y T012, y después T010 en paralelo con T008/T009 y T013.
- **US1**: T015–T019 (cinco archivos de prueba distintos); T020–T023 (escritor, lector, cambios y repositorio); T025, T026 y T027, y T029 en cualquier momento.
- **US2**: T030–T033; T034–T037; T040 y T041.
- **US3**: T042–T045; T046–T049.
- **US4**: T050 y T051; T053 y T054.
- **Polish**: T055, T056 y T057.

## Parallel Example: User Story 1

```text
Pruebas (en paralelo):
  Developer A: T015 - ediciones en tests/unit/inventory-changes.test.ts
  Developer B: T016 - exportación y estructura en tests/contract/inventory-workbook.test.ts
  Developer C: T017 - esquemas de respuesta en tests/contract/inventory-api-response.test.ts
  Developer D: T018 - integración con PostgreSQL en tests/integration/inventory-apply.test.ts
  Developer E: T019 - flujo E2E en tests/e2e/admin-bulk-inventory.spec.ts

Implementación base (en paralelo):
  Developer A: T020 - src/server/inventory/workbook-writer.ts
  Developer B: T021 - src/server/inventory/workbook-reader.ts
  Developer C: T022 - src/server/inventory/changes.ts
  Developer D: T023 - src/server/inventory/repository.ts
  Developer E: T027 - src/components/admin/BulkInventoryUpload.astro

Integración (en secuencia):
  T024 servicio → T025 y T026 endpoints (en paralelo) → T028 página; T029 enlace en cualquier momento
```

## Implementation Strategy

### MVP First (User Story 1)

1. Completar la fase 1 y la fase 2. Las reglas por celda ya impiden guardar datos inválidos.
2. Implementar US1: descarga del inventario, vista previa de ediciones, aplicación atómica y enlace desde productos.
3. Ejecutar las pruebas unitarias, de contrato, de integración y E2E de US1.
4. Detenerse a validar que volver a aplicar el archivo no cambia nada y que la vitrina refleja la disponibilidad correcta.
5. Mostrar el MVP antes de añadir altas y el endurecimiento de errores.

### Incremental Delivery

1. **US1**: edición masiva (MVP demostrable).
2. **US2**: altas en bloque y corrección de la secuencia de `legacy_id`.
3. **US3**: rechazos de archivo, conflictos y experiencia de error. Con US1–US3 completas, las tres historias P1 pueden publicarse en producción juntas, como indica el plan.
4. **US4**: advertencias de calidad y la marca `updated_at` fiable.
5. **Fase 7**: documentación, límites, accesibilidad y la puerta final (T060) antes de publicar.

## Notes

- Todas las tareas empiezan con una casilla, un ID secuencial, el marcador `[P]` cuando aplica y la etiqueta de historia en las fases 3 a 6, y su descripción incluye la ruta del archivo.
- `[P]` indica que la tarea no comparte archivo con otra tarea incompleta ni depende de ella.
- No hay cambios de esquema. La única migración (`0002`) sincroniza datos de la secuencia y es idempotente.
- Ningún paso guarda el archivo subido ni sus valores. Cancelar, abandonar o recibir un conflicto nunca modifica datos.
- La validación del servidor es la única fuente de verdad. Las ayudas dentro de Excel solo orientan el llenado.
