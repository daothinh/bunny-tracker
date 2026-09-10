import {
  type Repository,
  RepositoryScope,
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
import {
  getGitHubRuntimeSettings,
  type GitHubRuntimeSettings,
  type SearchQueryPageMap,
  type SearchQueryPageState,
  updateGitHubSearchQueryPages,
} from "@/lib/runtime-settings";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_MIN_STARS = 5;
const ACTIVE_REPOSITORY_LOOKBACK_DAYS = 540;
const STALE_SYNC_RUN_THRESHOLD_MINUTES = 15;
// GitHub Search API primary limit ~30 req/phút. Mỗi run chỉ bắn tối đa ngần này
// query để không chạm trần (mỗi query = 1 search request); phần dư do rotation phủ.
const MAX_SEARCH_QUERIES_PER_RUN = 30;
// Topic mơ hồ — cũng được dùng ngoài web3 (ngôn ngữ lập trình, thuật ngữ
// chung) — bắt buộc phải có ngữ cảnh web3 rõ ràng (README/description/SECURITY
// khớp WEB3_CONTEXT_PATTERN) mới được gắn scope WEB3.
const CONTEXT_REQUIRED_WEB3_TOPICS = new Set([
  "crypto",
  "rust",
  "cairo",
  "ink",
  "decentralized",
  "wallet",
  "bridge",
  "rollup",
  "layer2",
  "foundry",
  "hardhat",
  "account-abstraction",
  "multisig",
  "amm",
  "dex",
  "oracle",
  "indexer",
  "governance",
  "voting",
  "metaverse",
  "lending",
  "staking",
]);
const WEB3_CONTEXT_PATTERN =
  /\b(web3|blockchain|crypto(?:currency)?|bitcoin|decred|ethereum|evm|solidity|vyper|smart(?: |-)?contracts?|defi|dapps?|solana|polkadot|substrate|starknet|near(?: |-)?protocol|cardano|tron|binance|chainlink|cosmos|move|layer(?: |-)?2|rollup|bridge|validator|staking|restaking|on-?chain|cross-?chain|token(?:s|ized)?|nft|dao)\b/i;

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

type QuerySearchState = {
  rawQuery: string;
  effectiveQuery: string;
  searchPage: number;
  itemOffset: number;
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

type SearchRepositoriesResult = {
  candidates: GitHubRepositorySearchItem[];
  nextSearchQueryPages: SearchQueryPageMap;
  nextRotationOffset: number;
  errors: Array<{
    rawQuery: string;
    searchPage: number;
    message: string;
  }>;
};

type CandidateSelectionResult<T extends { full_name: string }> = {
  candidates: T[];
  nextQueryPages: SearchQueryPageState[];
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

function splitTopicTokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
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
  const matchedTopics: string[] = [];

  for (const topic of topics) {
    const normalisedTopic = normaliseTopic(topic);
    if (!normalisedTopic) {
      continue;
    }

    if (allowed.has(normalisedTopic)) {
      matchedTopics.push(normalisedTopic);
      continue;
    }

    const compactTopic = normalisedTopic.replace(/[^a-z0-9]+/g, "");
    if (compactTopic && allowed.has(compactTopic)) {
      matchedTopics.push(compactTopic);
    }

    for (const token of splitTopicTokens(normalisedTopic)) {
      if (allowed.has(token)) {
        matchedTopics.push(token);
      }
    }
  }

  return unique(matchedTopics);
}

export function hasStrongWeb3Context(input: {
  topics?: string[];
  matchedTopics: string[];
  readme?: MarkdownDocument | null;
  securityFile?: MarkdownDocument | null;
  supplementalDocuments?: readonly MarkdownDocument[];
  description?: string | null;
  homepageUrl?: string | null;
}): boolean {
  const matchedTopics = unique(input.matchedTopics.map(normaliseTopic));
  if (matchedTopics.length === 0) {
    return false;
  }

  if (
    matchedTopics.some((topic) => !CONTEXT_REQUIRED_WEB3_TOPICS.has(topic))
  ) {
    return true;
  }

  const combinedText = collapseWhitespace(
    [
      (input.topics ?? []).join(" "),
      input.description ?? "",
      input.homepageUrl ?? "",
      input.readme?.body ?? "",
      input.securityFile?.body ?? "",
      ...(input.supplementalDocuments?.map((document) => document.body) ?? []),
    ].join("\n"),
  );

  return WEB3_CONTEXT_PATTERN.test(combinedText);
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
    ["bridge", "rollup", "layer2", "sequencer", "node", "validator", "consensus", "chain", "network"].some(
      (value) => joined.has(value),
    )
  ) {
    return RepositoryType.INFRASTRUCTURE;
  }

  if (
    ["sdk", "tooling", "hardhat", "foundry", "indexer", "subgraph", "library", "framework"].some(
      (value) => joined.has(value),
    )
  ) {
    return RepositoryType.TOOLING;
  }

  if (
    ["defi", "dao", "amm", "dex", "lending", "staking", "yield", "protocol", "uniswap", "aave", "compound", "curve"].some((value) =>
      joined.has(value),
    )
  ) {
    return RepositoryType.PROTOCOL;
  }

  if (
    ["nft", "gamefi", "gaming", "marketplace", "dapp", "exchange", "trading"].some((value) =>
      joined.has(value),
    )
  ) {
    return RepositoryType.APPLICATION;
  }

  if (
    ["solidity", "smart-contracts", "evm", "ethereum", "vyper"].some((value) =>
      joined.has(value),
    ) ||
    primaryLanguage === "Solidity" ||
    primaryLanguage === "Vyper"
  ) {
    return RepositoryType.SMART_CONTRACTS;
  }

  return RepositoryType.OTHER;
}

export function detectRepositoryScope(input: {
  topics?: string[];
  matchedTopics: string[];
  readme?: MarkdownDocument | null;
  securityFile?: MarkdownDocument | null;
  description?: string | null;
  homepageUrl?: string | null;
}): RepositoryScope {
  if (input.matchedTopics.length === 0) {
    return RepositoryScope.GENERAL;
  }

  return hasStrongWeb3Context(input)
    ? RepositoryScope.WEB3
    : RepositoryScope.GENERAL;
}

function buildQualificationContext(
  scope: RepositoryScope,
  matchedTopics: string[],
): string {
  if (scope === RepositoryScope.WEB3 && matchedTopics.length > 0) {
    return `web3 topics ${matchedTopics.join(", ")}`;
  }

  return "general (non-web3) repository";
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

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];

  // Filter out personal/example emails - these are typically personal projects without real bounties
  if (email && isPersonalOrExampleEmail(email)) {
    return undefined;
  }

  return email;
}

function isPersonalOrExampleEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  return (
    lowerEmail.includes('@example.') ||
    lowerEmail.includes('@gmail.') ||
    lowerEmail.includes('@gmail.com') ||
    lowerEmail.includes('@hotmail.') ||
    lowerEmail.includes('@yahoo.') ||
    lowerEmail.includes('@outlook.') ||
    lowerEmail.includes('@protonmail.') ||
    lowerEmail.endsWith('@qq.com') ||
    lowerEmail.endsWith('@163.com')
  );
}

function extractBountyProgramUrl(text: string): string | undefined {
  const urlMatches =
    text.match(/https?:\/\/[^\s)]+/gi)?.map((url) => url.replace(/[.,;:]+$/g, "")) ??
    [];
  return (
    urlMatches.find((url) =>
      BUG_BOUNTY_HOSTS.some((host) => url.toLowerCase().includes(host)),
    ) ??
    urlMatches.find((url) => /\bbounty\b/i.test(url))
  );
}

export function extractSecurityEvidence(input: {
  readme?: MarkdownDocument | null;
  securityFile?: MarkdownDocument | null;
  supplementalDocuments?: readonly MarkdownDocument[];
  repoHtmlUrl: string;
  description?: string | null;
  homepageUrl?: string | null;
  matchedTopics: string[];
  scope?: RepositoryScope;
}): SecurityEvidence | null {
  const qualificationContext = buildQualificationContext(
    input.scope ?? RepositoryScope.WEB3,
    input.matchedTopics,
  );
  const documents = [
    input.securityFile,
    input.readme,
    ...(input.supplementalDocuments ?? []),
  ].filter(Boolean) as MarkdownDocument[];
  const combinedText = collapseWhitespace(
    [
      input.securityFile?.body ?? "",
      input.readme?.body ?? "",
      ...(input.supplementalDocuments?.map((document) => document.body) ?? []),
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
      qualificationSummary: `${qualificationContext} with repository security policy evidence.`,
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
        qualificationSummary: `${qualificationContext} with bug bounty guidance in repository or project docs.`,
      };
    }

    if (securityContact) {
      return {
        signalType: SecuritySignalType.SECURITY_CONTACT,
        signalUrl: document.htmlUrl,
        excerpt: makeExcerpt(document.body, securityContact),
        securityContact,
        qualificationSummary: `${qualificationContext} with a security contact in repository or project docs.`,
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
        qualificationSummary: `${qualificationContext} with responsible disclosure guidance in repository or project docs.`,
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
      qualificationSummary: `${qualificationContext} with bounty signal in repository metadata.`,
    };
  }

  if (securityContact) {
    return {
      signalType: SecuritySignalType.SECURITY_CONTACT,
      signalUrl: input.repoHtmlUrl,
      excerpt: makeExcerpt(combinedText, securityContact),
      securityContact,
      qualificationSummary: `${qualificationContext} with security contact in repository metadata.`,
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

function getSearchResultsPerPage(settings: GitHubRuntimeSettings): number {
  return Math.max(1, Math.min(settings.searchResultsPerQuery, 100));
}

async function fetchRepositorySearchPage(
  searchQuery: string,
  page: number,
  settings: GitHubRuntimeSettings,
): Promise<GitHubRepositorySearchItem[]> {
  const data = await githubJson<GitHubSearchResponse>(
    `/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=updated&order=desc&per_page=${getSearchResultsPerPage(settings)}&page=${page}`,
    settings,
  );

  return data.items;
}

function parseRepositoryFullName(fullName: string): {
  owner: string;
  repo: string;
} {
  const match = collapseWhitespace(fullName).match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) {
    throw new Error(
      "Repository name must use the owner/repo format, for example spesmilo/electrum.",
    );
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function shouldResetSearchCursor(error: unknown): boolean {
  return error instanceof Error && /\(422\)/.test(error.message);
}

export function selectRepositoryCandidates<T extends { full_name: string }>(
  resultsByQuery: readonly (readonly T[])[],
  maxReposPerRun: number,
): T[] {
  const deduped = new Map<string, T>();
  const longestResultSet = resultsByQuery.reduce(
    (longest, results) => Math.max(longest, results.length),
    0,
  );

  for (
    let resultIndex = 0;
    resultIndex < longestResultSet && deduped.size < maxReposPerRun;
    resultIndex += 1
  ) {
    for (const results of resultsByQuery) {
      const candidate = results[resultIndex];
      if (!candidate || deduped.has(candidate.full_name)) {
        continue;
      }

      deduped.set(candidate.full_name, candidate);
      if (deduped.size >= maxReposPerRun) {
        break;
      }
    }
  }

  return [...deduped.values()];
}

function advanceSearchCursor(
  cursor: SearchQueryPageState,
  itemCount: number,
  perPage: number,
): SearchQueryPageState {
  if (itemCount === 0 || itemCount < perPage) {
    return {
      page: 1,
      itemOffset: 0,
    };
  }

  return {
    page: cursor.page + 1,
    itemOffset: 0,
  };
}

export function consumeRepositoryCandidates<T extends { full_name: string }>(
  resultsByQuery: readonly (readonly T[])[],
  queryPages: readonly SearchQueryPageState[],
  maxReposPerRun: number,
  perPage: number,
): CandidateSelectionResult<T> {
  const deduped = new Map<string, T>();
  const nextQueryPages = queryPages.map((queryPage, index) => ({
    page: queryPage.page,
    itemOffset: Math.max(
      0,
      Math.min(queryPage.itemOffset, resultsByQuery[index]?.length ?? 0),
    ),
  }));

  while (deduped.size < maxReposPerRun) {
    let consumedAny = false;

    for (const [index, results] of resultsByQuery.entries()) {
      const nextQueryPage = nextQueryPages[index];
      if (!nextQueryPage || nextQueryPage.itemOffset >= results.length) {
        continue;
      }

      const candidate = results[nextQueryPage.itemOffset];
      nextQueryPage.itemOffset += 1;
      consumedAny = true;

      if (candidate && !deduped.has(candidate.full_name)) {
        deduped.set(candidate.full_name, candidate);
        if (deduped.size >= maxReposPerRun) {
          break;
        }
      }
    }

    if (!consumedAny) {
      break;
    }
  }

  return {
    candidates: [...deduped.values()],
    nextQueryPages: nextQueryPages.map((nextQueryPage, index) =>
      nextQueryPage.itemOffset >= resultsByQuery[index].length
        ? advanceSearchCursor(nextQueryPage, resultsByQuery[index].length, perPage)
        : nextQueryPage,
    ),
  };
}

export function rotateQueryOrder<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const shift = ((Math.trunc(offset) % items.length) + items.length) %
    items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

async function searchRepositories(
  settings: GitHubRuntimeSettings,
  queryStatesInput: Array<{
    rawQuery: string;
    effectiveQuery: string;
  }>,
): Promise<SearchRepositoriesResult> {
  const perPage = getSearchResultsPerPage(settings);
  // Round-robin luôn bắt đầu từ đầu danh sách, nên với maxReposPerRun < số
  // query, các query cuối (general) bị starvation. Xoay thứ tự theo offset đã
  // lưu để mỗi run bắt đầu từ một query khác nhau, đảm bảo phủ hết theo thời gian.
  const queryStates: QuerySearchState[] = rotateQueryOrder(
    queryStatesInput,
    settings.searchRotationOffset,
  )
    // Chỉ bắn tối đa MAX_SEARCH_QUERIES_PER_RUN query/run để không chạm trần
    // search 30/phút. Rotation đã xoay thứ tự nên phần bị cắt sẽ tới lượt ở run
    // kế; cursor của các query không bắn được giữ nguyên bên dưới.
    .slice(0, MAX_SEARCH_QUERIES_PER_RUN)
    .map((query) => ({
      rawQuery: query.rawQuery,
      effectiveQuery: query.effectiveQuery,
      searchPage: settings.githubSearchQueryPages[query.rawQuery]?.page ?? 1,
      itemOffset: settings.githubSearchQueryPages[query.rawQuery]?.itemOffset ?? 0,
    }));
  const batchResults: GitHubRepositorySearchItem[][] = [];
  const queryErrors = new Map<
    string,
    {
      searchPage: number;
      message: string;
      resetCursor: boolean;
    }
  >();

  for (const state of queryStates) {
    try {
      batchResults.push(
        await fetchRepositorySearchPage(
          state.effectiveQuery,
          state.searchPage,
          settings,
        ),
      );
    } catch (error) {
      batchResults.push([]);
      queryErrors.set(state.rawQuery, {
        searchPage: state.searchPage,
        message: error instanceof Error ? error.message : "Unknown search error",
        resetCursor: shouldResetSearchCursor(error),
      });
    }
  }
  const selection = consumeRepositoryCandidates(
    batchResults,
    queryStates.map((state) => ({
      page: state.searchPage,
      itemOffset: state.itemOffset,
    })),
    settings.maxReposPerRun,
    perPage,
  );
  // Bắt đầu từ cursor hiện có của TẤT CẢ query, rồi chỉ ghi đè những query đã
  // bắn trong run này — query bị cắt do cap vẫn giữ nguyên tiến độ trang.
  const nextSearchQueryPages: SearchQueryPageMap = {
    ...settings.githubSearchQueryPages,
  };
  for (const [index, state] of queryStates.entries()) {
    const queryError = queryErrors.get(state.rawQuery);
    if (!queryError) {
      nextSearchQueryPages[state.rawQuery] = selection.nextQueryPages[index];
      continue;
    }

    nextSearchQueryPages[state.rawQuery] = queryError.resetCursor
      ? {
          page: 1,
          itemOffset: 0,
        }
      : {
          page: state.searchPage,
          itemOffset: state.itemOffset,
        };
  }

  const nextRotationOffset =
    queryStatesInput.length > 0
      ? (Math.trunc(settings.searchRotationOffset) + 1) % queryStatesInput.length
      : 0;

  return {
    candidates: selection.candidates,
    nextSearchQueryPages,
    nextRotationOffset,
    errors: queryStates.flatMap((state) => {
      const queryError = queryErrors.get(state.rawQuery);
      return queryError
        ? [
            {
              rawQuery: state.rawQuery,
              searchPage: queryError.searchPage,
              message: queryError.message,
            },
          ]
        : [];
    }),
  };
}

async function pruneRepositoryIfTracked(fullName: string): Promise<void> {
  await prisma.repository.deleteMany({
    where: {
      fullName,
    },
  });
}

async function qualifyRepository(
  repo: GitHubRepositorySearchItem,
  settings: GitHubRuntimeSettings,
): Promise<Repository | null> {
  const matchedTopics = matchWeb3Topics(repo.topics, settings.githubTopics);

  const [readme, securityFile] = await Promise.all([
    fetchReadme(repo.owner.login, repo.name, settings),
    fetchSecurityFile(
      repo.owner.login,
      repo.name,
      repo.default_branch,
      settings,
    ),
  ]);

  // Ngưỡng chặt: cả web3 lẫn general đều bắt buộc có file SECURITY thực sự.
  if (!securityFile) {
    return null;
  }

  const scope = detectRepositoryScope({
    topics: repo.topics,
    matchedTopics,
    readme,
    securityFile,
    description: repo.description,
    homepageUrl: repo.homepage,
  });

  const evidence = extractSecurityEvidence({
    readme,
    securityFile,
    repoHtmlUrl: repo.html_url,
    description: repo.description,
    homepageUrl: repo.homepage,
    matchedTopics,
    scope,
  });

  if (!evidence) {
    return null;
  }

  const now = new Date();
  // Định danh bất biến của GitHub là githubRepoId; fullName đổi khi repo được
  // rename/transfer. Nếu vẫn còn dòng cũ giữ fullName này nhưng thuộc repo
  // khác (id khác), xoá trước để không vi phạm unique constraint trên fullName.
  await prisma.repository.deleteMany({
    where: {
      fullName: repo.full_name,
      githubRepoId: {
        not: BigInt(repo.id),
      },
    },
  });

  return prisma.repository.upsert({
    where: {
      githubRepoId: BigInt(repo.id),
    },
    update: {
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
      scope,
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
      scope,
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

async function settleStaleSyncRuns(): Promise<void> {
  const cutoff = new Date(
    Date.now() - STALE_SYNC_RUN_THRESHOLD_MINUTES * 60 * 1000,
  );

  await prisma.syncRun.updateMany({
    where: {
      status: SyncRunStatus.RUNNING,
      finishedAt: null,
      startedAt: {
        lt: cutoff,
      },
    },
    data: {
      status: SyncRunStatus.FAILURE,
      errorCount: 1,
      notes:
        "Marked as stale after a previous sync did not finish cleanly. A newer sync can proceed safely.",
      finishedAt: new Date(),
    },
  });
}

async function findActiveSyncRun() {
  return prisma.syncRun.findFirst({
    where: {
      status: SyncRunStatus.RUNNING,
      finishedAt: null,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function syncGitHubRepository(
  fullName: string,
): Promise<Repository | null> {
  const { owner, repo } = parseRepositoryFullName(fullName);
  const settings = await getGitHubRuntimeSettings();
  const repository = await githubJson<GitHubRepositorySearchItem>(
    `/repos/${owner}/${repo}`,
    settings,
  );
  const qualifiedRepository = await qualifyRepository(repository, settings);

  if (!qualifiedRepository) {
    await pruneRepositoryIfTracked(repository.full_name);
  }

  return qualifiedRepository;
}

export async function runGitHubSync(
  source: "manual" | "schedule",
): Promise<SyncSummary> {
  await settleStaleSyncRuns();
  const activeRun = await findActiveSyncRun();
  if (activeRun) {
    return {
      runId: activeRun.id,
      status: activeRun.status,
      candidateCount: activeRun.candidateCount,
      qualifiedCount: activeRun.qualifiedCount,
      upsertedCount: activeRun.upsertedCount,
      skippedCount: activeRun.skippedCount,
      errorCount: activeRun.errorCount,
    };
  }

  const settings = await getGitHubRuntimeSettings();
  const queryStates = settings.githubSearchQueries.map((rawQuery) => ({
    rawQuery,
    effectiveQuery: buildRepositorySearchQuery(rawQuery),
  }));
  const run = await prisma.syncRun.create({
    data: {
      source,
      status: SyncRunStatus.RUNNING,
      queryCount: queryStates.length,
      queries: queryStates.map((query) => query.effectiveQuery),
    },
  });

  let candidateCount = 0;
  let qualifiedCount = 0;
  let upsertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    const {
      candidates,
      nextSearchQueryPages,
      nextRotationOffset,
      errors: searchErrors,
    } = await searchRepositories(settings, queryStates);
    candidateCount = candidates.length;
    await updateGitHubSearchQueryPages({
      githubSearchQueries: settings.githubSearchQueries,
      githubSearchQueryPages: nextSearchQueryPages,
      searchResultsPerQuery: settings.searchResultsPerQuery,
      searchRotationOffset: nextRotationOffset,
    });
    for (const searchError of searchErrors) {
      errorCount += 1;
      await prisma.syncError.create({
        data: {
          syncRunId: run.id,
          stage: "search",
          message: `${searchError.message} [query: ${searchError.rawQuery}; page: ${searchError.searchPage}]`,
        },
      });
    }

    for (const candidate of candidates) {
      try {
        const qualifiedRepository = await qualifyRepository(candidate, settings);
        if (!qualifiedRepository) {
          skippedCount += 1;
          await pruneRepositoryIfTracked(candidate.full_name);
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
