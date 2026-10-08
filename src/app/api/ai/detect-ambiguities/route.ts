import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { detectAmbiguitiesSchema } from "@/lib/api/schemas";
import { aiService, type DetectAmbiguitiesUseCase } from "@/services/ai";

export const runtime = "nodejs";

export async function executeDetectAmbiguities(request: Request, service: DetectAmbiguitiesUseCase = aiService) {
  return handleAuthenticatedApi(request, async (user) => {
    const body = await parseBody(request, detectAmbiguitiesSchema);
    return ok(await service.detectAmbiguities({ ...body, userId: user.id }), 201);
  });
}

export async function POST(request: Request) {
  return executeDetectAmbiguities(request);
}
