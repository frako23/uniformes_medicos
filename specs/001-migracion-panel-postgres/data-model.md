# Data Model: Migración a panel propio y PostgreSQL

## Design Principles

- PostgreSQL es la fuente de verdad del catálogo después del corte.
- Los identificadores de Strapi se conservan como claves de correspondencia y no se sustituyen silenciosamente.
- Las relaciones de producto, variantes e imágenes se guardan con restricciones que impidan estados parciales.
- Las imágenes viven en almacenamiento de objetos; PostgreSQL conserva sus metadatos y referencias.
- No se modelan clientes, pagos ni pedidos confirmados en esta feature.
- Los campos de origen que no se puedan normalizar deben conservarse en un registro de migración o campo de metadatos para no perder información durante la importación.

## Entities

### AdminUser

Represents the single authorized owner of the administrative panel.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key; not exposed as a public identifier |
| `email` | text | Yes | Normalized lowercase; unique; used for login |
| `password_hash` | text | Yes | Generated with a memory-hard password hashing function; never returned |
| `role` | enum/text | Yes | Initial value `owner`; no public role assignment |
| `is_active` | boolean | Yes | Inactive accounts cannot authenticate |
| `created_at` | timestamp | Yes | Server generated |
| `updated_at` | timestamp | Yes | Server generated |
| `last_login_at` | timestamp/null | No | Updated after successful login |

**Validation**: one owner account is seeded; email must be valid and normalized; password setup is never exposed as public registration.

### AdminSession

Represents a revocable authenticated session.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key |
| `admin_user_id` | UUID | Yes | Foreign key to `AdminUser` |
| `token_hash` | text | Yes | Unique hash of a random cookie token; raw token is never persisted |
| `csrf_token_hash` | text | Yes | Hash of the mutation token associated with the session |
| `created_at` | timestamp | Yes | Server generated |
| `last_seen_at` | timestamp | Yes | Used for idle expiration |
| `expires_at` | timestamp | Yes | Absolute expiration enforced server-side |
| `revoked_at` | timestamp/null | No | Set by logout or security invalidation |

**State**: `active` → `expired` or `revoked`. Every protected request checks the state and time limits.

### Category

Represents the product type/category used by the current catalog filters.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID/integer | Yes | Internal primary key |
| `legacy_id` | integer/null | No | Original category identifier if Strapi exposes one |
| `name` | text | Yes | Display label; unique after normalization |
| `slug` | text | Yes | Stable filter value; unique |
| `is_active` | boolean | Yes | Inactive categories are not offered as new product choices |
| `created_at` | timestamp | Yes | Server generated |
| `updated_at` | timestamp | Yes | Server generated |

### Product

Represents a public catalog product.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID/integer | Yes | Internal primary key |
| `legacy_id` | integer | Yes | Original Strapi numeric `id`; unique |
| `legacy_document_id` | text | Yes | Original Strapi `documentId`; unique and used by existing detail URLs |
| `category_id` | FK/null | No | Links to `Category` when a category can be normalized |
| `legacy_type_label` | text | Yes | Exact current `Tipo` value retained for fidelity |
| `manufacturer` | text | Yes | Current `Fabricantes` value |
| `brand` | text | Yes | Current `Marca` value |
| `gender` | enum/text | Yes | `Dama`, `Caballero` or `Unisex`; reject unknown values unless mapped explicitly |
| `price` | numeric(10,2) | Yes | Must be non-negative |
| `sku` | text/null | No | Unique when present |
| `color` | text | Yes | Preserve current display value |
| `is_published` | boolean | Yes | Controls public visibility |
| `is_active` | boolean | Yes | Controls availability/administrative lifecycle |
| `source_created_at` | timestamp/null | No | Original Strapi `createdAt` |
| `source_updated_at` | timestamp/null | No | Original Strapi `updatedAt` |
| `source_published_at` | timestamp/null | No | Original Strapi `publishedAt` |
| `created_at` | timestamp | Yes | Target record creation |
| `updated_at` | timestamp | Yes | Target record update |

**Derived availability**: a product is selectable only when `is_published = true`, `is_active = true`, and it has at least one variant with quantity greater than zero. This rule must be shared by catalog, detail and cart validation.

**Indexes/constraints**: unique `legacy_id`, unique `legacy_document_id`, unique non-null `sku`, indexes on `(is_published, is_active)`, `gender`, `category_id`, and `legacy_type_label`.

### ProductVariant

Represents a size and its current stock for one product.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID/integer | Yes | Internal primary key |
| `product_id` | FK | Yes | Cascade only when an explicit product purge is allowed; normal removal is soft/inactive |
| `legacy_id` | integer/null | No | Original Strapi repeatable-component identifier |
| `size_label` | text | Yes | Preserve current `Talla` value |
| `quantity` | integer | Yes | Integer >= 0 |
| `created_at` | timestamp | Yes | Server generated |
| `updated_at` | timestamp | Yes | Server generated |

**Constraint**: unique `(product_id, size_label)` unless the source contains intentionally duplicate labels; such duplicates must be reported and resolved before validation.

### ProductImage

Represents a product image copied to the new object storage.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID/integer | Yes | Internal primary key |
| `product_id` | FK | Yes | Parent product |
| `legacy_id` | integer/null | No | Original Strapi media identifier |
| `legacy_url` | text | Yes | Source URL for audit/retry/deduplication |
| `storage_pathname` | text | Yes | New object pathname |
| `storage_url` | text | Yes | Public URL used by the catalog |
| `checksum` | text/null | No | Content hash for idempotency and verification |
| `mime_type` | text | Yes | Allowlisted image MIME type |
| `byte_size` | integer | Yes | Positive and below configured upload limit |
| `width` | integer/null | No | Source or inspected width |
| `height` | integer/null | No | Source or inspected height |
| `alt_text` | text/null | No | Accessible alternative text |
| `caption` | text/null | No | Preserved source caption |
| `position` | integer | Yes | Zero-based or one-based order, consistent across UI and API |
| `created_at` | timestamp | Yes | Server generated |
| `updated_at` | timestamp | Yes | Server generated |
| `deleted_at` | timestamp/null | No | Soft removal after replacement/cleanup |

**Constraints**: unique `(product_id, position)` among active images; unique `(product_id, legacy_url)` for migrated records; only allow configured image MIME types and a bounded size.

### MigrationRun

Represents one import or verification execution.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | Yes | Run identifier included in reports |
| `mode` | enum/text | Yes | `dry_run`, `import`, `verify` |
| `status` | enum/text | Yes | `pending`, `running`, `validated`, `failed` |
| `source_url` | text | Yes | Strapi base URL without secret token |
| `started_at` | timestamp | Yes | Server generated |
| `finished_at` | timestamp/null | No | Set on completion |
| `expected_products` | integer/null | No | Source count |
| `imported_products` | integer | Yes | Target count for the run |
| `expected_images` | integer/null | No | Source count |
| `imported_images` | integer | Yes | Target count for the run |
| `error_count` | integer | Yes | Must be zero for validation |
| `report_path` | text/null | No | Local or protected artifact reference; never contains secrets |

**State**: `pending` → `running` → `validated` or `failed`. A run cannot become `validated` when mandatory records/images or comparisons remain unresolved.

### MigrationItem

Represents the outcome for one source record or media item.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key |
| `run_id` | FK | Yes | Parent run |
| `entity_type` | text | Yes | `product`, `variant`, `image`, `category` |
| `source_id` | text | Yes | Original ID or stable source URL |
| `target_id` | text/null | No | New target identifier |
| `status` | enum/text | Yes | `imported`, `skipped`, `error`, `verified` |
| `source_checksum` | text/null | No | Input snapshot checksum |
| `message` | text/null | No | Human-readable diagnostic without credentials |
| `created_at` | timestamp | Yes | Server generated |

## Relationships

```text
AdminUser 1 ──── * AdminSession
Category  1 ──── * Product
Product   1 ──── * ProductVariant
Product   1 ──── * ProductImage
MigrationRun 1 ──── * MigrationItem
```

## Transactional Boundaries

- Product form save: validate input, update product, replace its variants and update ordering metadata in one database transaction; an image upload is finalized only when its database association succeeds.
- Image replacement: upload the new immutable object, write the new metadata, commit the association, then mark the old object for cleanup; a failed database update must not delete the old usable image.
- Migration product batch: upsert the product, category relation, variants and image metadata atomically per product; an image upload can be retried without creating a duplicate through its source URL/checksum.
- Migration validation: read-only comparison; it must not mutate catalog data.

## Data Retention and Deletion

- Products are deactivated/unpublished by default instead of hard-deleted to preserve public identifiers, favorites and auditability.
- Images removed from a product are soft-deleted in PostgreSQL and cleaned from object storage only after the replacement is confirmed reachable.
- Migration reports and source correspondences remain available for the cutover review; they must not contain Strapi tokens or passwords.
