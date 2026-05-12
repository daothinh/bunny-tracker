CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "githubTokenEncrypted" TEXT,
    "githubTopics" TEXT[] NOT NULL,
    "githubSearchQueries" TEXT[] NOT NULL,
    "maxReposPerRun" INTEGER NOT NULL DEFAULT 18,
    "searchResultsPerQuery" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
