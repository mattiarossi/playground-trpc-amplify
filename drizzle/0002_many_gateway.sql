CREATE UNIQUE INDEX "name_idx" ON "users" USING btree ("name");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_name_unique" UNIQUE("name");