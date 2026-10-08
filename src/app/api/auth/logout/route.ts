import { NextResponse } from "next/server";

import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { handleApi } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST() {
  return handleApi(async () => {
    const response = NextResponse.json({ data: { loggedOut: true } });
    response.cookies.set(sessionCookieName, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  });
}
