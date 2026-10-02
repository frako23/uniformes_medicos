# Contract: Strapi Migration and Verification CLI

Migration is an operational script, not a public web endpoint. It runs locally or in a controlled server environment with source and target credentials available only to the process.

## Required Environment

```text
STRAPI_URL                 # source base URL
STRAPI_TOKEN               # source read token; never written to reports
DATABASE_URL               # target PostgreSQL connection
BLOB_READ_WRITE_TOKEN      # target media write token; server-only
PUBLIC_SITE_URL            # used for URL smoke checks
MIGRATION_REPORT_DIR       # protected local output directory
```

The source token and storage token must be excluded from logs, reports, Git and browser responses. Development, preview and production use separate values.

## Commands

### `npm run migrate:strapi -- --dry-run`

Reads and normalizes every source page, validates records and reports expected product/variant/image counts without changing PostgreSQL or object storage.

### `npm run migrate:strapi -- --run-id <id>`

Imports all categories, products, variants and images in resumable batches. Existing records are matched by preserved source identifiers/URLs and are updated rather than duplicated. Each product batch is atomic at the database level.

### `npm run migrate:verify -- --run-id <id>`

Compares the source snapshot and target records, checks relationships and opens the new image URLs. It writes a report with `validated` only when all mandatory differences are resolved.

### `npm run migrate:verify -- --repeat <id>`

Re-runs verification after an import to demonstrate idempotency and that counts/URLs do not change unexpectedly.

## Report Shape

The report is JSON plus a human-readable summary:

```json
{
  "runId": "uuid",
  "status": "validated",
  "source": { "products": 0, "variants": 0, "images": 0 },
  "target": { "products": 0, "variants": 0, "images": 0 },
  "missing": [],
  "mismatches": [],
  "errors": [],
  "legacyUrls": { "checked": 0, "requiresCompatibilityDecision": 0 },
  "readyForCutover": true
}
```

`readyForCutover` is false when there are missing mandatory records, unresolved identifier conflicts, failed image copies, relationship mismatches or unknown public URL dependencies.

## Cutover Gate

1. Export or snapshot source data and retain the validated report.
2. Freeze Strapi catalog edits for the final import window.
3. Run import and verification against the final source state.
4. Confirm public product URL smoke tests, admin login, product edit, stock update, image delivery, cart and WhatsApp flow.
5. Switch runtime configuration to PostgreSQL/Blob and confirm no runtime request reaches Strapi.
6. Keep the source export and rollback instructions until production has passed the agreed observation window.
7. Only then disable and delete Strapi.
