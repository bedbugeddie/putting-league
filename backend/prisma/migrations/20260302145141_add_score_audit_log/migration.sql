-- CreateTable
CREATE TABLE "ScoreAuditLog" (
    "id" TEXT NOT NULL,
    "leagueNightId" TEXT NOT NULL,
    "scoreId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "holeNum" INTEGER NOT NULL,
    "roundNum" INTEGER NOT NULL,
    "position" "Position" NOT NULL,
    "prevMade" INTEGER,
    "newMade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreAuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_leagueNightId_fkey" FOREIGN KEY ("leagueNightId") REFERENCES "LeagueNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
