CREATE TABLE "message_chunks" (
	"message_id" varchar(255) NOT NULL,
	"chunk_index" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"chunk_data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "message_chunks_pk" ON "message_chunks" USING btree ("message_id","chunk_index");