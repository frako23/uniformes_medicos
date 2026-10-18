# Research: Carga y edición masiva de inventario con plantilla de Excel

Fecha de la investigación: 2026-10-17. Las versiones, auditorías y mediciones citadas se obtuvieron ese día desde el registro de npm y con una prueba aislada en un directorio temporal, fuera del repositorio.

## Decision 1: Leer con `read-excel-file`, escribir con `write-excel-file` y validar celdas con su complemento

**Decision**: Usar `read-excel-file` 9.x para leer los archivos subidos; `write-excel-file` 4.x para generar la plantilla y la descarga del inventario; `@onparallel/write-excel-file-data-validation` 1.0.2, fijado a esa versión exacta, para las listas desplegables y las validaciones numéricas dentro de Excel; y `fflate` 0.8.x, ya presente como dependencia transitiva, para inspeccionar el contenedor zip antes de leerlo.

**Rationale**:

- Las tres librerías tienen versiones publicadas en 2026: `read-excel-file` 9.3.12 el 2026-10-07, `write-excel-file` 4.1.1 el 2026-06-08 y el complemento, creado el 2026-06-04, con su versión 1.0.2 el 2026-10-09. Todas tienen licencia MIT y el árbol completo suma 9 paquetes. `npm audit` no reporta vulnerabilidades.
- La prueba de ida y vuelta confirmó el comportamiento que necesita la especificación:
  - Las filas vacías intermedias e iniciales se conservan, de modo que el índice de cada fila más uno es el número de fila de Excel que se mostrará en los errores (SC-004).
  - Las celdas vacías llegan como `null` y todas las filas tienen la misma longitud.
  - Los textos se recortan por defecto (FR-015). Los números escritos como texto llegan como texto (`"45.5"`, `"7"`) y el servidor los interpreta.
  - Un texto como `=SUM(A1:A2)` se escribe como cadena compartida (`t="s"`) y el libro no contiene elementos `<f>`, así que no se ejecuta como fórmula al abrirlo (FR-006).
  - Un archivo que no es `.xlsx` produce `InvalidInputError` con código `FILE_NOT_SUPPORTED`. Un contenedor OLE (formato `.xls` o `.xlsx` cifrado con contraseña) produce `XLS_FILE_NOT_SUPPORTED`. Una hoja inexistente produce `SheetNotFoundError` con la lista de hojas disponibles.
  - Con 5.000 productos y 22 columnas, generar el libro tardó unos 0,6 s y produjo 435 KB, leerlo tardó unos 0,2 s y su contenido descomprimido ocupa 3,4 MB. El margen frente a SC-003 (30 s para la vista previa) es amplio.
- El código revisado línea por línea es el de la versión 1.0.2 del complemento: son 3 archivos fuente que solo transforman el XML de la hoja con las utilidades públicas de `write-excel-file`, sin acceso a disco, red ni variables de entorno. Admite listas de valores fijos, listas por rango (`valuesRange`), enteros y decimales con operador, mensajes de ayuda (`input`) y los estilos de error `stop`, `warning` e `information`. Como es un paquete joven con una versión reciente, se fija exactamente en 1.0.2 y cualquier actualización requiere repetir la revisión del código antes de aceptarla.
- Las validaciones dentro de Excel solo ayudan a llenar el archivo. La única fuente de verdad es la validación del servidor. Si el complemento tuviera que retirarse, la plantilla perdería las listas desplegables pero el comportamiento descrito no cambiaría.

**Alternatives considered**:

- **ExcelJS 4.4.0**: cubre lectura, escritura, validaciones, notas, hojas ocultas y protección. Se descarta porque no publica una versión estable desde 2023-10 (solo una prerrelease en 2024-12), arrastra 194 paquetes y `npm audit` reporta 2 avisos moderados heredados de `uuid` (GHSA-w5hq-g745-h8pq) cuya única corrección propuesta es un retroceso de versión incompatible.
- **SheetJS (`xlsx` 0.18.5 en npm)**: la versión del registro tiene avisos de severidad alta sin corrección publicada en npm (GHSA-4r6h-8v6p-xvw6, contaminación de prototipos, y GHSA-5pgg-2g8v-p4x9, ReDoS). Las versiones corregidas solo se distribuyen desde el CDN del proveedor, y la edición comunitaria no escribe validaciones de datos.
- **CSV**: la usuaria pidió Excel. Un CSV no admite varias hojas ni listas de referencia, y Excel suele abrirlo con problemas de codificación de tildes o con un separador decimal distinto.

**Sources**:

- [read-excel-file](https://github.com/catamphetamine/read-excel-file)
- [write-excel-file](https://github.com/catamphetamine/write-excel-file)
- [write-excel-file-data-validation](https://github.com/onparallel/write-excel-file-data-validation)
- [fflate](https://github.com/101arrowz/fflate)
- [ExcelJS](https://github.com/exceljs/exceljs) y [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) y [instalación de SheetJS en Node](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)

## Decision 2: Libro de tres hojas con metadatos visibles y sin protección de hoja

**Decision**: La plantilla vacía y la descarga del inventario comparten el mismo formato, descrito en [contracts/inventory-workbook.md](./contracts/inventory-workbook.md):

- **Hojas**: “Instrucciones”, “Inventario” y “Listas”. “Inventario” tiene el encabezado fijo en la fila 1, una fila por producto, las columnas fijas `ID`, `Tipo`, `Fabricante`, `Marca`, `Género`, `Precio`, `SKU`, `Color`, `Publicado` y `Activo`, y una columna `Talla <etiqueta>` por talla, ordenadas con `compareSizeLabels`, el mismo criterio de la vitrina.
- **Metadatos**: se escriben como pares etiqueta/valor en “Instrucciones”: tipo de archivo, fecha de generación en ISO 8601 UTC y versión del formato (`1`).
- **Ayudas de llenado**:
  - Listas desplegables con estilo `stop` para Género, Publicado y Activo.
  - Sugerencias con estilo `information` para Tipo, Fabricante, Marca y Color, tomadas de “Listas”, que admiten valores nuevos.
  - Validación de entero ≥ 0 en las tallas y de decimal ≥ 0 en el precio.
  - La columna ID va en gris con un mensaje de ayuda que pide no modificarla.
  - Formato de texto (`@`) en las columnas de texto y en SKU.
- **Exportación**: incluye todos los productos, ordenados por Tipo, Marca, Color, Género e ID.

**Rationale**: Una fila por producto con una columna por talla es el formato que eligió la usuaria. Los metadatos visibles sobreviven a abrir y guardar el archivo en Excel, Google Sheets o LibreOffice y no dependen de funciones no documentadas como las hojas ocultas. El formato de texto evita que Excel convierta un SKU como `00123` en el número 123. No se protege la hoja, porque en Excel la protección impide ordenar y filtrar con celdas bloqueadas y dificulta insertar columnas de talla nuevas. Además, Google Sheets no la conserva y no constituye un control de seguridad: cualquier ID alterado se rechaza al validar (`UNKNOWN_ID`).

**Alternatives considered**:

- **Hoja de metadatos oculta**: `write-excel-file` no documenta hojas ocultas, y una hoja oculta es menos transparente para la propietaria.
- **Columna oculta de versión por producto**: detectaría cambios posteriores a la descarga sin depender de la fecha, pero agrega una columna frágil. La fecha de generación junto con un `updated_at` fiable (Decision 7) cubre el caso.
- **Hoja protegida con la columna ID bloqueada**: se descarta por los motivos ya indicados.

**Sources**:

- [write-excel-file: hojas, columnas fijas, estilos y formato `@`](https://github.com/catamphetamine/write-excel-file)
- [Microsoft: aplicar validación de datos a celdas](https://support.microsoft.com/en-us/office/apply-data-validation-to-cells-29fecbcc-d1b9-42c1-9d76-eff3ce5f7249)

## Decision 3: Guardas del archivo antes de leerlo y validación con las reglas del formulario

**Decision**: Cada subida pasa por estas guardas, en este orden, antes de analizar celdas:

1. Rechazar cuerpos que declaren más de 4,5 MB y archivos de más de 4 MB, o vacíos.
2. Exigir la extensión `.xlsx`.
3. Comprobar la firma del contenido: `PK` para zip, o firma OLE, que corresponde a `.xls` o a un archivo protegido con contraseña.
4. Recorrer el directorio central del zip con `fflate`, sin descomprimir: como máximo 200 entradas y 50 MB descomprimidos; debe existir `xl/workbook.xml` y no debe existir `xl/vbaProject.bin` (macros).
5. Leer las hojas con `read-excel-file`.

Después:

- **Encabezado**: es la primera fila no vacía de “Inventario”. Los nombres se normalizan sin espacios sobrantes, mayúsculas ni tildes.
- **Columnas fijas**: son todas obligatorias. Las de talla son opcionales.
- **Reglas de cada campo**: se reutilizan los esquemas de `productInputSchema` y `variantInputSchema` (`.shape`), de modo que la carga masiva y el formulario individual comparten límites y mensajes (FR-014).
- **Comprobaciones previas que no hacen esos esquemas**:
  - Una celda vacía se trata como vacía antes de convertirla, porque `z.coerce.number()` convierte `""` en 0.
  - El precio admite como máximo dos decimales y como máximo 99.999.999,99, que es el límite de `numeric(10,2)`.
  - Las cantidades admiten como máximo 2.147.483.647, el límite de `integer`.
- **Fórmulas**: la librería devuelve el valor calculado guardado en el archivo y deja vacías las celdas con errores de fórmula. Por eso el mensaje de “obligatorio” indica “vacía o con un error de fórmula”.

**Rationale**: Vercel rechaza con `413 FUNCTION_PAYLOAD_TOO_LARGE` cualquier petición de más de 4,5 MB, así que el límite de 4 MB deja margen para la codificación multipart. El navegador también comprueba tamaño y extensión antes de subir, para mostrar un mensaje propio en lugar del error de la plataforma. El adaptador Node local no impone ese límite, de ahí la comprobación de `Content-Length`.

El modelo de amenaza es una propietaria autenticada que puede subir por error un archivo enorme, dañado, cifrado o con macros. No hay un atacante anónimo, porque el middleware y `requireMutation` bloquean antes. Las guardas se basan en los tamaños declarados por el zip: no detienen a un archivo diseñado para mentir sobre su tamaño, pero sí los accidentes reales, y el tope de 4 MB más los 2 GB de memoria por función acotan el resto.

**Alternatives considered**:

- **Reconocer las columnas por posición**: es frágil si la propietaria reordena o agrega columnas.
- **Lectura en streaming**: es innecesaria con 3,4 MB descomprimidos como caso máximo.
- **Aceptar `.xls`, `.xlsm` o CSV**: queda fuera de la especificación.
- **Replicar las reglas en un esquema nuevo**: generaría diferencias con el formulario individual.

**Sources**:

- [Vercel Functions limits: cuerpo de 4,5 MB y duración](https://vercel.com/docs/functions/limitations)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [read-excel-file: fórmulas, `trim` y errores](https://github.com/catamphetamine/read-excel-file)

## Decision 4: Vista previa sin estado en el servidor y token firmado ligado a la sesión

**Decision**:

- **Vista previa**: `POST /api/admin/inventory/preview` analiza el archivo y devuelve la vista previa. Si no hay errores, incluye un token firmado.
- **Confirmación**: `POST /api/admin/inventory/apply` recibe otra vez el mismo archivo junto con el token. El navegador conserva el `File` seleccionado entre ambos pasos.
- **Contenido del token**: `{ v, fileSha256, baseline, issuedAt, expiresAt }`, codificado en base64url y firmado con HMAC-SHA256.
- **Clave de firma**: se deriva del token de sesión de la cookie (`sha256(sessionToken + "|inventory-preview")`), igual que hoy se deriva el token CSRF.
- **Vencimiento**: 60 minutos (FR-021). En la práctica también lo acotan la inactividad de sesión de 30 minutos y la duración absoluta de 8 horas que ya aplica `getSession`.
- **Cancelar**: el navegador descarta la vista previa, sin llamar al servidor.

**Rationale**:

- El servidor nunca guarda el archivo ni datos derivados de él (FR-027). No hace falta una tabla nueva, ni un proceso de limpieza, ni una variable de entorno secreta adicional.
- Si se cierra la sesión o se inicia otra, los tokens anteriores dejan de validar automáticamente.
- El hash del archivo garantiza que se aplique el mismo contenido que se revisó.
- La `baseline` permite comprobar que el inventario no cambió desde la vista previa (Decision 5).
- Volver a subir 4 MB como máximo, y normalmente unos cientos de KB, cuesta muy poco.

**Alternatives considered**:

- **Guardar en PostgreSQL el conjunto de cambios previsto**: requiere una migración, la limpieza de vistas previas abandonadas y conservar contenido del archivo, en contra de la minimización de FR-027.
- **Guardar el archivo en Vercel Blob**: el almacén del proyecto es público y no sirve para inventario privado.
- **Memoria del servidor**: las instancias serverless no la comparten entre peticiones.
- **Cookie con el conjunto de cambios**: excede el tamaño de una cookie.

**Sources**:

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- Implementación existente de derivación de CSRF y caducidad de sesión en `src/server/auth/crypto.ts` y `src/server/auth/session.ts`.

## Decision 5: Una sola transacción con bloqueo consultivo, verificación de la línea base y escrituras por lotes

**Decision**: La confirmación ejecuta todo dentro de una única transacción:

1. `SET LOCAL lock_timeout = '10s'`.
2. `pg_advisory_xact_lock(<clave fija de carga masiva>)`, para serializar las cargas.
3. `SELECT … FOR UPDATE` sobre los productos referenciados por ID y sus variantes.
4. Recalcular la `baseline` y compararla con la del token. La `baseline` es el hash canónico de esos productos y sus tallas, más el marcador del catálogo (número de productos y `legacy_id` máximo).
5. Recalcular el conjunto de cambios con la instantánea actual y exigir cero errores.
6. Escribir por lotes:
   - Primero se ponen a `NULL` los SKU que cambian y luego se asignan los definitivos, lo que permite intercambios.
   - Actualización de productos con valores distintos por fila.
   - Inserción de productos nuevos con `RETURNING`.
   - Inserción o actualización de variantes con `ON CONFLICT (product_id, size_label) DO UPDATE`.
   - Bloques de 1.000 filas como máximo. Nunca se ejecuta `DELETE`.
7. Confirmar la transacción.

Cualquier diferencia o fallo revierte todo y responde `409` o `500` con el mensaje “no se aplicó ningún cambio” (FR-022).

**Rationale**:

- **Bloqueo consultivo de transacción**: se libera solo al terminar y funciona con el pooling transaccional de Neon/PgBouncer. Los bloqueos de sesión no son compatibles con ese modo.
- **Doble envío**: un segundo envío del mismo token espera al primero y luego encuentra un marcador o una `baseline` distintos, así que se rechaza. Esto cubre también los archivos que solo crean productos y que de otro modo se duplicarían.
- **Edición individual en paralelo**: `FOR UPDATE` la bloquea o la hace fallar con su control `expectedUpdatedAt`.
- **Intercambio de SKU**: PostgreSQL comprueba en cada fila, de inmediato, los índices únicos no diferibles, así que intercambiar SKU en una sola sentencia fallaría. Pasar antes por `NULL` lo evita sin cambiar el esquema.
- **Coste**: con lotes, 1.000 productos requieren unas 15 a 20 sentencias, muy por debajo de los 300 s de duración por defecto con Fluid compute y también de los límites más cortos sin Fluid.
- **Datos que no se tocan**: `category_id`, los campos `source_*`, las imágenes y `legacy_document_id` de los productos existentes. Los productos nuevos reciben `legacy_document_id = crypto.randomUUID()`, igual que en `createProduct`.

**Alternatives considered**:

- **Una transacción por producto**: produciría aplicaciones parciales, prohibidas por la especificación y la constitución.
- **Sentencias fila por fila**: miles de idas y vueltas a la base, con riesgo de exceder los tiempos.
- **Convertir el índice único de SKU en restricción `DEFERRABLE`**: es un cambio de esquema más invasivo para un caso que se resuelve en dos pasos.
- **Aislamiento `SERIALIZABLE`**: exige lógica de reintentos y no evita por sí solo el doble envío.

**Sources**:

- [PostgreSQL: bloqueos consultivos](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) y [funciones `pg_advisory_xact_lock`](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)
- [PostgreSQL: `SELECT … FOR UPDATE`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) y [`lock_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT)
- [PostgreSQL: unicidad no diferida, en la sección Compatibility de CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- [PgBouncer: funciones compatibles por modo de pooling](https://www.pgbouncer.org/features.html)
- [Drizzle: actualizar muchas filas con valores distintos](https://orm.drizzle.team/docs/guides/update-many-with-different-value) e [inserciones con `onConflictDoUpdate`](https://orm.drizzle.team/docs/insert)

## Decision 6: Sincronizar la secuencia de `legacy_id` antes de crear productos

**Decision**:

- Agregar la migración SQL versionada `drizzle/0002_sync_product_legacy_id_sequence.sql`, escrita a mano como `0001_initial_catalog.sql` y registrada en `drizzle/meta/_journal.json`. La migración lleva la secuencia de identidad de `products.legacy_id` al máximo valor existente, sin retrocederla nunca.
- Agregar un helper compartido que haga la misma comprobación dentro de la transacción antes de insertar productos. Lo usan la carga masiva y `createProduct`.

**Rationale**: La migración desde Strapi insertó productos con `legacy_id` explícito (`src/server/migration/import-products.ts`), y en ningún lugar del repositorio se ejecuta `setval` ni `RESTART`. En una columna `GENERATED BY DEFAULT AS IDENTITY`, los valores explícitos no adelantan la secuencia, así que las inserciones sin `legacy_id` pueden recibir un valor ya usado y fallar por `products_legacy_id_unique`. En una carga de todo o nada, una sola colisión revertiría todo el lote. La migración corrige los entornos existentes de forma reproducible y el helper evita que el problema reaparezca si la importación vuelve a ejecutarse. No cambia el esquema.

**Alternatives considered**:

- **Calcular `max + 1` en la aplicación**: tiene condiciones de carrera con el formulario individual.
- **Cambiar a `GENERATED ALWAYS`**: rompería la importación, que necesita conservar los identificadores de origen.
- **No hacer nada**: las altas en bloque fallarían de forma intermitente.

**Sources**:

- [PostgreSQL: columnas de identidad en CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- [PostgreSQL: funciones de secuencias (`setval`)](https://www.postgresql.org/docs/current/functions-sequence.html)

## Decision 7: Reglas de comparación y advertencias en funciones puras

**Decision**: El cálculo de diferencias vive en funciones puras y deterministas que reciben las filas interpretadas y una instantánea del catálogo, y devuelven el conjunto de cambios con sus incidencias. Las reglas están detalladas en [data-model.md](./data-model.md):

- **Tallas**: se emparejan por producto sin distinguir mayúsculas ni espacios. Una talla nueva reutiliza la etiqueta canónica del catálogo si existe una equivalente.
- **Celdas de talla**: una celda vacía en una talla que el producto ya tiene es error. Una columna ausente no cambia nada.
- **SKU**: su unicidad se evalúa sobre el resultado final.
- **Sin cambios**: una fila sin diferencias reales no genera modificaciones (FR-023).
- **Disponibilidad**: se calcula con la regla compartida (publicado, activo y alguna talla con existencias positivas).
- **Advertencias**:
  - Valores nuevos de tipo, fabricante, marca, color o talla.
  - Posibles duplicados por tipo, fabricante, marca, género y color normalizados.
  - Producto que queda publicado sin fotos activas o sin existencias.
  - Producto que pasa a estar disponible o deja de estarlo.
  - Producto modificado después de la descarga: `updated_at` posterior a la fecha de generación del archivo.

**Rationale**: Igual que `catalog-filters.ts` en la especificación 002, separar la lógica del acceso a datos permite probar con Vitest todos los casos límite sin base de datos. La vista previa y la confirmación ejecutan exactamente el mismo código, que es lo que garantiza que se aplique lo que se revisó.

Para que la advertencia de cambios posteriores sea fiable, `updateVariantQuantity` también actualizará `products.updated_at`. Hoy solo actualiza la variante, lo que deja fuera de esa marca los cambios hechos mediante `PATCH …/variants/:variantId`. El ajuste también mejora el control `expectedUpdatedAt` del formulario.

**Alternatives considered**:

- **Calcular diferencias en SQL**: es difícil de probar y de explicar fila por fila.
- **Columna de versión por producto en el archivo**: se descartó en la Decision 2.
- **Comparar textos sin distinguir mayúsculas**: ocultaría correcciones intencionales, como cambiar “azul marino” por “Azul Marino”. Solo las opciones cerradas y las tallas se comparan sin distinguir mayúsculas (FR-015).

## Decision 8: Respuestas compactas, con incidencias agrupadas por fila

**Decision**:

- La vista previa agrupa las incidencias por gravedad, código, columna y mensaje, y lista sus filas como rangos (`"4"`, `"9-12"`) con un contador.
- Cada producto que cambia se describe solo con los campos y tallas que difieren. Los productos nuevos incluyen sus valores.
- Los productos sin cambios solo se cuentan.
- Una prueba de contrato verifica que la respuesta para un archivo de 5.000 productos no supere 4 MB.

**Rationale**: El límite de 4,5 MB de Vercel también aplica a las respuestas. Un archivo de 5.000 filas con varios errores por fila produciría decenas de miles de incidencias si se listaran una a una. Agruparlas mantiene la lista completa (US3) dentro del límite y ayuda a corregir: “Precio: … en filas 2–480” se corrige de una vez en Excel.

**Alternatives considered**:

- **Truncar a los primeros N errores**: incumple “la lista completa de errores” de la especificación.
- **Paginar la vista previa en el servidor**: requiere estado en el servidor, descartado en la Decision 4.

## Decision 9: Página Astro con script del navegador, igual que el resto del panel

**Decision**:

- Crear `src/pages/admin/productos/carga-masiva.astro` con el componente `BulkInventoryUpload.astro`.
- Un script TypeScript del componente gestiona estos estados: sin archivo, validando, rechazado, con errores, sin cambios, lista para confirmar, aplicando, aplicada, conflicto, fallo y sesión caducada.
- El navegador comprueba la extensión y el tamaño antes de subir.
- Se deshabilitan los botones mientras hay una petición en curso.
- Se anuncian los estados con `aria-live` y se mueve el foco al resumen, a los errores o al resultado.
- El resultado incluye enlaces para agregar fotos a cada producto creado.
- En `/admin/productos` se agrega un acceso visible “Carga masiva” junto a “Nuevo producto” (FR-002).

**Rationale**: El panel actual (`ProductForm.astro`, `ImageManager.astro`) usa componentes Astro con scripts del navegador. React está instalado pero ninguna página usa islas, así que introducirlo agregaría un patrón y JavaScript de cliente sin necesidad. Además, la confirmación sin estado requiere que el navegador vuelva a enviar el `File`, lo que descarta un formulario renderizado solo en el servidor.

**Alternatives considered**:

- **Isla React**: es un patrón nuevo para una sola pantalla.
- **Formulario `POST` renderizado en el servidor**: el navegador no puede reenviar el archivo seleccionado al confirmar.
- **Página fuera de `/admin/productos`**: FR-002 pide el acceso desde la sección de productos.

## Decision 10: Verificación en cuatro niveles

**Decision**:

- **Vitest unitario**: celdas y filas, diferencias y advertencias, agrupación de incidencias y token.
- **Pruebas de contrato**: ida y vuelta del libro generado, con inspección del XML para validaciones y celdas de texto, y esquema y tamaño de las respuestas.
- **Integración con PostgreSQL**: se ejecuta solo si existe `TEST_DATABASE_URL`, contra una base desechable. Cubre atomicidad ante fallos, doble envío, edición concurrente, intercambio de SKU, sincronización de secuencia y ausencia de eliminaciones.
- **Playwright**: se ejecuta solo con `E2E=1`, en escritorio y móvil.
- **Compilación**: `npm run build`.
- Los archivos de prueba se generan en tiempo de ejecución con `write-excel-file`; no se versionan binarios `.xlsx`.

**Rationale**: La constitución exige verificar las rutas críticas de existencias antes de publicar. La atomicidad y la concurrencia solo pueden probarse contra PostgreSQL real, y el patrón de pruebas condicionadas por variable de entorno ya existe en `tests/e2e/admin.spec.ts`. Generar los archivos en la prueba mantiene los casos legibles y revisables.

**Alternatives considered**:

- **Solo pruebas unitarias**: no detectarían fallos de transacción ni de bloqueo.
- **Archivos binarios de prueba versionados**: generan diferencias opacas en Git y envejecen con el formato.
