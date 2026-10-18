# Data Model: Clientes, pagos financiados y congresos con carga masiva

## Alcance de datos

- **Migración nueva**: `drizzle/0003_clientes_financiamientos_congresos.sql`, escrita a mano y registrada en `drizzle/meta/_journal.json` con idx 2. Crea seis enums y cinco tablas, y no modifica ninguna tabla existente ([research.md](./research.md), Decision 1).
- **Tablas existentes solo consultadas**: de `product_variants` se lee únicamente `size_label`, para sugerir tallas. Nada de la vitrina ni del inventario cambia.
- **Archivos subidos**: igual que en la 003, nunca se persisten. Entre la vista previa y la confirmación solo viaja un token firmado.
- **Fechas**: todas las de negocio (compra, vencimiento, pago, congresos y tasas) son `date`, de día completo y sin hora. “Hoy” es la fecha de `America/Caracas`.
- **Montos**: los montos en dólares son `numeric(12,2)`, los montos en bolívares `numeric(18,2)` y la tasa redondeada `numeric(14,2)`. La aplicación calcula con centavos enteros.

## Enums

| Enum | Valores | Uso |
|---|---|---|
| `client_sex` | `Mujer`, `Hombre` | `clients.sex` (opcional) |
| `financing_frequency` | `semanal`, `quincenal`, `mensual` | Frecuencia con que se generó el calendario; también propone la fecha de una cuota agregada |
| `installment_status` | `pendiente`, `pagada` | Estado de cada cuota |
| `payment_currency` | `USD`, `VES` | Moneda en que se cobró una cuota |
| `rate_source` | `oficial`, `manual` | Origen de la tasa aplicada a un pago en bolívares |
| `record_origin` | `panel`, `carga_masiva` | Origen de un financiamiento o de un pago |

## Entidades persistentes

### Client (`clients`)

| Columna | Tipo | Regla | Columna del libro | Requisito |
|---|---|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` | — | — |
| `ref` | `integer` | `GENERATED ALWAYS AS IDENTITY`, `UNIQUE` | `Identificador` | FR-031 |
| `name` | `text` | Obligatorio; de 1 a 160 caracteres sin espacios sobrantes | `Nombre` | FR-005 |
| `phone_e164` | `text` | Obligatorio; `CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')`; `UNIQUE DEFERRABLE INITIALLY IMMEDIATE` (`clients_phone_unique`) | `Celular` | FR-005, FR-006 |
| `sex` | `client_sex` | Opcional | `Sexo` | FR-005 |
| `size` | `text` | Opcional; como máximo 40 caracteres; escritura canónica | `Talla` | FR-005, FR-007 |
| `city`, `hospital`, `clinic`, `specialty` | `text` | Opcionales; como máximo 160 caracteres; escritura canónica | `Ciudad`, `Hospital`, `Clínica`, `Especialidad` | FR-005, FR-007 |
| `notes` | `text` | Opcional; como máximo 1.000 caracteres | `Notas` | FR-005 |
| `search_text` | `text` | Obligatorio; `normalizeKey(name)`, mantenido por la aplicación | — | FR-008 |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` cambia con cada edición, individual o masiva | — | FR-005, FR-035 |

- **Índices**: `clients_ref_unique (ref)`, `clients_phone_unique (phone_e164)` como restricción diferible y `clients_search_idx (search_text, ref)` para el orden de la lista.
- **Relaciones**: un cliente tiene de 0 a N financiamientos. `financings.client_id` usa `ON DELETE RESTRICT`.
- **Eliminación**: solo se elimina un cliente sin financiamientos (FR-009). Si un financiamiento se crea en paralelo, la base lo impide con `RESTRICT` (`23503`) y la API responde `409 HAS_FINANCINGS`.
- **Textos opcionales vacíos**: se guardan como `NULL`, nunca como cadena vacía.

### Financing (`financings`)

| Columna | Tipo | Regla | Requisito |
|---|---|---|---|
| `id` | `uuid` PK | — | — |
| `ref` | `integer` | `GENERATED ALWAYS AS IDENTITY`, `UNIQUE`; se muestra como “Financiamiento #12” | — |
| `client_id` | `uuid` | `NOT NULL REFERENCES clients(id) ON DELETE RESTRICT` | FR-010 |
| `description` | `text` | Obligatoria; de 1 a 500 caracteres; texto libre, sin vínculo con el catálogo | FR-010 |
| `purchase_date` | `date` | Obligatoria; no puede ser posterior a hoy en Caracas (lo valida la aplicación) | FR-011 |
| `frequency` | `financing_frequency` | Valor por defecto `quincenal` | FR-011 |
| `origin` | `record_origin` | `panel` o `carga_masiva` | FR-041 |
| `annulled_at` | `timestamptz` | `NULL` si no está anulado | FR-019 |
| `annulment_reason` | `text` | Opcional; como máximo 500 caracteres; solo con `annulled_at` | FR-019 |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` es la versión para el control optimista (`expectedUpdatedAt`) y cambia con cualquier operación sobre sus cuotas | FR-018, FR-019 |

- **Índices**: `financings_ref_unique (ref)` y `financings_client_idx (client_id)`.
- **No tiene columnas de total ni de saldo**: se derivan de las cuotas.

### Installment (`installments`)

| Columna | Tipo | Regla | Requisito |
|---|---|---|---|
| `id` | `uuid` PK | Se usa en la API de pagos | — |
| `financing_id` | `uuid` | `NOT NULL REFERENCES financings(id) ON DELETE CASCADE`. Solo se elimina un financiamiento sin cuotas pagadas | FR-019 |
| `is_initial` | `boolean` | Como máximo una inicial por financiamiento (índice único parcial `WHERE is_initial`) | FR-011 |
| `due_date` | `date` | Obligatoria; ≥ `purchase_date` del financiamiento (lo valida la aplicación) | FR-011, FR-012 |
| `amount_usd` | `numeric(12,2)` | `CHECK (amount_usd > 0)` | FR-011 |
| `status` | `installment_status` | `pendiente` o `pagada` | FR-012 |
| `paid_on` | `date` | Fecha de pago; nunca posterior a hoy en Caracas | FR-013 |
| `payment_currency` | `payment_currency` | `USD` o `VES` | FR-013 |
| `euro_rate` | `numeric(14,2)` | Tasa aplicada, > 0 y con 2 decimales; solo en pagos `VES` | FR-013, FR-015 |
| `euro_rate_date` | `date` | Fecha valor de la tasa oficial aplicada; `NULL` si la tasa se escribió a mano | FR-015 |
| `euro_rate_source` | `rate_source` | `oficial` o `manual` | FR-015 |
| `amount_ves` | `numeric(18,2)` | `round2(amount_usd × euro_rate)`, calculado en el servidor | FR-013, SC-004 |
| `payment_reference` | `text` | Opcional; como máximo 160 caracteres | FR-013 |
| `payment_origin` | `record_origin` | `panel` o `carga_masiva` | FR-041 |
| `paid_recorded_at` | `timestamptz` | Momento en que se registró el pago en el panel | — |
| `created_at`, `updated_at` | `timestamptz` | `created_at` desempata el orden de cuotas con la misma fecha (división por pago parcial) | FR-014 |

**Coherencia (`CHECK`)**:

1. **Pendiente**: si `status = 'pendiente'`, todas las columnas de pago son `NULL`.
2. **Pagada en el panel**: si `status = 'pagada'` y `payment_origin = 'panel'`, `paid_on`, `payment_currency` y `paid_recorded_at` son `NOT NULL`.
3. **Pagada por carga masiva**: si `status = 'pagada'` y `payment_origin = 'carga_masiva'`, `paid_on`, `payment_currency`, la tasa y `amount_ves` son `NULL`. No se inventan datos de pago (FR-041).
4. **Pago en bolívares**: si `payment_currency = 'VES'`, `euro_rate`, `euro_rate_source` y `amount_ves` son `NOT NULL`. Si además `euro_rate_source = 'oficial'`, `euro_rate_date` es `NOT NULL`.
5. **Pago en dólares**: si `payment_currency = 'USD'`, `euro_rate`, `euro_rate_date`, `euro_rate_source` y `amount_ves` son `NULL`.

**Índices**:

- `installments_financing_idx (financing_id)`;
- `installments_initial_unique (financing_id) WHERE is_initial`;
- `installments_pending_due_idx (due_date) WHERE status = 'pendiente'`, para las cuotas vencidas, próximas y por cobrar;
- `installments_paid_on_idx (paid_on) WHERE status = 'pagada'`, para lo cobrado en el mes.

### EuroRate (`euro_rates`)

| Columna | Tipo | Regla |
|---|---|---|
| `rate_date` | `date` PK | Fecha valor del BCV (el campo `fecha` de DolarAPI) |
| `value` | `numeric(14,2)` | `promedio` redondeado a 2 decimales half-up; > 0. Es la tasa que se usa y se muestra |
| `source_value` | `numeric(20,8)` | `promedio` tal como lo publica la fuente; > 0 |
| `source` | `text` | `'dolarapi'` |
| `fetched_at` | `timestamptz` | Momento de la sincronización que insertó la fila |

- **Tasa aplicable a una fecha D**: `SELECT … WHERE rate_date <= D ORDER BY rate_date DESC LIMIT 1`.
- **Inmutabilidad**: las filas existentes no se modifican al sincronizar (`ON CONFLICT DO NOTHING`), porque el BCV no cambia tasas de fechas valor pasadas. Un pago conserva su propia copia de la tasa (`installments.euro_rate`).
- **Tasas escritas a mano**: no se guardan en esta tabla, solo en el pago.

### Congress (`congresses`)

| Columna | Tipo | Regla | Columna del libro | Requisito |
|---|---|---|---|---|
| `id` | `uuid` PK | — | — | — |
| `ref` | `integer` | `GENERATED ALWAYS AS IDENTITY`, `UNIQUE` | `Identificador` | FR-031 |
| `name` | `text` | Obligatorio; de 1 a 160 caracteres | `Nombre` | FR-021 |
| `start_date` | `date` | Obligatoria | `Desde` | FR-021 |
| `end_date` | `date` | Obligatoria; `CHECK (end_date >= start_date)` | `Hasta` | FR-021 |
| `venue` | `text` | Opcional; como máximo 160 caracteres | `Lugar` | FR-021 |
| `specialty` | `text` | Opcional; como máximo 160 caracteres; escritura canónica | `Especialidad` | FR-021, FR-007 |
| `notes` | `text` | Opcional; como máximo 1.000 caracteres | `Notas` | FR-021 |
| `created_at`, `updated_at` | `timestamptz` | — | — | FR-035 |

- **Índices**: `congresses_ref_unique (ref)` y `congresses_dates_idx (start_date, end_date)`. El índice sirve para consultar los congresos que se superponen con un mes: `start_date <= fin_del_mes AND end_date >= inicio_del_mes`.

## Valores derivados

| Valor | Definición | Requisito |
|---|---|---|
| Total del financiamiento | Σ `amount_usd` de todas sus cuotas | FR-010 |
| Pagado | Σ `amount_usd` de las cuotas `pagada` | FR-010 |
| Saldo | Σ `amount_usd` de las cuotas `pendiente` | FR-010 |
| Estado del financiamiento | `Anulado` si tiene `annulled_at`; `Pagado` si no quedan cuotas pendientes; `Con cuotas vencidas` si alguna pendiente tiene `due_date < hoy`; `Al día` en los demás casos | FR-010 |
| Número de cuota | Orden `is_initial DESC, due_date, created_at, id`. La inicial se muestra como “Inicial” y las demás como “n de m”, donde m es el número de cuotas que no son la inicial | FR-012 |
| Estado de una cuota | `pagada`; `vencida` (pendiente con `due_date < hoy`, con `hoy − due_date` días de atraso); `vence hoy`; o `por vencer` | FR-012, US4 |
| Saldo del cliente | Σ de los saldos de sus financiamientos no anulados | Edge Cases |
| Total por cobrar | Σ de las cuotas pendientes de financiamientos no anulados | FR-017 |
| Total vencido | Igual, con `due_date < hoy` | FR-017 |
| Vence en los próximos 15 días | Igual, con `hoy ≤ due_date ≤ hoy + 15` | FR-017 |
| Cobrado en el mes | Σ `amount_usd` de las cuotas `pagada` con `paid_on` en el mes en curso, incluidas las de financiamientos anulados. Las pagadas por carga masiva no cuentan porque no tienen fecha | FR-017, FR-041 |
| Equivalente en bolívares | `round2(amount_usd × tasa aplicable a hoy)`, mostrado con la fecha de la tasa | FR-017, FR-044 |
| Monto en bolívares de un pago | `round2(amount_usd × euro_rate)`, calculado en el servidor | FR-013 |

`round2` es el redondeo half-up a 2 decimales, hecho con centavos enteros.

## Reglas del calendario de cuotas (`src/utils/financing-schedule.ts`)

| Regla | Definición |
|---|---|
| Inicial | Si la inicial es mayor que 0, es una cuota con `is_initial` que vence en la fecha de compra |
| Reparto | El resto (total − inicial) se reparte en `count` cuotas de `floor(resto / count)` centavos; la última suma la diferencia |
| Número de cuotas | De 1 a 48, sin contar la inicial |
| Primera fecha por defecto | Quincenal: el siguiente día 15 o último día del mes, estrictamente después de la compra. Mensual: el mismo día del mes siguiente o el último día. Semanal: la compra más 7 días |
| Fechas siguientes | Quincenal: el siguiente 15 o último día del mes posterior a la cuota anterior. Mensual: el día ancla de la primera cuota en cada mes, o el último día del mes si no existe. Semanal: más 7 días |
| Validez | Ninguna cuota vence antes de la compra, todas las cuotas son > 0 y la compra no es futura |
| Edición | La propietaria puede cambiar fechas y montos del calendario propuesto; el total es siempre la suma de las cuotas |

Ejemplo: compra el 18/10/2026 por $100,00 sin inicial, en 4 cuotas quincenales. La primera fecha por defecto es el 31/10/2026, y las cuotas son $25,00 el 31/10, el 15/11, el 30/11 y el 15/12/2026.

## Transiciones de estado

### Cuota

```text
pendiente ──marcar pagada (USD o VES)──────────────> pagada (origen panel)
pendiente ──pago parcial de X < monto──────────────> pagada por X + nueva cuota pendiente por (monto − X), misma fecha
pagada (panel o carga masiva) ──deshacer pago──────> pendiente, sin datos de pago
pendiente ──editar fecha o monto, o quitar─────────> pendiente modificada o eliminada (si el financiamiento no está anulado y conserva al menos una cuota)
pagada ──editar o quitar──────────────────────────> rechazado: primero hay que deshacer el pago
```

### Financiamiento

```text
(creado) ──────────────────────> Al día │ Con cuotas vencidas │ Pagado   (estado derivado)
Al día / Con cuotas vencidas / Pagado ──anular (motivo opcional)──> Anulado
Anulado ──restaurar────────────> estado derivado de sus cuotas
Anulado ──marcar pagada una cuota pendiente──────> rechazado (409)
cualquiera sin cuotas pagadas ──eliminar─────────> eliminado junto con sus cuotas
cualquiera con alguna cuota pagada ──eliminar────> rechazado (409); se ofrece anular
```

### Carga masiva (las tres secciones)

Usan la misma máquina de estados que la 003: sin archivo, validando, rechazado, con errores, sin cambios, lista para confirmar, aplicando, aplicada, no aplicada, caducada y sesión caducada. Ningún estado distinto de `aplicada` modifica datos ([contracts/admin-ui.md](./contracts/admin-ui.md)).

## Estructuras transitorias de la carga masiva

Viven solo durante una petición. Los nombres orientan la implementación en `src/server/bulk/` y en los subdirectorios `bulk/` de cada sección.

### BulkWorkbook (común)

| Campo | Regla |
|---|---|
| `fileName`, `byteSize`, `sha256` | Igual que en la 003 |
| `section` | `clientes`, `financiamientos` o `congresos`, según la ruta |
| `declaredSection` | El valor de “Sección” en Instrucciones, o `null`. Si no coincide con `section`, error `WRONG_SECTION` |
| `kind` | `plantilla`, `datos` o `desconocido`, leído de “Tipo de archivo” |
| `generatedAt` | “Generado (UTC)”, o `null` |
| `sheetName` | Nombre de la hoja procesada: la de la sección o la primera |
| `columns` | Columnas reconocidas `{ key, header, index }` |
| `ignoredColumns` | Encabezados no reconocidos, que generan el aviso `IGNORED_COLUMNS` |

### ParsedClientRow

| Campo | Regla |
|---|---|
| `excelRow` | Número de fila de Excel |
| `ref` | `Identificador`, entero positivo, o `null` |
| `present` | Conjunto de columnas presentes en el archivo, porque las ausentes no cambian |
| `values` | `name`, `phoneE164`, `sex`, `size`, `city`, `hospital`, `clinic`, `specialty`, `notes`. Cada uno guarda su valor normalizado y si la celda estaba vacía |
| `issues` | Errores de celda de la fila |

### ClientChange

| Campo | Regla |
|---|---|
| `action` | `create` o `update`. Las filas sin diferencias solo se cuentan |
| `matchedBy` | `identificador` o `celular`; `null` en las altas |
| `ref`, `label` | La etiqueta tiene la forma `Nombre · 0414-246-7789` |
| `fields` | `{ field, label, from, to }`. `to: null` indica que el dato se borrará, cosa que solo ocurre en filas `identificador` |
| `warnings` | Códigos de advertencia de la fila |

### ParsedFinancingRow y FinancingDraft

| Campo | Regla |
|---|---|
| `excelRow` | Número de fila de Excel |
| `clientPhoneE164`, `clientNameWritten` | El celular identifica al cliente. El nombre escrito en `Cliente` solo se compara para advertir `CLIENT_NAME_MISMATCH` |
| `description`, `purchaseDate`, `totalCents`, `initialCents`, `count`, `frequency`, `firstDueDate`, `paidCount` | Valores ya validados. `frequency` vacía equivale a `quincenal`, `firstDueDate` vacía a la fecha por defecto y `paidCount` vacío a 0 |
| `schedule` | Resultado de `generateSchedule`. Las primeras `paidCount` cuotas, contando la inicial, quedan como pagadas por carga masiva |
| `summary` | `{ initial: { amount, dueDate, paid } \| null, installments: { count, regularAmount, lastAmount, firstDue, lastDue, paidCount } }`, el resumen compacto de la Decision 14 |

### CongressChange

Igual que `ClientChange`, sin `matchedBy`. La etiqueta tiene la forma `Nombre · 30/10/2026 – 01/11/2026`.

### Snapshots

| Sección | Contenido |
|---|---|
| Clientes | Todos los clientes (`id`, `ref`, valores, `updatedAt`), el mapa `phoneE164 → ref`, el mapa `normalizeKey(name) → refs`, los valores de referencia con su escritura canónica y el marcador `{ count, maxRef }` |
| Financiamientos | Los clientes `{ id, ref, name, phoneE164 }`, los financiamientos existentes `{ clientId, purchaseDate, totalCents }` para detectar duplicados y el marcador `{ count, maxRef }` |
| Congresos | Todos los congresos (`id`, `ref`, valores, `updatedAt`), las especialidades de referencia y el marcador `{ count, maxRef }` |

### Línea base (`baseline`)

Es el SHA-256 del JSON canónico de:

| Sección | Contenido |
|---|---|
| Clientes | `["clientes-v1", count, maxRef, [[ref, name, phone, sex, size, city, hospital, clinic, specialty, notes, updatedAt], …]]` de los clientes referenciados por identificador o por celular, ordenados por `ref` |
| Financiamientos | `["financiamientos-v1", count, maxRef, [[ref, phoneE164], …]]` de los clientes referenciados. Una segunda confirmación encuentra otro marcador y se rechaza, lo que impide duplicar financiamientos con un doble envío |
| Congresos | `["congresos-v1", count, maxRef, [[ref, name, start, end, venue, specialty, notes, updatedAt], …]]` de los congresos referenciados |

### BulkPreviewToken

Tiene la misma estructura que el token de la 003, con el campo adicional `section`:

```text
{ v: 1, section, fileSha256, baseline, issuedAt, expiresAt }
```

- **Firma**: HMAC-SHA256 con la clave `sha256(sessionToken + "|bulk-preview:" + section)`. Un token de una sección no vale en otra ni en otra sesión.
- **Vencimiento**: 60 minutos.

## Límites transaccionales

### Aplicación de una carga masiva

1. `SET LOCAL lock_timeout = '10s'`.
2. `pg_advisory_xact_lock(<clave de la sección>)`:

   | Sección | Clave |
   |---|---|
   | Inventario (existente) | 7_301_003 |
   | Clientes | 7_301_004 |
   | Financiamientos | 7_301_005 |
   | Congresos | 7_301_006 |

3. Bloquear las filas referenciadas:
   - Clientes: `FOR UPDATE` sobre los clientes referenciados. Además, `SET CONSTRAINTS clients_phone_unique DEFERRED`.
   - Financiamientos: `FOR KEY SHARE` sobre los clientes referenciados, para impedir que se eliminen mientras tanto.
   - Congresos: `FOR UPDATE` sobre los congresos referenciados.
4. Cargar la instantánea, recalcular la línea base y compararla con la del token. Si difiere, `ROLLBACK` y `409`.
5. Recalcular el conjunto de cambios. Si aparece algún error, `ROLLBACK` y `409`.
6. Escribir por lotes de 1.000 filas, sin ejecutar nunca `DELETE`:
   - Clientes: inserciones nuevas y actualizaciones con `UPDATE … FROM (VALUES …)`, incluidos `search_text` y `updated_at`.
   - Financiamientos: inserción de financiamientos con `origin = 'carga_masiva'` y `RETURNING id, ref`, y después de sus cuotas. Las primeras `paidCount` se insertan como `pagada` con `payment_origin = 'carga_masiva'`.
   - Congresos: inserciones y actualizaciones.
7. `COMMIT`. Con la restricción diferida, la unicidad del celular se comprueba aquí; una violación revierte todo y la API responde `409`.

Cualquier excepción revierte la transacción completa (FR-037, SC-009). `55P03` (tiempo de espera del bloqueo) se traduce en “Otra carga se está aplicando…”, y `23505` o `23503`, en “Los datos cambiaron desde la vista previa…”.

### Operaciones sobre pagos

Cada operación ocurre en su propia transacción:

1. `SELECT … FOR UPDATE` sobre los financiamientos involucrados.
2. Comprobar las precondiciones:
   - cuotas pendientes y financiamiento no anulado, para pagar;
   - cuota pagada, para deshacer;
   - `expectedUpdatedAt` igual, para editar, anular, restaurar o eliminar.
3. Escribir y actualizar `financings.updated_at`.
4. `COMMIT`.

Si una precondición falla, la respuesta es `409` sin cambios.
