import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody, parseId } from "@/lib/api/http";
import { startElicitationSchema } from "@/lib/api/schemas";
import { startElicitationSession } from "@/services/elicitation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(request, async (user) => {
    const { id } = await context.params;
    return ok(await startElicitationSession(parseId(id), user.id, await parseBody(request, startElicitationSchema)), 201);
  });
}
