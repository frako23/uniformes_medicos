# Quickstart: Validar la carga y edición masiva de inventario

Esta guía describe cómo demostrar la funcionalidad una vez implementada. No contiene código de implementación: los formatos y reglas están en [contracts/](./contracts/) y [data-model.md](./data-model.md).

## Prerrequisitos

- Node.js 24.x y npm.
- PostgreSQL de desarrollo, el de `docker-compose.yml` u otro configurado en `DATABASE_URL`, separado de producción.
- `.env` con las variables existentes: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `PUBLIC_SITE_URL`. La funcionalidad no requiere variables nuevas.
- Datos de prueba que incluyan al menos:
  - un producto publicado con fotos y varias tallas;
  - uno publicado sin fotos;
  - uno con SKU;
  - uno inactivo o no publicado.
- Microsoft Excel, Google Sheets o LibreOffice Calc para editar los archivos.
- Navegadores de Playwright para la validación E2E (`npx playwright install chromium webkit`).

## Preparar y ejecutar

Desde la raíz del repositorio:

```powershell
npm install
npm run docker:up
npm run db:migrate
npm run owner:seed
npm run dev
```

Comprobar que la migración `0002_sync_product_legacy_id_sequence` dejó la secuencia por delante de los identificadores existentes. `last_value` debe ser mayor o igual que el máximo:

```powershell
docker exec uniformes-medicos-postgres psql -U postgres -d uniformes_medicos -c "SELECT last_value FROM products_legacy_id_seq;" -c "SELECT MAX(legacy_id) FROM products;"
```

Abrir `http://localhost:4321/admin/productos`, iniciar sesión y entrar a “Carga masiva”.

## Validación automatizada

### Unitarias y de contrato

```powershell
npm run test
```

Las suites deben cubrir como mínimo:

1. **Celdas**: números escritos como texto, coma o punto decimal, más de dos decimales, valores negativos, “Sí”/“No” con y sin tilde, géneros con mayúsculas distintas, límites de 160 y 40 caracteres, fechas en columnas de texto y celdas vacías antes de la conversión numérica.
2. **Encabezados**: orden libre, tildes y mayúsculas, columnas desconocidas, columnas fijas faltantes o duplicadas, columnas `Talla` sin etiqueta o equivalentes entre sí.
3. **Diferencias**:
   - alta, edición y fila sin cambios;
   - celda vacía en una talla existente (error) frente a columna ausente (sin cambios);
   - talla nueva por producto y por catálogo, y emparejamiento de “m” con “M”;
   - ID inexistente o repetido;
   - SKU en uso, repetido o intercambiado;
   - aplicar dos veces el mismo resultado sin cambios.
4. **Advertencias**: valor nuevo, posible duplicado, publicado sin fotos o sin existencias, cambio de disponibilidad y producto modificado después de la descarga.
5. **Incidencias**: agrupación en rangos de filas (`"9-12"`) y conteos.
6. **Token**: firma válida, contenido alterado, otra sesión, vencimiento a los 60 minutos y hash de archivo distinto.
7. **Contrato del libro**: la plantilla y la exportación generadas se leen de vuelta con los mismos encabezados, hojas y metadatos. El XML contiene las validaciones esperadas. Un texto que empieza con `=` queda como celda de texto, sin `<f>`. Las tallas siguen el orden de la vitrina.
8. **Contrato de la API**: las respuestas de vista previa y aplicación cumplen los esquemas de [admin-inventory-api.md](./contracts/admin-inventory-api.md), y la vista previa de un archivo de 5.000 productos ocupa menos de 4 MB.

### Integración con PostgreSQL (base desechable)

Usar una base exclusiva para pruebas. La suite borra y vuelve a crear datos.

```powershell
docker exec uniformes-medicos-postgres createdb -U postgres uniformes_medicos_test   # o, con PostgreSQL local: psql -c "CREATE DATABASE uniformes_medicos_test"
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/uniformes_medicos_test"
npx vitest run tests/integration/inventory-apply.test.ts
```

Sin `TEST_DATABASE_URL` la suite se omite. Con la variable debe demostrar:

1. **Atomicidad**: un fallo provocado en mitad de la aplicación deja productos y existencias exactamente como estaban (SC-005).
2. **Doble envío**: dos confirmaciones simultáneas con el mismo token producen un solo resultado aplicado y un conflicto.
3. **Cambios concurrentes**: si un producto incluido se edita entre la vista previa y la confirmación, la confirmación se rechaza sin cambios.
4. **SKU**: el intercambio entre dos productos se aplica correctamente.
5. **Secuencia**: con productos insertados con `legacy_id` explícito y la secuencia atrasada, una alta en bloque no choca con identificadores existentes.
6. **Sin eliminaciones**: no se elimina ningún producto, talla ni imagen, y `category_id` no cambia.
7. **Idempotencia**: aplicar de nuevo el mismo archivo de edición no produce cambios (SC-006).

### Navegador (E2E)

Ejecutar contra una base aislada, porque la prueba crea productos:

```powershell
$env:E2E = "1"
npx playwright test tests/e2e/admin-bulk-inventory.spec.ts --project=chromium --project=mobile
```

La prueba debe cubrir:

- descarga de la plantilla (nombre de archivo y tipo de contenido);
- carga de un archivo válido generado durante la prueba, con vista previa, confirmación y resultado con enlace “Agregar fotos”;
- carga de un archivo con errores, con la confirmación deshabilitada;
- ausencia de desplazamiento horizontal en el proyecto `mobile`.

### Compilación

```powershell
npm run build
```

El build debe completar `astro check` sin errores de tipos y generar la aplicación. Si se despliega en Vercel, comprobar que las funciones de `/api/admin/inventory/*` incluyen las dependencias nuevas.

## Validación manual

### Historia 1: editar el inventario existente

1. Descargar el inventario actual y abrirlo en Excel. Verificar:
   - las hojas Instrucciones, Inventario y Listas;
   - la fecha de generación;
   - el encabezado inmovilizado y la columna ID en gris;
   - que aparecen todos los productos, incluidos los no publicados e inactivos;
   - las columnas de talla en el orden de la vitrina.
2. Cambiar las existencias de tres tallas de productos distintos y el precio de un producto. Escribir una cantidad en una talla que un producto no tenía. Guardar como `.xlsx`.
3. Subir el archivo y comprobar que la vista previa muestra el valor actual y el nuevo de cada cambio, y el número de productos sin cambios. Antes de confirmar, abrir el producto en otra pestaña y comprobar que aún no cambió.
4. Confirmar y comprobar el resumen. Luego revisar `/admin/productos` y la vitrina (`/productos/<id>`): datos, tallas y disponibilidad deben coincidir.
5. Subir otra vez el mismo archivo: el resultado debe ser “El archivo no contiene cambios”.
6. Subir un archivo modificado y pulsar “Cancelar”: nada debe cambiar.

### Historia 2: altas en bloque

1. Descargar la plantilla vacía y revisar:
   - las instrucciones;
   - las listas desplegables de Género, Publicado y Activo;
   - las sugerencias de Tipo, Fabricante, Marca y Color;
   - una columna por cada talla del catálogo.
2. Registrar tres productos nuevos:
   - uno con “Publicado” vacío;
   - uno con una marca nueva;
   - uno con la columna nueva “Talla 4XL”.
3. Subirlo y comprobar los conteos de productos, tallas y unidades, y las advertencias de marca nueva, talla nueva y “publicado sin fotografías” cuando corresponda.
4. Confirmar. Comprobar que:
   - los tres productos existen con ID y URL pública;
   - el producto con “Publicado” vacío no está publicado;
   - “Agregar fotos” abre la edición de cada producto.
5. Subir otra vez el mismo archivo: deben aparecer advertencias de posible duplicado y, si había SKU, errores `SKU_IN_USE`.

### Historia 3: errores sin afectar el inventario

1. Subir un archivo con cantidad negativa, precio `$50`, género “Mujer”, un ID alterado, una celda vaciada en una talla existente y la columna “Color” eliminada. Verificar que:
   - cada error indica fila, columna y motivo;
   - la confirmación está deshabilitada;
   - ningún dato cambió.
2. Intentar subir un CSV, un `.xls`, un `.xlsm`, un `.xlsx` protegido con contraseña y un archivo de más de 4 MB. Cada uno debe rechazarse con su mensaje; la extensión y el tamaño se comprueban sin subir el archivo.
3. Corregir el archivo, subirlo y confirmar.
4. Validar un archivo que edita el producto X. En otra pestaña, editar y guardar X. Al confirmar debe aparecer “El inventario cambió desde la vista previa. No se aplicó ningún cambio”, y “Validar de nuevo” debe mostrar la vista previa actualizada.
5. Cerrar la sesión en otra pestaña y confirmar: debe pedir iniciar sesión sin aplicar cambios.
6. Hacer doble clic en “Confirmar y aplicar cambios”: se aplica una sola vez.

### Historia 4: advertencias

1. Descargar el inventario y luego editar un producto desde el formulario individual.
2. En el archivo descargado antes, cambiar ese producto, agregar un producto idéntico a uno existente y uno publicado sin fotos, usar una marca nueva y dejar en 0 todas las tallas de un producto disponible.
3. Subirlo y verificar que aparecen `MODIFIED_AFTER_DOWNLOAD`, `POSSIBLE_DUPLICATE`, `PUBLISHED_WITHOUT_IMAGES`, `NEW_VALUE` y `BECOMES_UNAVAILABLE`, y que la confirmación sigue habilitada.

### Seguridad

```powershell
curl.exe -i http://localhost:4321/api/admin/inventory/export
curl.exe -i -X POST http://localhost:4321/api/admin/inventory/preview
```

- **Sin sesión**: ambas peticiones deben responder `401` sin datos del inventario.
- **Con sesión pero sin `x-csrf-token`**: la vista previa y la aplicación deben responder `403`.
- **Respuestas**: todas incluyen `Cache-Control: no-store`.
- **Registros del servidor**: no contienen valores de celdas.

### Móvil, teclado y compatibilidad

1. **Móvil**: a 320 píxeles de ancho, la pantalla no se desplaza horizontalmente, los cambios se muestran como tarjetas y los botones miden al menos 44 píxeles.
2. **Teclado**: completar todo el flujo solo con teclado. El foco pasa a la vista previa, a los errores y al resultado, y los estados se anuncian.
3. **Google Sheets**: importar la descarga del inventario, descargarla como `.xlsx` sin cambios y subirla. El resultado debe ser “sin cambios”.
4. **LibreOffice Calc**: repetir el paso anterior.

## Resultados esperados

- Actualizar 50 tallas de distintos productos lleva menos de 10 minutos, y dar de alta 20 productos con el archivo ya completo lleva menos de 3 minutos (SC-001 y SC-002).
- Un archivo de 1.000 productos muestra su vista previa en menos de 30 segundos y se aplica en menos de 1 minuto. Se esperan pocos segundos (SC-003).
- Ningún archivo con errores ni ninguna confirmación fallida modifica datos (SC-004 y SC-005). Volver a aplicar un archivo de edición no cambia nada (SC-006).
- Las solicitudes sin sesión se rechazan (SC-008), y la vitrina muestra una disponibilidad coherente después de cada carga (SC-009).
