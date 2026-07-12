CREATE TABLE "deck_likes" (
	"deck_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_likes_deck_id_user_id_pk" PRIMARY KEY("deck_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "deck_views" (
	"deck_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_views_deck_id_user_id_pk" PRIMARY KEY("deck_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "lessons" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_likes" ADD CONSTRAINT "deck_likes_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_likes" ADD CONSTRAINT "deck_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_views" ADD CONSTRAINT "deck_views_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_views" ADD CONSTRAINT "deck_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_likes_user_id_idx" ON "deck_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decks_visibility_idx" ON "decks" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "decks_like_count_idx" ON "decks" USING btree ("like_count");--> statement-breakpoint
CREATE INDEX "decks_view_count_idx" ON "decks" USING btree ("view_count");--> statement-breakpoint
CREATE INDEX "decks_lessons_gin_idx" ON "decks" USING gin ("lessons");