DO $$ BEGIN
  CREATE TYPE "client_sex" AS ENUM ('Mujer', 'Hombre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "financing_frequency" AS ENUM ('semanal', 'quincenal', 'mensual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "installment_status" AS ENUM ('pendiente', 'pagada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "payment_currency" AS ENUM ('USD', 'VES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "rate_source" AS ENUM ('oficial', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "record_origin" AS ENUM ('panel', 'carga_masiva');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ref" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  "name" text NOT NULL,
  "phone_e164" text NOT NULL,
  "sex" "client_sex",
  "size" text,
  "city" text,
  "hospital" text,
  "clinic" text,
  "specialty" text,
  "notes" text,
  "search_text" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clients_ref_unique" UNIQUE ("ref"),
  CONSTRAINT "clients_phone_unique" UNIQUE ("phone_e164") DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT "clients_name_check" CHECK (char_length("name") BETWEEN 1 AND 160 AND "name" = btrim("name")),
  CONSTRAINT "clients_phone_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "clients_size_check" CHECK ("size" IS NULL OR char_length("size") BETWEEN 1 AND 40),
  CONSTRAINT "clients_city_check" CHECK ("city" IS NULL OR char_length("city") BETWEEN 1 AND 160),
  CONSTRAINT "clients_hospital_check" CHECK ("hospital" IS NULL OR char_length("hospital") BETWEEN 1 AND 160),
  CONSTRAINT "clients_clinic_check" CHECK ("clinic" IS NULL OR char_length("clinic") BETWEEN 1 AND 160),
  CONSTRAINT "clients_specialty_check" CHECK ("specialty" IS NULL OR char_length("specialty") BETWEEN 1 AND 160),
  CONSTRAINT "clients_notes_check" CHECK ("notes" IS NULL OR char_length("notes") BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS "clients_search_idx" ON "clients" ("search_text", "ref");

CREATE TABLE IF NOT EXISTS "financings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ref" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT,
  "description" text NOT NULL,
  "purchase_date" date NOT NULL,
  "frequency" "financing_frequency" DEFAULT 'quincenal' NOT NULL,
  "origin" "record_origin" DEFAULT 'panel' NOT NULL,
  "annulled_at" timestamptz,
  "annulment_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "financings_ref_unique" UNIQUE ("ref"),
  CONSTRAINT "financings_description_check" CHECK (char_length("description") BETWEEN 1 AND 500),
  CONSTRAINT "financings_annulment_reason_check" CHECK (
    "annulment_reason" IS NULL OR ("annulled_at" IS NOT NULL AND char_length("annulment_reason") BETWEEN 1 AND 500)
  )
);
CREATE INDEX IF NOT EXISTS "financings_client_idx" ON "financings" ("client_id");

CREATE TABLE IF NOT EXISTS "installments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "financing_id" uuid NOT NULL REFERENCES "financings"("id") ON DELETE CASCADE,
  "is_initial" boolean DEFAULT false NOT NULL,
  "due_date" date NOT NULL,
  "amount_usd" numeric(12, 2) NOT NULL,
  "status" "installment_status" DEFAULT 'pendiente' NOT NULL,
  "paid_on" date,
  "payment_currency" "payment_currency",
  "euro_rate" numeric(14, 2),
  "euro_rate_date" date,
  "euro_rate_source" "rate_source",
  "amount_ves" numeric(18, 2),
  "payment_reference" text,
  "payment_origin" "record_origin",
  "paid_recorded_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "installments_amount_check" CHECK ("amount_usd" > 0),
  CONSTRAINT "installments_euro_rate_check" CHECK ("euro_rate" IS NULL OR "euro_rate" > 0),
  CONSTRAINT "installments_reference_check" CHECK (
    "payment_reference" IS NULL OR char_length("payment_reference") BETWEEN 1 AND 160
  ),
  CONSTRAINT "installments_pending_check" CHECK (
    "status" <> 'pendiente' OR (
      "paid_on" IS NULL AND "payment_currency" IS NULL AND "euro_rate" IS NULL AND "euro_rate_date" IS NULL
      AND "euro_rate_source" IS NULL AND "amount_ves" IS NULL AND "payment_reference" IS NULL
      AND "payment_origin" IS NULL AND "paid_recorded_at" IS NULL
    )
  ),
  CONSTRAINT "installments_paid_origin_check" CHECK ("status" <> 'pagada' OR "payment_origin" IS NOT NULL),
  CONSTRAINT "installments_paid_panel_check" CHECK (
    "status" <> 'pagada' OR "payment_origin" <> 'panel' OR (
      "paid_on" IS NOT NULL AND "payment_currency" IS NOT NULL AND "paid_recorded_at" IS NOT NULL
    )
  ),
  CONSTRAINT "installments_paid_bulk_check" CHECK (
    "status" <> 'pagada' OR "payment_origin" <> 'carga_masiva' OR (
      "paid_on" IS NULL AND "payment_currency" IS NULL AND "euro_rate" IS NULL AND "amount_ves" IS NULL
    )
  ),
  CONSTRAINT "installments_ves_check" CHECK (
    "payment_currency" IS DISTINCT FROM 'VES' OR (
      "euro_rate" IS NOT NULL AND "euro_rate_source" IS NOT NULL AND "amount_ves" IS NOT NULL
      AND ("euro_rate_source" <> 'oficial' OR "euro_rate_date" IS NOT NULL)
    )
  ),
  CONSTRAINT "installments_usd_check" CHECK (
    "payment_currency" IS DISTINCT FROM 'USD' OR (
      "euro_rate" IS NULL AND "euro_rate_date" IS NULL AND "euro_rate_source" IS NULL AND "amount_ves" IS NULL
    )
  )
);
CREATE INDEX IF NOT EXISTS "installments_financing_idx" ON "installments" ("financing_id");
CREATE UNIQUE INDEX IF NOT EXISTS "installments_initial_unique" ON "installments" ("financing_id") WHERE "is_initial";
CREATE INDEX IF NOT EXISTS "installments_pending_due_idx" ON "installments" ("due_date") WHERE "status" = 'pendiente';
CREATE INDEX IF NOT EXISTS "installments_paid_on_idx" ON "installments" ("paid_on") WHERE "status" = 'pagada';

CREATE TABLE IF NOT EXISTS "euro_rates" (
  "rate_date" date PRIMARY KEY NOT NULL,
  "value" numeric(14, 2) NOT NULL CHECK ("value" > 0),
  "source_value" numeric(20, 8) NOT NULL CHECK ("source_value" > 0),
  "source" text DEFAULT 'dolarapi' NOT NULL,
  "fetched_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "congresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ref" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "venue" text,
  "specialty" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "congresses_ref_unique" UNIQUE ("ref"),
  CONSTRAINT "congresses_name_check" CHECK (char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "congresses_dates_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "congresses_venue_check" CHECK ("venue" IS NULL OR char_length("venue") BETWEEN 1 AND 160),
  CONSTRAINT "congresses_specialty_check" CHECK ("specialty" IS NULL OR char_length("specialty") BETWEEN 1 AND 160),
  CONSTRAINT "congresses_notes_check" CHECK ("notes" IS NULL OR char_length("notes") BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS "congresses_dates_idx" ON "congresses" ("start_date", "end_date");
