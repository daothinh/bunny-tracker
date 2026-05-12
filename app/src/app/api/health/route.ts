import { NextResponse } from "next/server";
import { APP_TITLE } from "@/lib/constants";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: APP_TITLE,
  });
}
