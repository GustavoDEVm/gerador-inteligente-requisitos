import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateRequirementSchema } from "@/lib/api/schemas";
import { getRequirement, updateRequirement } from "@/services/requirements";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await getRequirement(parseId(id), user.id)); }); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateRequirement(parseId(id), user.id, await parseBody(request, updateRequirementSchema))); }); }
