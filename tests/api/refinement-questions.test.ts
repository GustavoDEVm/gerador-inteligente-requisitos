import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { executeGenerateRefinementQuestions, POST as generateRefinementQuestionsRoute } from "../../src/app/api/ai/generate-refinement-questions/route";
import { POST as appendAnswerRoute } from "../../src/app/api/questions/[id]/answers/route";
import { refinementQuestionsFromItems } from "../../src/components/elicitation/elicitation-session";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import { AIProviderError } from "../../src/services/ai/errors";
import { listQuestions } from "../../src/services/elicitation";
import { MOCK_MODEL, MockAIProvider } from "../../src/services/ai/providers/mock";
import { refinementQuestionsSchema, toProviderJsonSchema } from "../../src/services/ai/schemas";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "../../src/services/ai/types";
import type { RefinementQuestionAIResult, RefinementQuestionsResponse } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

const unknownAmbiguityId = "00000000-0000-4000-8000-000000000099";

function refinementRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/generate-refinement-questions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function answerRequest(content: string, cookie: string) {
  return new Request("http://localhost/api/questions/question-id/answers", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ content }),
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

async function createDetectedAmbiguity({
  projectId,
  sessionId,
  description,
  severity = "MEDIUM",
}: {
  projectId: string;
  sessionId: string;
  description: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
}) {
  const analysis = await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "AMBIGUITY_DETECTION",
      status: "SUCCEEDED",
      provider: "mock",
      model: MOCK_MODEL,
      promptVersion: "ambiguities-v1",
      promptText: "prompt de teste",
      inputSnapshot: { input: "resposta de teste" },
      structuredOutput: {
        ambiguities: [{
          description,
          severity: severity.toLocaleLowerCase("en-US"),
          context: "Trecho da resposta que precisa de esclarecimento.",
        }],
      },
    },
  });
  await prisma.aIAnalysisSession.create({ data: { analysisId: analysis.id, sessionId } });
  return prisma.ambiguity.create({ data: { projectId, generatedByAnalysisId: analysis.id, description, severity } });
}

async function createDetectedAmbiguities({
  projectId,
  sessionId,
  ambiguities,
}: {
  projectId: string;
  sessionId: string;
  ambiguities: { description: string; severity: "LOW" | "MEDIUM" | "HIGH" }[];
}) {
  const analysis = await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "AMBIGUITY_DETECTION",
      status: "SUCCEEDED",
      provider: "mock",
      model: MOCK_MODEL,
      promptVersion: "ambiguities-v1",
      promptText: "prompt de teste",
      inputSnapshot: { input: "resposta de teste" },
      structuredOutput: {
        ambiguities: ambiguities.map((ambiguity) => ({
          description: ambiguity.description,
          severity: ambiguity.severity.toLocaleLowerCase("en-US"),
          context: "Trecho da resposta que precisa de esclarecimento.",
        })),
      },
    },
  });
  await prisma.aIAnalysisSession.create({ data: { analysisId: analysis.id, sessionId } });
  const persistedAmbiguities = await Promise.all(ambiguities.map((ambiguity) => prisma.ambiguity.create({
    data: { projectId, generatedByAnalysisId: analysis.id, ...ambiguity },
  })));
  return { analysis, ambiguities: persistedAmbiguities };
}

async function deleteTestData(projectIds: string[], userIds: string[]) {
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

test("o contrato e o MockAIProvider geram perguntas determinísticas para uma, várias ou nenhuma ambiguidade", async () => {
  const firstAmbiguityId = "00000000-0000-4000-8000-000000000001";
  const secondAmbiguityId = "00000000-0000-4000-8000-000000000002";
  const valid: RefinementQuestionAIResult = {
    questions: [{ ambiguityId: firstAmbiguityId, question: "Como a regra deve funcionar?", reason: "A regra ainda está indefinida." }],
  };
  assert.equal(refinementQuestionsSchema.safeParse(valid).success, true);
  assert.equal(refinementQuestionsSchema.safeParse({ questions: [{ ...valid.questions[0], ambiguityId: "invalido" }] }).success, false);
  assert.equal(refinementQuestionsSchema.safeParse({ questions: [{ ambiguityId: firstAmbiguityId, question: "Pergunta", reason: "" }] }).success, false);

  const provider = new MockAIProvider();
  const baseRequest: StructuredGenerationRequest<RefinementQuestionAIResult> = {
    model: "",
    systemInstruction: "instrução de teste",
    userInput: JSON.stringify({
      elicitationAnswer: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.",
      ambiguities: [{ id: firstAmbiguityId, description: "Não está definido como o estoque é atualizado após um pedido." }],
    }),
    responseJsonSchema: toProviderJsonSchema(refinementQuestionsSchema),
    metadata: { operation: "generate-refinement-questions" },
  };
  const one = await provider.generateStructuredResponse(baseRequest);
  const multiple = await provider.generateStructuredResponse({
    ...baseRequest,
    userInput: JSON.stringify({
      elicitationAnswer: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.",
      ambiguities: [
        { id: firstAmbiguityId, description: "Não está definido se o cliente precisa estar autenticado para realizar um pedido." },
        { id: secondAmbiguityId, description: "Não está definido como funciona a combinação de tamanho e cor de cada produto." },
      ],
    }),
  });
  const none = await provider.generateStructuredResponse({ ...baseRequest, userInput: JSON.stringify({ elicitationAnswer: "Descrição", ambiguities: [] }) });

  assert.equal(one.model, MOCK_MODEL);
  assert.deepEqual(one, await provider.generateStructuredResponse(baseRequest));
  assert.equal(one.output.questions.length, 1);
  assert.deepEqual(multiple.output.questions.map((question) => question.ambiguityId), [firstAmbiguityId, secondAmbiguityId]);
  assert.deepEqual(multiple.output.questions.map((question) => question.question), [
    "O cliente precisa estar autenticado para finalizar um pedido?",
    "Como devem ser cadastradas e controladas as combinações de tamanho e cor de cada produto?",
  ]);
  assert.doesNotMatch(JSON.stringify(multiple.output), /\b(aluno|livro|acervo|reserva)\b/i);
  assert.deepEqual(none.output, { questions: [] });
});

test("o painel de refinamento seleciona somente três perguntas da terceira execução", () => {
  function executionItems(analysisId: string, execution: "A" | "B" | "C", position: number) {
    return Array.from({ length: 3 }, (_, index) => {
      const questionId = `question-${execution}-${index + 1}`;
      return {
        id: questionId,
        position: position + index,
        content: `Pergunta da execução ${execution}-${index + 1}`,
        guidance: "A regra precisa ser definida.",
        source: "AI" as const,
        generatedByAnalysis: {
          id: analysisId,
          structuredOutput: {
            questions: [{
              questionId,
              ambiguityId: `ambiguity-${execution}-${index + 1}`,
              question: `Pergunta da execução ${execution}-${index + 1}`,
              reason: "A regra precisa ser definida.",
              ambiguity: { description: `Ambiguidade da execução ${execution}-${index + 1}`, severity: "medium", context: null },
            }],
          },
        },
        answers: execution === "A" ? [{ id: `answer-${index + 1}`, version: 1, content: "Resposta histórica." }] : [],
      };
    });
  }

  const analysisA = "analysis-a";
  const analysisB = "analysis-b";
  const analysisC = "analysis-c";
  const refinementItems = [
    ...executionItems(analysisA, "A", 2),
    ...executionItems(analysisB, "B", 5),
    ...executionItems(analysisC, "C", 8),
  ] as Parameters<typeof refinementQuestionsFromItems>[0];

  const latestQuestions = refinementQuestionsFromItems(refinementItems);
  const explicitlySelectedQuestions = refinementQuestionsFromItems(refinementItems, analysisC);

  assert.equal(latestQuestions.length, 3);
  assert.equal(explicitlySelectedQuestions.length, 3);
  assert.ok(latestQuestions.every((question) => question.questionId.startsWith("question-C-")));
  assert.ok(explicitlySelectedQuestions.every((question) => question.questionId.startsWith("question-C-")));
  assert.equal(latestQuestions.filter((question) => question.answers.length > 0).length, 0);
});

test("a API preserva ownership, histórico, vínculo de origem e respostas versionadas", async () => {
  const suffix = randomBytes(6).toString("hex");
  const projectIds: string[] = [];
  const userIds: string[] = [];

  await withMockProvider(async () => {
    try {
      const [owner, otherUser] = await Promise.all([
        prisma.user.create({ data: { name: "Proprietário de refinamento", email: `refinement-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
        prisma.user.create({ data: { name: "Outro usuário de refinamento", email: `refinement-other-${suffix}@example.test`, passwordHash: "test-only" } }),
      ]);
      userIds.push(owner.id, otherUser.id);
      const [project, secondProject, foreignProject] = await Promise.all([
        prisma.project.create({ data: { ownerId: owner.id, name: `Projeto de refinamento ${suffix}`, description: "Projeto temporário para perguntas de refinamento.", objective: "Validar fluxo de esclarecimento.", context: "Teste automatizado." } }),
        prisma.project.create({ data: { ownerId: owner.id, name: `Segundo projeto ${suffix}`, description: "Projeto temporário para autorização.", objective: "Validar sessão cruzada.", context: "Teste automatizado." } }),
        prisma.project.create({ data: { ownerId: otherUser.id, name: `Projeto de outro usuário ${suffix}`, description: "Projeto protegido de outro usuário.", objective: "Validar isolamento.", context: "Teste automatizado." } }),
      ]);
      projectIds.push(project.id, secondProject.id, foreignProject.id);
      const [session, sessionWithoutAnswer, sessionFromSecondProject, foreignSession] = await Promise.all([
        prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão principal de refinamento." } }),
        prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 2, context: "Sessão sem resposta inicial." } }),
        prisma.elicitationSession.create({ data: { projectId: secondProject.id, createdById: owner.id, sequence: 1, context: "Sessão em outro projeto." } }),
        prisma.elicitationSession.create({ data: { projectId: foreignProject.id, createdById: otherUser.id, sequence: 1, context: "Sessão não autorizada." } }),
      ]);
      const question = await prisma.elicitationQuestion.create({ data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" } });
      await prisma.elicitationQuestion.create({ data: { sessionId: sessionWithoutAnswer.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" } });
      const initialAnswer = await prisma.elicitationAnswer.create({
        data: { questionId: question.id, authorId: owner.id, version: 1, content: "Quero um sistema para uma clínica onde pacientes possam marcar e cancelar consultas." },
      });
      const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
      const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
      const body = { projectId: project.id, sessionId: session.id };

      assert.equal((await generateRefinementQuestionsRoute(refinementRequest(body))).status, 401);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ ...body, input: "não permitido" }, ownerCookie))).status, 400);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ ...body, projectId: "00000000-0000-4000-8000-000000000011" }, ownerCookie))).status, 404);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ projectId: foreignProject.id, sessionId: foreignSession.id }, ownerCookie))).status, 403);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ ...body, sessionId: "00000000-0000-4000-8000-000000000012" }, ownerCookie))).status, 404);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ ...body, sessionId: sessionFromSecondProject.id }, ownerCookie))).status, 400);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest({ ...body, sessionId: sessionWithoutAnswer.id }, ownerCookie))).status, 400);
      assert.equal((await generateRefinementQuestionsRoute(refinementRequest(body, otherUserCookie))).status, 403);

      const noAmbiguitiesResponse = await generateRefinementQuestionsRoute(refinementRequest(body, ownerCookie));
      assert.equal(noAmbiguitiesResponse.status, 201);
      const noAmbiguitiesPayload = await noAmbiguitiesResponse.json() as { data: RefinementQuestionsResponse };
      assert.deepEqual(noAmbiguitiesPayload.data.result, { questions: [] });
      const noAmbiguitiesAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: noAmbiguitiesPayload.data.analysisId } });
      assert.equal(noAmbiguitiesAnalysis.type, "QUESTION_GENERATION");
      assert.equal(noAmbiguitiesAnalysis.status, "SUCCEEDED");
      assert.equal(noAmbiguitiesAnalysis.provider, "not-invoked");

      const firstAmbiguity = await createDetectedAmbiguity({
        projectId: project.id,
        sessionId: session.id,
        description: "Não está definido até quando o paciente poderá cancelar uma consulta.",
        severity: "HIGH",
      });
      await createDetectedAmbiguity({
        projectId: project.id,
        sessionId: sessionWithoutAnswer.id,
        description: "Esta ambiguidade pertence a outra sessão e não deve ser usada.",
      });

      const firstResponse = await generateRefinementQuestionsRoute(refinementRequest(body, ownerCookie));
      assert.equal(firstResponse.status, 201);
      const firstPayload = await firstResponse.json() as { data: RefinementQuestionsResponse };
      assert.equal(firstPayload.data.result.questions.length, 1);
      assert.equal(firstPayload.data.result.questions[0]?.ambiguityId, firstAmbiguity.id);
      assert.equal(firstPayload.data.result.questions[0]?.ambiguity.severity, "high");

      const firstAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({
        where: { id: firstPayload.data.analysisId },
        include: { generatedQuestions: true, sessions: true },
      });
      assert.equal(firstAnalysis.type, "QUESTION_GENERATION");
      assert.equal(firstAnalysis.status, "SUCCEEDED");
      assert.equal(firstAnalysis.provider, "mock");
      assert.equal(firstAnalysis.model, MOCK_MODEL);
      assert.equal(firstAnalysis.promptVersion, "refinement-questions-v1");
      assert.equal(firstAnalysis.sessions[0]?.sessionId, session.id);
      assert.deepEqual(firstAnalysis.inputSnapshot, {
        elicitationAnswer: initialAnswer.content,
        sessionId: session.id,
        sourceAnswerId: initialAnswer.id,
        ambiguities: [{
          id: firstAmbiguity.id,
          description: firstAmbiguity.description,
          severity: "high",
          context: "Trecho da resposta que precisa de esclarecimento.",
        }],
      });
      assert.deepEqual(firstAnalysis.structuredOutput, firstPayload.data.result);
      assert.equal(firstAnalysis.generatedQuestions.length, 1);
      assert.equal(firstAnalysis.generatedQuestions[0]?.source, "AI");
      assert.equal(firstAnalysis.generatedQuestions[0]?.generatedByAnalysisId, firstAnalysis.id);
      assert.equal(firstAnalysis.generatedQuestions[0]?.sessionId, session.id);

      const secondAmbiguity = await createDetectedAmbiguity({
        projectId: project.id,
        sessionId: session.id,
        description: "Não está definido como a disponibilidade do horário será atualizada.",
        severity: "MEDIUM",
      });
      const secondResponse = await generateRefinementQuestionsRoute(refinementRequest(body, ownerCookie));
      assert.equal(secondResponse.status, 201);
      const secondPayload = await secondResponse.json() as { data: RefinementQuestionsResponse };
      assert.deepEqual(new Set(secondPayload.data.result.questions.map((questionResult) => questionResult.ambiguityId)), new Set([secondAmbiguity.id]));
      assert.equal(await prisma.aIAnalysis.count({ where: { projectId: project.id, type: "QUESTION_GENERATION", status: "SUCCEEDED" } }), 3);
      assert.equal(await prisma.elicitationQuestion.count({ where: { sessionId: session.id, source: "AI" } }), 2);
      const visibleQuestions = await listQuestions(session.id, owner.id);
      assert.deepEqual(
        visibleQuestions.filter((item) => item.source === "AI").map((item) => item.generatedByAnalysisId),
        [secondPayload.data.analysisId],
      );

      const generatedQuestionId = firstPayload.data.result.questions[0]!.questionId;
      const firstAnswerResponse = await appendAnswerRoute(answerRequest("O paciente pode cancelar até duas horas antes da consulta.", ownerCookie), { params: Promise.resolve({ id: generatedQuestionId }) });
      assert.equal(firstAnswerResponse.status, 201);
      const secondAnswerResponse = await appendAnswerRoute(answerRequest("O paciente pode cancelar até uma hora antes da consulta.", ownerCookie), { params: Promise.resolve({ id: generatedQuestionId }) });
      assert.equal(secondAnswerResponse.status, 201);
      const answerVersions = await prisma.elicitationAnswer.findMany({ where: { questionId: generatedQuestionId }, orderBy: { version: "asc" } });
      assert.deepEqual(answerVersions.map((answer) => [answer.version, answer.content]), [
        [1, "O paciente pode cancelar até duas horas antes da consulta."],
        [2, "O paciente pode cancelar até uma hora antes da consulta."],
      ]);
    } finally {
      await deleteTestData(projectIds, userIds);
    }
  });
});

test("três execuções históricas preservam nove perguntas e carregam somente as três da última", async () => {
  const suffix = randomBytes(6).toString("hex");
  const projectIds: string[] = [];
  const userIds: string[] = [];

  await withMockProvider(async () => {
    try {
      const owner = await prisma.user.create({ data: { name: "Proprietário do painel de refinamento", email: `refinement-panel-${suffix}@example.test`, passwordHash: "test-only" } });
      userIds.push(owner.id);
      const project = await prisma.project.create({ data: { ownerId: owner.id, name: `Projeto de painel ${suffix}`, description: "Projeto temporário para validar o painel de refinamento.", objective: "Isolar a execução mais recente.", context: "Teste automatizado." } });
      projectIds.push(project.id);
      const session = await prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão para três execuções de refinamento." } });
      const initialQuestion = await prisma.elicitationQuestion.create({ data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" } });
      await prisma.elicitationAnswer.create({ data: { questionId: initialQuestion.id, authorId: owner.id, version: 1, content: "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos." } });
      const cookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
      const body = { projectId: project.id, sessionId: session.id };

      const firstDetection = await createDetectedAmbiguities({
        projectId: project.id,
        sessionId: session.id,
        ambiguities: [
          { description: "Não está definido quem pode solicitar uma reserva.", severity: "HIGH" },
          { description: "Não está definido quando uma reserva expira.", severity: "MEDIUM" },
          { description: "Não está definido como o usuário recebe notificações.", severity: "LOW" },
        ],
      });
      const firstGenerationResponse = await generateRefinementQuestionsRoute(refinementRequest(body, cookie));
      assert.equal(firstGenerationResponse.status, 201);
      const firstGeneration = await firstGenerationResponse.json() as { data: RefinementQuestionsResponse };
      assert.equal(firstGeneration.data.result.questions.length, 3);

      const secondDetection = await createDetectedAmbiguities({
        projectId: project.id,
        sessionId: session.id,
        ambiguities: [
          { description: "Não está definido como o estoque é atualizado após um pedido.", severity: "HIGH" },
          { description: "Não está definido se o cliente precisa estar autenticado para realizar um pedido.", severity: "MEDIUM" },
          { description: "Não está definido como funciona a combinação de tamanho e cor de cada produto.", severity: "LOW" },
        ],
      });
      const secondGenerationResponse = await generateRefinementQuestionsRoute(refinementRequest(body, cookie));
      assert.equal(secondGenerationResponse.status, 201);
      const secondGeneration = await secondGenerationResponse.json() as { data: RefinementQuestionsResponse };
      assert.equal(secondGeneration.data.result.questions.length, 3);

      const thirdDetection = await createDetectedAmbiguities({
        projectId: project.id,
        sessionId: session.id,
        ambiguities: [
          { description: "Não está definido como o estoque é atualizado após um pedido finalizado.", severity: "HIGH" },
          { description: "Não está definido se o cliente precisa estar autenticado para finalizar um pedido.", severity: "MEDIUM" },
          { description: "Não está definido como a combinação de tamanho e cor é exibida para o cliente.", severity: "LOW" },
        ],
      });
      const thirdGenerationResponse = await generateRefinementQuestionsRoute(refinementRequest(body, cookie));
      assert.equal(thirdGenerationResponse.status, 201);
      const thirdGeneration = await thirdGenerationResponse.json() as { data: RefinementQuestionsResponse };
      assert.equal(thirdGeneration.data.result.questions.length, 3);
      assert.deepEqual(
        new Set(thirdGeneration.data.result.questions.map((question) => question.ambiguityId)),
        new Set(thirdDetection.ambiguities.map((ambiguity) => ambiguity.id)),
      );

      const persistedQuestions = await prisma.elicitationQuestion.findMany({
        where: { sessionId: session.id, source: "AI" },
        select: { generatedByAnalysisId: true },
      });
      assert.equal(persistedQuestions.length, 9);
      assert.deepEqual(
        new Set(persistedQuestions.map((question) => question.generatedByAnalysisId)),
        new Set([firstGeneration.data.analysisId, secondGeneration.data.analysisId, thirdGeneration.data.analysisId]),
      );

      const visibleQuestions = await listQuestions(session.id, owner.id);
      const visibleRefinementQuestions = visibleQuestions.filter((question) => question.source === "AI");
      assert.equal(visibleRefinementQuestions.length, 3);
      assert.ok(visibleRefinementQuestions.every((question) => question.generatedByAnalysisId === thirdGeneration.data.analysisId));
      assert.ok(visibleRefinementQuestions.every((question) => question.answers.length === 0));
      assert.notEqual(firstDetection.analysis.id, secondDetection.analysis.id);
    } finally {
      await deleteTestData(projectIds, userIds);
    }
  });
});

test("a geração deduplica perguntas e registra resposta inválida e indisponibilidade do provider", async () => {
  const suffix = randomBytes(6).toString("hex");
  const projectIds: string[] = [];
  const userIds: string[] = [];

  try {
    const user = await prisma.user.create({ data: { name: "Usuário de falhas", email: `refinement-errors-${suffix}@example.test`, passwordHash: "test-only" } });
    userIds.push(user.id);
    const project = await prisma.project.create({ data: { ownerId: user.id, name: `Projeto de falhas ${suffix}`, description: "Projeto temporário para falhas de refinamento.", objective: "Validar erros controlados.", context: "Teste automatizado." } });
    projectIds.push(project.id);
    const session = await prisma.elicitationSession.create({ data: { projectId: project.id, createdById: user.id, sequence: 1, context: "Sessão de falhas." } });
    const question = await prisma.elicitationQuestion.create({ data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial.", source: "TEMPLATE" } });
    await prisma.elicitationAnswer.create({ data: { questionId: question.id, authorId: user.id, version: 1, content: "Quero um sistema para controlar reservas de salas de reunião." } });
    const ambiguity = await createDetectedAmbiguity({ projectId: project.id, sessionId: session.id, description: "Não está definido quem aprova reservas." });
    const cookie = `${sessionCookieName}=${await encryptSession({ userId: user.id })}`;
    const body = { projectId: project.id, sessionId: session.id };

    const duplicateProvider: AIProvider = {
      name: "duplicate-test-provider",
      async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
        return {
          output: {
            questions: [
              { ambiguityId: ambiguity.id, question: "Quem deve aprovar a reserva?", reason: "A responsabilidade precisa ser definida." },
              { ambiguityId: ambiguity.id, question: "Quem confirma a reserva?", reason: "A responsabilidade precisa ser definida." },
            ],
          } as T,
          model: "duplicate-model",
        };
      },
    };
    const duplicateResponse = await executeGenerateRefinementQuestions(refinementRequest(body, cookie), new AIService({ providerFactory: () => duplicateProvider }));
    assert.equal(duplicateResponse.status, 201);
    const duplicatePayload = await duplicateResponse.json() as { data: RefinementQuestionsResponse };
    assert.equal(duplicatePayload.data.result.questions.length, 1);
    assert.equal(await prisma.elicitationQuestion.count({ where: { sessionId: session.id, source: "AI" } }), 1);

    const invalidProvider: AIProvider = {
      name: "invalid-test-provider",
      async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
        return { output: { questions: [{ ambiguityId: unknownAmbiguityId, question: "Pergunta inválida?", reason: "Teste" }] } as T, model: "invalid-model" };
      },
    };
    const invalidResponse = await executeGenerateRefinementQuestions(refinementRequest(body, cookie), new AIService({ providerFactory: () => invalidProvider }));
    assert.equal(invalidResponse.status, 422);

    const unavailableProvider: AIProvider = {
      name: "unavailable-test-provider",
      async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
        throw new AIProviderError("AI_TIMEOUT");
      },
    };
    const unavailableResponse = await executeGenerateRefinementQuestions(refinementRequest(body, cookie), new AIService({ providerFactory: () => unavailableProvider }));
    assert.equal(unavailableResponse.status, 504);

    const failedAnalyses = await prisma.aIAnalysis.findMany({ where: { projectId: project.id, type: "QUESTION_GENERATION", status: { not: "SUCCEEDED" } }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(failedAnalyses.map((analysis) => [analysis.status, analysis.errorCode]), [["INVALID_RESPONSE", "AI_INVALID_RESPONSE"], ["FAILED", "AI_TIMEOUT"]]);
    assert.equal(await prisma.elicitationQuestion.count({ where: { sessionId: session.id, source: "AI" } }), 1);
  } finally {
    await deleteTestData(projectIds, userIds);
  }
});
