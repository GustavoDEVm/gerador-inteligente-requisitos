import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { GET as getSessionRoute } from "../../src/app/api/sessions/[id]/route";
import { GET as getSessionQuestionsRoute } from "../../src/app/api/sessions/[id]/questions/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function sessionRequest(cookie?: string) {
  return new Request("http://localhost/api/sessions/session-id", {
    headers: cookie ? { cookie } : undefined,
  });
}

function sessionQuestionsRequest(cookie?: string) {
  return new Request("http://localhost/api/sessions/session-id/questions", {
    headers: cookie ? { cookie } : undefined,
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("a consulta da sessão reidrata análises persistidas sem criar novos artefatos", async () => {
  const suffix = randomBytes(6).toString("hex");
  let projectId: string | undefined;
  let ownerId: string | undefined;

  try {
    const owner = await prisma.user.create({
      data: { name: "Pessoa proprietária da reidratação", email: `rehydration-owner-${suffix}@example.test`, passwordHash: "test-only" },
    });
    ownerId = owner.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de reidratação ${suffix}`,
        description: "Projeto temporário para validar a reidratação de análises persistidas.",
        objective: "Exibir resultados existentes após recarregar a sessão.",
        context: "Ambiente automatizado de testes.",
      },
    });
    projectId = project.id;
    const session = await prisma.elicitationSession.create({
      data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão de reidratação.", status: "COMPLETED" },
    });
    const initialQuestion = await prisma.elicitationQuestion.create({
      data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" },
    });
    await prisma.elicitationAnswer.create({
      data: { questionId: initialQuestion.id, authorId: owner.id, version: 1, content: "Quero uma loja de roupas com catálogo, carrinho e pedidos." },
    });

    const initialOutput = {
      userStory: { actor: "cliente", action: "comprar roupas", benefit: "realizar pedidos" },
      functionalRequirements: [{ code: "RF-001", title: "Consultar produtos", description: "O sistema deve permitir consultar produtos." }],
      nonFunctionalRequirements: [{ code: "RNF-001", category: "Usabilidade", description: "A interface deve ser clara." }],
      acceptanceCriteria: [{ description: "Quando consultar produtos, o cliente deve visualizar os itens disponíveis." }],
    };
    const refinedOutput = {
      userStory: { actor: "cliente autenticado", action: "finalizar pedidos", benefit: "comprar roupas com segurança" },
      functionalRequirements: [{ code: "RF-002", title: "Finalizar pedido", description: "O sistema deve exigir autenticação para finalizar um pedido." }],
      nonFunctionalRequirements: [{ code: "RNF-002", category: "Segurança", description: "O sistema deve proteger a sessão do cliente." }],
      acceptanceCriteria: [{ description: "Quando o cliente não estiver autenticado, o sistema deve exigir autenticação antes da conclusão." }],
    };

    const initialAnalysis = await createSucceededAnalysis(project.id, owner.id, session.id, "REQUIREMENT_EXTRACTION", initialOutput);
    const ambiguityAnalysis = await createSucceededAnalysis(project.id, owner.id, session.id, "AMBIGUITY_DETECTION", {
      ambiguities: [{ description: "Não está definido se o cliente precisa estar autenticado para finalizar o pedido.", severity: "medium", context: "Finalização do pedido." }],
    });
    const ambiguity = await prisma.ambiguity.create({
      data: { projectId: project.id, generatedByAnalysisId: ambiguityAnalysis.id, description: "Não está definido se o cliente precisa estar autenticado para finalizar o pedido.", severity: "MEDIUM" },
    });
    const questionAnalysis = await createSucceededAnalysis(project.id, owner.id, session.id, "QUESTION_GENERATION", { questions: [] });
    const refinementQuestion = await prisma.elicitationQuestion.create({
      data: { sessionId: session.id, position: 2, content: "O cliente precisa estar autenticado para finalizar um pedido?", guidance: "Defina a regra de acesso.", source: "AI", generatedByAnalysisId: questionAnalysis.id },
    });
    await prisma.elicitationAnswer.createMany({
      data: [
        { questionId: refinementQuestion.id, authorId: owner.id, version: 1, content: "O cliente deve estar autenticado para finalizar o pedido." },
        { questionId: refinementQuestion.id, authorId: owner.id, version: 2, content: "A autenticacao deve ser exigida antes da finalizacao do pedido." },
      ],
    });
    await prisma.aIAnalysis.update({
      where: { id: questionAnalysis.id },
      data: {
        structuredOutput: {
          questions: [{
            questionId: refinementQuestion.id,
            ambiguityId: ambiguity.id,
            question: refinementQuestion.content,
            reason: "Defina a regra de acesso.",
            ambiguity: { description: ambiguity.description, severity: "medium", context: "Finalização do pedido." },
          }],
        },
      },
    });

    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const beforeRefinementResponse = await getSessionQuestionsRoute(sessionQuestionsRequest(ownerCookie), routeContext(session.id));
    assert.equal(beforeRefinementResponse.status, 200);
    const beforeRefinementPayload = await beforeRefinementResponse.json() as { data: QuestionResponseItem[] };
    const questionsBeforeRefinement = beforeRefinementPayload.data.filter((question) => question.source === "AI");
    assert.deepEqual(questionsBeforeRefinement.map((question) => question.id), [refinementQuestion.id]);
    assert.deepEqual(questionsBeforeRefinement[0]?.answers.map((answer) => answer.version), [1, 2]);

    const refinedAnalysis = await createSucceededAnalysis(
      project.id,
      owner.id,
      session.id,
      "REFINEMENT",
      refinedOutput,
      { refinementQuestionAnalysisId: questionAnalysis.id },
    );
    const newerQuestionAnalysis = await createSucceededAnalysis(project.id, owner.id, session.id, "QUESTION_GENERATION", { questions: [] });
    const newerRefinementQuestion = await prisma.elicitationQuestion.create({
      data: { sessionId: session.id, position: 3, content: "Uma pergunta posterior sem resposta.", guidance: "Teste de selecao da execucao.", source: "AI", generatedByAnalysisId: newerQuestionAnalysis.id },
    });
    await prisma.aIAnalysis.update({
      where: { id: newerQuestionAnalysis.id },
      data: {
        structuredOutput: {
          questions: [{
            questionId: newerRefinementQuestion.id,
            ambiguityId: ambiguity.id,
            question: newerRefinementQuestion.content,
            reason: "Teste de selecao da execucao.",
            ambiguity: { description: ambiguity.description, severity: "medium", context: "Finalizacao do pedido." },
          }],
        },
      },
    });
    await createSucceededAnalysis(project.id, owner.id, undefined, "REQUIREMENT_EXTRACTION", initialOutput);

    await prisma.requirement.createMany({
      data: [
        { projectId: project.id, createdById: owner.id, code: "RF-001", title: "Consultar produtos", description: "O sistema deve permitir consultar produtos.", type: "FUNCTIONAL" },
        { projectId: project.id, createdById: owner.id, code: "RF-002", title: "Finalizar pedido", description: "O sistema deve exigir autenticação para finalizar um pedido.", type: "FUNCTIONAL" },
      ],
    });

    const countsBeforeReload = await artifactCounts(project.id);
    const firstResponse = await getSessionRoute(sessionRequest(ownerCookie), routeContext(session.id));
    const reloadResponse = await getSessionRoute(sessionRequest(ownerCookie), routeContext(session.id));
    const firstQuestionsResponse = await getSessionQuestionsRoute(sessionQuestionsRequest(ownerCookie), routeContext(session.id));
    const reloadQuestionsResponse = await getSessionQuestionsRoute(sessionQuestionsRequest(ownerCookie), routeContext(session.id));
    assert.equal(firstResponse.status, 200);
    assert.equal(reloadResponse.status, 200);
    assert.equal(firstQuestionsResponse.status, 200);
    assert.equal(reloadQuestionsResponse.status, 200);

    const firstPayload = await firstResponse.json() as { data: { analyses: { analysis: { id: string; type: string; structuredOutput: unknown } }[] } };
    const reloadPayload = await reloadResponse.json() as { data: { analyses: { analysis: { id: string; type: string; structuredOutput: unknown } }[] } };
    const firstQuestionsPayload = await firstQuestionsResponse.json() as { data: QuestionResponseItem[] };
    const reloadQuestionsPayload = await reloadQuestionsResponse.json() as { data: QuestionResponseItem[] };
    const analyses = reloadPayload.data.analyses.map((item) => item.analysis);
    const reloadedRefinementQuestions = reloadQuestionsPayload.data.filter((question) => question.source === "AI");

    assert.deepEqual(firstPayload.data.analyses, reloadPayload.data.analyses);
    assert.deepEqual(firstQuestionsPayload.data, reloadQuestionsPayload.data);
    assert.deepEqual(analyses.map((analysis) => analysis.id), [initialAnalysis.id, ambiguityAnalysis.id, questionAnalysis.id, refinedAnalysis.id, newerQuestionAnalysis.id]);
    assert.deepEqual(analyses.find((analysis) => analysis.id === initialAnalysis.id)?.structuredOutput, initialOutput);
    assert.deepEqual(analyses.find((analysis) => analysis.id === refinedAnalysis.id)?.structuredOutput, refinedOutput);
    assert.ok(analyses.some((analysis) => analysis.type === "AMBIGUITY_DETECTION"));
    assert.ok(analyses.some((analysis) => analysis.type === "QUESTION_GENERATION"));
    assert.deepEqual(reloadedRefinementQuestions.map((question) => question.id), [refinementQuestion.id]);
    assert.deepEqual(reloadedRefinementQuestions[0]?.answers.map((answer) => answer.version), [1, 2]);
    assert.equal(reloadedRefinementQuestions[0]?.answers.at(-1)?.content, "A autenticacao deve ser exigida antes da finalizacao do pedido.");
    assert.equal(await prisma.elicitationQuestion.count({ where: { id: newerRefinementQuestion.id } }), 1);
    assert.deepEqual(await artifactCounts(project.id), countsBeforeReload);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.requirement.deleteMany({ where: { projectId } });
      await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
      await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
      await prisma.ambiguity.deleteMany({ where: { projectId } });
      await prisma.aIAnalysis.deleteMany({ where: { projectId } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
  }
});

async function createSucceededAnalysis(
  projectId: string,
  userId: string,
  sessionId: string | undefined,
  type: "REQUIREMENT_EXTRACTION" | "AMBIGUITY_DETECTION" | "QUESTION_GENERATION" | "REFINEMENT",
  structuredOutput: object,
  inputSnapshot: object = {},
) {
  const analysis = await prisma.aIAnalysis.create({
    data: {
      projectId,
      requestedById: userId,
      type,
      status: "SUCCEEDED",
      provider: "mock",
      model: "mock-test-model",
      promptVersion: "test-v1",
      promptText: "teste",
      inputSnapshot,
      structuredOutput,
      completedAt: new Date(),
    },
  });
  if (sessionId) await prisma.aIAnalysisSession.create({ data: { analysisId: analysis.id, sessionId } });
  return analysis;
}

async function artifactCounts(projectId: string) {
  const [analyses, requirements, ambiguities, questions, answers] = await Promise.all([
    prisma.aIAnalysis.count({ where: { projectId } }),
    prisma.requirement.count({ where: { projectId } }),
    prisma.ambiguity.count({ where: { projectId } }),
    prisma.elicitationQuestion.count({ where: { session: { projectId } } }),
    prisma.elicitationAnswer.count({ where: { question: { session: { projectId } } } }),
  ]);
  return { analyses, requirements, ambiguities, questions, answers };
}

type QuestionResponseItem = {
  id: string;
  source: "MANUAL" | "TEMPLATE" | "AI";
  answers: { version: number; content: string }[];
};
