# Contract: Pantallas de Clientes, Pagos financiados y Congresos

## Reglas comunes

- **Acceso**: todas las páginas viven bajo `/admin/**`, protegidas por el middleware. Sin sesión redirigen a `/admin/login`.
- **Diseño**: usan `AdminLayout`, `max-w-7xl` y tarjetas blancas `rounded-xl shadow-sm`, con el estilo de `/admin/productos`.
- **Formatos**:

  | Dato | Formato | Ejemplo |
  |---|---|---|
  | Dólares | `formatMoney` | `$1.234,50` |
  | Bolívares | `formatBolivares` | `Bs 24.779,00` |
  | Tasa | `formatEuroRate` | `Bs 991,16 por €` |
  | Fechas | `formatDate` | `dd/mm/aaaa` |
  | Meses | `formatMonthYear` | “octubre de 2026” |
  | Celular | `formatPhone` | `0414-246-7789` |

- **Estados**: cada pantalla tiene estados de carga, vacío, error y éxito (FR-003). Los errores se muestran con `role="alert"` y texto, no solo con color.
- **Confirmaciones**: eliminar, anular, restaurar, deshacer un pago y registrar un pago usan un `<dialog>` modal (`ConfirmDialog.astro` o `PaymentDialog.astro`). El diálogo atrapa el foco, se cierra con Escape y devuelve el foco al botón que lo abrió. Al terminar, la pantalla anuncia el resultado en una región `role="status"`.
- **Envíos**: un botón de envío queda deshabilitado mientras hay una petición en curso, y un segundo clic no genera otra.
- **Accesibilidad y tamaño**:
  - foco visible;
  - áreas táctiles de al menos 44 × 44 px;
  - contraste de al menos 4.5:1;
  - sin desplazamiento horizontal de la página a 320 px. En pantallas estrechas las tablas se reemplazan por tarjetas.

## Navegación del panel (`AdminLayout.astro`)

- **Enlaces**, en este orden: Productos, Clientes, Pagos financiados, Congresos, Estadísticas, Ver vitrina y Salir. El enlace de la sección activa lleva `aria-current="page"`.
- **Pantallas estrechas**: por debajo de 768 px, los enlaces se agrupan en un `<details>` con un `<summary>` “Menú”, sin JavaScript. El botón Salir sigue visible.
- **Inicio** (`/admin`): el texto pasa a “Gestiona productos, clientes, pagos financiados y congresos” e incluye un acceso a cada sección.

## Clientes

### `/admin/clientes`

- **Encabezado**: “Clientes”, “N clientes en total” y las acciones “Carga masiva” y “Nuevo cliente”, como en Productos.
- **Formulario `GET`**:
  - búsqueda “Nombre o celular” (`search`);
  - filtros `<select>` de Especialidad, Ciudad, Hospital, Clínica, Sexo, Talla y Saldo (Todos, Con saldo pendiente, Con cuotas vencidas), con opciones tomadas de los valores de referencia;
  - “Mostrar por página” (20, 50 o 100);
  - los botones “Aplicar” y “Quitar filtros”, este último un enlace sin parámetros.
- **Resultados**:
  - “N resultados” cuando hay búsqueda o filtros;
  - tabla en escritorio o tarjetas en móvil, con Nombre (enlace a la ficha), Celular, Especialidad, Ciudad, Talla y Saldo. El saldo solo aparece si es mayor que 0 y lleva la etiqueta “Vencido” si hay cuotas vencidas.
- **Estados vacíos**:
  - Base vacía: “Todavía no hay clientes.” con “Registrar cliente” y “Usar carga masiva”.
  - Sin resultados: “No hay clientes que coincidan.” con “Quitar filtros”.
- **Paginación**: “Página X de Y” y los enlaces Anterior y Siguiente, como en Productos.

### `/admin/clientes/nuevo` y edición en `/admin/clientes/[ref]`

- **Formulario** (`ClientForm.astro`):
  - Nombre y Celular son obligatorios. Celular lleva la ayuda “Ej.: 0414-123-4567. Otro país: +57 300…”.
  - Sexo es un `<select>` con “Sin indicar”, “Mujer” y “Hombre”.
  - Talla, Ciudad, Hospital, Clínica y Especialidad usan `SuggestInput.astro` (`<input list>` con `<datalist>` de los valores de referencia).
  - Notas es un `<textarea>` con contador hasta 1.000 caracteres.
- **Errores**: los errores `422` se muestran junto a cada campo y el foco va al primer campo con error. El error `409 PHONE_IN_USE` se muestra junto a Celular con un enlace a la ficha del otro cliente.
- **Al guardar**: tras crear un cliente, la página pasa a su ficha con el anuncio “Cliente guardado”.

### `/admin/clientes/[ref]` (ficha)

- **Datos**: muestra todos los datos del cliente, con el celular en formato legible.
- **Acciones**:
  - “Editar”, que muestra el formulario en la misma página;
  - “Escribir por WhatsApp”, un enlace a `https://wa.me/<dígitos>` que abre una pestaña nueva con `rel="noopener noreferrer"` (FR-043);
  - “Nuevo financiamiento”, que lleva a `/admin/pagos-financiados/nuevo?cliente=<ref>`;
  - “Eliminar”.
- **Financiamientos**: lista con la descripción, la fecha de compra, el total, lo pagado, el saldo, el estado (insignia con texto) y un enlace al detalle. Si no hay ninguno, el texto es “Sin financiamientos”.
- **Eliminar**:
  - sin financiamientos, un diálogo confirma la acción y, al terminar, la página vuelve a la lista con el anuncio “Cliente eliminado”;
  - con financiamientos, el botón queda deshabilitado con la explicación visible “No se puede eliminar porque tiene financiamientos”. Si el servidor responde `409`, se muestra el mismo mensaje.

### `/admin/clientes/carga-masiva`

Usa `BulkUpload.astro` (ver “Carga masiva”) con:

- **Título**: “Carga masiva de clientes”.
- **Descargas**: “Descargar plantilla vacía” (“Para registrar clientes nuevos o pegar las filas de tu hoja de médicos”) y “Descargar clientes actuales” (“Para corregir datos de los clientes que ya tienes”).
- **Límites visibles**: “.xlsx de hasta 4 MB y 10.000 clientes. También puedes subir tu propio libro si su primera hoja tiene las columnas Nombre y Celular.”

## Pagos financiados

### `/admin/pagos-financiados`

- **Encabezado**: “Pagos financiados” y las acciones “Carga masiva” y “Nuevo financiamiento”.
- **Resumen**: cuatro tarjetas rotuladas, con montos en `$`: “Por cobrar”, “Vencido”, “Vence en 15 días” y “Cobrado este mes” (FR-017).
- **Tasa**: “Tasa euro BCV: Bs 991,16 por € (19/10/2026)”.
  - Si la fuente no respondió, se agrega “No se pudo actualizar; se muestra la última tasa disponible”.
  - Si no hay ninguna tasa: “Sin tasa disponible: los montos en bolívares se calcularán al registrar el pago”.
- **Filtros `GET`**:
  - estado, con las pestañas o `<select>` Vencidas, Próximas (15 días), Todas las pendientes y Pagadas;
  - cliente, que se busca por nombre o celular;
  - rango de fechas “Desde” y “Hasta”;
  - tamaño de página.
- **Lista**: tabla en escritorio o tarjetas en móvil, ordenada por vencimiento. Cada fila incluye:
  - casilla de selección (solo en cuotas pendientes de financiamientos no anulados);
  - cliente (enlace a la ficha) y descripción con enlace al financiamiento;
  - cuota (“Inicial” o “2 de 4”) y vencimiento;
  - estado con texto: “Vencida hace 3 días”, “Vence hoy” o “Por vencer”;
  - monto en `$` y su equivalente en `Bs`;
  - acciones “Registrar pago” y “Recordar por WhatsApp” (US8).
- **Selección múltiple**: con al menos una cuota seleccionada aparece una barra “N cuotas seleccionadas · Total $X · Registrar pago” (US4-5).
- **Estados vacíos**:
  - “No hay cuotas pendientes.”, o el mensaje equivalente de cada filtro;
  - base sin financiamientos: “Todavía no hay financiamientos.” con “Nuevo financiamiento” y “Usar carga masiva”.

### Diálogo “Registrar pago” (`PaymentDialog.astro`)

- **Contenido**: el resumen de las cuotas (cliente, cuota, monto en `$`) y el total.
- **Campos**:
  - **Fecha de pago**: `<input type="date">`, con `max` igual a hoy en Caracas y hoy como valor por defecto.
  - **Moneda**: un grupo de radios con “Dólares” y “Bolívares”.
  - **Con “Bolívares”**: un recuadro de tasa con estos estados:

    | Estado | Contenido |
    |---|---|
    | `cargando` | “Obteniendo la tasa euro BCV…” |
    | `oficial` | “Tasa euro BCV del 19/10/2026: Bs 991,16 por €”, más un campo editable con ese valor. Si se cambia, el texto pasa a “Tasa escrita a mano” y `source` cambia a `manual` |
    | `sin_tasa` | “No se pudo obtener la tasa oficial para esa fecha. Escríbela para continuar.” El campo es obligatorio |
    | `desactualizada` | Igual que `oficial`, más la nota “la fuente no respondió; es la última tasa guardada” |

    Al cambiar la fecha de pago, la tasa se vuelve a consultar con `GET /api/admin/euro-rate?date=`.
  - **Monto en bolívares**: se calcula en vivo por cuota y en total (`round2(USD × tasa)`), y se muestra como “Bs 24.779,00”.
  - **Pago parcial**: solo con una cuota seleccionada. Una casilla “El cliente pagó solo una parte” muestra “Monto recibido ($)”, con mínimo $0,01 y máximo la cuota menos $0,01, y la nota “El resto ($X) quedará pendiente con la misma fecha”.
  - **Referencia**: campo opcional con el texto de ayuda “Ej.: pago móvil 1234”.
- **Envío**: el botón “Registrar pago” queda deshabilitado mientras se envía.
- **Respuestas**:
  - con `200`, el diálogo se cierra, la lista y el resumen se actualizan y se anuncia “Pago registrado”;
  - con `409`, el diálogo muestra el mensaje y ofrece “Recargar”.

### `/admin/pagos-financiados/nuevo`

- **Cliente**: buscador accesible “Buscar cliente por nombre o celular”. Una lista de resultados de botones de opción selecciona el cliente. Con `?cliente=<ref>`, el cliente viene preseleccionado y se puede cambiar. Si no hay resultados, aparece “Registrar cliente”.
- **Datos**:
  - Descripción (`<textarea>`, obligatoria);
  - Fecha de compra (por defecto hoy, máximo hoy);
  - Monto total ($);
  - Inicial ($, opcional);
  - Número de cuotas (1–48);
  - Frecuencia (Quincenal por defecto, Semanal o Mensual);
  - Fecha de la primera cuota, que se propone con `defaultFirstDueDate` y se puede cambiar.
- **Calendario propuesto**: se calcula en el navegador con `financing-schedule.ts` cada vez que cambia un dato de generación. Es una tabla editable de fecha y monto por cuota, con la inicial marcada.
  - **Totales**: “Total del financiamiento: $X” es la suma de las cuotas. Si difiere del monto escrito, se avisa “El total ($X) difiere del monto indicado ($Y)” sin impedir guardar (US3-3).
  - **Errores por fila**: fecha anterior a la compra o monto menor o igual a 0.
  - **Regenerar**: un botón “Volver a generar” descarta las ediciones, con confirmación.
- **Guardar**: “Guardar financiamiento” envía `POST /api/admin/financings` y lleva al detalle con el anuncio “Financiamiento registrado”.

### `/admin/pagos-financiados/[ref]`

- **Encabezado**: “Financiamiento #12”, cliente (enlace), descripción, fecha de compra, frecuencia, estado (insignia con texto) y origen si vino de la carga masiva.
- **Totales**: Total, Pagado y Saldo.
- **Calendario**: tabla o tarjetas con cuota, vencimiento, monto y estado.
  - Las cuotas pagadas muestran la fecha de pago, la moneda, la tasa con su fecha u origen “escrita a mano”, el monto en Bs y la referencia.
  - Las pagadas por carga masiva dicen “Pagada (registrada por carga masiva)”.
  - Acciones por cuota: “Registrar pago” y “Recordar por WhatsApp” en las pendientes; “Deshacer pago”, con confirmación, en las pagadas.
- **Editar calendario**:
  - convierte las cuotas pendientes en filas editables de fecha y monto, con “Agregar cuota” (la fecha se propone con `nextDueDate` de la frecuencia) y “Quitar”;
  - muestra el nuevo total y el nuevo saldo antes de guardar;
  - las cuotas pagadas no se pueden editar y llevan la nota “Deshaz el pago para modificarla”.
- **Anular y restaurar**: “Anular”, con diálogo y motivo opcional, deja la insignia “Anulado”, deshabilita los pagos y la edición, y muestra “Restaurar”.
- **Eliminar**: “Eliminar” solo está habilitado sin cuotas pagadas. Si hay alguna, aparece “Tiene pagos registrados: puedes anularlo” junto al botón deshabilitado.
- **Conflicto** (`409` por `expectedUpdatedAt`): “El financiamiento cambió; recarga la página.” con un botón “Recargar”.

### Recordatorio por WhatsApp (US8)

- **Destino**: un enlace a `https://wa.me/<dígitos>?text=<mensaje>`, en una pestaña nueva.
- **Mensaje**: lo construye `src/utils/whatsapp.ts` (`buildInstallmentReminder`):

  > Hola {nombre}, te escribo de Uniformes Médicos 2015 para recordarte la cuota {Inicial / 2 de 4} de “{descripción}”, {con vencimiento el / vencida el} {dd/mm/aaaa}: {$25,00}{ (Bs 24.779,00 a tasa euro BCV de Bs 991,16 del 19/10/2026)}. ¡Gracias!

  - La parte en bolívares se omite si no hay ninguna tasa.
  - El mensaje es editable en WhatsApp, y el sistema no envía nada por sí mismo.

### `/admin/pagos-financiados/carga-masiva`

Usa `BulkUpload.astro` con:

- **Título**: “Carga masiva de financiamientos”.
- **Descarga**: solo “Descargar plantilla”, con el texto “Una fila por financiamiento. Para financiamientos en curso, indica cuántas cuotas ya se pagaron”.
- **Límites**: “.xlsx de hasta 4 MB y 2.000 financiamientos. Los clientes deben estar registrados.”

## Congresos

### `/admin/congresos` (calendario)

- **Encabezado**: “Congresos” y las acciones “Carga masiva” y “Nuevo congreso”.
- **Controles**:
  - “‹ Mes anterior”, “Hoy” y “Mes siguiente ›”, que son enlaces `?mes=AAAA-MM`;
  - el título del mes (“octubre de 2026”), en un `<h2>` que anuncia el cambio de mes;
  - el selector de vista “Calendario | Lista” (`?vista=lista`).
- **Cuadrícula** (`CongressCalendar.astro`, a partir de `buildMonthView`):
  - siete columnas de domingo a sábado con encabezados abreviados (“dom”, “lun”…) que llevan el nombre completo en `abbr`;
  - los días de los meses vecinos aparecen atenuados;
  - el día de hoy lleva un círculo y `aria-current="date"`.
- **Número de día**: es un enlace con el nombre accesible “Registrar congreso el 12 de octubre de 2026” que lleva a `/admin/congresos/nuevo?desde=AAAA-MM-DD` (FR-023).
- **Franjas**: cada congreso es una franja de color estable con su nombre en texto oscuro, que se extiende por sus días dentro de cada semana. Si continúa antes o después de la semana, la franja muestra un borde en ángulo y la palabra “continúa” para lectores de pantalla.
  - Cada franja es un enlace al detalle con el nombre accesible “{Nombre}, del 30 de octubre al 1 de noviembre de 2026”.
  - Los congresos que coinciden ocupan carriles distintos.
- **Desbordamiento**: se muestran como máximo 3 carriles en escritorio y 2 en tableta. Si un día tiene más congresos, aparece un `<details>` “+N más” con la lista de ese día.
- **Teléfono** (menos de 640 px): las franjas se reducen a barras de color sin texto, con `aria-hidden`, para seguir indicando los días con congreso (FR-024). Debajo de la cuadrícula aparece la lista de los congresos del mes, con nombre, fechas, lugar y enlace.
- **Mes sin congresos**: “No hay congresos en octubre de 2026.” y, si existe, “El próximo es {nombre}, el {dd/mm/aaaa}”, con un enlace a su mes.

### `/admin/congresos?vista=lista`

- **Contenido**: la lista “Próximos congresos”, ordenada por fecha de inicio, con nombre, fechas (“30/10/2026 – 01/11/2026 · 3 días”), lugar, especialidad y enlace al detalle. Un `<details>` “Congresos pasados” contiene los terminados, del más reciente al más antiguo.
- **Uso**: es la alternativa accesible al calendario (FR-024) y se puede usar completa con teclado.

### `/admin/congresos/nuevo` y `/admin/congresos/[ref]`

- **Formulario** (`CongressForm.astro`):
  - Nombre (obligatorio);
  - Desde y Hasta (`<input type="date">`; Hasta toma el valor de Desde si estaba vacía o era anterior);
  - Lugar;
  - Especialidad (`SuggestInput`);
  - Notas.
- **Validación**: un error de fechas se muestra en el campo “Hasta”.
- **Al guardar**: la página lleva al calendario del mes de inicio con el congreso visible y anuncia “Congreso guardado”.
- **Detalle**: muestra los datos con “N días”, más “Editar”, “Eliminar” (con confirmación) y “Ver en el calendario”.

### `/admin/congresos/carga-masiva`

Usa `BulkUpload.astro` con:

- **Título**: “Carga masiva de congresos”.
- **Descargas**: “Descargar plantilla vacía” y “Descargar congresos actuales”.
- **Límites**: “.xlsx de hasta 4 MB y 10.000 congresos. Las columnas Desde, Hasta, Especialidad, Lugar y Nombre coinciden con tu pestaña Eventos.”

## Carga masiva (`BulkUpload.astro`, común a las tres secciones)

- **Estructura y estados**: tiene las mismas secciones (Descargar, Subir archivo, Vista previa y Resultado) y los mismos estados que la pantalla de inventario: `inicial`, `archivo_no_admitido`, `validando`, `rechazado`, `con_errores`, `sin_cambios`, `lista`, `aplicando`, `aplicada`, `no_aplicada`, `fallo` y `sesion_caducada`. También comparte las reglas de interacción, la accesibilidad y el diseño móvil ([../../003-carga-masiva-inventario/contracts/bulk-inventory-ui.md](../../003-carga-masiva-inventario/contracts/bulk-inventory-ui.md)).
- **Configuración**: el componente recibe la sección, las rutas, los textos de las descargas y los límites.
- **Resumen**: muestra “Nuevos”, “Con cambios”, “Sin cambios”, “Errores” y “Advertencias”. Financiamientos agrega “Cuotas”, “Monto financiado” y “Saldo pendiente” en `$`.
- **Archivo procesado**: “Se procesó la hoja «Medicos»” cuando no es la hoja de la sección, para que la propietaria sepa qué se leyó.
- **Cambios por sección**:

  | Sección | Cómo se muestra cada cambio |
  |---|---|
  | Clientes | Tarjeta con fila de Excel, “Nuevo” o “#ref”, y la etiqueta “reconocido por celular” cuando corresponde. Cada campo aparece como “Ciudad: Valencia → Caracas”, y los vacíos como “Talla: M → se borrará”. Al final, las advertencias |
  | Financiamientos | Tarjeta con fila, cliente, descripción y el resumen “Inicial $20,00 (pagada) + 4 cuotas quincenales de $25,00, del 15/09/2026 al 31/10/2026; 2 ya pagadas”. El botón “Ver fechas” despliega la lista reconstruida con `financing-schedule.ts` |
  | Congresos | Igual que clientes, con la etiqueta “Nombre · 30/10/2026 – 01/11/2026” |

- **Resultado**: “N clientes creados y M actualizados”, o el equivalente de cada sección, con listas plegables de enlaces a cada registro y la acción “Hacer otra carga”.
