import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { refineRequirementsSchema } from "@/lib/api/schemas";
import { aiService, type RefineRequirementsUseCase } from "@/services/ai";

export const runtime = "nodejs";

export async function executeRefineRequirements(request: Request, service: RefineRequirementsUseCase = aiService) {
  return handleAuthenticatedApi(request, async (user) => {
    const body = await parseBody(request, refineRequirementsSchema);
    return ok(await service.refineRequirements({ ...body, userId: user.id }), 201);
  });
}

export async function POST(request: Request) {
  return executeRefineRequirements(request);
}
