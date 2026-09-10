-- CreateEnum
CREATE TYPE "RepositoryScope" AS ENUM ('WEB3', 'GENERAL');

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN "scope" "RepositoryScope" NOT NULL DEFAULT 'WEB3';

-- CreateIndex
CREATE INDEX "Repository_scope_idx" ON "Repository"("scope");
