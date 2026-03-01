-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_divisionId_fkey";

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "hasPaid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 8;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
