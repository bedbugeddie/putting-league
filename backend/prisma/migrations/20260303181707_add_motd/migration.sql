-- CreateTable
CREATE TABLE "Motd" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motd_pkey" PRIMARY KEY ("id")
);
