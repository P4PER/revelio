ALTER TABLE "card_localizations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "card_localizations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "card_localizations" ADD COLUMN "origin" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "origin" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "origin" text DEFAULT 'import' NOT NULL;