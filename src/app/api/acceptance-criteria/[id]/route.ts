import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateCriterionSchema } from "@/lib/api/schemas";
import { deleteCriterion, updateCriterion } from "@/services/user-stories";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateCriterion(parseId(id), user.id, await parseBody(request, updateCriterionSchema))); }); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; await deleteCriterion(parseId(id), user.id); return new Response(null, { status: 204 }); }); }
