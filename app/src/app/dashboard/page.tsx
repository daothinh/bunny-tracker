import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  Bug,
  ExternalLink,
  GitBranch,
  Layers3,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { ReportStatus, RepositoryType } from "@prisma/client";
import { SubmitButton } from "@/components/submit-button";
import { requireManager } from "@/lib/auth";
import {
  APP_TITLE,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_OPTIONS,
  REPOSITORY_TYPE_LABELS,
  REPOSITORY_TYPE_OPTIONS,
  SECURITY_SIGNAL_LABELS,
} from "@/lib/constants";
import { getDashboardData } from "@/lib/dashboard";
import {
  getDashboardGitHubSettings,
} from "@/lib/runtime-settings";
import {
  logoutAction,
  updateGitHubTokenAction,
  updateRepositoryAction,
} from "./actions";

type DashboardPageProps = {
  searchParams: Promise<{
    q?: string;
    reportStatus?: string;
    repositoryType?: string;
  }>;
};

function formatRelativeDate(value: Date | null): string {
  if (!value) {
    return "n/a";
  }

  return formatDistanceToNow(value, { addSuffix: true });
}

function parseReportStatus(value: string | undefined): ReportStatus | undefined {
  return REPORT_STATUS_OPTIONS.find((status) => status === value);
}

function parseRepositoryType(
  value: string | undefined,
): RepositoryType | undefined {
  return REPOSITORY_TYPE_OPTIONS.find((type) => type === value);
}

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await requireManager();

  const resolvedSearchParams = await searchParams;
  const reportStatus = parseReportStatus(resolvedSearchParams.reportStatus);
  const repositoryType = parseRepositoryType(
    resolvedSearchParams.repositoryType,
  );
  const q = resolvedSearchParams.q?.trim();

  const [{ repositories, summary, latestRun }, githubSettings] =
    await Promise.all([
      getDashboardData({
        q,
        reportStatus,
        repositoryType,
      }),
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
                GitHub-only web3 tracker
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
          <form className="grid gap-3 lg:grid-cols-[1.2fr_0.5fr_0.5fr_auto] lg:items-end">
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

            <button
              type="submit"
              className="action-secondary h-11 rounded-2xl px-5 text-sm font-semibold"
            >
              Apply filters
            </button>
          </form>
        </section>

        <section className="space-y-4 xl:hidden">
          {repositories.length === 0 ? (
            <div className="shell-panel rounded-[2rem] p-8 text-center text-sm text-[color:var(--muted)]">
              Không có repo nào khớp bộ lọc hiện tại.
            </div>
          ) : null}

          {repositories.map((repository) => (
            <article
              key={repository.id}
              className="shell-panel rounded-[2rem] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a
                    href={repository.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-lg font-semibold transition hover:text-[color:var(--accent)]"
                  >
                    {repository.fullName}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <p className="mt-1.5 text-sm leading-6 text-[color:var(--muted)] line-clamp-3">
                    {repository.description ?? "No description"}
                  </p>
                </div>
                <span className="shell-pill rounded-full px-3 py-1 text-xs font-medium">
                  {REPOSITORY_TYPE_LABELS[repository.repositoryType]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(repository.matchedTopics as string[]).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-[color:var(--line)] bg-white/60 px-2.5 py-1 text-xs"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid gap-3.5">
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/55 p-3.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">
                      {SECURITY_SIGNAL_LABELS[repository.securitySignalType]}
                    </p>
                    {repository.securitySignalUrl ? (
                      <a
                        href={repository.securitySignalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--accent)]"
                      >
                        Open evidence
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
                    {repository.securityContact ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {repository.securityContact}
                      </span>
                    ) : null}
                    {repository.bountyProgramUrl ? (
                      <a
                        href={repository.bountyProgramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[color:var(--accent)]"
                      >
                        <Bug className="h-3.5 w-3.5" />
                        Bounty program
                      </a>
                    ) : null}
                  </div>
                </div>

                <form action={updateRepositoryAction} className="grid gap-2.5">
                  <input type="hidden" name="repositoryId" value={repository.id} />
                  <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
                    Status
                    <select
                      name="reportStatus"
                      defaultValue={repository.reportStatus}
                      className="field rounded-2xl px-4 py-3"
                    >
                      {REPORT_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {REPORT_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
                    Notes
                    <textarea
                      name="reportNotes"
                      rows={3}
                      defaultValue={repository.reportNotes ?? ""}
                      className="field rounded-2xl px-4 py-3 leading-6"
                      placeholder="Keep context for report submission here"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Saving..."
                    className="action-primary h-10 rounded-2xl"
                  >
                    Save status
                  </SubmitButton>
                </form>

                <div className="grid grid-cols-2 gap-2.5 text-xs text-[color:var(--muted)] md:grid-cols-4">
                  <span className="shell-pill rounded-2xl px-3 py-2">
                    Stars: {repository.stars}
                  </span>
                  <span className="shell-pill rounded-2xl px-3 py-2">
                    Issues: {repository.openIssues}
                  </span>
                  <span className="shell-pill rounded-2xl px-3 py-2">
                    Pushed: {formatRelativeDate(repository.lastPushedAt)}
                  </span>
                  <span className="shell-pill rounded-2xl px-3 py-2">
                    Scanned: {formatRelativeDate(repository.lastScannedAt)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="shell-panel hidden overflow-hidden rounded-[2rem] xl:block">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-[color:var(--line)] text-sm">
              <thead className="bg-white/50 text-left text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                <tr>
                  <th className="w-[30%] px-4 py-3.5">Repository</th>
                  <th className="w-[11%] px-4 py-3.5">Type</th>
                  <th className="w-[22%] px-4 py-3.5">Security signal</th>
                  <th className="w-[18%] px-4 py-3.5">Workflow</th>
                  <th className="w-[19%] px-4 py-3.5">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--line)] align-top">
                {repositories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-[color:var(--muted)]"
                    >
                      Không có repo nào khớp bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : null}

                {repositories.map((repository) => (
                  <tr
                    key={repository.id}
                    className="bg-white/30 transition hover:bg-white/45"
                  >
                    <td className="px-4 py-4">
                      <a
                        href={repository.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-[15px] font-semibold leading-6 transition hover:text-[color:var(--accent)]"
                      >
                        {repository.fullName}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <p className="mt-1.5 max-w-md text-sm leading-6 text-[color:var(--muted)] line-clamp-3">
                        {repository.description ?? "No description"}
                      </p>
                      <div className="mt-2.5 flex max-w-md flex-wrap gap-1.5">
                        {(repository.matchedTopics as string[]).map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-[color:var(--line)] bg-white/70 px-2.5 py-1 text-xs"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="shell-pill inline-flex rounded-full px-3 py-1 text-xs font-medium">
                        {REPOSITORY_TYPE_LABELS[repository.repositoryType]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="max-w-sm space-y-2.5 rounded-[1.4rem] border border-[color:var(--line)] bg-white/55 p-3.5">
                        <div className="inline-flex rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-1 text-xs font-medium">
                          {SECURITY_SIGNAL_LABELS[repository.securitySignalType]}
                        </div>
                        <div className="flex flex-wrap gap-2.5 text-xs leading-5">
                          {repository.securitySignalUrl ? (
                            <a
                              href={repository.securitySignalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[color:var(--accent)]"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Evidence
                            </a>
                          ) : null}
                          {repository.securityContact ? (
                            <span className="inline-flex items-center gap-1 text-[color:var(--muted)]">
                              <Mail className="h-3.5 w-3.5" />
                              {repository.securityContact}
                            </span>
                          ) : null}
                          {repository.bountyProgramUrl ? (
                            <a
                              href={repository.bountyProgramUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[color:var(--accent)]"
                            >
                              <Bug className="h-3.5 w-3.5" />
                              Bounty
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <form
                        action={updateRepositoryAction}
                        className="w-[16rem] max-w-full space-y-2"
                      >
                        <input type="hidden" name="repositoryId" value={repository.id} />
                        <select
                          name="reportStatus"
                          aria-label="Report status"
                          defaultValue={repository.reportStatus}
                          className="field h-10 w-full rounded-2xl px-4 py-2.5"
                        >
                          {REPORT_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {REPORT_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          name="reportNotes"
                          aria-label="Report notes"
                          rows={1}
                          defaultValue={repository.reportNotes ?? ""}
                          className="field h-10 min-h-10 w-full resize-none overflow-hidden rounded-2xl px-4 py-2.5 leading-5"
                          placeholder="Track report status, notes, or blockers"
                        />
                        <SubmitButton
                          pendingLabel="Saving..."
                          className="action-primary h-10 w-full rounded-2xl px-4"
                        >
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                    <td className="px-4 py-4">
                      <div className="rounded-[1.4rem] border border-[color:var(--line)] bg-white/55 p-3 text-xs text-[color:var(--muted)]">
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 leading-5">
                          <span className="font-medium text-[color:var(--foreground)]">Stars</span>
                          <span>{repository.stars}</span>
                          <span className="font-medium text-[color:var(--foreground)]">Issues</span>
                          <span>{repository.openIssues}</span>
                          <span className="font-medium text-[color:var(--foreground)]">Pushed</span>
                          <span>{formatRelativeDate(repository.lastPushedAt)}</span>
                          <span className="font-medium text-[color:var(--foreground)]">Scanned</span>
                          <span>{formatRelativeDate(repository.lastScannedAt)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
