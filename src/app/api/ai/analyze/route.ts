import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { analyzeSystemSchema } from "@/lib/api/schemas";
import { aiService, type AnalyzeSystemDescriptionUseCase } from "@/services/ai";

export const runtime = "nodejs";

export async function executeAnalyze(request: Request, service: AnalyzeSystemDescriptionUseCase = aiService) {
  return handleAuthenticatedApi(request, async (user) => {
    const body = await parseBody(request, analyzeSystemSchema);
    return ok(await service.analyzeSystemDescription({ ...body, userId: user.id }), 201);
  });
}

export async function POST(request: Request) {
  return executeAnalyze(request);
}
