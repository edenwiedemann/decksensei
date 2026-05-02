"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/magic-link";
import {
  createSession,
  touchLastSeen,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";

export async function verifyAndLogin(formData: FormData): Promise<void> {
  const token = formData.get("token");

  if (typeof token !== "string" || !token.trim()) {
    redirect("/auth/verify?error=invalid");
  }

  let userId: number | null = null;
  try {
    userId = await verifyToken(token.trim());
  } catch (err) {
    console.error("[verify] verifyToken error:", err);
    redirect("/auth/verify?error=invalid");
  }

  if (!userId) {
    redirect("/auth/verify?error=invalid");
  }

  await touchLastSeen(userId);

  const sessionId = await createSession(userId);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/digimon");
}
