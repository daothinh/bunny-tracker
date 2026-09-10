"use client";

import { formatDistanceToNow } from "date-fns";
import type { ReportStatus } from "@prisma/client";
import {
  Bug,
  ExternalLink,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_OPTIONS,
  REPOSITORY_SCOPE_LABELS,
  REPOSITORY_TYPE_LABELS,
  SECURITY_SIGNAL_LABELS,
} from "@/lib/constants";
import { dashboardFiltersToSearchParams } from "@/lib/dashboard-filters";
import type {
  DashboardRepositoryFiltersState,
  DashboardRepositoryListItem,
  DashboardRepositoryPage,
} from "@/lib/dashboard-list";

type DashboardRepositoryListProps = {
  filters: DashboardRepositoryFiltersState;
  initialRepositories: DashboardRepositoryListItem[];
  initialNextCursor: string | null;
  pageSize: number;
  totalCount: number;
};

type DashboardRepositoryWorkflowUpdate = Pick<
  DashboardRepositoryListItem,
  "id" | "reportStatus" | "reportNotes"
>;

type WorkflowFilterMatchContext = Pick<
  DashboardRepositoryListItem,
  | "id"
  | "reportStatus"
  | "scope"
  | "repositoryType"
  | "securityContact"
  | "bountyProgramUrl"
  | "stars"
>;

// Mirrors buildRepositoryWhere so client-side removals stay consistent with
// what the server would return for the same filter set. The `q` filter and
// fields that a workflow update cannot change (fullName/description/topics)
// are intentionally ignored.
function repositoryMatchesFilters(
  repository: WorkflowFilterMatchContext,
  filters: DashboardRepositoryFiltersState,
): boolean {
  if (filters.scope && repository.scope !== filters.scope) {
    return false;
  }

  if (filters.reportStatus && repository.reportStatus !== filters.reportStatus) {
    return false;
  }

  if (filters.repositoryType && repository.repositoryType !== filters.repositoryType) {
    return false;
  }

  if (filters.bountyLink === "with" && repository.bountyProgramUrl === null) {
    return false;
  }

  if (filters.bountyLink === "without" && repository.bountyProgramUrl !== null) {
    return false;
  }

  if (filters.emailContact === "with" && repository.securityContact === null) {
    return false;
  }

  if (filters.emailContact === "without" && repository.securityContact !== null) {
    return false;
  }

  if (filters.minStars !== null && repository.stars < filters.minStars) {
    return false;
  }

  return true;
}

function formatRelativeDate(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function ScopeBadge({
  scope,
  className = "",
}: {
  scope: DashboardRepositoryListItem["scope"];
  className?: string;
}) {
  const isWeb3 = scope === "WEB3";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
        isWeb3
          ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
          : "bg-[color:var(--teal)]/15 text-[color:var(--teal)]"
      } ${className}`}
    >
      {REPOSITORY_SCOPE_LABELS[scope]}
    </span>
  );
}

type RepositoryWorkflowFormProps = {
  repository: DashboardRepositoryListItem;
  onRepositoryUpdated: (repository: DashboardRepositoryWorkflowUpdate) => void;
  className: string;
  buttonClassName: string;
  buttonLabel: string;
  buttonPendingLabel: string;
  statusSelectClassName: string;
  textareaClassName: string;
  textareaPlaceholder: string;
  textareaRows: number;
  statusLabel?: string;
  notesLabel?: string;
};

function RepositoryWorkflowForm({
  repository,
  onRepositoryUpdated,
  className,
  buttonClassName,
  buttonLabel,
  buttonPendingLabel,
  statusSelectClassName,
  textareaClassName,
  textareaPlaceholder,
  textareaRows,
  statusLabel,
  notesLabel,
}: RepositoryWorkflowFormProps) {
  const [reportStatus, setReportStatus] = useState<ReportStatus>(
    repository.reportStatus,
  );
  const [reportNotes, setReportNotes] = useState(repository.reportNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty =
    reportStatus !== repository.reportStatus ||
    reportNotes !== (repository.reportNotes ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isDirty || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/dashboard/repositories/${repository.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reportStatus,
            reportNotes,
          }),
        },
      );

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(payload?.error ?? "Failed to save workflow.");
      }

      const updatedRepository =
        (await response.json()) as DashboardRepositoryWorkflowUpdate;

      setReportStatus(updatedRepository.reportStatus);
      setReportNotes(updatedRepository.reportNotes ?? "");
      onRepositoryUpdated(updatedRepository);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Không lưu được workflow.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <input type="hidden" name="repositoryId" value={repository.id} />
      {statusLabel ? (
        <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
          {statusLabel}
          <select
            name="reportStatus"
            aria-label="Report status"
            value={reportStatus}
            onChange={(event) => {
              setReportStatus(event.target.value as ReportStatus);
            }}
            className={statusSelectClassName}
          >
            {REPORT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {REPORT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <select
          name="reportStatus"
          aria-label="Report status"
          value={reportStatus}
          onChange={(event) => {
            setReportStatus(event.target.value as ReportStatus);
          }}
          className={statusSelectClassName}
        >
          {REPORT_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {REPORT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      )}
      {notesLabel ? (
        <label className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
          {notesLabel}
          <textarea
            name="reportNotes"
            aria-label="Report notes"
            rows={textareaRows}
            maxLength={1500}
            value={reportNotes}
            onChange={(event) => {
              setReportNotes(event.target.value);
            }}
            className={textareaClassName}
            placeholder={textareaPlaceholder}
          />
        </label>
      ) : (
        <textarea
          name="reportNotes"
          aria-label="Report notes"
          rows={textareaRows}
          maxLength={1500}
          value={reportNotes}
          onChange={(event) => {
            setReportNotes(event.target.value);
          }}
          className={textareaClassName}
          placeholder={textareaPlaceholder}
        />
      )}
      <button
        type="submit"
        disabled={isSaving || !isDirty}
        className={buttonClassName}
      >
        {isSaving ? buttonPendingLabel : buttonLabel}
      </button>
      {saveError ? (
        <p className="text-sm text-[color:var(--accent)]">{saveError}</p>
      ) : null}
    </form>
  );
}

export function DashboardRepositoryList({
  filters,
  initialRepositories,
  initialNextCursor,
  pageSize,
  totalCount,
}: DashboardRepositoryListProps) {
  const [repositories, setRepositories] = useState(initialRepositories);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  async function loadMorePage() {
    if (!nextCursor || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    const params = dashboardFiltersToSearchParams({
      q: filters.q,
      scope: filters.scope,
      reportStatus: filters.reportStatus,
      repositoryType: filters.repositoryType,
      bountyLink: filters.bountyLink,
      emailContact: filters.emailContact,
      minStars: filters.minStars,
    });
    params.set("cursor", nextCursor);
    params.set("limit", String(pageSize));

    try {
      const response = await fetch(`/api/dashboard/repositories?${params}`, {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load repositories.");
      }

      const page = (await response.json()) as DashboardRepositoryPage;

      startTransition(() => {
        setRepositories((current) => {
          const seen = new Set(current.map((repository) => repository.id));
          const additions = page.repositories.filter(
            (repository) => !seen.has(repository.id),
          );

          return additions.length > 0 ? [...current, ...additions] : current;
        });
        setNextCursor(page.nextCursor);
      });
    } catch {
      setLoadError("Không tải thêm repo được. Thử lại.");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }

  const loadMoreOnIntersect = useEffectEvent(() => {
    void loadMorePage();
  });

  function handleRepositoryUpdated(
    updatedRepository: DashboardRepositoryWorkflowUpdate,
  ) {
    setRepositories((current) => {
      const target = current.find(
        (repository) => repository.id === updatedRepository.id,
      );

      if (!target) {
        return current;
      }

      const shouldRemoveRepository = !repositoryMatchesFilters(
        {
          ...updatedRepository,
          scope: target.scope,
          repositoryType: target.repositoryType,
          securityContact: target.securityContact,
          bountyProgramUrl: target.bountyProgramUrl,
          stars: target.stars,
        },
        filters,
      );

      return shouldRemoveRepository
        ? current.filter((repository) => repository.id !== target.id)
        : current.map((repository) =>
            repository.id === target.id
              ? {
                  ...repository,
                  reportStatus: updatedRepository.reportStatus,
                  reportNotes: updatedRepository.reportNotes,
                }
              : repository,
          );
    });
  }

  useEffect(() => {
    if (!nextCursor || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreOnIntersect();
        }
      },
      {
        rootMargin: "960px 0px",
      },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor]);

  const loadedCount = repositories.length;
  const isEmpty = totalCount === 0;
  const hasMore = nextCursor !== null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 px-1 text-sm text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Hiển thị{" "}
          <strong className="text-[color:var(--foreground)]">{loadedCount}</strong>
          {" / "}
          <strong className="text-[color:var(--foreground)]">
            {totalCount}
          </strong>{" "}
          repo khớp bộ lọc hiện tại.
        </p>
        {hasMore ? (
          <p>Danh sách sẽ tự nạp thêm khi bạn kéo xuống gần cuối bảng.</p>
        ) : null}
      </div>

      <section className="space-y-4 xl:hidden">
        {isEmpty ? (
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
                <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-[color:var(--muted)]">
                  {repository.description ?? "No description"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <ScopeBadge scope={repository.scope} />
                <span className="shell-pill rounded-full px-3 py-1 text-xs font-medium">
                  {REPOSITORY_TYPE_LABELS[repository.repositoryType]}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {repository.matchedTopics.map((topic) => (
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

              <RepositoryWorkflowForm
                repository={repository}
                onRepositoryUpdated={handleRepositoryUpdated}
                className="grid gap-2.5"
                statusSelectClassName="field rounded-2xl px-4 py-3"
                textareaClassName="field rounded-2xl px-4 py-3 leading-6"
                textareaPlaceholder="Keep context for report submission here"
                textareaRows={3}
                statusLabel="Status"
                notesLabel="Notes"
                buttonClassName="action-primary h-10 rounded-2xl disabled:cursor-not-allowed disabled:opacity-60"
                buttonLabel="Save status"
                buttonPendingLabel="Saving..."
              />

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
              {isEmpty ? (
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
                    <p className="mt-1.5 max-w-md line-clamp-3 text-sm leading-6 text-[color:var(--muted)]">
                      {repository.description ?? "No description"}
                    </p>
                    <div className="mt-2.5 flex max-w-md flex-wrap gap-1.5">
                      {repository.matchedTopics.map((topic) => (
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
                    <div className="flex flex-col items-start gap-1.5">
                      <ScopeBadge scope={repository.scope} />
                      <span className="shell-pill inline-flex rounded-full px-3 py-1 text-xs font-medium">
                        {REPOSITORY_TYPE_LABELS[repository.repositoryType]}
                      </span>
                    </div>
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
                    <RepositoryWorkflowForm
                      repository={repository}
                      onRepositoryUpdated={handleRepositoryUpdated}
                      className="w-[16rem] max-w-full space-y-2"
                      statusSelectClassName="field h-10 w-full rounded-2xl px-4 py-2.5"
                      textareaClassName="field h-10 min-h-10 w-full resize-none overflow-hidden rounded-2xl px-4 py-2.5 leading-5"
                      textareaPlaceholder="Track report status, notes, or blockers"
                      textareaRows={1}
                      buttonClassName="action-primary h-10 w-full rounded-2xl px-4 disabled:cursor-not-allowed disabled:opacity-60"
                      buttonLabel="Save"
                      buttonPendingLabel="Saving..."
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="rounded-[1.4rem] border border-[color:var(--line)] bg-white/55 p-3 text-xs text-[color:var(--muted)]">
                      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 leading-5">
                        <span className="font-medium text-[color:var(--foreground)]">
                          Stars
                        </span>
                        <span>{repository.stars}</span>
                        <span className="font-medium text-[color:var(--foreground)]">
                          Issues
                        </span>
                        <span>{repository.openIssues}</span>
                        <span className="font-medium text-[color:var(--foreground)]">
                          Pushed
                        </span>
                        <span>{formatRelativeDate(repository.lastPushedAt)}</span>
                        <span className="font-medium text-[color:var(--foreground)]">
                          Scanned
                        </span>
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

      {hasMore ? (
        <div className="flex flex-col items-center gap-3 pb-2">
          <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              void loadMorePage();
            }}
            disabled={isLoadingMore}
            className="action-secondary inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              `Load ${pageSize} more`
            )}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className="text-center text-sm text-[color:var(--accent)]">{loadError}</p>
      ) : null}
    </section>
  );
}
