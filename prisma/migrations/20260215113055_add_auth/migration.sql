-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "userId" INTEGER;

-- DropIndex
DROP INDEX "Recipe_sourceUrl_key";

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_userId_sourceUrl_key" ON "Recipe"("userId", "sourceUrl");

-- CreateIndex
CREATE INDEX "Recipe_userId_updatedAt_idx" ON "Recipe"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
