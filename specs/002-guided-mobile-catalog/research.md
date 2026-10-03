# Research: Navegación guiada del catálogo móvil

## Decision 1: Filtrado local sobre el catálogo público ya cargado

**Decision**: Mantener una única consulta inicial a `listPublicProducts` y aplicar en el navegador las decisiones de género, talla y grupo de prenda sobre ese conjunto.

**Rationale**: La página ya recibe el catálogo público completo y cada producto contiene género, tipo y variantes. El flujo debe responder al toque sin latencia adicional, y el filtrado local evita crear un endpoint público nuevo, duplicar reglas de disponibilidad o introducir una migración.

**Alternatives considered**:

- Solicitar al servidor después de cada paso: ofrece datos más recientes, pero añade latencia y complejidad para una interacción que solo reduce un conjunto ya disponible.
- Crear filtros SQL específicos: sería útil para catálogos mucho mayores, pero no es necesario para el volumen actual y aumentaría el alcance con una API no pedida.

La consulta existente seguirá siendo la fuente de verdad de cada carga de página. Una recarga vuelve a validar publicación, actividad y stock desde PostgreSQL; el cliente no inventa ni revalida inventario con una fuente distinta.

## Decision 2: Extraer las reglas en funciones puras

**Decision**: Crear `src/utils/catalog-filters.ts` con tipos y funciones puras para construir opciones de talla, comprobar género compatible, clasificar el grupo de prenda y filtrar resultados.

**Rationale**: La lógica no debe quedar dispersa entre atributos DOM y manejadores de eventos. Funciones deterministas permiten probar casos de `Unisex`, tallas múltiples, stock positivo, etiquetas de bata y resultados vacíos sin montar la aplicación.

**Alternatives considered**:

- Comparar texto directamente dentro del script de `index.astro`: es más corto inicialmente, pero dificulta pruebas y aumenta el riesgo de que el estado visual y la regla de negocio diverjan.
- Añadir una abstracción global de estado o una nueva librería: no aporta valor para un único recorrido temporal y contradice el alcance mínimo.

## Decision 3: Serializar solo metadatos mínimos para la interacción

**Decision**: Renderizar junto con las tarjetas el identificador del producto, su género, su tipo original y sus etiquetas de talla con stock positivo; el script usará esos metadatos para decidir qué tarjetas mostrar y qué tallas ofrecer.

**Rationale**: El producto completo ya se renderiza para la vitrina, pero la lógica de interacción solo necesita esos campos. Mantener una representación mínima hace explícito el contrato del filtro y evita leer contenido visual o texto de botones como fuente de datos.

**Alternatives considered**:

- Inferir tallas desde el texto visible de `SizeStock`: es frágil ante cambios de copy, traducción o presentación.
- Exponer un endpoint JSON nuevo: no es necesario para el primer alcance porque los datos ya están en la respuesta pública.

## Decision 4: Regla de grupos sin cambiar categorías persistidas

**Decision**: Normalizar de forma insensible a mayúsculas y acentos el `Tipo`; si contiene “bata”, pertenece al grupo `batas`; todos los demás tipos pertenecen a `uniformes`.

**Rationale**: El catálogo conserva muchos tipos detallados y la nueva navegación necesita solo dos decisiones comprensibles. Esta regla incluye conjuntos y prendas complementarias bajo “Uniformes” y evita ocultar productos que no encajen en una lista manual incompleta.

**Alternatives considered**:

- Mantener una lista cerrada de tipos: podría dejar fuera tipos migrados nuevos o con variantes de escritura.
- Cambiar las categorías en PostgreSQL: no se necesita para una agrupación de navegación y arriesga la integridad de los datos heredados.

## Decision 5: Productos unisex compatibles con ambas elecciones principales

**Decision**: Un producto `Unisex` coincide cuando el visitante selecciona `Dama` o `Caballero`; no se añade una tercera opción principal al primer paso.

**Rationale**: La especificación prioriza dos botones sencillos y la constitución exige no ocultar inventario compatible. La regla hace visible unisex sin agregar otra decisión al recorrido.

**Alternatives considered**:

- Mostrar `Unisex` como tercer botón: representa mejor el valor almacenado, pero añade una opción al primer paso y puede hacer más lenta la decisión principal.
- Excluir unisex de Dama/Caballero: simplifica el predicado, pero ocultaría productos válidos.

## Decision 6: Historial de pasos con el historial del navegador

**Decision**: Cada avance significativo actualizará el estado visual y una entrada del historial del navegador; `popstate` restaurará las decisiones asociadas al paso anterior. “Reiniciar” limpiará el estado y devolverá al primer paso.

**Rationale**: La especificación exige que el botón Atrás conserve decisiones aplicables, sin persistir preferencias ni crear cuentas. El historial local resuelve esa necesidad durante la visita.

**Alternatives considered**:

- Guardar solo variables en memoria: no soporta el botón Atrás del dispositivo.
- Persistir en `localStorage`: sobreviviría más allá de la visita y no es necesario para una selección temporal.

## Decision 7: Verificación en dos niveles

**Decision**: Añadir pruebas unitarias para las reglas puras y ampliar la prueba E2E pública para el recorrido en un proyecto móvil de Playwright, además de mantener `astro check`, `test` y `build`.

**Rationale**: Las reglas de disponibilidad y compatibilidad son críticas para no mostrar inventario engañoso; el layout, el orden de pasos y los controles táctiles solo pueden validarse en navegador.

**Alternatives considered**:

- Probar únicamente con E2E: sería más lento y dejaría casos límite de filtrado difíciles de diagnosticar.
- Probar únicamente funciones unitarias: no comprobaría accesibilidad, historial, estados visuales ni integración con acciones existentes.
