# Documentación técnica

## 1. Propósito

Uniformes Médicos 2015 es un catálogo web para profesionales de la salud. Permite explorar prendas, filtrarlas, guardar favoritos y convertir una selección en una solicitud de compra por WhatsApp.

## 2. Arquitectura

La aplicación usa Astro con salida `server` y adaptador serverless de Vercel.

```text
Strapi (/api/productos)
          │
          ▼
src/pages/index.astro ──► catálogo, filtros y carruseles
          │
          ├──► Nanostore persistente/localStorage
          │                         │
          │                         ▼
          └──────────────────► /cart
                                    │
                                    ▼
                         POST /api/cart-details ──► Strapi
                                    │
                                    ▼
                              WhatsApp
```

La página inicial consulta hasta tres páginas de 100 productos de Strapi y combina sus resultados. Las imágenes se construyen anteponiendo `STRAPI_URL` a la ruta recibida.

## 3. Organización del código

- `src/pages/index.astro`: catálogo, consulta inicial, filtros, galería y acciones.
- `src/pages/productos/[id].astro`: detalle de un producto usando `documentId`.
- `src/pages/cart.astro`: carga favoritos, calcula el total y crea el mensaje de WhatsApp.
- `src/pages/api/cart-details.ts`: endpoint server-side que consulta productos por IDs.
- `src/pages/404.astro`: página para rutas inexistentes.
- `src/components/`: botones, bolsa, tarjetas y stock de tallas.
- `src/layouts/Layout.astro`: HTML base, metadatos Open Graph, favicon y estilos globales.
- `src/stores/favoritesStore.ts`: store persistente `favorites` en el navegador.
- `src/utils/types.ts`: contratos TypeScript de `Producto`, `Foto` y `TallaStock`.
- `src/utils/fucntions.ts`: representación de bolsa vacía.

## 4. Contrato de producto en Strapi

La interfaz `Producto` espera, como mínimo:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `number` | Identificador usado por la bolsa. |
| `documentId` | `string` | Identificador usado en la URL de detalle. |
| `Tipo` | `string` | Categoría de la prenda. |
| `Fabricantes` | `string` | Fabricante mostrado. |
| `Marca` | `string` | Marca mostrada. |
| `Genero` | `Dama \| Caballero \| Unisex` | Filtro y estilo visual. |
| `Precio` | `number` | Precio mostrado y sumado. |
| `Color` | `string` | Información descriptiva. |
| `Talla` | `TallaStock[]` | Tallas y cantidades disponibles. |
| `Foto` | `Foto[]` | Imágenes del carrusel. |

Las consultas usan `populate=*`; Strapi debe permitir la lectura de `productos` y sus imágenes.

## 5. Variables de entorno

```env
STRAPI_URL=https://strapi.example.com
STRAPI_TOKEN=token-privado
```

`STRAPI_TOKEN` debe existir solo en el entorno del servidor. En Vercel debe configurarse para Development, Preview y Production según corresponda.

## 6. API interna de la bolsa

### `POST /api/cart-details`

Recibe:

```json
{ "ids": [12, 18, 24] }
```

El endpoint genera una consulta `filters[id][$in]`, añade `populate=*` y devuelve la respuesta de Strapi. Sin IDs devuelve `{ "data": [] }`; si Strapi falla, conserva su estado de error; ante errores inesperados devuelve `500`.

## 7. Desarrollo y validación

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` ejecuta `astro check` antes de generar la salida de producción.

## 8. Despliegue

`astro.config.mjs` configura `output: "server"`, Tailwind, React, el adaptador `@astrojs/vercel/serverless`, runtime `nodejs20.x` y Web Analytics de Vercel. La URL pública configurada es `https://uniformes-medicos.vercel.app`; si cambia el dominio, actualiza `site` para mantener correctos los metadatos canónicos y Open Graph.

## 9. Mantenimiento

- Para añadir categorías, actualiza `categories` en `src/pages/index.astro`.
- Si cambia el modelo de Strapi, actualiza `src/utils/types.ts`, consultas y componentes consumidores.
- Mantén el token únicamente en variables de entorno.
- Si el catálogo supera 300 productos, revisa la estrategia actual de tres consultas paginadas.
- Si cambia el número de WhatsApp o el texto comercial, actualiza los enlaces en `index.astro` y `cart.astro`.

## 10. Limitaciones conocidas

- La carga inicial está limitada a tres páginas de 100 productos.
- La bolsa usa favoritos persistidos en el navegador y no cuentas de usuario.
- El total suma una unidad por producto y no contempla cantidades, impuestos ni envío.
- `public/data.json` es un recurso de referencia, no la fuente activa del catálogo.
