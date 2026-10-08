import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateProjectSchema } from "@/lib/api/schemas";
import { getProject, updateProject } from "@/services/projects";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(_request, async (user) => { const { id } = await context.params; return ok(await getProject(parseId(id), user.id)); });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateProject(parseId(id), user.id, await parseBody(request, updateProjectSchema))); });
}
