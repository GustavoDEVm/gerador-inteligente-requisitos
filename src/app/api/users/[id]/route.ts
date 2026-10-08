import { forbidden } from "@/lib/api/errors";
import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseId } from "@/lib/api/http";
import { getUser } from "@/services/users";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAuthenticatedApi(request, async (user) => { const { id } = await context.params; if (parseId(id) !== user.id) throw forbidden(); return ok(await getUser(user.id)); });
}
