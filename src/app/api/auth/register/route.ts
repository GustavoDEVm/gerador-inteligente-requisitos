import { NextResponse } from "next/server";

import { assertSessionConfiguration, encryptSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { handleApi, parseBody } from "@/lib/api/http";
import { registerSchema } from "@/lib/api/schemas";
import { registerUser } from "@/services/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSessionConfiguration();
    const user = await registerUser(await parseBody(request, registerSchema));
    const response = NextResponse.json({ data: user }, { status: 201 });
    response.cookies.set(sessionCookieName, await encryptSession({ userId: user.id }), sessionCookieOptions);
    return response;
  });
}
