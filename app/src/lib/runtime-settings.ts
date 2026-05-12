import { Prisma } from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { DEFAULT_SEARCH_QUERIES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const APP_SETTINGS_ID = "default";
const LEGACY_DEFAULT_SEARCH_QUERIES = [
  "topic:web3",
  "topic:solidity",
  "topic:defi",
  "topic:smart-contracts",
  "topic:wallet",
  "topic:bridge",
] as const;

export type GitHubRuntimeSettings = {
  githubToken?: string;
  githubTopics: string[];
  githubSearchQueries: string[];
  maxReposPerRun: number;
  searchResultsPerQuery: number;
};

export type DashboardGitHubSettings = GitHubRuntimeSettings & {
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
  const githubSearchQueries = areQueriesEquivalent(
    env.githubSearchQueries,
    LEGACY_DEFAULT_SEARCH_QUERIES,
  )
    ? [...DEFAULT_SEARCH_QUERIES]
    : [...env.githubSearchQueries];

  return {
    githubToken: env.githubToken,
    githubTopics: [...env.githubTopics],
    githubSearchQueries,
    maxReposPerRun: env.maxReposPerRun,
    searchResultsPerQuery: env.searchResultsPerQuery,
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

function maskToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return "configured";
  }

  return `••••${value.slice(-4)}`;
}

async function ensureAppSettingsRecord() {
  const existing = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
  });

  if (existing) {
    if (
      areQueriesEquivalent(
        existing.githubSearchQueries,
        LEGACY_DEFAULT_SEARCH_QUERIES,
      )
    ) {
      return prisma.appSettings.update({
        where: { id: APP_SETTINGS_ID },
        data: {
          githubSearchQueries: [...DEFAULT_SEARCH_QUERIES],
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
        : buildDefaultGitHubSettings().githubTopics,
    githubSearchQueries:
      record.githubSearchQueries.length > 0
        ? record.githubSearchQueries
        : buildDefaultGitHubSettings().githubSearchQueries,
    maxReposPerRun: record.maxReposPerRun,
    searchResultsPerQuery: record.searchResultsPerQuery,
  };
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

  return {
    ...settings,
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
      githubSearchQueries: input.githubSearchQueries,
      maxReposPerRun: input.maxReposPerRun,
      searchResultsPerQuery: input.searchResultsPerQuery,
    },
  });
}
