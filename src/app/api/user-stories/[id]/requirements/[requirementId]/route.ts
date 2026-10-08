import { handleAuthenticatedApi } from "@/lib/api/auth";
import { parseId } from "@/lib/api/http";
import { unlinkRequirement } from "@/services/user-stories";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string; requirementId: string }> }) {
  return handleAuthenticatedApi(request, async (user) => { const { id, requirementId } = await context.params; await unlinkRequirement(parseId(id), parseId(requirementId), user.id); return new Response(null, { status: 204 }); });
}
