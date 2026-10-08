import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { generateRefinementQuestionsSchema } from "@/lib/api/schemas";
import { aiService, type GenerateRefinementQuestionsUseCase } from "@/services/ai";

export const runtime = "nodejs";

export async function executeGenerateRefinementQuestions(
  request: Request,
  service: GenerateRefinementQuestionsUseCase = aiService,
) {
  return handleAuthenticatedApi(request, async (user) => {
    const body = await parseBody(request, generateRefinementQuestionsSchema);
    return ok(await service.generateRefinementQuestions({ ...body, userId: user.id }), 201);
  });
}

export async function POST(request: Request) {
  return executeGenerateRefinementQuestions(request);
}
