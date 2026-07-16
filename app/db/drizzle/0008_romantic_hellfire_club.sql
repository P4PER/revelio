ALTER TABLE "cards" DROP CONSTRAINT "cards_finish_finishes_code_fk";
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "finishes" text[] DEFAULT '{"normal"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "finish";