-- Hand-added: drizzle-kit does not emit extensions. pg_trgm ships with stock
-- Postgres and is trusted since PG13, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "decks_name_trgm_idx" ON "decks" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_username_trgm_idx" ON "user" USING gin ("username" gin_trgm_ops);