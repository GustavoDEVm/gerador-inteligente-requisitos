import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateAmbiguitySchema } from "@/lib/api/schemas";
import { updateAmbiguity } from "@/services/review-artifacts";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateAmbiguity(parseId(id), user.id, await parseBody(request, updateAmbiguitySchema))); }); }
