import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { executeDetectAmbiguities, POST as detectAmbiguitiesRoute } from "../../src/app/api/ai/detect-ambiguities/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import { AIProviderError } from "../../src/services/ai/errors";
import { MOCK_MODEL, MockAIProvider } from "../../src/services/ai/providers/mock";
import { ambiguityDetectionSchema, toProviderJsonSchema } from "../../src/services/ai/schemas";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "../../src/services/ai/types";
import type { AmbiguityDetectionResponse, AmbiguityDetectionResult } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/detect-ambiguities", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function withMockProvider<T>(operation: () => Promise<T> | T) {
  const previousProvider = process.env.AI_PROVIDER;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.AI_PROVIDER = "mock";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;

  try {
    return await operation();
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
}

test("o contrato de ambiguidades é estruturado e o MockAIProvider cobre cenários previsíveis", async () => {
  const valid: AmbiguityDetectionResult = {
    ambiguities: [{
      description: "Não está definido quem pode cancelar uma consulta.",
      severity: "medium",
      context: "pacientes possam marcar consultas",
    }],
  };

  assert.equal(ambiguityDetectionSchema.safeParse(valid).success, true);
  assert.equal(ambiguityDetectionSchema.safeParse({ ambiguities: [{ ...valid.ambiguities[0], severity: "critical" }] }).success, false);
  assert.equal(ambiguityDetectionSchema.safeParse({ ambiguities: [{ description: "sem contexto", severity: "low" }] }).success, false);

  const provider = new MockAIProvider();
  const baseRequest: StructuredGenerationRequest<AmbiguityDetectionResult> = {
    model: "",
    systemInstruction: "instrução de teste",
    userInput: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.",
    responseJsonSchema: toProviderJsonSchema(ambiguityDetectionSchema),
    metadata: { operation: "detect-ambiguities" },
  };
  const first = await provider.generateStructuredResponse(baseRequest);
  const second = await provider.generateStructuredResponse(baseRequest);
  const noAmbiguities = await provider.generateStructuredResponse({
    ...baseRequest,
    userInput: "Os requisitos completos e sem ambiguidades foram validados com todos os envolvidos.",
  });

  assert.equal(first.model, MOCK_MODEL);
  assert.deepEqual(first, second);
  assert.equal(ambiguityDetectionSchema.safeParse(first.output).success, true);
  assert.deepEqual(new Set(first.output.ambiguities.map((ambiguity) => ambiguity.severity)), new Set(["low", "medium", "high"]));
  assert.deepEqual(first.output.ambiguities.map((ambiguity) => ambiguity.description), [
    "Não está definido como o estoque é atualizado após um pedido.",
    "Não está definido se o cliente precisa estar autenticado para realizar um pedido.",
    "Não está definido como funciona a combinação de tamanho e cor de cada produto.",
  ]);
  assert.doesNotMatch(JSON.stringify(first.output), /\b(aluno|livro|acervo|reserva)\b/i);
  assert.deepEqual(noAmbiguities.output, { ambiguities: [] });
});

test("a API detecta, persiste e preserva o histórico de ambiguidades sem chamar Gemini", async () => {
  const suffix = randomBytes(6).toString("hex");
  const projectIds: string[] = [];
  const userIds: string[] = [];

  await withMockProvider(async () => {
    try {
      const [owner, otherUser] = await Promise.all([
        prisma.user.create({ data: { name: "Proprietário da análise", email: `ambiguity-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
        prisma.user.create({ data: { name: "Outro usuário da análise", email: `ambiguity-other-${suffix}@example.test`, passwordHash: "test-only" } }),
      ]);
      userIds.push(owner.id, otherUser.id);

      const [project, secondProject, foreignProject] = await Promise.all([
        prisma.project.create({ data: { ownerId: owner.id, name: `Projeto de ambiguidades ${suffix}`, description: "Projeto temporário para testar ambiguidades.", objective: "Validar persistência rastreável.", context: "Teste automatizado." } }),
        prisma.project.create({ data: { ownerId: owner.id, name: `Segundo projeto ${suffix}`, description: "Projeto para validar sessões cruzadas.", objective: "Validar autorização de sessão.", context: "Teste automatizado." } }),
        prisma.project.create({ data: { ownerId: otherUser.id, name: `Projeto de outro usuário ${suffix}`, description: "Projeto sem autorização.", objective: "Validar isolamento de dados.", context: "Teste automatizado." } }),
      ]);
      projectIds.push(project.id, secondProject.id, foreignProject.id);

      const [session, sessionWithoutAnswer, sessionFromSecondProject, foreignSession] = await Promise.all([
        prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão principal de ambiguidades." } }),
        prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 2, context: "Sessão sem resposta inicial." } }),
        prisma.elicitationSession.create({ data: { projectId: secondProject.id, createdById: owner.id, sequence: 1, context: "Sessão de outro projeto do proprietário." } }),
        prisma.elicitationSession.create({ data: { projectId: foreignProject.id, createdById: otherUser.id, sequence: 1, context: "Sessão sem autorização." } }),
      ]);
      const [question] = await Promise.all([
        prisma.elicitationQuestion.create({ data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" } }),
        prisma.elicitationQuestion.create({ data: { sessionId: sessionWithoutAnswer.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" } }),
      ]);
      const initialAnswer = await prisma.elicitationAnswer.create({
        data: {
          questionId: question.id,
          authorId: owner.id,
          version: 1,
          content: "Quero um sistema para uma clínica onde pacientes possam marcar consultas.",
        },
      });
      const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
      const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
      const body = { projectId: project.id, sessionId: session.id };

      assert.equal((await detectAmbiguitiesRoute(request(body))).status, 401);
      assert.equal((await detectAmbiguitiesRoute(request({ ...body, input: "não permitido" }, ownerCookie))).status, 400);
      assert.equal((await detectAmbiguitiesRoute(request({ ...body, projectId: "00000000-0000-4000-8000-000000000001" }, ownerCookie))).status, 404);
      assert.equal((await detectAmbiguitiesRoute(request({ projectId: foreignProject.id, sessionId: foreignSession.id }, ownerCookie))).status, 403);
      assert.equal((await detectAmbiguitiesRoute(request({ ...body, sessionId: "00000000-0000-4000-8000-000000000002" }, ownerCookie))).status, 404);
      assert.equal((await detectAmbiguitiesRoute(request({ ...body, sessionId: sessionFromSecondProject.id }, ownerCookie))).status, 400);
      assert.equal((await detectAmbiguitiesRoute(request({ ...body, sessionId: sessionWithoutAnswer.id }, ownerCookie))).status, 400);
      assert.equal((await detectAmbiguitiesRoute(request(body, otherUserCookie))).status, 403);

      const firstResponse = await detectAmbiguitiesRoute(request(body, ownerCookie));
      assert.equal(firstResponse.status, 201);
      const firstPayload = await firstResponse.json() as { data: AmbiguityDetectionResponse };
      assert.equal(ambiguityDetectionSchema.safeParse(firstPayload.data.result).success, true);
      assert.equal(firstPayload.data.result.ambiguities.length, 3);
      assert.deepEqual(new Set(firstPayload.data.result.ambiguities.map((ambiguity) => ambiguity.severity)), new Set(["low", "medium", "high"]));

      const firstAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({
        where: { id: firstPayload.data.analysisId },
        include: { ambiguities: true, sessions: true },
      });
      assert.equal(firstAnalysis.type, "AMBIGUITY_DETECTION");
      assert.equal(firstAnalysis.status, "SUCCEEDED");
      assert.equal(firstAnalysis.provider, "mock");
      assert.equal(firstAnalysis.model, MOCK_MODEL);
      assert.equal(firstAnalysis.promptVersion, "ambiguities-v1");
      assert.equal(firstAnalysis.sessions[0]?.sessionId, session.id);
      assert.deepEqual(firstAnalysis.inputSnapshot, {
        input: initialAnswer.content,
        sessionId: session.id,
        sourceAnswerId: initialAnswer.id,
      });
      assert.deepEqual(firstAnalysis.structuredOutput, firstPayload.data.result);
      assert.equal(firstAnalysis.ambiguities.length, 3);
      assert.ok(firstAnalysis.ambiguities.every((ambiguity) => ambiguity.generatedByAnalysisId === firstAnalysis.id && ambiguity.status === "OPEN"));
      assert.deepEqual(new Set(firstAnalysis.ambiguities.map((ambiguity) => ambiguity.severity)), new Set(["LOW", "MEDIUM", "HIGH"]));

      const secondResponse = await detectAmbiguitiesRoute(request(body, ownerCookie));
      assert.equal(secondResponse.status, 201);
      const historyCount = await prisma.aIAnalysis.count({ where: { projectId: project.id, type: "AMBIGUITY_DETECTION", status: "SUCCEEDED" } });
      assert.equal(historyCount, 2);
      assert.equal(await prisma.ambiguity.count({ where: { projectId: project.id } }), 6);

      await prisma.elicitationAnswer.create({
        data: {
          questionId: question.id,
          authorId: owner.id,
          version: 2,
          content: "Os requisitos completos e sem ambiguidades foram validados com todos os envolvidos.",
        },
      });
      const noAmbiguitiesResponse = await detectAmbiguitiesRoute(request(body, ownerCookie));
      assert.equal(noAmbiguitiesResponse.status, 201);
      const noAmbiguitiesPayload = await noAmbiguitiesResponse.json() as { data: AmbiguityDetectionResponse };
      assert.deepEqual(noAmbiguitiesPayload.data.result, { ambiguities: [] });
    } finally {
      for (const projectId of projectIds) {
        await prisma.activityLog.deleteMany({ where: { projectId } });
        await prisma.ambiguity.deleteMany({ where: { projectId } });
        await prisma.aIAnalysis.deleteMany({ where: { projectId } });
        await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
        await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
        await prisma.elicitationSession.deleteMany({ where: { projectId } });
        await prisma.project.delete({ where: { id: projectId } });
      }
      for (const userId of userIds) await prisma.user.delete({ where: { id: userId } });
    }
  });
});

test("a detecção registra resposta inválida e falha do provider sem persistir ambiguidades", async () => {
  const suffix = randomBytes(6).toString("hex");
  let projectId: string | undefined;
  let userId: string | undefined;

  try {
    const user = await prisma.user.create({ data: { name: "Usuário de falhas", email: `ambiguity-errors-${suffix}@example.test`, passwordHash: "test-only" } });
    userId = user.id;
    const project = await prisma.project.create({ data: { ownerId: user.id, name: `Projeto de falhas ${suffix}`, description: "Projeto temporário para falhas de IA.", objective: "Validar tratamento de falhas.", context: "Teste automatizado." } });
    projectId = project.id;
    const session = await prisma.elicitationSession.create({ data: { projectId: project.id, createdById: user.id, sequence: 1, context: "Sessão para falhas de IA." } });
    const question = await prisma.elicitationQuestion.create({ data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial.", source: "TEMPLATE" } });
    await prisma.elicitationAnswer.create({ data: { questionId: question.id, authorId: user.id, version: 1, content: "Quero um sistema para controlar reservas de salas de reunião." } });
    const cookie = `${sessionCookieName}=${await encryptSession({ userId: user.id })}`;
    const body = { projectId: project.id, sessionId: session.id };

    const invalidProvider: AIProvider = {
      name: "invalid-test-provider",
      async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
        return { output: { ambiguities: [{ description: "Resposta inválida", severity: "critical", context: "teste" }] } as T, model: "invalid-model" };
      },
    };
    const invalidResponse = await executeDetectAmbiguities(request(body, cookie), new AIService({ providerFactory: () => invalidProvider }));
    assert.equal(invalidResponse.status, 422);

    const unavailableProvider: AIProvider = {
      name: "unavailable-test-provider",
      async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
        throw new AIProviderError("AI_TIMEOUT");
      },
    };
    const unavailableResponse = await executeDetectAmbiguities(request(body, cookie), new AIService({ providerFactory: () => unavailableProvider }));
    assert.equal(unavailableResponse.status, 504);

    const failedAnalyses = await prisma.aIAnalysis.findMany({
      where: { projectId: project.id, type: "AMBIGUITY_DETECTION" },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(failedAnalyses.map((analysis) => [analysis.status, analysis.errorCode]), [["INVALID_RESPONSE", "AI_INVALID_RESPONSE"], ["FAILED", "AI_TIMEOUT"]]);
    assert.equal(await prisma.ambiguity.count({ where: { projectId: project.id } }), 0);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.ambiguity.deleteMany({ where: { projectId } });
      await prisma.aIAnalysis.deleteMany({ where: { projectId } });
      await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
      await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  }
});
