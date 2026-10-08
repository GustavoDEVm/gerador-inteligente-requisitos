import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateSuggestionSchema } from "@/lib/api/schemas";
import { updateSuggestion } from "@/services/review-artifacts";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateSuggestion(parseId(id), user.id, await parseBody(request, updateSuggestionSchema))); }); }
