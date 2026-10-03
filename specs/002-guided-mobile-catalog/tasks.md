# Tasks: Navegación guiada del catálogo móvil

**Input**: Design documents from `/specs/002-guided-mobile-catalog/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/public-catalog-flow.md](./contracts/public-catalog-flow.md), [quickstart.md](./quickstart.md)

**Tests**: Se incluyen tareas de pruebas porque el plan y la constitución exigen verificar las reglas críticas de disponibilidad, el flujo público y la experiencia móvil. Las pruebas de cada historia deben escribirse antes de su implementación y comenzar fallando cuando corresponda.

**Organization**: Las tareas están agrupadas por historia de usuario para permitir entregas incrementales y pruebas independientes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar la infraestructura de pruebas y los contratos de estado compartidos sin cambiar el esquema ni la fuente de datos.

- [x] T001 [P] Configurar en `playwright.config.ts` un proyecto de navegador móvil usando un dispositivo de teléfono, conservando el proyecto Chromium de escritorio y la misma URL base.
- [x] T002 [P] Crear en `src/utils/catalog-filters.ts` los tipos compartidos `GuidedCatalogSelection`, `CatalogFilterRecord`, `GarmentGroup`, pasos y vistas del recorrido, respetando `Dama | Caballero | Unisex` y `uniformes | batas`.
- [x] T003 [P] Crear en `tests/unit/catalog-filter-fixtures.ts` fixtures deterministas con productos Dama, Caballero, Unisex, variantes con stock positivo/cero, una bata, un uniforme y etiquetas de talla variables.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establecer las reglas de dominio que deben compartir la interfaz y las pruebas antes de implementar cualquier historia.

**⚠️ CRITICAL**: No comenzar una historia de usuario hasta completar esta fase.

- [x] T004 Implementar en `src/utils/catalog-filters.ts` la normalización de etiquetas de tipo sin mayúsculas ni diacríticos y la clasificación `batas` cuando el tipo contiene “bata”; todos los demás tipos deben pertenecer a `uniformes`, sin modificar `legacyTypeLabel` ni crear migraciones.
- [x] T005 Implementar en `src/utils/catalog-filters.ts` los predicados de género, stock y talla: `Unisex` coincide con `Dama` y `Caballero`; `positiveSizeLabels` solo contiene variantes con `cantidad_actual > 0`; una selección de tallas vacía equivale a “Cualquier talla”; con tallas seleccionadas basta una coincidencia positiva.

**Checkpoint**: Los tipos y reglas puras están disponibles para la primera historia; PostgreSQL, `listPublicProducts` y el modelo de datos permanecen sin cambios.

---

## Phase 3: User Story 1 - Encontrar prendas mediante una selección guiada (Priority: P1) 🎯 MVP

**Goal**: Permitir que una persona seleccione género, tallas y grupo de prenda, y vea únicamente resultados publicados, activos y disponibles compatibles con esas decisiones.

**Independent Test**: Con datos públicos que incluyan Dama, Caballero, Unisex, tallas, batas y uniformes, el visitante abre el catálogo, elige una opción de género, selecciona una o varias tallas, elige “Uniformes” o “Batas” y obtiene solo tarjetas que cumplen la selección.

### Tests for User Story 1

- [x] T006 [P] [US1] Añadir en `tests/unit/catalog-filters.test.ts` pruebas que fallen inicialmente para opciones de talla con stock positivo, compatibilidad Unisex, selección de varias tallas, “Cualquier talla”, clasificación de bata/uniforme y exclusión de productos sin disponibilidad, cubriendo FR-003, FR-006, FR-007 y FR-008.
- [x] T007 [P] [US1] Añadir en `tests/e2e/public-catalog.spec.ts` el recorrido contractual de `contracts/public-catalog-flow.md`: primera pregunta de género, paso de tallas, paso de grupo y resultados filtrados, usando roles accesibles y verificando el contador de resultados.

### Implementation for User Story 1

- [x] T008 [US1] Completar en `src/utils/catalog-filters.ts` las funciones puras para construir las opciones de talla compatibles y devolver los productos que cumplen género, grupo y al menos una talla seleccionada con stock positivo, manteniendo intacta la fuente `listPublicProducts`.
- [x] T009 [P] [US1] Modificar `src/pages/index.astro` para renderizar los paneles de género, tallas y grupo, el indicador de progreso, la salida secundaria “Ver todo”, una región de resultados y metadatos mínimos por tarjeta: identificador, género, tipo original y tallas con stock positivo.
- [x] T010 [US1] Sustituir en `src/pages/index.astro` la lógica de selector/categorías actual por el estado inicial del recorrido y aplicar las funciones de `src/utils/catalog-filters.ts` después de cada decisión, ocultando o mostrando tarjetas sin alterar las acciones de detalle, favoritos, bolsa, imágenes y WhatsApp.

**Checkpoint**: La historia P1 principal funciona como MVP: una visita nueva puede completar los tres pasos y ver un catálogo filtrado veraz.

---

## Phase 4: User Story 2 - Corregir o ampliar la búsqueda sin empezar de nuevo (Priority: P1)

**Goal**: Permitir cambiar género, tallas o grupo, quitar la restricción de talla, usar Atrás y reiniciar sin perder el acceso al catálogo completo.

**Independent Test**: Después de obtener resultados, el visitante vuelve a un paso anterior, conserva las decisiones válidas, cambia una respuesta, usa “Cualquier talla” o reinicia; el estado visual y los resultados reflejan cada acción.

### Tests for User Story 2

- [x] T011 [P] [US2] Crear `tests/e2e/public-catalog-navigation.spec.ts` con escenarios de cambiar género/tallas/grupo, elegir “Cualquier talla”, reiniciar y usar Atrás del navegador, verificando el estado seleccionado y el resultado actualizado según FR-009 y FR-010.

### Implementation for User Story 2

- [x] T012 [US2] Implementar en `src/pages/index.astro` las transiciones del estado guiado: cambiar género limpia las decisiones dependientes, cambiar tallas conserva el género, cambiar grupo recalcula resultados y reiniciar vuelve al paso inicial.
- [x] T013 [US2] Integrar en `src/pages/index.astro` entradas de historial y `popstate` para restaurar pasos y selecciones anteriores, sin usar `localStorage`, cookies ni persistencia de preferencias.
- [x] T014 [US2] Añadir en `src/pages/index.astro` el resumen legible de género, tallas y grupo activos, controles para editar cada selección, “Cualquier talla”, “Reiniciar selección” y “Ver todo” sin eliminar las tarjetas ni acciones públicas existentes.
- [x] T015 [US2] Implementar en `src/pages/index.astro` el estado sin resultados con acciones contextuales para cambiar el último criterio, quitar tallas, reiniciar o ampliar a “Ver todo”, incluyendo el caso de género sin tallas compatibles y el estado vacío general según FR-011 y FR-015.

**Checkpoint**: Las búsquedas demasiado específicas son recuperables y el botón Atrás no obliga a repetir el recorrido.

---

## Phase 5: User Story 3 - Explorar resultados cómodamente desde el celular (Priority: P2)

**Goal**: Entregar una interfaz móvil clara, táctil, accesible y resistente en los estados de resultados, carga, vacío y error.

**Independent Test**: En un viewport de teléfono de 320 píxeles de ancho, la persona identifica el paso actual, opera los controles con toque o teclado, ve resultados sin desplazamiento horizontal y puede usar las acciones públicas de las tarjetas.

### Tests for User Story 3

- [x] T016 [P] [US3] Crear `tests/e2e/public-catalog-mobile.spec.ts` para validar el proyecto móvil, áreas de toque, ausencia de overflow horizontal, foco visible, nombres accesibles, mensajes de vacío/error y conservación de enlaces a detalle/WhatsApp conforme a `contracts/public-catalog-flow.md`.

### Implementation for User Story 3

- [x] T017 [US3] Ajustar en `src/pages/index.astro` el layout y estilos del recorrido para una pregunta por pantalla, botones de al menos 44 píxeles, una columna en pantallas estrechas, progreso visible, foco/contraste y ningún desplazamiento horizontal, manteniendo adaptación a tableta/escritorio.
- [x] T018 [P] [US3] Actualizar `src/components/SizeStock.astro` para mostrar solo tallas con `cantidad_actual > 0`, usar controles con nombre y estado accesibles, evitar botones interactivos sin propósito y conservar el texto veraz de stock.
- [x] T019 [US3] Revisar en `src/pages/index.astro` las imágenes y acciones de cada tarjeta para conservar texto alternativo útil, etiquetas accesibles, estado visible de controles y los enlaces existentes de detalle, favoritos, bolsa y WhatsApp.
- [x] T020 [US3] Añadir en `src/pages/index.astro` estados visibles de carga, error y catálogo vacío con mensajes no técnicos, reintento o retorno útil y una vía de contacto alternativa cuando no haya productos.

**Checkpoint**: El recorrido completo y las tarjetas son utilizables desde celular, teclado y un lector de foco sin ocultar información ni acciones esenciales.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validar el cambio completo, retirar restos del flujo anterior y confirmar las puertas de calidad del proyecto.

- [x] T021 Eliminar en `src/pages/index.astro` el selector largo, la navegación inferior de filtros y manejadores de filtrado que ya no formen parte del recorrido, sin retirar el acceso secundario “Ver todo”.
- [x] T022 Revisar `src/pages/index.astro`, `src/components/SizeStock.astro` y `src/utils/catalog-filters.ts` para asegurar que no haya llamadas runtime a Strapi, secretos en cliente ni datos de disponibilidad inventados.
- [x] T023 Ejecutar la validación descrita en `specs/002-guided-mobile-catalog/quickstart.md`: `npm.cmd run test`, las tres suites públicas E2E en Chromium y móvil con `E2E=1`, y `npm.cmd run build`; corregir fallos de tipos, navegador, estados o accesibilidad antes de cerrar la historia. La suite administrativa queda reservada para una base aislada.
- [x] T024 Actualizar `specs/002-guided-mobile-catalog/quickstart.md` con la instalación de navegadores Playwright, el comando seguro de pruebas públicas y la advertencia sobre la suite administrativa, manteniendo escenarios reproducibles para móvil, vacío, error y regresión de compra.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001, T002 y T003 no dependen de otras tareas y pueden comenzar en paralelo.
- **Foundational (Phase 2)**: T004 y T005 dependen de los tipos de T002 y bloquean todas las historias.
- **User Story 1 (Phase 3)**: T006 y T007 dependen de T003–T005 y deben preceder a T008–T010; T009 puede avanzar en paralelo con T008.
- **User Story 2 (Phase 4)**: Depende de que US1 entregue el recorrido y sus resultados (T008–T010); T011 debe preceder a T012–T015.
- **User Story 3 (Phase 5)**: Depende de los estados funcionales de US1 y US2; T016 debe existir antes de cerrar T017–T020.
- **Polish (Phase 6)**: Depende de todas las historias que se quieran entregar; T023 es la puerta final.

### User Story Dependencies

- **User Story 1 (P1)**: Puede iniciar después de Foundation y constituye el MVP.
- **User Story 2 (P1)**: Depende funcionalmente de US1 porque extiende el estado y la salida del recorrido; es entregable y verificable una vez que el MVP muestra resultados.
- **User Story 3 (P2)**: Depende de US1 y US2 para probar todos los estados y controles, aunque sus ajustes de `SizeStock.astro` son independientes de la lógica de historial.

### Within Each User Story

- Las pruebas de cada historia se escriben antes de la implementación correspondiente.
- Los tipos y reglas puras preceden al estado visual; el markup precede a los manejadores que lo controlan.
- Las tareas con `[P]` solo comparten contratos ya definidos y escriben archivos diferentes.
- Cada checkpoint debe validarse antes de avanzar a la siguiente historia.

## Parallel Opportunities

- **Setup**: T001, T002 y T003 pueden ejecutarse en paralelo.
- **US1**: T006 (unitarias) y T007 (navegador) pueden ejecutarse en paralelo; T008 y T009 también pueden avanzar en paralelo una vez terminada Foundation.
- **US2**: T011 es una tarea de pruebas aislada; después T012–T015 deben mantenerse secuenciales porque modifican el estado y la misma página.
- **US3**: T016 puede prepararse antes de la implementación visual; T017 y T018 pueden ejecutarse en paralelo por tocar archivos distintos.
- **Polish**: T021 y T022 deben mantenerse secuenciales respecto a los cambios de `src/pages/index.astro`; T023 y T024 deben ejecutarse después de ambas revisiones.

## Parallel Example: User Story 1

```text
Developer A: T006 - reglas unitarias en tests/unit/catalog-filters.test.ts
Developer B: T007 - recorrido E2E en tests/e2e/public-catalog.spec.ts

Después de T006/T007 y Foundation:
Developer A: T008 - funciones puras en src/utils/catalog-filters.ts
Developer B: T009 - paneles y metadatos en src/pages/index.astro

Finalmente:
Developer A: T010 - integración de estado y filtrado en src/pages/index.astro
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1 y Phase 2.
2. Implementar y validar US1: género → tallas → grupo → resultados.
3. Ejecutar las pruebas unitarias y E2E de US1.
4. Detenerse para validar que ningún producto agotado aparece y que “Ver todo” conserva el catálogo.
5. Presentar el MVP antes de añadir historial, reinicio avanzado y pulido móvil completo.

### Incremental Delivery

1. Entregar US1 como recorrido mínimo funcional.
2. Añadir US2 para recuperar búsquedas y respetar Atrás/reinicio.
3. Añadir US3 para accesibilidad, estados resilientes y validación móvil.
4. Ejecutar Phase 6 y publicar solo si pasan las pruebas de catálogo, build y experiencia móvil.

## Notes

- Todas las tareas comienzan con una casilla, un ID secuencial, los marcadores opcionales de paralelismo/historia y una descripción con ruta.
- `[P]` indica que la tarea puede ejecutarse en paralelo sin compartir un archivo modificado por otra tarea incompleta.
- No se crea una migración porque el modelo de datos de la funcionalidad es temporal y el inventario existente ya contiene género, tipo y variantes.
- Las reglas de disponibilidad deben continuar dependiendo de PostgreSQL a través de `listPublicProducts`; no se debe introducir una llamada runtime a Strapi.
