import { z } from "zod";
import {
  DEFAULT_SEARCH_QUERIES,
  DEFAULT_WEB3_TOPICS,
} from "@/lib/constants";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MANAGEMENT_KEY: z.string().min(4),
  SESSION_SECRET: z.string().min(16),
  GITHUB_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : undefined)),
  GITHUB_TOPICS: z.string().optional(),
  GITHUB_SEARCH_QUERIES: z.string().optional(),
  MAX_REPOS_PER_RUN: z.coerce.number().int().positive().default(18),
  SEARCH_RESULTS_PER_QUERY: z.coerce.number().int().positive().default(8),
  INGEST_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
});

type AppEnv = {
  databaseUrl: string;
  managementKey: string;
  sessionSecret: string;
  githubToken?: string;
  githubTopics: string[];
  githubSearchQueries: string[];
  maxReposPerRun: number;
  searchResultsPerQuery: number;
  ingestIntervalMinutes: number;
  appBaseUrl: string;
};

let cachedEnv: AppEnv | undefined;

function splitCsv(
  value: string | undefined,
  fallback: readonly string[],
  transform: (entry: string) => string = (entry) => entry,
): string[] {
  if (!value) {
    return [...fallback];
  }

  const parsed = value
    .split(",")
    .map((entry) => transform(entry.trim()))
    .filter(Boolean);

  return parsed.length > 0 ? parsed : [...fallback];
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.parse(process.env);

  cachedEnv = {
    databaseUrl: parsed.DATABASE_URL,
    managementKey: parsed.MANAGEMENT_KEY,
    sessionSecret: parsed.SESSION_SECRET,
    githubToken: parsed.GITHUB_TOKEN,
    githubTopics: splitCsv(
      parsed.GITHUB_TOPICS,
      DEFAULT_WEB3_TOPICS,
      (entry) => entry.toLowerCase(),
    ),
    githubSearchQueries: splitCsv(
      parsed.GITHUB_SEARCH_QUERIES,
      DEFAULT_SEARCH_QUERIES,
    ),
    maxReposPerRun: parsed.MAX_REPOS_PER_RUN,
    searchResultsPerQuery: parsed.SEARCH_RESULTS_PER_QUERY,
    ingestIntervalMinutes: parsed.INGEST_INTERVAL_MINUTES,
    appBaseUrl: parsed.APP_BASE_URL,
  };

  return cachedEnv;
}
