-- CreateEnum
CREATE TYPE "Cluster" AS ENUM ('ART', 'BUSINESS', 'COMMUNICATION', 'CRIME', 'ECONOMY', 'EDUCATION', 'ENVIRONMENT', 'FAMILY_AND_CHILDREN', 'FOOD', 'HEALTH', 'LANGUAGE', 'MEDIA', 'READING', 'TECHNOLOGY', 'TRANSPORT', 'TRAVEL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "shortName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "quizPointsPossible" DOUBLE PRECISION,
    "cluster" "Cluster",
    "Rq" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ratings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cluster" "Cluster" NOT NULL,
    "Ru" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "workflowState" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "canvasSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_history" (
    "id" TEXT NOT NULL,
    "lastRun" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_studentId_key" ON "users"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_ratings_userId_cluster_key" ON "user_ratings"("userId", "cluster");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_submissions_canvasSubmissionId_key" ON "quiz_submissions"("canvasSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_submissions_userId_quizId_key" ON "quiz_submissions"("userId", "quizId");

-- AddForeignKey
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
