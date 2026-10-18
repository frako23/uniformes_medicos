# Contract: Fuente de la tasa euro (DolarAPI, sección Venezuela)

## Alcance

Este contrato define cómo el servidor consume la tasa oficial del euro del BCV publicada por DolarAPI, la fuente elegida por la propietaria (clarificación de la especificación, FR-015). Es una interfaz externa de solo lectura: el servidor no envía ningún dato del negocio. La implementación vive en `src/server/financing/euro-rates.ts`.

## Endpoint consumido

```http
GET https://ve.dolarapi.com/v1/historicos/euros/oficial
Accept: application/json
```

- **Autenticación**: no requiere.
- **Respuesta**: `200` con un arreglo JSON. El 2026-10-18 tenía 912 elementos, desde el 2023-01-03, y ocupaba unos 136 KB.
- **Caché**: la respuesta lleva `Cache-Control: public, max-age=0, must-revalidate`, así que el servidor no puede depender de una caché intermedia.

Cada elemento tiene esta forma:

```json
{ "fuente": "oficial", "compra": null, "venta": null, "promedio": 991.16445734, "fecha": "2026-10-19", "moneda": "EUR" }
```

| Campo | Uso |
|---|---|
| `fecha` | Fecha valor del BCV, en formato `AAAA-MM-DD`. Se guarda en `euro_rates.rate_date` |
| `promedio` | Tasa en bolívares por euro. Se guarda en `source_value` y, redondeada a 2 decimales half-up, en `value` |
| `moneda` | Debe ser `"EUR"`; se descartan los elementos con otro valor |
| `fuente` | Debe ser `"oficial"`; se descartan los elementos con otro valor |
| `compra`, `venta` | Se ignoran: llegan en `null` para la tasa oficial |

## Semántica verificada (2026-10-18, domingo)

| Observación | Conclusión |
|---|---|
| El histórico ya contenía `2026-10-19` (lunes) = `991.16445734`, y bcv.org.ve mostraba “Fecha Valor: Lunes, 19 Octubre 2026”, EUR `991,16445734` | `fecha` es la fecha valor del BCV; la tasa del día hábil siguiente aparece en cuanto el BCV la publica |
| No hay entradas en fines de semana ni el 2026-10-12, que fue feriado | Solo hay tasas en días hábiles |
| `GET /v1/euros/oficial` devolvía `985.729808` con `fechaActualizacion` 2026-10-16 | La tasa vigente un domingo es la del último día hábil |
| `GET /v1/historicos/euros/oficial/2026/10/17` respondía `404` | El endpoint por fecha no sirve para fines de semana; por eso se usa la lista |

**Regla aplicable**: la tasa de una fecha D es la de la entrada con la mayor `fecha` que sea ≤ D. Por ejemplo, el sábado 17 y el domingo 18 de octubre de 2026 aplica la tasa del 16/10, Bs 985,73 por €, y desde el lunes 19 la del 19/10, Bs 991,16 por €.

## Política de sincronización

`ensureEuroRates(today)` descarga el histórico solo si se cumplen ambas condiciones:

1. `MAX(euro_rates.rate_date) < today`, donde `today` es la fecha de hoy en `America/Caracas`;
2. pasaron más de 30 minutos desde el último intento en esa instancia del servidor, sin importar si salió bien o mal.

| Aspecto | Regla |
|---|---|
| Disparadores | Al abrir `/admin/pagos-financiados`, el detalle de un financiamiento, `GET /api/admin/euro-rate` y la resolución de la tasa al registrar un pago en bolívares |
| Tiempo máximo | 3 s (`AbortSignal.timeout(3000)`) |
| Tamaño máximo | 2 MB. Si el cuerpo los supera, se aborta y se trata como fallo |
| Validación | Con Zod: arreglo de objetos con `fecha` en formato `AAAA-MM-DD` y `promedio` numérico finito > 0 y < 10¹². Los elementos inválidos se descartan uno a uno |
| Escritura | `INSERT … ON CONFLICT (rate_date) DO NOTHING`, por lotes de 1.000. Las tasas existentes no se modifican |
| Primera ejecución | Inserta el histórico completo, desde 2023 |
| Registros del servidor | Solo `{ status, durationMs, inserted }`; nunca el cuerpo |

## Fallos

La sección nunca muestra errores técnicos ni queda inutilizable (constitución IV).

| Caso | Comportamiento |
|---|---|
| Tiempo agotado, error de red, respuesta distinta de `2xx`, cuerpo demasiado grande o JSON inválido | No se escribe nada. Se usa la última tasa guardada (`stale: true`) y la interfaz indica su fecha |
| No hay ninguna tasa guardada | `status: "unavailable"`. Los pagos en bolívares exigen escribir la tasa a mano (`rate_source = 'manual'`) y los equivalentes en Bs no se muestran |
| La fuente cambia su formato | La validación descarta los elementos, el caso equivale a un fallo y se registra `inserted: 0` |

## Redondeo

`value = round_half_up(promedio, 2)`, calculado sobre la representación decimal en texto para evitar errores binarios:

| `promedio` | `value` |
|---|---|
| `991.16445734` | `991.16` |
| `985.729808` | `985.73` |
| `18.735` | `18.74` |

El monto en bolívares de un pago es `round_half_up(amount_usd × value, 2)`, calculado con enteros. Por ejemplo, $25,00 × 991,16 da Bs 24.779,00.

## Pruebas

- **Unitarias**: elección de la tasa aplicable (día hábil, fin de semana, feriado y fecha anterior a la primera tasa), redondeo y validación de elementos.
- **Integración**: con `fetch` simulado se cubren el éxito, el `404`, el tiempo agotado, un cuerpo enorme y el JSON inválido. También se comprueba que una tasa existente no cambia cuando la fuente devuelve otro valor para la misma fecha.
- **Sin red**: ninguna prueba automatizada llama a la red real. La comprobación manual contra DolarAPI forma parte de [quickstart.md](../quickstart.md).
