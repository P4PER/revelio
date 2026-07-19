ALTER TABLE "card_localizations" ADD COLUMN "image_version" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "art_crop_version" integer;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "symbol_version" integer;--> statement-breakpoint
ALTER TABLE "card_localizations" DROP COLUMN "image_file";--> statement-breakpoint
ALTER TABLE "card_localizations" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "sets" DROP COLUMN "symbol";