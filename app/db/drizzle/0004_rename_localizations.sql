ALTER TABLE "sub_type_translations" RENAME TO "sub_type_localizations";--> statement-breakpoint
ALTER TABLE "sub_type_localizations" RENAME CONSTRAINT "sub_type_translations_sub_type_code_lang_pk" TO "sub_type_localizations_sub_type_code_lang_pk";--> statement-breakpoint
ALTER TABLE "sub_type_localizations" RENAME CONSTRAINT "sub_type_translations_sub_type_code_sub_types_code_fk" TO "sub_type_localizations_sub_type_code_sub_types_code_fk";--> statement-breakpoint
ALTER TABLE "card_ruling_texts" RENAME TO "card_ruling_localizations";--> statement-breakpoint
ALTER TABLE "card_ruling_localizations" RENAME CONSTRAINT "card_ruling_texts_ruling_id_lang_pk" TO "card_ruling_localizations_ruling_id_lang_pk";--> statement-breakpoint
ALTER TABLE "card_ruling_localizations" RENAME CONSTRAINT "card_ruling_texts_ruling_id_card_rulings_id_fk" TO "card_ruling_localizations_ruling_id_card_rulings_id_fk";
