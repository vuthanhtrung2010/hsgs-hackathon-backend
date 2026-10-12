CREATE TABLE "sub_leaderboard_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"subLeaderboardId" text NOT NULL,
	"studentId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_leaderboard_members_unique_key" UNIQUE("subLeaderboardId","studentId")
);
--> statement-breakpoint
CREATE TABLE "sub_leaderboards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"courseId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sub_leaderboard_members" ADD CONSTRAINT "sub_leaderboard_members_subLeaderboardId_sub_leaderboards_id_fk" FOREIGN KEY ("subLeaderboardId") REFERENCES "public"."sub_leaderboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_leaderboards" ADD CONSTRAINT "sub_leaderboards_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sub_leaderboard_members_leaderboard" ON "sub_leaderboard_members" USING btree ("subLeaderboardId");--> statement-breakpoint
CREATE INDEX "idx_sub_leaderboard_members_student" ON "sub_leaderboard_members" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "idx_sub_leaderboards_course" ON "sub_leaderboards" USING btree ("courseId");