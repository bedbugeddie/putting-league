-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "housePerEntry" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "eoyPerEntry" DOUBLE PRECISION NOT NULL DEFAULT 2,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- Seed default row
INSERT INTO "Settings" ("id", "housePerEntry", "eoyPerEntry") VALUES (1, 1, 2)
ON CONFLICT ("id") DO NOTHING;
