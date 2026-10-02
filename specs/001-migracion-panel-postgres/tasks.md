---

description: "Task list template for feature implementation"
---

# Tasks: Migración a panel propio y PostgreSQL

**Input**: Design documents from `/specs/001-migracion-panel-postgres/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included because the constitution requires verification of authentication, catalog, inventory, migration and order-preparation paths before publication.

**Organization**: Tasks are grouped by user story. All three stories are Priority P1 in the specification; their implementation can proceed independently after the foundational phase, while production cutover requires the migration and public regression gates to pass.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the project dependencies, commands and test harness needed by the new Astro server-side application.

- [X] T001 Add PostgreSQL, migration, validation, object-storage, scripting and test dependencies plus `db:migrate`, `migrate:strapi`, `migrate:verify`, `test` and `test:e2e` scripts in `package.json`.
- [X] T002 Add development/preview/production environment declarations and the non-secret variable template (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `STRAPI_URL`, `STRAPI_TOKEN`, `ADMIN_EMAIL`, `PUBLIC_SITE_URL`, `MIGRATION_REPORT_DIR`) in `.env.example` and `src/env.d.ts`.
- [X] T003 [P] Configure Vitest and Playwright test projects, shared fixtures and the local development web server in `vitest.config.mjs`, `playwright.config.ts` and `tests/setup.ts`.

**Checkpoint**: Dependencies and commands are declared without exposing credentials; the test runners can be invoked even before feature tests are implemented.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the database, validation, authentication, storage and server boundaries required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Configure code-first PostgreSQL migrations and the schema source in `drizzle.config.ts`, using `DATABASE_URL` per environment and keeping production changes on generated versioned SQL rather than `drizzle-kit push`.
- [X] T005 Create the initial PostgreSQL schema and migration in `src/db/schema.ts` and `drizzle/0001_initial.sql` for `AdminUser`, `AdminSession`, `Category`, `Product`, `ProductVariant`, `ProductImage`, `MigrationRun` and `MigrationItem`; preserve the data-model constraints verbatim: `Product.legacy_id` and `Product.legacy_document_id` are unique, `Product.price` “Must be non-negative”, `ProductVariant.quantity` is “Integer >= 0”, `ProductImage` has unique active `(product_id, position)` and unique `(product_id, legacy_url)`, and a migration run cannot be validated while mandatory records/images or comparisons remain unresolved.
- [X] T006 Implement the PostgreSQL client, transaction helper and environment guard in `src/db/client.ts` and `src/server/db.ts`, including a clear failure when `DATABASE_URL` is absent and no connection string in client bundles.
- [X] T007 [P] Implement shared catalog input schemas and field-level validation in `src/server/validation/catalog.ts`, preserving the data-model rules that gender is `Dama`, `Caballero` or `Unisex`, SKU is unique when present, price is non-negative, and stock is an integer greater than or equal to zero.
- [X] T008 [P] Replace the Strapi-only public type assumptions with normalized product, variant and image DTOs and mappers in `src/utils/types.ts` and `src/server/catalog/mapper.ts`, retaining both numeric legacy `id` and public `documentId` values.
- [X] T009 Implement owner lookup, session persistence, token hashing, expiration and revocation in `src/server/auth/repository.ts` and `src/server/auth/session.ts`; enforce the `AdminSession` states `active` → `expired` or `revoked`.
- [X] T010 Implement password hashing/comparison and secure random session/CSRF token generation in `src/server/auth/crypto.ts`, using server-only Node primitives and never storing raw session or CSRF tokens.
- [X] T011 Protect `/admin/**` and `/api/admin/**` with request middleware and reusable guards in `src/middleware.ts` and `src/server/auth/guards.ts`; enforce HttpOnly/Secure/SameSite cookie settings, server-side idle/absolute expiration and Origin/CSRF checks for mutations.
- [X] T012 Implement the authenticated object-storage adapter in `src/server/storage/blob.ts`, allowing only configured image MIME types and size limits, returning public URL/path/checksum metadata, and treating replacement objects as immutable until the database association succeeds.
- [X] T013 Implement safe JSON/form error responses and server logging redaction in `src/server/http/errors.ts` and `src/server/http/responses.ts`, ensuring responses never expose passwords, tokens, SQL, provider secrets or stack traces.
- [X] T014 Create the one-time owner bootstrap command in `scripts/seed-owner.ts` and its `package.json` script; reject duplicate owner creation and do not add a public registration route.

**Checkpoint**: The project can connect to the target database, apply the initial schema, validate shared data, create one owner account, authenticate requests and upload only authorized images.

---

## Phase 3: User Story 1 - Administrar el catálogo e inventario (Priority: P1) 🎯 MVP

**Goal**: Give the owner a private panel to authenticate and manage products, variants, images and availability without editing source code.

**Independent Test**: With seeded development data and the owner account, an unauthenticated request is rejected, the owner can log in, edit a product and stock by size, upload/reorder an image, deactivate/reactivate the product and see the validated result returned by the admin API.

### Tests for User Story 1

> Write these tests first and ensure they fail before implementation.

- [X] T015 [P] [US1] Add integration coverage for generic login errors, session creation/revocation, expired sessions, server-side authorization and CSRF/Origin rejection in `tests/integration/admin-auth.test.ts`.
- [X] T016 [P] [US1] Add Playwright coverage for owner login, protected `/admin` redirect, product CRUD, invalid fields, stock editing, image ordering and product deactivate/reactivate in `tests/e2e/admin.spec.ts`.

### Implementation for User Story 1

- [X] T017 [US1] Implement owner login/logout endpoints and login page in `src/pages/api/admin/auth/login.ts`, `src/pages/api/admin/auth/logout.ts` and `src/pages/admin/login.astro`, including generic `401` responses and safe redirects.
- [X] T018 [US1] Implement the authenticated admin layout, navigation, session-expiry feedback and responsive/keyboard-accessible shell in `src/pages/admin/layout.astro`, `src/pages/admin/index.astro` and `src/components/admin/AdminLayout.astro`.
- [X] T019 [US1] Implement the admin product query/list service and endpoint in `src/server/catalog/admin-products.ts` and `src/pages/api/admin/products/index.ts`, with pagination and filters for active state, publication state, category/type, gender and text search.
- [X] T020 [US1] Implement the product create/edit service and routes in `src/server/catalog/admin-products.ts`, `src/pages/api/admin/products/[publicId].ts`, `src/pages/admin/productos/nuevo.astro` and `src/pages/admin/productos/[id].astro`; save product fields atomically and return `422` field errors or `409` stale-update conflicts without partial writes.
- [X] T021 [US1] Build the product form and validation feedback in `src/components/admin/ProductForm.astro` and `src/components/admin/FieldError.astro`, preserving required fields and the exact constraints “Must be non-negative” for price and “Integer >= 0” for quantities.
- [X] T022 [US1] Implement variant/talla editing and atomic replacement in `src/server/catalog/admin-variants.ts`, `src/pages/api/admin/products/[publicId]/variants/[variantId].ts` and `src/components/admin/VariantEditor.astro`; enforce unique `(product_id, size_label)` unless a source duplicate is explicitly reported.
- [X] T023 [US1] Implement authorized image upload, metadata update, ordering and soft removal in `src/pages/api/admin/products/[publicId]/images/index.ts`, `src/pages/api/admin/products/[publicId]/images/[imageId].ts`, `src/server/catalog/admin-images.ts` and `src/components/admin/ImageManager.astro`; preserve `alt_text`, caption, dimensions, checksum and unique active positions.
- [X] T024 [US1] Implement publish/active state transitions and success, empty, loading and error states in `src/server/catalog/admin-products.ts`, `src/pages/admin/productos/index.astro` and `src/pages/admin/productos/[id].astro`; never show an inactive/unpublished product as available.

**Checkpoint**: User Story 1 is independently usable against seeded PostgreSQL data; every admin page and API operation is protected and the owner can manage the complete current catalog shape.

---

## Phase 4: User Story 2 - Migrar el catálogo y sus imágenes desde Strapi (Priority: P1)

**Goal**: Import the complete Strapi catalog and media into PostgreSQL/object storage with preserved identifiers, resumability and a cutover-ready verification report.

**Independent Test**: Against a development database and storage, a dry run reaches all Strapi pages, an import copies all products/variants/images, a repeated import creates no duplicates, and verification returns `readyForCutover: true` only when required comparisons pass.

### Tests for User Story 2

> Write these tests first and ensure they fail before implementation.

- [X] T025 [P] [US2] Add migration integration fixtures and tests for pagination, Strapi v4/v5 normalization, duplicate identifiers, missing relations, failed images, interruption/resume and repeated import idempotency in `tests/integration/migration.test.ts` and `tests/fixtures/strapi/`.
- [X] T026 [P] [US2] Add contract tests for report counts, error redaction, `readyForCutover` gating and legacy URL compatibility decisions in `tests/contract/migration-report.test.ts`.

### Implementation for User Story 2

- [X] T027 [US2] Implement the paginated Strapi client and source normalizer in `src/server/migration/strapi-client.ts` and `src/server/migration/normalize-strapi.ts`, reading until the source page count/page is exhausted rather than retaining the current three-page limit.
- [X] T028 [US2] Implement streamed media download, checksum calculation, allowlist validation and idempotent upload to the new object storage in `src/server/migration/media-import.ts`; preserve source URL/ID, image order and metadata while preventing duplicate blobs on retries.
- [X] T029 [US2] Implement per-product transactional upsert of categories, products, variants, image metadata and source correspondences in `src/server/migration/import-products.ts`; match by `legacy_id`, `legacy_document_id` and `legacy_url`, preserve current fields and record conflicts instead of silently overwriting ambiguous data.
- [X] T030 [US2] Implement migration run/item state tracking and resumable batch orchestration in `src/server/migration/run.ts` and `src/server/migration/repository.ts`, enforcing `pending` → `running` → `validated`/`failed` and leaving the prior usable record intact when a batch fails.
- [X] T031 [US2] Implement JSON and human-readable migration reports in `src/server/migration/report.ts`, excluding all tokens/passwords and including source/target counts, missing records, mismatches, errors, image reachability and legacy URL compatibility decisions.
- [X] T032 [US2] Expose the dry-run/import workflow through `scripts/migrate-strapi.ts` and `package.json`, accepting `--dry-run`, `--run-id` and protected environment variables without printing secrets.
- [X] T033 [US2] Implement source/target comparison, image URL checks, repeat verification and the `readyForCutover` gate in `src/server/migration/verify.ts` and `scripts/verify-migration.ts`; fail validation for mandatory missing records, relationship mismatches, failed images or unresolved public URL dependencies.
- [X] T034 [US2] Document the source export, freeze window, final import, verification, runtime switch, observation window and Strapi retirement procedure in `docs/migration.md`, including rollback/export retention.

**Checkpoint**: User Story 2 can migrate all current data into a clean environment, resume after failure, produce a redacted comparison report and refuse cutover until all mandatory data/media checks pass.

---

## Phase 5: User Story 3 - Consultar el catálogo y preparar un pedido (Priority: P1)

**Goal**: Preserve the public catalog, product URLs, availability, favorites, cart and WhatsApp preparation while removing all runtime Strapi calls.

**Independent Test**: With migrated fixtures, a visitor can browse/filter the catalog, open preserved product URLs, see current size stock, resolve a stale cart item safely and generate a WhatsApp message that exactly matches the selected products.

### Tests for User Story 3

> Write these tests first and ensure they fail before implementation.

- [X] T035 [P] [US3] Add integration coverage for published/active filtering, derived availability, preserved numeric/document identifiers, stale IDs, database errors and the normalized cart response in `tests/integration/public-catalog.test.ts`.
- [X] T036 [P] [US3] Add Playwright coverage for catalog filters, product detail URLs, image loading from new storage, zero-stock messaging, cart recovery and WhatsApp message composition in `tests/e2e/public-catalog.spec.ts`.

### Implementation for User Story 3

- [X] T037 [US3] Implement the public catalog repository and shared availability query in `src/server/catalog/public-products.ts`, using PostgreSQL joins/indexes and the invariant `is_published = true`, `is_active = true` plus at least one variant with quantity greater than zero.
- [X] T038 [US3] Replace the Strapi requests in `src/pages/index.astro` with the public catalog service, preserving existing filters, cards, favorites, image ordering and useful loading/empty/error states without a hardcoded three-page limit.
- [X] T039 [US3] Replace Strapi detail resolution in `src/pages/productos/[id].astro` with lookup by preserved `legacy_document_id`, returning a controlled not-found/unavailable response and new storage image URLs.
- [X] T040 [US3] Replace the Strapi query in `src/pages/api/cart-details.ts` with the PostgreSQL public service, validating a bounded array of positive numeric legacy IDs and returning `{ data, missingIds }` without credentials or internal errors.
- [X] T041 [US3] Update cart data refresh, stale-item handling and WhatsApp composition in `src/pages/cart.astro`, `src/components/BuyButton.astro` and `src/utils/fucntions.ts` so the message is derived only from current returned records and warns before omitting unavailable items.
- [X] T042 [US3] Update shared product types, cards, size-stock display, image alt text and public error states in `src/utils/types.ts`, `src/components/Card.astro`, `src/components/SizeStock.astro`, `src/components/LikeButton.astro` and `src/layouts/Layout.astro`; ensure no public runtime code imports Strapi URLs or tokens.

**Checkpoint**: User Story 3 works with PostgreSQL/Blob only, all selected product URLs remain usable, unavailable stock is never misleading and WhatsApp preparation matches the visitor's selection.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete documentation, accessibility/performance review, security hardening and final cutover verification.

- [X] T043 [P] Update `README.md` and `docs/documentacion.md` with PostgreSQL/Blob setup, owner bootstrap, new routes, environment separation, migration commands and the removal of Strapi runtime configuration.
- [X] T044 [P] Perform responsive, keyboard, focus, contrast and alternative-text review across `src/pages/admin/`, `src/components/admin/`, `src/pages/index.astro`, `src/pages/productos/[id].astro` and `src/pages/cart.astro`, resolving findings in the affected files.
- [X] T045 Run security review and hardening for `src/middleware.ts`, `src/server/auth/`, `src/pages/api/admin/` and `src/server/storage/`, confirming cookie flags, password/session handling, CSRF/origin checks, upload validation, rate/error behavior and absence of secrets in client output.
- [X] T046 Run performance and resilience review for `src/server/catalog/`, `src/pages/index.astro`, `src/pages/productos/[id].astro` and `src/pages/api/cart-details.ts`, confirming indexed queries, image CDN URLs, bounded inputs, database/storage failure states and the 95%/3-second target.
- [ ] T047 Execute the complete validation procedure in `specs/001-migracion-panel-postgres/quickstart.md`, including migration dry run, repeated verification, admin scenarios, public regressions and cutover checklist; record unresolved issues in `docs/migration.md`.
- [ ] T048 Run `npm run test`, `npm run test:e2e`, `npm run build` and the final migration verification command from `package.json`, then archive the approved report before disabling Strapi.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001–T003; no feature dependencies, although T003 uses the project configuration installed by T001.
- **Foundational (Phase 2)**: T004–T014; depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: T015–T024; depends on Foundation and can run with seeded catalog data.
- **User Story 2 (Phase 4)**: T025–T034; depends on Foundation but not on the admin UI; it can run against a clean target environment.
- **User Story 3 (Phase 5)**: T035–T042; depends on Foundation and can use migrated fixtures or seed data, but production cutover depends on the US2 verification gate.
- **Polish (Phase 6)**: T043–T048; depends on the desired stories and must finish before production cutover.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No dependency on US2 or US3 for independent admin acceptance.
- **US2 (P1)**: Can start after Phase 2. Uses the database/storage/migration foundation but not the admin pages; it supplies the final production data to US3.
- **US3 (P1)**: Can start after Phase 2 with fixtures. Its final regression and cutover validation depend on a successful US2 import/verification.

### Within Each User Story

- Tests are written first and must fail before their implementation tasks.
- Shared models/validators/services precede endpoints and UI integration.
- Product mutations are implemented before image/status polish; migration normalization precedes import and verification; public data services precede page refactors.
- A checkpoint must pass before moving to the next story or declaring an MVP increment.

### Parallel Opportunities

- After T001, T003 can proceed in parallel with T002; T004 waits for dependency declarations.
- After T006, T007, T008, T009, T010 and T012 can proceed in parallel when they touch separate files; T011 depends on T009/T010.
- After Phase 2, US1 and US2 can proceed in parallel. US3 test/service work can proceed in parallel with them using fixtures.
- Within US1, T015/T016 are parallel test tracks; T019 can be prepared alongside T018 once shared validation exists, while T023 remains dependent on storage/auth foundations.
- Within US2, T025/T026 are parallel test tracks; source normalization (T027) and report contract scaffolding (T031) can proceed in parallel, while importer/verification wait for the source and schema contracts.
- Within US3, T035/T036 are parallel test tracks; public repository work (T037) can proceed alongside the UI contract tests before page integrations T038–T042.
- In Polish, T043 and T044 can proceed in parallel; T045–T048 are final gates and must consume the completed implementation.

---

## Parallel Example: User Story 1

```text
Task: "T015 [US1] Integration coverage for admin authentication in tests/integration/admin-auth.test.ts"
Task: "T016 [US1] Browser coverage for admin CRUD in tests/e2e/admin.spec.ts"
```

## Parallel Example: User Story 2

```text
Task: "T025 [US2] Migration fixtures and idempotency tests in tests/integration/migration.test.ts"
Task: "T026 [US2] Migration report contract tests in tests/contract/migration-report.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T035 [US3] Public catalog integration tests in tests/integration/public-catalog.test.ts"
Task: "T036 [US3] Public browser regression tests in tests/e2e/public-catalog.spec.ts"
```

---

## Implementation Strategy

### Technical MVP

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1 against seeded PostgreSQL/Blob data.
4. **STOP and VALIDATE**: prove owner-only access, product editing, stock integrity and image management independently.

### Business Cutover Increment

1. Complete the Technical MVP.
2. Complete User Story 2 and validate the full migration report/idempotency gate.
3. Complete User Story 3 and run public regression tests with Strapi runtime access disabled.
4. Complete Phase 6 and perform the production cutover checklist.

### Incremental Delivery

1. Foundation ready → admin panel can be demonstrated with seeded data.
2. US1 complete → owner can operate the new catalog panel.
3. US2 complete → data and images are migrated and auditable.
4. US3 complete → public catalog and WhatsApp flow run from PostgreSQL/Blob.
5. Polish complete → security, accessibility, performance and cutover gates are recorded.

## Notes

- Every task uses the required checklist format: checkbox, sequential ID, optional `[P]`, required `[USn]` inside story phases, and at least one concrete file path.
- The task list intentionally does not delete Strapi credentials or infrastructure; that destructive cutover occurs only after T047/T048 pass and the owner approves the observation window.
- `$speckit-implement` should process tasks in ID order unless a `[P]` marker and the dependency section permit parallel execution.
