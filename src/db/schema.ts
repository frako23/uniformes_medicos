import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["Dama", "Caballero", "Unisex"]);
export const adminRoleEnum = pgEnum("admin_role", ["owner"]);
export const migrationModeEnum = pgEnum("migration_mode", [
  "dry_run",
  "import",
  "verify",
]);
export const migrationStatusEnum = pgEnum("migration_status", [
  "pending",
  "running",
  "validated",
  "failed",
]);
export const migrationItemStatusEnum = pgEnum("migration_item_status", [
  "imported",
  "skipped",
  "error",
  "verified",
]);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: adminRoleEnum("role").notNull().default("owner"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("admin_users_email_unique").on(table.email)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: integer("legacy_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_name_unique").on(table.name),
    uniqueIndex("categories_slug_unique").on(table.slug),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: integer("legacy_id").generatedByDefaultAsIdentity().notNull(),
    legacyDocumentId: text("legacy_document_id").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    legacyTypeLabel: text("legacy_type_label").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    brand: text("brand").notNull().default(""),
    gender: genderEnum("gender").notNull().default("Unisex"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    sku: text("sku"),
    color: text("color").notNull().default(""),
    isPublished: boolean("is_published").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("products_legacy_id_unique").on(table.legacyId),
    uniqueIndex("products_legacy_document_id_unique").on(table.legacyDocumentId),
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_public_state_idx").on(table.isPublished, table.isActive),
    index("products_category_idx").on(table.categoryId),
    index("products_gender_idx").on(table.gender),
    index("products_type_idx").on(table.legacyTypeLabel),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    legacyId: integer("legacy_id"),
    sizeLabel: text("size_label").notNull(),
    quantity: integer("quantity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_variants_product_size_unique").on(
      table.productId,
      table.sizeLabel,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    legacyId: integer("legacy_id"),
    legacyUrl: text("legacy_url").notNull(),
    storagePathname: text("storage_pathname").notNull(),
    storageUrl: text("storage_url").notNull(),
    checksum: text("checksum"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    caption: text("caption"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("product_images_product_legacy_url_unique").on(
      table.productId,
      table.legacyUrl,
    ),
    uniqueIndex("product_images_product_position_unique").on(
      table.productId,
      table.position,
    ).where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const migrationRuns = pgTable("migration_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  mode: migrationModeEnum("mode").notNull(),
  status: migrationStatusEnum("status").notNull().default("pending"),
  sourceUrl: text("source_url").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  expectedProducts: integer("expected_products"),
  importedProducts: integer("imported_products").notNull().default(0),
  expectedImages: integer("expected_images"),
  importedImages: integer("imported_images").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  reportPath: text("report_path"),
});

export const migrationItems = pgTable("migration_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => migrationRuns.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id"),
  status: migrationItemStatusEnum("status").notNull(),
  sourceChecksum: text("source_checksum"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  sessions: many(adminSessions),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminSessions.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
  images: many(productImages),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type MigrationRun = typeof migrationRuns.$inferSelect;
export type MigrationItem = typeof migrationItems.$inferSelect;

export const positiveStockSql = sql`${productVariants.quantity} > 0`;
