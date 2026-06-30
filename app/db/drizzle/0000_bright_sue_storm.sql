CREATE TABLE "card_localizations" (
	"card_id" text NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"source" text,
	"text" text,
	"flavor_text" text,
	"adventure" jsonb,
	"match" jsonb,
	"image_file" text,
	"image_url" text,
	CONSTRAINT "card_localizations_card_id_lang_pk" PRIMARY KEY("card_id","lang")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_code" text NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"types" text[] DEFAULT '{}' NOT NULL,
	"sub_types" text[] DEFAULT '{}' NOT NULL,
	"lesson" text,
	"cost" integer,
	"provides" jsonb,
	"rarity" text,
	"finish" text,
	"artist" text[] DEFAULT '{}' NOT NULL,
	"health" integer,
	"damage_per_turn" integer,
	"orientation" text,
	"legality" text,
	"draft_value" integer,
	"rulings" jsonb,
	"default_language" text NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"release_date" text,
	"is_official" boolean DEFAULT false NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"symbol" text
);
--> statement-breakpoint
ALTER TABLE "card_localizations" ADD CONSTRAINT "card_localizations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_set_code_sets_code_fk" FOREIGN KEY ("set_code") REFERENCES "public"."sets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_set_code_idx" ON "cards" USING btree ("set_code");