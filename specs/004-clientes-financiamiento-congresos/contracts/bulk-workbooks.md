# Contract: Libros de Excel de Clientes, Financiamientos y Congresos (formato 1)

## Alcance

Este contrato define las plantillas vacías, las descargas de datos actuales y los archivos que la propietaria sube en las secciones Clientes, Pagos financiados y Congresos.

La estructura, las guardas del archivo, la lectura de celdas y las ayudas dentro de Excel son las de la carga de inventario ([../../003-carga-masiva-inventario/contracts/inventory-workbook.md](../../003-carga-masiva-inventario/contracts/inventory-workbook.md)), con las diferencias que se describen aquí. Las ayudas dentro de Excel solo orientan el llenado: la validación definitiva siempre ocurre en el servidor.

## Archivos descargables

| Sección | Archivo | Nombre sugerido | “Tipo de archivo” | Contenido de la hoja de datos |
|---|---|---|---|---|
| Clientes | Plantilla vacía | `plantilla-clientes.xlsx` | `Plantilla vacía` | Solo el encabezado |
| Clientes | Datos actuales | `clientes-AAAA-MM-DD.xlsx` | `Datos actuales` | Todos los clientes, ordenados por nombre normalizado y `Identificador` |
| Pagos financiados | Plantilla vacía | `plantilla-financiamientos.xlsx` | `Plantilla vacía` | Solo el encabezado. “Listas” incluye los clientes registrados |
| Congresos | Plantilla vacía | `plantilla-congresos.xlsx` | `Plantilla vacía` | Solo el encabezado |
| Congresos | Datos actuales | `congresos-AAAA-MM-DD.xlsx` | `Datos actuales` | Todos los congresos, ordenados por `Desde`, `Nombre` e `Identificador` |

Notas comunes:

- **Fechas de los nombres de archivo**: son de Caracas.
- **Pagos financiados**: no tienen descarga de datos actuales, porque su carga masiva solo crea financiamientos (FR-041).
- **Formato**: todos los archivos son `.xlsx` sin macros ni contraseña, y los textos se escriben como celdas de texto, nunca como fórmulas.

## Hojas

| Orden | Nombre | Uso | El servidor la lee |
|---:|---|---|---|
| 1 | `Instrucciones` | Pasos, significado de cada columna, valores permitidos, reglas de celdas vacías, límites y metadatos | Solo los metadatos |
| 2 | `Clientes`, `Financiamientos` o `Congresos` | Datos: una fila por registro | Sí |
| 3 | `Listas` | Valores de referencia existentes al generar el archivo | No |

**Hoja de datos**: el servidor procesa la hoja cuyo nombre normalizado coincide con el de la sección. Si no existe, procesa la primera hoja del libro. Así se puede subir directamente un libro propio cuya primera hoja tenga los encabezados esperados, como “Medicos”.

### Metadatos en `Instrucciones`

Son pares etiqueta/valor en las columnas A y B, buscados por etiqueta:

| Etiqueta | Valor | Ejemplo |
|---|---|---|
| `Sección` | `Clientes`, `Financiamientos` o `Congresos` | `Clientes` |
| `Tipo de archivo` | `Plantilla vacía` o `Datos actuales` | `Datos actuales` |
| `Generado (UTC)` | Fecha ISO 8601 UTC | `2026-10-18T14:05:00.000Z` |
| `Versión del formato` | Entero | `1` |

Reglas:

- **Sección distinta**: si “Sección” existe y no coincide con la sección donde se sube el archivo, se emite el error de archivo `WRONG_SECTION`.
- **Sin fecha de generación**: si falta “Generado (UTC)” y el archivo tiene filas con `Identificador`, se emite el aviso `MISSING_METADATA` y no se comprueba `MODIFIED_AFTER_DOWNLOAD`.

## Hoja `Clientes`

En los archivos generados, el encabezado está en la fila 1 inmovilizada y en este orden. Las ocho primeras columnas coinciden con la pestaña “Medicos” de la hoja actual, para que pueda pegarse tal cual.

| Encabezado | Obligatoria | Formato aceptado | Celda vacía significa |
|---|---|---|---|
| `Nombre` | Sí | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Celular` | Sí | Venezolano: 10 dígitos sin el 0 inicial o 11 con él, con o sin `58` o `+58`, y con espacios, guiones, puntos o paréntesis. De otro país: `+` y de 8 a 15 dígitos. Una celda numérica se acepta | Error `REQUIRED` |
| `Sexo` | No | `Mujer` u `Hombre` | Sin dato |
| `Talla` | No | Texto de hasta 40 caracteres | Sin dato |
| `Ciudad`, `Hospital`, `Clínica`, `Especialidad` | No | Texto de hasta 160 caracteres | Sin dato |
| `Notas` | No | Texto de hasta 1.000 caracteres | Sin dato |
| `Identificador` | No | Entero positivo de un cliente existente; no modificar | Cliente nuevo o reconocido por su celular |

**Columnas obligatorias**: `Nombre` y `Celular`. Las demás pueden faltar en el archivo, y en ese caso esos datos no cambian.

**Interpretación de cada fila** ([data-model.md](../data-model.md) y [research.md](../research.md), Decision 7):

| La fila tiene | Resultado | Celda vacía en una columna opcional presente |
|---|---|---|
| `Identificador` | Edita ese cliente | Borra el dato, y la vista previa lo muestra como “se borrará” |
| Sin `Identificador`, celular de un cliente registrado | Edita ese cliente (“reconocido por celular”) | Conserva el dato guardado |
| Sin `Identificador`, celular nuevo | Crea un cliente | Sin dato |

**Valores**:

- En los archivos de datos actuales, el celular se escribe con `formatPhone` (por ejemplo, `0414-246-7789`), un formato que se acepta al volver a subirlo.
- `Sexo` se acepta sin distinguir mayúsculas, tildes ni espacios sobrantes.
- `Talla`, `Ciudad`, `Hospital`, `Clínica` y `Especialidad` se guardan con la escritura ya registrada si solo difieren de ella en mayúsculas, tildes o espacios. Un valor nuevo genera la advertencia `NEW_VALUE`.

## Hoja `Financiamientos`

Una fila crea un financiamiento. Nunca edita los existentes ni registra pagos de cuotas pendientes.

| Encabezado | Obligatoria | Formato aceptado | Celda vacía significa |
|---|---|---|---|
| `Celular del cliente` (alias `Celular`) | Sí | Igual que en Clientes. Debe pertenecer a un cliente registrado | Error `REQUIRED` |
| `Cliente` | No | Texto informativo con el nombre. Si no coincide con el del cliente de ese celular, advertencia `CLIENT_NAME_MISMATCH` | Sin comprobación |
| `Descripción` | Sí | Texto de 1 a 500 caracteres | Error `REQUIRED` |
| `Fecha de compra` | Sí | Fecha (ver “Fechas”), no posterior a hoy en Caracas | Error `REQUIRED` |
| `Monto total` | Sí | Dólares, número > 0 con como máximo 2 decimales y como máximo 9.999.999.999,99. Incluye la inicial | Error `REQUIRED` |
| `Inicial` | No | Dólares, ≥ 0 y menor que `Monto total` | Sin inicial |
| `Número de cuotas` | Sí | Entero de 1 a 48, sin contar la inicial | Error `REQUIRED` |
| `Frecuencia` | No | `Semanal`, `Quincenal` o `Mensual` | `Quincenal` |
| `Fecha de la primera cuota` | No | Fecha ≥ `Fecha de compra` | La que corresponde a la frecuencia después de la compra |
| `Cuotas pagadas` | No | Entero ≥ 0. Cuenta las cuotas ya pagadas en orden; si hay inicial, es la primera. No puede superar el número de cuotas más uno cuando hay inicial | 0 |

**Columnas obligatorias**: `Celular del cliente`, `Descripción`, `Fecha de compra`, `Monto total` y `Número de cuotas`.

**Calendario**: se genera con las reglas de [data-model.md](../data-model.md) (“Reglas del calendario de cuotas”). Las cuotas indicadas en `Cuotas pagadas` quedan pagadas con origen “carga masiva”, sin fecha, moneda ni tasa de pago.

## Hoja `Congresos`

En los archivos generados, el encabezado está en la fila 1 y en este orden. Las cinco primeras columnas coinciden con la pestaña “Eventos” de la hoja actual.

| Encabezado | Obligatoria | Formato aceptado | Celda vacía significa |
|---|---|---|---|
| `Desde` | Sí | Fecha | Error `REQUIRED` |
| `Hasta` | Sí | Fecha ≥ `Desde` | Error `REQUIRED` |
| `Especialidad` | No | Texto de hasta 160 caracteres, con escritura canónica | Sin dato |
| `Lugar` | No | Texto de hasta 160 caracteres | Sin dato |
| `Nombre` | Sí | Texto de 1 a 160 caracteres | Error `REQUIRED` |
| `Notas` | No | Texto de hasta 1.000 caracteres | Sin dato |
| `Identificador` | No | Entero positivo de un congreso existente | Congreso nuevo |

**Columnas obligatorias**: `Desde`, `Hasta` y `Nombre`.

**Interpretación**: una fila con `Identificador` edita ese congreso, y en ella una celda vacía en una columna opcional presente borra el dato. Una fila sin `Identificador` crea un congreso.

## Reglas comunes de lectura

### Encabezados

- **Normalización**: se recortan espacios, se unen los repetidos y se ignoran mayúsculas y tildes. Por ejemplo, `Clinica`, `CLÍNICA` y ` Clínica ` equivalen a `Clínica`.
- **Orden**: las columnas pueden estar en cualquier orden.
- **Desconocidas**: se ignoran y se informan con el aviso `IGNORED_COLUMNS`.
- **Duplicadas**: una columna conocida repetida es el error `DUPLICATE_COLUMN`.
- **Faltantes**: si faltan columnas obligatorias, el error `MISSING_COLUMNS` las lista todas.
- **Hoja vacía**: si la hoja no tiene filas no vacías, el error es `NO_ROWS`.

### Fechas

| Caso | Tratamiento |
|---|---|
| Celda de fecha de Excel | Se toma el día, el mes y el año en UTC, tal como los entrega `read-excel-file` |
| Texto `d/m/aaaa`, `dd/mm/aaaa`, con `/`, `-` o `.` | Se acepta. `12/03/2026` es el 12 de marzo |
| Texto `aaaa-mm-dd` | Se acepta |
| Número entero entre 36.526 y 73.050 | Se interpreta como fecha de Excel sin formato (de 2000 a 2099) |
| Fecha inexistente (`31/02/2026`), otro texto u otro número | Error `INVALID_DATE` |

### Montos y números

- **Montos**: igual que el precio de la 003. Un número escrito como texto se acepta con punto o coma decimal y sin separadores de miles; un monto con símbolos o letras es el error `INVALID_AMOUNT`, y uno con más de 2 decimales, `AMOUNT_DECIMALS`.
- **Enteros**: `Número de cuotas`, `Cuotas pagadas` e `Identificador` no admiten decimales.

### Otros casos

- **Fórmulas**: se usa el valor calculado guardado en el archivo. Si no hay valor o el cálculo dio error, la celda se trata como vacía y el mensaje lo indica.
- **Filas vacías**: se ignoran las filas completamente vacías.
- **Números de fila**: los mensajes usan el número de fila que muestra Excel.

## Ayudas dentro de Excel

| Columnas | Ayuda | Estilo de error |
|---|---|---|
| `Sexo` | Lista `Mujer, Hombre` | `stop` |
| `Frecuencia` | Lista `Semanal, Quincenal, Mensual` | `stop` |
| `Talla`, `Ciudad`, `Hospital`, `Clínica`, `Especialidad` | Sugerencias desde `Listas` | `information`: permite valores nuevos |
| `Monto total`, `Inicial` | Decimal ≥ 0 | `stop` |
| `Número de cuotas` | Entero entre 1 y 48 | `stop` |
| `Cuotas pagadas` | Entero ≥ 0 | `stop` |
| Fechas | Fecha ≥ 01/01/2000, con el mensaje de ayuda “dd/mm/aaaa” | `warning` |
| `Nombre`, `Lugar`, `Descripción` | Longitud ≤ 160 (≤ 500 en `Descripción`) | `warning` |
| `Celular`, `Celular del cliente` | Formato de texto `@` y mensaje de ayuda con ejemplos | Sin restricción |
| `Identificador` | Celda en gris y mensaje “No modifiques este valor; déjalo vacío para crear un registro nuevo” | Sin restricción |

- **Rango**: las validaciones cubren desde la fila 2 hasta la fila del límite de la sección más 1.
- **Sin protección**: las hojas no se protegen.

## Límites

| Límite | Clientes | Financiamientos | Congresos | Resultado si se supera |
|---|---|---|---|---|
| Tamaño del archivo | 4 MB | 4 MB | 4 MB | Rechazo `FILE_TOO_LARGE` |
| Filas de datos | 10.000 | 2.000 | 10.000 | Error `TOO_MANY_ROWS` |
| Contenido descomprimido | 50 MB y 200 entradas | igual | igual | Rechazo `FILE_UNREADABLE` |
| Formato | `.xlsx` sin macros ni contraseña | igual | igual | `FILE_NOT_XLSX`, `FILE_HAS_MACROS` o `FILE_PROTECTED_OR_XLS` |

## Compatibilidad

Igual que la 003: Excel 2016 o posterior y Microsoft 365, Google Sheets (descargando como “Microsoft Excel (.xlsx)”) y LibreOffice Calc (guardando con “Mantener el formato actual”).

## Ejemplos

```text
Hoja "Clientes" (o la primera hoja, por ejemplo "Medicos")

Nombre          │ Celular        │ Sexo  │ Talla │ Ciudad  │ Hospital       │ Clínica │ Especialidad      │ Notas │ Identificador
────────────────┼────────────────┼───────┼───────┼─────────┼────────────────┼─────────┼───────────────────┼───────┼──────────────
Ana Pérez       │ 4141234567     │ Mujer │ M     │ Caracas │ Los magallanes │         │ Medicina Interna  │       │
Luis Gómez      │ 0424-765.43.21 │ Hombre│       │         │                │         │                   │       │ 15

· Fila 2: si +584141234567 ya existe, actualiza ese cliente solo con las celdas que tienen valor;
  si no existe, lo crea. “Los magallanes” se guarda como “Los Magallanes”.
· Fila 3: edita el cliente 15; borra su talla, ciudad y especialidad, porque las celdas están vacías y las columnas presentes.
```

```text
Hoja "Financiamientos"

Celular del cliente │ Cliente   │ Descripción             │ Fecha de compra │ Monto total │ Inicial │ Número de cuotas │ Frecuencia │ Fecha de la primera cuota │ Cuotas pagadas
────────────────────┼───────────┼─────────────────────────┼─────────────────┼─────────────┼─────────┼──────────────────┼────────────┼───────────────────────────┼───────────────
0414-123-4567       │ Ana Pérez │ 2 conjuntos talla M     │ 18/10/2026      │ 100         │         │ 4                │            │                           │
0424-765-4321       │ Luis      │ Bata y conjunto         │ 01/09/2026      │ 120         │ 20      │ 4                │ Quincenal  │ 15/09/2026                │ 3

· Fila 2: 4 cuotas de $25,00 el 31/10, el 15/11, el 30/11 y el 15/12/2026, todas pendientes.
· Fila 3: inicial de $20,00 (01/09) y 4 cuotas de $25,00 el 15/09, el 30/09, el 15/10 y el 31/10/2026.
  “Cuotas pagadas = 3” deja pagadas la inicial y las cuotas del 15/09 y del 30/09.
  Si el cliente se llama “Luis Gómez”, se advierte CLIENT_NAME_MISMATCH.
```

```text
Hoja "Congresos"

Desde      │ Hasta      │ Especialidad │ Lugar                      │ Nombre                            │ Notas │ Identificador
───────────┼────────────┼──────────────┼────────────────────────────┼───────────────────────────────────┼───────┼──────────────
30/10/2026 │ 01/11/2026 │ Mastología   │ Hotel Eurobuilding Caracas │ Congreso Venezolano de Mastología │       │
           │            │ Medicina Estética │                       │                                   │       │

· Fila 2: crea un congreso de 3 días que se pinta en octubre y en noviembre.
· Fila 3: error REQUIRED en Desde, Hasta y Nombre (la fila de “Eventos” sin fechas).
```
