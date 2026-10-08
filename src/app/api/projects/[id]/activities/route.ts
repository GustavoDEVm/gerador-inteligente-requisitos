import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseId } from "@/lib/api/http";
import { listActivities } from "@/services/projects";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listActivities(parseId(id), user.id)); }); }
