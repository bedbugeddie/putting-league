/*
  Warnings:

  - You are about to drop the column `longDistance` on the `Hole` table. All the data in the column will be lost.
  - You are about to drop the column `shortDistance` on the `Hole` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Hole" DROP COLUMN "longDistance",
DROP COLUMN "shortDistance";

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "leagueNightId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInBy" TEXT,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "leagueNightId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startingHole" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPlayer" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "CardPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_leagueNightId_playerId_key" ON "CheckIn"("leagueNightId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPlayer_cardId_playerId_key" ON "CardPlayer"("cardId", "playerId");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_leagueNightId_fkey" FOREIGN KEY ("leagueNightId") REFERENCES "LeagueNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_leagueNightId_fkey" FOREIGN KEY ("leagueNightId") REFERENCES "LeagueNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPlayer" ADD CONSTRAINT "CardPlayer_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPlayer" ADD CONSTRAINT "CardPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
