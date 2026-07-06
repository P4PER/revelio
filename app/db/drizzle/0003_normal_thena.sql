CREATE TABLE "sub_type_translations" (
	"sub_type_code" text NOT NULL,
	"lang" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "sub_type_translations_sub_type_code_lang_pk" PRIMARY KEY("sub_type_code","lang")
);
--> statement-breakpoint
ALTER TABLE "sub_type_translations" ADD CONSTRAINT "sub_type_translations_sub_type_code_sub_types_code_fk" FOREIGN KEY ("sub_type_code") REFERENCES "public"."sub_types"("code") ON DELETE cascade ON UPDATE no action;