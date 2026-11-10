import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import { AIProviderError } from "../../src/services/ai/errors";
import { MockAIProvider } from "../../src/services/ai/providers/mock";
import { appendAnswer, getSession, listQuestions } from "../../src/services/elicitation";

test("a detecção atual usa a última descrição da sessão, preserva o histórico e isola perguntas obsoletas", async () => {
  const suffix = randomBytes(6).toString("hex");
  let projectId: string | undefined;
  let userId: string | undefined;

  const clothingDescription = "Sistema web para uma loja de roupas, com produtos, tamanhos, cores, estoque, carrinho e pedidos.";
  const schoolDescription = "Sistema web para gerenciamento de tarefas escolares, permitindo cadastrar atividades, atribuir responsáveis e acompanhar prazos e entregas.";
  const completeDescription = "Os requisitos completos e sem ambiguidades foram validados para o gerenciamento de tarefas escolares.";

  try {
    const owner = await prisma.user.create({
      data: { name: "Pessoa proprietária do contexto", email: `ambiguity-context-${suffix}@example.test`, passwordHash: "test-only" },
    });
    userId = owner.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de contexto ${suffix}`,
        description: "Projeto temporário para validar contexto e atualização das ambiguidades.",
        objective: "Manter a análise atual vinculada à última resposta da sessão.",
        context: "Teste automatizado.",
      },
    });
    projectId = project.id;
    const [firstSession, secondSession] = await Promise.all([
      prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão que muda de domínio." } }),
      prisma.elicitationSession.create({ data: { projectId: project.id, createdById: owner.id, sequence: 2, context: "Sessão isolada de loja." } }),
    ]);
    const [firstQuestion, secondQuestion] = await Promise.all([
      prisma.elicitationQuestion.create({ data: { sessionId: firstSession.id, position: 1, content: "Descreva a necessidade inicial.", source: "TEMPLATE" } }),
      prisma.elicitationQuestion.create({ data: { sessionId: secondSession.id, position: 1, content: "Descreva a necessidade inicial.", source: "TEMPLATE" } }),
    ]);
    await prisma.elicitationAnswer.create({
      data: { questionId: firstQuestion.id, authorId: owner.id, version: 1, content: clothingDescription },
    });
    await prisma.elicitationAnswer.create({
      data: { questionId: secondQuestion.id, authorId: owner.id, version: 1, content: clothingDescription },
    });

    const service = new AIService({ providerFactory: () => new MockAIProvider() });
    const clothingDetection = await service.detectAmbiguities({ projectId: project.id, sessionId: firstSession.id, userId: owner.id });
    assert.ok(clothingDetection.result.ambiguities.some((ambiguity) => /estoque/i.test(ambiguity.description)));
    assert.ok(clothingDetection.result.ambiguities.every((ambiguity) => ambiguity.context === clothingDescription));

    const firstQuestions = await service.generateRefinementQuestions({ projectId: project.id, sessionId: firstSession.id, userId: owner.id });
    assert.equal(firstQuestions.result.questions.length, 3);
    const obsoleteQuestion = firstQuestions.result.questions[0]!;
    await appendAnswer(obsoleteQuestion.questionId, owner.id, { content: "RESPOSTA-OBSOLETA-DA-LOJA-NAO-PODE-CONTAMINAR-A-NOVA-IDEIA" });

    const latestInitialAnswer = await appendAnswer(firstQuestion.id, owner.id, { content: schoolDescription });
    assert.equal(latestInitialAnswer.version, 2);

    const schoolDetection = await service.detectAmbiguities({ projectId: project.id, sessionId: firstSession.id, userId: owner.id });
    assert.ok(schoolDetection.result.ambiguities.some((ambiguity) => /tarefas|alunos|professores|prazos|entregas/i.test(ambiguity.description)));
    assert.doesNotMatch(JSON.stringify(schoolDetection.result), /\b(estoque|cliente|tamanho|cor|carrinho|pedido)\b/i);
    assert.ok(schoolDetection.result.ambiguities.every((ambiguity) => ambiguity.context === schoolDescription));

    const schoolAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: schoolDetection.analysisId } });
    assert.deepEqual(schoolAnalysis.inputSnapshot, {
      sessionId: firstSession.id,
      sourceAnswerId: latestInitialAnswer.id,
      sourceAnswerVersion: 2,
      input: schoolDescription,
    });
    assert.deepEqual(schoolAnalysis.structuredOutput, schoolDetection.result);

    const currentAfterSchoolDetection = await getSession(firstSession.id, owner.id);
    assert.equal(currentAfterSchoolDetection.currentAmbiguityAnalysisId, schoolDetection.analysisId);
    assert.equal(currentAfterSchoolDetection.currentRefinementQuestionAnalysisId, null);
    const questionsAfterSchoolDetection = await listQuestions(firstSession.id, owner.id);
    assert.deepEqual(questionsAfterSchoolDetection.filter((question) => question.source === "AI"), []);

    const schoolQuestions = await service.generateRefinementQuestions({ projectId: project.id, sessionId: firstSession.id, userId: owner.id });
    const schoolQuestionAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: schoolQuestions.analysisId } });
    const previousAnswers = (schoolQuestionAnalysis.inputSnapshot as { previousAnswers?: { answer: string }[] }).previousAnswers ?? [];
    assert.equal(previousAnswers.some((answer) => answer.answer.includes("RESPOSTA-OBSOLETA-DA-LOJA")), false);
    const questionsAfterGeneration = await listQuestions(firstSession.id, owner.id);
    assert.deepEqual(
      questionsAfterGeneration.filter((question) => question.source === "AI").map((question) => question.id),
      schoolQuestions.result.questions.map((question) => question.questionId),
    );

    const failingService = new AIService({
      providerFactory: () => ({
        name: "failing-context-test",
        async generateStructuredResponse() {
          throw new AIProviderError("AI_TIMEOUT");
        },
      }),
    });
    await assert.rejects(
      failingService.detectAmbiguities({ projectId: project.id, sessionId: firstSession.id, userId: owner.id }),
      (error: unknown) => error instanceof AIProviderError,
    );
    const currentAfterFailure = await getSession(firstSession.id, owner.id);
    assert.equal(currentAfterFailure.currentAmbiguityAnalysisId, schoolDetection.analysisId);

    await appendAnswer(firstQuestion.id, owner.id, { content: completeDescription });
    const emptyDetection = await service.detectAmbiguities({ projectId: project.id, sessionId: firstSession.id, userId: owner.id });
    assert.deepEqual(emptyDetection.result, { ambiguities: [] });
    const currentAfterEmptyDetection = await getSession(firstSession.id, owner.id);
    assert.equal(currentAfterEmptyDetection.currentAmbiguityAnalysisId, emptyDetection.analysisId);
    assert.equal(currentAfterEmptyDetection.currentRefinementQuestionAnalysisId, null);
    assert.deepEqual((await listQuestions(firstSession.id, owner.id)).filter((question) => question.source === "AI"), []);

    const secondSessionDetection = await service.detectAmbiguities({ projectId: project.id, sessionId: secondSession.id, userId: owner.id });
    const secondSessionView = await getSession(secondSession.id, owner.id);
    assert.equal(secondSessionView.currentAmbiguityAnalysisId, secondSessionDetection.analysisId);
    assert.equal((await getSession(firstSession.id, owner.id)).currentAmbiguityAnalysisId, emptyDetection.analysisId);

    const successfulDetections = await prisma.aIAnalysis.findMany({
      where: { projectId: project.id, type: "AMBIGUITY_DETECTION", status: "SUCCEEDED" },
      select: { id: true },
    });
    assert.deepEqual(
      new Set(successfulDetections.map((analysis) => analysis.id)),
      new Set([clothingDetection.analysisId, schoolDetection.analysisId, emptyDetection.analysisId, secondSessionDetection.analysisId]),
    );
    assert.equal(await prisma.elicitationAnswer.count({ where: { questionId: obsoleteQuestion.questionId } }), 1);
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
