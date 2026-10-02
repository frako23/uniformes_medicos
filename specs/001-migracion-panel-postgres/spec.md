# Feature Specification: Migración a panel propio y PostgreSQL

**Feature Branch**: `001-migracion-panel-postgres`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Migrar el catálogo que actualmente usa Strapi a un panel de administración propio dentro de la aplicación, con PostgreSQL como fuente de datos, importar todos los productos e imágenes, conservar identificadores y URLs, y retirar Strapi. El panel será para una única administradora propietaria y mantendrá el flujo actual de preparación de pedidos por WhatsApp, sin pagos ni funcionalidades adicionales en esta fase."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrar el catálogo e inventario (Priority: P1)

Como propietaria de Uniformes Médicos 2015, quiero acceder a un panel privado para consultar y actualizar la información completa de los productos, sus imágenes, variantes y existencias, de modo que pueda mantener la vitrina sin editar código fuente.

**Why this priority**: Es la capacidad principal que reemplaza la gestión que actualmente realiza Strapi y permite operar el negocio después de la migración.

**Independent Test**: Con la cuenta de la propietaria se puede iniciar sesión, crear o editar un producto, actualizar existencias por talla, guardar el cambio y comprobarlo en la vitrina pública.

**Acceptance Scenarios**:

1. **Given** que no existe una sesión administrativa, **When** una persona intenta abrir el panel o ejecutar una acción administrativa, **Then** se le solicita autenticación y no puede consultar ni modificar datos administrativos.
2. **Given** que la propietaria inició sesión, **When** abre un producto, **Then** puede consultar y editar nombre/tipo, fabricante, marca, género, precio, SKU, color, imágenes, tallas y cantidad disponible.
3. **Given** que la propietaria introduce una cantidad de stock negativa, un precio inválido o deja incompletos datos obligatorios, **When** intenta guardar, **Then** el sistema rechaza la operación, explica el problema y conserva los datos anteriores.
4. **Given** que la propietaria guarda correctamente un cambio, **When** visita la vitrina o el detalle del producto, **Then** observa la información actualizada sin editar el código fuente.
5. **Given** que la propietaria marca un producto como inactivo o no disponible, **When** una persona visitante consulta la vitrina, **Then** el producto no aparece como disponible para selección o pedido.

### User Story 2 - Migrar el catálogo y sus imágenes desde Strapi (Priority: P1)

Como propietaria, quiero importar todos los productos, relaciones, existencias e imágenes actuales desde Strapi a la nueva fuente de datos y almacenamiento, para retirar Strapi sin perder información ni referencias públicas.

**Why this priority**: La continuidad del inventario y la posibilidad de eliminar Strapi son condiciones esenciales para completar la migración.

**Independent Test**: Se ejecuta una migración sobre una copia o entorno de preparación, se obtiene un informe de registros y medios esperados/importados/no importados, se corrigen las incidencias y se verifica que el catálogo migrado coincide con la fuente de origen antes del cambio definitivo.

**Acceptance Scenarios**:

1. **Given** que Strapi contiene productos con fabricantes, marcas, categorías/tipos, género, precios, SKU, colores, tallas, existencias y fotografías, **When** se ejecuta la migración, **Then** esos datos quedan disponibles en PostgreSQL y las fotografías quedan disponibles en el nuevo almacenamiento.
2. **Given** que un producto tiene varias imágenes o variantes, **When** se importa, **Then** se conservan todas las relaciones, el orden de las imágenes y las cantidades de cada talla.
3. **Given** que un registro o imagen no puede importarse, **When** finaliza la migración, **Then** el sistema lo identifica en un informe con el motivo y no permite declarar la migración lista para retirar Strapi mientras queden incidencias obligatorias sin resolver.
4. **Given** que la importación fue validada, **When** se consulta un producto mediante su identificador o URL pública existente, **Then** se obtiene el producto correspondiente desde la nueva fuente y sus imágenes cargan desde el nuevo almacenamiento.
5. **Given** que la migración validada está lista para el cambio definitivo, **When** se desactiva Strapi, **Then** la vitrina, el detalle de producto, la bolsa y la preparación del mensaje de WhatsApp continúan funcionando sin depender de Strapi.

### User Story 3 - Consultar el catálogo y preparar un pedido (Priority: P1)

Como visitante, quiero seguir explorando el catálogo, filtrando productos, revisando tallas y existencias, guardando favoritos y preparando un pedido para WhatsApp como lo hago actualmente, sin notar una pérdida de información durante la migración.

**Why this priority**: El valor público de la aplicación debe mantenerse mientras cambia la gestión interna y la fuente de datos.

**Independent Test**: Una persona visitante puede abrir el catálogo, consultar un detalle, seleccionar productos disponibles, revisar la bolsa y generar un mensaje de WhatsApp que coincida con su selección.

**Acceptance Scenarios**:

1. **Given** que la nueva fuente contiene productos publicados y disponibles, **When** una persona visita el catálogo, **Then** puede verlos, filtrarlos por las opciones existentes y abrir sus detalles con información e imágenes correctas.
2. **Given** que un producto o talla no tiene existencias, **When** se muestra en la vitrina, **Then** su estado se comunica claramente y no se presenta como disponible para compra.
3. **Given** que una persona tiene productos guardados en su bolsa, **When** abre la bolsa después de la migración, **Then** los productos que siguen existiendo se muestran con su información actual y los productos inexistentes se manejan con un mensaje útil, sin romper la página.
4. **Given** que la persona revisó su selección, **When** elige preparar el pedido, **Then** el mensaje de WhatsApp contiene exactamente los productos seleccionados y sus datos visibles relevantes.
5. **Given** que la base de datos, el almacenamiento de imágenes o una consulta pública falla temporalmente, **When** la persona visita la aplicación, **Then** recibe un estado de error comprensible y la interfaz no queda en blanco ni muestra secretos o mensajes técnicos.

### Edge Cases

- Un producto de Strapi tiene un identificador duplicado, datos obligatorios ausentes o una relación inválida.
- Una fotografía tiene un formato no soportado, está repetida, no responde o no puede copiarse al nuevo almacenamiento.
- Una talla tiene una cantidad nula, negativa, no numérica o inconsistente con el estado de disponibilidad del producto.
- Un producto fue eliminado o desactivado después de que una persona lo guardó en favoritos.
- La migración se interrumpe a mitad del proceso o se ejecuta dos veces.
- Una persona no autenticada intenta acceder directamente a una ruta, acción o interfaz administrativa.
- La sesión de la propietaria caduca mientras guarda cambios.
- PostgreSQL o el almacenamiento de imágenes no están disponibles durante una consulta o actualización.
- Una URL pública existente contiene un identificador de producto que ya no está publicado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir el acceso administrativo únicamente a la propietaria autorizada mediante una cuenta privada; NO DEBE ofrecer registro público de administradores.
- **FR-002**: Cada página, acción y operación de datos del panel DEBE autenticar la sesión y verificar la autorización en el servidor; ocultar un enlace o una ruta en la interfaz NO DEBE considerarse control de acceso.
- **FR-003**: El panel DEBE permitir consultar, crear, editar, desactivar y reactivar productos sin editar código fuente.
- **FR-004**: El panel DEBE conservar y gestionar como mínimo toda la información que utiliza actualmente el catálogo: tipo/categoría, fabricante, marca, género, precio, SKU, color, estado de publicación/disponibilidad, fechas relevantes, fotografías, tallas y existencias por talla.
- **FR-005**: El panel DEBE permitir cargar, reemplazar, ordenar y retirar las imágenes asociadas a un producto, incluyendo la información descriptiva necesaria para mostrarlas accesiblemente.
- **FR-006**: El sistema DEBE validar los datos obligatorios, los formatos de precio y las cantidades de existencias antes de guardar, y DEBE rechazar operaciones que dejarían el inventario en un estado inválido o parcial.
- **FR-007**: PostgreSQL DEBE ser la fuente de verdad para productos, variantes, categorías/tipos y existencias una vez completado el cambio definitivo.
- **FR-008**: La migración DEBE importar todos los productos actuales de Strapi con sus campos, relaciones, variantes, existencias y estado de publicación, conservando sus identificadores originales o una correspondencia verificable con ellos.
- **FR-009**: La migración DEBE copiar todas las imágenes utilizadas por los productos a un nuevo almacenamiento administrable por la aplicación y DEBE asociar cada copia con el producto y el orden correspondientes.
- **FR-010**: El sistema DEBE conservar las URLs públicas existentes de los productos y sus identificadores; cualquier referencia pública a imágenes que deba continuar funcionando DEBE resolverse sin depender de Strapi después del retiro.
- **FR-011**: La migración DEBE producir un informe de comparación que permita verificar cantidades, identificadores, relaciones, existencias e imágenes esperadas frente a las importadas, incluyendo errores y registros pendientes.
- **FR-012**: El sistema NO DEBE permitir retirar Strapi como fuente activa hasta que los datos obligatorios y las imágenes esperadas hayan sido validados en la nueva fuente.
- **FR-013**: La vitrina pública DEBE leer productos, variantes, existencias e imágenes desde la nueva fuente y DEBE conservar las capacidades actuales de catálogo, filtros, detalle, favoritos, bolsa y preparación de pedidos por WhatsApp.
- **FR-014**: La vitrina DEBE ocultar o marcar claramente como no disponibles los productos y tallas que estén inactivos, agotados o no publicados; NO DEBE inventar datos ni presentar existencias engañosas.
- **FR-015**: El mensaje preparado para WhatsApp DEBE corresponder exactamente con los productos que la persona seleccionó y debe seguir siendo posible sin procesar pagos ni confirmar ventas.
- **FR-016**: El sistema DEBE mostrar estados comprensibles de carga, vacío, éxito y error para las operaciones administrativas y las consultas públicas relevantes, sin exponer credenciales, tokens ni detalles técnicos sensibles.
- **FR-017**: Los cambios de esquema y configuración de PostgreSQL DEBEN poder reproducirse de forma controlada en los entornos de desarrollo y producción, manteniendo los datos y secretos separados por entorno.
- **FR-018**: La eliminación o desactivación de un producto DEBE preservar la integridad de la bolsa, los favoritos y las URLs públicas, mostrando una respuesta útil cuando el producto ya no esté disponible.
- **FR-019**: La primera versión DEBE limitarse a la gestión del catálogo, imágenes, variantes y existencias, autenticación de la propietaria y migración desde Strapi; pagos, pedidos confirmados, clientes, reportes avanzados y otros módulos de negocio quedan fuera de alcance.

### Key Entities *(include if feature involves data)*

- **Producto**: Prenda publicada en la vitrina, con identificador estable, tipo/categoría, fabricante, marca, género, precio, SKU, color, estado, fechas y relación con imágenes y variantes.
- **Variante o talla**: Opción de talla de un producto con su identificador, etiqueta y cantidad actual disponible.
- **Imagen de producto**: Archivo visual asociado a un producto, con URL del nuevo almacenamiento, orden, dimensiones y texto alternativo u otra información descriptiva.
- **Categoría o tipo**: Clasificación utilizada para organizar y filtrar los productos, conservando la correspondencia con los datos actuales.
- **Cuenta de propietaria**: Única identidad autorizada para acceder al panel y gestionar el catálogo; no representa una cuenta de cliente.
- **Registro de migración**: Resultado de una ejecución de importación, con cantidades esperadas/importadas, correspondencias, incidencias y estado de validación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Antes de retirar Strapi, el 100% de los productos, variantes, existencias, categorías/tipos e identificadores considerados obligatorios en el origen aparecen en la nueva fuente o están documentados explícitamente como excepciones aprobadas.
- **SC-002**: Antes del cambio definitivo, el 100% de las imágenes referenciadas por productos publicados se puede abrir desde el nuevo almacenamiento y ninguna página pública depende de una respuesta de Strapi.
- **SC-003**: La propietaria puede iniciar sesión, editar un producto, actualizar stock por talla y comprobar el resultado público en menos de 5 minutos en una operación normal.
- **SC-004**: El 100% de las rutas y acciones administrativas probadas rechaza solicitudes sin una sesión autorizada; no existe registro público de administradores.
- **SC-005**: Al menos el 95% de las consultas normales de catálogo y detalle muestran su contenido esencial en menos de 3 segundos bajo la carga esperada del negocio.
- **SC-006**: En una prueba de regresión, el 100% de las URLs públicas de productos seleccionadas para la migración conserva el producto correspondiente o muestra una respuesta controlada para un producto que ya no está disponible.
- **SC-007**: En el 100% de las pruebas de preparación de pedidos, el mensaje de WhatsApp contiene exactamente los productos seleccionados por la persona y no incluye productos eliminados sin advertencia.
- **SC-008**: La comparación de migración no deja errores obligatorios sin resolver y permite eliminar las credenciales, consultas y dependencia operativa de Strapi después de la aprobación del cambio.

## Assumptions

- La cuenta administrativa será una única cuenta de propietaria; no se requiere registro público, múltiples roles ni cuentas de clientes en esta fase.
- Se conservará la experiencia pública actual del catálogo y la preparación del pedido por WhatsApp, salvo los cambios necesarios para leer desde la nueva fuente.
- PostgreSQL y el almacenamiento de imágenes se provisionarán como parte de la implementación posterior; sus proveedores concretos se decidirán durante la planificación técnica.
- La propietaria proporcionará acceso suficiente a Strapi para realizar una exportación o migración completa antes de eliminarlo.
- Los identificadores estables y las URLs públicas se refieren principalmente a las rutas de detalle del producto; las referencias de archivos multimedia deberán quedar resueltas por el nuevo almacenamiento sin depender de Strapi.
- La migración se validará primero en un entorno de preparación y tendrá una ventana de cambio que permita comparar la nueva fuente con Strapi antes del retiro definitivo.
- No se procesarán pagos, no se confirmarán ventas y no se almacenarán pedidos como parte de esta especificación.
