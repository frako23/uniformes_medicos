# Contract: Pantalla de carga masiva de inventario

## Ruta y acceso

- **Página**: `/admin/productos/carga-masiva`, protegida por el middleware del panel. Sin sesión redirige a `/admin/login`.
- **Acceso desde el panel**: `/admin/productos` muestra el enlace “Carga masiva” junto a “Nuevo producto” (FR-002). La página tiene un enlace “← Volver a productos”.
- **Secciones**, en orden y en una sola columna en pantallas estrechas:
  1. **Descargar**: “Descargar plantilla vacía”, para productos nuevos, y “Descargar inventario actual”, para editar. Cada botón tiene una línea explicativa.
  2. **Subir archivo**: selector de archivo (`accept=".xlsx"`), límites visibles (“.xlsx de hasta 4 MB y 5.000 productos”) y el botón “Validar archivo”.
  3. **Vista previa**: aparece después de validar.
  4. **Resultado**: aparece después de aplicar.

## Estados visibles

| Estado | Contenido principal | Acción primaria | Acciones secundarias |
|---|---|---|---|
| `inicial` | Descargas, selector y límites | “Validar archivo”, deshabilitado sin archivo | Descargar plantilla o inventario |
| `archivo_no_admitido` | Mensaje local de extensión distinta de `.xlsx` o tamaño mayor de 4 MB, sin subir el archivo | Elegir otro archivo | — |
| `validando` | “Validando archivo…” con indicador de progreso; controles deshabilitados | — | — |
| `rechazado` | Mensaje del 422, por ejemplo “El archivo está protegido con contraseña…” | Elegir otro archivo | Descargar plantilla |
| `con_errores` | Resumen; alerta “Corrige N errores y vuelve a subir el archivo”; errores agrupados por columna y motivo, con filas; advertencias | Elegir archivo corregido | Descargar inventario o plantilla. “Confirmar” no se muestra o queda deshabilitado |
| `sin_cambios` | “El archivo no contiene cambios respecto del inventario actual.” con el resumen | Elegir otro archivo | — |
| `lista` | Resumen; advertencias; secciones “Productos nuevos (N)” y “Productos con cambios (N)”; “Esta vista previa vence a las HH:MM” | “Confirmar y aplicar cambios” | “Cancelar”, que limpia la vista previa y el selector sin llamar al servidor |
| `aplicando` | “Aplicando cambios…”; botones deshabilitados; aviso de no cerrar la página | — | — |
| `aplicada` | “Cambios aplicados” con productos creados y actualizados, tallas creadas y existencias modificadas; listas plegables de productos creados y actualizados con enlace a cada uno | “Ver productos” | “Agregar fotos” por cada producto creado; “Hacer otra carga” |
| `no_aplicada` | Mensaje del 409: vista previa vencida, inventario cambiado, archivo distinto u otra carga en curso, siempre con “No se aplicó ningún cambio” | “Validar de nuevo”, que reenvía el mismo archivo a la vista previa | Elegir otro archivo |
| `fallo` | Error de red o 500: “No se aplicó ningún cambio. Inténtalo de nuevo.” | Reintentar la última acción | Elegir otro archivo |
| `sesion_caducada` | “Tu sesión expiró. Inicia sesión y vuelve a subir el archivo.” | Ir a iniciar sesión | — |

## Presentación de la vista previa

- **Resumen**: muestra siete contadores rotulados: productos nuevos, productos con cambios, sin cambios, tallas nuevas, existencias modificadas, errores y advertencias. Ninguno depende solo del color.
- **Incidencias**:
  - Aparecen agrupadas en el orden errores, advertencias y avisos.
  - Cada grupo indica columna (si aplica), motivo y filas (“Filas 9–12 y 20”).
  - Los errores van primero, dentro de un contenedor con `role="alert"`.
- **Cambios**: cada producto se muestra como una tarjeta o fila con:
  - fila de Excel, ID (o “Nuevo”) y la etiqueta `Tipo · Marca · Color · Género`;
  - los datos que cambian en formato “Precio: $50.00 → $55.00”;
  - las tallas en formato “M: 5 → 8”, o “4XL: nueva → 2”;
  - la disponibilidad resultante (“Dejará de estar disponible”), si cambia;
  - sus advertencias.
- **Listas largas**: las secciones de cambios se pueden plegar (`<details>`) y se muestran en bloques de 50 con “Mostrar más”, para que una lista de 1.000 productos siga siendo navegable.
- **Formato de números**: precios con dos decimales y moneda `$`, igual que el listado de productos del panel (`$50.00`). Las existencias se muestran como enteros.

## Reglas de interacción

- **Antes de subir**: el navegador comprueba la extensión `.xlsx` y el tamaño de 4 MB.
- **Archivo en memoria**: el navegador conserva el `File` seleccionado y lo reenvía al confirmar o al “Validar de nuevo”. Si la propietaria cambia el archivo seleccionado, la vista previa anterior se descarta.
- **Una petición a la vez**: mientras hay una petición en curso, los botones de validar y confirmar quedan deshabilitados. Un segundo clic no genera otra petición.
- **Conflictos**: al recibir 409, la pantalla conserva el archivo elegido y ofrece “Validar de nuevo”. No reintenta la confirmación de forma automática.
- **Vencimiento**: cuando la vista previa vence, el botón de confirmar se deshabilita y aparece “La vista previa venció; valida el archivo de nuevo.”
- **Acciones sin servidor**: cancelar, cambiar de archivo o salir de la página no llaman al servidor ni modifican datos.

## Accesibilidad y móvil

- **Etiquetas**: el selector de archivo tiene etiqueta visible y descripción asociada con los límites (`aria-describedby`).
- **Anuncios**: los estados `validando`, `aplicando`, `aplicada`, `no_aplicada` y `fallo` se anuncian en una región `role="status"` / `aria-live="polite"`. Los errores de archivo usan `role="alert"`.
- **Foco**: al terminar la validación, el foco va al encabezado de la vista previa, o a la alerta de errores si los hay. Al terminar la aplicación, va al encabezado del resultado.
- **Teclado**: todos los controles son operables con teclado y tienen foco visible.
- **Tamaños**: las áreas táctiles miden al menos 44 × 44 píxeles. A 320 píxeles de ancho la página no se desplaza horizontalmente: las tarjetas reemplazan a las tablas y los textos largos se ajustan.
- **Contraste**: el contraste del texto es al menos 4.5:1. Errores y advertencias combinan icono o texto con el color.
