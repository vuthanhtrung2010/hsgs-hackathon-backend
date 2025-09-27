-- CreateTable
CREATE TABLE "public"."topic_ratings" (
    "id" SERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_ratings_userId_idx" ON "public"."topic_ratings"("userId");

-- CreateIndex
CREATE INDEX "topic_ratings_courseId_idx" ON "public"."topic_ratings"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_ratings_topic_userId_courseId_key" ON "public"."topic_ratings"("topic", "userId", "courseId");

-- AddForeignKey
ALTER TABLE "public"."topic_ratings" ADD CONSTRAINT "topic_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
