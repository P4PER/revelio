CREATE TABLE "collections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cards" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"finish" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "user_cards_user_id_card_id_finish_pk" PRIMARY KEY("user_id","card_id","finish")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_cards_user_id_idx" ON "user_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_cards_user_card_idx" ON "user_cards" USING btree ("user_id","card_id");