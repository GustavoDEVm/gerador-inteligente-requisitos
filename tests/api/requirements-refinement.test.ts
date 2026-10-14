import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as generateRequirementsRoute } from "../../src/app/api/ai/generate-requirements/route";
import { executeRefineRequirements, POST as refineRequirementsRoute } from "../../src/app/api/ai/refine-requirements/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import { MOCK_MODEL, MockAIProvider } from "../../src/services/ai/providers/mock";
import { requirementsGenerationSchema, toProviderJsonSchema } from "../../src/services/ai/schemas";
import { createCriterion, deleteCriterion } from "../../src/services/user-stories";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "../../src/services/ai/types";
import type { RequirementsGenerationAIResult, RequirementsGenerationResponse } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function requirementsRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/generate-requirements", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function refinementRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/refine-requirements", {
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

test("MockAIProvider incorpora autenticação, estoque e tamanho/cor no refinamento", async () => {
  const provider = new MockAIProvider();
  const request: StructuredGenerationRequest<RequirementsGenerationAIResult> = {
    model: "",
    systemInstruction: "instrução de teste",
    userInput: JSON.stringify({
      initialElicitationAnswer: "Quero um sistema para uma loja de roupas com produtos, carrinho e pedidos.",
      refinementAnswers: [
        { question: "O cliente precisa estar autenticado para finalizar um pedido?", answer: "O cliente deve estar autenticado para finalizar o pedido." },
        { question: "Como atualizar o estoque?", answer: "O estoque deve ser reduzido automaticamente após a confirmação do pedido." },
        { question: "Como controlar variações?", answer: "Cada produto deve possuir combinações específicas de tamanho e cor, com estoque separado." },
      ],
      previousRequirements: { userStory: "Como cliente, quero realizar pedidos, para comprar roupas.", functionalRequirements: [], nonFunctionalRequirements: [], acceptanceCriteria: [] },
    }),
    responseJsonSchema: toProviderJsonSchema(requirementsGenerationSchema),
    metadata: { operation: "refine-requirements", promptVersion: "requirements-refinement-v1" },
  };

  const response = await provider.generateStructuredResponse(request);

  assert.equal(response.model, MOCK_MODEL);
  assert.equal(requirementsGenerationSchema.safeParse(response.output).success, true);
  assert.ok(response.output.functionalRequirements.includes("O sistema deve exigir que o cliente esteja autenticado para finalizar um pedido."));
  assert.ok(response.output.functionalRequirements.includes("O sistema deve permitir que o cliente autenticado finalize o pedido com os itens selecionados no carrinho."));
  assert.ok(response.output.acceptanceCriteria.includes("Quando um cliente não autenticado tentar finalizar um pedido, o sistema deve exigir sua autenticação antes da conclusão."));
  assert.ok(response.output.functionalRequirements.some((requirement) => /reduz.*automaticamente.*estoque|estoque.*reduz.*automaticamente/i.test(requirement)));
  assert.ok(response.output.functionalRequirements.some((requirement) => /tamanho e cor/i.test(requirement)));
});

test("o refinamento cria uma nova análise e preserva requisitos e fontes anteriores", async () => {
  const suffix = randomBytes(6).toString("hex");
  let projectId: string | undefined;
  const userIds: string[] = [];

  await withMockProvider(async () => {
    try {
      const [owner, otherUser] = await Promise.all([
        prisma.user.create({ data: { name: "Proprietária do refinamento", email: `refinement-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
        prisma.user.create({ data: { name: "Pessoa sem acesso", email: `refinement-other-${suffix}@example.test`, passwordHash: "test-only" } }),
      ]);
      userIds.push(owner.id, otherUser.id);
      const project = await prisma.project.create({
        data: {
          ownerId: owner.id,
          name: `Projeto de refinamento ${suffix}`,
          description: "Projeto temporário para validar o reprocessamento de requisitos.",
          objective: "Validar uma nova versão rastreável de requisitos.",
          context: "Teste automatizado.",
        },
      });
      projectId = project.id;
      const session = await prisma.elicitationSession.create({
        data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão de refinamento." },
      });
      const initialQuestion = await prisma.elicitationQuestion.create({
        data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" },
      });
      const initialAnswer = await prisma.elicitationAnswer.create({
        data: {
          questionId: initialQuestion.id,
          authorId: owner.id,
          version: 1,
          content: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.",
        },
      });
      const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
      const otherCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
      const body = { projectId: project.id, sessionId: session.id };

      const initialGenerationResponse = await generateRequirementsRoute(requirementsRequest(body, ownerCookie));
      assert.equal(initialGenerationResponse.status, 201);
      const initialGeneration = await initialGenerationResponse.json() as { data: RequirementsGenerationResponse };
      const initialRequirements = await prisma.requirement.findMany({
        where: { projectId: project.id, analysisSources: { some: { analysisId: initialGeneration.data.analysisId } } },
        select: { id: true, code: true },
      });
      assert.ok(initialRequirements.length > 0);
      const initialStory = await prisma.userStory.findFirstOrThrow({
        where: { projectId: project.id, generatedByAnalysisId: initialGeneration.data.analysisId },
      });
      const archivedCriterion = await createCriterion(initialStory.id, owner.id, {
        description: "Este critério arquivado não deve ser usado no refinamento.",
      });
      await deleteCriterion(archivedCriterion.id, owner.id);

      const ambiguityAnalysis = await prisma.aIAnalysis.create({
        data: {
          projectId: project.id,
          requestedById: owner.id,
          type: "AMBIGUITY_DETECTION",
          status: "SUCCEEDED",
          provider: "mock",
          model: MOCK_MODEL,
          promptVersion: "ambiguities-v1",
          promptText: "teste",
          inputSnapshot: {},
          structuredOutput: { ambiguities: [] },
          completedAt: new Date(),
        },
      });
      await prisma.aIAnalysisSession.create({ data: { analysisId: ambiguityAnalysis.id, sessionId: session.id } });
      const ambiguityDescriptions = [
        "Não está definido se o cliente precisa estar autenticado para finalizar um pedido.",
        "Não está definido como o estoque é atualizado após a confirmação do pedido.",
        "Não está definido como o estoque é controlado por tamanho e cor.",
      ];
      const ambiguities = await Promise.all(ambiguityDescriptions.map((description) => prisma.ambiguity.create({
        data: { projectId: project.id, generatedByAnalysisId: ambiguityAnalysis.id, description, severity: "MEDIUM" },
      })));

      const questionAnalysis = await prisma.aIAnalysis.create({
        data: {
          projectId: project.id,
          requestedById: owner.id,
          type: "QUESTION_GENERATION",
          status: "SUCCEEDED",
          provider: "mock",
          model: MOCK_MODEL,
          promptVersion: "refinement-questions-v1",
          promptText: "teste",
          inputSnapshot: {},
          structuredOutput: { questions: [] },
          completedAt: new Date(),
        },
      });
      await prisma.aIAnalysisSession.create({ data: { analysisId: questionAnalysis.id, sessionId: session.id } });
      const refinementQuestions = await Promise.all([
        "O cliente precisa estar autenticado para finalizar um pedido?",
        "Como o estoque deve ser atualizado após a confirmação do pedido?",
        "Como devem ser controladas as combinações de tamanho e cor?",
      ].map((content, index) => prisma.elicitationQuestion.create({
        data: {
          sessionId: session.id,
          position: index + 2,
          content,
          source: "AI",
          generatedByAnalysisId: questionAnalysis.id,
        },
      })));
      await prisma.aIAnalysis.update({
        where: { id: questionAnalysis.id },
        data: {
          structuredOutput: {
            questions: refinementQuestions.map((question, index) => ({
              questionId: question.id,
              ambiguityId: ambiguities[index]!.id,
              question: question.content,
              reason: "Teste de rastreabilidade.",
              ambiguity: { description: ambiguities[index]!.description, severity: "medium", context: null },
            })),
          },
        },
      });
      const refinementAnswers = await Promise.all([
        "sim",
        "O estoque deve ser reduzido automaticamente após a confirmação do pedido, considerando a combinação específica de tamanho e cor.",
        "Cada produto deve possuir combinações específicas de tamanho e cor, e o estoque deve ser controlado separadamente para cada combinação.",
      ].map((content, index) => prisma.elicitationAnswer.create({
        data: { questionId: refinementQuestions[index]!.id, authorId: owner.id, version: 1, content },
      })));

      assert.equal((await refineRequirementsRoute(refinementRequest(body))).status, 401);
      assert.equal((await refineRequirementsRoute(refinementRequest(body, otherCookie))).status, 403);
      let providerInput = "";
      const incompleteProvider: AIProvider = {
        name: "incomplete-refinement-test",
        async generateStructuredResponse<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResponse<T>> {
          providerInput = request.userInput;
          return {
            output: {
              userStory: "Como cliente, quero escolher produtos e realizar pedidos, para comprar roupas.",
              functionalRequirements: [
                "O sistema deve apresentar combinações disponíveis de tamanho e cor.",
                "O sistema deve reduzir automaticamente o estoque após a confirmação do pedido.",
              ],
              nonFunctionalRequirements: ["A interface deve apresentar informações claras ao cliente."],
              acceptanceCriteria: ["Quando um pedido for confirmado, o sistema deve atualizar o estoque correspondente."],
            } as T,
            model: "incomplete-test-model",
          };
        },
      };
      const refinementResponse = await executeRefineRequirements(
        refinementRequest(body, ownerCookie),
        new AIService({ providerFactory: () => incompleteProvider }),
      );
      assert.equal(refinementResponse.status, 201);
      const refinementPayload = await refinementResponse.json() as { data: RequirementsGenerationResponse };
      assert.notEqual(refinementPayload.data.analysisId, initialGeneration.data.analysisId);
      assert.ok(refinementPayload.data.result.functionalRequirements.some((requirement) => requirement.description === "O sistema deve exigir que o cliente esteja autenticado para finalizar um pedido."));
      assert.ok(refinementPayload.data.result.functionalRequirements.some((requirement) => requirement.description === "O sistema deve permitir que o cliente autenticado finalize o pedido com os itens selecionados no carrinho."));
      assert.ok(refinementPayload.data.result.acceptanceCriteria.some((criterion) => criterion.description === "Quando um cliente não autenticado tentar finalizar um pedido, o sistema deve exigir sua autenticação antes da conclusão."));
      assert.ok(refinementPayload.data.result.functionalRequirements.some((requirement) => /estoque/i.test(requirement.description)));
      assert.ok(refinementPayload.data.result.functionalRequirements.some((requirement) => /tamanho e cor/i.test(requirement.description)));
      const providerPayload = JSON.parse(providerInput) as {
        refinementAnswers: { question: string; answer: string }[];
        previousRequirements: { acceptanceCriteria: string[] };
      };
      const authenticationAnswer = providerPayload.refinementAnswers.find((answer) => /autenticado.*finalizar.*pedido/i.test(answer.question));
      assert.equal(authenticationAnswer?.question, "O cliente precisa estar autenticado para finalizar um pedido?");
      assert.equal(authenticationAnswer?.answer, "sim");
      assert.equal(providerPayload.previousRequirements.acceptanceCriteria.includes("Este critério arquivado não deve ser usado no refinamento."), false);

      const refinedAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: refinementPayload.data.analysisId } });
      assert.equal(refinedAnalysis.type, "REFINEMENT");
      assert.equal(refinedAnalysis.status, "SUCCEEDED");
      assert.equal(refinedAnalysis.promptVersion, "requirements-refinement-v1");
      assert.equal(refinedAnalysis.provider, "incomplete-refinement-test");
      assert.equal(refinedAnalysis.model, "incomplete-test-model");
      assert.deepEqual(refinedAnalysis.structuredOutput, refinementPayload.data.result);
      assert.equal((refinedAnalysis.inputSnapshot as { refinementQuestionAnalysisId?: string }).refinementQuestionAnalysisId, questionAnalysis.id);

      const refinedRequirements = await prisma.requirement.findMany({
        where: { projectId: project.id, analysisSources: { some: { analysisId: refinedAnalysis.id } } },
        include: { answerSources: true },
      });
      assert.equal(await prisma.requirement.count({ where: { id: { in: initialRequirements.map((requirement) => requirement.id) } } }), initialRequirements.length);
      assert.ok(refinedRequirements.length > 0);
      const expectedSourceAnswerIds = new Set([initialAnswer.id, ...refinementAnswers.map((answer) => answer.id)]);
      assert.ok(refinedRequirements.every((requirement) => (
        [...expectedSourceAnswerIds].every((answerId) => requirement.answerSources.some((source) => source.answerId === answerId))
      )));
      assert.ok(refinedRequirements.every((requirement) => !initialRequirements.some((initial) => initial.code === requirement.code)));
      assert.equal(await prisma.userStory.count({ where: { projectId: project.id } }), 2);
    } finally {
      if (projectId) {
        await prisma.activityLog.deleteMany({ where: { projectId } });
        await prisma.requirement.deleteMany({ where: { projectId } });
        await prisma.userStory.deleteMany({ where: { projectId } });
        await prisma.ambiguity.deleteMany({ where: { projectId } });
        await prisma.aIAnalysis.deleteMany({ where: { projectId } });
        await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
        await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
        await prisma.elicitationSession.deleteMany({ where: { projectId } });
        await prisma.project.delete({ where: { id: projectId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });
});
