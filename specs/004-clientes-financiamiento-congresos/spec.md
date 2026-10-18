# Feature Specification: Clientes, pagos financiados y congresos con carga masiva

**Feature Branch**: `004-clientes-financiamiento-congresos`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "quiero agregar 3 secciones dentro de mi aplicacion: 1. seccion clientes: en esta seccion es una especie de CRM, una base de datos en donde tengo la información de los clientes, toma como referencia la pestaña "Medicos" del archivo "C:\Users\frako\Downloads\Uniformes medicos APP.xlsx", 2. sección pago financiado: Algunos médicos se les da financiamiento para la compra del uniforme, ellos lo compran por partes, normalmente pagan quincenal, me gustaría llevar un registro de esos pagos pendientes y poder marcar cuando el cliente ya haya pagado, el monto del pago esta fijado en Dolares y la tasa de cambio para el caso que quiera pagar en Bolivares es a tasa euro. 3. sección congresos: quiero poder cargar los proximos congresos en los que voy a participal, sería una base de datos donde coloque de que fecha que fecha es el congreso, me gustaria la visual tipo calendario google calendar y que se muestre pintado cuando haya congreso, para las 3 secciones quiero poder hacer carga masiva usando la misma dinamica de descargar una plantilla de excel y luego cargarla con los datos"

## Clarifications

### Session 2026-10-18

- Q: Cuando una fila de la carga masiva actualiza a un cliente que ya existe, ¿qué debe pasar con las celdas vacías? → A: Depende de la fila: con Identificador (archivo descargado del sistema), la celda vacía borra el dato; sin Identificador (cliente encontrado por su celular), la celda vacía conserva el dato guardado.
- Q: Al registrar un financiamiento, ¿hay que elegir los productos y tallas del catálogo y descontar sus existencias, o basta con describir la compra en texto? → A: Basta con describir la compra en texto libre; el financiamiento no se vincula al catálogo ni modifica existencias.
- Q: Para hacer seguimiento a cada cliente, ¿basta con un campo de notas o necesitas un historial de interacciones con fecha? → A: Basta con el campo de notas; el historial de interacciones y los seguimientos programados quedan fuera de alcance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar, buscar y consultar clientes (Priority: P1)

Como propietaria de Uniformes Médicos 2015, quiero tener en el panel una base de datos de mis clientes —en su mayoría médicos— con su nombre, celular, sexo, talla, ciudad, hospital, clínica, especialidad y notas, y poder buscarlos y filtrarlos, para dejar de depender de la hoja de cálculo y tener a mano la información de cada cliente cuando lo atiendo.

**Why this priority**: Es la base de las demás secciones —cada financiamiento pertenece a un cliente— y sustituye a la pestaña “Medicos” de la hoja de cálculo actual, que reúne más de 2.000 contactos.

**Independent Test**: La propietaria registra un cliente desde el panel, lo encuentra buscando por nombre y por celular, filtra la lista por especialidad y ciudad, edita su talla y comprueba que el cambio se conserva; al intentar registrar otro cliente con el mismo celular se le indica que el número ya existe.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión, **When** abre la sección Clientes, **Then** ve la lista de clientes ordenada por nombre con su celular, especialidad, ciudad, talla y saldo pendiente, si lo tiene; el total de clientes; y acciones para buscar, filtrar, registrar un cliente y abrir la carga masiva.
2. **Given** que completa el formulario con un nombre y un celular válidos y, opcionalmente, los demás datos, **When** guarda, **Then** el cliente queda registrado y aparece en la lista.
3. **Given** que escribe parte de un nombre o de un celular, **When** busca, **Then** la lista muestra solo los clientes que coinciden, sin distinguir mayúsculas, minúsculas ni tildes, y el número se encuentra aunque se escriba con o sin el 0 inicial, el prefijo +58, guiones o espacios.
4. **Given** que aplica filtros por especialidad, ciudad, hospital, clínica, sexo, talla, saldo pendiente o cuotas vencidas, **When** se actualiza la lista, **Then** muestra solo los clientes que cumplen todos los filtros y cuántos son, y los filtros pueden quitarse con una sola acción.
5. **Given** que intenta guardar un cliente con un celular que ya pertenece a otro cliente, **When** guarda, **Then** se le indica a qué cliente pertenece ese número y no se guarda.
6. **Given** que abre la ficha de un cliente, **When** la consulta, **Then** ve todos sus datos, sus financiamientos con el total, lo pagado, el saldo y el estado de cada uno, y acciones para editar o eliminar al cliente.
7. **Given** un cliente sin financiamientos, **When** la propietaria lo elimina y confirma, **Then** deja de aparecer en la base; **Given** un cliente con financiamientos, **When** intenta eliminarlo, **Then** la eliminación se impide con un mensaje que explica el motivo.

---

### User Story 2 - Importar y actualizar clientes en bloque con la plantilla de Excel (Priority: P1)

Como propietaria, quiero descargar la plantilla de clientes —o la base actual de clientes—, completarla o corregirla en Excel y subirla, para incorporar de una vez los médicos que tengo en mi hoja de cálculo y hacer correcciones masivas sin editar cliente por cliente.

**Why this priority**: Sin importación, la sección empezaría vacía; transcribir uno por uno más de 2.000 contactos no es viable.

**Independent Test**: La propietaria pega en la plantilla las filas de su pestaña “Medicos”, la sube, revisa en la vista previa cuántos clientes se crearán, corrige los errores señalados —por ejemplo, celulares con dígitos de más o de menos—, vuelve a subir el archivo, confirma y encuentra los clientes en la lista con sus datos.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión, **When** descarga la plantilla de clientes, **Then** obtiene un archivo de Excel con instrucciones de llenado; las columnas de su pestaña “Medicos” (Nombre, Celular, Sexo, Talla, Ciudad, Hospital, Clínica y Especialidad) más Notas e Identificador, con su formato y obligatoriedad; los valores permitidos para Sexo; y listas de referencia con las tallas, ciudades, hospitales, clínicas y especialidades ya registradas.
2. **Given** que la plantilla completada contiene clientes nuevos válidos, **When** la sube, **Then** ve, antes de que se guarde nada, una vista previa con cuántos clientes se crearán, cuántos se actualizarán y cuántos no cambian, y los datos de cada cliente nuevo.
3. **Given** que descargó la base actual de clientes y modificó datos en el archivo, **When** lo sube, **Then** la vista previa muestra, para cada cliente que cambiará, el valor actual y el nuevo de cada dato modificado —incluidos los que se borrarán porque se vació su celda—; al confirmar, todos los cambios se aplican en una sola operación y se muestra un resumen.
4. **Given** que una fila sin identificador tiene el celular de un cliente ya registrado, **When** se muestra la vista previa, **Then** la fila se presenta como actualización de ese cliente, y no como un cliente nuevo, con los cambios de las celdas que tienen valor; sus celdas vacías conservan los datos ya guardados.
5. **Given** que el archivo contiene errores —celular inválido o repetido, nombre vacío, sexo no permitido o identificador inexistente—, **When** lo sube, **Then** ve la lista completa de errores con fila, columna y motivo, la confirmación queda deshabilitada y ningún cliente cambia.
6. **Given** que el archivo contiene una talla, ciudad, hospital, clínica o especialidad que todavía no existe en la base, o clientes con el mismo nombre, **When** se muestra la vista previa, **Then** se advierte de cada caso —posible error de escritura o posible duplicado— sin impedir la confirmación.
7. **Given** que la propietaria está revisando la vista previa, **When** cancela, **Then** no se modifica ningún cliente.

---

### User Story 3 - Registrar un financiamiento con su calendario de cuotas (Priority: P1)

Como propietaria, quiero registrar que un cliente compró a crédito —qué compró, el monto total en dólares, la inicial si la hubo, el número de cuotas y la frecuencia de pago— y que el sistema arme el calendario de cuotas, para saber cuánto y cuándo me debe pagar cada cliente.

**Why this priority**: Hoy los pagos financiados se controlan fuera del sistema; registrar cada financiamiento con su calendario es el punto de partida para cobrarlos.

**Independent Test**: La propietaria registra para un cliente una compra de $100,00 en 4 cuotas quincenales sin inicial, comprueba que se proponen 4 cuotas de $25,00 con vencimiento los días 15 y último de cada mes, cambia la fecha de una cuota, guarda y ve el financiamiento en la ficha del cliente y en la lista de pagos pendientes.

**Acceptance Scenarios**:

1. **Given** un cliente registrado, **When** la propietaria indica la descripción de la compra, la fecha de compra, el monto total, la inicial (opcional), el número de cuotas, la frecuencia —quincenal por defecto— y la fecha de la primera cuota, **Then** el sistema propone el calendario: la inicial, si la hay, con vencimiento en la fecha de compra, y el resto del monto repartido en cuotas iguales con fechas según la frecuencia.
2. **Given** que el monto no se divide en partes exactas, **When** se proponen las cuotas, **Then** se redondean al centavo y la última absorbe la diferencia, de modo que la suma es igual al monto total (por ejemplo, $100,00 en 3 cuotas: $33,33, $33,33 y $33,34).
3. **Given** el calendario propuesto, **When** la propietaria cambia fechas o montos antes de guardar, **Then** el total del financiamiento se recalcula como la suma de las cuotas y se muestra antes de guardar.
4. **Given** que guardó el financiamiento, **When** consulta la ficha del cliente o la sección Pagos financiados, **Then** ve el financiamiento con su descripción, total, monto pagado, saldo pendiente, próxima cuota y estado.
5. **Given** que el cliente renegocia, **When** la propietaria cambia la fecha o el monto de cuotas pendientes, o agrega o quita cuotas pendientes, **Then** el total y el saldo se recalculan y las cuotas pagadas se conservan sin cambios.
6. **Given** un financiamiento registrado por error y sin pagos, **When** la propietaria lo elimina y confirma, **Then** desaparece con todas sus cuotas; **Given** un financiamiento con pagos registrados, **When** intenta eliminarlo, **Then** se le indica que no puede eliminarse y se le ofrece anularlo.

---

### User Story 4 - Marcar cuotas pagadas y seguir los pagos pendientes (Priority: P1)

Como propietaria, quiero ver en un solo lugar las cuotas pendientes de todos mis clientes —vencidas, próximas a vencer y futuras— con su equivalente en bolívares a tasa euro, y marcar cada cuota como pagada indicando si el cliente pagó en dólares o en bolívares, para saber en todo momento quién me debe, cuánto y desde cuándo.

**Why this priority**: Es el objetivo central de la sección: registrar los cobros y no perder de vista ningún pago pendiente.

**Independent Test**: Con un financiamiento de 4 cuotas, una de ellas vencida, la propietaria abre la sección Pagos financiados, ve la cuota vencida destacada con sus días de atraso, la marca como pagada en bolívares con la tasa euro del día, comprueba el monto en bolívares calculado y ve cómo bajan el saldo del cliente y el total por cobrar; luego deshace el pago y todo vuelve al estado anterior.

**Acceptance Scenarios**:

1. **Given** que existen cuotas pendientes, **When** la propietaria abre la sección Pagos financiados, **Then** ve un resumen con el total por cobrar, el total vencido, lo que vence en los próximos 15 días y lo cobrado en el mes en curso, y la lista de cuotas pendientes ordenada por fecha de vencimiento con el cliente, la descripción del financiamiento, el número de cuota (por ejemplo, “2 de 4”), la fecha, el monto en dólares, su equivalente en bolívares y su estado: vencida —con los días de atraso—, vence hoy o por vencer.
2. **Given** la lista de cuotas, **When** filtra por estado (vencidas, próximas a vencer, todas las pendientes o pagadas), por cliente o por rango de fechas, **Then** ve solo las cuotas que cumplen el filtro.
3. **Given** una cuota pendiente, **When** la marca como pagada en dólares indicando la fecha de pago —hoy por defecto— y, opcionalmente, una referencia, **Then** la cuota queda pagada con esos datos y se actualizan de inmediato el saldo del financiamiento, el del cliente y los totales del resumen.
4. **Given** que el cliente paga en bolívares, **When** la propietaria marca la cuota como pagada en bolívares, **Then** el sistema propone la tasa euro correspondiente a la fecha de pago, calcula el monto en bolívares multiplicando el monto en dólares por esa tasa —por ejemplo, $20,00 con una tasa de Bs 50,00 por euro equivale a Bs 1.000,00— y guarda la tasa y el monto en bolívares con el pago; la cuota se considera pagada por su monto en dólares.
5. **Given** que el cliente paga varias cuotas a la vez, **When** la propietaria las selecciona y las marca como pagadas con los mismos datos de pago, **Then** todas quedan pagadas en una sola acción.
6. **Given** que el cliente paga solo una parte de una cuota, **When** la propietaria registra ese pago parcial, **Then** la parte pagada queda registrada como pagada y el resto queda como una cuota pendiente con la misma fecha de vencimiento.
7. **Given** que una cuota se marcó como pagada por error, **When** la propietaria deshace el pago y confirma, **Then** la cuota vuelve a estar pendiente y se recalculan el saldo y los totales.
8. **Given** que se paga la última cuota pendiente, **When** se registra el pago, **Then** el financiamiento pasa a estado Pagado y deja de sumar al total por cobrar.

---

### User Story 5 - Cargar financiamientos en bloque con la plantilla de Excel (Priority: P2)

Como propietaria, quiero descargar una plantilla de financiamientos, registrar en ella varios financiamientos —nuevos o ya en curso— y subirla, para incorporar de una vez los créditos que hoy llevo fuera del sistema.

**Why this priority**: Acelera la puesta en marcha de la sección, pero los financiamientos también pueden registrarse uno por uno.

**Independent Test**: La propietaria completa la plantilla con tres financiamientos de clientes ya registrados —uno de ellos con dos cuotas ya pagadas—, la sube, revisa en la vista previa los calendarios que se crearán, confirma y comprueba en la sección Pagos financiados las cuotas pendientes y pagadas de cada uno.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión, **When** descarga la plantilla de financiamientos, **Then** obtiene un archivo de Excel con instrucciones, las columnas esperadas con su formato y obligatoriedad, los valores permitidos para la frecuencia y la lista de clientes registrados con su celular como referencia.
2. **Given** que la plantilla completada es válida, **When** la sube, **Then** la vista previa indica cuántos financiamientos y cuotas se crearán, el monto total financiado y el saldo pendiente resultante, y muestra el calendario de cada financiamiento.
3. **Given** que una fila indica un celular que no pertenece a ningún cliente registrado, montos o fechas inválidos, o más cuotas pagadas que cuotas, **When** se sube el archivo, **Then** se listan los errores con fila, columna y motivo y no se registra ningún financiamiento.
4. **Given** que la vista previa no tiene errores, **When** la propietaria confirma, **Then** todos los financiamientos se registran en una sola operación y las cuotas indicadas como ya pagadas quedan pagadas e identificadas como registradas por carga masiva.
5. **Given** que una fila coincide en cliente, fecha de compra y monto total con un financiamiento existente o con otra fila del archivo, **When** se muestra la vista previa, **Then** se advierte de un posible duplicado.

---

### User Story 6 - Registrar congresos y verlos en un calendario (Priority: P2)

Como propietaria, quiero registrar los próximos congresos en los que participaré —nombre, fechas de inicio y fin, lugar, especialidad y notas— y verlos en un calendario mensual al estilo de Google Calendar, con los días de cada congreso pintados, para planificar mi participación de un vistazo.

**Why this priority**: Organiza la agenda comercial del negocio, pero es independiente de clientes y financiamientos y puede entregarse después de ellos.

**Independent Test**: La propietaria registra un congreso del 30 de octubre al 1 de noviembre y otro de un solo día que coincide con el primero, y comprueba que en octubre y en noviembre los días correspondientes aparecen pintados con el nombre de cada congreso, que ambos se distinguen el día en que coinciden y que al seleccionar uno ve su detalle.

**Acceptance Scenarios**:

1. **Given** congresos registrados, **When** la propietaria abre la sección Congresos, **Then** ve el calendario del mes en curso, con el día de hoy resaltado y cada congreso pintado como una franja de color con su nombre que cubre todos sus días, también cuando continúa en la semana o el mes siguiente.
2. **Given** dos o más congresos que coinciden en algún día, **When** se muestra el mes, **Then** cada uno aparece como una franja distinguible; si no caben todos en un día, el día indica cuántos más hay y permite verlos.
3. **Given** el calendario, **When** la propietaria pasa al mes anterior o al siguiente o vuelve al mes actual, **Then** se muestran los congresos de ese mes.
4. **Given** un congreso pintado, **When** lo selecciona, **Then** ve su nombre, fechas, número de días, lugar, especialidad y notas, con acciones para editarlo o eliminarlo.
5. **Given** que elige registrar un congreso o selecciona un día del calendario, **When** completa y guarda el formulario, **Then** el congreso aparece pintado en el calendario; si eligió un día, este se propone como fecha de inicio.
6. **Given** que la fecha de fin es anterior a la de inicio o falta un dato obligatorio, **When** guarda, **Then** se le indica el error y no se guarda.
7. **Given** que consulta la sección en un teléfono o con un lector de pantalla, **When** la abre, **Then** dispone también de una lista de congresos ordenada por fecha, con la misma información y acciones, como alternativa al calendario.

---

### User Story 7 - Cargar congresos en bloque con la plantilla de Excel (Priority: P3)

Como propietaria, quiero descargar la plantilla de congresos —o la lista actual—, completarla con los congresos del año y subirla, para registrar o corregir varios a la vez.

**Why this priority**: Los congresos son pocos al año y pueden registrarse uno por uno; la carga masiva agiliza la planificación anual y la incorporación de la pestaña “Eventos” actual.

**Independent Test**: La propietaria pega en la plantilla las filas de su pestaña “Eventos”, la sube, revisa la vista previa, corrige una fila sin fechas señalada como error, confirma y ve los congresos pintados en el calendario.

**Acceptance Scenarios**:

1. **Given** que la propietaria inició sesión, **When** descarga la plantilla de congresos, **Then** obtiene un archivo de Excel con instrucciones; las columnas de su pestaña “Eventos” (Desde, Hasta, Especialidad, Lugar y Nombre) más Notas e Identificador, con su formato y obligatoriedad; y la lista de especialidades registradas.
2. **Given** que descargó la lista actual de congresos y la modificó, **When** la sube, **Then** la vista previa muestra los congresos nuevos, el valor actual y el nuevo de cada dato que cambiará y cuántos congresos no cambian.
3. **Given** filas sin nombre o sin fechas, con fechas inválidas o con la fecha de fin anterior a la de inicio, **When** se sube el archivo, **Then** se listan los errores con fila, columna y motivo y no se registra ni modifica ningún congreso.
4. **Given** un congreso que coincide en nombre y fecha de inicio con otro existente o del archivo, que dura más de 31 días o que ya terminó, **When** se muestra la vista previa, **Then** se advierte del caso sin impedir la confirmación.
5. **Given** que la vista previa no tiene errores, **When** la propietaria confirma, **Then** todos los cambios se aplican en una sola operación y los congresos aparecen en el calendario.

---

### User Story 8 - Contactar a un cliente por WhatsApp y recordarle una cuota (Priority: P3)

Como propietaria, quiero abrir una conversación de WhatsApp con un cliente desde su ficha y preparar un recordatorio de una cuota con su monto en dólares y su equivalente en bolívares, para cobrar sin copiar números ni calcular montos a mano.

**Why this priority**: Complementa el seguimiento de cobros con el canal que el negocio ya usa, pero las demás funciones son útiles sin él.

**Independent Test**: Desde la ficha de un cliente con una cuota vencida, la propietaria abre WhatsApp con el número del cliente y, desde la cuota, prepara un recordatorio que contiene la descripción del financiamiento, el número de cuota, la fecha de vencimiento, el monto en dólares y su equivalente en bolívares.

**Acceptance Scenarios**:

1. **Given** la ficha de un cliente, **When** la propietaria elige escribirle por WhatsApp, **Then** se abre una conversación de WhatsApp con el celular del cliente.
2. **Given** una cuota pendiente, **When** elige enviar un recordatorio, **Then** se abre WhatsApp con un mensaje editable que incluye el nombre del cliente, la descripción del financiamiento, el número de cuota, la fecha de vencimiento, el monto en dólares y su equivalente en bolívares con la tasa oficial más reciente, indicando la tasa y su fecha.
3. **Given** que se abrió WhatsApp, **When** la propietaria revisa el mensaje, **Then** decide si lo envía; el sistema no envía mensajes por sí mismo ni registra el recordatorio como pago.

### Edge Cases

**Clientes**

- El celular se acepta con o sin el 0 inicial, con el prefijo 58 o +58 y con espacios, guiones, puntos o paréntesis. Los números sin prefijo internacional se interpretan como venezolanos y deben tener 10 dígitos sin contar el 0 inicial (por ejemplo, “0414-246.77.89” o “4142467789”, como aparecen en la hoja actual); los números de otros países se escriben con “+” y su código de país. Un número con dígitos de más o de menos se informa como error.
- Un mismo celular escrito de dos formas distintas (por ejemplo, “04142467789” y “+58 414 246 7789”) es el mismo número y cuenta como repetido.
- Dos clientes pueden tener el mismo nombre si sus celulares son distintos; la carga masiva lo advierte como posible duplicado.
- Una talla, ciudad, hospital, clínica o especialidad escrita con otras mayúsculas, tildes o espacios que un valor ya registrado (por ejemplo, “Los magallanes” frente a “Los Magallanes”) se guarda con la escritura registrada y no crea un valor nuevo; un valor realmente nuevo (por ejemplo, “Anatonia Patológica”) se acepta, y la carga masiva lo advierte como posible error de escritura.
- Si la base no tiene clientes, la sección muestra un estado vacío con acciones para registrar el primer cliente o usar la carga masiva.
- Si una búsqueda o un filtro no tiene resultados, se indica y se ofrece quitar los filtros.
- Cambiar el nombre o el celular de un cliente no afecta a sus financiamientos.

**Pagos financiados**

- Quincenal: las cuotas vencen los días 15 y último de cada mes, y cada cuota vence en la siguiente de esas fechas posterior a la cuota anterior; por ejemplo, si la primera vence el 20 de octubre, las siguientes vencen el 31 de octubre, el 15 de noviembre y el 30 de noviembre. Mensual: el mismo día de cada mes que la primera cuota o, si el mes no tiene ese día, el último día del mes. Semanal: cada 7 días.
- Si no se indica la fecha de la primera cuota, se propone la primera fecha que corresponda a la frecuencia después de la fecha de compra (en quincenal, el siguiente día 15 o último día del mes).
- La fecha de pago no puede ser futura; puede ser anterior al vencimiento cuando el cliente adelanta un pago.
- Una cuota está vencida cuando sigue pendiente y su fecha de vencimiento ya pasó según la fecha de Venezuela; el mismo día del vencimiento se muestra como “vence hoy”.
- Si el cliente paga más de una cuota, la propietaria marca varias cuotas o registra un pago parcial en la última; el sistema no registra saldos a favor.
- Los fines de semana y feriados no se publica tasa oficial: para esas fechas se aplica la tasa publicada más reciente anterior.
- Si la fuente de la tasa no responde o todavía no publicó la tasa de la fecha de pago, la propietaria puede escribir la tasa para registrar el pago en bolívares, que queda marcado como registrado con tasa escrita a mano; las demás funciones de la sección siguen disponibles.
- Los equivalentes en bolívares de las cuotas pendientes usan la tasa oficial más reciente y muestran su fecha, para que se note si no está al día; si nunca se ha obtenido una tasa, las cuotas muestran solo su monto en dólares.
- Si la tasa de un día cambia después de registrar un pago, el pago conserva la tasa con la que se registró.
- Un financiamiento anulado conserva sus pagos, deja de sumar su saldo al total por cobrar y sus cuotas pendientes no pueden marcarse como pagadas; la anulación puede revertirse.
- Una cuota pagada no puede editarse ni quitarse; primero debe deshacerse su pago.
- Un financiamiento debe conservar al menos una cuota.
- Un cliente puede tener varios financiamientos a la vez; su saldo es la suma de los saldos de sus financiamientos no anulados.
- No se calculan intereses, recargos por mora ni descuentos; si se acuerdan, la propietaria ajusta el monto de las cuotas pendientes.

**Congresos**

- Un congreso de un solo día (inicio y fin en la misma fecha) se pinta en ese día.
- Un congreso que empieza en un mes y termina en otro se pinta en ambos meses, en los días que corresponden a cada uno.
- Los congresos pasados se conservan y pueden consultarse al navegar a meses anteriores o en la lista.
- Un mes sin congresos muestra el calendario sin días pintados y un mensaje con la fecha del próximo congreso, si existe.
- Las fechas son de día completo, sin horas, y el día de hoy corresponde a la fecha de Venezuela.

**Carga masiva (las tres secciones)**

- Si el archivo tiene otro formato (CSV, PDF, imagen), está dañado o protegido con contraseña, se rechaza sin modificar datos y se indica que debe usarse un archivo de Excel (.xlsx) basado en la plantilla.
- Si el archivo no contiene filas con datos, se informa que no hay información para procesar.
- Si el archivo supera 10.000 filas o 4 MB, se rechaza indicando el límite y sugiriendo dividirlo en varios archivos.
- Se procesa la hoja de datos de la plantilla de la sección; si el archivo no la tiene, se procesa su primera hoja, de modo que también puede subirse un libro propio cuya primera hoja tenga los encabezados esperados.
- Las columnas se reconocen por su encabezado sin importar el orden, las mayúsculas, las tildes ni los espacios (por ejemplo, “Clinica” equivale a “Clínica”); las columnas no reconocidas se ignoran y se informan; si falta una columna obligatoria, el archivo se rechaza indicando cuál, lo que también detecta que se subió la plantilla de otra sección.
- Las filas completamente vacías se ignoran. Si una celda contiene una fórmula, se usa su valor calculado; si el cálculo produce un error, la celda se informa como inválida.
- Las fechas se aceptan como fechas de Excel o como texto con el formato día/mes/año (por ejemplo, “12/03/2026”); cualquier otra escritura se informa como error.
- Los números escritos como texto (por ejemplo, “25”) se aceptan si representan un valor válido; los montos con símbolos o letras se informan como error.
- Los valores con opciones cerradas (por ejemplo, sexo y frecuencia) se aceptan sin importar mayúsculas, minúsculas, tildes o espacios al inicio y al final (por ejemplo, “mujer” o “ QUINCENAL ”).
- Si un identificador no existe, fue alterado o aparece en más de una fila, se informa como error.
- Al volver a subir una hoja propia de clientes sin identificadores, las celdas vacías no borran datos: por ejemplo, una talla registrada en el panel se conserva aunque la hoja la tenga vacía.
- Si se sube de nuevo un archivo de clientes o de congresos ya aplicado, la vista previa no muestra cambios. Como cada fila de financiamientos crea un financiamiento nuevo, volver a subir un archivo de financiamientos ya aplicado haría que la vista previa advirtiera cada fila como posible duplicado.
- Si la propietaria pulsa varias veces el botón de confirmar o pierde la conexión mientras se aplican los cambios, estos se aplican una sola vez o ninguna.
- Si un registro incluido cambia entre la vista previa y la confirmación, no se aplica ningún cambio y se pide volver a validar el archivo.
- Si una vista previa no se confirma en 60 minutos, caduca y el archivo debe subirse de nuevo.
- Si la sesión caducó al subir el archivo o al confirmar, se solicita iniciar sesión nuevamente y no se modifica ningún dato.
- Un texto que comienza con caracteres que una hoja de cálculo interpretaría como fórmula (por ejemplo, “=”) se descarga como texto y no se ejecuta al abrir el archivo.

## Requirements *(mandatory)*

### Functional Requirements

#### Acceso, privacidad y experiencia común

- **FR-001**: El panel administrativo DEBE incorporar tres secciones nuevas —Clientes, Pagos financiados y Congresos—, accesibles desde la navegación del panel y disponibles únicamente para la propietaria autenticada. Cada página, consulta, descarga, subida y modificación DEBE verificar la sesión y la autorización en el servidor y aplicar las mismas protecciones contra solicitudes no autorizadas o de otro origen que el resto del panel; una solicitud sin sesión válida NO DEBE obtener ni modificar datos de estas secciones.
- **FR-002**: Los datos de clientes, financiamientos, pagos y congresos son privados: NO DEBEN mostrarse en la vitrina pública ni incluirse en los pedidos que la vitrina prepara para WhatsApp, y los mensajes de error NO DEBEN revelar datos personales, detalles técnicos ni secretos.
- **FR-003**: Cada pantalla de estas secciones DEBE mostrar estados claros de carga, vacío, error y éxito; pedir confirmación antes de eliminar, anular o deshacer un pago; y comunicar el resultado de cada operación.
- **FR-004**: Las pantallas DEBEN poder usarse con teclado y foco visible, con etiquetas accesibles y mensajes perceptibles para lectores de pantalla, y DEBEN funcionar en teléfonos, tabletas y escritorio sin desplazamiento horizontal de la página, incluida la navegación del panel con las nuevas secciones.

#### Clientes

- **FR-005**: Cada cliente DEBE registrar nombre (obligatorio, hasta 160 caracteres), celular (obligatorio y único en la base), sexo (Mujer u Hombre, opcional), talla (opcional, hasta 40 caracteres), ciudad, hospital, clínica y especialidad (opcionales, hasta 160 caracteres cada uno) y notas (opcionales, hasta 1.000 caracteres), además de la fecha de alta y la de última modificación.
- **FR-006**: El sistema DEBE validar y normalizar el celular según las reglas descritas en los casos límite, tratar como el mismo número sus distintas escrituras, mostrarlo en un formato legible y usarlo para la búsqueda y la detección de repetidos.
- **FR-007**: Al registrar o editar la talla, la ciudad, el hospital, la clínica o la especialidad, el sistema DEBE sugerir los valores ya registrados —para la talla, también las del catálogo; para la especialidad, también las de los congresos— y DEBE guardar con la escritura registrada un valor que solo difiera de uno existente en mayúsculas, minúsculas, tildes o espacios. Los textos DEBEN guardarse sin espacios sobrantes al inicio o al final.
- **FR-008**: La lista de clientes DEBE ordenarse por nombre; mostrar el total de clientes y el número de resultados; permitir buscar por nombre o celular sin distinguir mayúsculas, minúsculas, tildes ni formato del número; y permitir filtrar, combinando filtros, por especialidad, ciudad, hospital, clínica, sexo, talla, saldo pendiente y cuotas vencidas. Con 10.000 clientes, los resultados de una búsqueda o de un filtro DEBEN mostrarse en menos de 2 segundos.
- **FR-009**: La propietaria DEBE poder registrar, consultar, editar y eliminar clientes. La ficha del cliente DEBE mostrar sus datos y sus financiamientos con su total, lo pagado, su saldo y su estado. Un cliente con financiamientos, de cualquier estado, NO DEBE poder eliminarse.

#### Pagos financiados

- **FR-010**: Un financiamiento DEBE pertenecer a un cliente registrado y registrar la descripción de la compra (obligatoria, texto libre de hasta 500 caracteres), la fecha de compra, su calendario de cuotas y, si se anula, el motivo opcional de la anulación. Un financiamiento NO DEBE vincularse a productos del catálogo ni modificar existencias. Su total DEBE ser la suma de sus cuotas; lo pagado, la suma de sus cuotas pagadas; y su saldo, la suma de sus cuotas pendientes. Su estado DEBE ser Anulado, si se anuló; Pagado, si no tiene cuotas pendientes; Con cuotas vencidas, si alguna cuota pendiente está vencida; o Al día, en los demás casos.
- **FR-011**: Los montos de los financiamientos DEBEN expresarse en dólares, ser mayores que cero y tener hasta dos decimales. Para registrar un financiamiento, la propietaria DEBE indicar el monto total, la inicial opcional (mayor o igual a cero y menor que el total), el número de cuotas sin contar la inicial (de 1 a 48), la frecuencia (Semanal, Quincenal —por defecto— o Mensual) y la fecha de la primera cuota, y el sistema DEBE proponer el calendario con las reglas de los casos límite: la inicial vence en la fecha de compra y el resto se reparte en cuotas iguales redondeadas al centavo, con la diferencia en la última. La propietaria DEBE poder cambiar fechas y montos del calendario propuesto antes de guardarlo. La fecha de compra NO DEBE ser futura y ninguna cuota DEBE vencer antes de esa fecha.
- **FR-012**: Cada cuota DEBE tener un número de orden según su fecha de vencimiento —la inicial se identifica como tal—, una fecha de vencimiento, un monto en dólares y un estado pendiente o pagada. Una cuota pendiente cuya fecha de vencimiento es anterior a la fecha actual de Venezuela DEBE mostrarse como vencida con sus días de atraso.
- **FR-013**: La propietaria DEBE poder marcar una o varias cuotas pendientes como pagadas en una sola acción, indicando la fecha de pago (hoy por defecto y nunca futura), la moneda —dólares o bolívares— y una referencia o nota opcional de hasta 160 caracteres. En los pagos en bolívares, el sistema DEBE registrar la tasa euro aplicada y el monto en bolívares, calculado como monto en dólares × tasa y redondeado a dos decimales.
- **FR-014**: La propietaria DEBE poder registrar el pago parcial de una cuota: la parte pagada queda como cuota pagada y el resto, como una cuota pendiente con la misma fecha de vencimiento, sin alterar el total del financiamiento.
- **FR-015**: La tasa euro es la tasa oficial del euro del Banco Central de Venezuela, expresada en bolívares por euro, y se aplica directamente al monto en dólares según la práctica comercial del negocio. El sistema DEBE obtenerla automáticamente de DolarAPI (sección Venezuela), la fuente elegida por la propietaria, y conservar cada tasa obtenida con la fecha a la que corresponde; la tasa aplicable a una fecha es la publicada para esa fecha o, si no hay, la más reciente anterior. Al registrar un pago en bolívares, el sistema DEBE proponer la tasa aplicable a la fecha de pago, y la propietaria DEBE poder escribir otra cuando la fuente no responda, no tenga tasa para esa fecha o haya que corregirla; el pago DEBE indicar si se usó la tasa oficial obtenida automáticamente o una escrita a mano. Las tasas DEBEN ser mayores que cero y usarse y mostrarse con 2 decimales junto a su fecha, y cada pago conserva la tasa con la que se registró. Un fallo de la fuente NO DEBE impedir el uso del resto de la sección.
- **FR-016**: La propietaria DEBE poder deshacer el pago de una cuota, con confirmación; la cuota vuelve a estar pendiente y se eliminan sus datos de pago.
- **FR-017**: La sección Pagos financiados DEBE mostrar un resumen, en dólares, con el total por cobrar, el total vencido, lo que vence en los próximos 15 días y lo cobrado en el mes en curso —la suma del valor en dólares de los pagos cuya fecha de pago cae en ese mes—, y la lista de cuotas ordenada por fecha de vencimiento, con filtros por estado (vencidas, próximas a vencer —en los próximos 15 días—, todas las pendientes y pagadas), cliente y rango de fechas. Cada cuota DEBE mostrar el cliente, la descripción del financiamiento, su número respecto del total (“2 de 4”), la fecha de vencimiento, los días de atraso, el monto en dólares y su equivalente en bolívares con la tasa oficial más reciente, cuya fecha DEBE mostrarse.
- **FR-018**: La propietaria DEBE poder editar la descripción de un financiamiento y la fecha y el monto de sus cuotas pendientes, agregar cuotas pendientes y quitar cuotas pendientes siempre que quede al menos una cuota. Las cuotas pagadas NO DEBEN modificarse sin deshacer antes su pago. El total y el saldo DEBEN recalcularse y mostrarse antes de guardar.
- **FR-019**: La propietaria DEBE poder anular un financiamiento, con confirmación y motivo opcional: sus pagos se conservan, su saldo deja de sumar al total por cobrar y sus cuotas pendientes no pueden marcarse como pagadas; la anulación DEBE poder revertirse. Un financiamiento solo DEBE poder eliminarse si ninguna de sus cuotas está pagada.
- **FR-020**: Los montos en dólares DEBEN mostrarse con el formato uniforme del proyecto (por ejemplo, $1.234,50); los montos en bolívares, con el prefijo “Bs”, punto de miles, coma decimal y 2 decimales (por ejemplo, Bs 1.234,50); y la tasa, como bolívares por euro con los mismos separadores (por ejemplo, Bs 985,73 por €).

#### Congresos

- **FR-021**: Cada congreso DEBE registrar nombre (obligatorio, hasta 160 caracteres), fecha de inicio y fecha de fin (obligatorias, de día completo, con la de fin igual o posterior a la de inicio), lugar (opcional, hasta 160 caracteres), especialidad (opcional, hasta 160 caracteres, con las sugerencias de FR-007) y notas (opcionales, hasta 1.000 caracteres).
- **FR-022**: La sección Congresos DEBE mostrar por defecto un calendario mensual de siete columnas al estilo de Google Calendar, con el mes en curso, el día de hoy resaltado y cada congreso pintado como una franja de color con su nombre sobre todos sus días, continua entre semanas y repartida entre meses cuando corresponda. Los congresos que coinciden DEBEN distinguirse entre sí; si un día no tiene espacio para todos, DEBE indicar cuántos más hay y permitir verlos.
- **FR-023**: El calendario DEBE permitir pasar al mes anterior o al siguiente y volver al mes actual. Seleccionar un congreso DEBE mostrar su detalle con acciones para editarlo o eliminarlo, y seleccionar un día DEBE permitir registrar un congreso con ese día como fecha de inicio.
- **FR-024**: La sección DEBE ofrecer además una lista de congresos ordenada por fecha de inicio, que muestre primero los próximos y permita consultar los pasados, con la misma información y acciones que el calendario, como alternativa accesible y para pantallas pequeñas. En teléfonos, el calendario DEBE seguir indicando qué días tienen congreso.
- **FR-025**: La propietaria DEBE poder registrar, editar y eliminar congresos, y los cambios DEBEN reflejarse de inmediato en el calendario y en la lista.

#### Carga masiva (común a las tres secciones)

- **FR-026**: Cada sección DEBE ofrecer un acceso visible a su carga masiva, desde el que se pueda descargar la plantilla vacía, descargar los datos actuales (en Clientes y Congresos) y subir un archivo completado.
- **FR-027**: Cada plantilla DEBE ser un archivo de Excel (.xlsx) con instrucciones de llenado; el significado, el formato y la obligatoriedad de cada columna; los valores permitidos de las opciones cerradas; y listas de referencia con los valores registrados al momento de la descarga. Los encabezados de las plantillas de clientes y de congresos DEBEN coincidir con los de las pestañas “Medicos” y “Eventos” de la hoja de cálculo actual de la propietaria, para que pueda pegar sus datos directamente.
- **FR-028**: La descarga de los datos actuales DEBE usar el formato de la plantilla e incluir todos los registros de la sección, el identificador de cada registro marcado como dato que no debe modificarse y la fecha y hora de generación. Los archivos descargados NO DEBEN contener macros, credenciales ni datos internos distintos de esos identificadores y esa fecha, y los textos DEBEN descargarse como valores de texto aunque comiencen con caracteres que una hoja de cálculo podría interpretar como fórmula.
- **FR-029**: El sistema DEBE rechazar, con un mensaje claro y sin modificar datos, los archivos de otro formato, dañados, protegidos con contraseña, sin filas para procesar o que superen 10.000 filas o 4 MB. DEBE procesar la hoja de datos de la plantilla o, si no existe, la primera hoja; reconocer las columnas por su encabezado sin importar el orden, las mayúsculas, las tildes ni los espacios; ignorar las filas vacías y las columnas no reconocidas, informando estas últimas; y rechazar el archivo indicando qué columnas obligatorias faltan.
- **FR-030**: El sistema DEBE validar el archivo completo con las mismas reglas que los formularios individuales de cada sección; aceptar las opciones cerradas sin distinguir mayúsculas, minúsculas, tildes ni espacios sobrantes; aceptar las fechas de Excel o escritas como día/mes/año y los números válidos escritos como texto; y usar el valor calculado de las fórmulas.
- **FR-031**: Una fila con identificador DEBE interpretarse como edición del registro correspondiente y una fila sin identificador, como un registro nuevo; en Clientes, una fila sin identificador cuyo celular pertenece a un cliente registrado DEBE interpretarse como edición de ese cliente. DEBEN informarse como error un identificador inexistente o repetido en varias filas y un celular repetido en el archivo o que pertenece a otro cliente.
- **FR-032**: En una edición, los datos de las columnas que no estén en el archivo DEBEN conservarse. En una fila con identificador, una celda vacía en una columna opcional presente DEBE borrar ese dato, y la vista previa DEBE señalarlo como dato que se borrará; en una fila de Clientes sin identificador que actualiza a un cliente encontrado por su celular, las celdas vacías NO DEBEN borrar datos y solo se actualizan las celdas con valor. La información que no difiera de los datos actuales NO DEBE generar modificaciones. La carga masiva NO DEBE eliminar clientes, financiamientos, cuotas, pagos ni congresos.
- **FR-033**: Antes de modificar cualquier dato, el sistema DEBE mostrar una vista previa con el total de registros nuevos, modificados y sin cambios, de errores y de advertencias; el valor actual y el nuevo de cada dato modificado; los datos de cada registro nuevo; y, para cada error, la fila, la columna y el motivo en lenguaje comprensible. La información DEBE poder revisarse agrupada por tipo de resultado aunque el archivo contenga miles de filas.
- **FR-034**: Si el archivo contiene al menos un error, el sistema NO DEBE permitir confirmar ni aplicar ningún cambio, y la propietaria DEBE poder corregir el archivo y subirlo de nuevo.
- **FR-035**: La vista previa DEBE advertir, sin impedir la confirmación, cuando haya tallas, ciudades, hospitales, clínicas o especialidades que no existan todavía; clientes con el mismo nombre, existentes o del archivo; congresos que coincidan en nombre y fecha de inicio con otro, que duren más de 31 días o que ya hayan terminado; financiamientos que coincidan en cliente, fecha de compra y monto total con otro existente o del archivo; o registros modificados después de la fecha de generación del archivo descargado.
- **FR-036**: Los cambios DEBEN aplicarse solo cuando la propietaria confirme explícitamente la vista previa. Cancelar o abandonar la vista previa NO DEBE modificar datos, y una vista previa sin confirmar DEBE caducar a los 60 minutos.
- **FR-037**: La aplicación DEBE ser completa o nula: se aplican todos los cambios de la vista previa confirmada o ninguno. Si algún registro incluido cambió después de la vista previa o se produce un fallo, el sistema NO DEBE dejar cambios parciales y DEBE informar que no se aplicó ningún cambio y cómo continuar. Una misma confirmación DEBE aplicarse una sola vez aunque se envíe repetidamente.
- **FR-038**: Al terminar, el sistema DEBE mostrar un resumen con los registros creados y actualizados, con acceso a ellos, y los cambios DEBEN reflejarse de inmediato en la sección correspondiente.
- **FR-039**: Las pantallas de carga masiva DEBEN mostrar estados claros de espera de archivo, validación en curso, archivo con errores, listo para confirmar, aplicación en curso, éxito y fallo, sin detalles técnicos ni secretos. El contenido de un archivo subido DEBE usarse solo para la validación y la aplicación solicitadas: NO DEBE quedar accesible fuera del panel ni conservarse después de aplicar, cancelar o caducar la operación.

#### Plantilla de cada sección

- **FR-040**: La plantilla de clientes DEBE incluir las columnas Nombre y Celular (obligatorias), Sexo, Talla, Ciudad, Hospital, Clínica, Especialidad, Notas e Identificador (vacío para los clientes nuevos).
- **FR-041**: La plantilla de pagos financiados DEBE tener una fila por financiamiento, con las columnas Celular del cliente, Descripción, Fecha de compra, Monto total (incluida la inicial) y Número de cuotas (obligatorias), y Cliente, Inicial, Frecuencia, Fecha de la primera cuota y Cuotas pagadas (opcionales). Cada fila DEBE crear un financiamiento nuevo cuyo calendario se genera con las mismas reglas que el formulario individual; una Frecuencia vacía equivale a Quincenal y una Fecha de la primera cuota vacía, a la fecha propuesta según la frecuencia. El cliente DEBE identificarse por su celular y existir en la base de clientes: un celular no registrado DEBE informarse como error y, si el nombre escrito en Cliente no coincide con el del cliente registrado con ese celular, DEBE advertirse. Cuotas pagadas indica cuántas cuotas, en orden y contando la inicial como la primera, ya se pagaron; no puede superar el Número de cuotas más uno cuando hay inicial, y esas cuotas DEBEN quedar pagadas como registradas por carga masiva, sin fecha, moneda ni tasa de pago, y sin sumar a lo cobrado en el mes. Esta carga NO DEBE editar financiamientos existentes ni registrar pagos de cuotas pendientes, que se marcan desde el panel.
- **FR-042**: La plantilla de congresos DEBE incluir las columnas Nombre, Desde y Hasta (obligatorias), Lugar, Especialidad, Notas e Identificador (vacío para los congresos nuevos).

#### Contacto por WhatsApp

- **FR-043**: La ficha del cliente y cada cuota pendiente DEBEN ofrecer una acción para abrir una conversación de WhatsApp con el celular del cliente.
- **FR-044**: Desde una cuota pendiente, la propietaria DEBE poder preparar un recordatorio en WhatsApp con un mensaje editable que incluya el nombre del cliente, la descripción del financiamiento, el número de cuota, la fecha de vencimiento, el monto en dólares y su equivalente en bolívares con la tasa oficial más reciente, indicando la tasa y su fecha. El sistema NO DEBE enviar mensajes por sí mismo.

### Key Entities *(include if feature involves data)*

- **Cliente**: Persona —normalmente un médico— a la que el negocio vende; tiene nombre, celular único, sexo, talla, ciudad, hospital, clínica, especialidad, notas y fechas de alta y de modificación, y puede tener varios financiamientos.
- **Financiamiento**: Compra a crédito de un cliente, con descripción, fecha de compra, calendario de cuotas, estado (Al día, Con cuotas vencidas, Pagado o Anulado) y motivo de anulación opcional; su total, lo pagado y su saldo se obtienen de sus cuotas.
- **Cuota**: Parte de un financiamiento con número de orden, indicación de si es la inicial, fecha de vencimiento, monto en dólares y estado pendiente o pagada; si está pagada, tiene un pago.
- **Pago de cuota**: Registro del cobro de una cuota con fecha de pago, moneda (dólares o bolívares), referencia opcional y origen del registro (panel o carga masiva); cuando se pagó en bolívares, incluye la tasa euro aplicada, su fecha, si fue la oficial obtenida automáticamente o una escrita a mano, y el monto en bolívares. Los pagos registrados por carga masiva no tienen fecha, moneda ni tasa.
- **Tasa euro**: Tasa oficial del euro del Banco Central de Venezuela para una fecha, en bolívares por euro, obtenida automáticamente de DolarAPI; se usa para calcular los equivalentes y proponer la tasa de los pagos en bolívares.
- **Congreso**: Evento en el que participa el negocio, con nombre, fechas de inicio y fin de día completo, lugar, especialidad y notas.
- **Valores de referencia**: Tallas, ciudades, hospitales, clínicas y especialidades ya registradas, que se ofrecen como sugerencias en los formularios y como listas en las plantillas.
- **Plantilla de sección**: Archivo de Excel descargable con instrucciones, valores permitidos y listas de referencia; en Clientes y Congresos también puede descargarse con los datos actuales, sus identificadores y la fecha de generación.
- **Carga masiva**: Operación iniciada al subir un archivo en una sección; pasa por los estados con errores, lista para confirmar, aplicada, cancelada, caducada o fallida, y reúne el resumen de cambios previstos o aplicados y sus incidencias. Solo se conserva mientras la operación está en curso.
- **Incidencia de validación**: Error que impide aplicar la carga o advertencia que requiere revisión, asociada a una fila y una columna del archivo y con un motivo comprensible.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La propietaria puede importar su listado actual de unos 2.000 médicos —pegarlo en la plantilla, subirlo, corregir los errores señalados y confirmar— en menos de 15 minutos, y el 100% de las filas confirmadas queda registrado con los datos del archivo.
- **SC-002**: La propietaria encuentra a cualquier cliente por nombre o por celular, en una base de más de 2.000 clientes, en menos de 10 segundos.
- **SC-003**: La propietaria registra un financiamiento con su calendario de cuotas en menos de 2 minutos y marca una cuota como pagada —en dólares o en bolívares— en menos de 30 segundos.
- **SC-004**: En el 100% de las pruebas, la suma de las cuotas es igual al total del financiamiento, el saldo es igual a la suma de las cuotas pendientes y el monto en bolívares de cada pago es igual a su monto en dólares multiplicado por la tasa aplicada, redondeado a dos decimales.
- **SC-005**: Al abrir la sección Pagos financiados, la propietaria identifica en menos de 1 minuto qué clientes tienen cuotas vencidas y cuánto suman.
- **SC-006**: La propietaria registra un congreso y lo ve pintado en el calendario en menos de 1 minuto; en el 100% de las pruebas, cada congreso aparece pintado exactamente en sus días, incluidos los que cruzan de mes y los que coinciden con otros.
- **SC-007**: Un archivo de hasta 5.000 filas se valida y muestra su vista previa en menos de 30 segundos, y los cambios confirmados se reflejan en la sección en menos de 1 minuto.
- **SC-008**: En el 100% de las pruebas con archivos que contienen errores no cambia ningún registro y cada error indica fila, columna y motivo; al menos el 90% de los errores de los archivos de prueba se corrige en el primer intento a partir del mensaje mostrado, sin asistencia técnica.
- **SC-009**: En el 100% de las pruebas de fallo o de cambios simultáneos durante una carga masiva, los datos quedan exactamente como antes de confirmar o con todos los cambios aplicados, nunca en un estado parcial; y volver a subir un archivo de clientes o de congresos ya aplicado no produce cambios.
- **SC-010**: El 100% de las solicitudes sin una sesión autorizada se rechaza sin exponer ni modificar datos de clientes, financiamientos, pagos o congresos, y ninguno de estos datos aparece en la vitrina pública.
- **SC-011**: Al menos el 95% de los pagos en bolívares se registra con la tasa oficial obtenida automáticamente, sin que la propietaria tenga que escribirla.

## Assumptions

- La propietaria es la única usuaria del panel; no se requieren roles, aprobaciones adicionales ni cuentas nuevas.
- La base de clientes toma como referencia la pestaña “Medicos” de la hoja de cálculo actual: unos 2.060 registros con nombre, celular, sexo (Mujer u Hombre), talla (de XS a XXXL), ciudad, hospital, clínica y especialidad, donde solo el nombre, el celular y el sexo están siempre completos. Se agrega el campo Notas. Aunque la mayoría de los clientes son médicos, la sección se llama Clientes y admite a cualquier persona.
- El seguimiento de cada cliente se limita al campo Notas; un historial de interacciones con fecha y los recordatorios de seguimiento quedan fuera de alcance.
- El celular identifica a cada cliente porque es el canal de contacto del negocio y no se repite en la hoja actual; por eso es obligatorio y único. En esa hoja hay al menos dos números con dígitos de más o de menos, que la importación señalará para que se corrijan.
- Las pestañas auxiliares de la hoja actual (Hospitales, Clinicas, Ciudades y Especialidades) no se gestionan como listas aparte: las sugerencias se forman con los valores usados en clientes, congresos y, para las tallas, el catálogo, y crecen al registrar valores nuevos.
- La sección de congresos toma como referencia la pestaña “Eventos” de la hoja actual (Desde, Hasta, Especialidad, Lugar y Nombre); las filas sin fechas de esa pestaña deberán completarse antes de importarse.
- Los financiamientos se pactan siempre en dólares y el bolívar es solo una moneda de pago. “Tasa euro” se refiere a la tasa oficial del euro del BCV aplicada directamente al monto en dólares, según la práctica del negocio, y se usa la tasa de la fecha en que el cliente paga.
- La tasa se obtiene de DolarAPI (sección Venezuela), un servicio público externo elegido por la propietaria que ofrece la tasa oficial del euro del BCV de cada día hábil y su histórico por fecha; los fines de semana y feriados no tiene tasa propia. La tasa se redondea a 2 decimales, como se comunica habitualmente (por ejemplo, Bs 985,73 por €), y con ese valor se calculan y se pueden verificar los montos en bolívares. Como depende de un servicio externo, las tasas obtenidas se conservan y la tasa puede escribirse a mano.
- “Quincenal” se interpreta como pagos los días 15 y último de cada mes, coincidiendo con las quincenas de cobro de sueldo; las fechas propuestas siempre pueden modificarse.
- No se calculan intereses, recargos por mora ni saldos a favor, ni se envían recordatorios automáticos.
- Como hoy ninguna venta descuenta existencias automáticamente, la propietaria sigue ajustando el inventario por separado cuando entrega mercancía financiada (FR-010).
- La sección Pagos financiados solo registra acuerdos y cobros realizados fuera de la aplicación (efectivo, transferencias, pago móvil, etc.): no procesa pagos, no mueve dinero, no se integra con bancos ni pasarelas de pago y no confirma los pedidos de la vitrina. La planificación debe confirmar, en la verificación de la constitución, que este registro es compatible con la restricción de que el panel no procese pagos ni confirme ventas y, si hiciera falta, proponer una enmienda aclaratoria.
- Los congresos son información interna del panel. Mostrarlos en la vitrina, sincronizarlos con Google Calendar o enviar recordatorios queda fuera de alcance: la referencia a Google Calendar es solo visual.
- Las fechas son de día completo y el día de hoy corresponde a la fecha de Venezuela.
- La carga masiva de las tres secciones sigue la misma dinámica y las mismas garantías que la carga masiva de inventario ya existente: plantilla, vista previa, errores que bloquean, advertencias, aplicación de todo o nada, caducidad a los 60 minutos y archivos subidos que no se conservan.
- Los límites de 10.000 filas y 4 MB por archivo superan el volumen previsto (unos 2.000 clientes y decenas de financiamientos y congresos) y podrán ajustarse en la planificación técnica sin cambiar el comportamiento descrito.
- No se incluye historial de cargas ni función para deshacer una carga; descargar los datos actuales antes de una carga sirve como respaldo.
- Los datos de clientes son datos personales: solo la propietaria accede a ellos y los archivos que descarga quedan bajo su responsabilidad.
- Estos datos no existen en Strapi, por lo que no forman parte de la migración desde esa fuente.
- Se espera que las plantillas se completen normalmente en una computadora, pero todas las pantallas deben funcionar también en teléfonos.
