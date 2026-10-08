import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { createAmbiguitySchema } from "@/lib/api/schemas";
import { createAmbiguity, listAmbiguities } from "@/services/review-artifacts";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listAmbiguities(parseId(id), user.id)); }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await createAmbiguity(parseId(id), user.id, await parseBody(request, createAmbiguitySchema)), 201); }); }
