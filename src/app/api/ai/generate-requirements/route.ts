import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { generateRequirementsSchema } from "@/lib/api/schemas";
import { aiService, type GenerateRequirementsUseCase } from "@/services/ai";

export const runtime = "nodejs";

export async function executeGenerateRequirements(request: Request, service: GenerateRequirementsUseCase = aiService) {
  return handleAuthenticatedApi(request, async (user) => {
    const body = await parseBody(request, generateRequirementsSchema);
    return ok(await service.generateRequirements({ ...body, userId: user.id }), 201);
  });
}

export async function POST(request: Request) {
  return executeGenerateRequirements(request);
}
