import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { createSuggestionSchema } from "@/lib/api/schemas";
import { createSuggestion, listSuggestions } from "@/services/review-artifacts";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listSuggestions(parseId(id), user.id)); }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await createSuggestion(parseId(id), user.id, await parseBody(request, createSuggestionSchema)), 201); }); }
