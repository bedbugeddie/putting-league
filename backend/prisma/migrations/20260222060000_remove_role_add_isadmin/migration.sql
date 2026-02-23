-- Add isAdmin flag to User (default false)
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing ADMIN users
UPDATE "User" SET "isAdmin" = true WHERE "role" = 'ADMIN';

-- Drop the role column
ALTER TABLE "User" DROP COLUMN "role";

-- Drop the Role enum
DROP TYPE "Role";

-- Make Player.divisionId nullable
ALTER TABLE "Player" ALTER COLUMN "divisionId" DROP NOT NULL;
