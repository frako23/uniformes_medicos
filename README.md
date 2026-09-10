# Uniformes Médicos 2015

Catálogo web de uniformes médicos construido con Astro. La aplicación consulta los productos desde una API de Strapi, permite filtrarlos por categoría y género, guardar favoritos y preparar un pedido para enviarlo por WhatsApp.

## Tecnologías

- Astro 4 con TypeScript.
- Tailwind CSS para estilos.
- React y Nanostores para componentes e interacción en el cliente.
- Strapi como fuente de productos e imágenes.
- Adaptador serverless de Vercel con Node.js 20.

## Requisitos

- Node.js 20.x.
- npm.
- Una instancia de Strapi con el recurso `productos` y sus relaciones multimedia.

## Instalación y desarrollo

```bash
npm install
npm run dev
```

El sitio estará disponible normalmente en `http://localhost:4321`.

Para validar y generar la compilación de producción:

```bash
npm run build
npm run preview
```

## Variables de entorno

Crea un archivo `.env` en la raíz:

```env
STRAPI_URL=https://tu-instancia-de-strapi.com
STRAPI_TOKEN=tu-token-de-strapi
```

`STRAPI_URL` se usa para consultar productos y construir las URLs de las imágenes. `STRAPI_TOKEN` autoriza las consultas en el servidor. No publiques este archivo ni expongas el token en el navegador.

## Rutas principales

| Ruta | Descripción |
| --- | --- |
| `/` | Catálogo, filtros por categoría y género, favoritos y acceso al detalle. |
| `/productos/[id]` | Detalle de un producto. |
| `/cart` | Bolsa de productos favoritos y resumen del pedido. |
| `POST /api/cart-details` | Consulta en Strapi los productos incluidos en la bolsa. |

## Estructura

```text
public/                  Recursos estáticos y datos de referencia
src/components/          Botones y componentes reutilizables
src/layouts/             Layout global y metadatos
src/pages/               Rutas Astro y endpoint de la bolsa
src/stores/              Estado persistente de favoritos
src/utils/               Tipos y funciones de interfaz
docs/                    Documentación técnica
```

La documentación técnica completa está en [`docs/documentacion.md`](docs/documentacion.md).

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Ejecuta `astro check` y genera producción. |
| `npm run preview` | Sirve localmente la compilación. |
| `npm run astro` | Ejecuta comandos de la CLI de Astro. |

## Flujo de compra

1. El usuario selecciona productos desde el catálogo.
2. Los IDs se guardan en el store persistente `favorites` del navegador.
3. `/cart` envía esos IDs a `/api/cart-details`.
4. El endpoint consulta los productos en Strapi sin exponer el token.
5. Se genera un mensaje de pedido para WhatsApp.

## Despliegue

El proyecto está configurado para Vercel mediante `@astrojs/vercel` en modo serverless. Configura `STRAPI_URL` y `STRAPI_TOKEN` como variables de entorno en Vercel y usa Node.js 20.x.

## Nota sobre `public/data.json`

Es un archivo estático de referencia. El catálogo actual se obtiene desde Strapi; modificarlo no cambia los productos mostrados mientras no se conecte explícitamente a la interfaz.
