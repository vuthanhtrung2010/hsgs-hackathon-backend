-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "assignmentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "showDebt" BOOLEAN NOT NULL DEFAULT false;
