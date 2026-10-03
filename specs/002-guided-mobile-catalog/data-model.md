# Data Model: Navegación guiada del catálogo móvil

## Alcance de datos

Esta funcionalidad no agrega tablas, columnas, migraciones ni datos persistentes. PostgreSQL sigue siendo la fuente de productos, variantes, existencias, imágenes y estado de publicación. La selección del visitante vive únicamente durante la navegación actual.

## GuidedCatalogState

Representa el estado temporal que controla la vista pública.

| Campo | Tipo | Obligatorio | Regla |
|---|---|---:|---|
| `step` | `gender \| sizes \| garment \| results` | Sí | Determina la pregunta visible o la lista resultante. |
| `gender` | `Dama \| Caballero \| null` | Hasta el paso de género | Solo hay dos opciones principales; `Unisex` se incluye por compatibilidad, no como elección separada. |
| `sizeLabels` | lista de texto | Sí, puede estar vacía | Una lista vacía significa “Cualquier talla”; las etiquetas conservan el valor del inventario. |
| `garmentGroup` | `uniformes \| batas \| null` | Desde el paso de grupo | Se establece después de escoger tallas o “Cualquier talla”. |
| `view` | `guided \| all` | Sí | `all` es la salida secundaria para consultar el catálogo sin la selección progresiva. |

### Transiciones

```text
gender choice ──select gender──> sizes choice
sizes choice  ──select sizes───> garment choice
garment choice ─select group───> results
any step ──────back/change─────> previous step with compatible values
any step ──────reset───────────> gender choice with empty selection
any result ────view all────────> all catalog
```

- Cambiar género limpia tallas y grupo porque las opciones posteriores dependen del conjunto de productos compatible.
- Cambiar tallas conserva género y devuelve al paso de grupo si el grupo sigue siendo válido; si se selecciona un nuevo género, se reinicia la parte dependiente.
- Cambiar grupo solo recalcula resultados y conserva género y tallas.
- El historial del navegador conserva copias serializables del estado para `popstate`; no se guarda en base de datos ni en almacenamiento permanente.

## PublicCatalogFilterRecord

Es la representación mínima de cada producto que necesita la interacción del navegador.

| Campo | Tipo | Regla |
|---|---|---|
| `productId` | texto o número estable | Debe corresponder a la tarjeta y al identificador público existente. |
| `gender` | `Dama \| Caballero \| Unisex` | Proviene del producto público ya validado. |
| `typeLabel` | texto | Conserva el `Tipo` original para mostrarlo en la tarjeta y derivar el grupo. |
| `positiveSizeLabels` | lista de texto | Solo incluye variantes con `cantidad_actual > 0`; mantiene las etiquetas originales. |

## Reglas derivadas

1. **Disponibilidad base**: solo entra al conjunto público la información que ya devuelve `listPublicProducts`, que exige producto publicado, activo y al menos una variante con stock positivo.
2. **Género**: un producto coincide si `product.gender === selectedGender` o si `product.gender === "Unisex"`.
3. **Opciones de talla**: se calcula la unión ordenada de `positiveSizeLabels` de los productos compatibles con el género seleccionado.
4. **Talla seleccionada**: con `sizeLabels` vacía, cualquier producto compatible con stock positivo puede aparecer; con valores, basta una coincidencia entre la selección y `positiveSizeLabels`.
5. **Grupo**: se normaliza `typeLabel` sin mayúsculas ni diacríticos; si contiene `bata`, el grupo es `batas`; en cualquier otro caso es `uniformes`.
6. **Resultado**: un producto aparece si cumple género, grupo y regla de talla. Las tarjetas solo muestran sus tallas con stock positivo, de manera que no se presenta disponibilidad inventada.

## Estados de presentación relacionados

- **Carga**: la respuesta pública aún no tiene el catálogo listo.
- **Catálogo vacío**: no existen productos públicos disponibles.
- **Sin tallas compatibles**: el género elegido no tiene ninguna etiqueta con stock positivo; se ofrece volver, cambiar género o ver todo.
- **Sin resultados**: la combinación completa no coincide; se permite cambiar el último paso, quitar la restricción de talla o reiniciar.
- **Resultados**: se muestra el resumen de filtros, contador y tarjetas válidas.
- **Ver todo**: se muestran todos los productos del conjunto público inicial, sin aplicar género, talla ni grupo; los controles de compra existentes siguen funcionando.
