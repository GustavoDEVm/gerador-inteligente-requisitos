import { handleApi } from "@/lib/api/http";
import { requireCurrentUser, type AuthenticatedUser } from "@/services/auth";

export async function handleAuthenticatedApi(
  request: Request,
  operation: (user: AuthenticatedUser) => Promise<Response>,
) {
  return handleApi(async () => operation(await requireCurrentUser(request)));
}
