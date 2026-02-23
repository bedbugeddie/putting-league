-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "scorekeeperId" TEXT;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_scorekeeperId_fkey" FOREIGN KEY ("scorekeeperId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
