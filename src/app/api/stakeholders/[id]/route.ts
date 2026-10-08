import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateStakeholderSchema } from "@/lib/api/schemas";
import { deleteStakeholder, updateStakeholder } from "@/services/projects";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateStakeholder(parseId(id), user.id, await parseBody(request, updateStakeholderSchema))); }); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; await deleteStakeholder(parseId(id), user.id); return new Response(null, { status: 204 }); }); }
