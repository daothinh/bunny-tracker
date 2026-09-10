import { ReportStatus, RepositoryScope, RepositoryType } from "@prisma/client";
import { z } from "zod";
import {
  REPORT_STATUS_OPTIONS,
  REPOSITORY_SCOPE_OPTIONS,
  REPOSITORY_TYPE_OPTIONS,
} from "@/lib/constants";

export const DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS = [
  "with",
  "without",
] as const;

export type DashboardBountyLinkFilter =
  (typeof DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS)[number];

export const DASHBOARD_BOUNTY_LINK_FILTER_LABELS: Record<
  DashboardBountyLinkFilter,
  string
> = {
  with: "Has bounty link",
  without: "No bounty link",
};

export const DASHBOARD_EMAIL_FILTER_OPTIONS = [
  "with",
  "without",
] as const;

export type DashboardEmailFilter =
  (typeof DASHBOARD_EMAIL_FILTER_OPTIONS)[number];

export const DASHBOARD_EMAIL_FILTER_LABELS: Record<
  DashboardEmailFilter,
  string
> = {
  with: "Has email contact",
  without: "No email contact",
};

export type DashboardFilters = {
  q?: string;
  scope?: RepositoryScope;
  reportStatus?: ReportStatus;
  repositoryType?: RepositoryType;
  bountyLink?: DashboardBountyLinkFilter;
  emailContact?: DashboardEmailFilter;
  minStars?: number;
};

type DashboardFilterSearchParams = {
  q?: string;
  scope?: string;
  reportStatus?: string;
  repositoryType?: string;
  bountyLink?: string;
  emailContact?: string;
  minStars?: string;
};

export type DashboardFilterParamsInput = {
  q?: string | null;
  scope?: string | null;
  reportStatus?: string | null;
  repositoryType?: string | null;
  bountyLink?: string | null;
  emailContact?: string | null;
  minStars?: number | null;
};

export function dashboardFiltersToSearchParams(
  filters: DashboardFilterParamsInput,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.scope) {
    params.set("scope", filters.scope);
  }

  if (filters.reportStatus) {
    params.set("reportStatus", filters.reportStatus);
  }

  if (filters.repositoryType) {
    params.set("repositoryType", filters.repositoryType);
  }

  if (filters.bountyLink) {
    params.set("bountyLink", filters.bountyLink);
  }

  if (filters.emailContact) {
    params.set("emailContact", filters.emailContact);
  }

  if (filters.minStars !== null && filters.minStars !== undefined) {
    params.set("minStars", String(filters.minStars));
  }

  return params;
}

const optionalQueryStringSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const optionalNonNegativeIntegerQuerySchema = optionalQueryStringSchema
  .refine((value) => value === undefined || /^\d+$/.test(value), {
    message: "Expected a non-negative integer.",
  })
  .transform((value) => (value === undefined ? undefined : Number(value)));

export const dashboardFiltersQuerySchema = z.object({
  q: optionalQueryStringSchema,
  scope: z.nativeEnum(RepositoryScope).optional(),
  reportStatus: z.nativeEnum(ReportStatus).optional(),
  repositoryType: z.nativeEnum(RepositoryType).optional(),
  bountyLink: z.enum(DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS).optional(),
  emailContact: z.enum(DASHBOARD_EMAIL_FILTER_OPTIONS).optional(),
  minStars: optionalNonNegativeIntegerQuerySchema,
});

export function parseDashboardFiltersSearchParams(
  searchParams: DashboardFilterSearchParams,
): DashboardFilters {
  const q = searchParams.q?.trim() || undefined;
  const scope = REPOSITORY_SCOPE_OPTIONS.find(
    (option) => option === searchParams.scope,
  );
  const reportStatus = REPORT_STATUS_OPTIONS.find(
    (status) => status === searchParams.reportStatus,
  );
  const repositoryType = REPOSITORY_TYPE_OPTIONS.find(
    (type) => type === searchParams.repositoryType,
  );
  const bountyLink = DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS.find(
    (option) => option === searchParams.bountyLink,
  );
  const emailContact = DASHBOARD_EMAIL_FILTER_OPTIONS.find(
    (option) => option === searchParams.emailContact,
  );
  const minStars = parseOptionalNonNegativeInteger(searchParams.minStars);

  return {
    q,
    scope,
    reportStatus,
    repositoryType,
    bountyLink,
    emailContact,
    minStars,
  };
}

export function parseOptionalNonNegativeInteger(
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
