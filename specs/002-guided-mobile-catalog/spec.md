# Feature Specification: Navegación guiada del catálogo móvil

**Feature Branch**: `002-guided-mobile-catalog`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: "Deseo modificar la manera como los usuarios interactúan con la app. Actualmente tiene una visual tipo Instagram, pero creo que los usuarios se pierden con tantas opciones. Me gustaría una visual con botones en los que, de manera sencilla, los usuarios puedan elegir si quieren ver ropa de damas o de caballeros, que les pregunte qué tallas quieren ver y que luego les pregunte si quieren ver uniformes o batas; en cada interacción debe ir filtrando. La aplicación es 100% usada en celulares, así que la interacción con móviles es vital."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar prendas mediante una selección guiada (Priority: P1)

Como visitante que consulta el catálogo desde un celular, quiero elegir primero el género, luego una o varias tallas y finalmente el tipo de prenda, para llegar rápidamente a una lista de productos relevantes sin enfrentar todos los filtros al mismo tiempo.

**Why this priority**: Es el cambio principal solicitado y reduce la sobrecarga de opciones que actualmente hace que los visitantes se pierdan.

**Independent Test**: En un celular o viewport estrecho, una persona que visita el catálogo por primera vez puede seleccionar género, talla y tipo de prenda, y obtiene una lista que corresponde a esas decisiones sin necesitar conocer los nombres internos de las categorías.

**Acceptance Scenarios**:

1. **Given** que el visitante abre el catálogo sin una selección activa, **When** comienza la navegación, **Then** ve una primera pregunta clara con botones principales para “Damas” y “Caballeros”, además de un indicador de que está en el primer paso.
2. **Given** que el visitante eligió “Damas” o “Caballeros”, **When** avanza, **Then** ve únicamente las tallas con existencias positivas disponibles para esa elección de género, incluyendo productos unisex compatibles.
3. **Given** que el visitante está en la selección de tallas, **When** marca una o varias tallas y continúa, **Then** el siguiente paso le pregunta si desea ver “Uniformes” o “Batas”.
4. **Given** que el visitante eligió género, una o varias tallas y tipo de prenda, **When** llega al resultado, **Then** solo se muestran productos publicados, activos y disponibles que coincidan con el género, el tipo de prenda y al menos una de las tallas elegidas.

---

### User Story 2 - Corregir o ampliar la búsqueda sin empezar de nuevo (Priority: P1)

Como visitante, quiero revisar y cambiar cualquiera de mis respuestas, quitar la restricción de talla o reiniciar la selección, para recuperar resultados sin repetir innecesariamente todo el recorrido.

**Why this priority**: Un filtro progresivo solo es útil si el visitante puede recuperarse fácilmente de una elección demasiado específica o equivocada.

**Independent Test**: Después de obtener resultados, el visitante puede volver a un paso anterior, modificarlo y comprobar que los resultados se actualizan conservando las demás decisiones válidas.

**Acceptance Scenarios**:

1. **Given** que el visitante está viendo resultados filtrados, **When** pulsa el control para cambiar género, talla o tipo de prenda, **Then** regresa a ese paso con su selección visible y puede continuar desde allí.
2. **Given** que el visitante seleccionó tallas específicas, **When** elige “Cualquier talla” o quita todas las tallas, **Then** se muestran productos compatibles con el género y el tipo de prenda sin restringir por talla.
3. **Given** que el visitante desea empezar otra búsqueda, **When** pulsa “Reiniciar selección”, **Then** se eliminan las decisiones temporales y vuelve a la pregunta inicial.
4. **Given** que el visitante usa el botón Atrás del navegador o del dispositivo, **When** vuelve a un paso anterior, **Then** las decisiones que todavía aplican se conservan y la pantalla refleja el paso correspondiente.

---

### User Story 3 - Explorar resultados cómodamente desde el celular (Priority: P2)

Como visitante móvil, quiero entender en qué paso estoy, qué filtros están activos y qué puedo hacer con cada producto, para explorar y preparar un pedido sin controles pequeños ni información confusa.

**Why this priority**: La aplicación se usa principalmente en celulares; la claridad táctil y la legibilidad son necesarias para que el nuevo recorrido convierta en una consulta o pedido.

**Independent Test**: En un teléfono de tamaño pequeño, una persona puede completar el recorrido, leer el resumen de filtros, abrir un producto y usar sus acciones principales sin desplazamiento horizontal ni controles difíciles de tocar.

**Acceptance Scenarios**:

1. **Given** que el visitante está en cualquier paso del recorrido, **When** mira la pantalla, **Then** identifica la pregunta actual, el avance, la acción principal y una forma visible de volver o cambiar la selección.
2. **Given** que existen resultados, **When** el visitante los consulta, **Then** cada tarjeta conserva fotografía, nombre o tipo, precio, tallas disponibles relevantes y las acciones existentes para ver el detalle, guardar o preparar el contacto.
3. **Given** que una combinación no encuentra productos, **When** se muestran los resultados, **Then** aparece un mensaje específico y acciones para cambiar la última respuesta, quitar la talla o reiniciar, sin presentar productos que no cumplan la selección.
4. **Given** que el catálogo está cargando o no puede responder, **When** el visitante espera o encuentra un fallo, **Then** ve un estado comprensible y una opción para reintentar, sin una pantalla en blanco ni mensajes técnicos.

### Edge Cases

- Si el visitante no desea restringir por talla, puede continuar con “Cualquier talla”; no se le obliga a escoger una talla concreta.
- Si una talla elegida tiene existencias en un producto pero otra talla elegida no, el producto aparece solo si tiene existencias positivas en al menos una talla seleccionada y muestra claramente las tallas que sí están disponibles.
- Los productos `Unisex` se consideran compatibles con “Damas” y “Caballeros” y no se muestran como incompatibles por pertenecer a un género distinto.
- “Batas” agrupa los tipos de producto identificados como bata; “Uniformes” agrupa los demás tipos existentes, incluidos conjuntos y prendas complementarias, para no ocultar inventario válido.
- Si una combinación no tiene resultados, el visitante puede ampliar la búsqueda sin perder el acceso al catálogo completo.
- Si no existen tallas disponibles para el género elegido, se informa la situación y se permite volver a cambiar de género o ver todo el catálogo.
- Si un producto deja de estar publicado, activo o disponible entre la selección y la consulta, no se muestra como resultado disponible.
- Si el catálogo no tiene ningún producto disponible, se presenta el estado vacío general y se mantiene una vía de contacto alternativa.
- Los textos extensos de tipos, marcas o tallas no deben romper el diseño ni generar desplazamiento horizontal en teléfonos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El catálogo DEBE iniciar la navegación pública con un recorrido guiado de pasos, mostrando primero la elección entre “Damas” y “Caballeros” mediante botones principales y evitando presentar todos los filtros simultáneamente.
- **FR-002**: Cada paso DEBE mostrar una sola pregunta principal, un indicador de progreso, una acción primaria clara y controles visibles para volver o reiniciar.
- **FR-003**: Después de elegir el género, el catálogo DEBE mostrar como opciones de talla únicamente las etiquetas que tengan existencias positivas en al menos un producto publicado y activo compatible con el género elegido.
- **FR-004**: El paso de tallas DEBE permitir seleccionar varias tallas y DEBE ofrecer una opción explícita de continuar sin filtrar por talla, identificada como “Cualquier talla” o equivalente.
- **FR-005**: Después de la selección de tallas, el catálogo DEBE preguntar mediante dos opciones principales si el visitante desea ver “Uniformes” o “Batas”.
- **FR-006**: El filtrado DEBE actualizarse de forma progresiva al completar cada paso y DEBE considerar compatibles los productos `Unisex` con las selecciones “Damas” y “Caballeros”.
- **FR-007**: La clasificación de alto nivel DEBE incluir como “Batas” los tipos identificados como bata y como “Uniformes” todos los demás tipos existentes, sin eliminar productos válidos del catálogo.
- **FR-008**: Un producto solo DEBE aparecer como disponible si está publicado, activo y tiene existencias positivas; cuando se seleccionen tallas, debe coincidir con al menos una talla seleccionada y mostrar las tallas disponibles de forma veraz.
- **FR-009**: La pantalla de resultados DEBE mostrar un resumen legible de género, tallas y tipo de prenda activos, y DEBE permitir cambiar cada selección sin reiniciar las demás decisiones que sigan siendo válidas.
- **FR-010**: El visitante DEBE poder reiniciar toda la selección y acceder a una alternativa secundaria para ver el catálogo completo, de manera que el recorrido guiado no impida explorar productos fuera de una combinación concreta.
- **FR-011**: Cada estado sin resultados DEBE explicar que la combinación no encontró productos y ofrecer como mínimo cambiar la última respuesta, quitar la restricción de talla o reiniciar la selección.
- **FR-012**: El recorrido y los resultados DEBEN conservar las acciones públicas existentes de detalle de producto, favoritos o bolsa y preparación del pedido por WhatsApp cuando correspondan al producto mostrado.
- **FR-013**: La experiencia DEBE estar optimizada para teléfonos: botones y controles táctiles identificables, áreas de toque de al menos 44 píxeles, texto legible, una sola columna cuando el ancho sea estrecho y ningún desplazamiento horizontal requerido.
- **FR-014**: Todas las preguntas, botones, estados de selección, mensajes de carga, estados vacíos y errores DEBEN ser comprensibles con teclado, tener foco visible, contraste legible y etiquetas accesibles; las fotografías relevantes DEBEN conservar texto alternativo.
- **FR-015**: Los estados de carga, error y catálogo vacío DEBEN permitir una respuesta útil, como reintentar, volver a una selección anterior, reiniciar o contactar al negocio, sin exponer mensajes técnicos.

### Key Entities

- **Selección guiada**: Decisiones temporales del visitante durante la consulta: género, conjunto de tallas, tipo de prenda y estado del recorrido; no requiere una cuenta ni guardarse como dato permanente.
- **Producto**: Prenda publicada del catálogo con tipo, género, fotografía, precio y acciones de consulta o pedido.
- **Variante o talla**: Etiqueta de talla asociada a un producto y su cantidad actual disponible; determina qué opciones de talla y resultados pueden mostrarse.
- **Grupo de prenda**: Clasificación de navegación que presenta los tipos detallados existentes bajo “Uniformes” o “Batas” sin sustituir la información original del producto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al menos el 90% de visitantes móviles de prueba que no conocen el catálogo puede llegar a una lista de resultados en menos de 60 segundos y sin asistencia.
- **SC-002**: Al menos el 95% de visitantes de prueba puede identificar en todo momento el paso actual, las selecciones activas y la acción necesaria para continuar.
- **SC-003**: En pruebas con datos representativos, el 100% de los productos mostrados en resultados cumple el género compatible, el tipo de prenda elegido y la regla de disponibilidad; ningún producto agotado aparece como disponible.
- **SC-004**: El 90% de las búsquedas de prueba con resultados muestra la primera tarjeta utilizable sin desplazamiento horizontal y con controles táctiles operables desde un teléfono de 320 píxeles de ancho.
- **SC-005**: En al menos el 90% de las pruebas sin resultados, el visitante puede ampliar o reiniciar la búsqueda en una sola acción claramente visible.
- **SC-006**: Las acciones existentes de abrir el detalle, guardar en la bolsa o preparar un pedido por WhatsApp siguen disponibles para el 100% de los productos válidos mostrados por el nuevo recorrido.

## Assumptions

- Las opciones visibles principales serán “Damas” y “Caballeros”; los productos `Unisex` se incluirán en ambas selecciones para evitar ocultar inventario compatible.
- Las tallas se tomarán de las variantes disponibles actualmente y se conservarán sus etiquetas originales, aunque no sigan una lista fija como XS, S, M o L.
- “Cualquier talla” será la opción predeterminada o de salida para visitantes que no quieran restringir la búsqueda.
- La agrupación “Batas” se determinará a partir de los tipos de producto que representan batas; todos los demás tipos actuales quedarán bajo “Uniformes” para mantener el catálogo completo.
- La selección solo dura durante la navegación actual; no se crea una cuenta ni se almacenan preferencias personales.
- El acceso secundario a “Ver todo” existe para visitantes que prefieren explorar libremente o no encuentran una combinación adecuada.
- La información de productos, variantes, existencias, fotografías y acciones de pedido ya existe en el catálogo público y no forma parte de esta especificación crear un nuevo inventario.
- La prioridad de diseño es el teléfono, pero el mismo recorrido debe seguir siendo usable en tabletas y escritorio.
- No se incorporan pagos, ventas confirmadas ni registro de usuarios como parte de este cambio.
