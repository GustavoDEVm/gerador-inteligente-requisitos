import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth/constants";

const publicPaths = new Set(["/login", "/cadastro"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(sessionCookieName);

  if (!hasSessionCookie && !publicPaths.has(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && publicPaths.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
