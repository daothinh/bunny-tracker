import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestHasManagerAccess } from "@/lib/auth";
import {
  MAX_DASHBOARD_REPOSITORY_PAGE_SIZE,
} from "@/lib/dashboard-list";
import { dashboardFiltersQuerySchema } from "@/lib/dashboard-filters";
import { getDashboardRepositoriesPage } from "@/lib/dashboard";

const repositoriesQuerySchema = dashboardFiltersQuerySchema.extend({
  cursor: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  limit: dashboardFiltersQuerySchema.shape.minStars.refine(
    (value) =>
      value === undefined ||
      (value >= 1 && value <= MAX_DASHBOARD_REPOSITORY_PAGE_SIZE),
    {
      message: "Expected a page size within range.",
    },
  ),
});

export async function GET(request: NextRequest) {
  if (!requestHasManagerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = repositoriesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { q, scope, reportStatus, repositoryType, bountyLink, emailContact, minStars, cursor, limit } =
    parsed.data;
  const page = await getDashboardRepositoriesPage(
    {
      q,
      scope,
      reportStatus,
      repositoryType,
      bountyLink,
      emailContact,
      minStars,
    },
    {
      cursor,
      limit,
    },
  );

  return NextResponse.json(page);
}
