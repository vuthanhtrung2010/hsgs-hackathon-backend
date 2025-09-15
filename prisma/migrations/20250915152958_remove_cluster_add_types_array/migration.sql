/*
  Warnings:

  - You are about to drop the column `cluster` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `cluster` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[studentId,courseId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."questions_courseId_cluster_idx";

-- DropIndex
DROP INDEX "public"."users_courseId_cluster_idx";

-- DropIndex
DROP INDEX "public"."users_studentId_courseId_cluster_key";

-- AlterTable
ALTER TABLE "public"."questions" DROP COLUMN "cluster",
DROP COLUMN "type",
ADD COLUMN     "types" TEXT[];

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "cluster";

-- CreateIndex
CREATE INDEX "questions_courseId_idx" ON "public"."questions"("courseId");

-- CreateIndex
CREATE INDEX "users_courseId_idx" ON "public"."users"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "users_studentId_courseId_key" ON "public"."users"("studentId", "courseId");
