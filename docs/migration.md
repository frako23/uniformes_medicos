# Procedimiento de migración y corte

## Preparación

1. Crea una base PostgreSQL y un almacenamiento Blob separados de producción.
2. Configura `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `STRAPI_URL`, `STRAPI_TOKEN` y `MIGRATION_REPORT_DIR` solo en el entorno controlado de migración.
3. Aplica `npm run db:migrate` y guarda una copia de la configuración y del export de origen.

## Importación

Ejecuta primero:

```bash
npm run migrate:strapi -- --dry-run
```

Confirma el total de productos, variantes e imágenes. Después ejecuta la importación:

```bash
npm run migrate:strapi
```

El comando crea y muestra un `runId`. Usa ese valor para verificar:

```bash
npm run migrate:verify -- --run-id UUID_REAL_DE_LA_IMPORTACION
```

El argumento `--run-id` de `migrate:strapi` solo se usa para reanudar una ejecución de importación que ya existe en PostgreSQL. No uses literalmente `<id>` en Git Bash; los signos angulares son sintaxis de redirección del shell.

La importación conserva IDs numéricos, `documentId`, campos actuales, tallas, orden y metadatos de imágenes. Los productos se procesan por unidad; los identificadores y URLs heredados se usan para reanudar sin duplicar. Un error queda registrado en `migration_items` y en el reporte, sin marcar la ejecución como válida.

## Verificación

```bash
npm run migrate:verify -- --run-id <id>
npm run migrate:verify -- --repeat <id>
```

El reporte JSON y su resumen se escriben en `MIGRATION_REPORT_DIR`. No contienen tokens ni contraseñas. `readyForCutover` solo puede ser `true` cuando coinciden productos, variantes, relaciones e imágenes, todas las URLs nuevas responden y no existen errores ni incompatibilidades pendientes.

## Ventana de corte

1. Conserva el export de Strapi y el reporte validado.
2. Congela altas, ediciones y cargas de imágenes en Strapi.
3. Ejecuta una importación final y repite la verificación.
4. Prueba login del propietario, edición, stock, imágenes, catálogo, URLs antiguas, bolsa y WhatsApp.
5. Cambia la configuración de runtime a PostgreSQL/Blob y confirma que no hay llamadas del navegador o servidor de la aplicación a Strapi.
6. Mantén el export, el reporte y las instrucciones de reversión durante la ventana de observación.
7. Deshabilita y elimina Strapi solo después de aprobar esa ventana.

## Reversión

La reversión consiste en restaurar la versión desplegada anterior junto con sus variables de runtime y conservar PostgreSQL/Blob y los reportes sin modificarlos. No borres el export ni los objetos nuevos hasta completar la observación acordada.
