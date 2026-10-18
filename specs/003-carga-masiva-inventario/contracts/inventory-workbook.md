# Contract: Libro de Excel de inventario (formato 1)

## Alcance

Este contrato define el formato de la plantilla vacía, de la descarga del inventario actual y de los archivos que la propietaria sube al panel. Ambos archivos descargables usan el mismo formato, y el servidor acepta el mismo formato al subirlos. Las ayudas dentro de Excel, como listas desplegables y validaciones de celda, solo orientan el llenado: la validación definitiva siempre ocurre en el servidor.

## Archivos descargables

| Archivo | Nombre sugerido | Contenido de “Inventario” | “Tipo de archivo” |
|---|---|---|---|
| Plantilla vacía | `plantilla-inventario.xlsx` | Solo el encabezado | `Plantilla vacía` |
| Inventario actual | `inventario-AAAA-MM-DD.xlsx` (fecha UTC) | Todos los productos, publicados o no y activos o inactivos, ordenados por Tipo, Marca, Color, Género e ID | `Inventario actual` |

Ambos son `.xlsx` sin macros y sin contraseña. Todos los textos se escriben como celdas de texto, nunca como fórmulas.

## Hojas

| Orden | Nombre | Uso | El servidor la lee |
|---:|---|---|---|
| 1 | `Instrucciones` | Pasos de llenado, significado de cada columna, valores permitidos, reglas de celdas vacías y del 0, límites, productos con tallas ambiguas y metadatos. | Solo los metadatos |
| 2 | `Inventario` | Datos: una fila por producto. | Sí |
| 3 | `Listas` | Tipos, fabricantes, marcas, colores y tallas existentes al generar el archivo; alimentan las sugerencias. | No |

### Metadatos en `Instrucciones`

Son pares etiqueta/valor en dos celdas contiguas de una misma fila: etiqueta en la columna A y valor en la B. El servidor los busca por etiqueta, no por posición.

| Etiqueta (columna A) | Valor (columna B) | Ejemplo |
|---|---|---|
| `Tipo de archivo` | `Plantilla vacía` o `Inventario actual` | `Inventario actual` |
| `Generado (UTC)` | Fecha ISO 8601 UTC | `2026-10-17T20:30:00.000Z` |
| `Versión del formato` | Entero | `1` |

Si la hoja o los metadatos faltan, el archivo sigue siendo válido, pero no se comprueba si algún producto cambió después de la descarga y se emite el aviso `MISSING_METADATA`.

## Hoja `Inventario`

- **Encabezado**: es la primera fila no vacía, que en los archivos generados es la fila 1, inmovilizada. Los datos empiezan en la fila siguiente.
- **Números de fila**: los mensajes usan el número de fila que muestra Excel.
- **Filas vacías**: se ignoran las que están completamente vacías.
- **Límite**: como máximo 5.000 filas de productos no vacías.

### Columnas fijas (todas deben existir)

| Encabezado | Producto nuevo (sin ID) | Producto existente (con ID) | Formato aceptado | Celda vacía significa |
|---|---|---|---|---|
| `ID` | Debe quedar vacía | Identificador del sistema; no modificar | Entero positivo | Producto nuevo |
| `Tipo` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Fabricante` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Marca` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Género` | Obligatoria | Obligatoria | `Dama`, `Caballero` o `Unisex` | Error `REQUIRED` |
| `Precio` | Obligatoria | Obligatoria | Número ≥ 0, como máximo 2 decimales y como máximo 99.999.999,99 | Error `REQUIRED` |
| `SKU` | Opcional | Opcional | Texto de hasta 160 caracteres, único en el catálogo | Sin SKU |
| `Color` | Obligatoria | Obligatoria | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Publicado` | Opcional | Obligatoria | `Sí` o `No` | Nuevo: `No`. Existente: error `REQUIRED` |
| `Activo` | Opcional | Obligatoria | `Sí` o `No` | Nuevo: `Sí`. Existente: error `REQUIRED` |

### Columnas de talla (opcionales)

- **Encabezado**: `Talla <etiqueta>`, por ejemplo `Talla M`, `Talla 2XL` o `Talla Única`. La etiqueta tiene de 1 a 40 caracteres.
- **Columnas generadas**: los archivos traen una columna por cada talla del catálogo, en el orden en que la vitrina presenta las tallas: XXS…XXL y después las demás en orden natural.
- **Celdas**:
  - Vacía: el producto no usa esa talla. Si el producto ya la tiene, es el error `EXISTING_SIZE_BLANK`, y para dejarla sin existencias hay que escribir `0`.
  - `0`: la talla existe sin existencias.
  - Un entero mayor que 0: la existencia total de la talla. Reemplaza el valor actual, no se suma.
- **Talla nueva**: se agrega una columna `Talla <etiqueta>` en cualquier posición. Solo se crea en los productos que tengan una cantidad en esa columna.
- **Columna eliminada**: las existencias de esa talla no cambian en ningún producto.
- **Columnas equivalentes**: dos columnas cuyas etiquetas solo difieren en mayúsculas o espacios son el error `DUPLICATE_COLUMN`. Una columna cuya etiqueta equivale a una talla existente, como `Talla m` frente a `M`, actualiza esa talla y no crea otra.

### Reconocimiento de encabezados

- **Normalización**: se recortan espacios, se unen los espacios repetidos y se ignoran mayúsculas y tildes, de modo que `genero`, `GÉNERO` y ` Género ` equivalen a `Género`.
- **Orden**: las columnas pueden estar en cualquier orden.
- **Desconocidos**: se ignoran y se informan con el aviso `IGNORED_COLUMNS`.
- **Duplicados**: una columna fija repetida es el error `DUPLICATE_COLUMN`.
- **Faltantes**: si falta una columna fija, el error `MISSING_COLUMNS` las lista todas.

### Valores de celda

| Caso | Tratamiento |
|---|---|
| Texto con espacios al inicio o al final | Se recorta. |
| Número escrito como texto (`"10"`, `"45.5"`, `"45,5"`) | Se acepta si representa un valor válido. El separador decimal puede ser punto o coma; no se aceptan separadores de miles. |
| Precio con símbolos o texto (`"$50"`, `"cincuenta"`) | Error `INVALID_PRICE`. |
| Precio con más de 2 decimales (`49.999`) | Error `PRICE_DECIMALS`. Un valor binario equivalente a 2 decimales, como `49.990000000000002`, se acepta. |
| Cantidad decimal o negativa | Error `INVALID_QUANTITY`. |
| `Sí`, `Si`, `SI`, `sí`, `No`, `no`, `VERDADERO`/`FALSO` booleanos | Se aceptan en `Publicado` y `Activo`. |
| Fecha en una columna que no es de fecha | Error `INVALID_TYPE`. |
| Fórmula | Se usa el valor calculado guardado en el archivo. Si no hay valor o el cálculo dio error, la celda se trata como vacía y el mensaje lo indica. |
| `Unificar tallas` en una columna de talla | Marca un producto con tallas ambiguas: error `AMBIGUOUS_SIZES` hasta unificarlas desde la edición individual. |

## Ayudas dentro de Excel

| Columnas | Ayuda | Estilo de error |
|---|---|---|
| `Género` | Lista `Dama, Caballero, Unisex` | `stop`: rechaza otros valores |
| `Publicado`, `Activo` | Lista `Sí, No` | `stop` |
| `Tipo`, `Fabricante`, `Marca`, `Color` | Lista de sugerencias desde `Listas` | `information`: permite valores nuevos |
| `Precio` | Decimal ≥ 0 | `stop` |
| `Talla …` | Entero ≥ 0 | `stop` |
| `ID` | Celda en gris con un mensaje de ayuda que pide no modificarla | Sin restricción |

Las validaciones cubren las filas 2 a 5001. La hoja no se protege, para que se pueda ordenar, filtrar e insertar columnas de talla.

## Límites

| Límite | Valor | Resultado si se supera |
|---|---|---|
| Tamaño del archivo | 4 MB | Rechazo `FILE_TOO_LARGE` |
| Filas de productos | 5.000 | Error `TOO_MANY_PRODUCTS` |
| Contenido descomprimido | 50 MB y 200 entradas | Rechazo `FILE_UNREADABLE` |
| Formato | Solo `.xlsx`, sin macros ni contraseña | `FILE_NOT_XLSX`, `FILE_HAS_MACROS` o `FILE_PROTECTED_OR_XLS` |

## Compatibilidad

- Microsoft Excel 2016 o posterior y Microsoft 365: abrir, editar y guardar como `.xlsx`.
- Google Sheets: importar el archivo y descargarlo como “Microsoft Excel (.xlsx)”.
- LibreOffice Calc: guardar con “Mantener el formato actual” (`.xlsx`).

Las tres conservan las hojas y los valores. Las ayudas de validación pueden presentarse de forma distinta en Google Sheets y LibreOffice, pero el servidor aplica las mismas reglas en todos los casos.

## Ejemplo

```text
Hoja "Inventario"

ID  │ Tipo   │ Fabricante │ Marca   │ Género │ Precio │ SKU     │ Color  │ Publicado │ Activo │ Talla S │ Talla M │ Talla 4XL
────┼────────┼────────────┼─────────┼────────┼────────┼─────────┼────────┼───────────┼────────┼─────────┼─────────┼──────────
101 │ Bata   │ Fab A      │ Marca A │ Dama   │ 55.00  │ BAT-001 │ Blanca │ Sí        │ Sí     │ 3       │ 0       │
    │ Pijama │ Fab B      │ Marca B │ Unisex │ 45.50  │         │ Azul   │           │        │         │ 10      │ 2

· Fila 2: edita el producto 101 (precio 55, S = 3, M sin existencias; no usa 4XL).
· Fila 3: crea un producto no publicado y activo con M = 10 y la talla nueva 4XL = 2.
```
