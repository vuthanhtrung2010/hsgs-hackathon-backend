-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "customRatingThresholds" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rating_thresholds" (
    "id" SERIAL NOT NULL,
    "courseId" TEXT NOT NULL,
    "newbieThreshold" INTEGER NOT NULL DEFAULT 0,
    "amateurThreshold" INTEGER NOT NULL DEFAULT 1000,
    "expertThreshold" INTEGER NOT NULL DEFAULT 1300,
    "candidateMasterThreshold" INTEGER NOT NULL DEFAULT 1600,
    "masterThreshold" INTEGER NOT NULL DEFAULT 1900,
    "grandmasterThreshold" INTEGER NOT NULL DEFAULT 2100,
    "targetThreshold" INTEGER NOT NULL DEFAULT 2400,
    "adminThreshold" INTEGER NOT NULL DEFAULT 3000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rating_thresholds_courseId_key" ON "rating_thresholds"("courseId");

-- AddForeignKey
ALTER TABLE "rating_thresholds" ADD CONSTRAINT "rating_thresholds_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
