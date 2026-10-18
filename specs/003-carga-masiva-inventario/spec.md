# Feature Specification: Carga y edición masiva de inventario con plantilla de Excel

**Feature Branch**: `003-carga-masiva-inventario`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "quiero en el panel administrador porder hacer carga masiva de inventario y edicion masiva de inventario, la funcionalidad debe permitir descargar un template de excel para llenar la informacion en el archivo, subirlo y poder hacer la carga masiva"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Actualizar el inventario existente desde un archivo de Excel (Priority: P1)

Como propietaria de Uniformes Médicos 2015, quiero descargar mi inventario actual en un archivo de Excel, modificar en él las existencias, precios y demás datos de muchos productos a la vez y subirlo al panel, para aplicar todos los cambios en una sola operación sin abrir cada producto por separado.

**Why this priority**: Mantener las existencias al día es la tarea de inventario más frecuente y de ella depende que la vitrina muestre una disponibilidad fiel; hoy exige editar los productos uno por uno.

**Independent Test**: Con productos ya registrados, la propietaria descarga el inventario, cambia en el archivo las cantidades de varias tallas y el precio de un producto, lo sube, revisa en la vista previa los valores actuales y nuevos, confirma y comprueba los cambios en el panel y en la vitrina.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión y existen productos, **When** descarga el inventario actual, **Then** obtiene un archivo de Excel con una fila por producto —publicado o no, activo o inactivo— con sus datos editables, una columna por cada talla con la existencia actual, el identificador de cada producto marcado como dato que no debe modificarse y la fecha y hora de generación.
2. **Given** que modificó existencias, precios u otros datos en el archivo descargado, **When** lo sube, **Then** ve, antes de que se guarde ningún cambio, una vista previa con el valor actual y el nuevo de cada dato o existencia que cambiará y el número de productos sin cambios.
3. **Given** que la vista previa no contiene errores, **When** la propietaria confirma, **Then** todos los cambios se aplican en una sola operación, las cantidades del archivo pasan a ser las nuevas existencias, se muestra un resumen del resultado y el panel y la vitrina reflejan los nuevos datos y la disponibilidad correspondiente.
4. **Given** que escribió una cantidad para un producto existente en una columna de talla que ese producto no tenía —de la plantilla o agregada como columna nueva—, **When** confirma la carga, **Then** la talla queda creada con la cantidad indicada y las demás tallas del producto se conservan.
5. **Given** que la propietaria está revisando la vista previa, **When** cancela la operación, **Then** no se modifica ningún producto, talla ni existencia.

---

### User Story 2 - Dar de alta productos nuevos en bloque con la plantilla (Priority: P1)

Como propietaria, quiero descargar una plantilla de Excel vacía con instrucciones, registrar en ella varios productos nuevos —uno por fila, con la cantidad de cada talla— y subirla, para crearlos todos a la vez en lugar de usar el formulario de producto uno por uno.

**Why this priority**: Es la carga masiva solicitada: permite incorporar mercancía nueva —por ejemplo, un pedido completo de un fabricante— en minutos.

**Independent Test**: La propietaria descarga la plantilla vacía, registra tres productos nuevos con sus cantidades por talla, la sube, revisa la vista previa, confirma y encuentra los tres productos en el panel con sus datos, tallas y existencias.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión, **When** descarga la plantilla vacía, **Then** obtiene un archivo de Excel con instrucciones de llenado, las columnas esperadas con su formato y obligatoriedad, los valores permitidos para género, publicación y estado activo, una columna por cada talla del catálogo y listas de referencia con los tipos, fabricantes, marcas y colores existentes.
2. **Given** que completó la plantilla con productos nuevos válidos, **When** la sube, **Then** la vista previa indica cuántos productos, tallas y unidades se crearán y muestra los datos de cada producto nuevo.
3. **Given** que confirma la vista previa, **When** termina la operación, **Then** cada producto nuevo queda creado con su propio identificador y URL pública, sus tallas y existencias y el estado de publicación indicado, o como no publicado si esa celda quedó vacía.
4. **Given** que un mismo archivo contiene productos nuevos y productos existentes, **When** se sube, **Then** la vista previa distingue claramente los productos que se crearán de los que se actualizarán.

---

### User Story 3 - Corregir errores del archivo sin afectar el inventario (Priority: P1)

Como propietaria, quiero que el sistema revise todo el archivo antes de guardar nada y me indique con precisión cada error, para corregirlo en Excel y volver a subirlo sin que el inventario quede con datos inválidos o cambios a medias.

**Why this priority**: Un archivo puede modificar cientos de existencias a la vez; sin una validación completa y una aplicación de todo o nada, un error de escritura podría dejar la vitrina con existencias engañosas.

**Independent Test**: Se sube un archivo con errores deliberados (cantidad negativa, precio con texto, género no permitido, identificador inexistente, columna obligatoria eliminada) y se comprueba que se listan todos los errores con fila, columna y motivo, que no se permite confirmar y que ningún dato cambia; al corregirlos y volver a subirlo, la carga puede confirmarse.

**Acceptance Scenarios**:

1. **Given** que el archivo contiene datos inválidos, **When** la propietaria lo sube, **Then** ve la lista completa de errores con la fila, la columna y un motivo comprensible, la confirmación queda deshabilitada y ningún dato del inventario cambia.
2. **Given** que el archivo no es un Excel válido, está dañado o protegido con contraseña, supera los límites permitidos o le faltan columnas obligatorias, **When** lo sube, **Then** se rechaza con un mensaje que explica el problema y cómo resolverlo.
3. **Given** que la propietaria corrigió los errores, **When** sube nuevamente el archivo, **Then** obtiene una vista previa sin errores y puede confirmar la carga.
4. **Given** que un producto incluido cambió entre la vista previa y la confirmación, o que ocurre un fallo mientras se aplican los cambios, **When** la propietaria confirma, **Then** no se aplica ningún cambio, el inventario queda como estaba y se le indica que vuelva a validar el archivo.
5. **Given** que la sesión de la propietaria caducó, **When** intenta subir el archivo o confirmar la carga, **Then** se le solicita iniciar sesión nuevamente y no se modifica ningún dato.

---

### User Story 4 - Revisar advertencias antes de confirmar (Priority: P2)

Como propietaria, quiero que la vista previa me advierta de situaciones que no son errores pero podrían ser equivocaciones —valores nuevos que podrían ser errores de escritura, posibles productos duplicados o cambios de disponibilidad en la vitrina—, para decidir con información antes de confirmar.

**Why this priority**: Mejora la calidad del catálogo y evita sorpresas en la vitrina, pero la carga sigue siendo segura y útil sin estas advertencias.

**Independent Test**: Se sube un archivo válido que incluye una marca nueva, un producto nuevo idéntico a uno existente, un producto publicado sin fotografías y un producto cuyas existencias pasan a cero; la vista previa muestra una advertencia para cada caso y permite confirmar o cancelar.

**Acceptance Scenarios**:

1. **Given** que el archivo contiene un tipo, fabricante, marca o color que no existe en el catálogo, o una columna de talla nueva, **When** se muestra la vista previa, **Then** se advierte que se creará un valor nuevo, para que la propietaria descarte un error de escritura.
2. **Given** que un producto nuevo coincide en tipo, fabricante, marca, género y color con un producto existente o con otro producto nuevo del archivo, **When** se muestra la vista previa, **Then** se advierte de un posible duplicado.
3. **Given** que los cambios harán que productos pasen a estar disponibles o dejen de estarlo en la vitrina, o que un producto quede publicado sin fotografías o sin existencias, **When** se muestra la vista previa, **Then** se identifican esos productos.
4. **Given** que el archivo proviene de una descarga del inventario y un producto incluido se modificó después de esa descarga, **When** se muestra la vista previa, **Then** se advierte que se sobrescribirán sus valores más recientes y se muestran los valores afectados.

### Edge Cases

- Si el archivo tiene otro formato (CSV, PDF, imagen), está dañado o protegido con contraseña, se rechaza sin modificar datos y se indica que debe usarse un archivo de Excel (.xlsx) basado en la plantilla.
- Si el archivo no contiene productos (solo encabezados o filas vacías), se informa que no hay información para procesar.
- Si el archivo supera 5.000 filas de productos o 4 MB, se rechaza indicando el límite y sugiriendo dividirlo en varios archivos.
- Las columnas se reconocen por su encabezado, por lo que se aceptan aunque cambien de orden; las columnas adicionales no reconocidas (por ejemplo, notas personales) se ignoran y se informa; si falta o se renombra una columna obligatoria, el archivo se rechaza indicando cuál.
- Si se elimina del archivo la columna de una talla, las existencias de esa talla se conservan sin cambios en todos los productos.
- Una columna de talla nueva (por ejemplo, “Talla 4XL”) crea esa talla solo en los productos que tengan una cantidad en ella; dos columnas de talla cuyos nombres solo difieren en mayúsculas, minúsculas o espacios se informan como columnas duplicadas.
- Una columna de talla cuyo nombre solo difiere en mayúsculas, minúsculas o espacios de una talla existente (por ejemplo, “Talla m” frente a “M”) se trata como esa misma talla y no la duplica.
- Si una talla que el producto ya tiene aparece con la celda vacía, se informa como error, porque la carga masiva no elimina tallas, y se indica que se use 0 para dejarla sin existencias.
- Si un producto tiene registradas dos tallas que solo difieren en mayúsculas, minúsculas o espacios, la descarga del inventario lo señala y la carga lo informa como error hasta que esas tallas se unifiquen desde la edición individual.
- Las filas completamente vacías entre productos se ignoran.
- Si una celda contiene una fórmula, se usa su valor calculado; si el cálculo produce un error, la celda se informa como inválida.
- Los números escritos como texto (por ejemplo, “10”) se aceptan si representan un valor válido; las cantidades con decimales o negativas, los precios con texto o símbolos y los valores no numéricos se informan como error.
- Los valores con opciones cerradas se aceptan sin importar mayúsculas, minúsculas, tildes o espacios al inicio y al final (por ejemplo, “dama”, “SI” o “ sí ”).
- Si un identificador de producto no existe, fue alterado o aparece en más de una fila, se informa como error. Un producto sin identificador cuyo SKU ya pertenece a otro producto también es un error, porque el SKU no se usa para actualizar productos existentes, al igual que dos productos del archivo con el mismo SKU.
- La unicidad del SKU se evalúa sobre el resultado final, de modo que dos productos del archivo pueden intercambiar sus SKU.
- Un producto sin tallas o con todas sus cantidades en 0 puede guardarse, pero aparecerá como no disponible en la vitrina; si está marcado como publicado, se advierte.
- Los productos del inventario que no aparecen en el archivo se conservan sin cambios: la carga masiva no elimina productos, tallas ni fotografías.
- Si el catálogo no tiene productos, la descarga del inventario entrega solo la estructura de la plantilla.
- Si se sube de nuevo un archivo ya aplicado, los productos existentes aparecen sin cambios porque las cantidades reemplazan las existencias en lugar de sumarse; los productos nuevos de ese archivo generan advertencias de posible duplicado y cualquier SKU repetido se informa como error.
- Si la propietaria pulsa varias veces el botón de confirmar o pierde la conexión mientras se aplican los cambios, estos se aplican una sola vez o ninguna; al volver a subir el archivo puede comprobar qué falta por aplicar.
- Si una vista previa no se confirma en 60 minutos, caduca y el archivo debe subirse de nuevo.
- Un texto del catálogo que comienza con caracteres que una hoja de cálculo interpretaría como fórmula (por ejemplo, “=”) se descarga como texto y no se ejecuta al abrir el archivo.
- Los textos de más de 160 caracteres (40 en las etiquetas de talla) se informan como error, igual que en el formulario individual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La carga y la edición masiva DEBEN estar disponibles únicamente para la propietaria autenticada dentro del panel administrativo. Cada descarga, subida, vista previa y confirmación DEBE verificar la sesión y la autorización en el servidor y aplicar las mismas protecciones contra solicitudes no autorizadas o de otro origen que el resto del panel; una solicitud sin sesión válida NO DEBE obtener datos del inventario ni modificarlos.
- **FR-002**: La sección de productos del panel DEBE ofrecer un acceso visible a la carga y edición masiva, desde el que se pueda descargar la plantilla vacía, descargar el inventario actual y subir un archivo completado.
- **FR-003**: La plantilla vacía DEBE ser un archivo de Excel (.xlsx) que incluya instrucciones de llenado; el significado, formato y obligatoriedad de cada columna; los valores permitidos para género (Dama, Caballero, Unisex), publicación y estado activo (Sí/No); y listas de referencia con los tipos, fabricantes, marcas y colores que existen en el catálogo al momento de la descarga.
- **FR-004**: La descarga del inventario actual DEBE usar el mismo formato de la plantilla e incluir todos los productos —publicados o no, activos o inactivos— con sus datos editables y la existencia actual de cada una de sus tallas, el identificador de cada producto marcado como dato que no debe modificarse y la fecha y hora de generación del archivo.
- **FR-005**: La plantilla y la descarga del inventario DEBEN organizar la información en una fila por producto y una columna de cantidad por talla, con el encabezado “Talla <etiqueta>” (por ejemplo, “Talla M”). DEBEN incluir una columna por cada talla existente en el catálogo, en el orden en que la vitrina presenta las tallas, y la propietaria DEBE poder incorporar una talla nueva agregando una columna con ese formato. En cada fila, una celda de talla vacía indica que el producto no usa esa talla y el 0, que la talla existe sin existencias.
- **FR-006**: Los archivos descargados NO DEBEN contener macros, credenciales ni datos internos distintos del identificador de cada producto y la fecha de generación; los textos del catálogo DEBEN descargarse como valores de texto aunque comiencen con caracteres que una hoja de cálculo podría interpretar como fórmula.
- **FR-007**: La carga masiva DEBE permitir crear productos nuevos y editar en productos existentes todos los datos del formulario individual —tipo, fabricante, marca, género, precio, SKU, color, publicación, estado activo, tallas y existencias—, incluida la incorporación de tallas nuevas; las fotografías quedan fuera del archivo y se siguen gestionando desde la edición individual del producto.
- **FR-008**: Las cantidades del archivo DEBEN reemplazar la existencia actual de cada talla: el valor escrito es el nuevo total disponible y no se suma al anterior, de modo que aplicar dos veces el mismo archivo deja las mismas existencias.
- **FR-009**: Los productos existentes DEBEN identificarse únicamente por el identificador del sistema incluido en la descarga del inventario: una fila con identificador se interpreta como edición de ese producto y una fila sin identificador, como un producto nuevo. El SKU NO DEBE usarse para localizar productos existentes.
- **FR-010**: La carga masiva NO DEBE eliminar productos, tallas ni fotografías. Los productos que no aparezcan en el archivo y las tallas cuya columna no esté presente DEBEN conservarse sin cambios; para retirar un producto de la vitrina se usa “No” en Publicado o Activo y, para dejar una talla sin existencias, la cantidad 0.
- **FR-011**: En productos nuevos, un valor vacío en Publicado DEBE interpretarse como “No” y en Activo como “Sí”; en productos existentes ambos valores son obligatorios. Cada producto creado DEBE recibir un identificador y una URL pública estables, igual que los productos creados desde el formulario individual.
- **FR-012**: La propietaria DEBE poder subir desde el panel un archivo de Excel (.xlsx) completado. El sistema DEBE rechazar, con un mensaje claro y sin modificar datos, los archivos de otro formato, dañados, protegidos con contraseña, sin productos para procesar o que superen 5.000 filas de productos o 4 MB.
- **FR-013**: El sistema DEBE reconocer las columnas por su encabezado y no por su posición, ignorar las filas completamente vacías y las columnas no reconocidas —informando estas últimas— y rechazar el archivo indicando qué columnas obligatorias faltan; las columnas de talla no son obligatorias.
- **FR-014**: El sistema DEBE validar el archivo completo con las mismas reglas del formulario individual: tipo, fabricante, marca y color obligatorios y de hasta 160 caracteres; género Dama, Caballero o Unisex; precio numérico mayor o igual a cero con hasta dos decimales; SKU opcional de hasta 160 caracteres y único en el catálogo resultante; publicación y estado activo con “Sí” o “No”; etiquetas de talla no vacías de hasta 40 caracteres y sin columnas de talla repetidas; y cantidades enteras mayores o iguales a cero.
- **FR-015**: El sistema DEBE aceptar los valores de opciones cerradas sin distinguir mayúsculas, minúsculas, tildes ni espacios al inicio o al final; DEBE tratar una columna de talla cuyo nombre solo difiera en mayúsculas, minúsculas o espacios de una talla existente como esa misma talla, sin duplicarla; y DEBE guardar los textos sin espacios sobrantes al inicio o al final.
- **FR-016**: El sistema DEBE informar como error un identificador inexistente o repetido en varias filas, un SKU que ya pertenece a otro producto y una celda vacía en una talla que el producto ya tiene, ya que la carga masiva no elimina tallas.
- **FR-017**: Antes de modificar cualquier dato, el sistema DEBE mostrar una vista previa con el total de productos nuevos, productos que cambiarán, tallas nuevas, existencias modificadas, productos sin cambios, errores y advertencias.
- **FR-018**: La vista previa DEBE mostrar, para cada producto que cambiará, el valor actual y el nuevo de cada dato y existencia modificados; los datos de cada producto nuevo; y, para cada error, la fila, la columna y el motivo en lenguaje comprensible. La información DEBE poder revisarse agrupada por tipo de resultado aunque el archivo contenga muchos productos.
- **FR-019**: Si el archivo contiene al menos un error, el sistema NO DEBE permitir confirmar ni aplicar ningún cambio, y la propietaria DEBE poder corregir el archivo y subirlo de nuevo.
- **FR-020**: La vista previa DEBE advertir, sin impedir la confirmación, cuando un tipo, fabricante, marca, color o talla no exista todavía en el catálogo; un producto nuevo coincida en tipo, fabricante, marca, género y color con otro producto existente o del archivo; un producto vaya a quedar publicado sin fotografías o sin existencias positivas; un producto pase a estar disponible o deje de estarlo en la vitrina; o un producto incluido se haya modificado después de la fecha de generación del archivo descargado.
- **FR-021**: Los cambios DEBEN aplicarse solo cuando la propietaria confirme explícitamente la vista previa. Cancelar o abandonar la vista previa NO DEBE modificar datos, y una vista previa sin confirmar DEBE caducar a los 60 minutos.
- **FR-022**: La aplicación DEBE ser completa o nula: se aplican todos los cambios de la vista previa confirmada o ninguno. Si algún producto incluido cambió después de la vista previa o se produce un fallo, el sistema NO DEBE dejar cambios parciales y DEBE informar que no se aplicó ningún cambio y cómo continuar. Una misma confirmación DEBE aplicarse una sola vez aunque se envíe repetidamente.
- **FR-023**: La información del archivo que no difiera de los datos actuales NO DEBE generar modificaciones.
- **FR-024**: Al terminar, el sistema DEBE mostrar un resumen con los productos creados y actualizados, las tallas creadas y las existencias modificadas, con acceso a los productos afectados. Los cambios DEBEN reflejarse de inmediato en el panel y en la vitrina, donde un producto solo se muestra disponible si está publicado, activo y tiene alguna talla con existencias positivas.
- **FR-025**: Las pantallas de carga masiva DEBEN mostrar estados claros de espera de archivo, validación en curso, archivo con errores, listo para confirmar, aplicación en curso, éxito y fallo; ante errores de conexión o del servidor DEBEN mostrar mensajes comprensibles sin detalles técnicos ni secretos.
- **FR-026**: Las pantallas de carga masiva DEBEN poder usarse con teclado y foco visible, con etiquetas accesibles y mensajes de error y advertencia perceptibles para lectores de pantalla, y DEBEN funcionar en teléfonos, tabletas y escritorio sin desplazamiento horizontal de la página.
- **FR-027**: El contenido de un archivo subido DEBE usarse solo para la validación y la aplicación solicitadas: NO DEBE quedar accesible fuera del panel ni conservarse después de aplicar, cancelar o caducar la operación.

### Key Entities *(include if feature involves data)*

- **Plantilla de inventario**: Archivo de Excel descargable con instrucciones, valores permitidos, listas de referencia, una fila por producto y una columna por talla; se descarga vacía para dar de alta productos o con el inventario actual y su fecha de generación para editarlo.
- **Fila de producto**: Representa un producto dentro del archivo: identificador del sistema si ya existe (vacío si es nuevo), tipo, fabricante, marca, género, precio, SKU, color, publicación, estado activo y la cantidad de cada talla que usa.
- **Columna de talla**: Columna identificada como “Talla <etiqueta>” que contiene la cantidad de esa talla para cada producto; hay una por cada talla del catálogo y la propietaria puede agregar otras nuevas.
- **Carga masiva**: Operación iniciada al subir un archivo; pasa por los estados con errores, lista para confirmar, aplicada, cancelada, caducada o fallida, y reúne el resumen de cambios previstos o aplicados y sus incidencias. Solo se conserva mientras la operación está en curso.
- **Incidencia de validación**: Error que impide aplicar la carga o advertencia que requiere revisión, asociada a una fila y una columna del archivo y con un motivo comprensible.
- **Producto**: Prenda del catálogo con identificador estable, tipo, fabricante, marca, género, precio, SKU, color, estados de publicación y actividad, fotografías y tallas; solo está disponible si está publicado, activo y tiene alguna talla con existencias positivas.
- **Variante o talla**: Etiqueta de talla de un producto con su cantidad disponible; es única dentro de cada producto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La propietaria puede actualizar las existencias de al menos 50 tallas de distintos productos —descargar, editar, subir, revisar y confirmar— en menos de 10 minutos.
- **SC-002**: Con el archivo ya completado, la propietaria puede subir, revisar y confirmar el alta de 20 productos nuevos con sus tallas en menos de 3 minutos, y el 100% de ellos aparece en el panel con los datos, tallas y existencias del archivo.
- **SC-003**: Un archivo con hasta 1.000 productos se valida y muestra su vista previa en menos de 30 segundos, y los cambios confirmados se reflejan en el panel y en la vitrina en menos de 1 minuto.
- **SC-004**: En el 100% de las pruebas con archivos que contienen errores no cambia ningún producto, talla ni existencia, y cada error indica fila, columna y motivo.
- **SC-005**: En el 100% de las pruebas de fallo o de cambios simultáneos durante la aplicación, el inventario queda exactamente como antes de confirmar o con todos los cambios aplicados, nunca en un estado parcial.
- **SC-006**: En el 100% de las pruebas, volver a subir un archivo de edición ya aplicado produce una vista previa sin cambios y no modifica ninguna existencia ni dato.
- **SC-007**: Al menos el 90% de los errores de los archivos de prueba se corrige en el primer intento a partir del mensaje mostrado, sin asistencia técnica.
- **SC-008**: El 100% de las solicitudes de descarga, subida, vista previa o confirmación sin una sesión autorizada se rechaza sin exponer ni modificar datos del inventario.
- **SC-009**: Tras confirmar una carga, el 100% de los productos afectados muestra en la vitrina una disponibilidad coherente con sus nuevas existencias y estados; ningún producto agotado, inactivo o no publicado aparece como disponible.

## Assumptions

- La propietaria es la única usuaria del panel; no se requieren roles, aprobaciones adicionales ni cuentas nuevas.
- El archivo se completa en Excel u otra hoja de cálculo capaz de guardar en formato .xlsx; solo se acepta ese formato al subir.
- Las fotografías no forman parte del archivo: los productos nuevos se crean sin fotografías y se completan después desde la edición individual del producto.
- Los productos existentes solo pueden actualizarse partiendo de la descarga del inventario, que incluye su identificador; un archivo sin identificadores solo crea productos nuevos.
- Las cantidades representan la existencia total: para registrar mercancía recibida de un producto existente, la propietaria escribe la suma de la existencia actual y lo recibido.
- El catálogo usa un número reducido de tallas distintas (del orden de decenas como máximo), por lo que una columna por talla mantiene la hoja manejable.
- La aplicación de todo o nada responde a la constitución del proyecto, que exige que las actualizaciones no dejen el catálogo en un estado parcial o incoherente.
- Quitar tallas de un producto sigue haciéndose desde la edición individual; la carga masiva no elimina información.
- Los límites iniciales de 5.000 filas de productos y 4 MB por archivo superan el tamaño previsto del catálogo y podrán ajustarse en la planificación técnica sin cambiar el comportamiento descrito.
- La categoría interna no se gestiona en el archivo; se edita el “Tipo”, que es la clasificación visible que hoy usa el formulario de producto.
- No se incluye historial de cargas ni función de deshacer; descargar el inventario antes de una carga sirve como respaldo de los datos de los productos existentes.
- Se espera que el archivo se complete normalmente en una computadora, pero las pantallas de descarga, subida, vista previa y resultado deben funcionar también en teléfonos.
- No se procesan pagos, ventas ni pedidos como parte de esta funcionalidad.
