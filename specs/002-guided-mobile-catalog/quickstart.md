# Quickstart: Validar la navegación guiada del catálogo móvil

## Prerrequisitos

- Node.js 24.x y npm.
- PostgreSQL local o la instancia configurada en `DATABASE_URL`.
- `.env` configurado con `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `PUBLIC_SITE_URL` y las variables existentes del proyecto.
- Datos migrados o fixtures públicos que incluyan al menos productos de Dama, Caballero y Unisex, varias tallas con stock positivo, una bata y un tipo de uniforme.
- Navegadores de Playwright instalados para la validación E2E (`npx playwright install chromium webkit`).

## Preparar y ejecutar

Desde la raíz del repositorio:

```bash
npm install
npm run db:migrate
npm run dev
```

Abrir `http://localhost:4321/` en un teléfono o en la emulación móvil del navegador.

## Validación automatizada

Ejecutar las reglas puras y las pruebas de integración:

```bash
npm run test
```

La suite debe cubrir como mínimo:

1. `Dama` y `Caballero` incluyen productos `Unisex`.
2. Las opciones de talla solo incluyen etiquetas con stock positivo.
3. Una selección de varias tallas acepta un producto con stock en al menos una de ellas.
4. “Cualquier talla” no restringe por etiqueta, pero mantiene género, grupo y disponibilidad.
5. Tipos que contienen “Bata” se clasifican como `batas`; los demás como `uniformes`.
6. Productos sin publicación, inactivos o sin stock no pasan el filtro.

Ejecutar únicamente las pruebas públicas de lectura con una base de datos y almacenamiento accesibles:

```bash
$env:E2E = "1"
npx playwright test tests/e2e/public-catalog.spec.ts tests/e2e/public-catalog-navigation.spec.ts tests/e2e/public-catalog-mobile.spec.ts --project=chromium --project=mobile
```

El proyecto móvil debe verificar el recorrido en un viewport de teléfono y comprobar que la página no produce desplazamiento horizontal. La prueba debe cubrir selección, regreso, reinicio, “Ver todo”, estado sin resultados y conservación de una acción existente hacia detalle o WhatsApp.

La suite completa `npm run test:e2e` también incluye el flujo administrativo; debe ejecutarse únicamente contra una base de datos aislada porque ese flujo crea y actualiza un producto de prueba.

Validar el build completo:

```bash
npm run build
```

El build debe completar `astro check` y generar la aplicación sin errores de tipos o de compilación.

## Validación manual móvil

1. Abrir el catálogo desde una pantalla estrecha y confirmar que la primera vista contiene solo la pregunta de género, las dos opciones principales y “Ver todo”.
2. Elegir “Damas” y confirmar que las tallas disponibles corresponden a productos Dama o Unisex con stock positivo.
3. Elegir una o varias tallas, continuar y elegir “Batas”; verificar que ninguna tarjeta mostrada corresponde a un tipo que no sea bata.
4. Volver al paso de tallas, elegir “Cualquier talla” y comprobar que se amplían los resultados sin perder género ni grupo.
5. Forzar una combinación sin resultados y comprobar que el mensaje ofrece cambiar el último criterio, quitar tallas y reiniciar.
6. Usar Atrás del navegador o del dispositivo y confirmar que las respuestas previas reaparecen correctamente.
7. Reiniciar y abrir “Ver todo”; comprobar que el catálogo completo visible conserva imágenes, precios, tallas, favoritos, bolsa, detalle y WhatsApp.
8. Repetir con teclado y lector de foco visible; comprobar nombres accesibles, contraste, textos alternativos y ausencia de desplazamiento horizontal.
