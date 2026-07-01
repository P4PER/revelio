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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL,
	CONSTRAINT "card_localizations_card_id_lang_pk" PRIMARY KEY("card_id","lang")
);
--> statement-breakpoint
CREATE TABLE "card_rulings" (
	"card_id" text NOT NULL,
	"seq" integer NOT NULL,
	"date" text,
	"source" text,
	"text" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL,
	CONSTRAINT "card_rulings_card_id_seq_pk" PRIMARY KEY("card_id","seq")
);
--> statement-breakpoint
CREATE TABLE "card_sub_types" (
	"card_id" text NOT NULL,
	"sub_type_code" text NOT NULL,
	CONSTRAINT "card_sub_types_card_id_sub_type_code_pk" PRIMARY KEY("card_id","sub_type_code")
);
--> statement-breakpoint
CREATE TABLE "card_types" (
	"card_id" text NOT NULL,
	"type_code" text NOT NULL,
	CONSTRAINT "card_types_card_id_type_code_pk" PRIMARY KEY("card_id","type_code")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_code" text NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
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
	"draft_value" real,
	"default_language" text NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finishes" (
	"code" text PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legalities" (
	"code" text PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"code" text PRIMARY KEY NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rarities" (
	"code" text PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"release_date" text,
	"is_official" boolean DEFAULT false NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"symbol" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_types" (
	"code" text PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "types" (
	"code" text PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'import' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_localizations" ADD CONSTRAINT "card_localizations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_rulings" ADD CONSTRAINT "card_rulings_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_sub_types" ADD CONSTRAINT "card_sub_types_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_sub_types" ADD CONSTRAINT "card_sub_types_sub_type_code_sub_types_code_fk" FOREIGN KEY ("sub_type_code") REFERENCES "public"."sub_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_types" ADD CONSTRAINT "card_types_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_types" ADD CONSTRAINT "card_types_type_code_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_set_code_sets_code_fk" FOREIGN KEY ("set_code") REFERENCES "public"."sets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_lesson_lessons_code_fk" FOREIGN KEY ("lesson") REFERENCES "public"."lessons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_rarity_rarities_code_fk" FOREIGN KEY ("rarity") REFERENCES "public"."rarities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_finish_finishes_code_fk" FOREIGN KEY ("finish") REFERENCES "public"."finishes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_legality_legalities_code_fk" FOREIGN KEY ("legality") REFERENCES "public"."legalities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_set_code_idx" ON "cards" USING btree ("set_code");