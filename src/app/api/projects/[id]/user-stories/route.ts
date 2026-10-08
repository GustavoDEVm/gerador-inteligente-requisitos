import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { createUserStorySchema } from "@/lib/api/schemas";
import { createUserStory, listUserStories } from "@/services/user-stories";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listUserStories(parseId(id), user.id)); }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await createUserStory(parseId(id), user.id, await parseBody(request, createUserStorySchema)), 201); }); }
