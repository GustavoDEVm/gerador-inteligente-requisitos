import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateSessionSchema } from "@/lib/api/schemas";
import { getSession, updateSession } from "@/services/elicitation";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await getSession(parseId(id), user.id)); }); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateSession(parseId(id), user.id, await parseBody(request, updateSessionSchema))); }); }
