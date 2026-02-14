-- CreateEnum
CREATE TYPE "ScrapeStatus" AS ENUM ('pending', 'ok', 'error');

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHost" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "ingredients" JSONB,
    "instructions" JSONB,
    "scrapeStatus" "ScrapeStatus" NOT NULL DEFAULT 'pending',
    "scrapeError" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "notes" TEXT,
    "tags" JSONB,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_sourceUrl_key" ON "Recipe"("sourceUrl");
