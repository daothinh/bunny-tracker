import type { DashboardBountyLinkFilter } from "@/lib/dashboard-filters";
import type {
  ReportStatus,
  RepositoryScope,
  RepositoryType,
  SecuritySignalType,
} from "@prisma/client";

export const DASHBOARD_REPOSITORY_PAGE_SIZE = 40;
export const MAX_DASHBOARD_REPOSITORY_PAGE_SIZE = 100;

export type DashboardRepositoryFiltersState = {
  q: string | null;
  scope: RepositoryScope | null;
  reportStatus: ReportStatus | null;
  repositoryType: RepositoryType | null;
  bountyLink: DashboardBountyLinkFilter | null;
  emailContact: DashboardBountyLinkFilter | null;
  minStars: number | null;
};

export type DashboardRepositoryListItem = {
  id: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  scope: RepositoryScope;
  matchedTopics: string[];
  repositoryType: RepositoryType;
  securitySignalType: SecuritySignalType;
  securitySignalUrl: string | null;
  securityContact: string | null;
  bountyProgramUrl: string | null;
  reportStatus: ReportStatus;
  reportNotes: string | null;
  stars: number;
  openIssues: number;
  lastPushedAt: string | null;
  lastScannedAt: string;
};

export type DashboardRepositoryPage = {
  repositories: DashboardRepositoryListItem[];
  nextCursor: string | null;
  pageSize: number;
};
