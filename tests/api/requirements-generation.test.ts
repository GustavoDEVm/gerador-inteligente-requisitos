import "dotenv/config";

import type { GoogleGenAI } from "@google/genai";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as generateRequirementsRoute } from "../../src/app/api/ai/generate-requirements/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { getAIConfiguration } from "../../src/services/ai/config";
import { AIService } from "../../src/services/ai/ai-service";
import { getAIProvider } from "../../src/services/ai/provider";
import { GeminiProvider } from "../../src/services/ai/providers/gemini";
import { MOCK_MODEL, MockAIProvider } from "../../src/services/ai/providers/mock";
import { requirementsGenerationSchema, toProviderJsonSchema } from "../../src/services/ai/schemas";
import type { StructuredGenerationRequest } from "../../src/services/ai/types";
import type { RequirementsGenerationAIResult, RequirementsGenerationResponse } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/generate-requirements", {
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

test("o schema de geração exige quatro campos e somente valores primitivos", () => {
  const valid: RequirementsGenerationAIResult = {
    userStory: "Como aluno, quero consultar livros, para encontrar obras para estudo.",
    functionalRequirements: ["O sistema deve listar os livros encontrados."],
    nonFunctionalRequirements: ["A consulta deve apresentar informações compreensíveis."],
    acceptanceCriteria: ["Quando houver livros encontrados, o sistema deve apresentá-los ao aluno."],
  };

  assert.equal(requirementsGenerationSchema.safeParse(valid).success, true);
  assert.equal(requirementsGenerationSchema.safeParse({ ...valid, functionalRequirements: [] }).success, false);
  assert.equal(requirementsGenerationSchema.safeParse({ ...valid, userStory: { actor: "aluno" } }).success, false);
  assert.equal(requirementsGenerationSchema.safeParse({ ...valid, nonFunctionalRequirements: [{ description: "objeto não permitido" }] }).success, false);
  assert.equal(requirementsGenerationSchema.safeParse({ ...valid, acceptanceCriteria: [{}] }).success, false);

  const properties = toProviderJsonSchema(requirementsGenerationSchema).properties as Record<string, { type?: string; items?: { type?: string } }>;
  assert.equal(properties.userStory?.type, "string");
  for (const field of ["functionalRequirements", "nonFunctionalRequirements", "acceptanceCriteria"]) {
    assert.equal(properties[field]?.type, "array");
    assert.equal(properties[field]?.items?.type, "string");
  }
});

test("MockAIProvider gera requisitos completos, determinísticos e sem configuração Gemini", async () => {
  await withMockProvider(async () => {
    assert.deepEqual(getAIConfiguration(), { provider: "mock", gemini: {} });
    const provider = getAIProvider();
    assert.ok(provider instanceof MockAIProvider);
    const generationRequest: StructuredGenerationRequest<RequirementsGenerationAIResult> = {
      model: "",
      systemInstruction: "instrução de teste",
      userInput: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.",
      responseJsonSchema: toProviderJsonSchema(requirementsGenerationSchema),
      metadata: { operation: "generate-requirements" },
    };

    const first = await provider.generateStructuredResponse(generationRequest);
    const second = await provider.generateStructuredResponse(generationRequest);

    assert.equal(first.model, MOCK_MODEL);
    assert.deepEqual(first, second);
    assert.equal(requirementsGenerationSchema.safeParse(first.output).success, true);
    assert.equal(typeof first.output.userStory, "string");
    assert.ok(first.output.functionalRequirements.length >= 2);
    assert.ok(first.output.nonFunctionalRequirements.length >= 1);
    assert.ok(first.output.acceptanceCriteria.length >= 1);
    assert.ok(first.output.functionalRequirements.every((requirement) => typeof requirement === "string"));
    assert.ok(first.output.nonFunctionalRequirements.every((requirement) => typeof requirement === "string"));
    assert.ok(first.output.acceptanceCriteria.every((criterion) => typeof criterion === "string"));
    assert.match(first.output.userStory, /cliente/i);
    assert.ok(first.output.functionalRequirements.some((requirement) => /produto.*tamanho.*cor/i.test(requirement)));
    assert.ok(first.output.functionalRequirements.some((requirement) => /administrador.*estoque/i.test(requirement)));
    assert.doesNotMatch(JSON.stringify(first.output), /\b(aluno|livro|acervo|reserva)\b/i);
  });
});

test("a API gera, persiste e rastreia requisitos sem chamar Gemini", async () => {
  const suffix = randomBytes(6).toString("hex");
  const input = "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.";
  let projectId: string | undefined;
  let firstUserId: string | undefined;
  let secondUserId: string | undefined;

  await withMockProvider(async () => {
    try {
      const [firstUser, secondUser] = await Promise.all([
        prisma.user.create({ data: { name: "Pessoa proprietária de teste", email: `requirements-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
        prisma.user.create({ data: { name: "Pessoa sem acesso de teste", email: `requirements-other-${suffix}@example.test`, passwordHash: "test-only" } }),
      ]);
      firstUserId = firstUser.id;
      secondUserId = secondUser.id;
      const project = await prisma.project.create({
        data: {
          ownerId: firstUser.id,
          name: `Projeto de requisitos ${suffix}`,
          description: "Projeto temporário para a geração estruturada de requisitos.",
          objective: "Validar persistência e rastreabilidade da geração por IA.",
          context: "Ambiente automatizado de testes.",
        },
      });
      projectId = project.id;
      const session = await prisma.elicitationSession.create({
        data: { projectId: project.id, createdById: firstUser.id, sequence: 1, context: "Sessão temporária para geração de requisitos." },
      });
      const initialQuestion = await prisma.elicitationQuestion.create({
        data: {
          sessionId: session.id,
          position: 1,
          content: "Descreva a necessidade inicial do sistema.",
          source: "TEMPLATE",
        },
      });
      const initialAnswer = await prisma.elicitationAnswer.create({
        data: {
          questionId: initialQuestion.id,
          authorId: firstUser.id,
          version: 1,
          content: input,
        },
      });
      const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: firstUser.id })}`;
      const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: secondUser.id })}`;
      const body = { projectId: project.id, sessionId: session.id };

      assert.equal((await generateRequirementsRoute(request(body))).status, 401);
      assert.equal((await generateRequirementsRoute(request({ ...body, input: input }, ownerCookie))).status, 400);
      assert.equal((await generateRequirementsRoute(request({ ...body, projectId: "00000000-0000-4000-8000-000000000001" }, ownerCookie))).status, 404);
      assert.equal((await generateRequirementsRoute(request({ ...body, sessionId: "00000000-0000-4000-8000-000000000002" }, ownerCookie))).status, 404);
      assert.equal((await generateRequirementsRoute(request(body, otherUserCookie))).status, 403);

      const firstResponse = await generateRequirementsRoute(request(body, ownerCookie));
      assert.equal(firstResponse.status, 201);
      const firstPayload = await firstResponse.json() as { data: RequirementsGenerationResponse };
      assert.equal(typeof firstPayload.data.result.userStory.actor, "string");
      assert.ok(firstPayload.data.result.functionalRequirements.every((requirement) => typeof requirement.code === "string" && typeof requirement.description === "string"));
      assert.ok(firstPayload.data.result.nonFunctionalRequirements.every((requirement) => typeof requirement.code === "string" && typeof requirement.category === "string" && typeof requirement.description === "string"));
      assert.ok(firstPayload.data.result.acceptanceCriteria.every((criterion) => typeof criterion.description === "string"));

      const firstAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({
        where: { id: firstPayload.data.analysisId },
        include: { sessions: true, generatedStories: { include: { acceptanceCriteria: true } } },
      });
      assert.equal(firstAnalysis.status, "SUCCEEDED");
      assert.equal(firstAnalysis.provider, "mock");
      assert.equal(firstAnalysis.model, MOCK_MODEL);
      assert.equal(firstAnalysis.promptVersion, "requirements-v2");
      assert.equal(firstAnalysis.sessions[0]?.sessionId, session.id);
      assert.deepEqual(firstAnalysis.structuredOutput, firstPayload.data.result);
      assert.deepEqual(firstAnalysis.inputSnapshot, {
        input,
        sessionId: session.id,
        sourceAnswerId: initialAnswer.id,
      });
      assert.equal(firstAnalysis.generatedStories.length, 1);
      assert.equal(firstAnalysis.generatedStories[0]?.acceptanceCriteria.length, firstPayload.data.result.acceptanceCriteria.length);
      assert.equal(firstAnalysis.generatedStories[0]?.actor, firstPayload.data.result.userStory.actor);
      assert.equal(firstAnalysis.generatedStories[0]?.objective, firstPayload.data.result.userStory.action);
      assert.equal(firstAnalysis.generatedStories[0]?.benefit, firstPayload.data.result.userStory.benefit);
      assert.equal(firstAnalysis.generatedStories[0]?.description, "Como cliente, quero visualizar produtos de roupas, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos, para comprar produtos adequados às minhas preferências.");

      const firstRequirements = await prisma.requirement.findMany({
        where: { projectId: project.id, analysisSources: { some: { analysisId: firstAnalysis.id } } },
        include: { analysisSources: true, answerSources: true, userStoryLinks: true },
        orderBy: { code: "asc" },
      });
      const expectedRequirementCount = firstPayload.data.result.functionalRequirements.length + firstPayload.data.result.nonFunctionalRequirements.length;
      assert.equal(firstRequirements.length, expectedRequirementCount);
      assert.ok(firstRequirements.every((requirement) => requirement.analysisSources.some((source) => source.analysisId === firstAnalysis.id)));
      assert.ok(firstRequirements.every((requirement) => requirement.answerSources.some((source) => source.answerId === initialAnswer.id)));
      assert.ok(firstRequirements.every((requirement) => requirement.userStoryLinks.some((link) => link.userStoryId === firstAnalysis.generatedStories[0]?.id)));
      const persistedNonFunctionalRequirement = firstRequirements.find((requirement) => requirement.type === "NON_FUNCTIONAL");
      assert.equal(persistedNonFunctionalRequirement?.title, "Geral");
      assert.equal(persistedNonFunctionalRequirement?.description, firstPayload.data.result.nonFunctionalRequirements[0]?.description);

      const secondResponse = await generateRequirementsRoute(request(body, ownerCookie));
      assert.equal(secondResponse.status, 201);
      const secondPayload = await secondResponse.json() as { data: RequirementsGenerationResponse };
      assert.notEqual(secondPayload.data.analysisId, firstPayload.data.analysisId);
      assert.notDeepEqual(secondPayload.data.result.functionalRequirements.map((requirement) => requirement.code), firstPayload.data.result.functionalRequirements.map((requirement) => requirement.code));
      assert.equal(await prisma.aIAnalysis.count({ where: { projectId: project.id, promptVersion: "requirements-v2", status: "SUCCEEDED" } }), 2);
      assert.equal(await prisma.userStory.count({ where: { projectId: project.id, generatedByAnalysisId: { not: null } } }), 2);
      const allRequirementCodes = await prisma.requirement.findMany({ where: { projectId: project.id }, select: { code: true } });
      assert.equal(new Set(allRequirementCodes.map((requirement) => requirement.code)).size, allRequirementCodes.length);
      assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, action: "ANALYSIS_COMPLETED" } }), 2);

      let retryCalls = 0;
      const retryClient = {
        models: {
          async generateContent() {
            retryCalls += 1;
            if (retryCalls === 1) throw Object.assign(new Error("Falha transitória de teste."), { name: "ApiError", status: 503 });
            return {
              modelVersion: "fake-gemini-model",
              text: JSON.stringify({
                userStory: "Como aluno, quero consultar e reservar livros disponíveis, para encontrar obras para estudo.",
                functionalRequirements: ["O sistema deve permitir consultar os livros disponíveis."],
                nonFunctionalRequirements: ["A interface deve apresentar informações compreensíveis."],
                acceptanceCriteria: ["Quando houver livros disponíveis, o sistema deve apresentá-los ao aluno."],
              }),
            };
          },
        },
      } as unknown as Pick<GoogleGenAI, "models">;
      const retryingService = new AIService({
        providerFactory: () => new GeminiProvider({
          apiKey: "test-only-api-key",
          client: retryClient,
          model: "fake-gemini-model",
          wait: async () => undefined,
        }),
      });

      const retryResult = await retryingService.generateRequirements({ projectId: project.id, sessionId: session.id, userId: firstUser.id });
      assert.equal(retryCalls, 2);
      const retryAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({
        where: { id: retryResult.analysisId },
        include: { generatedStories: { include: { acceptanceCriteria: true } }, sessions: true },
      });
      assert.equal(retryAnalysis.status, "SUCCEEDED");
      assert.equal(retryAnalysis.sessions.length, 1);
      assert.equal(retryAnalysis.generatedStories.length, 1);
      assert.equal(retryAnalysis.generatedStories[0]?.acceptanceCriteria.length, 1);
      assert.equal(await prisma.aIAnalysis.count({ where: { id: retryResult.analysisId } }), 1);
      const retryRequirements = await prisma.requirement.findMany({
        where: { projectId: project.id, analysisSources: { some: { analysisId: retryResult.analysisId } } },
        include: { userStoryLinks: true },
      });
      assert.equal(retryRequirements.length, 2);
      assert.ok(retryRequirements.every((requirement) => requirement.userStoryLinks.length === 1));
      assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, entityId: retryResult.analysisId, action: "ANALYSIS_COMPLETED" } }), 1);

      const sessionWithoutAnswer = await prisma.elicitationSession.create({
        data: { projectId: project.id, createdById: firstUser.id, sequence: 2, context: "Sessão sem resposta inicial." },
      });
      assert.equal(
        (await generateRequirementsRoute(request({ projectId: project.id, sessionId: sessionWithoutAnswer.id }, ownerCookie))).status,
        400,
      );
    } finally {
      if (projectId) {
        await prisma.activityLog.deleteMany({ where: { projectId } });
        await prisma.requirement.deleteMany({ where: { projectId } });
        await prisma.userStory.deleteMany({ where: { projectId } });
        await prisma.aIAnalysis.deleteMany({ where: { projectId } });
        await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
        await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
        await prisma.elicitationSession.deleteMany({ where: { projectId } });
        await prisma.project.delete({ where: { id: projectId } });
      }
      if (firstUserId) await prisma.user.delete({ where: { id: firstUserId } });
      if (secondUserId) await prisma.user.delete({ where: { id: secondUserId } });
    }
  });
});
