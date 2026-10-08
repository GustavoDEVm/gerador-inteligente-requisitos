import { handleApi, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/services/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(async () => ok(await getCurrentUser(request)));
}
