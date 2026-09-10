import { Prisma, ReportStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestHasManagerAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

const repositoryParamsSchema = z.object({
  repositoryId: z.string().min(1),
});

const updateRepositorySchema = z.object({
  reportStatus: z.nativeEnum(ReportStatus),
  reportNotes: z
    .string()
    .trim()
    .max(1500)
    .transform((value) => value || null),
});

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      repositoryId: string;
    }>;
  },
) {
  if (!requestHasManagerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = repositoryParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid repository id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = updateRepositorySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid repository update" }, { status: 400 });
  }

  try {
    const repository = await prisma.repository.update({
      where: {
        id: parsedParams.data.repositoryId,
      },
      data: {
        reportStatus: parsedBody.data.reportStatus,
        reportNotes: parsedBody.data.reportNotes,
      },
      select: {
        id: true,
        reportStatus: true,
        reportNotes: true,
      },
    });

    revalidatePath("/dashboard");
    return NextResponse.json(repository);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    throw error;
  }
}
