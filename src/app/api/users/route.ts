import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(request: Request) { return handleAuthenticatedApi(request, async (user) => ok([user])); }
