-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "divisionId" TEXT;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: snapshot each player's current division into their existing check-ins
UPDATE "CheckIn" ci
SET "divisionId" = p."divisionId"
FROM "Player" p
WHERE ci."playerId" = p.id AND p."divisionId" IS NOT NULL AND ci."divisionId" IS NULL;
