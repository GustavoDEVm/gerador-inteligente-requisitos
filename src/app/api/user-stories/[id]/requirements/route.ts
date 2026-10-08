import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { linkRequirementSchema } from "@/lib/api/schemas";
import { linkRequirement } from "@/services/user-stories";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; const body = await parseBody(request, linkRequirementSchema); return ok(await linkRequirement(parseId(id), body.requirementId, user.id), 201); });
}
