import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  MANAGEMENT_KEY_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/constants";
import { getEnv } from "@/lib/env";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function signPayload(payload: string): string {
  return createHmac("sha256", getEnv().sessionSecret)
    .update(payload)
    .digest("hex");
}

export function isManagementKeyValid(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return timingSafeEqual(sha256(value), sha256(getEnv().managementKey));
}

export function createSessionToken(expiresAt: number): string {
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const [version, expiresAtRaw, signature] = value.split(".");
  if (!version || !expiresAtRaw || !signature || version !== "v1") {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const expected = signPayload(`${version}.${expiresAtRaw}`);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function setManagerSession(): Promise<void> {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(expiresAt), {
    expires: new Date(expiresAt),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearManagerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function isManagerAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireManager(): Promise<void> {
  if (!(await isManagerAuthenticated())) {
    redirect("/login");
  }
}

export function requestHasManagerAccess(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization");
  const headerKey =
    request.headers.get(MANAGEMENT_KEY_HEADER) ??
    (authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7)
      : null);

  if (isManagementKeyValid(headerKey)) {
    return true;
  }

  return verifySessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null,
  );
}
