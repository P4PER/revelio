CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"operator_name" text,
	"operator_address" text,
	"contact_email" text,
	"hosting_provider" text,
	"responsible_person" text,
	"github_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
