import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { createStakeholderSchema } from "@/lib/api/schemas";
import { createStakeholder, listStakeholders } from "@/services/projects";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listStakeholders(parseId(id), user.id)); }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await createStakeholder(parseId(id), user.id, await parseBody(request, createStakeholderSchema)), 201); }); }
