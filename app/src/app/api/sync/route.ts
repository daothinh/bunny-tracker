import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestHasManagerAccess } from "@/lib/auth";
import { runGitHubSync } from "@/lib/github";

const syncSourceSchema = z.enum(["manual", "schedule"]);

export async function POST(request: NextRequest) {
  if (!requestHasManagerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedSource = syncSourceSchema.safeParse(
    request.nextUrl.searchParams.get("source") ??
      request.headers.get("x-sync-source") ??
      "manual",
  );
  const source = parsedSource.success ? parsedSource.data : "manual";

  const summary = await runGitHubSync(source);
  return NextResponse.json(summary);
}
