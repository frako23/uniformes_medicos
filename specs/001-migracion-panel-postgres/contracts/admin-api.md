# Contract: Administrative Panel API

All routes in this document are served by the same Astro application. The browser may render the forms, but every read and mutation must be authorized server-side.

## Authentication

### `POST /api/admin/auth/login`

Accepts form data or JSON:

```json
{ "email": "owner@example.com", "password": "********" }
```

Success: creates a server-side session, sets an HttpOnly secure session cookie, and redirects to `/admin` for form requests or returns `204`/a safe redirect target for JSON requests.

Failure: `401` with a generic authentication error; do not reveal whether the email exists.

### `POST /api/admin/auth/logout`

Requires the active session and CSRF/origin validation. Revokes the server-side session, clears the cookie and redirects to `/admin/login`.

### Protected request rules

- `/admin/**` and `/api/admin/**` require an active owner session.
- Mutating requests require `Origin`/same-site validation and a CSRF token associated with the server-side session.
- Expired or revoked sessions return `401` and do not execute the requested operation.
- Authentication data, password hashes, session tokens and storage tokens are never serialized to the browser.

## Product Operations

### `GET /api/admin/products`

Returns a paginated list for the panel. Supports filtering by publication state, active state, category/type, gender and text search. Response includes product identifier, display fields, availability summary and image count, but not secrets.

### `POST /api/admin/products`

Creates a product with the fields in [data-model.md](../data-model.md). The request may include variants and image metadata already uploaded through the authorized upload flow. Returns `201` with the normalized product or `422` with field-level validation errors.

### `GET /api/admin/products/:publicId`

Returns the complete editable product, ordered variants, ordered active images and availability state. `publicId` is the preserved Strapi `documentId`/public identifier.

### `PATCH /api/admin/products/:publicId`

Updates product fields and, when included, replaces the complete validated variant set atomically. Returns the updated normalized product. Invalid input returns `422`; a concurrent stale update returns `409` and leaves the prior record unchanged.

### `POST /api/admin/products/:publicId/images`

Accepts an allowlisted image file and metadata. The server verifies the owner session, file type and size, stores the image in the public object store, and returns its metadata and URL without exposing the write token.

### `PATCH /api/admin/products/:publicId/images/:imageId`

Updates order, alternative text, caption or active state. It must preserve a unique image order per product.

### `DELETE /api/admin/products/:publicId/images/:imageId`

Soft-deletes the association after confirming the product will remain valid. The object-store cleanup may be asynchronous but must never remove the only reachable image before the replacement is confirmed.

### `PATCH /api/admin/products/:publicId/variants/:variantId`

Updates a single stock quantity after validating an integer greater than or equal to zero. Returns the updated variant and derived product availability.

## Error Shape

Errors use a stable, user-safe shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los campos indicados.",
    "fields": { "price": "El precio debe ser mayor o igual a cero." }
  }
}
```

Known codes include `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `STORAGE_ERROR`, `DATABASE_ERROR` and `INTERNAL_ERROR`. Internal logs may contain diagnostics, but responses must not expose credentials, SQL, provider tokens or stack traces.
