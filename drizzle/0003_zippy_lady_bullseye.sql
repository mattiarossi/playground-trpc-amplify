CREATE TABLE "client_sessions" (
	"session_id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_sessions_user_id_idx" ON "client_sessions" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_sessions_last_used_idx" ON "client_sessions" USING btree ("last_used_at");