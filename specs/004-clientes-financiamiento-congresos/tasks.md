# Tasks: Clientes, pagos financiados y congresos con carga masiva

**Input**: Design documents from `/specs/004-clientes-financiamiento-congresos/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/bulk-workbooks.md](./contracts/bulk-workbooks.md), [contracts/admin-api.md](./contracts/admin-api.md), [contracts/admin-ui.md](./contracts/admin-ui.md), [contracts/euro-rate-source.md](./contracts/euro-rate-source.md), [quickstart.md](./quickstart.md)

**Tests**: Se incluyen tareas de pruebas por tres razones: la constitución exige verificar las rutas críticas del panel antes de publicarlas, `AGENTS.md` pide migraciones versionadas y pruebas para los cambios de esquema y las reglas críticas, y el plan define cuatro niveles de verificación más la regresión de la 003 (research.md, Decision 17). En cada fase, las pruebas se escriben antes de la implementación correspondiente y deben comenzar fallando. Las pruebas unitarias, de contrato y de integración nunca llaman a la red real, y las E2E no dependen de ella.

**Governance**: La constitución 1.1.1, aprobada el 2026-10-18, permite registrar acuerdos de financiamiento y cobros hechos fuera de la aplicación. No queda ninguna tarea de gobernanza pendiente: las historias 3, 4 y 5 pueden publicarse cuando superen sus puertas de calidad.

**Organization**: Las tareas están agrupadas por historia de usuario. La fase 2 deja listos el esquema, las utilidades compartidas, el motor de carga masiva extraído de la 003 y los componentes comunes del panel. Después, cada historia aporta su sección (datos, servicio, endpoints y pantallas) y su entrada en la navegación, así que cada incremento se puede publicar sin enlaces rotos.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fijar la línea base de regresión de la 003, alinear los documentos con la enmienda aprobada y preparar los libros de prueba. No se agregan dependencias ni variables de entorno.

- [X] T001 Comprobar la línea base de las suites de la 003 en `tests/unit/`, `tests/contract/` y `tests/integration/` antes de tocar el código:
  - `npm.cmd run test` debe pasar, en particular las suites de la 003 `tests/unit/inventory-changes.test.ts`, `tests/unit/inventory-issues.test.ts`, `tests/unit/inventory-preview-token.test.ts`, `tests/unit/inventory-rows.test.ts`, `tests/contract/inventory-workbook.test.ts` y `tests/contract/inventory-api-response.test.ts`.
  - Con `TEST_DATABASE_URL` apuntando a una base cuyo nombre termine en `_test`, también debe pasar `npx vitest run tests/integration/inventory-apply.test.ts`.
  - Si algo falla antes de empezar, detenerse y avisar, porque la regresión de T033 se mide contra este resultado.
- [X] T002 [P] Reflejar en los documentos de `specs/004-clientes-financiamiento-congresos/` que la enmienda 1.1.1 se aprobó el 2026-10-18, sin otros cambios:
  - **`specs/004-clientes-financiamiento-congresos/plan.md`**: las siguientes partes dejan de describir una acción pendiente y citan la constitución 1.1.1:
    - la fila “Restricciones de producto y plataforma” del Constitution Check;
    - el “Resultado”;
    - el punto 16 de “Phase 0”;
    - la nota 1 de “Notas para la generación de tareas”;
    - el punto “Restricciones” del re-check.
  - **`specs/004-clientes-financiamiento-congresos/research.md`**: el título y el párrafo final de la Decision 16 indican que la enmienda se aprobó.
  - **`specs/004-clientes-financiamiento-congresos/quickstart.md`**: el “Requisito de publicación” indica que la constitución vigente es la 1.1.1.
- [X] T003 [P] Crear `tests/fixtures/bulk/workbook-builder.ts` con `write-excel-file/node`, como `tests/fixtures/inventory/workbook-builder.ts`. No se versionan archivos `.xlsx` y todos los datos son inventados. Debe ofrecer:
  - `sectionMetadataRows({ section, kind, generatedAt, version })`: devuelve los pares etiqueta/valor `Sección`, `Tipo de archivo`, `Generado (UTC)` y `Versión del formato`, y omite los que llegan como `undefined`.
  - `buildWorkbookBuffer(sheets: Array<{ name: string; rows: RawCell[][] }>)`: genera un libro con las hojas en ese orden. Sirve para armar plantillas de sección, libros sin metadatos o libros cuya primera hoja es otra.
  - `medicosWorkbook(rows)`: genera un libro de dos hojas:
    - la primera, `Medicos`, con el encabezado real `Nombre, Celular, Sexo, Talla, Ciudad, Hospital, Clinica, Especialidad` (sin tilde) y celulares numéricos de 10 dígitos;
    - la segunda, `Eventos`, con `Desde, Hasta, Especialidad, Lugar, Nombre` y fechas `Date` a las 00:00 UTC.
  - La reexportación de los generadores de entradas inválidas del builder de inventario, sin copiarlos: `plainTextBytes`, `oleContainerBytes`, `zipWithoutWorkbook`, `zipWithMacros`, `zipWithManyEntries` y `truncatedZip`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Crear la base que comparten todas las historias:

- la migración 0003 y el esquema;
- las utilidades isomorfas compartidas;
- los estados derivados de financiamientos y cuotas;
- los valores de referencia;
- el motor de carga masiva extraído de la 003, con su regresión;
- los componentes comunes del panel.

**⚠️ CRITICAL**: No comenzar ninguna historia de usuario hasta completar esta fase.

### Tests for Foundational

- [X] T004 [P] Escribir `tests/integration/schema-0003.test.ts`. Se omite sin `TEST_DATABASE_URL`, usa `setupTestDatabase` y `resetSections` (T022) y debe fallar inicialmente. Debe comprobar:
  - **Tablas**: las cinco tablas existen, y `SELECT condeferrable FROM pg_constraint WHERE conname = 'clients_phone_unique'` devuelve `true`.
  - **Identidad**: insertar un `ref` explícito falla, porque la identidad es `GENERATED ALWAYS`.
  - **Celular**:
    - un `phone_e164` que no cumple `^\+[1-9][0-9]{7,14}$` falla;
    - un celular repetido falla con `23505`;
    - dentro de una transacción con `SET CONSTRAINTS clients_phone_unique DEFERRED`, dos clientes pueden intercambiar su celular.
  - **Textos y relaciones**:
    - un texto opcional vacío (`''`) falla;
    - eliminar un cliente con financiamientos falla con `23503`;
    - eliminar un financiamiento elimina sus cuotas.
  - **Coherencia de `installments`**: los `CHECK` rechazan estos casos:
    - una cuota `pendiente` con `paid_on`;
    - una cuota `pagada` sin `payment_origin`;
    - una cuota `pagada` de origen `panel` sin `paid_on`;
    - una cuota `pagada` de origen `carga_masiva` con `payment_currency`;
    - un pago `VES` sin `euro_rate`;
    - un pago `VES` con tasa `oficial` sin `euro_rate_date`;
    - un pago `USD` con `amount_ves`.
  - **Otros `CHECK`**: también fallan `amount_usd = 0`, una segunda cuota inicial en el mismo financiamiento, `congresses.end_date < start_date` y `euro_rates.value = 0`.
- [X] T005 [P] Escribir `tests/unit/phone.test.ts` para `src/utils/phone.ts`. Debe fallar inicialmente y comprobar:
  - **`normalizePhone`**:
    - `4142467789` (número), `"04142467789"`, `"0414-246.77.89"`, `"(0414) 246 7789"`, `"+58 414 246 7789"` y `"584142467789"` dan `+584142467789`;
    - `"+57 300 123 4567"` da `+573001234567`, y `"+1 305 555 1234"` da `+13055551234`;
    - son inválidos: 9 dígitos, 11 dígitos sin 0 inicial, `+58` seguido de un 0 o de 9 u 11 dígitos, `+` con menos de 8 o más de 15 dígitos, letras y vacío.
  - **`formatPhone`**: `+584142467789` da `0414-246-7789`, y `+13055551234` se queda igual.
  - **`phoneSearchDigits`**: `"0414-123"` da `"414123"`, `"+58 414"` da `"414"`, `"584142467789"` da `"4142467789"` y `"4123"` da `"4123"`. Con menos de 3 dígitos devuelve `null`.
- [X] T006 [P] Escribir `tests/unit/text-keys.test.ts` para `normalizeKey`:
  - `"  Los   Magallanes "` y `"los magallanes"` dan `"los magallanes"`;
  - `"Clínica"`, `"Clinica"` y `"CLÍNICA"` dan el mismo resultado;
  - `"Álvarez"` da `"alvarez"`;
  - para esos mismos textos, `normalizeHeader` de `src/server/inventory/workbook-format.ts` devuelve lo mismo que `normalizeKey`.
- [X] T007 [P] Escribir `tests/unit/dates.test.ts` para `src/utils/dates.ts`:
  - **`todayInCaracas`**: `2026-10-19T03:59:59Z` da `2026-10-18`, y `2026-10-19T04:00:00Z` da `2026-10-19`.
  - **Aritmética**:
    - `isValidIsoDate("2026-02-31")` es falso;
    - `addDays` cruza meses y años;
    - `lastDayOfMonth` da 29 en febrero de 2028 y 28 en febrero de 2026;
    - `daysBetween` cuenta días completos.
  - **Formatos**:
    - `formatDate("2026-10-30")` da `30/10/2026`;
    - `formatMonthYear("2026-10")` da `octubre de 2026`;
    - `formatLongDate("2026-10-12")` da `12 de octubre de 2026`;
    - `formatLongDateRange("2026-10-30", "2026-11-01")` da `del 30 de octubre al 1 de noviembre de 2026`;
    - `monthRange("2026-02")` da `{ start: "2026-02-01", end: "2026-02-28" }`.
- [X] T008 [P] Escribir `tests/unit/whatsapp.test.ts` con el bloque `describe("whatsappUrl")`:
  - `whatsappUrl("+584142467789")` da `https://wa.me/584142467789`;
  - con texto, agrega `?text=` con el texto codificado por `encodeURIComponent`;
  - el resultado nunca contiene `+`.
- [X] T009 [P] Escribir `tests/unit/financing-state.test.ts` para las funciones puras de `src/server/financing/summary.ts`:
  - **`deriveFinancingStatus`**: Anulado tiene prioridad. Es Pagado si no quedan cuotas pendientes, Con cuotas vencidas si alguna pendiente vence antes de hoy, y Al día en los demás casos.
  - **`installmentState`**: devuelve `vencida` con `daysOverdue = hoy − vencimiento`, `vence_hoy`, `por_vencer` o `pagada`.
  - **`installmentLabels`**:
    - el orden es `is_initial DESC, due_date, created_at, id`;
    - la inicial se llama “Inicial” y las demás “n de m”, donde m es el número de cuotas que no son la inicial;
    - tras dividir una cuota, las dos cuotas con la misma fecha se numeran según `created_at`.
  - **`totals`**: total, pagado y saldo son exactos con montos `"33.33"`, `"33.33"` y `"33.34"`.
- [X] T010 [P] Escribir `tests/unit/reference-values.test.ts` para `buildReferenceIndex` y `canonicalize` de `src/server/reference/values.ts`:
  - agrupa los valores por `normalizeKey` e ignora los vacíos;
  - la escritura canónica es la más usada y, si hay empate, la primera en orden alfabético;
  - `"los magallanes"` se guarda como `"Los Magallanes"` (`isNew: false`), y un valor nuevo se conserva recortado (`isNew: true`);
  - las tallas combinan clientes y variantes del catálogo, y las especialidades combinan clientes y congresos.
- [X] T011 [P] Escribir `tests/unit/bulk-cells.test.ts` para `src/server/bulk/cells.ts`:
  - **Fechas**:
    - un `Date` `2026-03-12T00:00:00Z` da `"2026-03-12"`, usando sus componentes UTC;
    - `"12/03/2026"`, `"12-03-2026"`, `"12.3.2026"`, `"2026-03-12"` y el número de serie `46093` dan lo mismo;
    - `36525`, `73051`, `"31/02/2026"`, `"marzo"` y un booleano dan `INVALID_DATE`.
  - **Montos** (`parseDecimalCell`), con las opciones de las secciones nuevas (mayor que 0 y máximo 9.999.999.999,99):
    - `"25"` da 2500 centavos, `"25,5"` da 2550 y `49.990000000000002` da 4999;
    - `"$50"` y `0` dan `INVALID_AMOUNT`;
    - `"1.250"` y `49.999` dan `AMOUNT_DECIMALS`;
    - `10000000000` da `AMOUNT_TOO_HIGH`.
  - **Enteros**: `"4"` da 4; `2.5`, `-1` y `"x"` dan el código indicado.
  - **Identificador**: `15` y `"15"` dan 15 y vacío da `null`; `"abc"`, `0` y `1.5` dan `INVALID_ID`.
  - **Opciones cerradas**: `"mujer"` y `" HOMBRE "` dan `Mujer` y `Hombre`; `"M"` da el código indicado.
  - **Textos**:
    - un texto obligatorio vacío da `REQUIRED`;
    - un texto más largo que el máximo da `TOO_LONG` con `n`;
    - un `Date` o un booleano dan `INVALID_TYPE`;
    - un número se convierte a texto.
  - **Celular**: el número `4142467789` da `+584142467789`, y uno inválido da `INVALID_PHONE`.
- [X] T012 [P] Escribir `tests/unit/bulk-preview-token.test.ts` para `src/server/bulk/preview-token.ts`:
  - **Compatibilidad con la 003**: un token firmado con `signPreviewToken` de `src/server/inventory/preview-token.ts` se verifica con `verifyBulkPreviewToken(token, sessionToken, "inventory-preview")`, es decir, la clave de la 003 no cambia.
  - **Tokens de sección**: llevan `{ v: 1, section, fileSha256, baseline, issuedAt, expiresAt }` firmado con `sha256(sessionToken + "|bulk-preview:" + section)`. Uno de `clientes` no vale para `congresos` ni con otro `sessionToken`.
  - **Integridad y vencimiento**:
    - un contenido alterado es inválido;
    - el token vence exactamente en `issuedAt + 60 min`, con reloj inyectable;
    - una firma de otra longitud no lanza errores.
  - **`assertApplicableToken`**: responde 409 con el mensaje que corresponde a cada caso: “La vista previa no es válida. Valida el archivo de nuevo.”, “La vista previa venció. Valida el archivo de nuevo.” o “El archivo no coincide con el de la vista previa.”.
- [X] T013 [P] Escribir `tests/unit/bulk-sheet.test.ts` para `readSectionSheet` de `src/server/bulk/sheet.ts`, con libros de T003 y esta definición de prueba: `Nombre` y `Celular` obligatorias, `Celular del cliente` como alias de `Celular`, `Notas` opcional e `Identificador`. Debe comprobar:
  - **Hoja procesada**: procesa la hoja cuyo nombre normalizado es el de la sección y, si no existe, la primera hoja. Informa la hoja leída en `sheetName` (por ejemplo, `Medicos`).
  - **Metadatos**: los lee de `Instrucciones` por etiqueta:
    - `Sección`;
    - `Tipo de archivo`: `Plantilla vacía` da `plantilla`, `Datos actuales` da `datos` y otro valor da `desconocido`;
    - `Generado (UTC)`;
    - `Versión del formato`.
  - **Sección**: una `Sección` distinta da `WRONG_SECTION` con el mensaje de `contracts/admin-api.md`; sin `Sección`, no hay error.
  - **Encabezados**: los reconoce en cualquier orden, con otras mayúsculas, tildes o espacios, y por alias. Informa:
    - `DUPLICATE_COLUMN`;
    - `MISSING_COLUMNS`, con todas las columnas faltantes;
    - `IGNORED_COLUMNS`, como aviso;
    - `NO_ROWS`;
    - `TOO_MANY_ROWS`, con `n` y el límite.
  - **Filas**: ignora las filas vacías y conserva en `excelRow` el número de fila de Excel.
  - **Metadatos ausentes**: emite `MISSING_METADATA` solo si falta `Generado (UTC)` y alguna fila tiene `Identificador`.
- [X] T014 [P] Crear `tests/e2e/helpers/admin.ts` con `login(page)` y `downloadFile(page, linkName)` para los specs nuevos, sin modificar los existentes. Escribir también `tests/e2e/admin-nav.spec.ts`, que se omite sin `E2E` como `tests/e2e/admin.spec.ts`. Con sesión, en los proyectos `chromium` y `mobile`, debe comprobar:
  - cada enlace de la navegación responde sin error, y su página lo marca con `aria-current="page"`;
  - con 320 px de ancho, los enlaces están dentro de “Menú”, que se abre con teclado;
  - “Salir” sigue visible;
  - no hay desplazamiento horizontal: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

### Implementation for Foundational

- [X] T015 Crear `drizzle/0003_clientes_financiamientos_congresos.sql`, escrita a mano como `drizzle/0001_initial_catalog.sql` y sin modificar tablas existentes. Agregar en `drizzle/meta/_journal.json` la entrada `{ "idx": 2, "version": "7", "when": 1792281600000, "tag": "0003_clientes_financiamientos_congresos", "breakpoints": true }`; su `when` es mayor que el `1792195200000` de la 0002. El contenido sigue data-model.md:
  - **Enums**: `client_sex` (`Mujer`, `Hombre`), `financing_frequency` (`semanal`, `quincenal`, `mensual`), `installment_status` (`pendiente`, `pagada`), `payment_currency` (`USD`, `VES`), `rate_source` (`oficial`, `manual`) y `record_origin` (`panel`, `carga_masiva`).
  - **`clients`**:
    - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
    - `ref integer GENERATED ALWAYS AS IDENTITY`, con `CONSTRAINT clients_ref_unique UNIQUE (ref)`;
    - `name`: “Obligatorio; de 1 a 160 caracteres sin espacios sobrantes”;
    - `phone_e164 text NOT NULL`, con “`CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')`; `UNIQUE DEFERRABLE INITIALLY IMMEDIATE` (`clients_phone_unique`)”;
    - `sex client_sex`;
    - `size`: “Opcional; como máximo 40 caracteres”;
    - `city`, `hospital`, `clinic` y `specialty`: “Opcionales; como máximo 160 caracteres”;
    - `notes`: “Opcional; como máximo 1.000 caracteres”;
    - `search_text text NOT NULL`;
    - `created_at` y `updated_at`, `timestamptz NOT NULL DEFAULT now()`;
    - `CHECK` que impidan la cadena vacía en los textos opcionales, que “se guardan como `NULL`, nunca como cadena vacía”;
    - índice `clients_search_idx (search_text, ref)`.
  - **`financings`**:
    - `id` y `ref` como en `clients`, con `financings_ref_unique`;
    - `client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT`;
    - `description`: “Obligatoria; de 1 a 500 caracteres”;
    - `purchase_date date NOT NULL`;
    - `frequency financing_frequency NOT NULL DEFAULT 'quincenal'`;
    - `origin record_origin NOT NULL DEFAULT 'panel'`;
    - `annulled_at timestamptz`;
    - `annulment_reason`: “Opcional; como máximo 500 caracteres; solo con `annulled_at`”;
    - marcas de tiempo e índice `financings_client_idx (client_id)`.
  - **`installments`**:
    - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
    - `financing_id uuid NOT NULL REFERENCES financings(id) ON DELETE CASCADE`;
    - `is_initial boolean NOT NULL DEFAULT false`;
    - `due_date date NOT NULL`;
    - `amount_usd numeric(12,2) NOT NULL`, con “`CHECK (amount_usd > 0)`”;
    - `status installment_status NOT NULL DEFAULT 'pendiente'`;
    - datos del pago: `paid_on date`, `payment_currency payment_currency`, `euro_rate numeric(14,2)` (“> 0 y con 2 decimales”), `euro_rate_date date`, `euro_rate_source rate_source`, `amount_ves numeric(18,2)`, `payment_reference` (“Opcional; como máximo 160 caracteres”), `payment_origin record_origin` y `paid_recorded_at timestamptz`;
    - marcas de tiempo;
    - los cinco `CHECK` de coherencia de data-model.md (“Pendiente”, “Pagada en el panel”, “Pagada por carga masiva”, “Pago en bolívares” y “Pago en dólares”), más uno que exige `payment_origin` en toda cuota `pagada`;
    - índices `installments_financing_idx (financing_id)`, `installments_initial_unique (financing_id) WHERE is_initial`, `installments_pending_due_idx (due_date) WHERE status = 'pendiente'` e `installments_paid_on_idx (paid_on) WHERE status = 'pagada'`.
  - **`euro_rates`**:
    - `rate_date date PRIMARY KEY`;
    - `value numeric(14,2) NOT NULL CHECK (value > 0)`;
    - `source_value numeric(20,8) NOT NULL CHECK (source_value > 0)`;
    - `source text NOT NULL DEFAULT 'dolarapi'`;
    - `fetched_at timestamptz NOT NULL`.
  - **`congresses`**:
    - `id` y `ref`, con `congresses_ref_unique`;
    - `name`: “Obligatorio; de 1 a 160 caracteres”;
    - `start_date date NOT NULL`;
    - `end_date date NOT NULL`, con “`CHECK (end_date >= start_date)`”;
    - `venue`: “Opcional; como máximo 160 caracteres”;
    - `specialty`: “Opcional; como máximo 160 caracteres”;
    - `notes`: “Opcional; como máximo 1.000 caracteres”;
    - marcas de tiempo e índice `congresses_dates_idx (start_date, end_date)`.
  - Debe pasar T004.
- [X] T016 Reflejar las tablas nuevas en `src/db/schema.ts`. Depende de T015.
  - `pgEnum` para los seis enums.
  - `pgTable` para `clients`, `financings`, `installments`, `euroRates` y `congresses`, con:
    - los mismos nombres de columna;
    - `integer("ref").generatedAlwaysAsIdentity()`;
    - `numeric` con su precisión y escala;
    - `date(..., { mode: "string" })` en las fechas de negocio;
    - `timestamp(..., { withTimezone: true })`;
    - claves foráneas con `onDelete: "restrict"` y `"cascade"`.
  - `relations` entre clientes, financiamientos y cuotas.
  - Los `CHECK`, la unicidad diferible y los índices parciales solo viven en el SQL, igual que los `CHECK` de `products`.
- [X] T017 [P] Implementar `src/utils/phone.ts`, isomorfo y sin dependencias, según research.md (Decision 3) y T005, con:
  - `normalizePhone(input: string | number)`, que devuelve `{ ok: true, e164 } | { ok: false }`;
  - `formatPhone(e164)`;
  - `phoneSearchDigits(query)`.

  Debe pasar T005.
- [X] T018 [P] Implementar `src/utils/text-keys.ts` con `normalizeKey(text)`: “NFD sin marcas diacríticas, minúsculas, espacios unidos y recortados”. Hacer que `normalizeHeader` de `src/server/inventory/workbook-format.ts` la reutilice sin cambiar su resultado. Debe pasar T006.
- [X] T019 [P] Implementar `src/utils/dates.ts`, isomorfo, según research.md (Decision 13). Opera en UTC sobre fechas `AAAA-MM-DD` y usa nombres de meses propios, sin depender de ICU para el texto. Incluye:
  - `todayInCaracas(now = new Date())`, con `Intl.DateTimeFormat` en `America/Caracas`;
  - `isValidIsoDate`, `addDays`, `lastDayOfMonth`, `daysBetween`, `compareIsoDates` y `monthRange`;
  - `formatDate`, `formatMonthYear`, `formatLongDate` y `formatLongDateRange`.

  Debe pasar T007.
- [X] T020 [P] Crear `src/utils/whatsapp.ts` con `whatsappUrl(e164, text?)` (research.md, Decision 15). Debe pasar T008.
- [X] T021 [P] Crear `src/server/financing/summary.ts` con las funciones puras `deriveFinancingStatus`, `installmentState`, `installmentLabels` y `totals` de data-model.md (“Valores derivados”). Calculan con centavos enteros y devuelven los montos como texto con dos decimales (`"25.00"`). Debe pasar T009.
- [X] T022 [P] Extender `tests/integration/helpers/test-database.ts`, sin cambiar `resetCatalog`, `seedProduct` ni las demás funciones que usa la 003. Depende de T016–T018.
  - `resetSections()`: con la misma guarda de bases `_test`, ejecuta `TRUNCATE installments, financings, clients, congresses, euro_rates RESTART IDENTITY CASCADE`.
  - `seedClient(input)`: calcula `search_text` con `normalizeKey` y `phone_e164` con `normalizePhone`.
  - `seedFinancing(input)`: crea cuotas pendientes o pagadas que respetan los `CHECK`, ya sea pagadas en el panel (en `USD` o `VES`) o por carga masiva.
  - `seedCongress(input)` y `seedEuroRates(entries)`.
- [X] T023 [P] Implementar `src/server/reference/values.ts`. Depende de T016 y T018.
  - `buildReferenceIndex(rows)` y `canonicalize(index, field, value)`: funciones puras, según T010.
  - `loadReferenceValues(source: DbOrTransaction)`: lee con `SELECT DISTINCT` y conteos:
    - las tallas, de `clients.size` y `product_variants.size_label`;
    - las ciudades, hospitales y clínicas, de `clients`;
    - las especialidades, de `clients.specialty` y `congresses.specialty`.

  Debe pasar T010.
- [X] T024 Crear `src/server/bulk/issues.ts` a partir de `src/server/inventory/issues.ts` (research.md, Decision 5), con:
  - **Tipos genéricos**: `IssueSeverity`, `RawIssue<C>` y `ValidationIssue<C>`.
  - **Agrupación**: `groupIssues`, `compactRows` y `countIssues`, movidos sin cambiar su comportamiento.
  - **`defineIssueCatalog(...)`**: asocia a cada código su gravedad y su plantilla de mensaje, y devuelve un `createIssue(code, params)` tipado.
  - **Catálogo común**: el de `contracts/admin-api.md` (“Del archivo y de cualquier sección”), con sus mensajes exactos.
  - **`BulkFileError`**: los códigos `FILE_*` con los mensajes de la 003, salvo `FILE_TOO_LARGE`, que dice “El archivo supera 4 MB. Divide el archivo en varios.”.
  - **Compatibilidad**: `src/server/inventory/issues.ts` conserva todas sus exportaciones, sus códigos y sus mensajes, y delega la agrupación y el conteo.
- [X] T025 [P] Crear `src/server/bulk/file-guards.ts` a partir de las guardas de `src/server/inventory/workbook-reader.ts`. Depende de T024.
  - `readXlsxSheets({ fileName, bytes, fail })` aplica las guardas en el mismo orden que la 003:
    1. tamaño: archivo vacío y límite de 4 MB;
    2. firma OLE;
    3. extensión `.xlsx`;
    4. firma `PK`;
    5. inspección del contenedor con el filtro de `unzipSync`: 200 entradas, 50 MB descomprimidos, `xl/workbook.xml` y `xl/vbaproject.bin`;
    6. lectura con `read-excel-file/node`, con la misma traducción de errores.
  - Devuelve `{ sheets, sha256 }`.
  - `fail(code)` construye el error, para que el lector de inventario siga lanzando `InventoryFileError` y las secciones nuevas lancen `BulkFileError`.
- [X] T026 Crear `src/server/bulk/sheet.ts`. Depende de T018, T024 y T025.
  - `readSectionSheet(...)` sigue T013 y las secciones “Hojas”, “Metadatos en Instrucciones” y “Encabezados” de `contracts/bulk-workbooks.md`. Devuelve los campos de `BulkWorkbook` de data-model.md, las filas y las incidencias.
  - Exporta también `isRowEmpty` y `readMetadataPairs`, que `src/server/inventory/workbook-reader.ts` pasa a usar.
  - El inventario conserva sus reglas propias:
    - la hoja obligatoria `Inventario` (`SHEET_NOT_FOUND`), sin respaldo en la primera hoja;
    - sus columnas `Talla …`;
    - sus mensajes;
    - su límite de 5.000 productos.

  Debe pasar T013.
- [X] T027 [P] Crear `src/server/bulk/cells.ts` a partir de las funciones de celda de `src/server/inventory/rows.ts`. Depende de T017, T019 y T024.
  - Incluye `isBlank`, `cellToText`, `parseRequiredText`, `parseOptionalText`, `parseOptionCell`, `parseIntegerCell`, `parseRefCell` y `parsePhoneCell`.
  - `parseDecimalCell` tiene mínimo, máximo, dígitos enteros y códigos de error configurables.
  - `parseDateCell` sigue research.md (Decision 13).
  - `src/server/inventory/rows.ts` usa estas funciones con parámetros que reproducen exactamente las reglas de la 003: precio, cantidades, ID, textos, género y Sí/No.

  Debe pasar T011 y `tests/unit/inventory-rows.test.ts` sin modificarlo.
- [X] T028 [P] Crear `src/server/bulk/preview-token.ts` a partir de `src/server/inventory/preview-token.ts`, con:
  - `signBulkPreviewToken(payload, sessionToken, purpose, now)`;
  - `verifyBulkPreviewToken(token, sessionToken, purpose, now)`, con la clave “`sha256(sessionToken + "|" + purpose)`”, `timingSafeEqual`, vencimiento a los 60 minutos y el campo opcional `section`, que debe coincidir al verificar;
  - `assertApplicableToken({ previewToken, sessionToken, section, bytes, now })`, con los tres mensajes 409 de T012.

  El módulo de inventario conserva `signPreviewToken` y `verifyPreviewToken` con el propósito `inventory-preview`. Debe pasar T012.
- [X] T029 [P] Crear `src/server/bulk/http.ts` a partir de `src/server/inventory/http.ts`. Depende de T024.
  - Incluye `readUpload(request, { tooLargeMessage })` y `downloadResponse(file)`.
  - `bulkErrorResponse(error)` convierte `BulkFileError` en 422 `VALIDATION_ERROR` con `fields.file`, y agrega `Cache-Control: no-store` a todas las respuestas.
  - Agregar en `src/server/http/responses.ts` `apiErrorResponse(error)`, igual que `errorResponse` pero con `no-store`, para los endpoints JSON de las secciones.
  - `src/server/inventory/http.ts` conserva sus exportaciones y su mensaje “Divide el inventario en varios archivos”.
- [X] T030 [P] Crear `src/server/bulk/workbook-writer.ts` a partir de `src/server/inventory/workbook-writer.ts`, con:
  - ayudantes de celda: `text`, `textColumn` con formato `@` y `heading`;
  - los estilos del encabezado y del identificador;
  - `metadataRows({ section?, kind, generatedAt, version })`;
  - constructores de validaciones: `listValidation`, `suggestionValidation` hacia `Listas`, `decimalValidation`, `integerValidation`, `dateValidation`, `textLengthValidation` e `inputMessage`;
  - `writeWorkbook(sheets)`, con `features: [dataValidation]`.

  El escritor de inventario usa estas piezas, no agrega la etiqueta `Sección` y produce el mismo libro: debe pasar `tests/contract/inventory-workbook.test.ts` sin modificarlo.
- [X] T031 [P] Crear `src/server/bulk/transaction.ts` a partir de `src/server/inventory/repository.ts`, con:
  - `withBulkLock({ lockKey, lockTimeoutMs = 10_000 }, callback)`: dentro de `withTransaction`, ejecuta `SET LOCAL lock_timeout` y `pg_advisory_xact_lock(lockKey)`;
  - `pgErrorCode` y `chunk(items, 1_000)`;
  - `translateApplyError(error, { changedMessage, conflictCodes = ["23505", "23503"] })`, que traduce, sin trazas:
    - `55P03` en 409 “Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.”;
    - los códigos de conflicto en 409 con `changedMessage`;
    - cualquier otro error en 500 `DATABASE_ERROR` “No se aplicó ningún cambio. Inténtalo de nuevo.”.

  `withInventoryLock` pasa a usar `withBulkLock` con `INVENTORY_LOCK_KEY` (7_301_003), y `pgErrorCode` se sigue exportando desde `src/server/inventory/repository.ts`.
- [X] T032 [P] Crear `src/server/bulk/response.ts` con `toBulkPreviewResponse(...)` y `toBulkApplyResponse(...)`. Depende de T024. Producen exactamente `BulkPreviewResponse` y `BulkApplyResponse` de `contracts/admin-api.md`:
  - las incidencias, agrupadas y contadas por ocurrencias;
  - `changes`, solo con filas nuevas o con diferencias, en orden de fila;
  - `preview`, con `token` y `expiresAt`, solo en el estado `ready`;
  - `fields[].from` y `fields[].to`, listos para mostrar. `to: null` significa que el dato se borrará.
- [X] T033 Ejecutar la regresión de la 003 después de T024–T032. Las diferencias se corrigen en `src/server/bulk/` o en los adaptadores de `src/server/inventory/`, nunca en las pruebas.
  - `npm.cmd run test` pasa.
  - `git diff --stat -- tests/unit/inventory-* tests/contract/inventory-* tests/integration/inventory-apply.test.ts tests/fixtures/inventory tests/e2e/admin-bulk-inventory.spec.ts` no muestra cambios.
  - Con `TEST_DATABASE_URL`, `npx vitest run tests/integration/inventory-apply.test.ts` pasa.
  - Con `E2E=1`, `npx playwright test tests/e2e/admin-bulk-inventory.spec.ts --project=chromium` pasa.
- [X] T034 [P] Crear `src/components/admin/nav-items.ts` con las secciones del panel en el orden del contrato (`{ href, label, summaryLabel? }`). Por ahora solo incluye Productos y Estadísticas. Usarlo en `src/components/admin/AdminLayout.astro` y `src/pages/admin/index.astro`, según la sección “Navegación del panel” de `contracts/admin-ui.md`:
  - la navegación muestra las secciones y después “Ver vitrina” y “Salir”, con `aria-current="page"` en la sección activa según `Astro.url.pathname`;
  - por debajo de 768 px, los enlaces se agrupan en un `<details>` con `<summary>` “Menú”, sin JavaScript, y “Salir” sigue visible;
  - el inicio genera su texto y un acceso por sección a partir de la misma lista. Cuando estén todas las secciones dirá “Gestiona productos, clientes, pagos financiados y congresos”.

  Debe pasar T014.
- [X] T035 [P] Crear `src/components/admin/SuggestInput.astro`:
  - un `<input list>` con un `<datalist>` de `id` único;
  - etiqueta asociada y `maxlength`;
  - ayuda y error mostrados con `FieldError.astro` y enlazados por `aria-describedby`;
  - props `name`, `label`, `value`, `options`, `maxLength`, `required`, `hint` y `error`.
- [X] T036 [P] Crear `src/components/admin/ConfirmDialog.astro`, un `<dialog>` modal que se abre con `showModal()`:
  - contiene título, mensaje, un botón de confirmación con texto configurable, “Cancelar” y un motivo opcional de hasta 500 caracteres, para anular;
  - se cierra con Escape y devuelve el foco al botón que lo abrió;
  - sus botones miden al menos 44 px;
  - expone en el navegador `confirmAction({ title, message, confirmLabel, withReason })`, que devuelve una promesa con `{ confirmed, reason }`.
- [X] T037 [P] Crear `src/components/admin/BulkUpload.astro` y `src/components/admin/bulk/renderers.ts`. Son genéricos, siguen la sección “Carga masiva” de `contracts/admin-ui.md` y no modifican `BulkInventoryUpload.astro`.
  - **Props**: `section`, `sheetName`, `title`, `downloads` (`[{ label, href, description }]`), `previewUrl`, `applyUrl`, `limitsText` y `csrfToken`.
  - **Estados**: `inicial`, `archivo_no_admitido`, `validando`, `rechazado`, `con_errores`, `sin_cambios`, `lista`, `aplicando`, `aplicada`, `no_aplicada`, `fallo` y `sesion_caducada`.
  - **Interacción y accesibilidad**, con las reglas de la 003:
    - comprobación local de la extensión `.xlsx` y del límite de 4 MB;
    - una petición a la vez;
    - anuncios con `role="status"` y `aria-live`;
    - foco en los encabezados;
    - alerta de errores, con la confirmación deshabilitada;
    - temporizador hasta `expiresAt`;
    - “Validar de nuevo” ante un 409, y enlace a `/admin/login` ante un 401.
  - **Resumen**: “Nuevos”, “Con cambios”, “Sin cambios”, “Errores” y “Advertencias”, más las cifras opcionales de `summary`: “Cuotas”, “Monto financiado” y “Saldo pendiente”, con `formatMoney`.
  - **Hoja leída**: muestra “Se procesó la hoja «X»” cuando `file.sheet` no es la hoja de la sección.
  - **Incidencias y cambios**: muestra las incidencias agrupadas y los cambios en bloques de 50 con “Mostrar más”, dibujados con `renderChange(section, change)`. En esta tarea, `renderers.ts` solo tiene el renderizador genérico, que muestra:
    - la fila, y “Nuevo” o “#ref”;
    - los campos como “Etiqueta: antes → después”, o “→ se borrará” cuando `to` es `null`;
    - las advertencias.
  - **Resultado**: listas plegables de enlaces a los registros creados y actualizados, y “Hacer otra carga”.

**Checkpoint**: Al terminar esta fase:

- el esquema está migrado;
- las utilidades y el motor de carga masiva están probados;
- la carga de inventario funciona igual que antes;
- la navegación admite secciones nuevas.

Todavía no hay pantallas de clientes, financiamientos ni congresos.

---

## Phase 3: User Story 1 - Registrar, buscar y consultar clientes (Priority: P1) 🎯 MVP

**Goal**: La propietaria tiene en el panel la base de clientes, con alta, ficha, edición, eliminación, búsqueda por nombre o celular y filtros.

**Independent Test**:

1. Registrar un cliente.
2. Encontrarlo por nombre y por celular.
3. Filtrar por especialidad y ciudad.
4. Editar su talla y comprobar que se conserva.
5. Registrar otro cliente con el mismo celular escrito de otra forma: el mensaje nombra al dueño del número.

### Tests for User Story 1

- [X] T038 [P] [US1] Escribir `tests/unit/clients-validation.test.ts` para `src/server/validation/clients.ts`. Debe fallar inicialmente y comprobar:
  - **`clientInputSchema`**:
    - `name` es obligatorio, se recorta y tiene de 1 a 160 caracteres;
    - `phone` acepta cualquier escritura válida para `normalizePhone` y se transforma en `phoneE164`; si no es válido, el error va en `fields.phone`;
    - `sex` es `Mujer`, `Hombre` o `null`;
    - `size` admite hasta 40 caracteres; `city`, `hospital`, `clinic` y `specialty`, hasta 160; `notes`, hasta 1.000;
    - los textos vacíos pasan a `null`;
    - `expectedUpdatedAt` es obligatorio al editar.
  - **`clientListQuerySchema`**:
    - `pageSize` es 20, 50 o 100, y 20 por defecto;
    - `page` es ≥ 1;
    - `balance` es `pending` u `overdue`, y `sex` es un valor válido;
    - los valores inválidos vuelven a su valor por defecto.
- [X] T039 [P] [US1] Escribir `tests/integration/clients.test.ts`. Se omite sin `TEST_DATABASE_URL` y usa `resetSections`, `seedClient` y `seedFinancing`. Debe comprobar:
  - **Alta**: asigna `ref`, calcula `search_text` y guarda “Los magallanes” como “Los Magallanes” si esa escritura ya existe.
  - **Celular repetido**: si existe `"0414 123 4567"`, un alta o una edición con `"+58 414-1234567"` responde 409 con `fields.phone` “Este celular ya pertenece a {nombre} (#{ref}).” y con `fields.phoneOwnerRef`.
  - **Edición concurrente**: una edición con un `expectedUpdatedAt` antiguo responde 409 con `fields.expectedUpdatedAt`.
  - **Búsqueda y filtros**:
    - `alvarez` encuentra “Álvarez”, `perez` encuentra “Pérez” y `4123` encuentra `0414-123-4567`;
    - los filtros se combinan;
    - `balance=pending` y `balance=overdue` excluyen los financiamientos anulados;
    - el orden es por `search_text` y `ref`;
    - `total` y `totalClients` son correctos.
  - **Ficha**: incluye los financiamientos con total, pagado, saldo y estado.
  - **Eliminación**:
    - sin financiamientos, responde 204;
    - con financiamientos, responde 409 con `fields.client`;
    - si el financiamiento se crea en otra transacción después de la comprobación, el `RESTRICT` (`23503`) también termina en 409.
  - **Rendimiento**: con 10.000 clientes sembrados en lote, la búsqueda y los filtros responden en menos de 2 s (FR-008).
- [X] T040 [P] [US1] Escribir `tests/e2e/admin-clients.spec.ts`, que se omite sin `E2E` y usa `tests/e2e/helpers/admin.ts`, con el bloque de US1:
  1. Iniciar sesión y abrir “Clientes” desde la navegación.
  2. Registrar “Ana Pérez E2E …” con un celular único, Sexo Mujer, Talla M y una especialidad. Comprobar el anuncio “Cliente guardado” y la ficha.
  3. Buscarla por el apellido sin tilde y por 4 dígitos del celular. Filtrar por especialidad y usar “Quitar filtros”.
  4. Editar la talla y comprobar que se conserva.
  5. Registrar otro cliente con el mismo celular escrito con `+58`: el error junto a Celular enlaza a la ficha de Ana.
  6. Eliminar un cliente sin financiamientos. Escape cierra el diálogo y devuelve el foco; al confirmar aparece “Cliente eliminado”.
  7. En el proyecto `mobile`, la lista se ve como tarjetas y no hay desplazamiento horizontal.
  8. Sin sesión, `GET /api/admin/clients` responde 401 y `/admin/clientes` redirige a `/admin/login`. Con sesión pero sin `x-csrf-token`, `POST /api/admin/clients` responde 403.

### Implementation for User Story 1

- [X] T041 [P] [US1] Crear `src/server/validation/clients.ts` según T038, con mensajes en español por campo. Incluye:
  - `CLIENT_LIMITS`: `name` 160, `size` 40, los demás textos 160 y `notes` 1.000;
  - `clientInputSchema`, `clientUpdateSchema` (con `expectedUpdatedAt`) y `clientListQuerySchema`.

  El error del celular usa el texto de `INVALID_PHONE` de `contracts/admin-api.md`. Debe pasar T038.
- [X] T042 [P] [US1] Crear `src/server/clients/repository.ts` con:
  - **`listClients(source, query, today)`**:
    - busca con `search_text LIKE '%clave%'` y, si `phoneSearchDigits` devuelve dígitos, también con `phone_e164 LIKE '%dígitos%'`;
    - filtra por la escritura canónica exacta;
    - con `balance=pending`, usa un `EXISTS` de cuotas pendientes de financiamientos no anulados; con `balance=overdue`, además exige `due_date < today`;
    - ordena por `search_text, ref` y pagina;
    - devuelve `total` y `totalClients`, y en cada fila `balanceUsd` y `hasOverdue`.
  - **Lecturas y escrituras**: `getClientByRef`, `findClientByPhone`, `insertClient`, `updateClientIfUnchanged(ref, values, expectedUpdatedAt)`, que solo actualiza si `updated_at` coincide, y `deleteClientByRef`.
  - **`listClientFinancings(source, clientId, today)`**: total, pagado y saldo con `SUM` de las cuotas, y el estado con `deriveFinancingStatus`.
- [X] T043 [US1] Crear `src/server/clients/service.ts`. Depende de T023, T041 y T042.
  - **Funciones**: `listClientsPage`, `createClient`, `updateClient`, `deleteClient` y `getClientDetail`, que devuelve el celular con `formatPhone`, `whatsappUrl` y los financiamientos.
  - **Datos guardados**:
    - las tallas, ciudades, hospitales, clínicas y especialidades pasan por `canonicalize`;
    - `search_text = normalizeKey(name)`;
    - `updated_at` cambia en cada edición.
  - **Errores**:
    - un `23505` de `clients_phone_unique` se traduce en 409 con `fields.phone` “Este celular ya pertenece a {nombre} (#{ref}).” y con `fields.phoneOwnerRef`. Ese campo adicional, que permite enlazar la ficha, se documenta en la tabla de `contracts/admin-api.md`;
    - un `expectedUpdatedAt` distinto da 409 con `fields.expectedUpdatedAt` “El cliente cambió mientras lo editabas. Recarga la página.”;
    - eliminar un cliente con financiamientos, o un `23503` al eliminar, da 409 con `fields.client` “El cliente tiene financiamientos y no puede eliminarse.”.
  - **Registros del servidor**: solo llevan códigos y duraciones, nunca nombres, celulares ni notas.

  Debe pasar T039.
- [X] T044 [P] [US1] Crear `src/pages/api/admin/clients/index.ts` y `src/pages/api/admin/clients/[ref].ts`. Depende de T043.
  - `index.ts`: `GET` con `requireOwner`, y `POST` con `requireMutation`, que responde 201.
  - `[ref].ts`: `GET`, `PATCH` y `DELETE`; este último responde 204.
  - Un `:ref` que no es un entero positivo responde 404 `NOT_FOUND`.
  - Las respuestas usan `jsonOk`, y los errores, `apiErrorResponse` (T029).
- [X] T045 [P] [US1] Crear `src/components/admin/ClientForm.astro`, según la sección “`/admin/clientes/nuevo` y edición” de `contracts/admin-ui.md`:
  - **Campos**:
    - Nombre y Celular son obligatorios. Celular lleva la ayuda “Ej.: 0414-123-4567. Otro país: +57 300…”;
    - Sexo ofrece “Sin indicar”, “Mujer” y “Hombre”;
    - Talla, Ciudad, Hospital, Clínica y Especialidad usan `SuggestInput`;
    - Notas tiene un contador de hasta 1.000 caracteres.
  - **Envío**: manda JSON con `fetch` y `x-csrf-token` (`POST`, o `PATCH` con `expectedUpdatedAt`) y deshabilita el botón mientras envía.
  - **Errores**:
    - los 422 se muestran junto a cada campo y el foco va al primero;
    - el 409 del celular aparece junto a Celular, con un enlace a `/admin/clientes/<phoneOwnerRef>`;
    - el 409 de `expectedUpdatedAt` ofrece “Recargar”.
  - **Al crear**: lleva a la ficha, que anuncia “Cliente guardado”.
- [X] T046 [US1] Crear `src/pages/admin/clientes/index.astro`. Depende de T043.
  - **Encabezado**: “Clientes”, con “N clientes en total” y la acción “Nuevo cliente”.
  - **Formulario `GET`**:
    - búsqueda “Nombre o celular”;
    - filtros de Especialidad, Ciudad, Hospital, Clínica, Sexo, Talla y Saldo, con las opciones de `loadReferenceValues`;
    - “Mostrar por página”, “Aplicar” y “Quitar filtros”.
  - **Resultados**: “N resultados” cuando hay búsqueda o filtros. Se muestran en tabla en escritorio y en tarjetas en móvil, con:
    - Nombre, con enlace a la ficha;
    - Celular, Especialidad, Ciudad y Talla;
    - Saldo, solo si es mayor que 0, con `formatMoney` y la etiqueta “Vencido” cuando corresponde.
  - **Estados vacíos**: “Todavía no hay clientes.” con “Registrar cliente”, y “No hay clientes que coincidan.” con “Quitar filtros”.
  - **Paginación**: “Página X de Y”.
- [X] T047 [P] [US1] Crear `src/pages/admin/clientes/nuevo.astro`, con “← Volver a clientes”, el encabezado “Nuevo cliente” y `ClientForm` con los valores de referencia y `Astro.locals.csrfToken`. Depende de T045.
- [X] T048 [US1] Crear `src/pages/admin/clientes/[ref].astro`. Depende de T036, T043 y T045.
  - **Datos**: los del cliente, con el celular legible y sus fechas.
  - **Editar**: muestra `ClientForm` en la misma página.
  - **Financiamientos**: lista con descripción, fecha de compra, total, pagado, saldo e insignia de estado con texto. Si no hay ninguno, muestra “Sin financiamientos”.
  - **Eliminar**: usa `ConfirmDialog` y, al terminar, vuelve a la lista con el anuncio “Cliente eliminado”. Si el cliente tiene financiamientos, el botón queda deshabilitado con “No se puede eliminar porque tiene financiamientos”.
  - **`ref` inexistente**: responde 404.
- [X] T049 [P] [US1] Agregar “Clientes” (`/admin/clientes`) después de Productos en `src/components/admin/nav-items.ts`.

**Checkpoint**: La base de clientes funciona por sí sola: alta, ficha, edición, búsqueda, filtros y eliminación protegida.

---

## Phase 4: User Story 2 - Importar y actualizar clientes en bloque con la plantilla de Excel (Priority: P1) 🎯 MVP

**Goal**: La propietaria descarga la plantilla o los clientes actuales, sube su hoja “Medicos” o un archivo corregido, revisa la vista previa y aplica todo en una sola operación.

**Independent Test**:

1. Subir un libro cuya primera hoja tenga la estructura de “Medicos”. La vista previa muestra los clientes nuevos y señala los celulares inválidos con su fila.
2. Corregirlos, confirmar y encontrar los clientes en la lista.
3. Volver a subir el mismo archivo: no hay cambios.

### Tests for User Story 2

- [X] T050 [P] [US2] Escribir `tests/unit/clients-bulk-rows.test.ts` para `parseClientRow` de `src/server/clients/bulk/rows.ts`:
  - **Nombre**: vacío da `REQUIRED`, y con más de 160 caracteres da `TOO_LONG`.
  - **Celular**: vacío da `REQUIRED` e inválido da `INVALID_PHONE`; un número de 10 dígitos como los de “Medicos” se normaliza.
  - **Sexo**: acepta `"mujer"` y `" HOMBRE "`; otro valor da `INVALID_SEX`.
  - **Límites**: `Talla` admite 40 caracteres y `Notas`, 1.000.
  - **Identificador**: uno inválido da `INVALID_ID`.
  - **Presencia**: `present` refleja solo las columnas del archivo, y cada valor indica si su celda estaba vacía.
- [X] T051 [P] [US2] Escribir `tests/unit/clients-bulk-changes.test.ts` para `buildClientChangeSet` de `src/server/clients/bulk/changes.ts`, con una instantánea de prueba en el mismo archivo:
  - **Identificación**:
    - una fila con Identificador edita, y su celda vacía en una columna presente borra el dato (`to: null`);
    - una fila sin Identificador con un celular registrado edita (`matchedBy: "celular"`), y sus celdas vacías conservan lo guardado;
    - una fila con un celular nuevo crea un cliente;
    - las columnas ausentes nunca cambian.
  - **Errores**:
    - `UNKNOWN_ID`, y `DUPLICATE_ID` en todas sus filas;
    - `PHONE_REPEATED`, y `PHONE_IN_USE` evaluado sobre el resultado final;
    - `DUPLICATE_TARGET` cuando una fila por Identificador y otra por celular apuntan al mismo cliente;
    - el intercambio de celulares entre dos filas es válido.
  - **Advertencias**:
    - `NEW_VALUE`, una vez por columna y valor, con todas sus filas;
    - `SAME_NAME`, contra clientes existentes y del archivo;
    - `MODIFIED_AFTER_DOWNLOAD`, solo con `generatedAt`, con cambios y con un `updatedAt` posterior;
    - las advertencias no cambian el estado `ready`.
  - **Resultado**:
    - se usa la escritura canónica (“Los magallanes” → “Los Magallanes”);
    - las filas sin diferencias solo se cuentan;
    - los estados son `ready`, `invalid` y `no_changes`;
    - la línea base `["clientes-v1", count, maxRef, [...]]` no depende del orden y cambia si cambia un cliente referenciado;
    - aplicar el resultado a la instantánea y volver a calcular no produce cambios (SC-009).
- [X] T052 [P] [US2] Escribir `tests/contract/clients-workbook.test.ts`, que genera los libros con el servicio y los lee con `read-excel-file/node`:
  - **Plantilla y datos actuales**:
    - hojas `Instrucciones`, `Clientes` y `Listas`, en ese orden;
    - metadatos `Sección` = `Clientes`, `Tipo de archivo`, `Generado (UTC)` y `Versión del formato` = `1`;
    - encabezado `Nombre, Celular, Sexo, Talla, Ciudad, Hospital, Clínica, Especialidad, Notas, Identificador`.
  - **Datos actuales**:
    - un cliente por fila, ordenados por nombre normalizado e Identificador;
    - el celular como texto `0414-246-7789`;
    - un texto que empieza con `=` no genera elementos `<f>`.
  - **XML de la hoja `Clientes`**, leído con `fflate`, en las filas 2 a 10.001:
    - lista `Mujer,Hombre` con estilo `stop`;
    - sugerencias `information` hacia `Listas` en Talla, Ciudad, Hospital, Clínica y Especialidad;
    - límite de longitud en Nombre y Notas;
    - formato `@` en Celular;
    - el mensaje del Identificador.
  - **Lectura**:
    - un libro de `medicosWorkbook` se procesa con `file.sheet = "Medicos"`;
    - `Sección: Congresos` da `WRONG_SECTION`;
    - un libro sin Celular da `MISSING_COLUMNS`;
    - 10.001 filas dan `TOO_MANY_ROWS`;
    - una columna desconocida da `IGNORED_COLUMNS`.
- [X] T053 [P] [US2] Crear `tests/contract/bulk-api-response.test.ts` con esquemas Zod equivalentes a `BulkPreviewResponse` y `BulkApplyResponse` de `contracts/admin-api.md`. El bloque de clientes comprueba:
  - `preview` solo aparece en `ready`;
  - cada cambio trae `matchedBy`;
  - los datos que se borrarán llevan `to: null`;
  - `rows` usa rangos de texto;
  - la respuesta con 10.000 altas ocupa menos de 4 MB al serializarse.
- [X] T054 [P] [US2] Escribir `tests/integration/clients-bulk-apply.test.ts`. Se omite sin `TEST_DATABASE_URL`. Debe comprobar:
  - **Aplicación**: la vista previa y la aplicación registran altas y ediciones, por Identificador y por celular. Actualizan `updated_at` y `search_text` y no eliminan ningún cliente.
  - **Atomicidad**: un fallo provocado con `vi.spyOn` a mitad de la aplicación deja los clientes como estaban (SC-009).
  - **Doble envío**: dos aplicaciones simultáneas con el mismo token terminan en un resultado aplicado y un 409.
  - **Cambio intermedio**: una edición individual de un cliente referenciado entre la vista previa y la confirmación da 409 “Los clientes cambiaron desde la vista previa…”.
  - **Intercambio**: dos clientes intercambian su celular con un archivo descargado.
  - **Bloqueo**: si otra conexión retiene el bloqueo `7_301_004` y `lockTimeoutMs` es corto, se responde 409 “Otra carga se está aplicando…”.
  - **Repetición**: una nueva vista previa del mismo archivo devuelve `no_changes`.
- [X] T055 [P] [US2] Añadir en `tests/e2e/admin-clients.spec.ts` el bloque de US2:
  1. Desde `/admin/clientes`, “Carga masiva” abre “Carga masiva de clientes”.
  2. “Descargar plantilla vacía” descarga `plantilla-clientes.xlsx`.
  3. Subir un libro de `medicosWorkbook` con un celular de 9 dígitos. Aparecen la alerta con su fila y columna y “Se procesó la hoja «Medicos»”, y la confirmación queda deshabilitada.
  4. Corregir el celular, confirmar y encontrar los clientes en la lista.
  5. Con sesión pero sin `x-csrf-token`, `POST /api/admin/clients/bulk/preview` responde 403.

### Implementation for User Story 2

- [X] T056 [P] [US2] Crear `src/server/clients/bulk/format.ts` con la definición de la sección, según “Hoja Clientes” de `contracts/bulk-workbooks.md`:
  - sección `clientes`, hoja `Clientes`, límite de 10.000 filas, bloqueo `7_301_004` y propósito `bulk-preview:clientes`;
  - columnas con su clave, su encabezado y su obligatoriedad, con `Identificador` como columna de identificador;
  - nombres de archivo `plantilla-clientes.xlsx` y `clientes-AAAA-MM-DD.xlsx`, con la fecha de Caracas;
  - el catálogo de incidencias común y el de clientes, con los mensajes exactos de `contracts/admin-api.md`;
  - el texto de las instrucciones: pasos, columnas, celdas vacías según la fila y límites;
  - las validaciones de “Ayudas dentro de Excel”, en las filas 2 a 10.001.
- [X] T057 [P] [US2] Crear `src/server/clients/bulk/rows.ts` con `parseClientRow(cells, columns, excelRow)`. Usa `src/server/bulk/cells.ts` y los límites de `CLIENT_LIMITS`, y devuelve un `ParsedClientRow` de data-model.md:
  - `excelRow`, `ref` y `present`;
  - `values`, con cada valor normalizado y si su celda estaba vacía;
  - `issues`.

  Debe pasar T050.
- [X] T058 [US2] Crear `src/server/clients/bulk/changes.ts` con los tipos de la instantánea y `buildClientChangeSet({ rows, workbook, snapshot, today })`, según research.md (Decision 7) y T051. Depende de T056 y T057.
  - **Reglas**: identificación, celdas vacías según la fila, escritura canónica y unicidad del celular sobre el resultado final.
  - **Salida**:
    - errores, advertencias, conteos y estado;
    - cada `ClientChange`, con `action`, `matchedBy`, `ref`, la etiqueta `Nombre · 0414-246-7789`, `fields` y `warnings`;
    - las escrituras y la `baseline`.

  Debe pasar T051.
- [X] T059 [US2] Crear `src/server/clients/bulk/repository.ts`. Depende de T031 y T058.
  - **`loadClientSnapshot(source)`**: carga los clientes con sus valores y `updatedAt`, el mapa de celular a `ref`, el mapa de nombre normalizado a `refs`, los valores de referencia y el marcador `{ count, maxRef }`.
  - **`withClientsBulkLock({ refs, phones, lockTimeoutMs }, callback)`**, dentro de la transacción:
    1. toma `withBulkLock` con `7_301_004`;
    2. ejecuta `SET CONSTRAINTS clients_phone_unique DEFERRED`;
    3. bloquea con `SELECT … FOR UPDATE` los clientes referenciados por Identificador o por celular;
    4. carga la instantánea.
  - **Escrituras**, por lotes de 1.000 y sin `DELETE`:
    - `insertClients(tx, creates, now)`, con `RETURNING ref` y en orden de fila;
    - `updateClients(tx, updates, now)`, con `UPDATE … FROM (VALUES …)`, incluidos `search_text` y `updated_at`.
- [X] T060 [US2] Crear `src/server/clients/bulk/service.ts`. Depende de T028, T029, T030, T032 y T059.
  - **Funciones**:
    - `buildClientsTemplate(now)` y `buildClientsExport(now)`;
    - `previewClientsFile({ fileName, bytes, sessionToken, now })`;
    - `applyClientsFile({ fileName, bytes, previewToken, sessionToken, now, lockTimeoutMs })`.
  - **Vista previa**, con el flujo de la 003: lee el archivo, interpreta las filas, carga la instantánea y calcula los cambios. Solo firma el token en `ready`.
  - **Aplicación**:
    1. comprueba el token con `assertApplicableToken`;
    2. recalcula dentro del bloqueo. Si la línea base difiere o aparecen errores, responde 409 “Los clientes cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”;
    3. traduce los errores con `translateApplyError`;
    4. devuelve `created` y `updated`, con `url` `/admin/clientes/<ref>`.
  - **Registros del servidor**: solo llevan códigos, conteos y duración.

  Debe pasar T052–T054.
- [X] T061 [P] [US2] Crear los endpoints de la carga masiva de clientes en `src/pages/api/admin/clients/bulk/`, con los errores de `bulkErrorResponse`:
  - `src/pages/api/admin/clients/bulk/template.ts` y `src/pages/api/admin/clients/bulk/export.ts`: `GET` con `requireOwner` y `downloadResponse`;
  - `src/pages/api/admin/clients/bulk/preview.ts` y `src/pages/api/admin/clients/bulk/apply.ts`: `POST` con `requireMutation`, `readUpload` y `getSessionToken`. `apply` exige `previewToken`.
- [X] T062 [P] [US2] Agregar en `src/components/admin/bulk/renderers.ts` el renderizador de `clientes`, que añade al genérico la etiqueta “reconocido por celular” cuando `matchedBy` es `celular`.
- [X] T063 [US2] Crear `src/pages/admin/clientes/carga-masiva.astro`. Depende de T037, T061 y T062.
  - Muestra “← Volver a clientes” y el encabezado “Carga masiva de clientes”.
  - Usa `BulkUpload` con:
    - “Descargar plantilla vacía”: “Para registrar clientes nuevos o pegar las filas de tu hoja de médicos”;
    - “Descargar clientes actuales”: “Para corregir datos de los clientes que ya tienes”;
    - el texto de límites de `contracts/admin-ui.md`.
  - En `src/pages/admin/clientes/index.astro`, agregar la acción “Carga masiva” y “Usar carga masiva” en el estado vacío.

**Checkpoint**: El MVP está completo: la propietaria puede importar su hoja de médicos, corregirla en bloque y gestionar a cada cliente.

---

## Phase 5: User Story 3 - Registrar un financiamiento con su calendario de cuotas (Priority: P1)

**Goal**: La propietaria registra una compra a crédito de un cliente y revisa y ajusta el calendario propuesto. Después puede editar las cuotas pendientes y anular, restaurar o eliminar el financiamiento.

**Independent Test**:

1. Desde la ficha de un cliente, registrar $100,00 en 4 cuotas quincenales, sin inicial, con compra el 18/10/2026.
2. Comprobar las cuotas propuestas de $25,00 el 31/10, el 15/11, el 30/11 y el 15/12.
3. Cambiar una fecha y guardar.
4. Ver el financiamiento en la ficha del cliente y en su detalle.

### Tests for User Story 3

- [X] T064 [P] [US3] Escribir `tests/unit/financing-schedule.test.ts` para `src/utils/financing-schedule.ts`. Debe fallar inicialmente y comprobar:
  - **`defaultFirstDueDate`**:
    - quincenal: el siguiente día 15 o último día del mes, estrictamente después de la compra. 18/10/2026 da 31/10/2026, 15/10/2026 da 31/10/2026 y 31/10/2026 da 15/11/2026;
    - mensual: el mismo día del mes siguiente o, si no existe, el último;
    - semanal: la compra más 7 días.
  - **`nextDueDate`**:
    - quincenal: 20/10 → 31/10 → 15/11 → 30/11;
    - mensual con día ancla 31: 31/01 → 28/02 (29/02 en 2028) → 31/03;
    - semanal: suma 7 días;
    - diciembre pasa a enero del año siguiente.
  - **`generateSchedule`**:
    - reproduce el ejemplo de data-model.md;
    - $100,00 en 3 cuotas da 33,33, 33,33 y 33,34;
    - la inicial vence en la fecha de compra y el resto se reparte;
    - admite de 1 a 48 cuotas.
  - **`validateSchedule`**: una cuota que vence antes de la compra, un monto ≤ 0 o una compra futura dan un error en su fila.
- [X] T065 [P] [US3] Escribir `tests/unit/financing-validation.test.ts` para `src/server/validation/financing.ts`:
  - `financingCreateSchema` exige:
    - `clientRef`;
    - `description` de 1 a 500 caracteres;
    - `purchaseDate` válida y `frequency`;
    - de 1 a 49 cuotas, con como máximo una inicial;
    - montos > 0, con 2 decimales y hasta 9.999.999.999,99.

    Los errores usan claves como `installments.3.dueDate`.
  - `financingUpdateSchema`, `annulSchema` (motivo ≤ 500) y los esquemas de restaurar y eliminar exigen `expectedUpdatedAt`.
- [X] T066 [P] [US3] Escribir `tests/integration/financings.test.ts`. Se omite sin `TEST_DATABASE_URL`. Debe comprobar:
  - **Alta**:
    - guarda las cuotas, y el detalle devuelve total, pagado, saldo, estado, etiquetas y estado de cada cuota;
    - un `clientRef` inexistente da 404;
    - una compra futura en Caracas, o una cuota antes de la compra, da 422.
  - **Edición**:
    - cambia, agrega y quita cuotas pendientes, recalcula el total y el saldo y nunca toca las pagadas;
    - enviar el `id` de una cuota pagada o editar un financiamiento anulado da 409;
    - dejarlo sin cuotas da 422;
    - un `expectedUpdatedAt` antiguo da 409.
  - **Anulación**: anular con motivo y restaurar cambian el estado; repetir la misma acción da 409.
  - **Eliminación**:
    - sin cuotas pagadas, borra también las cuotas;
    - con alguna cuota pagada, sembrada con `seedFinancing`, da 409 “Este financiamiento tiene pagos registrados y no puede eliminarse. Puedes anularlo.”.
- [X] T067 [P] [US3] Escribir `tests/e2e/admin-financing.spec.ts`, que se omite sin `E2E`, con el bloque de US3:
  1. Desde la ficha de un cliente, “Nuevo financiamiento” abre el formulario con el cliente preseleccionado.
  2. $100,00 en 3 cuotas quincenales muestra $33,33, $33,33 y $33,34.
  3. Mover una fecha cambia la tabla.
  4. “Guardar financiamiento” lleva al detalle, con el anuncio “Financiamiento registrado”.
  5. La ficha del cliente lista el financiamiento.
  6. En `mobile`, el calendario editable no produce desplazamiento horizontal.

### Implementation for User Story 3

- [X] T068 [P] [US3] Crear `src/utils/financing-schedule.ts`, isomorfo, con fechas `AAAA-MM-DD` y centavos enteros, según “Reglas del calendario de cuotas” de data-model.md y research.md (Decision 8). Incluye:
  - `defaultFirstDueDate(purchaseDate, frequency)`;
  - `nextDueDate(previous, frequency, anchorDay)`;
  - `generateSchedule({ purchaseDate, totalCents, initialCents, count, frequency, firstDueDate })`;
  - `validateSchedule(...)`.

  Debe pasar T064.
- [X] T069 [P] [US3] Crear `src/server/validation/financing.ts` con:
  - `FINANCING_LIMITS`: descripción 500, motivo 500, de 1 a 48 cuotas sin contar la inicial y monto máximo 9.999.999.999,99;
  - `financingCreateSchema`;
  - `financingUpdateSchema`, con `description`, `pendingInstallments` y `expectedUpdatedAt`;
  - `annulSchema`, `restoreSchema` y `deleteSchema`.

  Debe pasar T065.
- [X] T070 [P] [US3] Crear `src/server/financing/repository.ts` con:
  - `insertFinancingWithInstallments`;
  - `getFinancingByRef`, con las cuotas y el cliente;
  - `lockFinancings(tx, ids)`, con `SELECT … FOR UPDATE`;
  - `replacePendingInstallments(tx, financingId, list, now)`: actualiza las cuotas por `id`, inserta las nuevas y elimina las pendientes que ya no aparecen, sin tocar las pagadas;
  - `setAnnulment(tx, id, value, now)`, `deleteFinancing(tx, id)` y `touchFinancing(tx, id, now)`.
- [X] T071 [US3] Crear `src/server/financing/service.ts`, según “Pagos financiados” de `contracts/admin-api.md` y “Operaciones sobre pagos” de data-model.md. Depende de T021 y T068–T070.
  - **Funciones**: `createFinancing`, `getFinancingDetail`, `updateFinancing`, `annulFinancing`, `restoreFinancing` y `deleteFinancing`.
  - **Transacciones**: cada operación ocurre en su propia transacción, con `FOR UPDATE`, y actualiza `updated_at`.
  - **Reglas**:
    - la compra no puede ser futura en Caracas, y ninguna cuota vence antes de la compra;
    - un `expectedUpdatedAt` distinto da 409 “El financiamiento cambió; recarga la página.”;
    - un financiamiento anulado no se edita;
    - eliminar con cuotas pagadas da 409 con `fields.installments`.
  - **Detalle**: `FinancingDetail` incluye el `PaymentInfo` de las cuotas pagadas, con `toPaymentInfo`, que se agrega en `src/server/financing/summary.ts`.

  Debe pasar T066.
- [X] T072 [P] [US3] Crear los endpoints de financiamientos en `src/pages/api/admin/financings/`, con `requireOwner` o `requireMutation`, 404 para un `:ref` inválido y errores con `apiErrorResponse`. Depende de T071.
  - `src/pages/api/admin/financings/index.ts`: `POST`, que responde 201.
  - `src/pages/api/admin/financings/[ref].ts`: `GET`, `PATCH` y `DELETE`. `DELETE` recibe `expectedUpdatedAt` en el cuerpo o en la consulta y responde 204.
  - `src/pages/api/admin/financings/[ref]/annul.ts` y `src/pages/api/admin/financings/[ref]/restore.ts`.
- [X] T073 [P] [US3] Crear `src/components/admin/FinancingForm.astro`, según “`/admin/pagos-financiados/nuevo`” de `contracts/admin-ui.md`:
  - **Cliente**:
    - buscador accesible con `GET /api/admin/clients?search=`, cuyos resultados son botones de opción;
    - con `?cliente=<ref>`, el cliente viene preseleccionado;
    - si no hay resultados, ofrece “Registrar cliente”.
  - **Campos**:
    - Descripción;
    - Fecha de compra, con hoy en Caracas como valor por defecto y como máximo;
    - Monto total e Inicial opcional;
    - Número de cuotas (1–48) y Frecuencia, Quincenal por defecto;
    - Fecha de la primera cuota, propuesta con `defaultFirstDueDate`.
  - **Calendario propuesto**:
    - se recalcula con `generateSchedule` cada vez que cambia un dato de generación;
    - es editable por fila (fecha y monto), con la inicial marcada y errores por fila;
    - muestra “Total del financiamiento: $X” y, si difiere del monto escrito, avisa “El total ($X) difiere del monto indicado ($Y)” sin impedir guardar;
    - “Volver a generar” descarta las ediciones, con confirmación.
  - **Guardar**: “Guardar financiamiento” envía `POST /api/admin/financings` una sola vez y lleva al detalle, con el anuncio “Financiamiento registrado”.
- [X] T074 [P] [US3] Crear `src/components/admin/InstallmentTable.astro`:
  - **Vista**: tabla en escritorio y tarjetas en móvil, con la cuota (“Inicial” o “2 de 4”), el vencimiento, el monto y el estado con texto: “Vencida hace 3 días”, “Vence hoy”, “Por vencer” o “Pagada”.
  - **Edición de las cuotas pendientes**:
    - fecha y monto editables;
    - “Agregar cuota”, con la fecha propuesta por `nextDueDate`, y “Quitar”;
    - el nuevo total y el nuevo saldo se muestran antes de guardar;
    - las cuotas pagadas quedan bloqueadas, con la nota “Deshaz el pago para modificarla”.
- [X] T075 [US3] Crear `src/pages/admin/pagos-financiados/nuevo.astro`, con “← Volver”, el encabezado “Nuevo financiamiento” y `FinancingForm`, que recibe el cliente de `?cliente=<ref>` si existe. Depende de T073.
- [X] T076 [US3] Crear `src/pages/admin/pagos-financiados/[ref].astro`. Depende de T036, T071 y T074.
  - **Encabezado**: “Financiamiento #N”, con el cliente (enlace), la descripción, la fecha de compra, la frecuencia, el estado con texto y, cuando corresponda, “Registrado por carga masiva”.
  - **Totales**: Total, Pagado y Saldo.
  - **Calendario**: `InstallmentTable`, con “Editar calendario” (`PATCH`).
  - **Anular**: usa `ConfirmDialog` con motivo. Deja la insignia “Anulado”, deshabilita la edición y muestra “Restaurar”.
  - **Eliminar**: solo se habilita sin cuotas pagadas. Si hay alguna, queda deshabilitado con “Tiene pagos registrados: puedes anularlo”.
  - **Conflicto**: ante un 409 de `expectedUpdatedAt`, muestra “El financiamiento cambió; recarga la página.” con “Recargar”.
  - **`ref` inexistente**: responde 404.
- [X] T077 [US3] Modificar `src/pages/admin/clientes/[ref].astro`:
  - agregar la acción “Nuevo financiamiento”, hacia `/admin/pagos-financiados/nuevo?cliente=<ref>`;
  - enlazar cada financiamiento de la lista a `/admin/pagos-financiados/<ref>`.

**Checkpoint**: Los financiamientos se registran, se consultan y se ajustan con su calendario. El cobro de cuotas llega con la US4, y ambas historias se publican juntas como segundo incremento.

---

## Phase 6: User Story 4 - Marcar cuotas pagadas y seguir los pagos pendientes (Priority: P1)

**Goal**: La propietaria ve en un solo lugar el resumen y las cuotas pendientes de todos sus clientes, con su equivalente en bolívares. Registra pagos en dólares o en bolívares a tasa euro BCV, de una o varias cuotas a la vez, parciales, y puede deshacerlos.

**Independent Test**:

1. Con un financiamiento de 4 cuotas, una de ellas vencida, abrir “Pagos financiados”: la cuota vencida aparece con sus días de atraso.
2. Registrar el pago en bolívares con la tasa del día.
3. Comprobar el monto en bolívares y que bajan el saldo y el total por cobrar.
4. Deshacer el pago.

### Tests for User Story 4

- [X] T078 [P] [US4] Escribir `tests/unit/euro-rates.test.ts` para las funciones puras de `src/server/financing/euro-rates.ts`. Debe fallar inicialmente y comprobar:
  - **`roundHalfUp2`**, sobre texto decimal: `991.16445734` da `991.16`, `985.729808` da `985.73` y `18.735` da `18.74`.
  - **`parseSourceItems`**: descarta uno a uno los elementos con alguno de estos problemas:
    - `fecha` sin el formato `AAAA-MM-DD`;
    - `promedio` no finito, ≤ 0 o ≥ 10¹²;
    - `moneda` distinta de `EUR` o `fuente` distinta de `oficial`.
  - **`pickApplicableRate`**:
    - un día hábil usa su propia tasa;
    - el sábado 17 y el domingo 18/10/2026 usan la del viernes 16;
    - el feriado del 12/10/2026 usa la del 09/10;
    - una fecha anterior a la primera tasa no tiene tasa.
  - **`shouldSync`**: es verdadero solo si la última tasa es anterior a hoy en Caracas y pasaron más de 30 minutos desde el último intento, con reloj inyectable.
- [X] T079 [P] [US4] Ampliar `tests/unit/money.test.ts` sin cambiar los casos de `formatMoney`:
  - `formatBolivares(1234.5)` da `Bs 1.234,50`, y `formatBolivares(0)` da `Bs 0,00`;
  - `formatEuroRate("985.73")` da `Bs 985,73 por €`;
  - `usdToVes("20.00", "50.00")` da `"1000.00"`, y `usdToVes("25.00", "991.16")` da `"24779.00"`;
  - el redondeo es half-up y usa centavos enteros.
- [X] T080 [P] [US4] Escribir `tests/integration/financing-payments.test.ts`. Se omite sin `TEST_DATABASE_URL` y simula `fetch`. Debe comprobar:
  - **Pagos**:
    - en dólares, con referencia;
    - en bolívares con tasa `oficial`: el servidor resuelve la tasa de `paidOn` e ignora cualquier valor enviado;
    - en bolívares con tasa `manual`;
    - `amount_ves` siempre es igual a `round2(amount_usd × tasa)` (SC-004);
    - varias cuotas se pagan en una sola acción.
  - **Pago parcial**: $10,00 sobre una cuota de $25,00 deja una cuota pagada de $10,00 y otra pendiente de $15,00 con la misma fecha, sin cambiar el total.
  - **Conflictos 409**:
    - dos pagos simultáneos de la misma cuota terminan en uno aplicado y un 409 con `fields.installments`;
    - pagar una cuota de un financiamiento anulado da 409;
    - sin ninguna tasa guardada y con la fuente caída, la tasa `oficial` da 409 con `fields.rate`.
  - **Errores 422**: una fecha futura, un pago parcial con varias cuotas o un monto parcial fuera de rango.
  - **Deshacer**: devuelve la cuota a pendiente sin datos de pago; deshacer una cuota pendiente da 409.
  - **Resumen**:
    - por cobrar, vencido y próximos 15 días excluyen los financiamientos anulados;
    - lo cobrado en el mes suma los pagos con `paid_on` en el mes, incluidos los de financiamientos anulados, y excluye los registrados por carga masiva;
    - pagar la última cuota deja el financiamiento en Pagado.
- [X] T081 [P] [US4] Escribir `tests/integration/euro-rates-sync.test.ts`, según “Pruebas” de `contracts/euro-rate-source.md`. Se omite sin `TEST_DATABASE_URL` y simula `fetch` con `vi.stubGlobal`, sin usar la red real. Debe comprobar:
  - la primera sincronización inserta el histórico;
  - un `404`, un tiempo agotado, un cuerpo de más de 2 MB o un JSON inválido no escriben nada, y se devuelve la última tasa guardada con `stale: true`;
  - sin ninguna tasa guardada, la respuesta es `status: "unavailable"`;
  - una tasa existente no cambia aunque la fuente devuelva otro valor para esa fecha;
  - dos llamadas seguidas no repiten la descarga antes de 30 minutos.
- [X] T082 [P] [US4] Añadir en `tests/e2e/admin-financing.spec.ts` el bloque de US4. Para no depender de la red, simula con `page.route` que `GET /api/admin/euro-rate` responde `unavailable`.
  1. “Pagos financiados” muestra las cuatro tarjetas del resumen y la cuota con “Vencida hace N días”.
  2. “Registrar pago” en bolívares exige escribir la tasa y calcula “Bs …” en vivo.
  3. Tras registrar el pago, el saldo y el resumen se actualizan y se anuncia “Pago registrado”.
  4. Un doble clic registra un solo pago.
  5. “Deshacer pago”, con confirmación, devuelve la cuota a pendiente.
  6. En `mobile`, el diálogo cabe en la pantalla.

### Implementation for User Story 4

- [X] T083 [P] [US4] Agregar en `src/utils/money.ts`, sin cambiar `formatMoney` y según FR-020 y data-model.md:
  - `formatBolivares(value)`, con el formato `Bs 1.234,50`;
  - `formatEuroRate(value)`, con el formato `Bs 985,73 por €`;
  - `usdToVes(amountUsd, rate)`, con centavos enteros y redondeo half-up.

  Debe pasar T079.
- [X] T084 [P] [US4] Crear `src/server/financing/euro-rates.ts`, según `contracts/euro-rate-source.md`, con:
  - las funciones puras de T078;
  - `ensureEuroRates(today, { fetchImpl, now })`:
    - descarga `https://ve.dolarapi.com/v1/historicos/euros/oficial` solo si `shouldSync` lo permite;
    - limita la espera con `AbortSignal.timeout(3000)` y la lectura del cuerpo a 2 MB;
    - guarda `rate_date`, `value`, `source_value` y `fetched_at` con `INSERT … ON CONFLICT (rate_date) DO NOTHING`, por lotes de 1.000;
    - solo registra `{ status, durationMs, inserted }`;
  - `resetEuroRateSyncState()`, solo para las pruebas;
  - `resolveEuroRate(date)`: devuelve `{ status: "ok" | "unavailable", rate, stale }` con la tasa de `MAX(rate_date) ≤ date`.

  Debe pasar T078 y T081.
- [X] T085 [P] [US4] Ampliar `src/server/validation/financing.ts` con:
  - **`paymentInputSchema`**:
    - `installmentIds`, de 1 a 100;
    - `paidOn` y `currency`;
    - `rate`, obligatorio con `VES`; su `value` es obligatorio con `manual`, > 0 y con como máximo 2 decimales;
    - `reference`, de hasta 160 caracteres;
    - `partialAmountUsd`, solo con una cuota.
  - **`installmentsQuerySchema`**: `status`, `client`, `from`, `to`, `page` y `pageSize`.
  - **`euroRateQuerySchema`**.
- [X] T086 [US4] Ampliar `src/server/financing/repository.ts`. Depende de T070.
  - **`listInstallments(query, today)`**:
    - aplica los filtros de `contracts/admin-api.md`. Con `status=paid`, `from` y `to` se aplican sobre `paid_on`;
    - ordena por vencimiento o, en las pagadas, por fecha de pago descendente, con las registradas por carga masiva al final;
    - pagina e incluye los datos del cliente y del financiamiento.
  - **`receivableSummary(today)`**: según “Valores derivados” de data-model.md.
  - **Escrituras de pago**: marcar pagada, dividir y pagar, y deshacer.
- [X] T087 [US4] Crear `src/server/financing/payments.ts` con `registerPayments(input, { now })` y `undoInstallmentPayment(id, { now })`, según research.md (Decision 9). Depende de T083–T086.
  - **Transacción**: bloquea con `FOR UPDATE` los financiamientos de las cuotas.
  - **Todo o nada**: si alguna cuota ya no está pendiente o su financiamiento está anulado, responde 409 “Algunas cuotas ya estaban pagadas o su financiamiento está anulado. Recarga la página.” sin registrar nada.
  - **Fecha**: `paidOn` no puede ser futura en Caracas.
  - **Tasa**:
    - la `oficial` se resuelve en el servidor con `resolveEuroRate`. Sin tasa, responde 409 con `fields.rate` “No hay una tasa euro oficial para esa fecha; escríbela a mano.”;
    - la `manual` se valida.
  - **Montos**: `amount_ves` se calcula con `usdToVes`. El pago parcial divide la cuota.
  - **Registro**: actualiza `paid_recorded_at`, `payment_origin = 'panel'` y `financings.updated_at`.

  Debe pasar T080.
- [X] T088 [US4] Ampliar `src/server/financing/summary.ts` con la conversión a `InstallmentListResponse` de `contracts/admin-api.md`. `amountVesEquivalent` se calcula con `usdToVes` y la tasa oficial aplicable hoy, o es `null` si no hay tasa.
- [X] T089 [P] [US4] Crear los endpoints de pagos y de la tasa en `src/pages/api/admin/`, con `requireOwner` o `requireMutation` y errores con `apiErrorResponse`:
  - `src/pages/api/admin/financings/payments.ts`: `POST`;
  - `src/pages/api/admin/financings/installments/index.ts`: `GET`;
  - `src/pages/api/admin/financings/installments/[id]/undo-payment.ts`: `POST`, que devuelve `FinancingDetail`;
  - `src/pages/api/admin/euro-rate.ts`: `GET`. Sin `date` usa hoy en Caracas, una fecha futura da 422, y antes de responder ejecuta `ensureEuroRates`.
- [X] T090 [P] [US4] Crear `src/components/admin/PaymentDialog.astro`, según “Diálogo Registrar pago” de `contracts/admin-ui.md`:
  - **Contenido**: el resumen de las cuotas y el total.
  - **Fecha de pago**: hoy en Caracas como valor y como `max`.
  - **Moneda**: “Dólares” o “Bolívares”.
  - **Recuadro de tasa**:
    - tiene los estados `cargando`, `oficial`, `sin_tasa` y `desactualizada`;
    - consulta `GET /api/admin/euro-rate?date=` cada vez que cambia la fecha;
    - si se edita la tasa, pasa a “Tasa escrita a mano” (`manual`).
  - **Monto en bolívares**: por cuota y en total, calculado en vivo con `usdToVes` y mostrado con `formatBolivares`.
  - **Pago parcial**: solo con una cuota; mínimo $0,01 y máximo el monto de la cuota menos $0,01, con la nota “El resto ($X) quedará pendiente con la misma fecha”.
  - **Referencia**: opcional.
  - **Envío**: único. Un 200 cierra el diálogo, actualiza la pantalla y anuncia “Pago registrado”; un 409 muestra el mensaje con “Recargar”.
- [X] T091 [US4] Crear `src/pages/admin/pagos-financiados/index.astro`. Depende de T084 y T086–T090.
  - **Encabezado**: “Pagos financiados”, con la acción “Nuevo financiamiento”.
  - **Resumen**: las cuatro tarjetas.
  - **Tasa**: la línea de la tasa, con sus notas de fuente caída o sin tasa. `ensureEuroRates` espera como máximo 3 s.
  - **Filtros `GET`**: estado, cliente (un buscador por nombre o celular que fija `cliente=<ref>`), rango de fechas y tamaño de página.
  - **Lista**, ordenada; cada cuota muestra:
    - una casilla de selección, solo en las cuotas pendientes de financiamientos no anulados;
    - el cliente y la descripción, con enlace;
    - la cuota, el vencimiento y el estado con texto;
    - el monto en `$` y su equivalente en `Bs`;
    - la acción “Registrar pago”.
  - **Selección múltiple**: una barra “N cuotas seleccionadas · Total $X · Registrar pago”.
  - **Estados vacíos**: “No hay cuotas pendientes.”, o el mensaje de cada filtro; y “Todavía no hay financiamientos.” con “Nuevo financiamiento”.
  - **Paginación**.
- [X] T092 [US4] Ampliar `src/components/admin/InstallmentTable.astro` y `src/pages/admin/pagos-financiados/[ref].astro`:
  - **Cuotas pagadas**: muestran la fecha de pago, la moneda, la tasa con su fecha o “escrita a mano”, el monto en Bs y la referencia; o bien “Pagada (registrada por carga masiva)”.
  - **Acciones**:
    - “Registrar pago”, con `PaymentDialog`, en las cuotas pendientes de financiamientos no anulados;
    - “Deshacer pago”, con `ConfirmDialog`, en las pagadas.
  - **Tasa**: la página ejecuta `ensureEuroRates` al cargarse.
- [X] T093 [P] [US4] Agregar “Pagos financiados” (`/admin/pagos-financiados`) después de Clientes en `src/components/admin/nav-items.ts`.

**Checkpoint**: El segundo incremento (US3 + US4) está completo: financiamientos con calendario, cobros en dólares o en bolívares, pagos parciales, resumen por cobrar y deshacer.

---

## Phase 7: User Story 5 - Cargar financiamientos en bloque con la plantilla de Excel (Priority: P2)

**Goal**: La propietaria registra de una vez los financiamientos que lleva fuera del sistema, incluidos los que ya tienen cuotas pagadas.

**Independent Test**:

1. Completar la plantilla con tres financiamientos de clientes registrados, uno de ellos con dos cuotas ya pagadas.
2. Revisar los calendarios en la vista previa y confirmar.
3. Ver en “Pagos financiados” las cuotas pendientes y las pagadas por carga masiva.

### Tests for User Story 5

- [X] T094 [P] [US5] Escribir `tests/unit/financing-bulk-rows.test.ts` para `parseFinancingRow` de `src/server/financing/bulk/rows.ts`:
  - **Celular del cliente** (o su alias `Celular`): vacío da `REQUIRED`, e inválido da `INVALID_PHONE`.
  - **Descripción**: con más de 500 caracteres da `TOO_LONG`.
  - **Fecha de compra**: inválida da `INVALID_DATE`, y futura da `FUTURE_PURCHASE_DATE`.
  - **Monto total**: da `INVALID_AMOUNT`, `AMOUNT_DECIMALS` o `AMOUNT_TOO_HIGH`, según el caso.
  - **Inicial**: mayor o igual al total da `INITIAL_TOO_HIGH`.
  - **Número de cuotas**: fuera de 1–48 da `INVALID_INSTALLMENT_COUNT`.
  - **Frecuencia**: vacía es Quincenal, `" SEMANAL "` es Semanal y otro valor da `INVALID_FREQUENCY`.
  - **Fecha de la primera cuota**: anterior a la compra da `FIRST_DUE_BEFORE_PURCHASE`; vacía usa la fecha por defecto.
  - **Cuotas pagadas**: si no es un entero ≥ 0 da `INVALID_PAID_COUNT`, y si supera el número de cuotas (más la inicial, si la hay) da `PAID_COUNT_TOO_HIGH`.
- [X] T095 [P] [US5] Escribir `tests/unit/financing-bulk-changes.test.ts` para `buildFinancingChangeSet` de `src/server/financing/bulk/changes.ts`:
  - **Cliente**:
    - un celular sin cliente da `CLIENT_NOT_FOUND`;
    - un nombre distinto, comparado con `normalizeKey`, da `CLIENT_NAME_MISMATCH`.
  - **Duplicados**: `POSSIBLE_DUPLICATE` contra un financiamiento existente y contra otra fila con el mismo cliente, fecha de compra y monto total.
  - **Calendario**:
    - coincide con `generateSchedule`;
    - las primeras `Cuotas pagadas` quedan pagadas, contando la inicial;
    - la fila 3 del ejemplo de `contracts/bulk-workbooks.md` deja pagadas la inicial y las cuotas del 15/09 y del 30/09.
  - **Resumen**: `FinancingScheduleSummary` y los conteos `created`, `installments`, `financedUsd` y `outstandingUsd` son correctos.
  - **Altas**: toda fila es un alta.
  - **Línea base**: `["financiamientos-v1", count, maxRef, [[ref, phoneE164], …]]` cambia si cambia el marcador.
- [X] T096 [P] [US5] Escribir `tests/contract/financing-workbook.test.ts`:
  - **Plantilla**:
    - hojas `Instrucciones`, `Financiamientos` y `Listas`, con `Sección` = `Financiamientos`;
    - el encabezado de `contracts/bulk-workbooks.md`, en orden;
    - en `Listas`, los clientes registrados con su celular.
  - **XML**, en las filas 2 a 2.001:
    - lista `Semanal,Quincenal,Mensual` con estilo `stop`;
    - decimales ≥ 0 en los montos;
    - enteros de 1 a 48 en el número de cuotas, y ≥ 0 en las pagadas;
    - fechas con estilo `warning`;
    - longitud ≤ 500 en Descripción;
    - formato `@` en el celular.
  - **Rechazos**: 2.001 filas dan `TOO_MANY_ROWS`, y `Sección: Clientes` da `WRONG_SECTION`.
- [X] T097 [P] [US5] Añadir en `tests/contract/bulk-api-response.test.ts` el bloque de financiamientos:
  - cada cambio trae `schedule`, y el resumen trae `installments`, `financedUsd` y `outstandingUsd`;
  - la vista previa de 2.000 filas, con 48 cuotas e inicial, ocupa menos de 4 MB al serializarse.
- [X] T098 [P] [US5] Escribir `tests/integration/financing-bulk-apply.test.ts`. Se omite sin `TEST_DATABASE_URL`. Debe comprobar:
  - **Altas**: la aplicación crea los financiamientos con `origin = 'carga_masiva'` y sus cuotas.
  - **Cuotas pagadas**: las primeras `Cuotas pagadas` quedan `pagada`, con `payment_origin = 'carga_masiva'` y sin fecha, moneda ni tasa. Lo cobrado en el mes no cambia.
  - **Doble envío**: una segunda confirmación con el mismo token da 409 y no duplica nada.
  - **Cliente eliminado en paralelo**: mientras la aplicación está detenida dentro de su transacción (un `vi.spyOn` que espera una promesa), eliminar un cliente referenciado espera por el `FOR KEY SHARE`. Al terminar la aplicación, la eliminación responde 409 y el financiamiento queda creado.
  - **Repetición**: una nueva vista previa del mismo archivo advierte `POSSIBLE_DUPLICATE` en cada fila.
- [X] T099 [P] [US5] Añadir en `tests/e2e/admin-financing.spec.ts` el bloque de US5:
  1. “Carga masiva”, en “Pagos financiados”, descarga `plantilla-financiamientos.xlsx`.
  2. Un archivo con un celular inexistente muestra `CLIENT_NOT_FOUND` y la confirmación queda deshabilitada.
  3. Con el archivo corregido, la vista previa muestra el resumen y “Ver fechas”.
  4. Tras confirmar, el detalle del financiamiento muestra “Pagada (registrada por carga masiva)”.

### Implementation for User Story 5

- [X] T100 [P] [US5] Crear `src/server/financing/bulk/format.ts`:
  - sección `financiamientos`, hoja `Financiamientos`, límite de 2.000 filas, bloqueo `7_301_005` y propósito `bulk-preview:financiamientos`;
  - columnas de “Hoja Financiamientos” de `contracts/bulk-workbooks.md`, con `Celular` como alias de `Celular del cliente`;
  - nombre de archivo `plantilla-financiamientos.xlsx`;
  - el catálogo de incidencias común y el de financiamientos de `contracts/admin-api.md`;
  - instrucciones sobre una fila por financiamiento, la inicial, la frecuencia por defecto y las cuotas pagadas;
  - ayudas de Excel en las filas 2 a 2.001.
- [X] T101 [P] [US5] Crear `src/server/financing/bulk/rows.ts` con `parseFinancingRow(cells, columns, excelRow, today)`. Devuelve un `ParsedFinancingRow` de data-model.md con los valores ya validados:
  - una `frequency` vacía equivale a `quincenal`;
  - una `firstDueDate` vacía equivale a `defaultFirstDueDate`;
  - un `paidCount` vacío equivale a 0.

  Debe pasar T094.
- [X] T102 [US5] Crear `src/server/financing/bulk/changes.ts` con `buildFinancingChangeSet({ rows, workbook, snapshot })`. Depende de T068, T100 y T101. Comprende:
  - la búsqueda del cliente por celular y las advertencias;
  - el calendario con `generateSchedule` y las cuotas pagadas;
  - cada `FinancingDraft`, con su `summary` compacto (research.md, Decision 14);
  - los conteos, el estado y la `baseline`.

  Debe pasar T095.
- [X] T103 [US5] Crear `src/server/financing/bulk/repository.ts`. Depende de T031 y T102.
  - **`loadFinancingSnapshot(source)`**: los clientes (`{ id, ref, name, phoneE164 }`), los financiamientos existentes (`{ clientId, purchaseDate, totalCents }`) y el marcador `{ count, maxRef }`.
  - **`withFinancingsBulkLock({ phones, lockTimeoutMs }, callback)`**: usa `withBulkLock` con `7_301_005` y `FOR KEY SHARE` sobre los clientes referenciados.
  - **`insertFinancingDrafts(tx, drafts, now)`**: inserta por lotes de 1.000 los financiamientos, con `RETURNING id, ref`, y después sus cuotas. Las cuotas pagadas llevan `payment_origin = 'carga_masiva'`.
- [X] T104 [US5] Crear `src/server/financing/bulk/service.ts`, con el mismo flujo que T060. Depende de T103.
  - **Funciones**: `buildFinancingsTemplate(now)`, `previewFinancingsFile(...)` y `applyFinancingsFile(...)`.
  - **Conflicto**: el mensaje 409 es “Los financiamientos cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”.
  - **Enlaces**: `url` `/admin/pagos-financiados/<ref>`.

  Debe pasar T096–T098.
- [X] T105 [P] [US5] Crear `src/pages/api/admin/financings/bulk/template.ts` (`GET`), `src/pages/api/admin/financings/bulk/preview.ts` y `src/pages/api/admin/financings/bulk/apply.ts` (`POST`), como en T061.
- [X] T106 [P] [US5] Agregar en `src/components/admin/bulk/renderers.ts` el renderizador de `financiamientos`:
  - una tarjeta con la fila, el cliente y la descripción;
  - el resumen, por ejemplo “Inicial $20,00 (pagada) + 4 cuotas quincenales de $25,00, del 15/09/2026 al 31/10/2026; 2 ya pagadas”;
  - “Ver fechas”, que reconstruye la lista con `generateSchedule`.
- [X] T107 [US5] Crear `src/pages/admin/pagos-financiados/carga-masiva.astro`. Depende de T105 y T106.
  - **Título**: “Carga masiva de financiamientos”.
  - **Descarga**: solo “Descargar plantilla”, con “Una fila por financiamiento. Para financiamientos en curso, indica cuántas cuotas ya se pagaron”.
  - **Límites**: los de `contracts/admin-ui.md`.
  - En `src/pages/admin/pagos-financiados/index.astro`, agregar la acción “Carga masiva” y “Usar carga masiva” en el estado vacío.

**Checkpoint**: Los financiamientos en curso se incorporan en bloque con sus cuotas ya pagadas, sin editar los existentes y con advertencias ante posibles duplicados.

---

## Phase 8: User Story 6 - Registrar congresos y verlos en un calendario (Priority: P2)

**Goal**: La propietaria registra congresos y los ve pintados en un calendario mensual al estilo de Google Calendar, con una lista como alternativa.

**Independent Test**:

1. Registrar un congreso del 30/10 al 01/11/2026 y otro de un solo día, el 31/10.
2. Comprobar que ambos aparecen pintados en octubre y en noviembre, en carriles distintos.
3. Seleccionar una franja: lleva al detalle de su congreso.
4. Seleccionar un día: el formulario propone esa fecha de inicio.

### Tests for User Story 6

- [X] T108 [P] [US6] Escribir `tests/unit/calendar.test.ts` para `buildMonthView` de `src/utils/calendar.ts`:
  - **Semanas**: van de domingo a sábado, con los días de los meses vecinos marcados y el día de hoy marcado.
  - **Congresos**:
    - uno del 30/10 al 01/11/2026 aparece en octubre y en noviembre exactamente en sus días, con `continuesBefore` y `continuesAfter`;
    - uno de un solo día;
    - uno que cruza semanas se divide en tramos.
  - **Superposiciones**: tres congresos superpuestos ocupan carriles distintos, y con `maxLanes = 2` el día indica “+1 más”.
  - **Color**: es estable por `ref`, con una paleta de 8 colores.
  - **Mes vacío**: devuelve `isEmpty`.
- [X] T109 [P] [US6] Escribir `tests/unit/congresses-validation.test.ts` para `src/server/validation/congresses.ts`:
  - `name` tiene de 1 a 160 caracteres;
  - `startDate` y `endDate` son obligatorias y válidas;
  - una `endDate` anterior a `startDate` da `fields.endDate` “La fecha de fin no puede ser anterior a la de inicio.”;
  - `venue` y `specialty` admiten hasta 160 caracteres, y `notes`, hasta 1.000;
  - los textos vacíos pasan a `null`;
  - `expectedUpdatedAt` es obligatorio al editar y al eliminar.
- [X] T110 [P] [US6] Escribir `tests/integration/congresses.test.ts`. Se omite sin `TEST_DATABASE_URL`. Debe comprobar:
  - el alta guarda la especialidad con su escritura canónica;
  - la consulta por rango del servicio, la que usa `GET /api/admin/congresses?from&to`, devuelve los congresos que se superponen con el rango, ordenados por inicio y nombre, con `days` contando ambos extremos;
  - editar o eliminar con un `expectedUpdatedAt` antiguo da 409;
  - un `ref` inexistente da 404;
  - se obtiene el próximo congreso después de una fecha.
- [X] T111 [P] [US6] Escribir `tests/e2e/admin-congresses.spec.ts`, que se omite sin `E2E`, con el bloque de US6:
  1. Registrar un congreso del 30/10 al 01/11/2026 y otro el 31/10.
  2. En octubre y en noviembre aparecen las franjas con su nombre accesible, y el 31/10 tiene dos carriles.
  3. Una franja lleva al detalle.
  4. El número de un día abre el formulario con esa fecha de inicio.
  5. Si Hasta es anterior a Desde, el error aparece en “Hasta”.
  6. La vista `?vista=lista` muestra los congresos.
  7. En `mobile`, los días con congreso muestran barras, la lista del mes aparece debajo y no hay desplazamiento horizontal.

### Implementation for User Story 6

- [X] T112 [P] [US6] Crear `src/utils/calendar.ts` con `buildMonthView({ month, today, congresses, maxLanes })`, según research.md (Decision 11):
  - semanas de domingo a sábado;
  - cada día con su fecha, si pertenece al mes y si es hoy;
  - tramos por semana, con la columna inicial, el número de días, el carril y si continúan antes o después;
  - asignación voraz de carriles, por fecha de inicio y luego por duración descendente;
  - conteo de “+N más” por día;
  - color estable: `ref` módulo una paleta de 8 colores con contraste ≥ 4.5:1 con texto oscuro.

  Debe pasar T108.
- [X] T113 [P] [US6] Crear `src/server/validation/congresses.ts` con:
  - `CONGRESS_LIMITS`: nombre 160, lugar 160, especialidad 160 y notas 1.000;
  - `congressInputSchema`, `congressUpdateSchema`, `congressDeleteSchema` y `congressRangeQuerySchema`.

  Debe pasar T109.
- [X] T114 [US6] Crear `src/server/congresses/repository.ts` con:
  - `listCongressesInRange(from, to)`, con la condición `start_date <= to AND end_date >= from`;
  - `listUpcoming(today)`, `listPast(today)` y `findNextCongressAfter(date)`;
  - `getCongressByRef`, `insertCongress`, `updateCongressIfUnchanged` y `deleteCongressIfUnchanged`.
- [X] T115 [US6] Crear `src/server/congresses/service.ts`. Depende de T023, T113 y T114.
  - **Funciones**: `listCongresses`, `getCongressDetail`, `createCongress`, `updateCongress` y `deleteCongress`.
  - **Especialidad**: se guarda con `canonicalize`.
  - **Respuesta**: `CongressDetail` incluye `days`.
  - **Errores**: los 404 y 409 de `contracts/admin-api.md`.

  Debe pasar T110.
- [X] T116 [P] [US6] Crear `src/pages/api/admin/congresses/index.ts` (`GET` por rango y `POST`) y `src/pages/api/admin/congresses/[ref].ts` (`PATCH` y `DELETE`), con `requireOwner` o `requireMutation` y `apiErrorResponse`. Depende de T115.
- [X] T117 [P] [US6] Crear `src/components/admin/CongressCalendar.astro`, según “`/admin/congresos` (calendario)” de `contracts/admin-ui.md`:
  - **Cuadrícula**: CSS de 7 columnas, con encabezados abreviados que llevan el nombre completo en `abbr`. Los días de los meses vecinos aparecen atenuados.
  - **Hoy**: un círculo y `aria-current="date"`.
  - **Número de día**: un enlace con el nombre accesible “Registrar congreso el 12 de octubre de 2026”, hacia `/admin/congresos/nuevo?desde=AAAA-MM-DD`.
  - **Franjas**:
    - de color, con el nombre en texto oscuro;
    - con borde en ángulo y la palabra “continúa” para lectores de pantalla cuando siguen en otra semana;
    - enlazadas al detalle, con el nombre accesible “{Nombre}, del 30 de octubre al 1 de noviembre de 2026”.
  - **Desbordamiento**: 3 carriles en escritorio y 2 en tableta. Los demás congresos van en un `<details>` “+N más” con la lista del día.
  - **Teléfono**: por debajo de 640 px, las franjas se reducen a barras sin texto, con `aria-hidden`, y la lista del mes aparece debajo.
- [X] T118 [P] [US6] Crear `src/components/admin/CongressList.astro`:
  - “Próximos congresos”, ordenados por inicio, con nombre, fechas (“30/10/2026 – 01/11/2026 · 3 días”), lugar, especialidad y enlace;
  - un `<details>` “Congresos pasados”, del más reciente al más antiguo.
- [X] T119 [P] [US6] Crear `src/components/admin/CongressForm.astro`:
  - **Campos**:
    - Nombre;
    - Desde y Hasta, con `<input type="date">`. Hasta toma el valor de Desde si estaba vacía o era anterior;
    - Lugar;
    - Especialidad, con `SuggestInput`;
    - Notas.
  - **Envío**: manda JSON con `x-csrf-token`. Los errores se muestran por campo, y el de fechas aparece en “Hasta”.
  - **Al guardar**: lleva al calendario del mes de inicio, con el anuncio “Congreso guardado”.
- [X] T120 [US6] Crear `src/pages/admin/congresos/index.astro`. Depende de T112, T115, T117 y T118.
  - **Encabezado**: “Congresos”, con la acción “Nuevo congreso”.
  - **Navegación entre meses**: “‹ Mes anterior”, “Hoy” y “Mes siguiente ›”, con `?mes=AAAA-MM` validado. Por defecto se muestra el mes actual en Caracas.
  - **Título**: el mes, en un `<h2>` que se anuncia al cambiar.
  - **Vista**: el selector “Calendario | Lista” (`?vista=lista`).
  - **Mes sin congresos**: “No hay congresos en octubre de 2026.” y, si existe, “El próximo es {nombre}, el {dd/mm/aaaa}”, con enlace a su mes.
- [X] T121 [US6] Crear las páginas de alta y detalle de congresos en `src/pages/admin/congresos/`, que usan `CongressForm`. Depende de T115 y T119.
  - `src/pages/admin/congresos/nuevo.astro`: propone como fecha de inicio la de `?desde=AAAA-MM-DD`.
  - `src/pages/admin/congresos/[ref].astro`: muestra el detalle con “N días”, “Editar”, “Eliminar” con `ConfirmDialog` y “Ver en el calendario”. Un `ref` inexistente responde 404.
- [X] T122 [P] [US6] Agregar “Congresos” (`/admin/congresos`) después de Pagos financiados en `src/components/admin/nav-items.ts`.

**Checkpoint**: El calendario de congresos funciona por sí solo, con la lista como alternativa accesible y en teléfonos.

---

## Phase 9: User Story 7 - Cargar congresos en bloque con la plantilla de Excel (Priority: P3)

**Goal**: La propietaria registra o corrige varios congresos a la vez, incluidos los de su pestaña “Eventos”.

**Independent Test**:

1. Pegar las filas de “Eventos” en la plantilla y subirla: la fila sin fechas aparece como error.
2. Quitar esa fila y confirmar.
3. Ver los congresos pintados en el calendario.

### Tests for User Story 7

- [X] T123 [P] [US7] Escribir `tests/unit/congresses-bulk-changes.test.ts` para `parseCongressRow` y `buildCongressChangeSet` de `src/server/congresses/bulk/`:
  - **Errores**:
    - `Desde`, `Hasta` y `Nombre` vacíos dan `REQUIRED`;
    - las fechas inválidas dan `INVALID_DATE`;
    - `Hasta` anterior a `Desde` da `END_BEFORE_START`;
    - `INVALID_ID`, `UNKNOWN_ID` y `DUPLICATE_ID`.
  - **Celdas vacías**: en una fila con Identificador, una celda opcional vacía borra el dato.
  - **Advertencias**:
    - `POSSIBLE_DUPLICATE`, por nombre normalizado y fecha de inicio, contra congresos existentes y del archivo;
    - `LONG_EVENT`, con más de 31 días;
    - `ALREADY_ENDED`;
    - `NEW_VALUE`, en la especialidad;
    - `MODIFIED_AFTER_DOWNLOAD`.
  - **Resultado**:
    - la etiqueta es `Nombre · 30/10/2026 – 01/11/2026`;
    - la línea base es `["congresos-v1", …]`;
    - aplicar el resultado y volver a calcular no produce cambios.
- [X] T124 [P] [US7] Escribir `tests/contract/congresses-workbook.test.ts`:
  - **Plantilla y datos actuales**: hojas `Instrucciones`, `Congresos` y `Listas`, con `Sección` = `Congresos` y el encabezado `Desde, Hasta, Especialidad, Lugar, Nombre, Notas, Identificador`.
  - **Datos actuales**: ordenados por Desde, Nombre e Identificador, con las fechas como fechas de Excel.
  - **Validaciones**, en las filas 2 a 10.001: fechas con estilo `warning`, sugerencias de especialidad y longitud de Nombre y Lugar.
  - **Lectura**: las filas de la hoja `Eventos` de `medicosWorkbook`, copiadas en la plantilla, se leen con sus fechas UTC.
- [X] T125 [P] [US7] Añadir en `tests/contract/bulk-api-response.test.ts` el bloque de congresos: la vista previa de 10.000 altas ocupa menos de 4 MB.
- [X] T126 [P] [US7] Escribir `tests/integration/congresses-bulk-apply.test.ts`. Se omite sin `TEST_DATABASE_URL`. Debe comprobar:
  - las altas y ediciones se aplican de forma atómica;
  - una celda opcional vacía en una fila con Identificador borra el dato;
  - ningún congreso se elimina;
  - una edición individual entre la vista previa y la confirmación da 409;
  - dos confirmaciones simultáneas dan un resultado aplicado y un 409;
  - volver a subir el archivo ya aplicado da `no_changes`.
- [X] T127 [P] [US7] Añadir en `tests/e2e/admin-congresses.spec.ts` el bloque de US7:
  1. “Carga masiva”, en “Congresos”, descarga `plantilla-congresos.xlsx`.
  2. Un archivo con la fila de “Medicina Estética” sin fechas muestra `REQUIRED`.
  3. Sin esa fila, la confirmación pinta los congresos en su mes.

### Implementation for User Story 7

- [X] T128 [P] [US7] Crear `src/server/congresses/bulk/format.ts`:
  - sección `congresos`, hoja `Congresos`, límite de 10.000 filas, bloqueo `7_301_006` y propósito `bulk-preview:congresos`;
  - columnas de “Hoja Congresos” de `contracts/bulk-workbooks.md`;
  - nombres de archivo `plantilla-congresos.xlsx` y `congresos-AAAA-MM-DD.xlsx`;
  - el catálogo de incidencias común y el de congresos de `contracts/admin-api.md`;
  - instrucciones y ayudas de Excel en las filas 2 a 10.001.
- [X] T129 [P] [US7] Crear `src/server/congresses/bulk/rows.ts` con `parseCongressRow(cells, columns, excelRow)`, con los límites de `CONGRESS_LIMITS`.
- [X] T130 [US7] Crear `src/server/congresses/bulk/changes.ts` con `buildCongressChangeSet({ rows, workbook, snapshot, today })`, según research.md (Decision 7). Depende de T128 y T129. Debe pasar T123.
- [X] T131 [US7] Crear `src/server/congresses/bulk/repository.ts`. Depende de T031 y T130.
  - `loadCongressSnapshot(source)`.
  - `withCongressesBulkLock({ refs, lockTimeoutMs }, callback)`, con `7_301_006` y `FOR UPDATE` sobre los congresos referenciados.
  - Inserciones y actualizaciones por lotes de 1.000, sin `DELETE`.
- [X] T132 [US7] Crear `src/server/congresses/bulk/service.ts`, con el mismo flujo que T060. Depende de T131.
  - **Funciones**: `buildCongressesTemplate(now)`, `buildCongressesExport(now)`, `previewCongressesFile(...)` y `applyCongressesFile(...)`.
  - **Conflicto**: el mensaje 409 es “Los congresos cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”.
  - **Enlaces**: `url` `/admin/congresos/<ref>`.

  Debe pasar T124–T126.
- [X] T133 [P] [US7] Crear `src/pages/api/admin/congresses/bulk/template.ts`, `src/pages/api/admin/congresses/bulk/export.ts`, `src/pages/api/admin/congresses/bulk/preview.ts` y `src/pages/api/admin/congresses/bulk/apply.ts`, como en T061.
- [X] T134 [P] [US7] Agregar en `src/components/admin/bulk/renderers.ts` el renderizador de `congresos`, con la etiqueta `Nombre · 30/10/2026 – 01/11/2026`.
- [X] T135 [US7] Crear `src/pages/admin/congresos/carga-masiva.astro`. Depende de T133 y T134.
  - **Título**: “Carga masiva de congresos”.
  - **Descargas**: “Descargar plantilla vacía” y “Descargar congresos actuales”.
  - **Límites**: los de `contracts/admin-ui.md`.
  - En el encabezado de `src/pages/admin/congresos/index.astro`, agregar la acción “Carga masiva”.

**Checkpoint**: Los congresos del año se cargan o corrigen en bloque y aparecen en el calendario.

---

## Phase 10: User Story 8 - Contactar a un cliente por WhatsApp y recordarle una cuota (Priority: P3)

**Goal**: La propietaria abre WhatsApp con el cliente desde su ficha y prepara recordatorios de cuotas con el monto en dólares y su equivalente en bolívares.

**Independent Test**:

1. Desde la ficha de un cliente con una cuota vencida, abrir WhatsApp con su número.
2. Desde la cuota, preparar el recordatorio. Debe incluir la descripción, el número de cuota, la fecha, el monto en `$` y su equivalente en `Bs`, con la tasa y su fecha.

### Tests for User Story 8

- [X] T136 [P] [US8] Añadir en `tests/unit/whatsapp.test.ts` el bloque `describe("buildInstallmentReminder")`:
  - el mensaje sigue la plantilla de “Recordatorio por WhatsApp” de `contracts/admin-ui.md`;
  - una cuota vencida dice “vencida el”, y las demás, “con vencimiento el”;
  - la cuota aparece como “Inicial” o como “2 de 4”;
  - los montos usan `formatMoney` y `formatBolivares`;
  - sin tasa, se omite la parte en bolívares;
  - la URL lleva el texto codificado.
- [X] T137 [P] [US8] Añadir en `tests/e2e/admin-clients.spec.ts` el bloque de US8: “Escribir por WhatsApp”, en la ficha, enlaza a `https://wa.me/58…` con `target="_blank"` y `rel="noopener noreferrer"`.
- [X] T138 [P] [US8] Añadir en `tests/e2e/admin-financing.spec.ts` el bloque de US8: “Recordar por WhatsApp”, en una cuota pendiente, enlaza a `https://wa.me/58…?text=`. Al decodificar el parámetro aparecen la descripción, la cuota y el monto en `$`.

### Implementation for User Story 8

- [X] T139 [US8] Agregar en `src/utils/whatsapp.ts` `buildInstallmentReminder({ clientName, description, label, dueDate, state, amountUsd, rate })`, con la plantilla exacta de `contracts/admin-ui.md`. Debe pasar T136.
- [X] T140 [P] [US8] Agregar en `src/pages/admin/clientes/[ref].astro` la acción “Escribir por WhatsApp” (FR-043). Usa `whatsappUrl` y abre una pestaña nueva con `rel="noopener noreferrer"`.
- [X] T141 [P] [US8] Agregar “Recordar por WhatsApp” en las cuotas pendientes de `src/pages/admin/pagos-financiados/index.astro` y de `src/components/admin/InstallmentTable.astro` (FR-044). Usa `buildInstallmentReminder` con la tasa oficial más reciente. Depende de T139.

**Checkpoint**: Las ocho historias funcionan de forma independiente, y el cobro se apoya en el canal que el negocio ya usa.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Documentar las decisiones; comprobar la privacidad, el rendimiento y la accesibilidad; y ejecutar las puertas de calidad del proyecto.

- [X] T142 [P] Escribir `tests/unit/privacy-boundaries.test.ts` (FR-002, SC-010). Recorre `src/` con `node:fs` y falla si algún archivo fuera de `src/pages/admin/`, `src/pages/api/admin/` y `src/components/admin/` importa `src/server/clients`, `src/server/financing`, `src/server/congresses` o `src/server/reference`.
- [X] T143 [P] Ampliar `tests/e2e/admin-nav.spec.ts` con:
  - el orden final de la navegación: Productos, Clientes, Pagos financiados, Congresos, Estadísticas, Ver vitrina y Salir;
  - el texto del inicio: “Gestiona productos, clientes, pagos financiados y congresos”.
- [X] T144 [P] Ampliar `tests/contract/bulk-api-response.test.ts` con el tiempo de la vista previa: leer el archivo y calcular los cambios de 5.000 clientes, y de 5.000 congresos, tarda menos de 10 s, con margen frente a SC-007.
- [X] T145 [P] Actualizar `AGENTS.md`:
  - **“Stack y decisiones vigentes”**: agregar el motor compartido `src/server/bulk/` y DolarAPI como única llamada externa de los pagos financiados, con tiempo máximo, validación y respaldo manual.
  - **“Convenciones”**: agregar estas reglas:
    - los montos en bolívares se muestran con `formatBolivares`, y la tasa, con `formatEuroRate`;
    - los datos de clientes son personales y no se escriben en los registros del servidor;
    - las cargas masivas nunca eliminan registros.
- [X] T146 [P] Actualizar `README.md` y `docs/documentacion.md`:
  - **`README.md`**: agregar a la tabla de rutas `/admin/clientes`, `/admin/pagos-financiados` y `/admin/congresos`, con sus cargas masivas.
  - **`docs/documentacion.md`**: agregar secciones sobre:
    - los módulos nuevos y la carga masiva por sección;
    - la tasa euro: fuente, fecha valor, sincronización y fallos;
    - los pagos y la migración 0003.
- [X] T147 Revisar la seguridad de `src/server/clients/`, `src/server/financing/`, `src/server/congresses/`, `src/server/reference/`, `src/server/bulk/`, `src/pages/api/admin/clients/`, `src/pages/api/admin/financings/`, `src/pages/api/admin/congresses/` y `src/pages/api/admin/euro-rate.ts`:
  - cada endpoint llama a `requireOwner` o `requireMutation`;
  - todas las respuestas llevan `Cache-Control: no-store`, y las descargas, además, `X-Content-Type-Options: nosniff` y un nombre de archivo seguro;
  - ningún `console.*`, error ni respuesta incluye nombres, celulares, notas, valores de celdas, tokens o datos de sesión;
  - ningún dato escrito por la usuaria se inserta con `set:html`.
- [X] T148 Revisar la accesibilidad y el uso en móvil de `src/pages/admin/clientes/`, `src/pages/admin/pagos-financiados/`, `src/pages/admin/congresos/` y los componentes nuevos de `src/components/admin/`, según `contracts/admin-ui.md`, y corregir los hallazgos:
  - sin desplazamiento horizontal a 320 px;
  - áreas táctiles de 44 px y foco visible;
  - diálogos que atrapan el foco y lo devuelven al cerrarse;
  - anuncios con `role="status"`;
  - contraste de 4.5:1;
  - estados que no dependen solo del color.
- [X] T149 Ejecutar la validación de `specs/004-clientes-financiamiento-congresos/quickstart.md` y corregir los fallos:
  - `npm.cmd run test`;
  - la integración, con `TEST_DATABASE_URL`;
  - con `E2E=1` y contra una base aislada, `npx playwright test tests/e2e/admin-clients.spec.ts tests/e2e/admin-financing.spec.ts tests/e2e/admin-congresses.spec.ts tests/e2e/admin-nav.spec.ts tests/e2e/admin-bulk-inventory.spec.ts --project=chromium --project=mobile`;
  - `npm.cmd run build`;
  - la validación manual: el libro real de la propietaria, la tasa contra bcv.org.ve, Excel, Google Sheets y LibreOffice, la seguridad y el lector de pantalla.
- [X] T150 Actualizar `specs/004-clientes-financiamiento-congresos/quickstart.md` si durante la implementación cambiaron comandos, rutas, mensajes o límites, manteniendo los escenarios por historia.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 va primero, porque fija la línea base de la regresión. T002 y T003 pueden ir en paralelo.
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias.
  - **Pruebas**: T004–T014 pueden escribirse en paralelo desde el inicio de la fase.
  - **Esquema**: T015 → T016 → T022 y T023.
  - **Utilidades**: T017–T021, en paralelo y sin depender del esquema.
  - **Motor de carga masiva**: primero T024; después T025 → T026 y, en paralelo, T027–T032. T033, la regresión de la 003, cierra el bloque.
  - **Interfaz común**: T034–T037, en paralelo en cualquier momento de la fase.
- **User Story 1 (Phase 3)**: depende de la fase 2.
- **User Story 2 (Phase 4)**: depende de US1, por los límites de validación, la lista y la ficha de clientes.
- **User Story 3 (Phase 5)**: depende de US1, por los clientes, el buscador y la ficha.
- **User Story 4 (Phase 6)**: depende de US3.
- **User Story 5 (Phase 7)**: depende de US3 y US4, por el calendario de cuotas, el repositorio y la pantalla de pagos.
- **User Story 6 (Phase 8)**: depende solo de la fase 2.
- **User Story 7 (Phase 9)**: depende de US6.
- **User Story 8 (Phase 10)**: depende de US1 y US4.
- **Polish (Phase 11)**: depende de las historias que se vayan a publicar. T149 es la puerta final, y T150 va después de T149.

### User Story Dependencies

- **User Story 1 (P1)**: independiente; es el primer incremento del MVP.
- **User Story 2 (P1)**: extiende US1 con la carga masiva. Se verifica por sí sola con la plantilla o con un libro tipo “Medicos”.
- **User Story 3 (P1)**: necesita clientes registrados (US1). Se verifica desde la ficha del cliente y el detalle del financiamiento.
- **User Story 4 (P1)**: necesita financiamientos (US3). US3 y US4 se publican juntas.
- **User Story 5 (P2)**: necesita los clientes, el calendario de cuotas y la pantalla de pagos.
- **User Story 6 (P2)**: es independiente de clientes y financiamientos, y puede adelantarse justo después de la fase 2.
- **User Story 7 (P3)**: extiende US6.
- **User Story 8 (P3)**: usa la ficha del cliente (US1) y la lista de cuotas con la tasa (US4).

### Within Each User Story

- Las pruebas de la historia se escriben primero y deben fallar antes de implementar.
- El orden es: funciones puras (`src/utils/*`, validación, `rows.ts` y `changes.ts`) → acceso a datos (`repository.ts`) → servicio → endpoints → componentes → páginas → entrada en la navegación.
- Las tareas sobre un mismo archivo se ejecutan en orden de historia, nunca en paralelo entre sí. Son estos archivos:
  - componentes: `src/components/admin/nav-items.ts`, `src/components/admin/bulk/renderers.ts` y `src/components/admin/InstallmentTable.astro`;
  - páginas: `src/pages/admin/clientes/index.astro`, `src/pages/admin/clientes/[ref].astro`, `src/pages/admin/pagos-financiados/index.astro`, `src/pages/admin/pagos-financiados/[ref].astro` y `src/pages/admin/congresos/index.astro`;
  - servidor y utilidades: `src/server/financing/summary.ts`, `src/server/financing/repository.ts`, `src/server/validation/financing.ts` y `src/utils/whatsapp.ts`;
  - pruebas: `tests/contract/bulk-api-response.test.ts`, `tests/unit/whatsapp.test.ts` y los tres specs E2E de las secciones.
- Cada checkpoint se valida antes de pasar a la historia siguiente.

## Parallel Opportunities

- **Setup**: T002 y T003.
- **Foundational**: T004–T014; T017–T021; T027–T032, después de T024; T034–T037.
- **Dos líneas de trabajo después de la fase 2**:
  - clientes y pagos: US1 → US2, US1 → US3 → US4 → US5, y US8;
  - congresos: US6 → US7.
- **US1**: T038–T040; T041, T042 y T045; T044 y T047, en cuanto estén sus dependencias; T049.
- **US2**: T050–T055; T056 y T057; T061 y T062.
- **US3**: T064–T067; T068–T070, T073 y T074; T072.
- **US4**: T078–T082; T083–T085 y T090; T089; T093.
- **US5**: T094–T099; T100 y T101; T105 y T106.
- **US6**: T108–T111; T112, T113 y T117–T119; T116; T122.
- **US7**: T123–T127; T128 y T129; T133 y T134.
- **US8**: T136–T138; T140 y T141.
- **Polish**: T142–T146.

## Parallel Example: User Story 1

```text
Pruebas (en paralelo):
  Developer A: T038 - tests/unit/clients-validation.test.ts
  Developer B: T039 - tests/integration/clients.test.ts
  Developer C: T040 - tests/e2e/admin-clients.spec.ts

Implementación base (en paralelo):
  Developer A: T041 - src/server/validation/clients.ts
  Developer B: T042 - src/server/clients/repository.ts
  Developer C: T045 - src/components/admin/ClientForm.astro

Integración (en secuencia):
  T043 servicio → T044 endpoints y T046–T048 páginas → T049 navegación
```

## Parallel Example: Two Tracks After Phase 2

```text
Línea clientes y pagos:  US1 (T038–T049) → US2 (T050–T063) → US3 (T064–T077) → US4 (T078–T093) → US5 (T094–T107) → US8 (T136–T141)
Línea congresos:         US6 (T108–T122) → US7 (T123–T135)
```

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Completar las fases 1 y 2, incluida la regresión de la 003 (T033).
2. Implementar US1: la base de clientes con búsqueda, filtros, ficha y eliminación protegida.
3. Implementar US2: la importación y la corrección en bloque. Sin ella, la base empezaría vacía.
4. Detenerse a validar:
   - importar un libro tipo “Medicos”, corregir los celulares señalados, confirmar y volver a subirlo sin cambios;
   - la navegación no tiene enlaces rotos.
5. Publicar el MVP.

### Incremental Delivery

1. **MVP**: US1 + US2.
2. **Cobros**: US3 + US4, publicadas juntas. La constitución 1.1.1 ya permite registrar estos cobros.
3. **Carga de financiamientos**: US5.
4. **Congresos**: US6 + US7. Pueden adelantarse justo después de la fase 2 si la propietaria lo prioriza.
5. **WhatsApp**: US8.
6. **Cierre**: la fase 11. Antes de cada publicación intermedia se ejecutan las secciones del quickstart de las historias incluidas; T149 es la puerta final.

### Parallel Team Strategy

Con varias personas:

1. Fases 1 y 2, en equipo.
2. Después de la fase 2:
   - Developer A: US1 → US2.
   - Developer B: US6 → US7.
   - Developer C: US3 → US4 → US5, en cuanto US1 esté lista.
3. Al final, US8 y la fase 11.

## Notes

- **Formato**: todas las tareas empiezan con una casilla, un ID secuencial, el marcador `[P]` cuando aplica y, en las fases 3 a 10, la etiqueta de su historia. Su descripción incluye la ruta del archivo.
- **`[P]`**: la tarea no comparte archivo con otra tarea incompleta. Si depende de otra, la dependencia se indica en la descripción.
- **Migración**: la única migración (`0003`) es aditiva y no modifica tablas existentes.
- **Archivos subidos**: ningún paso guarda el archivo subido ni sus valores. Cancelar, abandonar o recibir un conflicto nunca modifica datos, y ninguna carga masiva elimina registros.
- **Validación**: la del servidor es la única fuente de verdad. Las ayudas dentro de Excel solo orientan el llenado.
- **Red**: las pruebas unitarias, de contrato y de integración no llaman a la red real. Las E2E simulan la tasa en el navegador y no dependen de DolarAPI.
- **Regresión de la 003**: sus suites se ejecutan sin modificarlas en T033 y en T149.
