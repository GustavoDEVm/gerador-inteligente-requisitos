import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { archiveProjectSchema } from "@/lib/api/schemas";
import { archiveProject } from "@/services/projects";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; await parseBody(request, archiveProjectSchema); return ok(await archiveProject(parseId(id), user.id)); });
}
