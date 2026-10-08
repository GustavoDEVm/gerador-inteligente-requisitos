import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { createQuestionSchema } from "@/lib/api/schemas";
import { createQuestion, listQuestions } from "@/services/elicitation";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await listQuestions(parseId(id), user.id)); }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; return ok(await createQuestion(parseId(id), user.id, await parseBody(request, createQuestionSchema)), 201); }); }
