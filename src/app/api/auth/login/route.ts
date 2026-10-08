import { NextResponse } from "next/server";

import { assertSessionConfiguration, encryptSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { handleApi, parseBody } from "@/lib/api/http";
import { loginSchema } from "@/lib/api/schemas";
import { authenticateUser } from "@/services/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSessionConfiguration();
    const user = await authenticateUser(await parseBody(request, loginSchema));
    const response = NextResponse.json({ data: user });
    response.cookies.set(sessionCookieName, await encryptSession({ userId: user.id }), sessionCookieOptions);
    return response;
  });
}
