"use server";

import { ReportStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearManagerSession, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getGitHubRuntimeSettings,
  updateGitHubRuntimeSettings,
} from "@/lib/runtime-settings";

const updateRepositorySchema = z.object({
  repositoryId: z.string().min(1),
  reportStatus: z.nativeEnum(ReportStatus),
  reportNotes: z
    .string()
    .trim()
    .max(1500)
    .transform((value) => value || null),
});

const updateGitHubTokenSchema = z
  .object({
  githubToken: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  clearGithubToken: z.literal(false).default(false),
})
  .superRefine((value, ctx) => {
    if (
      value.githubToken &&
      (/\s/.test(value.githubToken) || value.githubToken.length < 20)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "GitHub token format looks invalid.",
        path: ["githubToken"],
      });
    }
  });

export async function updateGitHubTokenAction(formData: FormData): Promise<void> {
  await requireManager();

  const parsed = updateGitHubTokenSchema.parse({
    githubToken: formData.get("githubToken"),
  });
  const settings = await getGitHubRuntimeSettings();

  await updateGitHubRuntimeSettings({
    githubToken: parsed.githubToken,
    clearGithubToken: false,
    githubTopics: settings.githubTopics,
    githubSearchQueries: settings.githubSearchQueries,
    maxReposPerRun: settings.maxReposPerRun,
    searchResultsPerQuery: settings.searchResultsPerQuery,
  });
  revalidatePath("/dashboard");
}

export async function updateRepositoryAction(formData: FormData): Promise<void> {
  await requireManager();

  const parsed = updateRepositorySchema.parse({
    repositoryId: formData.get("repositoryId"),
    reportStatus: formData.get("reportStatus"),
    reportNotes: formData.get("reportNotes"),
  });

  await prisma.repository.update({
    where: {
      id: parsed.repositoryId,
    },
    data: {
      reportStatus: parsed.reportStatus,
      reportNotes: parsed.reportNotes,
    },
  });

  revalidatePath("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearManagerSession();
  redirect("/login");
}
