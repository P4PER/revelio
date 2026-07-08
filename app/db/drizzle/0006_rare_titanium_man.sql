CREATE TABLE "deck_cards" (
	"deck_id" text NOT NULL,
	"card_id" text NOT NULL,
	"zone" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "deck_cards_deck_id_card_id_zone_pk" PRIMARY KEY("deck_id","card_id","zone")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_user_id_idx" ON "decks" USING btree ("user_id");