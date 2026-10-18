# Quickstart: Validar clientes, pagos financiados y congresos con carga masiva

Esta guía describe cómo demostrar la funcionalidad una vez implementada. No contiene código de implementación: los formatos y reglas están en [contracts/](./contracts/) y [data-model.md](./data-model.md).

## Prerrequisitos

- Node.js 24.x y npm.
- Un PostgreSQL de desarrollo separado de producción, el de `docker-compose.yml` u otro configurado en `DATABASE_URL`.
- `.env` con las variables existentes: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `PUBLIC_SITE_URL`. La funcionalidad no agrega variables ni secretos.
- Acceso de salida a `https://ve.dolarapi.com`, para validar a mano la tasa euro. Las pruebas automatizadas no usan la red.
- Una copia del libro “Uniformes medicos APP.xlsx” de la propietaria, o un libro de prueba con la misma estructura en las pestañas “Medicos” y “Eventos”. No se versiona en el repositorio porque contiene datos personales.
- Microsoft Excel, Google Sheets o LibreOffice Calc.
- Navegadores de Playwright para la validación E2E (`npx playwright install chromium webkit`).
- **Requisito de publicación**: la constitución vigente es la 1.1.1, aprobada el 2026-10-18 (enmienda aclaratoria de [research.md](./research.md), Decision 16), por lo que las historias 3, 4 y 5 pueden publicarse.

## Preparar y ejecutar

Desde la raíz del repositorio:

```powershell
npm install
npm run docker:up
npm run db:migrate
npm run owner:seed
npm run dev
```

Comprobar que la migración `0003_clientes_financiamientos_congresos` creó las tablas y la restricción diferible del celular:

```powershell
docker exec uniformes-medicos-postgres psql -U postgres -d uniformes_medicos -c "\dt clients|financings|installments|euro_rates|congresses" -c "SELECT conname, condeferrable FROM pg_constraint WHERE conname = 'clients_phone_unique';"
```

`condeferrable` debe ser `t`. Abrir `http://localhost:4321/admin`, iniciar sesión y comprobar que la navegación muestra Clientes, Pagos financiados y Congresos.

## Validación automatizada

### Unitarias y de contrato

```powershell
npm run test
```

Las suites deben cubrir como mínimo:

1. **Celular**:
   - `4142467789`, `04142467789`, `0414-246.77.89`, `+58 414 246 7789` y `584142467789` dan `+584142467789`;
   - `+57 300 123 4567` es válido;
   - 9 y 11 dígitos sin el 0 son inválidos, como las dos filas anómalas de “Medicos”;
   - el formato de presentación es `0414-246-7789`.
2. **Claves normalizadas**: “Los magallanes” y “Los Magallanes” coinciden. La escritura canónica es la más usada, y en caso de empate la primera alfabéticamente. Los encabezados “Clinica” y “Clínica” equivalen.
3. **Calendario de cuotas**:
   - el ejemplo de la especificación: compra el 18/10/2026 y $100,00 en 4 cuotas quincenales dan 31/10, 15/11, 30/11 y 15/12;
   - la primera cuota el 20/10 da 31/10, 15/11 y 30/11;
   - mensual del 31/01 da 28/02, o 29/02 en 2028, y luego 31/03;
   - semanal suma 7 días;
   - cambio de año de diciembre a enero;
   - $100,00 en 3 cuotas da 33,33, 33,33 y 33,34;
   - inicial con vencimiento en la fecha de compra;
   - de 1 a 48 cuotas.
4. **Estados y montos**:
   - Al día, Con cuotas vencidas, Pagado y Anulado;
   - vencida, vence hoy y por vencer, con los días de atraso;
   - “2 de 4” e “Inicial”, también después de dividir una cuota;
   - $20,00 × Bs 50,00 = Bs 1.000,00 y $25,00 × Bs 991,16 = Bs 24.779,00;
   - redondeo half-up de la tasa: `991.16445734` da `991.16` y `18.735` da `18.74`.
5. **Tasa aplicable**: un día hábil, un sábado y un domingo (que usan el viernes), el feriado del 12/10/2026 (que usa el 09/10) y una fecha anterior a la primera tasa (sin tasa).
6. **Calendario de congresos**:
   - un congreso del 30/10 al 01/11/2026 se pinta en octubre y en noviembre;
   - uno de un solo día;
   - tres superpuestos ocupan carriles distintos, y con `maxLanes = 2` aparece “+1 más”;
   - la semana empieza en domingo;
   - el día de hoy está marcado;
   - un mes sin congresos muestra la sugerencia del próximo.
7. **Fechas de Excel**: `Date` a las 00:00 UTC, `12/03/2026`, `2026-03-12`, un número de serie 46.093 y `31/02/2026` (inválida).
8. **Filas y cambios por sección**:
   - Clientes: identificador frente a celular, celdas vacías que borran o conservan según la fila, `PHONE_REPEATED`, `PHONE_IN_USE`, intercambio de celulares, `DUPLICATE_TARGET`, `NEW_VALUE`, `SAME_NAME` y fila sin cambios.
   - Financiamientos: `CLIENT_NOT_FOUND`, `CLIENT_NAME_MISMATCH`, `INITIAL_TOO_HIGH`, `PAID_COUNT_TOO_HIGH`, `FIRST_DUE_BEFORE_PURCHASE`, `FUTURE_PURCHASE_DATE`, Frecuencia vacía igual a Quincenal y `POSSIBLE_DUPLICATE`.
   - Congresos: `END_BEFORE_START`, `LONG_EVENT`, `ALREADY_ENDED` y `POSSIBLE_DUPLICATE`.
9. **Token**: un token emitido para Clientes no vale para Congresos ni en otra sesión, y vence a los 60 minutos.
10. **WhatsApp y formatos**: el mensaje de recordatorio con y sin tasa, vencido y por vencer; `formatBolivares` y `formatEuroRate`.
11. **Contrato de los libros**:
    - las tres plantillas y las dos exportaciones se leen de vuelta con sus hojas, encabezados en orden, metadatos (incluida “Sección”) y validaciones en el XML;
    - un texto que empieza con `=` queda como celda de texto;
    - un libro cuya primera hoja es “Medicos”, con los encabezados reales, se procesa en Clientes;
    - un libro con “Sección: Congresos” subido a Clientes da `WRONG_SECTION`.
12. **Contrato de la API**: las respuestas cumplen los esquemas de [contracts/admin-api.md](./contracts/admin-api.md). La vista previa de 10.000 clientes, 2.000 financiamientos y 10.000 congresos ocupa menos de 4 MB.
13. **Regresión de la 003**: todas las suites existentes de inventario (`inventory-*.test.ts`, `inventory-workbook.test.ts` e `inventory-api-response.test.ts`) pasan sin modificarse después de extraer `src/server/bulk/`.

### Integración con PostgreSQL (base desechable)

```powershell
docker exec uniformes-medicos-postgres createdb -U postgres uniformes_medicos_test
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/uniformes_medicos_test"
npx vitest run tests/integration
```

Sin `TEST_DATABASE_URL` las suites se omiten. Con la variable deben demostrar:

1. **Migración**: la 0003 se aplica sobre una base con la 0002 y se puede volver a ejecutar el conjunto de migraciones sin errores.
2. **Clientes**:
   - alta con un celular repetido escrito de otra forma da `409`;
   - un cliente con financiamientos no se puede eliminar, ni por la API ni por `RESTRICT` cuando el financiamiento se crea en paralelo;
   - la búsqueda “alvarez” encuentra “Álvarez”;
   - con 10.000 clientes de prueba, la búsqueda y los filtros responden en menos de 2 s.
3. **Carga masiva de clientes**:
   - un fallo provocado a mitad de la aplicación deja todo como estaba;
   - dos confirmaciones simultáneas con el mismo token producen un único resultado aplicado y un `409`;
   - una edición individual entre la vista previa y la confirmación provoca `409`;
   - dos clientes intercambian su celular correctamente;
   - volver a subir el mismo archivo no produce cambios.
4. **Pagos**:
   - dos pagos simultáneos de la misma cuota producen uno aplicado y un `409`;
   - un pago parcial crea la cuota pendiente con el resto y la misma fecha;
   - deshacer un pago lo devuelve a pendiente;
   - pagar una cuota de un financiamiento anulado da `409`;
   - eliminar un financiamiento con pagos da `409`;
   - una edición con `expectedUpdatedAt` antiguo da `409`;
   - los `CHECK` impiden pagos incoherentes, por ejemplo `VES` sin tasa.
5. **Carga masiva de financiamientos**: crea calendarios, deja pagadas las cuotas de `Cuotas pagadas` con origen “carga masiva”, rechaza un doble envío y no se ve afectada por un cliente que intenta eliminarse en paralelo (`FOR KEY SHARE`).
6. **Carga masiva de congresos**: altas, ediciones, borrado de opcionales en filas con identificador y ninguna eliminación.
7. **Tasa euro** (con `fetch` simulado): la primera sincronización inserta el histórico; con la fuente caída se usa la última tasa guardada; sin tasas, la respuesta es `unavailable`; una tasa existente no se sobrescribe.

### Navegador (E2E)

Las pruebas E2E crean datos reales, así que se ejecutan contra una base aislada. Si ya hay un `npm run dev` en el puerto 4321 conectado a la base de desarrollo, `reuseExistingServer` lo reutilizaría: levanta un servidor aparte con la base `_test` y apunta Playwright a él. Ejecuta `chromium` y `mobile` por separado, porque comparten la base:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/uniformes_medicos_test"   # base aislada
npm run owner:seed
Start-Process node -ArgumentList "node_modules\astro\astro.js","dev","--host","127.0.0.1","--port","4322"
$env:E2E = "1"
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4322"
npx playwright test tests/e2e/admin-clients.spec.ts tests/e2e/admin-financing.spec.ts tests/e2e/admin-congresses.spec.ts tests/e2e/admin-nav.spec.ts tests/e2e/admin-bulk-inventory.spec.ts --project=chromium
npx playwright test tests/e2e/admin-clients.spec.ts tests/e2e/admin-financing.spec.ts tests/e2e/admin-congresses.spec.ts tests/e2e/admin-nav.spec.ts tests/e2e/admin-bulk-inventory.spec.ts --project=mobile
```

Con `TEST_DATABASE_URL` definida, Vitest ejecuta los archivos de uno en uno porque las suites de integración comparten y vacían la misma base. La vista previa de una carga masiva detalla como máximo 3.000 cambios (`omittedChanges` informa los demás, que se aplican igual).

Contra una base aislada y en escritorio y móvil, los recorridos deben cubrir:

- importar clientes desde un libro generado con la estructura de “Medicos” como primera hoja;
- registrar un financiamiento desde la ficha de un cliente;
- registrar un pago en bolívares con tasa escrita a mano;
- crear un congreso de varios días y verlo pintado;
- abrir la vista de lista;
- recorrer la navegación del panel a 320 px sin desplazamiento horizontal.

### Compilación

```powershell
npm run build
```

`astro check` no debe reportar errores, y la compilación debe terminar con el adaptador correspondiente.

## Validación manual

### Historia 1: base de clientes

1. Registrar “Ana Pérez” con el celular `0414 123 4567`, Sexo Mujer, Talla M y Especialidad “medicina interna”. Comprobar que la especialidad se guarda como “Medicina Interna” si ya existía.
2. Buscar “ana”, “perez” (sin tilde) y “4123”, y comprobar que aparece.
3. Filtrar por especialidad y ciudad, comprobar el número de resultados y luego “Quitar filtros”.
4. Intentar registrar otro cliente con `+58 414-1234567` y comprobar que el mensaje nombra a Ana Pérez con enlace.
5. Eliminar un cliente sin financiamientos. Comprobar que en uno con financiamientos el botón está deshabilitado con la explicación.

### Historia 2: importación de clientes

1. Descargar la plantilla vacía y comprobar las columnas `Nombre, Celular, Sexo, Talla, Ciudad, Hospital, Clínica, Especialidad, Notas, Identificador`, las instrucciones y las listas.
2. Subir el libro “Uniformes medicos APP.xlsx” tal como está. Comprobar que la vista previa indica “Se procesó la hoja «Medicos»” y que muestra unos 2.059 clientes nuevos y 2 errores `INVALID_PHONE`, con su fila, sin permitir confirmar. También debe advertir de los nombres repetidos (`SAME_NAME`) y de los valores nuevos (`NEW_VALUE`). En una base vacía todos los valores de ciudad, hospital, clínica, especialidad y talla son nuevos, y la lista agrupada por valor permite detectar errores como “Anatonia Patológica”.
3. Corregir los dos celulares en Excel, volver a subir y confirmar. Comprobar que “Los magallanes” quedó como “Los Magallanes” y que el tiempo total es menor de 15 minutos (SC-001).
4. Completar en el panel la talla de un cliente que la tenía vacía. Volver a subir el libro original y comprobar que esa fila no cambia (celda vacía en una fila reconocida por celular), y que la vista previa indica “sin cambios” para el resto.
5. Descargar los clientes actuales, vaciar la ciudad de un cliente y cambiar el celular de otro. Subir el archivo y comprobar “Ciudad: … → se borrará” y el cambio de celular. Confirmar.

### Historia 3: registrar un financiamiento

1. Desde la ficha de Ana Pérez, elegir “Nuevo financiamiento”: $100,00, sin inicial, 4 cuotas quincenales con fecha de compra 18/10/2026. Comprobar las fechas 31/10, 15/11, 30/11 y 15/12 y las cuotas de $25,00.
2. Cambiar el total a $100,00 en 3 cuotas y comprobar $33,33, $33,33 y $33,34.
3. Agregar una inicial de $20,00 y comprobar que vence en la fecha de compra.
4. Mover una fecha antes de guardar y comprobar el nuevo total.
5. Guardar y comprobar el financiamiento en la ficha del cliente y en la lista de pagos.
6. Editar las cuotas pendientes (cambiar una fecha, agregar y quitar una cuota) y comprobar el total y el saldo.
7. Intentar eliminar después de registrar un pago y comprobar que se ofrece anular. Anular y luego restaurar.

### Historia 4: pagos y seguimiento

1. Con una cuota vencida, comprobar en `/admin/pagos-financiados` el resumen (por cobrar, vencido, 15 días y cobrado en el mes), la etiqueta “Vencida hace N días” y la línea de la tasa con su fecha.
2. Registrar el pago en bolívares con la tasa propuesta. Comprobar el monto en Bs calculado en vivo, el saldo y los totales actualizados y, en el detalle, la tasa, su fecha y el origen “oficial”.
3. Registrar otro pago cambiando la tasa a mano y comprobar el origen “escrita a mano”.
4. Seleccionar dos cuotas y registrarlas en dólares en una sola acción.
5. Registrar un pago parcial de $10,00 sobre una cuota de $25,00 y comprobar la cuota pagada de $10,00 y la pendiente de $15,00 con la misma fecha.
6. Deshacer un pago y comprobar que todo vuelve atrás.
7. Hacer doble clic en “Registrar pago” y comprobar que se registra una sola vez.

### Historia 5: carga masiva de financiamientos

1. Descargar la plantilla y comprobar las columnas, la frecuencia en lista y la hoja de clientes.
2. Completar los ejemplos de [contracts/bulk-workbooks.md](./contracts/bulk-workbooks.md) más una fila con un celular inexistente. Comprobar que `CLIENT_NOT_FOUND` impide confirmar.
3. Corregir, subir y comprobar el resumen (cuotas, monto financiado y saldo pendiente), “Ver fechas” y la advertencia de nombre distinto.
4. Confirmar, comprobar que las cuotas indicadas figuran como “Pagada (registrada por carga masiva)” y volver a subir el mismo archivo para comprobar `POSSIBLE_DUPLICATE`.

### Historia 6: calendario de congresos

1. Registrar “Congreso Venezolano de Mastología” del 30/10 al 01/11/2026 y otro de un día el 31/10.
2. Comprobar en octubre y en noviembre las franjas continuas, los dos carriles el 31/10 y que cada franja enlaza al detalle.
3. Navegar entre meses, volver a “Hoy” y comprobar el día de hoy marcado.
4. Elegir un día vacío y comprobar que el formulario propone esa fecha de inicio.
5. Intentar guardar con Hasta anterior a Desde y comprobar el error.
6. En un teléfono, comprobar las barras de color en los días y la lista del mes debajo. Abrir la vista de lista.

### Historia 7: carga masiva de congresos

1. Pegar las filas de la pestaña “Eventos” en la plantilla y subirla. Comprobar el error `REQUIRED` en la fila de Medicina Estética sin fechas.
2. Quitar esa fila y confirmar. Comprobar los congresos en el calendario y la advertencia `ALREADY_ENDED` de los de marzo a julio de 2026.
3. Descargar los congresos actuales, cambiar un lugar y subirlos para comprobar el cambio.

### Historia 8: WhatsApp

1. En la ficha de un cliente, “Escribir por WhatsApp” abre `wa.me` con su número.
2. En una cuota vencida, “Recordar por WhatsApp” abre el mensaje con la descripción, la cuota, “vencida el …”, el monto en `$` y el equivalente en Bs con la tasa y su fecha.

### Tasa euro contra la fuente

- **Un día hábil**: comparar la tasa que muestra la sección con la de bcv.org.ve. Debe coincidir con 2 decimales, por ejemplo Bs 991,16 por € para la fecha valor 19/10/2026.
- **Un sábado o domingo**: comprobar que se usa la tasa del viernes (o la del último día hábil).
- **Sin red**: bloquear temporalmente la salida a `ve.dolarapi.com` o apagar la red de la máquina de desarrollo y comprobar dos casos:
  - la sección sigue funcionando, con la nota “No se pudo actualizar” y la última tasa guardada;
  - con la base sin tasas, un pago en bolívares exige escribir la tasa.

### Seguridad

- **Sin sesión**:
  - `GET /api/admin/clients`, `GET /api/admin/financings/installments`, `GET /api/admin/euro-rate` y las descargas de plantillas responden `401`;
  - las páginas `/admin/clientes`, `/admin/pagos-financiados` y `/admin/congresos` redirigen a `/admin/login`.
- **Con sesión pero sin cabecera `x-csrf-token`, o con otro `Origin`**: `POST /api/admin/clients`, `POST /api/admin/financings/payments` y `POST /api/admin/congresses/bulk/apply` responden `403` sin cambios.
- **Vitrina pública**: no muestra ningún dato de clientes, financiamientos ni congresos, y el pedido de WhatsApp de la bolsa no cambió.
- **Registros del servidor**: durante una importación de clientes solo aparecen códigos, conteos y duraciones, sin nombres, celulares ni notas.

### Móvil, teclado y compatibilidad

- **A 320 px**: el menú del panel se abre con “Menú”, las listas se ven como tarjetas, el diálogo de pago cabe en la pantalla y el calendario no se desplaza horizontalmente.
- **Teclado**: se pueden recorrer la lista de clientes, el formulario de financiamiento con el calendario editable, el diálogo de pago (que se cierra con Escape y devuelve el foco) y la vista de lista de congresos.
- **Lector de pantalla**: se anuncian “Pago registrado”, “Cliente guardado”, el cambio de mes y los errores de la carga masiva.
- **Hojas de cálculo**: abrir y guardar las plantillas en Excel, Google Sheets (descargando como .xlsx) y LibreOffice Calc. Comprobar que se suben sin errores de formato y que Celular conserva el 0 inicial.

## Resultados esperados

| Criterio | Resultado esperado |
|---|---|
| SC-001 | La importación de los médicos de la propietaria, con la corrección de 2 celulares, se completa en menos de 15 minutos |
| SC-002 | Encontrar a un cliente entre más de 2.000 lleva menos de 10 segundos |
| SC-003 | Registrar un financiamiento lleva menos de 2 minutos y un pago menos de 30 segundos |
| SC-004 | El 100% de las pruebas de sumas, saldos y montos en bolívares coinciden con las fórmulas |
| SC-005 | Las cuotas vencidas y su total se identifican en menos de 1 minuto |
| SC-006 | Cada congreso se pinta exactamente en sus días, también entre meses y con superposiciones |
| SC-007 | Un archivo de 5.000 filas se valida en menos de 30 s y se refleja en menos de 1 minuto |
| SC-008 y SC-009 | Ningún archivo con errores cambia datos, no hay estados parciales y volver a subir un archivo de clientes o congresos ya aplicado no produce cambios |
| SC-010 | Todas las solicitudes sin sesión se rechazan y ningún dato aparece en la vitrina |
| SC-011 | Los pagos en bolívares de un día hábil usan la tasa oficial sin escribirla |
| Regresión | La carga masiva de inventario funciona igual que antes de esta funcionalidad |
