CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"courseId" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"randomId" text DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"quote" text DEFAULT 'Thi đua là yêu nước, yêu nước phải thi đua',
	"quoteAuthor" text DEFAULT 'Bác Hồ',
	"assignmentCount" integer DEFAULT 0 NOT NULL,
	"showDebt" boolean DEFAULT false NOT NULL,
	"customRatingThresholds" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_randomId_unique" UNIQUE("randomId"),
	CONSTRAINT "courses_randomId_key" UNIQUE("randomId")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quizId" text NOT NULL,
	"quizName" text NOT NULL,
	"courseId" text NOT NULL,
	"types" text[] DEFAULT '{}'::text[] NOT NULL,
	"lesson" text,
	"difficulty" double precision,
	"class" integer,
	"rating" double precision DEFAULT 1500 NOT NULL,
	"submissionCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "questions_quizId_courseId_key" UNIQUE("quizId","courseId")
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"questionId" integer NOT NULL,
	"submissionId" text NOT NULL,
	"score" double precision NOT NULL,
	"maxScore" double precision NOT NULL,
	"submittedAt" timestamp NOT NULL,
	"ratingChange" double precision DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_submissionId_unique" UNIQUE("submissionId"),
	CONSTRAINT "quizzes_userId_questionId_key" UNIQUE("userId","questionId")
);
--> statement-breakpoint
CREATE TABLE "rating_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" text NOT NULL,
	"newbieThreshold" integer DEFAULT 0 NOT NULL,
	"amateurThreshold" integer DEFAULT 1000 NOT NULL,
	"expertThreshold" integer DEFAULT 1300 NOT NULL,
	"candidateMasterThreshold" integer DEFAULT 1600 NOT NULL,
	"masterThreshold" integer DEFAULT 1900 NOT NULL,
	"grandmasterThreshold" integer DEFAULT 2100 NOT NULL,
	"targetThreshold" integer DEFAULT 2400 NOT NULL,
	"adminThreshold" integer DEFAULT 3000 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rating_thresholds_courseId_unique" UNIQUE("courseId"),
	CONSTRAINT "rating_thresholds_courseId_key" UNIQUE("courseId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" text NOT NULL,
	"lastSync" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_history_courseId_unique" UNIQUE("courseId"),
	CONSTRAINT "sync_history_courseId_key" UNIQUE("courseId")
);
--> statement-breakpoint
CREATE TABLE "topic_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"userId" integer NOT NULL,
	"courseId" text NOT NULL,
	"rating" double precision DEFAULT 1500 NOT NULL,
	"submissionCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topic_ratings_topic_userId_courseId_key" UNIQUE("topic","userId","courseId")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" text NOT NULL,
	"name" text NOT NULL,
	"shortName" text NOT NULL,
	"courseId" text NOT NULL,
	"rating" double precision DEFAULT 1500 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_studentId_courseId_key" UNIQUE("studentId","courseId")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_questionId_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_thresholds" ADD CONSTRAINT "rating_thresholds_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_ratings" ADD CONSTRAINT "topic_ratings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_announcements_course" ON "announcements" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_questions_course_quiz" ON "questions" USING btree ("courseId","quizId");--> statement-breakpoint
CREATE INDEX "questions_courseId_idx" ON "questions" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "questions_quizId_idx" ON "questions" USING btree ("quizId");--> statement-breakpoint
CREATE INDEX "idx_quizzes_user_question" ON "quizzes" USING btree ("userId","questionId");--> statement-breakpoint
CREATE INDEX "idx_quizzes_userid_include" ON "quizzes" USING btree ("userId","questionId");--> statement-breakpoint
CREATE INDEX "quizzes_userId_idx" ON "quizzes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "quizzes_questionId_idx" ON "quizzes" USING btree ("questionId");--> statement-breakpoint
CREATE INDEX "idx_sync_history_course" ON "sync_history" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "topic_ratings_userId_idx" ON "topic_ratings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "topic_ratings_courseId_idx" ON "topic_ratings" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_users_student_course" ON "users" USING btree ("studentId","courseId");--> statement-breakpoint
CREATE INDEX "users_courseId_idx" ON "users" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "users_studentId_idx" ON "users" USING btree ("studentId");