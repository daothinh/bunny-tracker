-- CreateEnum
CREATE TYPE "RepositoryType" AS ENUM ('SMART_CONTRACTS', 'PROTOCOL', 'INFRASTRUCTURE', 'TOOLING', 'WALLET', 'APPLICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "SecuritySignalType" AS ENUM ('SECURITY_FILE', 'BUG_BOUNTY', 'SECURITY_CONTACT', 'RESPONSIBLE_DISCLOSURE', 'README_MENTION');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'REVIEWING', 'DRAFTING', 'SUBMITTED', 'TRIAGED', 'RESOLVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILURE');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "description" TEXT,
    "homepageUrl" TEXT,
    "defaultBranch" TEXT,
    "primaryLanguage" TEXT,
    "topics" JSONB NOT NULL,
    "matchedTopics" JSONB NOT NULL,
    "repositoryType" "RepositoryType" NOT NULL DEFAULT 'OTHER',
    "qualificationSummary" TEXT NOT NULL,
    "securitySignalType" "SecuritySignalType" NOT NULL,
    "securitySignalUrl" TEXT,
    "securitySignalExcerpt" TEXT NOT NULL,
    "securityContact" TEXT,
    "bountyProgramUrl" TEXT,
    "reportStatus" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "reportNotes" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "lastPushedAt" TIMESTAMP(3),
    "lastScannedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "queries" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "repoFullName" TEXT,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubRepoId_key" ON "Repository"("githubRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE INDEX "Repository_reportStatus_idx" ON "Repository"("reportStatus");

-- CreateIndex
CREATE INDEX "Repository_repositoryType_idx" ON "Repository"("repositoryType");

-- CreateIndex
CREATE INDEX "Repository_lastSeenAt_idx" ON "Repository"("lastSeenAt");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "SyncError_syncRunId_idx" ON "SyncError"("syncRunId");

-- CreateIndex
CREATE INDEX "SyncError_repoFullName_idx" ON "SyncError"("repoFullName");

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
