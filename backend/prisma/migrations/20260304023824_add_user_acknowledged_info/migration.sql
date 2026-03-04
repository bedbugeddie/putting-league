-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasAcknowledgedInfo" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing users are considered to have already acknowledged the league info
UPDATE "User" SET "hasAcknowledgedInfo" = true;
