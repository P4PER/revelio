CREATE TABLE "set_localizations" (
	"set_code" text NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "set_localizations_set_code_lang_pk" PRIMARY KEY("set_code","lang")
);
--> statement-breakpoint
ALTER TABLE "set_localizations" ADD CONSTRAINT "set_localizations_set_code_sets_code_fk" FOREIGN KEY ("set_code") REFERENCES "public"."sets"("code") ON DELETE cascade ON UPDATE no action;