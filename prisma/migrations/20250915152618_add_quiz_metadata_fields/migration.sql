-- AlterTable
ALTER TABLE "public"."questions" ADD COLUMN     "class" INTEGER,
ADD COLUMN     "difficulty" DOUBLE PRECISION,
ADD COLUMN     "lesson" TEXT,
ADD COLUMN     "type" TEXT;
