-- CreateEnum
CREATE TYPE "ForumNotifyMode" AS ENUM ('ALL', 'OWN_POSTS', 'ENGAGED', 'NONE');

-- CreateEnum
CREATE TYPE "DigestMode" AS ENUM ('IMMEDIATE', 'DAILY');

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forumMode" "ForumNotifyMode" NOT NULL DEFAULT 'OWN_POSTS',
    "digestMode" "DigestMode" NOT NULL DEFAULT 'IMMEDIATE',
    "lastDigestSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingDigestItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "postTitle" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "eventDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDigestItem" ADD CONSTRAINT "PendingDigestItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
