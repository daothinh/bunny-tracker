import { Prisma, ReportStatus, RepositoryScope } from "@prisma/client";
import {
  DASHBOARD_REPOSITORY_PAGE_SIZE,
  MAX_DASHBOARD_REPOSITORY_PAGE_SIZE,
  type DashboardRepositoryListItem,
  type DashboardRepositoryPage,
} from "@/lib/dashboard-list";
import { prisma } from "@/lib/db";
import type { DashboardFilters } from "@/lib/dashboard-filters";

const dashboardRepositorySelect = Prisma.validator<Prisma.RepositorySelect>()({
  id: true,
  fullName: true,
  htmlUrl: true,
  description: true,
  scope: true,
  matchedTopics: true,
  repositoryType: true,
  securitySignalType: true,
  securitySignalUrl: true,
  securityContact: true,
  bountyProgramUrl: true,
  reportStatus: true,
  reportNotes: true,
  stars: true,
  openIssues: true,
  lastPushedAt: true,
  lastScannedAt: true,
  lastSeenAt: true,
});

const dashboardRepositoryOrderBy = [
  { reportStatus: "asc" },
  { stars: "desc" },
  { lastSeenAt: "desc" },
  { id: "asc" },
] satisfies Prisma.RepositoryOrderByWithRelationInput[];

type DashboardRepositoryRecord = Prisma.RepositoryGetPayload<{
  select: typeof dashboardRepositorySelect;
}>;

export function buildRepositoryWhere(
  filters: DashboardFilters,
): Prisma.RepositoryWhereInput {
  const and: Prisma.RepositoryWhereInput[] = [];

  if (filters.q) {
    and.push({
      OR: [
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
      ],
    });
  }

  if (filters.scope) {
    and.push({
      scope: filters.scope,
    });
  }

  if (filters.reportStatus) {
    and.push({
      reportStatus: filters.reportStatus,
    });
  }

  if (filters.repositoryType) {
    and.push({
      repositoryType: filters.repositoryType,
    });
  }

  if (filters.bountyLink === "with") {
    and.push({
      bountyProgramUrl: {
        not: null,
      },
    });
  }

  if (filters.bountyLink === "without") {
    and.push({
      bountyProgramUrl: null,
    });
  }

  if (filters.emailContact === "with") {
    and.push({
      securityContact: {
        not: null,
      },
    });
  }

  if (filters.emailContact === "without") {
    and.push({
      securityContact: null,
    });
  }

  if (filters.minStars !== undefined) {
    and.push({
      stars: {
        gte: filters.minStars,
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function normalizePageSize(limit?: number): number {
  return Math.min(
    Math.max(limit ?? DASHBOARD_REPOSITORY_PAGE_SIZE, 1),
    MAX_DASHBOARD_REPOSITORY_PAGE_SIZE,
  );
}

function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function serializeRepository(
  repository: DashboardRepositoryRecord,
): DashboardRepositoryListItem {
  return {
    id: repository.id,
    fullName: repository.fullName,
    htmlUrl: repository.htmlUrl,
    description: repository.description,
    matchedTopics: toStringArray(repository.matchedTopics),
    scope: repository.scope,
    repositoryType: repository.repositoryType,
    securitySignalType: repository.securitySignalType,
    securitySignalUrl: repository.securitySignalUrl,
    securityContact: repository.securityContact,
    bountyProgramUrl: repository.bountyProgramUrl,
    reportStatus: repository.reportStatus,
    reportNotes: repository.reportNotes,
    stars: repository.stars,
    openIssues: repository.openIssues,
    lastPushedAt: repository.lastPushedAt?.toISOString() ?? null,
    lastScannedAt: repository.lastScannedAt.toISOString(),
  };
}

export async function getDashboardRepositoriesPage(
  filters: DashboardFilters,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
): Promise<DashboardRepositoryPage> {
  const pageSize = normalizePageSize(options.limit);
  const repositories = await prisma.repository.findMany({
    where: buildRepositoryWhere(filters),
    select: dashboardRepositorySelect,
    orderBy: dashboardRepositoryOrderBy,
    take: pageSize + 1,
    ...(options.cursor
      ? {
          cursor: {
            id: options.cursor,
          },
          skip: 1,
        }
      : {}),
  });

  const hasMore = repositories.length > pageSize;
  const pageRepositories = hasMore
    ? repositories.slice(0, pageSize)
    : repositories;

  return {
    repositories: pageRepositories.map(serializeRepository),
    nextCursor: hasMore
      ? pageRepositories[pageRepositories.length - 1]?.id ?? null
      : null,
    pageSize,
  };
}

export async function getDashboardRepositoriesCount(
  filters: DashboardFilters,
): Promise<number> {
  return prisma.repository.count({
    where: buildRepositoryWhere(filters),
  });
}

export async function getDashboardSummary() {
  const [
    totalRepositories,
    web3Count,
    generalCount,
    pendingReview,
    submittedCount,
    bountyCount,
    latestRun,
  ] = await Promise.all([
    prisma.repository.count(),
    prisma.repository.count({
      where: {
        scope: RepositoryScope.WEB3,
      },
    }),
    prisma.repository.count({
      where: {
        scope: RepositoryScope.GENERAL,
      },
    }),
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
    summary: {
      totalRepositories,
      web3Count,
      generalCount,
      pendingReview,
      submittedCount,
      bountyCount,
    },
    latestRun,
  };
}
