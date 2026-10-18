# Contract: API administrativa de carga masiva de inventario

## Reglas comunes

- **Ubicación**: todas las rutas viven en la aplicación Astro, bajo `/api/admin/inventory/`. El middleware existente exige sesión para `/api/admin/**`.
- **Lectura** (`GET`): llama a `requireOwner`.
- **Envío** (`POST`): llama a `requireMutation`, que valida sesión, `Origin` y la cabecera `x-csrf-token`. Aunque la vista previa no modifica datos, recibe un archivo y por eso exige las mismas protecciones.
- **Caché**: todas las respuestas llevan `Cache-Control: no-store`. Las descargas añaden `X-Content-Type-Options: nosniff`.
- **Errores**: usan la forma existente `{ "error": { "code", "message", "fields"? } }`, sin trazas, SQL, tokens ni contenido de celdas.
- **Registros del servidor**: solo incluyen códigos de incidencia, conteos y duración, nunca valores del archivo.
- **Límite de cuerpo**: las peticiones con `Content-Length` mayor de 4,5 MB se rechazan antes de leer el cuerpo. Las respuestas se diseñan para quedar por debajo de 4 MB.

## `GET /api/admin/inventory/template`

Descarga la plantilla vacía.

- **200**:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="plantilla-inventario.xlsx"`
  - Cuerpo: el libro descrito en [inventory-workbook.md](./inventory-workbook.md), con las listas de referencia del catálogo actual.
- **401** `UNAUTHENTICATED`: no hay sesión.
- **500** `INTERNAL_ERROR` o `DATABASE_ERROR`: mensaje genérico.

## `GET /api/admin/inventory/export`

Descarga el inventario actual: todos los productos, con ID, datos editables y existencias por talla.

- **200**: mismo tipo de contenido que la plantilla, con `Content-Disposition: attachment; filename="inventario-AAAA-MM-DD.xlsx"`.
- **401** y **500**: igual que la plantilla.
- Con el catálogo vacío devuelve el libro con solo el encabezado.

## `POST /api/admin/inventory/preview`

Analiza un archivo y devuelve la vista previa. Nunca modifica datos.

**Petición**: `multipart/form-data` con un campo `file` (`.xlsx`, como máximo 4 MB) y la cabecera `x-csrf-token`.

**Respuestas**:

| Estado | Cuándo | Cuerpo |
|---|---|---|
| 200 | El archivo se pudo leer como libro de Excel, tenga o no errores de contenido | `PreviewResponse` |
| 401 `UNAUTHENTICATED` | Sesión ausente o caducada | Error |
| 403 `FORBIDDEN` | `Origin` o CSRF inválidos | Error |
| 422 `VALIDATION_ERROR` | No hay archivo, o el archivo no puede leerse como libro: `FILE_REQUIRED`, `FILE_TOO_LARGE`, `FILE_NOT_XLSX`, `FILE_PROTECTED_OR_XLS`, `FILE_HAS_MACROS` o `FILE_UNREADABLE` | Error con `fields.file` = mensaje |
| 500 `DATABASE_ERROR` / `INTERNAL_ERROR` | No se pudo leer el catálogo | Error genérico |

```ts
type PreviewResponse = {
  status: "ready" | "invalid" | "no_changes";
  file: {
    name: string;
    kind: "plantilla" | "inventario" | "desconocido";
    generatedAt: string | null; // ISO 8601
    productRows: number;        // filas de productos no vacías
  };
  summary: {
    newProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    newSizes: number;           // variantes que se crearán
    changedStocks: number;      // variantes existentes cuya cantidad cambia
    errors: number;             // ocurrencias
    warnings: number;           // ocurrencias
  };
  issues: Array<{
    severity: "error" | "warning" | "notice";
    code: IssueCode;
    column: string | null;      // encabezado tal como aparece en el archivo
    message: string;            // español, sin datos técnicos
    rows: string[];             // filas de Excel compactadas: ["4", "9-12"]
    count: number;
  }>;
  changes: Array<{             // solo productos nuevos o con diferencias, en orden de fila
    row: number;
    action: "create" | "update";
    id: number | null;          // legacy_id; null en productos nuevos
    label: string;              // "Tipo · Marca · Color · Género"
    fields: Array<{
      field: "type" | "manufacturer" | "brand" | "gender" | "price" | "sku" | "color" | "isPublished" | "isActive";
      label: string;            // "Precio"
      from: string | null;      // null en productos nuevos
      to: string | null;        // null solo si se elimina el SKU
    }>;
    sizes: Array<{ label: string; from: number | null; to: number }>;
    availability: { from: boolean | null; to: boolean };
    warnings: IssueCode[];
  }>;
  preview: { token: string; expiresAt: string } | null; // solo con status "ready"
};
```

- **Estado**:
  - `invalid`: hay al menos un error, y el token no se emite.
  - `no_changes`: no hay errores ni diferencias.
  - `ready`: hay cambios aplicables, aunque existan advertencias.
- **Valores de los cambios**: `fields[].from`/`to` vienen listos para mostrar: precio con dos decimales (`"55.00"`), “Sí”/“No” y textos sin espacios sobrantes.

## `POST /api/admin/inventory/apply`

Aplica de forma atómica la vista previa confirmada.

**Petición**: `multipart/form-data` con `file`, que debe ser el mismo archivo de la vista previa, y `previewToken`, más la cabecera `x-csrf-token`.

**Respuestas**:

| Estado | Cuándo | Mensaje para la propietaria |
|---|---|---|
| 200 | Transacción confirmada | `ApplyResponse` |
| 401 `UNAUTHENTICATED` | Sesión ausente o caducada; el token queda inválido | “Tu sesión expiró. Inicia sesión y vuelve a subir el archivo.” |
| 403 `FORBIDDEN` | `Origin` o CSRF inválidos | “La solicitud no es válida.” |
| 409 `CONFLICT` | Token con firma inválida o de otra sesión (`fields.previewToken`) | “La vista previa no es válida. Valida el archivo de nuevo.” |
| 409 `CONFLICT` | Token vencido (`fields.previewToken`) | “La vista previa venció. Valida el archivo de nuevo.” |
| 409 `CONFLICT` | El hash del archivo no coincide (`fields.file`) | “El archivo no coincide con el de la vista previa.” |
| 409 `CONFLICT` | La línea base cambió, el recálculo encontró errores o se viola una restricción única, como un SKU tomado mientras tanto | “El inventario cambió desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.” |
| 409 `CONFLICT` | Tiempo de espera del bloqueo (`lock_timeout`) | “Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.” |
| 422 `VALIDATION_ERROR` | Falta `file` o `previewToken`, o el archivo no es legible | Igual que en la vista previa |
| 500 `DATABASE_ERROR` / `INTERNAL_ERROR` | Fallo durante la transacción, que se revierte | “No se aplicó ningún cambio. Inténtalo de nuevo.” |

```ts
type ApplyResponse = {
  status: "applied";
  appliedAt: string; // ISO 8601
  summary: {
    createdProducts: number;
    updatedProducts: number;
    createdSizes: number;
    changedStocks: number;
  };
  created: Array<{
    id: number;          // legacy_id asignado
    documentId: string;  // legacy_document_id
    label: string;
    editUrl: string;     // "/admin/productos/<documentId>", para agregar fotos
  }>;
  updated: Array<{       // productos existentes modificados, en orden de fila (FR-024)
    id: number;
    documentId: string;
    label: string;
    editUrl: string;
  }>;
};
```

Si llegan dos confirmaciones con el mismo token, como un doble clic o un reintento tras perder la conexión, como máximo una devuelve `200`. La otra recibe `409` y no modifica datos.

## Códigos de incidencia (`IssueCode`)

| Código | Gravedad | Ámbito | Mensaje (plantilla) |
|---|---|---|---|
| `SHEET_NOT_FOUND` | error | archivo | No se encontró la hoja “Inventario”. Hojas del archivo: {lista}. |
| `MISSING_COLUMNS` | error | archivo | Faltan columnas obligatorias: {lista}. |
| `DUPLICATE_COLUMN` | error | archivo | La columna “{columna}” aparece más de una vez. |
| `INVALID_SIZE_COLUMN` | error | archivo | La columna “{columna}” debe tener la forma “Talla M”, con una etiqueta de hasta 40 caracteres. |
| `NO_PRODUCTS` | error | archivo | El archivo no contiene productos para procesar. |
| `TOO_MANY_PRODUCTS` | error | archivo | El archivo tiene {n} productos; el máximo es 5.000. Divídelo en varios archivos. |
| `INVALID_ID` | error | celda | El ID debe ser el número que trae el inventario descargado. |
| `UNKNOWN_ID` | error | celda | No existe un producto con este ID. No modifiques la columna ID; déjala vacía para crear un producto nuevo. |
| `DUPLICATE_ID` | error | celda | Este ID aparece en más de una fila. |
| `REQUIRED` | error | celda | {columna} es obligatorio. La celda está vacía o tiene un error de fórmula. |
| `TOO_LONG` | error | celda | {columna} admite como máximo {n} caracteres. |
| `INVALID_TYPE` | error | celda | La celda contiene una fecha u otro tipo de dato no válido para {columna}. |
| `INVALID_GENDER` | error | celda | Usa Dama, Caballero o Unisex. |
| `INVALID_PRICE` | error | celda | El precio debe ser un número mayor o igual a 0, sin símbolos ni texto. |
| `PRICE_DECIMALS` | error | celda | El precio admite como máximo dos decimales. |
| `PRICE_TOO_HIGH` | error | celda | El precio supera el máximo permitido (99.999.999,99). |
| `INVALID_YES_NO` | error | celda | Usa Sí o No. |
| `INVALID_QUANTITY` | error | celda | La cantidad debe ser un número entero mayor o igual a 0. |
| `EXISTING_SIZE_BLANK` | error | celda | El producto ya tiene esta talla: escribe 0 para dejarla sin existencias. La carga masiva no elimina tallas. |
| `AMBIGUOUS_SIZES` | error | celda | El producto tiene tallas duplicadas ({etiquetas}); unifícalas desde la edición del producto. |
| `SKU_IN_USE` | error | celda | El SKU ya pertenece al producto con ID {id}. |
| `SKU_REPEATED` | error | celda | El SKU se repite en varias filas del archivo. |
| `NEW_VALUE` | warning | celda | Se creará un valor nuevo de {columna}: “{valor}”. Revisa que no sea un error de escritura. |
| `NEW_SIZE` | warning | columna | Se creará la talla nueva “{etiqueta}”. |
| `POSSIBLE_DUPLICATE` | warning | fila | Este producto nuevo se parece a {ID n / la fila n}. |
| `PUBLISHED_WITHOUT_IMAGES` | warning | fila | Quedará publicado sin fotografías; agrégalas desde la edición del producto. |
| `PUBLISHED_WITHOUT_STOCK` | warning | fila | Quedará publicado sin existencias y se verá como no disponible. |
| `BECOMES_AVAILABLE` | warning | fila | Pasará a estar disponible en la vitrina. |
| `BECOMES_UNAVAILABLE` | warning | fila | Dejará de estar disponible en la vitrina. |
| `MODIFIED_AFTER_DOWNLOAD` | warning | fila | Este producto cambió después de descargar el archivo; se sobrescribirán sus valores actuales. |
| `IGNORED_COLUMNS` | notice | archivo | Se ignoraron columnas no reconocidas: {lista}. |
| `MISSING_METADATA` | notice | archivo | No se encontró la fecha de generación; no se comprobará si hubo cambios después de la descarga. |

Los rechazos 422 por formato usan estos mensajes en `fields.file`:

| Código | Mensaje |
|---|---|
| `FILE_REQUIRED` | Selecciona un archivo de Excel (.xlsx). |
| `FILE_TOO_LARGE` | El archivo supera 4 MB. Divide el inventario en varios archivos. |
| `FILE_NOT_XLSX` | El archivo debe ser un Excel .xlsx basado en la plantilla. |
| `FILE_PROTECTED_OR_XLS` | El archivo está protegido con contraseña o usa el formato antiguo .xls. Guárdalo como Excel (.xlsx) sin contraseña. |
| `FILE_HAS_MACROS` | El archivo contiene macros. Guárdalo como Excel (.xlsx) sin macros. |
| `FILE_UNREADABLE` | No se pudo leer el archivo. Ábrelo y guárdalo de nuevo como .xlsx. |
