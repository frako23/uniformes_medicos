# Public Catalog Flow Contract

## Alcance

Este contrato describe el comportamiento público de `/` para la navegación guiada. No agrega endpoints ni modifica contratos administrativos. La fuente de los productos continúa siendo la respuesta server-rendered del catálogo público.

## Estados visibles

| Estado | Pregunta o contenido principal | Acción primaria | Acciones secundarias |
|---|---|---|---|
| `gender` | “¿Qué deseas ver?” con “Damas” y “Caballeros” | Elegir género | “Ver todo”, reiniciar si existe una selección previa |
| `sizes` | “¿Qué tallas deseas ver?” con opciones de stock positivo | Continuar con selección | “Cualquier talla”, volver, “Ver todo” |
| `garment` | “¿Qué deseas ver?” con “Uniformes” y “Batas” | Elegir grupo | Volver a tallas, “Ver todo”, reiniciar |
| `results` | Resumen de filtros, contador y tarjetas | Abrir detalle o preparar consulta | Cambiar género/tallas/grupo, quitar talla, reiniciar, ver todo |
| `all` | Catálogo público completo | Usar acciones de una tarjeta | Volver al recorrido, reiniciar |
| `empty` | Explicación contextual de que no hay coincidencias | Cambiar último criterio o ampliar | Quitar tallas, reiniciar, ver todo |
| `error` | Mensaje amigable de carga o consulta fallida | Reintentar | Volver, contactar al negocio si aplica |

## Reglas de interacción

- La entrada inicial muestra una sola pregunta principal y no presenta la cuadrícula completa antes de una elección, salvo el acceso secundario “Ver todo”.
- La elección de género es `Dama` o `Caballero`; los productos `Unisex` se incluyen en ambas.
- Las tallas se pueden seleccionar de forma múltiple. La ausencia de selección equivale a “Cualquier talla”.
- “Batas” incluye cualquier `Tipo` normalizado que contenga “bata”; “Uniformes” incluye el resto de tipos.
- El filtro se aplica después de cada paso a los candidatos y al contador; los resultados completos se muestran al completar el grupo.
- Una tarjeta de resultado debe conservar enlace al detalle, favorito, bolsa/WhatsApp y presentación de imagen, precio, tipo y tallas relevantes.
- El botón Atrás del navegador restaura el estado anterior del recorrido. Reiniciar elimina género, tallas, grupo y resultado.
- Ver todo no altera inventario ni convierte en disponibles productos agotados; solo omite las restricciones elegidas.

## Accesibilidad y móvil

- Las opciones se exponen como botones o controles nativos con nombre accesible y estado seleccionado anunciable.
- Cada paso tiene un encabezado identificable, progreso textual, foco visible y una acción principal operable con teclado.
- Los controles táctiles tienen al menos 44 píxeles de área; el contenido se adapta a 320 píxeles de ancho sin desplazamiento horizontal.
- Los mensajes de vacío, error y carga son legibles y no dependen únicamente de color o iconos.
- Las imágenes mantienen texto alternativo útil y las acciones existentes conservan nombres accesibles.

## Compatibilidad de datos

El flujo recibe por producto únicamente identificador público, género, tipo original y tallas con `cantidad_actual > 0` para filtrar en el navegador. Si el catálogo público no entrega datos, el flujo debe mostrar el estado de error o vacío correspondiente y nunca crear opciones de talla manualmente.
