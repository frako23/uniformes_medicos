# Implementation Plan: Clientes, pagos financiados y congresos con carga masiva

**Branch**: `004-clientes-financiamiento-congresos` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-clientes-financiamiento-congresos/spec.md`

## Summary

El panel privado suma tres secciones, cada una con su carga masiva por Excel, que sigue la misma dinámica de la 003:

1. **Clientes** (`/admin/clientes`): base de datos con búsqueda y filtros que reemplaza la pestaña “Medicos”. Cada cliente se identifica por su celular normalizado, que es único.
2. **Pagos financiados** (`/admin/pagos-financiados`): financiamientos en dólares con un calendario de cuotas que se genera y se puede editar, pagos en dólares o en bolívares a tasa euro del BCV, pagos parciales, un resumen de lo que hay por cobrar y recordatorios por WhatsApp.
3. **Congresos** (`/admin/congresos`): calendario mensual al estilo de Google Calendar con los días pintados, y una vista de lista como alternativa.

Técnicamente:

- **Ubicación**: todo vive en la misma aplicación Astro.
- **Datos**: una migración versionada, `0003`, agrega cinco tablas (`clients`, `financings`, `installments`, `euro_rates` y `congresses`) sin tocar las existentes.
- **Carga masiva**: el motor de la 003 (guardas del archivo, lectura de hojas, token ligado a la sesión, agrupación de incidencias y transacción con bloqueo consultivo) se extrae a `src/server/bulk/` sin cambiar el comportamiento del inventario. Cada sección aporta solo sus columnas y reglas.
- **Lógica compartida**: el calendario de cuotas, el diseño del calendario mensual, la normalización del celular y los formatos de dinero y fecha son funciones puras e isomorfas, que el navegador y el servidor usan por igual.
- **Tasa euro**: se sincroniza bajo demanda con el histórico de DolarAPI y se guarda en PostgreSQL. La fecha del histórico es la fecha valor del BCV, lo que quedó verificado el 2026-10-18. Si la fuente falla, se usa la última tasa guardada o una escrita a mano.
- **Sin dependencias ni secretos nuevos**: no hay paquetes npm, variables de entorno ni secretos nuevos.

## Technical Context

**Language/Version**: TypeScript 5.3 sobre Node.js 24.x. Astro 4.4.5 con salida `server`, que usa el adaptador de Vercel en los builds de Vercel y Node standalone en el VPS y en local.

**Primary Dependencies**:

- Solo las existentes: Astro, Tailwind CSS, Drizzle ORM con `postgres`, Zod 4, `read-excel-file` 9.x, `write-excel-file` 4.x, `@onparallel/write-excel-file-data-validation` 1.0.2 (fijado) y `fflate`. Ningún paquete nuevo.
- Servicio externo de solo lectura: DolarAPI (`https://ve.dolarapi.com/v1/historicos/euros/oficial`), consumido con el `fetch` nativo, sin autenticación ([contracts/euro-rate-source.md](./contracts/euro-rate-source.md)).

**Storage**:

- **PostgreSQL**:
  - Migración `drizzle/0003_clientes_financiamientos_congresos.sql`, escrita a mano, con seis enums y las tablas `clients`, `financings`, `installments`, `euro_rates` y `congresses`.
  - `CHECK` de coherencia, `ON DELETE RESTRICT` de clientes a financiamientos y unicidad diferible del celular ([data-model.md](./data-model.md)).
  - `product_variants` solo se lee para sugerir tallas.
- **Archivos subidos**: no se almacenan. El estado entre la vista previa y la confirmación es un token firmado, como en la 003.

**Testing**:

- Vitest unitario para funciones puras y reglas por sección.
- Vitest de contrato para los libros y las respuestas.
- Integración con PostgreSQL real, condicionada por `TEST_DATABASE_URL`.
- Playwright condicionado por `E2E=1`, en escritorio y móvil.
- `astro check` con `npm run build`.
- Regresión: las suites de la 003 pasan sin modificarse.

**Target Platform**:

- Vercel Functions con Node.js 24. Su límite de 4,5 MB por petición y respuesta fija el tope de 4 MB por archivo.
- VPS con Node standalone detrás de un proxy HTTPS (README). No se depende de tareas programadas, así que ambos funcionan igual.

**Project Type**: Aplicación web Astro server-rendered con vitrina pública y panel privado de una única propietaria.

**Performance Goals**:

| Operación | Objetivo | Esperado |
|---|---|---|
| Búsqueda y filtros con 10.000 clientes | < 2 s (FR-008) | < 100 ms (`LIKE` sobre `search_text`) |
| Vista previa de 5.000 filas | < 30 s (SC-007) | Unos segundos; leer las 2.062 filas de “Medicos” tardó 109 ms |
| Calendario mensual | — | < 300 ms en el servidor |
| Sincronización de tasas | Nunca más de 3 s de espera | Una petición de unos 136 KB, normalmente una vez al día |

**Constraints**:

- **Archivos**: `.xlsx` de hasta 4 MB, con 10.000 filas en Clientes, 2.000 en Financiamientos y 10.000 en Congresos.
- **Respuestas**: menos de 4 MB.
- **Vista previa**: vence a los 60 min.
- **Aplicación**: `lock_timeout` de 10 s, sin `DELETE` en las cargas.
- **Autorización y privacidad**: `requireOwner` o `requireMutation` en cada endpoint. Ningún dato personal en los registros. Fechas de día completo en `America/Caracas`.
- **Interfaz**: en español y sin desplazamiento horizontal a 320 px.

**Scale/Scope**:

- **Datos**: unos 2.061 clientes iniciales (objetivo: 10.000), decenas de financiamientos con cientos de cuotas y de 10 a 20 congresos al año. Una sola usuaria.
- **Alcance del cambio**: 12 páginas, 23 archivos de endpoints, unos 35 módulos de servidor, 6 utilidades isomorfas y 1 migración.
- **Código existente afectado**: navegación del panel e inicio, `money.ts` y la extracción de piezas de `src/server/inventory/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Estado | Evidencia del diseño |
|---|---|---|
| I. Catálogo completo y fuente de verdad | PASS | PostgreSQL es la fuente de verdad de los datos nuevos. Ningún cambio en productos, variantes ni disponibilidad: los financiamientos no se vinculan al catálogo ni modifican existencias (FR-010), y las tallas del catálogo solo se leen para sugerencias. |
| II. Compra simple y orientada a la conversión | PASS | El recorrido público, la bolsa y el pedido de WhatsApp no cambian. Ningún módulo público importa los servicios nuevos (FR-002). |
| III. Diseño claro, atractivo y accesible | PASS | [contracts/admin-ui.md](./contracts/admin-ui.md) define la navegación con menú `<details>` en móvil, tarjetas en lugar de tablas a 320 px, el calendario con franjas de nombre accesible y vista de lista alternativa, `<dialog>` con foco atrapado, anuncios `aria-live`, áreas de 44 px y contraste de 4.5:1. |
| IV. Rendimiento y resiliencia | PASS | La fuente de la tasa tiene un tiempo máximo de 3 s y degradación definida (última tasa guardada o tasa escrita a mano). Archivos y respuestas están acotados. La sección nunca queda en blanco ni muestra mensajes técnicos. |
| V. Seguridad, calidad y evolución responsable | PASS | Autenticación, `Origin` y CSRF en el servidor para cada endpoint. Tokens de vista previa ligados a la sesión y a la sección. Datos personales fuera de los registros y de la vitrina. Cargas de todo o nada con control de concurrencia. Pruebas de acceso no autorizado. Sin dependencias ni secretos nuevos. |
| VI. Formato uniforme de montos en dólares | PASS | Todo monto en dólares usa `formatMoney`. Los bolívares y la tasa usan `formatBolivares` y `formatEuroRate`, con los mismos separadores. Los archivos de intercambio conservan el punto decimal. |
| Restricciones de producto y plataforma | PASS | Astro y TypeScript se mantienen, con una migración versionada y la misma configuración en local y en producción. El panel comunica el resultado de cada operación. Sobre “no procesar pagos ni confirmar ventas”: la sección solo registra cobros hechos fuera de la aplicación, sin mover dinero, sin pasarelas, sin tocar existencias ni pedidos de la vitrina ([research.md](./research.md), Decision 16). La constitución 1.1.1, aprobada el 2026-10-18, permite registrar esos acuerdos y cobros externos. |
| Flujo de desarrollo y puertas de calidad | PASS | La especificación y los contratos describen los estados de éxito, carga, vacío y error. Las entradas se validan en el servidor y no quedan estados parciales. Hay pruebas de 401 y 403. El quickstart incluye la revisión en móvil, teclado y lector de pantalla, y detiene la publicación si los datos personales se exponen. |

**Resultado**: PASS. Ningún gate bloquea las fases 0 y 1. La constitución 1.1.1, aprobada el 2026-10-18, ya permite registrar los pagos financiados (Decision 16); no queda ninguna acción de gobernanza pendiente.

## Project Structure

### Documentation (this feature)

```text
specs/004-clientes-financiamiento-congresos/
├── spec.md                         # Especificación (clarificada)
├── plan.md                         # Este plan
├── research.md                     # 17 decisiones con alternativas y evidencias
├── data-model.md                   # Tablas, enums, derivados, transiciones y transacciones
├── quickstart.md                   # Validación automatizada y manual
├── contracts/
│   ├── bulk-workbooks.md           # Libros de Clientes, Financiamientos y Congresos (formato 1)
│   ├── admin-api.md                # Endpoints, esquemas y códigos de incidencia
│   ├── admin-ui.md                 # Pantallas, estados, accesibilidad y móvil
│   └── euro-rate-source.md         # Consumo de DolarAPI: semántica, sincronización y fallos
├── checklists/
│   └── requirements.md             # Calidad de la especificación
└── tasks.md                        # Lo generará $speckit-tasks
```

### Source Code (repository root)

```text
src/
├── db/schema.ts                                  # + enums y tablas clients, financings, installments, euro_rates y congresses
├── pages/
│   ├── admin/
│   │   ├── index.astro                           # + accesos a las tres secciones
│   │   ├── clientes/
│   │   │   ├── index.astro                       # Lista, búsqueda, filtros y paginación
│   │   │   ├── nuevo.astro                       # Alta
│   │   │   ├── [ref].astro                       # Ficha, edición, financiamientos, WhatsApp y eliminación
│   │   │   └── carga-masiva.astro
│   │   ├── pagos-financiados/
│   │   │   ├── index.astro                       # Resumen, tasa, cuotas, filtros y pagos
│   │   │   ├── nuevo.astro                       # Alta con calendario editable
│   │   │   ├── [ref].astro                       # Detalle, pagos, edición, anulación y eliminación
│   │   │   └── carga-masiva.astro
│   │   └── congresos/
│   │       ├── index.astro                       # Calendario mensual (?mes=) y lista (?vista=lista)
│   │       ├── nuevo.astro                       # Alta (?desde=AAAA-MM-DD)
│   │       ├── [ref].astro                       # Detalle y edición
│   │       └── carga-masiva.astro
│   └── api/admin/
│       ├── clients/index.ts                      # GET lista · POST alta
│       ├── clients/[ref].ts                      # GET · PATCH · DELETE
│       ├── clients/bulk/{template,export,preview,apply}.ts
│       ├── financings/index.ts                   # POST alta
│       ├── financings/[ref].ts                   # GET · PATCH · DELETE
│       ├── financings/[ref]/{annul,restore}.ts
│       ├── financings/payments.ts                # POST registrar pagos (uno, varios o parcial)
│       ├── financings/installments/index.ts      # GET cuotas y resumen
│       ├── financings/installments/[id]/undo-payment.ts
│       ├── financings/bulk/{template,preview,apply}.ts
│       ├── euro-rate.ts                          # GET tasa aplicable a una fecha
│       ├── congresses/index.ts                   # GET por rango · POST alta
│       ├── congresses/[ref].ts                   # PATCH · DELETE
│       └── congresses/bulk/{template,export,preview,apply}.ts
├── components/admin/
│   ├── AdminLayout.astro                         # Navegación con las secciones nuevas y menú móvil
│   ├── SuggestInput.astro                        # <input list> + <datalist>
│   ├── ConfirmDialog.astro                       # <dialog> de confirmación
│   ├── ClientForm.astro
│   ├── FinancingForm.astro                       # Buscador de cliente y calendario editable
│   ├── InstallmentTable.astro                    # Cuotas con estado, pagos y acciones
│   ├── PaymentDialog.astro                       # Moneda, tasa, monto en Bs y pago parcial
│   ├── CongressCalendar.astro                    # Cuadrícula mensual con franjas
│   ├── CongressList.astro
│   ├── CongressForm.astro
│   ├── BulkUpload.astro                          # Carga masiva genérica para las tres secciones
│   └── bulk/renderers.ts                         # Tarjetas de cambios por sección (navegador)
├── server/
│   ├── bulk/                                     # Extraído de inventory/ sin cambiar su comportamiento
│   │   ├── file-guards.ts, sheet.ts, cells.ts, issues.ts
│   │   ├── preview-token.ts, http.ts, workbook-writer.ts, transaction.ts
│   ├── inventory/*                               # Importa las piezas de bulk/; mismos contratos y pruebas
│   ├── reference/values.ts                       # Valores de referencia y escritura canónica
│   ├── clients/{repository,service}.ts
│   ├── clients/bulk/{format,rows,changes,repository,service}.ts
│   ├── financing/{repository,service,payments,summary,euro-rates}.ts
│   ├── financing/bulk/{format,rows,changes,repository,service}.ts
│   ├── congresses/{repository,service}.ts
│   ├── congresses/bulk/{format,rows,changes,repository,service}.ts
│   └── validation/{clients,financing,congresses}.ts   # Esquemas Zod compartidos por formularios y carga masiva
└── utils/                                        # Isomorfas: servidor y navegador
    ├── phone.ts                                  # normalizePhone, formatPhone, phoneSearchDigits
    ├── text-keys.ts                              # normalizeKey
    ├── dates.ts                                  # todayInCaracas, formatDate, formatMonthYear, aritmética de días
    ├── financing-schedule.ts                     # defaultFirstDueDate, nextDueDate, generateSchedule
    ├── calendar.ts                               # buildMonthView
    ├── whatsapp.ts                               # whatsappUrl, buildInstallmentReminder
    └── money.ts                                  # + formatBolivares, formatEuroRate

drizzle/
├── 0003_clientes_financiamientos_congresos.sql   # Enums, tablas, CHECK, índices y restricción diferible
└── meta/_journal.json                            # Nueva entrada idx 2

tests/
├── unit/
│   ├── phone.test.ts, text-keys.test.ts, dates.test.ts, money.test.ts (ampliado)
│   ├── financing-schedule.test.ts, financing-state.test.ts, euro-rates.test.ts
│   ├── calendar.test.ts, whatsapp.test.ts
│   ├── bulk-cells.test.ts, bulk-preview-token.test.ts
│   ├── clients-bulk-rows.test.ts, clients-bulk-changes.test.ts
│   ├── financing-bulk-rows.test.ts, financing-bulk-changes.test.ts
│   └── congresses-bulk-changes.test.ts
├── contract/
│   ├── clients-workbook.test.ts, financing-workbook.test.ts, congresses-workbook.test.ts
│   └── bulk-api-response.test.ts
├── integration/                                  # Requiere TEST_DATABASE_URL
│   ├── helpers/test-database.ts                  # + limpieza de las tablas nuevas
│   ├── clients.test.ts, clients-bulk-apply.test.ts
│   ├── financing-payments.test.ts, financing-bulk-apply.test.ts
│   ├── congresses-bulk-apply.test.ts
│   └── euro-rates-sync.test.ts
├── fixtures/bulk/workbook-builder.ts             # Libros de prueba generados en tiempo de ejecución
└── e2e/                                          # Requiere E2E=1
    ├── admin-clients.spec.ts, admin-financing.spec.ts
    ├── admin-congresses.spec.ts, admin-nav.spec.ts
```

**Structure Decision**: Se mantiene la aplicación única Astro y la separación vigente (AGENTS.md):

- **Páginas y endpoints**: en `src/pages`, con páginas en español y API en inglés, como `/admin/productos` y `/api/admin/products`.
- **Dominios server-only**: `clients`, `financing` y `congresses`, junto a `catalog` e `inventory`.
- **Motor común**: `src/server/bulk/`, extraído de la 003.
- **Reglas de negocio**: viven en funciones puras para probarlas sin base de datos (`rows.ts`, `changes.ts` y `src/utils/*`). El acceso a PostgreSQL se concentra en los `repository.ts`.
- **Interfaz**: componentes Astro con scripts de navegador, sin islas React.

## Phase 0: Research Decisions

Las decisiones, alternativas y evidencias están en [research.md](./research.md):

1. Cinco tablas nuevas en una migración 0003 escrita a mano, con `CHECK`, `RESTRICT` y totales derivados de las cuotas.
2. `ref` visible por identidad `GENERATED ALWAYS` y UUID interno. Se evita el desfase de secuencia que corrigió la 0002.
3. Celular en E.164 con reglas verificadas sobre las 2.061 filas reales. Única y diferible, para permitir intercambios en la carga masiva.
4. Búsqueda y valores de referencia con `normalizeKey` mantenido por la aplicación, sin extensiones.
5. Motor de carga masiva compartido (`src/server/bulk/`), extraído de la 003 sin cambiar su comportamiento y con regresión obligatoria.
6. Libros compatibles con “Medicos” y “Eventos”, con metadatos de “Sección” y respaldo en la primera hoja. Leer el libro real tardó 109 ms.
7. Clientes y congresos: identificación por fila y celdas vacías que borran (con identificador) o conservan (reconocido por celular).
8. Calendario de cuotas en una función pura e isomorfa, con el pago embebido en la cuota y división en los pagos parciales.
9. Pagos con `FOR UPDATE` por financiamiento, `expectedUpdatedAt` y montos en bolívares calculados siempre en el servidor.
10. Tasa euro sincronizada bajo demanda con el histórico de DolarAPI. Se verificó que su fecha es la fecha valor del BCV (991,16445734 para el 19/10/2026) y que solo hay tasas de días hábiles.
11. Calendario mensual renderizado en el servidor con `buildMonthView`, con carriles para las superposiciones y “+N más”.
12. Interfaz con páginas Astro, `<dialog>`, `SuggestInput` y `BulkUpload` genérico. La navegación usa `<details>` en móvil.
13. Fechas de día completo en `America/Caracas`, formatos propios de fecha, `$` y `Bs`, y lectura de fechas de Excel en UTC.
14. Límites por sección y respuestas por debajo de 4 MB, con un resumen compacto de calendario en Financiamientos.
15. Seguridad y privacidad: guardas existentes, nada de datos personales en los registros y ninguna exposición pública.
16. El registro de cobros externos no es “procesar pagos”. La enmienda PATCH 1.1.1 se aprobó el 2026-10-18 y está vigente en la constitución.
17. Verificación en cuatro niveles más la regresión de la 003.

No quedan elementos `NEEDS CLARIFICATION`.

## Phase 1: Design Summary

- [data-model.md](./data-model.md): enums, las cinco tablas con sus reglas y sus columnas del libro, valores derivados (totales, saldo, estados, numeración, resúmenes y equivalentes en Bs), reglas del calendario con ejemplo, transiciones de cuota, financiamiento y carga, estructuras transitorias por sección, líneas base, token por sección y límites transaccionales con las claves de bloqueo.
- [contracts/bulk-workbooks.md](./contracts/bulk-workbooks.md): archivos descargables, hojas y metadatos, columnas de las tres hojas con su obligatoriedad y el significado de las celdas vacías, lectura de fechas, montos y encabezados, ayudas dentro de Excel, límites y ejemplos (incluidas las filas reales de “Medicos” y “Eventos”).
- [contracts/admin-api.md](./contracts/admin-api.md): endpoints de clientes, cuotas, pagos, financiamientos, tasa euro y congresos con sus estados HTTP; esquemas `BulkPreviewResponse` y `BulkApplyResponse`, y el catálogo de códigos de incidencia común y por sección.
- [contracts/admin-ui.md](./contracts/admin-ui.md): navegación, las doce pantallas, el diálogo de pago con los estados de la tasa, el recordatorio de WhatsApp, el calendario con sus franjas, carriles y comportamiento móvil, y el componente genérico de carga masiva.
- [contracts/euro-rate-source.md](./contracts/euro-rate-source.md): endpoint consumido, campos, semántica verificada, política de sincronización, fallos, redondeo y pruebas sin red.
- [quickstart.md](./quickstart.md): preparación, suites automatizadas (unitarias, de contrato, de integración y E2E, más la regresión de la 003), validación manual de las historias 1 a 8, comprobación de la tasa contra la fuente, seguridad, móvil, teclado y compatibilidad, y los resultados esperados para cada criterio de éxito.

### Trazabilidad de requisitos

| Requisitos | Diseño |
|---|---|
| FR-001 a FR-004 | Middleware y guards, `AdminLayout` con menú móvil, estados y accesibilidad ([admin-ui.md](./contracts/admin-ui.md)) |
| FR-005 a FR-009 | `clients` y `validation/clients.ts`, `utils/phone.ts`, `reference/values.ts`, `/admin/clientes`, `RESTRICT` |
| FR-010 a FR-020 | `financings` e `installments`, `utils/financing-schedule.ts`, `financing/payments.ts`, `financing/summary.ts`, `financing/euro-rates.ts` y los formatos de `money.ts` |
| FR-021 a FR-025 | `congresses`, `utils/calendar.ts`, `CongressCalendar` y `CongressList` |
| FR-026 a FR-039 | `src/server/bulk/*`, `BulkUpload.astro`, `bulk-workbooks.md` y los endpoints `bulk/*` |
| FR-040 a FR-042 | `clients/bulk`, `financing/bulk` y `congresses/bulk` (`format.ts`, `rows.ts`, `changes.ts`) |
| FR-043 y FR-044 | `utils/whatsapp.ts` en la ficha del cliente y en las cuotas |

### Notas para la generación de tareas

1. **Gobernanza**: la enmienda aclaratoria 1.1.1 se aprobó el 2026-10-18 (constitución 1.1.1). No queda ninguna acción pendiente para publicar las historias 3, 4 y 5.
2. **Fundación**, que bloquea todas las historias:
   - la migración 0003, `schema.ts` y la limpieza de las tablas nuevas en `tests/integration/helpers/test-database.ts`;
   - las utilidades isomorfas (`phone`, `text-keys`, `dates`, `money`, `financing-schedule` y `calendar`) con sus pruebas;
   - la extracción de `src/server/bulk/`, con las suites de la 003 en verde sin modificarlas;
   - la navegación de `AdminLayout`.
3. **Historias en orden de prioridad**:
   - **US1**: CRUD de clientes, valores de referencia y búsqueda.
   - **US2**: carga masiva de clientes.
   - **US3 y US4**, que comparten `euro-rates.ts` y `PaymentDialog`: alta de financiamientos, pagos, resumen y edición.
   - **US5**: carga masiva de financiamientos.
   - **US6**: calendario de congresos.
   - **US7**: carga masiva de congresos.
   - **US8**: WhatsApp.
4. **MVP**: US1 + US2, porque la base de clientes con su importación ya entrega valor. US3 + US4 forman el segundo incremento, porque los pagos necesitan financiamientos. US6 es independiente y puede adelantarse si la propietaria lo prioriza.
5. **Ajustes a código existente**:
   - `src/server/inventory/*` importa las piezas de `bulk/`, con el mismo propósito de token, mensajes y exportaciones;
   - `src/pages/admin/index.astro`;
   - `src/utils/money.ts`, al que se agregan funciones sin cambiar `formatMoney`.
6. **Documentación que actualizar**:
   - las rutas nuevas en la tabla de `README.md`;
   - `docs/documentacion.md`, con los módulos, la carga masiva por sección, la tasa euro y los pagos;
   - `AGENTS.md`: los montos en bolívares con `formatBolivares`, DolarAPI como la única llamada externa de los pagos financiados, el motor `src/server/bulk/` y que los datos de clientes son personales y no se registran.
7. **Riesgos que vigilar**:
   - un cambio de formato de DolarAPI, cubierto por la validación y el respaldo manual;
   - una regresión de la 003 durante la extracción, cubierta por sus suites;
   - el comportamiento de la restricción diferible en Neon con pooling transaccional, que debe verificarse en la integración: `SET CONSTRAINTS` vale dentro de la transacción;
   - el tamaño de las respuestas con el máximo de filas, cubierto por pruebas de contrato.

## Constitution Re-check after Phase 1 Design

- **I. Fuente de verdad**: PASS. El modelo solo escribe en las tablas nuevas, dentro de transacciones. Los productos, las variantes y la disponibilidad no se tocan (data-model, “Alcance de datos”).
- **II. Compra simple**: PASS. Los contratos no agregan ni modifican rutas públicas.
- **III. Accesibilidad**: PASS. El contrato de interfaz fija la navegación móvil, las alternativas al calendario, los diálogos, los anuncios, los tamaños y el contraste.
- **IV. Rendimiento y resiliencia**: PASS. Los límites de archivo, filas y respuesta son explícitos. Cada fallo de la fuente de la tasa tiene un comportamiento definido sin bloquear la página, y cada conflicto responde `409` sin cambios parciales.
- **V. Seguridad y calidad**: PASS. Cada endpoint documenta su autorización. Los tokens están ligados a la sesión y a la sección. Hay pruebas de integración de atomicidad, concurrencia, `RESTRICT` y `CHECK`, más pruebas 401 y 403 en el quickstart. No se registran datos personales.
- **VI. Montos**: PASS. Los formatos `$` y `Bs` están definidos en el contrato de interfaz y se prueban.
- **Restricciones**: PASS: la constitución 1.1.1, aprobada el 2026-10-18, permite registrar los pagos financiados. La migración versionada es la 0003, sin secretos nuevos y en la aplicación Astro única.

No quedan decisiones técnicas abiertas.

## Complexity Tracking

No se registran violaciones de la constitución. La complejidad adicional está justificada:

- **Motor de carga masiva compartido**: evita cuatro copias de las guardas de archivo, el token y la transacción. La extracción se protege con las suites existentes de la 003.
- **Restricción diferible del celular**: permite intercambiar celulares en una sola carga, que FR-031 evalúa sobre el resultado final, sin pasar por valores provisionales.
- **Consumo de DolarAPI**: es la fuente que eligió la propietaria. Tiene un tiempo máximo, validación y respaldo manual, y no requiere dependencias ni secretos nuevos.

No se agregan paquetes npm.
