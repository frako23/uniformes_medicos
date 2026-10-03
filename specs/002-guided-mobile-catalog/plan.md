# Implementation Plan: Navegación guiada del catálogo móvil

**Branch**: `002-guided-mobile-catalog` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-guided-mobile-catalog/spec.md`

## Summary

La página pública reemplazará la entrada basada en un selector largo, filtros simultáneos y navegación tipo feed por un recorrido móvil de tres decisiones: género, tallas y grupo de prenda. El catálogo completo seguirá cargándose desde `listPublicProducts`; una lógica de filtrado local y testeable reducirá los resultados progresivamente sin crear una nueva API ni cambiar el inventario. Los resultados conservarán las tarjetas, imágenes, detalle, favoritos, bolsa y preparación del pedido por WhatsApp existentes.

## Technical Context

**Language/Version**: TypeScript 5.3, Node.js 24.x, Astro 4 con renderizado server-side

**Primary Dependencies**: Astro, Tailwind CSS, Vitest, Playwright y los servicios de catálogo existentes; no se requiere una dependencia nueva

**Storage**: PostgreSQL continúa siendo la fuente del catálogo mediante `listPublicProducts`; no hay cambio de esquema ni persistencia de la selección guiada

**Testing**: Vitest para reglas puras de filtrado e integración existente; Playwright para el flujo público en viewport móvil; `astro check` y `astro build` como validación de compilación

**Target Platform**: Vercel Serverless con Node.js 24 para el servidor y navegadores móviles modernos; la misma interfaz debe seguir siendo usable en tableta y escritorio

**Project Type**: Aplicación web Astro server-rendered con catálogo público y panel privado

**Performance Goals**: Mostrar los controles esenciales en la respuesta inicial del catálogo; actualizar cada paso sin una solicitud adicional; presentar una lista utilizable en menos de 60 segundos de interacción para al menos el 90% de las pruebas móviles

**Constraints**: No llamadas runtime a Strapi; no mostrar productos fuera del inventario público disponible recibido; no ocultar el catálogo completo; selección temporal solamente; controles táctiles de al menos 44 píxeles; sin desplazamiento horizontal; conservar los identificadores, URLs y acciones públicas existentes

**Scale/Scope**: Una ruta pública (`/`), el flujo de selección y sus estados de resultados/vacío/error; aproximadamente hasta 300 productos del catálogo actual; sin cambios en administración, migración, pagos o modelo de datos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Estado | Evidencia del diseño |
|---|---|---|
| I. Catálogo completo y fuente de verdad | PASS | Se parte de `listPublicProducts`, que ya limita a publicados, activos y con stock positivo; el flujo incluye “Ver todo”, incluye `Unisex` en Damas/Caballeros y nunca crea disponibilidad. |
| II. Compra simple y orientada a la conversión | PASS | Tres decisiones principales, una acción clara por paso, resumen de filtros, navegación hacia atrás y conservación de detalle, bolsa, favoritos y WhatsApp. |
| III. Diseño claro y accesible | PASS | Flujo de una pregunta por pantalla, botones táctiles, foco visible, etiquetas accesibles, contraste, texto alternativo y validación en viewport móvil. |
| IV. Rendimiento y resiliencia | PASS | La respuesta inicial conserva el catálogo server-rendered; las transiciones son locales; se documentan carga, error, vacío, reintento y alternativa de contacto. |
| V. Seguridad, calidad y evolución responsable | PASS | No se toca autenticación, administración, secretos, pagos ni esquema; se añaden pruebas unitarias y de navegador para una ruta crítica del catálogo. |

**Resultado**: PASS. No hay violaciones constitucionales que requieran una excepción o una entrada en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-guided-mobile-catalog/
├── plan.md              # Este plan
├── research.md          # Decisiones y alternativas resueltas
├── data-model.md        # Estado temporal y reglas de filtrado
├── quickstart.md        # Validación automatizada y manual
├── contracts/           # Contrato de estados y comportamiento público
└── tasks.md             # Se generará con $speckit-tasks
```

### Source Code (repository root)

```text
src/
├── pages/
│   └── index.astro                 # Entrada guiada, resultados y estados públicos
├── components/
│   └── SizeStock.astro              # Presentación accesible de tallas en tarjetas
├── server/catalog/
│   ├── public-products.ts           # Fuente pública existente, sin cambio de contrato
│   └── mapper.ts                    # Mapeo existente de variantes e imágenes
├── utils/
│   ├── catalog-filters.ts            # Nuevo: reglas puras de género, stock y grupo
│   └── types.ts                      # Tipos públicos existentes y tipos del filtro
└── stores/
    └── favoritesStore.ts             # Persistencia existente de favoritos

tests/
├── unit/
│   └── catalog-filters.test.ts       # Reglas deterministas del recorrido
├── integration/
│   └── public-catalog.test.ts        # Invariantes existentes del catálogo
└── e2e/
    └── public-catalog.spec.ts        # Recorrido móvil y regresiones públicas
```

**Structure Decision**: Se mantiene la aplicación única Astro. La página pública conserva la consulta server-only y el render de tarjetas; las reglas de filtrado se extraen a `src/utils/catalog-filters.ts` para que la interfaz y Vitest compartan exactamente las mismas decisiones. La interacción de pasos puede permanecer en el script de la página mientras no introduzca una segunda aplicación ni un nuevo backend.
