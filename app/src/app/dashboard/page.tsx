import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  Bug,
  GitBranch,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { DashboardRepositoryList } from "@/components/dashboard-repository-list";
import { SubmitButton } from "@/components/submit-button";
import { requireManager } from "@/lib/auth";
import {
  APP_TITLE,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_OPTIONS,
  REPOSITORY_SCOPE_LABELS,
  REPOSITORY_SCOPE_OPTIONS,
  REPOSITORY_TYPE_LABELS,
  REPOSITORY_TYPE_OPTIONS,
} from "@/lib/constants";
import {
  DASHBOARD_BOUNTY_LINK_FILTER_LABELS,
  DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS,
  DASHBOARD_EMAIL_FILTER_LABELS,
  DASHBOARD_EMAIL_FILTER_OPTIONS,
  parseDashboardFiltersSearchParams,
} from "@/lib/dashboard-filters";
import { DASHBOARD_REPOSITORY_PAGE_SIZE } from "@/lib/dashboard-list";
import {
  getDashboardRepositoriesCount,
  getDashboardRepositoriesPage,
  getDashboardSummary,
} from "@/lib/dashboard";
import { getDashboardGitHubSettings } from "@/lib/runtime-settings";
import { logoutAction, updateGitHubTokenAction } from "./actions";

type DashboardPageProps = {
  searchParams: Promise<{
    q?: string;
    scope?: string;
    reportStatus?: string;
    repositoryType?: string;
    bountyLink?: string;
    emailContact?: string;
    minStars?: string;
  }>;
};

function formatRelativeDate(value: Date | null): string {
  if (!value) {
    return "n/a";
  }

  return formatDistanceToNow(value, { addSuffix: true });
}

function filterKeyPart(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await requireManager();

  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFiltersSearchParams(resolvedSearchParams);
  const { q, scope, reportStatus, repositoryType, bountyLink, emailContact, minStars } =
    filters;
  const [{ repositories, nextCursor, pageSize }, filteredCount, { summary, latestRun }, githubSettings] =
    await Promise.all([
      getDashboardRepositoriesPage(filters, {
        limit: DASHBOARD_REPOSITORY_PAGE_SIZE,
      }),
      getDashboardRepositoriesCount(filters),
      getDashboardSummary(),
      getDashboardGitHubSettings(),
    ]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="shell-panel rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
                <GitBranch className="h-4 w-4 text-[color:var(--accent)]" />
                GitHub bug bounty tracker · web3 + phần còn lại
              </div>
              <h1 className="mt-4 font-[var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl">
                {APP_TITLE}
              </h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <form action={logoutAction}>
                <SubmitButton
                  pendingLabel="Leaving..."
                  className="action-secondary h-11 rounded-2xl px-5"
                >
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[color:var(--muted)]">
            <span className="shell-pill rounded-full px-4 py-2">
              Last run:{" "}
              <strong className="text-[color:var(--foreground)]">
                {latestRun ? formatRelativeDate(latestRun.startedAt) : "never"}
              </strong>
            </span>
            <span className="shell-pill rounded-full px-4 py-2">
              Last status:{" "}
              <strong className="text-[color:var(--foreground)]">
                {latestRun?.status ?? "No sync yet"}
              </strong>
            </span>
            <form
              action={updateGitHubTokenAction}
              className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
            >
              <span className="shell-pill rounded-full px-4 py-2">
                GitHub token:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {githubSettings.githubTokenConfigured
                    ? githubSettings.githubTokenMask ?? "configured"
                    : "missing"}
                </strong>
              </span>
              <input
                type="password"
                name="githubToken"
                className="field h-11 min-w-0 flex-1 rounded-2xl px-4 py-3 sm:max-w-sm"
                placeholder={
                  githubSettings.githubTokenConfigured
                    ? "Paste a new GitHub token to replace the current one"
                    : "Paste a GitHub token to raise API limits"
                }
              />
              <SubmitButton
                pendingLabel="Saving..."
                className="action-primary h-11 rounded-2xl px-5"
              >
                Save token
              </SubmitButton>
            </form>
          </div>
          {latestRun ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-[color:var(--muted)]">
              <span className="shell-pill rounded-full px-4 py-2">
                Candidates:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {latestRun.candidateCount}
                </strong>
              </span>
              <span className="shell-pill rounded-full px-4 py-2">
                Qualified:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {latestRun.qualifiedCount}
                </strong>
              </span>
              <span className="shell-pill rounded-full px-4 py-2">
                Errors:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {latestRun.errorCount}
                </strong>
              </span>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="shell-panel rounded-[1.8rem] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Tracked
              </p>
              <Layers3 className="h-5 w-5 text-[color:var(--teal)]" />
            </div>
            <p className="mt-4 text-3xl font-semibold">{summary.totalRepositories}</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Tổng số repo hợp lệ đang được quản lý.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="shell-pill rounded-full px-3 py-1">
                Web3:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {summary.web3Count}
                </strong>
              </span>
              <span className="shell-pill rounded-full px-3 py-1">
                Phần còn lại:{" "}
                <strong className="text-[color:var(--foreground)]">
                  {summary.generalCount}
                </strong>
              </span>
            </div>
          </article>

          <article className="shell-panel rounded-[1.8rem] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Needs review
              </p>
              <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <p className="mt-4 text-3xl font-semibold">{summary.pendingReview}</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Repo đang ở trạng thái `new` hoặc `reviewing`.
            </p>
          </article>

          <article className="shell-panel rounded-[1.8rem] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Submitted
              </p>
              <ArrowUpRight className="h-5 w-5 text-[color:var(--teal)]" />
            </div>
            <p className="mt-4 text-3xl font-semibold">{summary.submittedCount}</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Report đã được gửi và đang theo dõi.
            </p>
          </article>

          <article className="shell-panel rounded-[1.8rem] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Bounty links
              </p>
              <Bug className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <p className="mt-4 text-3xl font-semibold">{summary.bountyCount}</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Repo có URL bug bounty được trích xuất.
            </p>
          </article>
        </section>

        <section className="shell-panel rounded-[2rem] p-5 sm:p-6">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.55fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.45fr)_auto] xl:items-end">
            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Search
              <input
                type="search"
                name="q"
                defaultValue={q}
                className="field rounded-2xl px-4 py-3"
                placeholder="Search repo name, description, or evidence"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Scope
              <select
                name="scope"
                defaultValue={scope ?? ""}
                className="field rounded-2xl px-4 py-3"
              >
                <option value="">All scopes</option>
                {REPOSITORY_SCOPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {REPOSITORY_SCOPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Status
              <select
                name="reportStatus"
                defaultValue={reportStatus ?? ""}
                className="field rounded-2xl px-4 py-3"
              >
                <option value="">All statuses</option>
                {REPORT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {REPORT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Type
              <select
                name="repositoryType"
                defaultValue={repositoryType ?? ""}
                className="field rounded-2xl px-4 py-3"
              >
                <option value="">All types</option>
                {REPOSITORY_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {REPOSITORY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Bounty
              <select
                name="bountyLink"
                defaultValue={bountyLink ?? ""}
                className="field rounded-2xl px-4 py-3"
              >
                <option value="">All repos</option>
                {DASHBOARD_BOUNTY_LINK_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {DASHBOARD_BOUNTY_LINK_FILTER_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Email
              <select
                name="emailContact"
                defaultValue={emailContact ?? ""}
                className="field rounded-2xl px-4 py-3"
              >
                <option value="">All repos</option>
                {DASHBOARD_EMAIL_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {DASHBOARD_EMAIL_FILTER_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
              Stars
              <input
                type="number"
                name="minStars"
                min={0}
                step={1}
                inputMode="numeric"
                defaultValue={minStars ?? ""}
                className="field rounded-2xl px-4 py-3"
                placeholder="Min"
              />
            </label>

            <button
              type="submit"
              className="action-secondary h-11 rounded-2xl px-5 text-sm font-semibold"
            >
              Apply filters
            </button>
          </form>
        </section>

        <DashboardRepositoryList
          key={[
            filterKeyPart(q),
            filterKeyPart(scope),
            filterKeyPart(reportStatus),
            filterKeyPart(repositoryType),
            filterKeyPart(bountyLink),
            filterKeyPart(emailContact),
            filterKeyPart(minStars),
          ].join(":")}
          filters={{
            q: q ?? null,
            scope: scope ?? null,
            reportStatus: reportStatus ?? null,
            repositoryType: repositoryType ?? null,
            bountyLink: bountyLink ?? null,
            emailContact: emailContact ?? null,
            minStars: minStars ?? null,
          }}
          initialRepositories={repositories}
          initialNextCursor={nextCursor}
          pageSize={pageSize}
          totalCount={filteredCount}
        />
      </div>
    </main>
  );
}
