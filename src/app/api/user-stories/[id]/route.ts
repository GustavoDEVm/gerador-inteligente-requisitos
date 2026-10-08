import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { updateUserStorySchema } from "@/lib/api/schemas";
import { getUserStory, updateUserStory } from "@/services/user-stories";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await getUserStory(parseId(id), user.id)); }); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await updateUserStory(parseId(id), user.id, await parseBody(request, updateUserStorySchema))); }); }
