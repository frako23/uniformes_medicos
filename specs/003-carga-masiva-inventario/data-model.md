# Data Model: Carga y edición masiva de inventario con plantilla de Excel

## Alcance de datos

- **Sin cambios de esquema**: la funcionalidad no agrega tablas ni columnas. Se agrega una sola migración versionada de datos, `0002_sync_product_legacy_id_sequence.sql`, que sincroniza la secuencia de `products.legacy_id` ([research.md](./research.md), Decision 6).
- **Tablas modificadas**: PostgreSQL sigue siendo la fuente de verdad. La carga masiva escribe en `products` y `product_variants`.
- **Tablas consultadas**: de `product_images` solo se lee cuántas imágenes activas tiene cada producto.
- **Archivos subidos**: nunca se persisten. Se procesan en memoria durante la petición y se descartan. Entre la vista previa y la confirmación solo viaja un token firmado.

## Entidades persistentes afectadas

### Product (`products`)

| Columna del libro | Columna | Producto nuevo | Producto existente | Regla |
|---|---|---|---|---|
| `ID` | `legacy_id` | Vacía; la asigna la identidad de la tabla | Obligatoria; identifica la fila | Entero positivo de un producto existente; no puede repetirse en el archivo |
| — | `legacy_document_id` | `crypto.randomUUID()`, igual que `createProduct` | Sin cambios | Define la URL pública `/productos/:id` |
| `Tipo` | `legacy_type_label` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres |
| `Fabricante` | `manufacturer` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres |
| `Marca` | `brand` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres |
| `Género` | `gender` | Obligatoria | Obligatoria | `Dama`, `Caballero` o `Unisex`, sin distinguir mayúsculas ni tildes |
| `Precio` | `price` (`numeric(10,2)`) | Obligatoria | Obligatoria | ≥ 0, como máximo 2 decimales y como máximo 99.999.999,99 |
| `SKU` | `sku` | Opcional | Opcional; vacía significa sin SKU | Hasta 160 caracteres; único en el catálogo resultante |
| `Color` | `color` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres |
| `Publicado` | `is_published` | Vacía equivale a `No` | Obligatoria | `Sí`/`No`, sin distinguir mayúsculas ni tildes; también se aceptan valores booleanos de Excel |
| `Activo` | `is_active` | Vacía equivale a `Sí` | Obligatoria | Igual que `Publicado` |
| — | `updated_at` | Fecha de la aplicación | Se actualiza en cada producto con cualquier cambio, incluso si solo cambian existencias | Es la base de la advertencia de cambios posteriores a la descarga |
| — | `category_id`, `source_*`, `created_at` | Valores por defecto | Sin cambios | La carga masiva nunca los modifica |

### ProductVariant (`product_variants`)

| Origen | Columna | Regla |
|---|---|---|
| Encabezado `Talla <etiqueta>` | `size_label` | Si el producto ya tiene una talla equivalente, sin distinguir mayúsculas ni espacios, se usa su etiqueta exacta. Si no, se usa la etiqueta canónica del catálogo, y si tampoco existe en el catálogo, la etiqueta tal como está escrita en el encabezado, sin espacios sobrantes. Hasta 40 caracteres. |
| Celda de la talla | `quantity` | Entero entre 0 y 2.147.483.647. |
| — | `legacy_id` | `NULL` en variantes creadas por la carga masiva. |

- **Unicidad**: `(product_id, size_label)` sigue siendo única. La carga masiva inserta o actualiza con `ON CONFLICT (product_id, size_label) DO UPDATE`.
- **Sin eliminaciones**: no se borra ninguna variante. Si falta la columna de una talla, esa talla no cambia en ningún producto.

### ProductImage (`product_images`, solo lectura)

- **Uso**: el número de imágenes activas (`deleted_at IS NULL`) de cada producto determina la advertencia `PUBLISHED_WITHOUT_IMAGES`.
- **Fotos de productos nuevos**: los productos creados por carga masiva no tienen imágenes. El resultado enlaza a su edición individual para agregarlas.

### Secuencia de identidad de `products.legacy_id`

- **Invariante**: el siguiente valor generado debe ser mayor que `MAX(legacy_id)`.
- **Migración 0002**: lleva la secuencia a `MAX(legacy_id)` y nunca la retrocede.
- **Helper compartido**: antes de insertar productos dentro de una transacción, repite la comprobación de forma idempotente. Lo usan la carga masiva y `createProduct`.

## Estructuras transitorias

Estas estructuras viven solo durante una petición. Sus nombres orientan la implementación en `src/server/inventory/`.

### InventoryWorkbook

| Campo | Tipo | Regla |
|---|---|---|
| `fileName` | texto | Nombre recibido; solo se usa en mensajes y en la respuesta. |
| `byteSize` | entero | Entre 1 byte y 4 MB. |
| `sha256` | hex | Hash del contenido exacto; liga la vista previa con la confirmación. |
| `kind` | `plantilla \| inventario \| desconocido` | Se lee de “Tipo de archivo” en la hoja Instrucciones. |
| `generatedAt` | fecha o `null` | Se lee de “Generado (UTC)”. Si falta o es inválida, se emite el aviso `MISSING_METADATA` y no se evalúa `MODIFIED_AFTER_DOWNLOAD`. |
| `formatVersion` | entero o `null` | Versión `1` para esta funcionalidad. |
| `columns` | lista de `WorkbookColumn` | Columnas reconocidas en el encabezado. |
| `ignoredColumns` | lista de texto | Encabezados no reconocidos; generan el aviso `IGNORED_COLUMNS`. |

### WorkbookColumn

| Campo | Tipo | Regla |
|---|---|---|
| `key` | `id \| type \| manufacturer \| brand \| gender \| price \| sku \| color \| isPublished \| isActive \| size` | Clave interna estable. |
| `header` | texto | Encabezado original, que se usa en los mensajes. |
| `index` | entero | Posición en la fila; puede cambiar si la propietaria reordena las columnas. |
| `sizeKey` | texto | Solo en columnas de talla: la etiqueta normalizada sin mayúsculas ni espacios. |
| `sizeLabel` | texto | Solo en columnas de talla: la etiqueta escrita después de “Talla ”. |

### ParsedProductRow

| Campo | Tipo | Regla |
|---|---|---|
| `excelRow` | entero | Número de fila visible en Excel: índice + 1. |
| `legacyId` | entero o `null` | `null` indica un producto nuevo. |
| `values` | objeto | Valores normalizados de tipo, fabricante, marca, género, precio como texto con 2 decimales (`"50.00"`), SKU (`null` si está vacío), color, publicado y activo. Un campo inválido queda sin valor y genera una incidencia. |
| `sizes` | mapa `sizeKey → { label, quantity: entero \| null }` | `null` representa una celda vacía. |
| `issues` | lista de `ValidationIssue` | Errores de celda de esa fila. |

### CatalogSnapshot

| Campo | Regla |
|---|---|
| `products` | Todos los productos con `id`, `legacyId`, `legacyDocumentId`, campos editables, `updatedAt`, variantes (`id`, `sizeLabel`, `quantity`) y número de imágenes activas. |
| `distinctValues` | Tipos, fabricantes, marcas, colores y tallas existentes, deduplicados sin distinguir mayúsculas mediante `normalizeAdminProductFilterValues`. |
| `canonicalSizes` | Mapa `sizeKey → etiqueta`. Para cada etiqueta normalizada se elige la escritura más usada en el catálogo; en caso de empate, la que va primero según `compareSizeLabels`. |
| `skuOwners` | Mapa SKU → `legacyId` del producto que lo usa. |
| `marker` | `{ productCount, maxLegacyId }`; detecta productos creados entre la vista previa y la confirmación. |

### ProductChange

| Campo | Regla |
|---|---|
| `action` | `create` o `update`. Los productos sin diferencias solo se cuentan. |
| `excelRow`, `legacyId`, `label` | La etiqueta tiene la forma `Tipo · Marca · Color · Género`. |
| `fields` | Lista de `{ field, label, from, to }` con valores listos para mostrar: precio con 2 decimales y “Sí”/“No”. En `create`, `from` es `null`. |
| `sizes` | Lista de `{ label, from, to }`. `from: null` indica una talla nueva para el producto. |
| `availability` | `{ from: boolean \| null, to: boolean }`, calculado con la regla compartida. |
| `warnings` | Códigos de advertencia de ese producto. |

### InventoryChangeSet

| Campo | Regla |
|---|---|
| `creates`, `updates` | Listas de `ProductChange`. |
| `counts` | `newProducts`, `updatedProducts`, `unchangedProducts`, `newSizes` (variantes que se crearán) y `changedStocks` (variantes existentes cuya cantidad cambia). |
| `issues` | Lista agrupada de `ValidationIssue`. |
| `referencedLegacyIds` | IDs de productos existentes presentes en el archivo. |
| `baseline` | Hash SHA-256 del estado canónico (ver “Reglas derivadas”). |
| `status` | `invalid` si hay al menos un error; `no_changes` si no hay errores ni cambios; `ready` en cualquier otro caso. |

### ValidationIssue

| Campo | Tipo | Regla |
|---|---|---|
| `severity` | `error \| warning \| notice` | Solo `error` impide confirmar. |
| `code` | texto | Uno de los códigos de [contracts/admin-inventory-api.md](./contracts/admin-inventory-api.md). |
| `column` | texto o `null` | Encabezado afectado; `null` en incidencias del archivo completo. |
| `message` | texto | Mensaje en español, sin datos técnicos. |
| `rows` | lista de rangos | Filas de Excel compactadas, por ejemplo `["4", "9-12"]`. Vacía en incidencias del archivo. |
| `count` | entero | Número de ocurrencias agrupadas. |

### PreviewToken

| Campo | Regla |
|---|---|
| `v` | Versión del token: `1`. |
| `fileSha256` | Debe coincidir con el archivo enviado al confirmar. |
| `baseline` | Debe coincidir con la línea base recalculada dentro de la transacción. |
| `issuedAt`, `expiresAt` | Milisegundos desde época; `expiresAt = issuedAt + 60 min`. |
| Firma | HMAC-SHA256 sobre el contenido codificado en base64url. La clave es `sha256(sessionToken + "\|inventory-preview")`, así que el token solo es válido en la misma sesión. |

### ApplyResult

| Campo | Regla |
|---|---|
| `appliedAt` | Fecha de la transacción confirmada. |
| `summary` | `createdProducts`, `updatedProducts`, `createdSizes` y `changedStocks`. |
| `created` | `{ id, documentId, label, editUrl }` de cada producto nuevo, para agregarle fotos. |
| `updated` | `{ id, documentId, label, editUrl }` de cada producto existente modificado, para acceder a él (FR-024). |

## Reglas derivadas

1. **Identificación**: una fila con `ID` edita el producto que tiene ese `legacy_id`. Una fila sin `ID` crea un producto. El SKU nunca se usa para localizar productos. Un ID inexistente da `UNKNOWN_ID`; un valor no entero, `INVALID_ID`; un ID repetido en el archivo, `DUPLICATE_ID` en todas sus filas.
2. **Celdas vacías**: en campos obligatorios dan `REQUIRED`. En `Publicado` y `Activo` aplican los valores por defecto solo en productos nuevos. En `SKU` significan sin SKU. En una talla significan que el producto no la usa: si el producto ya tiene esa talla, dan `EXISTING_SIZE_BLANK`.
3. **Tallas**:
   - Una columna se empareja con una talla del producto cuando coinciden sin distinguir mayúsculas ni espacios.
   - Si un producto tiene dos tallas que se normalizan igual, como “M” y “m”, cualquier columna que las afecte da `AMBIGUOUS_SIZES` para ese producto. En la descarga del inventario, esa celda contiene el texto “Unificar tallas” y la hoja Instrucciones lista los productos afectados.
   - Una columna cuya etiqueta no existe en el catálogo da la advertencia `NEW_SIZE`.
4. **SKU**: se evalúa sobre el resultado final. Hay conflicto si dos filas terminan con el mismo SKU (`SKU_REPEATED`), o si una fila termina con el SKU de un producto que no está en el archivo, o que sí está pero conserva ese SKU (`SKU_IN_USE`). Dos productos del archivo pueden intercambiar sus SKU.
5. **Comparación**:
   - Textos: se comparan exactos, después de quitar espacios sobrantes.
   - Género, Publicado y Activo: se comparan con su valor normalizado.
   - Precio: se compara como número con 2 decimales.
   - Tallas: se comparan por cantidad.
   - Una fila sin diferencias no genera cambios (FR-023), y volver a aplicar el mismo archivo no altera nada (SC-006).
6. **Disponibilidad**: un producto está disponible si está publicado, activo y tiene alguna talla con cantidad > 0. Se calcula antes y después de aplicar los cambios, con todas sus tallas, incluidas las que no aparecen en el archivo.
7. **Advertencias** (no impiden confirmar):
   - `NEW_VALUE`: el valor de Tipo, Fabricante, Marca o Color no existe en el catálogo, comparando sin distinguir mayúsculas ni tildes.
   - `NEW_SIZE`: la etiqueta de una columna de talla no existe en el catálogo.
   - `POSSIBLE_DUPLICATE`: un producto nuevo coincide con otro, existente o del mismo archivo, en tipo, fabricante, marca, género y color, comparados sin mayúsculas, tildes ni espacios sobrantes.
   - `PUBLISHED_WITHOUT_IMAGES`: el producto queda publicado y activo sin imágenes activas, y además es nuevo o su publicación o actividad pasa a “Sí”.
   - `PUBLISHED_WITHOUT_STOCK`: el producto queda publicado y activo sin existencias positivas, y además es nuevo o cambiaron su publicación, actividad o existencias.
   - `BECOMES_AVAILABLE` / `BECOMES_UNAVAILABLE`: cambia la disponibilidad en la vitrina.
   - `MODIFIED_AFTER_DOWNLOAD`: el producto tiene cambios y su `updated_at` es posterior a `generatedAt`.
8. **Línea base (`baseline`)**: SHA-256 del JSON canónico `["v1", productCount, maxLegacyId, [[legacyId, tipo, fabricante, marca, género, precio, sku, color, publicado, activo, [[talla, cantidad], …]], …]]`. Incluye los productos referenciados, ordenados por `legacyId`, con sus tallas ordenadas por etiqueta. Cualquier cambio en esos productos o una creación o eliminación en el catálogo invalida la vista previa.

## Estados de una carga masiva

```text
sin archivo ──elegir .xlsx──────────────> archivo elegido
archivo elegido ──validar──────────────> validando
validando ──formato o tamaño inválido──> rechazado ──elegir otro──> archivo elegido
validando ──al menos un error──────────> con errores ──subir corregido──> validando
validando ──sin errores ni cambios─────> sin cambios
validando ──válido con cambios─────────> lista para confirmar
lista para confirmar ──cancelar────────> sin archivo
lista para confirmar ──confirmar───────> aplicando
lista para confirmar ──60 min──────────> caducada ──validar de nuevo──> validando
aplicando ──commit─────────────────────> aplicada
aplicando ──conflicto, fallo o caducidad──> no aplicada ──validar de nuevo──> validando
cualquier estado ──sesión caducada─────> requiere iniciar sesión (sin cambios en datos)
```

Ningún estado distinto de `aplicada` modifica datos.

## Límite transaccional de la confirmación

Toda la aplicación ocurre en una sola transacción:

1. `SET LOCAL lock_timeout = '10s'` y `SELECT pg_advisory_xact_lock(<clave fija>)`.
2. Bloquear con `FOR UPDATE` los productos referenciados por ID y sus variantes.
3. Cargar la instantánea del catálogo, recalcular la línea base y compararla con la del token. Si difiere: `ROLLBACK` y `409`.
4. Recalcular el conjunto de cambios con las filas ya interpretadas. Si hay errores: `ROLLBACK` y `409`, con un mensaje que pide volver a validar.
5. Sincronizar la secuencia de `legacy_id` si hace falta.
6. Poner a `NULL` el SKU de los productos cuyo SKU cambia.
7. Actualizar por lotes los productos existentes con cambios, incluido `updated_at`.
8. Insertar por lotes los productos nuevos con `RETURNING id, legacy_id, legacy_document_id`.
9. Insertar o actualizar por lotes las variantes con `ON CONFLICT (product_id, size_label) DO UPDATE`.
10. `COMMIT` y devolver `ApplyResult`.

Cualquier excepción revierte la transacción completa y el inventario queda exactamente como antes de confirmar (SC-005).
