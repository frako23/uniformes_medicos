<!--
## Sync Impact Report
- Version change: sin versión previa → 1.0.0 (primera constitución del proyecto).
- Principios incorporados: inventario confiable; compra sencilla; diseño accesible;
  rendimiento y resiliencia; seguridad y calidad.
- Secciones añadidas: Restricciones de producto y plataforma; Flujo de desarrollo
  y puertas de calidad.
- Secciones eliminadas: ninguna.
- TODO pendiente: confirmar la fecha original de ratificación.
-->

# Constitución de Uniformes Médicos

## Core Principles

### I. Catálogo completo y fuente de verdad

La vitrina DEBE presentar todo el inventario publicado y disponible desde la
base de datos oficial del proyecto, PostgreSQL. Cada producto DEBE mostrar la
información disponible necesaria para evaluarlo y seleccionarlo, como nombre,
fotografías, categoría, género, variantes y existencia. Los filtros y la
navegación NO DEBEN ocultar productos que coincidan con la selección del
visitante. La interfaz NO DEBE inventar datos ni mostrar como disponible un
producto marcado como agotado o inactivo. Los estados de carga, catálogo vacío y
error DEBEN ser claros y permitir una respuesta útil.

Razón: la confianza en el inventario permite que el visitante decida qué comprar
con información fiel a la gestión del negocio.

### II. Compra simple y orientada a la conversión

La navegación DEBE conducir al visitante desde el catálogo hasta la preparación
del pedido con el menor número razonable de pasos. Categorías, filtros,
favoritos, detalle del producto y acción de compra DEBEN ser fáciles de
encontrar y mantener un comportamiento consistente. Cada vista de compra DEBE
presentar una acción principal clara y una forma visible de revisar la selección.
El pedido preparado para WhatsApp DEBE corresponder a los productos que el
visitante seleccionó y mostrar un resumen legible antes de enviarse.

Razón: un flujo directo ayuda a encontrar el uniforme adecuado y completar el
contacto de venta sin fricción innecesaria.

### III. Diseño visual claro, atractivo y accesible

El diseño DEBE priorizar fotografías de producto, jerarquía visual, legibilidad
y consistencia de marca. La interfaz DEBE funcionar en teléfonos, tabletas y
escritorio; ofrecer texto alternativo para imágenes relevantes; permitir el uso
por teclado con foco visible; y mantener contraste legible y controles táctiles
identificables. Las decisiones estéticas NO DEBEN ocultar información del
producto, disponibilidad, filtros ni acciones de compra o administración.

Razón: una vitrina atractiva comunica calidad, y una interfaz clara permite que
las personas encuentren y comparen los productos.

### IV. Rendimiento y resiliencia

Las páginas DEBEN cargar primero el contenido y las acciones esenciales del
catálogo. Las imágenes DEBEN servirse en formatos y tamaños apropiados para el
dispositivo, y los recursos no esenciales NO DEBEN bloquear la interacción
inicial. La interfaz DEBE manejar fallos de conexión, ausencia de resultados,
productos inexistentes y errores del servidor sin quedar en blanco ni mostrar
mensajes técnicos al visitante. Un fallo de un servicio externo NO DEBE exponer
secretos ni inutilizar las partes de la aplicación que aún puedan responder.

Razón: los visitantes acceden desde dispositivos y conexiones diversos, y deben
poder consultar la vitrina de forma fiable.

### V. Seguridad, calidad y evolución responsable

El panel de administración DEBE ser accesible exclusivamente a la propietaria
autorizada. Cada página, acción y API administrativa DEBE exigir autenticación y
verificar autorización en el servidor; ocultar un enlace o una ruta en la
interfaz NO constituye control de acceso. El sistema NO DEBE permitir registro
público de administradores. Las credenciales, tokens y demás secretos DEBEN
permanecer protegidos en el servidor y fuera del control de versiones.

Los cambios que afecten productos, variantes o existencias DEBEN conservar la
integridad del inventario. Las rutas críticas de catálogo, autenticación,
gestión de productos y existencias, y preparación de pedidos DEBEN verificarse
antes de publicarse. La complejidad añadida DEBE responder a una necesidad
concreta del negocio y quedar documentada.

Razón: el acceso privado al panel protege la gestión del negocio, mientras que
la validación de cambios mantiene la coherencia entre inventario y vitrina.

## Restricciones de producto y plataforma

- PostgreSQL DEBE ser la fuente de verdad para productos, variantes y existencias.
  Strapi dejará de ser el backend de catálogo al completarse la migración.
- El backend propio DEBE poder ejecutarse localmente durante el desarrollo y
  desplegarse en producción con configuración y credenciales independientes por
  entorno. Ningún entorno DEBE usar accidentalmente los datos o secretos de otro.
- Los cambios de esquema de PostgreSQL DEBEN gestionarse mediante migraciones
  versionadas y aplicables de forma controlada en desarrollo y producción.
- La migración desde Strapi DEBE validar los registros y relaciones transferidos,
  incluyendo los datos necesarios para productos, variantes, categorías e
  imágenes. Antes de retirar la fuente anterior, DEBE comprobarse que los datos
  esperados estén disponibles en la nueva fuente.
- El panel privado DEBE permitir a la propietaria cargar y actualizar productos
  y gestionar existencias. DEBE comunicar el resultado de cada operación y
  reflejar los cambios en la vitrina sin depender de editar código fuente.
- El panel NO DEBE procesar pagos ni confirmar ventas mientras el negocio no
  disponga de un flujo de pago y confirmación definido.
- La aplicación DEBE conservar Astro con TypeScript y las tecnologías de
  presentación vigentes mientras cubran las necesidades del producto. Las
  decisiones técnicas del backend propio que aún no estén fijadas se tomarán en
  la especificación de implementación.

## Flujo de desarrollo y puertas de calidad

1. Cada cambio DEBE describir el comportamiento visible para visitantes o
   administradora, incluyendo los estados de éxito, carga, vacío y error que
   correspondan.
2. Todo cambio en productos o existencias DEBE validar los datos recibidos y
   confirmar que las actualizaciones no dejan el catálogo en un estado parcial o
   incoherente.
3. Los cambios del panel DEBEN comprobar autenticación y autorización del lado
   servidor, además de verificar que una sesión no autorizada no pueda leer ni
   modificar datos administrativos.
4. Antes de integrar cambios de catálogo o compra, DEBE revisarse la experiencia
   en móvil y escritorio, el uso por teclado y el comportamiento ante datos
   incompletos o fallos de conexión.
5. Antes de publicar la migración, DEBE compararse la información transferida
   con la fuente de origen y comprobarse la consulta del catálogo desde
   PostgreSQL.
6. Toda excepción a esta constitución DEBE documentar el motivo, el riesgo
   aceptado, la persona responsable y la fecha de revisión.
7. La publicación DEBE detenerse si se muestran existencias engañosas, si el
   acceso al panel no está protegido o si un secreto queda expuesto.

## Governance

Esta constitución establece las reglas de producto y calidad del proyecto y
prevalece sobre prácticas locales que entren en conflicto con ellas. Cada
revisión de funcionalidades DEBE comprobar el cumplimiento de los principios y
de las puertas de calidad aplicables.

Las enmiendas requieren describir el motivo, el impacto esperado y los
principios afectados; si la modificación afecta sistemas o datos existentes,
también requieren un plan de migración. La persona responsable del proyecto
DEBE aprobar cada enmienda antes de adoptarla.

La versión sigue SemVer: MAJOR para eliminar o redefinir de forma incompatible
una regla; MINOR para añadir un principio o ampliar materialmente la gobernanza;
PATCH para aclaraciones sin cambio semántico. La fecha de última enmienda se
actualiza en cada cambio aceptado. La fecha de ratificación inicial DEBE
confirmarse cuando la constitución sea adoptada formalmente.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): confirmar fecha de adopción | **Last Amended**: 2026-10-01
