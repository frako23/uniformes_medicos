# Contract: API administrativa de clientes, pagos financiados, congresos y tasa euro

## Reglas comunes

- **Ubicación y acceso**: todas las rutas viven bajo `/api/admin/`, que el middleware protege. Las lecturas (`GET`) llaman a `requireOwner` y los envíos (`POST`, `PATCH`, `DELETE`) a `requireMutation`, que valida la sesión, `Origin` y la cabecera `x-csrf-token`.
- **Identificadores en las rutas**: `:ref` es el entero visible (`clients.ref`, `financings.ref` o `congresses.ref`). Si no es un entero positivo, la respuesta es `404 NOT_FOUND`.
- **Caché**: todas las respuestas llevan `Cache-Control: no-store`. Las descargas añaden `X-Content-Type-Options: nosniff`.
- **Errores**: usan la forma existente `{ "error": { "code", "message", "fields"? } }`, sin trazas, SQL ni datos de otros registros. La excepción es `PHONE_IN_USE`, que nombra al cliente dueño del número porque la especificación lo exige (US1-5).
- **Registros del servidor**: incluyen códigos, conteos y duraciones, nunca nombres, celulares, notas ni valores de celdas.
- **Montos en el JSON**: los dólares, bolívares y tasas viajan como cadenas con punto decimal y 2 decimales (`"25.00"`, `"24779.00"`, `"991.16"`). Las fechas viajan como `AAAA-MM-DD` y los instantes como ISO 8601.

**Códigos `error.code`**: los existentes (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `DATABASE_ERROR` e `INTERNAL_ERROR`). Los conflictos de negocio usan `409 CONFLICT` y precisan el motivo en `fields`, con una de estas claves:

| Clave en `fields` | Cuándo |
|---|---|
| `phone` | Celular en uso |
| `client` | Cliente con financiamientos |
| `installments` | Cuotas que ya no están pendientes |
| `expectedUpdatedAt` | Cambios concurrentes |
| `rate` | Falta la tasa |

## Clientes

### `GET /api/admin/clients`

**Parámetros**:

| Parámetro | Valor |
|---|---|
| `search` | Nombre o celular |
| `specialty`, `city`, `hospital`, `clinic`, `size` | Valor exacto, comparado con su escritura canónica |
| `sex` | `Mujer` u `Hombre` |
| `balance` | `pending` o `overdue` |
| `page` | Número de página |
| `pageSize` | 20, 50 o 100 |

**200**:

```ts
type ClientListResponse = {
  data: Array<{
    ref: number;
    name: string;
    phone: string;          // formato de presentación: "0414-246-7789" o "+13055551234"
    phoneE164: string;
    sex: "Mujer" | "Hombre" | null;
    size: string | null;
    city: string | null;
    hospital: string | null;
    clinic: string | null;
    specialty: string | null;
    balanceUsd: string;     // "0.00" si no tiene saldo
    hasOverdue: boolean;
  }>;
  page: number;
  pageSize: number;
  total: number;            // resultados con los filtros
  totalClients: number;     // clientes en la base
  totalPages: number;
};
```

La página `/admin/clientes` usa el mismo servicio en el servidor. Este endpoint sirve al buscador de clientes del formulario de financiamiento.

### `POST /api/admin/clients` y `PATCH /api/admin/clients/:ref`

**Cuerpo**:

```ts
type ClientInput = {
  name: string;
  phone: string;               // cualquier escritura aceptada por normalizePhone
  sex?: "Mujer" | "Hombre" | null;
  size?: string | null;
  city?: string | null;
  hospital?: string | null;
  clinic?: string | null;
  specialty?: string | null;
  notes?: string | null;
  expectedUpdatedAt?: string;  // obligatorio en PATCH
};
```

**Respuestas**:

| Estado | Cuándo |
|---|---|
| `201` (POST) / `200` (PATCH) | `{ data: ClientDetail }` |
| `409 CONFLICT` | `fields.phone`: “Este celular ya pertenece a {nombre} (#{ref}).” |
| `409 CONFLICT` | `fields.expectedUpdatedAt`: “El cliente cambió mientras lo editabas. Recarga la página.” |
| `422 VALIDATION_ERROR` | Con `fields.name`, `fields.phone`, etc. |
| `404 NOT_FOUND` | Cliente inexistente |

### `GET /api/admin/clients/:ref`

**200**: `{ data: ClientDetail }`.

```ts
type ClientDetail = ClientListResponse["data"][number] & {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  whatsappUrl: string;   // https://wa.me/<dígitos>
  financings: Array<{
    ref: number;
    description: string;
    purchaseDate: string;
    totalUsd: string;
    paidUsd: string;
    balanceUsd: string;
    status: "al_dia" | "con_vencidas" | "pagado" | "anulado";
  }>;
};
```

### `DELETE /api/admin/clients/:ref`

| Estado | Cuándo |
|---|---|
| `204` | Cliente eliminado |
| `409 CONFLICT` | `fields.client`: “El cliente tiene financiamientos y no puede eliminarse.” También si un financiamiento se creó mientras tanto (`23503`) |
| `404 NOT_FOUND` | Cliente inexistente |

## Pagos financiados

### `GET /api/admin/financings/installments`

**Parámetros**:

| Parámetro | Valor |
|---|---|
| `status` | `overdue`, `upcoming` (próximos 15 días), `pending` (todas las pendientes) o `paid` |
| `client` | `ref` del cliente |
| `from`, `to` | Rango de `due_date`; con `status=paid`, rango de `paid_on` |
| `page` | Número de página |
| `pageSize` | 20, 50 o 100 |

**200**:

```ts
type InstallmentListResponse = {
  summary: {
    receivableUsd: string;   // total por cobrar
    overdueUsd: string;
    next15DaysUsd: string;
    collectedThisMonthUsd: string;
    today: string;           // AAAA-MM-DD en Caracas
  };
  rate: EuroRate | null;     // tasa oficial aplicable hoy; null si no hay ninguna
  data: Array<{
    id: string;              // uuid de la cuota
    financingRef: number;
    client: { ref: number; name: string; phone: string; whatsappUrl: string };
    description: string;
    label: string;           // "Inicial" o "2 de 4"
    dueDate: string;
    amountUsd: string;
    amountVesEquivalent: string | null;  // con rate; null si rate es null
    state: "vencida" | "vence_hoy" | "por_vencer" | "pagada";
    daysOverdue: number;     // 0 si no está vencida
    payment: PaymentInfo | null;
    financingAnnulled: boolean;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type EuroRate = { value: string; rateDate: string; source: "oficial" };

type PaymentInfo = {
  paidOn: string | null;              // null si se registró por carga masiva
  currency: "USD" | "VES" | null;
  rate: { value: string; rateDate: string | null; source: "oficial" | "manual" } | null;
  amountVes: string | null;
  reference: string | null;
  origin: "panel" | "carga_masiva";
};
```

**Orden**:

- Pendientes: por `dueDate` ascendente.
- `status=paid`: por `paidOn` descendente, con las de carga masiva al final.

### `POST /api/admin/financings`

**Cuerpo**:

```ts
type FinancingCreateInput = {
  clientRef: number;
  description: string;
  purchaseDate: string;              // AAAA-MM-DD, no futura
  frequency: "semanal" | "quincenal" | "mensual";
  installments: Array<{              // calendario propuesto y quizá editado
    isInitial: boolean;
    dueDate: string;
    amountUsd: string;
  }>;
};
```

**Validación en el servidor**:

- `clientRef` debe existir.
- Hay entre 1 y 49 cuotas: 48 más la inicial.
- Como máximo una es inicial, y debe vencer en `purchaseDate`.
- Cada monto es > 0, tiene como máximo 2 decimales y no supera 9.999.999.999,99.
- Ninguna cuota vence antes de `purchaseDate`.

El total no se envía: es la suma de las cuotas.

**Respuestas**:

| Estado | Cuándo |
|---|---|
| `201` | `{ data: FinancingDetail }` |
| `422 VALIDATION_ERROR` | `fields` por campo o `fields["installments.3.dueDate"]` |
| `404 NOT_FOUND` | Cliente inexistente |

### `GET /api/admin/financings/:ref`

**200**: `{ data: FinancingDetail }`.

```ts
type FinancingDetail = {
  ref: number;
  client: { ref: number; name: string; phone: string; whatsappUrl: string };
  description: string;
  purchaseDate: string;
  frequency: "semanal" | "quincenal" | "mensual";
  origin: "panel" | "carga_masiva";
  totalUsd: string;
  paidUsd: string;
  balanceUsd: string;
  status: "al_dia" | "con_vencidas" | "pagado" | "anulado";
  annulledAt: string | null;
  annulmentReason: string | null;
  updatedAt: string;                 // se reenvía como expectedUpdatedAt
  installments: Array<{
    id: string;
    label: string;
    isInitial: boolean;
    dueDate: string;
    amountUsd: string;
    state: "vencida" | "vence_hoy" | "por_vencer" | "pagada";
    daysOverdue: number;
    payment: PaymentInfo | null;
  }>;
};
```

### `PATCH /api/admin/financings/:ref`

Edita la descripción y las cuotas pendientes (FR-018).

**Cuerpo**:

```ts
type FinancingUpdateInput = {
  description: string;
  pendingInstallments: Array<{ id?: string; dueDate: string; amountUsd: string }>;
  expectedUpdatedAt: string;
};
```

**Reglas**:

- `pendingInstallments` es la lista completa de cuotas pendientes después de la edición:
  - una cuota con `id` se modifica;
  - una sin `id` se agrega;
  - una pendiente cuyo `id` no aparece se quita.
- Las cuotas pagadas no se envían ni cambian.
- Debe quedar al menos una cuota, pagada o pendiente.
- No se edita un financiamiento anulado.

**Respuestas**:

| Estado | Cuándo |
|---|---|
| `200` | `{ data: FinancingDetail }` |
| `409 CONFLICT` | `expectedUpdatedAt` distinto, una cuota de la lista ya está pagada o el financiamiento está anulado |
| `422 VALIDATION_ERROR` | Algún valor no es válido |

### `POST /api/admin/financings/:ref/annul` y `POST /api/admin/financings/:ref/restore`

**Cuerpo**:

- Anular: `{ reason?: string (≤ 500), expectedUpdatedAt: string }`.
- Restaurar: `{ expectedUpdatedAt: string }`.

**Respuestas**: `200 { data: FinancingDetail }`; `409` si `expectedUpdatedAt` no coincide o el financiamiento ya estaba en ese estado.

### `DELETE /api/admin/financings/:ref`

**Cuerpo o parámetro**: `expectedUpdatedAt`.

| Estado | Cuándo |
|---|---|
| `204` | Financiamiento eliminado junto con sus cuotas |
| `409 CONFLICT` | `fields.installments`: “Este financiamiento tiene pagos registrados y no puede eliminarse. Puedes anularlo.” |

### `POST /api/admin/financings/payments`

Registra el pago de una o varias cuotas (FR-013 y FR-014).

**Cuerpo**:

```ts
type PaymentInput = {
  installmentIds: string[];          // 1 a 100
  paidOn: string;                    // AAAA-MM-DD, no futura en Caracas
  currency: "USD" | "VES";
  rate?: {                           // obligatorio con VES
    source: "oficial" | "manual";
    value?: string;                  // obligatorio con "manual"; > 0, máx. 2 decimales
  };
  reference?: string | null;         // ≤ 160
  partialAmountUsd?: string;         // solo con una cuota; > 0 y < su monto
};
```

**Reglas**:

- **Tasa oficial** (`rate.source = "oficial"`): el servidor resuelve la tasa aplicable a `paidOn` y no usa ningún valor enviado.
- **Montos en bolívares**: el servidor calcula `amountVes` en cada cuota.
- **Todo o nada**: si una cuota ya no está pendiente o su financiamiento está anulado, no se registra ningún pago.

**Respuestas**:

| Estado | Cuándo |
|---|---|
| `200` | `{ data: { paid: Array<{ id, label, amountUsd, amountVes }>, created: Array<{ id, label, dueDate, amountUsd }> } }`. `created` contiene la cuota pendiente que resulta de un pago parcial |
| `409 CONFLICT` | `fields.installments`: “Algunas cuotas ya estaban pagadas o su financiamiento está anulado. Recarga la página.” |
| `409 CONFLICT` | `fields.rate`: “No hay una tasa euro oficial para esa fecha; escríbela a mano.” |
| `422 VALIDATION_ERROR` | Fecha futura, tasa inválida, pago parcial con varias cuotas o monto parcial fuera de rango |

### `POST /api/admin/financings/installments/:id/undo-payment`

| Estado | Cuándo |
|---|---|
| `200` | `{ data: FinancingDetail }`; la cuota vuelve a estar pendiente |
| `409 CONFLICT` | La cuota no está pagada |
| `404 NOT_FOUND` | Cuota inexistente |

## Tasa euro

### `GET /api/admin/euro-rate?date=AAAA-MM-DD`

Si se omite `date`, se toma hoy en Caracas. Una fecha futura responde `422`.

Antes de responder, aplica la sincronización bajo demanda de [euro-rate-source.md](./euro-rate-source.md), con un tiempo máximo de 3 s.

**200**:

```ts
type EuroRateResponse = {
  status: "ok" | "unavailable";    // unavailable: no hay ninguna tasa guardada para esa fecha
  rate: EuroRate | null;           // tasa aplicable a la fecha pedida
  stale: boolean;                  // true si la fuente no respondió y se usa la última guardada
};
```

## Congresos

### `GET /api/admin/congresses?from=AAAA-MM-DD&to=AAAA-MM-DD`

**200**: `{ data: Array<CongressDetail> }` con los congresos que se superponen con el rango, ordenados por `startDate` y `name`.

```ts
type CongressDetail = {
  ref: number;
  name: string;
  startDate: string;
  endDate: string;
  days: number;            // incluye ambos extremos
  venue: string | null;
  specialty: string | null;
  notes: string | null;
  updatedAt: string;
};
```

### `POST /api/admin/congresses`, `PATCH /api/admin/congresses/:ref` y `DELETE /api/admin/congresses/:ref`

**Cuerpo**: `{ name, startDate, endDate, venue?, specialty?, notes?, expectedUpdatedAt? }`. `expectedUpdatedAt` es obligatorio en `PATCH` y en `DELETE`.

**Respuestas**:

| Estado | Cuándo |
|---|---|
| `201` / `200` | `{ data: CongressDetail }` |
| `204` | `DELETE` correcto |
| `422 VALIDATION_ERROR` | `fields.endDate`: “La fecha de fin no puede ser anterior a la de inicio.” |
| `409 CONFLICT` | Cambio concurrente |
| `404 NOT_FOUND` | Congreso inexistente |

## Carga masiva (tres secciones)

| Sección | Plantilla | Datos actuales | Vista previa | Aplicación |
|---|---|---|---|---|
| Clientes | `GET /api/admin/clients/bulk/template` | `GET /api/admin/clients/bulk/export` | `POST /api/admin/clients/bulk/preview` | `POST /api/admin/clients/bulk/apply` |
| Pagos financiados | `GET /api/admin/financings/bulk/template` | — | `POST /api/admin/financings/bulk/preview` | `POST /api/admin/financings/bulk/apply` |
| Congresos | `GET /api/admin/congresses/bulk/template` | `GET /api/admin/congresses/bulk/export` | `POST /api/admin/congresses/bulk/preview` | `POST /api/admin/congresses/bulk/apply` |

Las descargas, las peticiones, los estados HTTP, los rechazos `422` por formato (`FILE_REQUIRED`, `FILE_TOO_LARGE`, `FILE_NOT_XLSX`, `FILE_PROTECTED_OR_XLS`, `FILE_HAS_MACROS` y `FILE_UNREADABLE`) y los mensajes de `409` son los de la 003 ([../../003-carga-masiva-inventario/contracts/admin-inventory-api.md](../../003-carga-masiva-inventario/contracts/admin-inventory-api.md)), con dos diferencias:

- **Textos**: se reemplaza “inventario” por la sección. Por ejemplo, “Los clientes cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.”, y en `FILE_TOO_LARGE`, “Divide el archivo en varios”.
- **Token**: está ligado a la sección y a la sesión. Un token de otra sección responde `409` (“La vista previa no es válida…”).

### `BulkPreviewResponse`

```ts
type BulkPreviewResponse = {
  status: "ready" | "invalid" | "no_changes";
  section: "clientes" | "financiamientos" | "congresos";
  file: {
    name: string;
    kind: "plantilla" | "datos" | "desconocido";
    sheet: string;                 // hoja procesada, por ejemplo "Clientes" o "Medicos"
    generatedAt: string | null;
    rows: number;                  // filas de datos no vacías
  };
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    errors: number;                // ocurrencias
    warnings: number;              // ocurrencias
    // Solo en financiamientos:
    installments?: number;         // cuotas que se crearán
    financedUsd?: string;          // suma de los montos totales
    outstandingUsd?: string;       // saldo pendiente resultante
  };
  issues: Array<{
    severity: "error" | "warning" | "notice";
    code: BulkIssueCode;
    column: string | null;
    message: string;
    rows: string[];                // ["4", "9-12"]
    count: number;
  }>;
  changes: Array<{                 // solo filas nuevas o con diferencias, en orden de fila
    row: number;
    action: "create" | "update";
    ref: number | null;
    matchedBy: "identificador" | "celular" | null;   // solo en clientes
    label: string;
    fields: Array<{ field: string; label: string; from: string | null; to: string | null }>;
    schedule?: FinancingScheduleSummary;             // solo en financiamientos
    warnings: BulkIssueCode[];
  }>;
  omittedChanges: number;          // cambios que existen pero no se detallan en `changes` (máximo 3.000 detallados)
  preview: { token: string; expiresAt: string } | null;
};

type FinancingScheduleSummary = {
  purchaseDate: string;
  frequency: "semanal" | "quincenal" | "mensual";
  totalUsd: string;
  initial: { amountUsd: string; dueDate: string; paid: boolean } | null;
  installments: {
    count: number;
    regularAmountUsd: string;
    lastAmountUsd: string;
    firstDue: string;
    lastDue: string;
    paidCount: number;             // sin contar la inicial
  };
};
```

**Notas**:

- `fields[].to = null` en una edición de clientes o congresos significa que el dato se borrará. La interfaz lo muestra como “se borrará”.
- Con `FinancingScheduleSummary`, el navegador reconstruye la lista de fechas con `src/utils/financing-schedule.ts` para la opción “Ver fechas” (research, Decisions 8 y 14).

### `BulkApplyResponse`

```ts
type BulkApplyResponse = {
  status: "applied";
  section: "clientes" | "financiamientos" | "congresos";
  appliedAt: string;
  summary: { created: number; updated: number; installments?: number };
  created: Array<{ ref: number; label: string; url: string }>;  // por ejemplo /admin/clientes/128
  updated: Array<{ ref: number; label: string; url: string }>;
};
```

Dos confirmaciones con el mismo token producen como máximo una respuesta `200`. La otra recibe `409` y no modifica datos.

### Códigos de incidencia (`BulkIssueCode`)

**Del archivo y de cualquier sección**:

| Código | Gravedad | Mensaje (plantilla) |
|---|---|---|
| `WRONG_SECTION` | error | Este archivo es de la sección {sección declarada}. Súbelo en esa sección o usa la plantilla de {sección actual}. |
| `MISSING_COLUMNS` | error | Faltan columnas obligatorias: {lista}. |
| `DUPLICATE_COLUMN` | error | La columna “{columna}” aparece más de una vez. |
| `NO_ROWS` | error | El archivo no contiene filas para procesar. |
| `TOO_MANY_ROWS` | error | El archivo tiene {n} filas; el máximo es {límite}. Divídelo en varios archivos. |
| `IGNORED_COLUMNS` | notice | Se ignoraron columnas no reconocidas: {lista}. |
| `MISSING_METADATA` | notice | No se encontró la fecha de generación; no se comprobará si hubo cambios después de la descarga. |
| `REQUIRED` | error | {columna} es obligatorio. La celda está vacía o tiene un error de fórmula. |
| `TOO_LONG` | error | {columna} admite como máximo {n} caracteres. |
| `INVALID_TYPE` | error | La celda contiene un tipo de dato no válido para {columna}. |
| `INVALID_DATE` | error | Escribe una fecha válida como dd/mm/aaaa. |
| `INVALID_ID` | error | El Identificador debe ser el número que trae el archivo descargado. |
| `UNKNOWN_ID` | error | No existe un registro con este Identificador. No lo modifiques; déjalo vacío para crear uno nuevo. |
| `DUPLICATE_ID` | error | Este Identificador aparece en más de una fila. |
| `MODIFIED_AFTER_DOWNLOAD` | warning | Este registro cambió después de descargar el archivo; se sobrescribirán sus valores actuales. |
| `NEW_VALUE` | warning | Se creará un valor nuevo de {columna}: “{valor}”. Revisa que no sea un error de escritura. |

**Clientes**:

| Código | Gravedad | Mensaje (plantilla) |
|---|---|---|
| `INVALID_PHONE` | error | El celular debe tener 10 dígitos sin el 0 inicial (por ejemplo, 0414-123-4567) o empezar por + y el código de país. |
| `PHONE_REPEATED` | error | Este celular aparece en más de una fila. |
| `PHONE_IN_USE` | error | Este celular ya pertenece al cliente #{ref}. |
| `DUPLICATE_TARGET` | error | Esta fila y la fila {n} modifican al mismo cliente. |
| `INVALID_SEX` | error | Usa Mujer u Hombre. |
| `SAME_NAME` | warning | Hay otro cliente con el mismo nombre ({referencia}). Revisa que no sea un duplicado. |

**Financiamientos**:

| Código | Gravedad | Mensaje (plantilla) |
|---|---|---|
| `CLIENT_NOT_FOUND` | error | No hay ningún cliente con este celular. Regístralo en Clientes o inclúyelo en su carga masiva primero. |
| `INVALID_AMOUNT` | error | Escribe un monto en dólares mayor que 0, sin símbolos ni texto. |
| `AMOUNT_DECIMALS` | error | El monto admite como máximo dos decimales. |
| `AMOUNT_TOO_HIGH` | error | El monto supera el máximo permitido. |
| `INITIAL_TOO_HIGH` | error | La inicial debe ser menor que el monto total. |
| `INVALID_INSTALLMENT_COUNT` | error | El número de cuotas debe ser un entero entre 1 y 48. |
| `INVALID_FREQUENCY` | error | Usa Semanal, Quincenal o Mensual. |
| `FUTURE_PURCHASE_DATE` | error | La fecha de compra no puede ser posterior a hoy. |
| `FIRST_DUE_BEFORE_PURCHASE` | error | La primera cuota no puede vencer antes de la fecha de compra. |
| `INVALID_PAID_COUNT` | error | Cuotas pagadas debe ser un número entero mayor o igual a 0. |
| `PAID_COUNT_TOO_HIGH` | error | Cuotas pagadas no puede superar el número de cuotas (más la inicial, si la hay). |
| `CLIENT_NAME_MISMATCH` | warning | El celular pertenece a “{nombre}”, no a “{escrito}”. Revisa que el celular sea correcto. |
| `POSSIBLE_DUPLICATE` | warning | Parece repetido: mismo cliente, fecha de compra y monto total que {financiamiento #n / la fila n}. |

**Congresos**:

| Código | Gravedad | Mensaje (plantilla) |
|---|---|---|
| `END_BEFORE_START` | error | La fecha Hasta no puede ser anterior a Desde. |
| `POSSIBLE_DUPLICATE` | warning | Parece repetido: mismo nombre y fecha de inicio que {congreso #n / la fila n}. |
| `LONG_EVENT` | warning | El congreso dura {n} días. Revisa las fechas. |
| `ALREADY_ENDED` | warning | Este congreso ya terminó. |
