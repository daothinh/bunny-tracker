import { Prisma, ReportStatus, RepositoryType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type DashboardFilters = {
  q?: string;
  reportStatus?: ReportStatus;
  repositoryType?: RepositoryType;
};

function buildRepositoryWhere(
  filters: DashboardFilters,
): Prisma.RepositoryWhereInput {
  const where: Prisma.RepositoryWhereInput = {};

  if (filters.q) {
    where.OR = [
      {
        fullName: {
          contains: filters.q,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: filters.q,
          mode: "insensitive",
        },
      },
      {
        qualificationSummary: {
          contains: filters.q,
          mode: "insensitive",
        },
      },
    ];
  }

  if (filters.reportStatus) {
    where.reportStatus = filters.reportStatus;
  }

  if (filters.repositoryType) {
    where.repositoryType = filters.repositoryType;
  }

  return where;
}

export async function getDashboardData(filters: DashboardFilters) {
  const where = buildRepositoryWhere(filters);

  const [
    repositories,
    totalRepositories,
    pendingReview,
    submittedCount,
    bountyCount,
    latestRun,
  ] = await Promise.all([
    prisma.repository.findMany({
      where,
      orderBy: [{ reportStatus: "asc" }, { stars: "desc" }, { lastSeenAt: "desc" }],
    }),
    prisma.repository.count(),
    prisma.repository.count({
      where: {
        reportStatus: {
          in: [ReportStatus.NEW, ReportStatus.REVIEWING],
        },
      },
    }),
    prisma.repository.count({
      where: {
        reportStatus: ReportStatus.SUBMITTED,
      },
    }),
    prisma.repository.count({
      where: {
        bountyProgramUrl: {
          not: null,
        },
      },
    }),
    prisma.syncRun.findFirst({
      orderBy: {
        startedAt: "desc",
      },
    }),
  ]);

  return {
    repositories,
    summary: {
      totalRepositories,
      pendingReview,
      submittedCount,
      bountyCount,
    },
    latestRun,
  };
}
