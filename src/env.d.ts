/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly BLOB_READ_WRITE_TOKEN?: string;
  readonly STRAPI_URL?: string;
  readonly STRAPI_TOKEN?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly MIGRATION_REPORT_DIR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    adminUser?: import("./db/schema").AdminUser;
    csrfToken?: string | null;
  }
}
