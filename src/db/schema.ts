import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
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

export const clientSexEnum = pgEnum("client_sex", ["Mujer", "Hombre"]);
export const financingFrequencyEnum = pgEnum("financing_frequency", ["semanal", "quincenal", "mensual"]);
export const installmentStatusEnum = pgEnum("installment_status", ["pendiente", "pagada"]);
export const paymentCurrencyEnum = pgEnum("payment_currency", ["USD", "VES"]);
export const rateSourceEnum = pgEnum("rate_source", ["oficial", "manual"]);
export const recordOriginEnum = pgEnum("record_origin", ["panel", "carga_masiva"]);

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

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/* Los CHECK, la unicidad diferible del celular y los índices parciales viven solo en el SQL (0003). */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ref: integer("ref").generatedAlwaysAsIdentity().notNull(),
    name: text("name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    sex: clientSexEnum("sex"),
    size: text("size"),
    city: text("city"),
    hospital: text("hospital"),
    clinic: text("clinic"),
    specialty: text("specialty"),
    notes: text("notes"),
    searchText: text("search_text").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("clients_search_idx").on(table.searchText, table.ref)],
);

export const financings = pgTable(
  "financings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ref: integer("ref").generatedAlwaysAsIdentity().notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
    frequency: financingFrequencyEnum("frequency").notNull().default("quincenal"),
    origin: recordOriginEnum("origin").notNull().default("panel"),
    annulledAt: timestamptz("annulled_at"),
    annulmentReason: text("annulment_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("financings_client_idx").on(table.clientId)],
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    financingId: uuid("financing_id")
      .notNull()
      .references(() => financings.id, { onDelete: "cascade" }),
    isInitial: boolean("is_initial").notNull().default(false),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
    status: installmentStatusEnum("status").notNull().default("pendiente"),
    paidOn: date("paid_on", { mode: "string" }),
    paymentCurrency: paymentCurrencyEnum("payment_currency"),
    euroRate: numeric("euro_rate", { precision: 14, scale: 2 }),
    euroRateDate: date("euro_rate_date", { mode: "string" }),
    euroRateSource: rateSourceEnum("euro_rate_source"),
    amountVes: numeric("amount_ves", { precision: 18, scale: 2 }),
    paymentReference: text("payment_reference"),
    paymentOrigin: recordOriginEnum("payment_origin"),
    paidRecordedAt: timestamptz("paid_recorded_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("installments_financing_idx").on(table.financingId)],
);

export const euroRates = pgTable("euro_rates", {
  rateDate: date("rate_date", { mode: "string" }).primaryKey(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  sourceValue: numeric("source_value", { precision: 20, scale: 8 }).notNull(),
  source: text("source").notNull().default("dolarapi"),
  fetchedAt: timestamptz("fetched_at").notNull(),
});

export const congresses = pgTable(
  "congresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ref: integer("ref").generatedAlwaysAsIdentity().notNull(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    venue: text("venue"),
    specialty: text("specialty"),
    notes: text("notes"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("congresses_dates_idx").on(table.startDate, table.endDate)],
);

export const clientsRelations = relations(clients, ({ many }) => ({
  financings: many(financings),
}));

export const financingsRelations = relations(financings, ({ one, many }) => ({
  client: one(clients, { fields: [financings.clientId], references: [clients.id] }),
  installments: many(installments),
}));

export const installmentsRelations = relations(installments, ({ one }) => ({
  financing: one(financings, { fields: [installments.financingId], references: [financings.id] }),
}));

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type MigrationRun = typeof migrationRuns.$inferSelect;
export type MigrationItem = typeof migrationItems.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Financing = typeof financings.$inferSelect;
export type Installment = typeof installments.$inferSelect;
export type EuroRate = typeof euroRates.$inferSelect;
export type Congress = typeof congresses.$inferSelect;

export const positiveStockSql = sql`${productVariants.quantity} > 0`;
