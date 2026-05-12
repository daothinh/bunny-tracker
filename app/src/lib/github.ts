import {
  type Repository,
  RepositoryType,
  SecuritySignalType,
  SyncRunStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BUG_BOUNTY_HOSTS,
  DEFAULT_WEB3_TOPICS,
  SECURITY_FILE_CANDIDATES,
} from "@/lib/constants";
import { getGitHubRuntimeSettings, type GitHubRuntimeSettings } from "@/lib/runtime-settings";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_MIN_STARS = 5;
const ACTIVE_REPOSITORY_LOOKBACK_DAYS = 540;

type GitHubRepositorySearchItem = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  default_branch: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  archived: boolean;
  pushed_at: string | null;
  owner: {
    login: string;
  };
};

type GitHubSearchResponse = {
  items: GitHubRepositorySearchItem[];
};

type MarkdownDocument = {
  path: string;
  body: string;
  htmlUrl: string;
};

type SecurityEvidence = {
  signalType: SecuritySignalType;
  signalUrl?: string;
  excerpt: string;
  securityContact?: string;
  bountyProgramUrl?: string;
  qualificationSummary: string;
};

export type SyncSummary = {
  runId: string;
  status: SyncRunStatus;
  candidateCount: number;
  qualifiedCount: number;
  upsertedCount: number;
  skippedCount: number;
  errorCount: number;
};

function createGitHubHeaders(
  settings: GitHubRuntimeSettings,
  accept = "application/vnd.github+json",
): Headers {
  const headers = new Headers({
    Accept: accept,
    "User-Agent": "Pug-Bunny-Tricker",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  if (settings.githubToken) {
    headers.set("Authorization", `Bearer ${settings.githubToken}`);
  }

  return headers;
}

async function githubJson<T>(
  path: string,
  settings: GitHubRuntimeSettings,
): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: createGitHubHeaders(settings),
    cache: "no-store",
  });

  if (!response.ok) {
    const resetAt = response.headers.get("x-ratelimit-reset");
    throw new Error(
      `GitHub request failed for ${path} (${response.status}). Reset: ${resetAt ?? "n/a"}`,
    );
  }

  return (await response.json()) as T;
}

async function githubText(
  path: string,
  settings: GitHubRuntimeSettings,
): Promise<string | null> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: createGitHubHeaders(settings, "application/vnd.github.raw+json"),
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const resetAt = response.headers.get("x-ratelimit-reset");
    throw new Error(
      `GitHub raw request failed for ${path} (${response.status}). Reset: ${resetAt ?? "n/a"}`,
    );
  }

  return response.text();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normaliseTopic(value: string): string {
  return value.trim().toLowerCase();
}

function formatGitHubSearchDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function hasSearchQualifier(query: string, pattern: RegExp): boolean {
  return pattern.test(query);
}

export function buildRepositorySearchQuery(
  rawQuery: string,
  now = new Date(),
): string {
  const query = collapseWhitespace(rawQuery);
  const qualifiers: string[] = [];

  if (!hasSearchQualifier(query, /\bfork:/i)) {
    qualifiers.push("fork:false");
  }

  if (!hasSearchQualifier(query, /\barchived:/i)) {
    qualifiers.push("archived:false");
  }

  if (!hasSearchQualifier(query, /\bis:(public|private)\b/i)) {
    qualifiers.push("is:public");
  }

  if (!hasSearchQualifier(query, /\bmirror:/i)) {
    qualifiers.push("mirror:false");
  }

  if (!hasSearchQualifier(query, /\bstars:/i)) {
    qualifiers.push(`stars:>=${DEFAULT_MIN_STARS}`);
  }

  if (!hasSearchQualifier(query, /\bpushed:/i)) {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - ACTIVE_REPOSITORY_LOOKBACK_DAYS);
    qualifiers.push(`pushed:>=${formatGitHubSearchDate(cutoff)}`);
  }

  return collapseWhitespace([query, ...qualifiers].join(" "));
}

export function matchWeb3Topics(
  topics: string[],
  allowlist: readonly string[] = DEFAULT_WEB3_TOPICS,
): string[] {
  const allowed = new Set(allowlist.map(normaliseTopic));
  return unique(topics.map(normaliseTopic).filter((topic) => allowed.has(topic)));
}

export function classifyRepositoryType(
  topics: string[],
  primaryLanguage: string | null,
): RepositoryType {
  const joined = new Set(topics.map(normaliseTopic));

  if (
    ["wallet", "account-abstraction", "multisig"].some((value) =>
      joined.has(value),
    )
  ) {
    return RepositoryType.WALLET;
  }

  if (
    ["bridge", "rollup", "layer2", "sequencer", "node", "validator"].some(
      (value) => joined.has(value),
    )
  ) {
    return RepositoryType.INFRASTRUCTURE;
  }

  if (
    ["sdk", "tooling", "hardhat", "foundry", "indexer", "subgraph"].some(
      (value) => joined.has(value),
    )
  ) {
    return RepositoryType.TOOLING;
  }

  if (
    ["defi", "dao", "amm", "dex", "lending", "staking", "yield"].some((value) =>
      joined.has(value),
    )
  ) {
    return RepositoryType.PROTOCOL;
  }

  if (
    ["nft", "gamefi", "gaming", "marketplace", "dapp"].some((value) =>
      joined.has(value),
    )
  ) {
    return RepositoryType.APPLICATION;
  }

  if (
    ["solidity", "smart-contracts", "evm", "ethereum"].some((value) =>
      joined.has(value),
    ) ||
    primaryLanguage === "Solidity"
  ) {
    return RepositoryType.SMART_CONTRACTS;
  }

  return RepositoryType.OTHER;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function makeExcerpt(text: string, pattern?: RegExp | string): string {
  const compact = collapseWhitespace(text);
  if (!compact) {
    return "Security evidence detected but the source excerpt is empty.";
  }

  let index = 0;
  if (typeof pattern === "string") {
    index = compact.toLowerCase().indexOf(pattern.toLowerCase());
  } else if (pattern) {
    const match = compact.match(pattern);
    index = match?.index ?? 0;
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(compact.length, index + 160);
  return compact.slice(start, end);
}

function extractSecurityContact(text: string): string | undefined {
  const customContact = text.match(/@custom:security-contact\s+([^\s]+)/i)?.[1];
  if (customContact) {
    return customContact;
  }

  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractBountyProgramUrl(text: string): string | undefined {
  const urlMatches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return urlMatches.find((url) =>
    BUG_BOUNTY_HOSTS.some((host) => url.toLowerCase().includes(host)),
  );
}

export function extractSecurityEvidence(input: {
  readme?: MarkdownDocument | null;
  securityFile?: MarkdownDocument | null;
  repoHtmlUrl: string;
  description?: string | null;
  homepageUrl?: string | null;
  matchedTopics: string[];
}): SecurityEvidence | null {
  const documents = [input.securityFile, input.readme].filter(Boolean) as MarkdownDocument[];
  const combinedText = collapseWhitespace(
    [
      input.securityFile?.body ?? "",
      input.readme?.body ?? "",
      input.description ?? "",
      input.homepageUrl ?? "",
    ].join("\n"),
  );

  if (!combinedText) {
    return null;
  }

  const bountyProgramUrl = extractBountyProgramUrl(combinedText);
  const securityContact = extractSecurityContact(combinedText);

  if (input.securityFile) {
    return {
      signalType: SecuritySignalType.SECURITY_FILE,
      signalUrl: input.securityFile.htmlUrl,
      excerpt: makeExcerpt(
        input.securityFile.body,
        /bug bounty|responsible disclosure|security|immunefi|hackerone|@custom:security-contact/i,
      ),
      securityContact,
      bountyProgramUrl,
      qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with SECURITY.md evidence.`,
    };
  }

  for (const document of documents) {
    if (bountyProgramUrl) {
      return {
        signalType: SecuritySignalType.BUG_BOUNTY,
        signalUrl: bountyProgramUrl,
        excerpt: makeExcerpt(
          document.body,
          /bug bounty|immunefi|hackerone|cantina|code4rena|bugcrowd|hackenproof/i,
        ),
        securityContact,
        bountyProgramUrl,
        qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with bug bounty language in README.`,
      };
    }

    if (securityContact) {
      return {
        signalType: SecuritySignalType.SECURITY_CONTACT,
        signalUrl: document.htmlUrl,
        excerpt: makeExcerpt(document.body, securityContact),
        securityContact,
        qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with a security contact in README.`,
      };
    }

    const disclosureMatch = document.body.match(
      /responsible disclosure|security policy|report (?:a )?security vulnerability|report vulnerabilities/i,
    );

    if (disclosureMatch) {
      return {
        signalType: SecuritySignalType.RESPONSIBLE_DISCLOSURE,
        signalUrl: document.htmlUrl,
        excerpt: makeExcerpt(document.body, disclosureMatch[0]),
        qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with responsible disclosure language in README.`,
      };
    }
  }

  if (bountyProgramUrl) {
    return {
      signalType: SecuritySignalType.BUG_BOUNTY,
      signalUrl: bountyProgramUrl,
      excerpt: makeExcerpt(combinedText, bountyProgramUrl),
      bountyProgramUrl,
      securityContact,
      qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with bounty signal in repository metadata.`,
    };
  }

  if (securityContact) {
    return {
      signalType: SecuritySignalType.SECURITY_CONTACT,
      signalUrl: input.repoHtmlUrl,
      excerpt: makeExcerpt(combinedText, securityContact),
      securityContact,
      qualificationSummary: `Matched topics ${input.matchedTopics.join(", ")} with security contact in repository metadata.`,
    };
  }

  return null;
}

async function fetchReadme(
  owner: string,
  repo: string,
  settings: GitHubRuntimeSettings,
): Promise<MarkdownDocument | null> {
  const body = await githubText(`/repos/${owner}/${repo}/readme`, settings);
  if (!body) {
    return null;
  }

  return {
    path: "README",
    body,
    htmlUrl: `https://github.com/${owner}/${repo}`,
  };
}

async function fetchSecurityFile(
  owner: string,
  repo: string,
  defaultBranch: string | null,
  settings: GitHubRuntimeSettings,
): Promise<MarkdownDocument | null> {
  for (const candidate of SECURITY_FILE_CANDIDATES) {
    const body = await githubText(
      `/repos/${owner}/${repo}/contents/${candidate}`,
      settings,
    );

    if (body) {
      return {
        path: candidate,
        body,
        htmlUrl: `https://github.com/${owner}/${repo}/blob/${defaultBranch ?? "main"}/${candidate}`,
      };
    }
  }

  return null;
}

async function searchRepositories(
  settings: GitHubRuntimeSettings,
  effectiveQueries: string[],
): Promise<GitHubRepositorySearchItem[]> {
  const deduped = new Map<string, GitHubRepositorySearchItem>();

  for (const searchQuery of effectiveQueries) {
    const data = await githubJson<GitHubSearchResponse>(
      `/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=updated&order=desc&per_page=${settings.searchResultsPerQuery}`,
      settings,
    );

    for (const item of data.items) {
      if (!deduped.has(item.full_name)) {
        deduped.set(item.full_name, item);
      }
    }
  }

  return [...deduped.values()].slice(0, settings.maxReposPerRun);
}

async function qualifyRepository(
  repo: GitHubRepositorySearchItem,
  settings: GitHubRuntimeSettings,
): Promise<Repository | null> {
  const matchedTopics = matchWeb3Topics(repo.topics, settings.githubTopics);
  if (matchedTopics.length === 0) {
    return null;
  }

  const [readme, securityFile] = await Promise.all([
    fetchReadme(repo.owner.login, repo.name, settings),
    fetchSecurityFile(
      repo.owner.login,
      repo.name,
      repo.default_branch,
      settings,
    ),
  ]);

  const evidence = extractSecurityEvidence({
    readme,
    securityFile,
    repoHtmlUrl: repo.html_url,
    description: repo.description,
    homepageUrl: repo.homepage,
    matchedTopics,
  });

  if (!evidence) {
    return null;
  }

  const now = new Date();
  return prisma.repository.upsert({
    where: {
      fullName: repo.full_name,
    },
    update: {
      owner: repo.owner.login,
      name: repo.name,
      htmlUrl: repo.html_url,
      description: repo.description,
      homepageUrl: repo.homepage,
      defaultBranch: repo.default_branch,
      primaryLanguage: repo.language,
      topics: repo.topics,
      matchedTopics,
      repositoryType: classifyRepositoryType(repo.topics, repo.language),
      qualificationSummary: evidence.qualificationSummary,
      securitySignalType: evidence.signalType,
      securitySignalUrl: evidence.signalUrl,
      securitySignalExcerpt: evidence.excerpt,
      securityContact: evidence.securityContact,
      bountyProgramUrl: evidence.bountyProgramUrl,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      archived: repo.archived,
      lastPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
      lastScannedAt: now,
      lastSeenAt: now,
    },
    create: {
      githubRepoId: BigInt(repo.id),
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      description: repo.description,
      homepageUrl: repo.homepage,
      defaultBranch: repo.default_branch,
      primaryLanguage: repo.language,
      topics: repo.topics,
      matchedTopics,
      repositoryType: classifyRepositoryType(repo.topics, repo.language),
      qualificationSummary: evidence.qualificationSummary,
      securitySignalType: evidence.signalType,
      securitySignalUrl: evidence.signalUrl,
      securitySignalExcerpt: evidence.excerpt,
      securityContact: evidence.securityContact,
      bountyProgramUrl: evidence.bountyProgramUrl,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      archived: repo.archived,
      lastPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
      lastScannedAt: now,
      lastSeenAt: now,
    },
  });
}

function buildSyncNotes(input: {
  githubTokenConfigured: boolean;
  candidateCount: number;
  qualifiedCount: number;
  errorCount: number;
}): string | null {
  const notes: string[] = [];

  if (!input.githubTokenConfigured) {
    notes.push(
      "GITHUB_TOKEN is not configured; GitHub Search and contents requests can hit unauthenticated rate limits quickly.",
    );
  }

  if (input.errorCount > 0) {
    notes.push(
      `GitHub API returned ${input.errorCount} error${input.errorCount === 1 ? "" : "s"} during this run. Check SyncError rows for exact failures, and verify that the configured token is valid if one was supplied.`,
    );
  }

  if (input.errorCount === 0 && input.candidateCount === 0) {
    notes.push(
      "No GitHub repositories matched the active search queries. Tighten or broaden the runtime search settings in the dashboard.",
    );
  } else if (
    input.errorCount === 0 &&
    input.candidateCount > 0 &&
    input.qualifiedCount === 0
  ) {
    notes.push(
      "Candidates were found, but none matched the security-signal rules after README/SECURITY inspection. Refine the search queries to target repositories that publish security contacts, SECURITY.md, or bounty language.",
    );
  }

  return notes.length > 0 ? notes.join(" ") : null;
}

export async function runGitHubSync(
  source: "manual" | "schedule",
): Promise<SyncSummary> {
  const settings = await getGitHubRuntimeSettings();
  const effectiveQueries = settings.githubSearchQueries.map((query) =>
    buildRepositorySearchQuery(query),
  );
  const run = await prisma.syncRun.create({
    data: {
      source,
      status: SyncRunStatus.RUNNING,
      queryCount: effectiveQueries.length,
      queries: effectiveQueries,
    },
  });

  let candidateCount = 0;
  let qualifiedCount = 0;
  let upsertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    const candidates = await searchRepositories(settings, effectiveQueries);
    candidateCount = candidates.length;

    for (const candidate of candidates) {
      try {
        const qualifiedRepository = await qualifyRepository(candidate, settings);
        if (!qualifiedRepository) {
          skippedCount += 1;
          continue;
        }

        qualifiedCount += 1;
        upsertedCount += 1;
      } catch (error) {
        errorCount += 1;
        await prisma.syncError.create({
          data: {
            syncRunId: run.id,
            repoFullName: candidate.full_name,
            stage: "qualify",
            message:
              error instanceof Error ? error.message : "Unknown qualification error",
          },
        });
      }
    }
  } catch (error) {
    errorCount += 1;
    await prisma.syncError.create({
      data: {
        syncRunId: run.id,
        stage: "search",
        message: error instanceof Error ? error.message : "Unknown search error",
      },
    });
  }

  const status =
    errorCount === 0
      ? SyncRunStatus.SUCCESS
      : qualifiedCount > 0 || upsertedCount > 0
        ? SyncRunStatus.PARTIAL_FAILURE
        : SyncRunStatus.FAILURE;

  await prisma.syncRun.update({
    where: {
      id: run.id,
    },
    data: {
      status,
      candidateCount,
      qualifiedCount,
      upsertedCount,
      skippedCount,
      errorCount,
      notes: buildSyncNotes({
        githubTokenConfigured: Boolean(settings.githubToken),
        candidateCount,
        qualifiedCount,
        errorCount,
      }),
      finishedAt: new Date(),
    },
  });

  return {
    runId: run.id,
    status,
    candidateCount,
    qualifiedCount,
    upsertedCount,
    skippedCount,
    errorCount,
  };
}
