import { Prisma } from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { DEFAULT_SEARCH_QUERIES, DEFAULT_WEB3_TOPICS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const APP_SETTINGS_ID = "default";
const MAX_GITHUB_SEARCH_RESULT_WINDOW = 1_000;
const LEGACY_DEFAULT_SEARCH_QUERIES = [
  "topic:web3",
  "topic:solidity",
  "topic:defi",
  "topic:smart-contracts",
  "topic:wallet",
  "topic:bridge",
] as const;
const PREVIOUS_DEFAULT_SEARCH_QUERIES = [
  "topic:smart-contracts language:Solidity",
  "topic:defi language:Solidity",
  "topic:wallet",
  "topic:bridge",
  "topic:rollup",
  "topic:foundry language:Solidity",
] as const;
const LAST_DEFAULT_SEARCH_QUERIES = [
  "topic:smart-contracts language:Solidity",
  "topic:defi language:Solidity",
  "topic:wallet topic:ethereum",
  "topic:wallet topic:blockchain",
  "topic:bridge topic:ethereum",
  "topic:bridge topic:blockchain",
  "topic:rollup topic:ethereum",
  "topic:layer2 topic:ethereum",
  "topic:foundry language:Solidity",
] as const;
// Danh sách web3-only trước khi mở rộng sang scope GENERAL. Install cũ dùng
// đúng bộ này sẽ được tự nâng lên DEFAULT_SEARCH_QUERIES (web3 + general).
const WEB3_ONLY_DEFAULT_SEARCH_QUERIES = [
  "topic:blockchain topic:cryptocurrency",
  "topic:blockchain",
  "topic:cryptocurrency",
  "topic:bitcoin",
  "topic:ethereum",
  "topic:solana",
  "topic:cosmos",
  "topic:smart-contracts language:Solidity",
  "topic:defi language:Solidity",
  "topic:wallet",
  "topic:bridge",
  "topic:rollup",
  "topic:layer2",
  "topic:foundry language:Solidity",
  "topic:account-abstraction",
  "topic:multisig",
  "topic:dex",
  "topic:lending",
  "topic:staking",
  "topic:amm",
  "topic:nft",
] as const;
const LEGACY_DEFAULT_TOPICS = [
  "web3",
  "ethereum",
  "evm",
  "solidity",
  "defi",
  "smart-contracts",
  "blockchain",
  "wallet",
  "bridge",
  "layer2",
  "rollup",
  "foundry",
  "hardhat",
  "zk",
  "dao",
  "nft",
] as const;

export type SearchQueryPageState = {
  page: number;
  itemOffset: number;
};

export type SearchQueryPageMap = Record<string, SearchQueryPageState>;

export type GitHubRuntimeSettings = {
  githubToken?: string;
  githubTopics: string[];
  githubSearchQueries: string[];
  maxReposPerRun: number;
  searchResultsPerQuery: number;
  githubSearchQueryPages: SearchQueryPageMap;
  searchRotationOffset: number;
};

export type DashboardGitHubSettings = Omit<
  GitHubRuntimeSettings,
  "githubSearchQueryPages" | "searchRotationOffset"
> & {
  githubTokenConfigured: boolean;
  githubTokenMask: string | null;
};

function deriveSettingsKey(): Buffer {
  return createHash("sha256")
    .update(`pbt-settings:${getEnv().sessionSecret}`)
    .digest();
}

function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveSettingsKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string): string {
  const [ivRaw, authTagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Stored GitHub token payload is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveSettingsKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function buildDefaultGitHubSettings(): GitHubRuntimeSettings {
  const env = getEnv();
  const githubTopics = isLegacyDefaultTopics(env.githubTopics)
    ? [...DEFAULT_WEB3_TOPICS]
    : [...env.githubTopics];
  const githubSearchQueries = isLegacyDefaultSearchQueries(env.githubSearchQueries)
    ? [...DEFAULT_SEARCH_QUERIES]
    : [...env.githubSearchQueries];

  return {
    githubToken: env.githubToken,
    githubTopics,
    githubSearchQueries,
    maxReposPerRun: env.maxReposPerRun,
    searchResultsPerQuery: env.searchResultsPerQuery,
    githubSearchQueryPages: normaliseSearchQueryPages(
      null,
      githubSearchQueries,
      env.searchResultsPerQuery,
    ),
    searchRotationOffset: 0,
  };
}

function areQueriesEquivalent(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isLegacyDefaultSearchQueries(queries: readonly string[]): boolean {
  return (
    areQueriesEquivalent(queries, LEGACY_DEFAULT_SEARCH_QUERIES) ||
    areQueriesEquivalent(queries, PREVIOUS_DEFAULT_SEARCH_QUERIES) ||
    areQueriesEquivalent(queries, LAST_DEFAULT_SEARCH_QUERIES) ||
    areQueriesEquivalent(queries, WEB3_ONLY_DEFAULT_SEARCH_QUERIES)
  );
}

function isLegacyDefaultTopics(topics: readonly string[]): boolean {
  return areQueriesEquivalent(topics, LEGACY_DEFAULT_TOPICS);
}

function maskToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return "configured";
  }

  return `••••${value.slice(-4)}`;
}

function shouldResetSearchQueryPages(input: {
  existingQueries: readonly string[];
  nextQueries: readonly string[];
  existingSearchResultsPerQuery: number;
  nextSearchResultsPerQuery: number;
}): boolean {
  return (
    input.existingSearchResultsPerQuery !== input.nextSearchResultsPerQuery ||
    !areQueriesEquivalent(input.existingQueries, input.nextQueries)
  );
}

export function normaliseSearchQueryPages(
  value: unknown,
  queries: readonly string[],
  searchResultsPerQuery = 8,
): SearchQueryPageMap {
  const rawPages =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const perPage = Math.max(1, Math.min(searchResultsPerQuery, 100));
  const maxPage = Math.max(
    1,
    Math.ceil(MAX_GITHUB_SEARCH_RESULT_WINDOW / perPage),
  );

  return Object.fromEntries(
    queries.map((query) => {
      const rawPage = rawPages[query];
      let page = 1;
      let itemOffset = 0;

      if (
        typeof rawPage === "number" &&
        Number.isInteger(rawPage) &&
        rawPage > 0
      ) {
        page = Math.min(rawPage, maxPage);
      } else if (
        rawPage &&
        typeof rawPage === "object" &&
        !Array.isArray(rawPage)
      ) {
        const rawState = rawPage as Record<string, unknown>;
        if (
          typeof rawState.page === "number" &&
          Number.isInteger(rawState.page) &&
          rawState.page > 0
        ) {
          page = Math.min(rawState.page, maxPage);
        }

        if (
          typeof rawState.itemOffset === "number" &&
          Number.isInteger(rawState.itemOffset) &&
          rawState.itemOffset >= 0
        ) {
          itemOffset = rawState.itemOffset;
        }
      }

      return [query, { page, itemOffset }];
    }),
  );
}

async function ensureAppSettingsRecord() {
  const existing = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
  });

  if (existing) {
    const githubTopics = isLegacyDefaultTopics(existing.githubTopics)
      ? [...DEFAULT_WEB3_TOPICS]
      : existing.githubTopics;
    const githubSearchQueries = isLegacyDefaultSearchQueries(
      existing.githubSearchQueries,
    )
      ? [...DEFAULT_SEARCH_QUERIES]
      : existing.githubSearchQueries;
    const normalisedCurrentPages = normaliseSearchQueryPages(
      existing.searchQueryPages,
      existing.githubSearchQueries,
      existing.searchResultsPerQuery,
    );
    const nextSearchQueryPages = normaliseSearchQueryPages(
      existing.searchQueryPages,
      githubSearchQueries,
      existing.searchResultsPerQuery,
    );

    if (
      !areQueriesEquivalent(existing.githubTopics, githubTopics) ||
      !areQueriesEquivalent(existing.githubSearchQueries, githubSearchQueries) ||
      JSON.stringify(normalisedCurrentPages) !==
        JSON.stringify(nextSearchQueryPages)
    ) {
      return prisma.appSettings.update({
        where: { id: APP_SETTINGS_ID },
        data: {
          githubTopics,
          githubSearchQueries,
          searchQueryPages: nextSearchQueryPages,
        },
      });
    }

    return existing;
  }

  const defaults = buildDefaultGitHubSettings();

  try {
    return await prisma.appSettings.create({
      data: {
        id: APP_SETTINGS_ID,
        githubTokenEncrypted: defaults.githubToken
          ? encryptSecret(defaults.githubToken)
          : null,
        githubTopics: defaults.githubTopics,
        githubSearchQueries: defaults.githubSearchQueries,
        maxReposPerRun: defaults.maxReposPerRun,
        searchResultsPerQuery: defaults.searchResultsPerQuery,
        searchQueryPages: defaults.githubSearchQueryPages,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.appSettings.findUniqueOrThrow({
        where: { id: APP_SETTINGS_ID },
      });
    }

    throw error;
  }
}

function mapSettingsRecord(
  record: Awaited<ReturnType<typeof ensureAppSettingsRecord>>,
): GitHubRuntimeSettings {
  const defaults = buildDefaultGitHubSettings();
  let githubToken: string | undefined;
  if (record.githubTokenEncrypted) {
    try {
      githubToken = decryptSecret(record.githubTokenEncrypted);
    } catch {
      githubToken = undefined;
    }
  }

  return {
    githubToken,
    githubTopics:
      record.githubTopics.length > 0
        ? record.githubTopics
        : defaults.githubTopics,
    githubSearchQueries:
      record.githubSearchQueries.length > 0
        ? record.githubSearchQueries
        : defaults.githubSearchQueries,
    maxReposPerRun: record.maxReposPerRun,
    searchResultsPerQuery: record.searchResultsPerQuery,
    githubSearchQueryPages: normaliseSearchQueryPages(
      record.searchQueryPages,
      record.githubSearchQueries.length > 0
        ? record.githubSearchQueries
        : defaults.githubSearchQueries,
      record.searchResultsPerQuery,
    ),
    searchRotationOffset: normaliseRotationOffset(record.searchRotationOffset),
  };
}

export function normaliseRotationOffset(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return 0;
}

export function parseTopicInput(value: string): string[] {
  const unique = new Set<string>();

  for (const topic of value.split(",")) {
    const normalised = topic.trim().toLowerCase();
    if (normalised) {
      unique.add(normalised);
    }
  }

  return [...unique];
}

export function parseSearchQueryInput(value: string): string[] {
  const unique = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const query = line.trim();
    if (query) {
      unique.add(query);
    }
  }

  return [...unique];
}

export function formatTopicInput(topics: readonly string[]): string {
  return topics.join(", ");
}

export function formatSearchQueryInput(queries: readonly string[]): string {
  return queries.join("\n");
}

export async function getGitHubRuntimeSettings(): Promise<GitHubRuntimeSettings> {
  return mapSettingsRecord(await ensureAppSettingsRecord());
}

export async function getDashboardGitHubSettings(): Promise<DashboardGitHubSettings> {
  const settings = await getGitHubRuntimeSettings();
  const dashboardSettings = {
    githubToken: settings.githubToken,
    githubTopics: settings.githubTopics,
    githubSearchQueries: settings.githubSearchQueries,
    maxReposPerRun: settings.maxReposPerRun,
    searchResultsPerQuery: settings.searchResultsPerQuery,
  };

  return {
    ...dashboardSettings,
    githubTokenConfigured: Boolean(settings.githubToken),
    githubTokenMask: maskToken(settings.githubToken),
  };
}

export async function updateGitHubRuntimeSettings(input: {
  githubToken?: string;
  clearGithubToken: boolean;
  githubTopics: string[];
  githubSearchQueries: string[];
  maxReposPerRun: number;
  searchResultsPerQuery: number;
}): Promise<void> {
  const existing = await ensureAppSettingsRecord();
  const githubSearchQueries = [...input.githubSearchQueries];
  const resetSearchQueryPages = shouldResetSearchQueryPages({
    existingQueries: existing.githubSearchQueries,
    nextQueries: githubSearchQueries,
    existingSearchResultsPerQuery: existing.searchResultsPerQuery,
    nextSearchResultsPerQuery: input.searchResultsPerQuery,
  });

  let githubTokenEncrypted = existing.githubTokenEncrypted;
  if (input.clearGithubToken) {
    githubTokenEncrypted = null;
  } else if (input.githubToken) {
    githubTokenEncrypted = encryptSecret(input.githubToken);
  }

  await prisma.appSettings.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      githubTokenEncrypted,
      githubTopics: input.githubTopics,
      githubSearchQueries,
      maxReposPerRun: input.maxReposPerRun,
      searchResultsPerQuery: input.searchResultsPerQuery,
      searchQueryPages: normaliseSearchQueryPages(
        resetSearchQueryPages ? null : existing.searchQueryPages,
        githubSearchQueries,
        input.searchResultsPerQuery,
      ),
    },
  });
}

export async function updateGitHubSearchQueryPages(input: {
  githubSearchQueries: string[];
  githubSearchQueryPages: SearchQueryPageMap;
  searchResultsPerQuery: number;
  searchRotationOffset?: number;
}): Promise<void> {
  await prisma.appSettings.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      searchQueryPages: normaliseSearchQueryPages(
        input.githubSearchQueryPages,
        input.githubSearchQueries,
        input.searchResultsPerQuery,
      ),
      ...(input.searchRotationOffset === undefined
        ? {}
        : {
            searchRotationOffset: Math.max(
              0,
              Math.trunc(input.searchRotationOffset),
            ),
          }),
    },
  });
}
