import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { DELETE as deleteProjectRoute } from "../../src/app/api/projects/[id]/route";
import { DELETE as deleteSessionRoute } from "../../src/app/api/sessions/[id]/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { deleteProject } from "../../src/services/projects";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

const missingId = "00000000-0000-4000-8000-000000000222";

function request(url: string, cookie?: string) {
  return new Request(url, { method: "DELETE", headers: cookie ? { cookie } : undefined });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("DELETE /api/projects/:id remove permanentemente o grafo completo de um projeto arquivado", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Responsável pela exclusão", email: `project-delete-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Usuário externo", email: `project-delete-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto arquivado ${suffix}`,
        description: "Projeto temporário para provar a exclusão permanente.",
        objective: "Excluir todo o grafo persistido.",
        context: "Teste HTTP de exclusão de projeto.",
        status: "ARCHIVED",
        archivedAt: new Date(),
        stakeholders: { create: { name: "Administrador", role: "Valida a exclusão" } },
      },
    });
    projectId = project.id;
    const graph = await createProjectGraph(project.id, owner.id, 1);
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
    const url = `http://localhost/api/projects/${project.id}`;

    assert.equal((await deleteProjectRoute(request(url), routeContext(project.id))).status, 401);
    assert.equal((await deleteProjectRoute(request(url, otherCookie), routeContext(project.id))).status, 403);
    assert.equal(await prisma.project.count({ where: { id: project.id } }), 1);
    assert.equal((await deleteProjectRoute(request(`http://localhost/api/projects/${missingId}`, ownerCookie), routeContext(missingId))).status, 404);

    const response = await deleteProjectRoute(request(url, ownerCookie), routeContext(project.id));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { data: { id: string; name: string } }).data, { id: project.id, name: project.name });

    assert.equal(await prisma.project.count({ where: { id: project.id } }), 0);
    assert.equal(await prisma.stakeholder.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.elicitationSession.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.elicitationQuestion.count({ where: { id: graph.questionId } }), 0);
    assert.equal(await prisma.elicitationAnswer.count({ where: { id: graph.answerId } }), 0);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: graph.analysisId } }), 0);
    assert.equal(await prisma.aIAnalysisSession.count({ where: { analysisId: graph.analysisId } }), 0);
    assert.equal(await prisma.requirement.count({ where: { id: graph.requirementId } }), 0);
    assert.equal(await prisma.requirementRevision.count({ where: { requirementId: graph.requirementId } }), 0);
    assert.equal(await prisma.requirementAnswerSource.count({ where: { requirementId: graph.requirementId } }), 0);
    assert.equal(await prisma.requirementAnalysisSource.count({ where: { requirementId: graph.requirementId } }), 0);
    assert.equal(await prisma.userStory.count({ where: { id: graph.userStoryId } }), 0);
    assert.equal(await prisma.userStoryRevision.count({ where: { userStoryId: graph.userStoryId } }), 0);
    assert.equal(await prisma.requirementUserStory.count({ where: { requirementId: graph.requirementId } }), 0);
    assert.equal(await prisma.acceptanceCriterion.count({ where: { id: graph.criterionId } }), 0);
    assert.equal(await prisma.acceptanceCriterionRevision.count({ where: { acceptanceCriterionId: graph.criterionId } }), 0);
    assert.equal(await prisma.ambiguity.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.suggestion.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.user.count({ where: { id: owner.id } }), 1);
  } finally {
    if (projectId && ownerId && await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      await deleteProject(projectId, ownerId);
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});

test("DELETE /api/sessions/:id remove apenas o grafo exclusivo da sessão e preserva artefatos compartilhados", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Responsável pelas sessões", email: `session-delete-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Outro usuário", email: `session-delete-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await prisma.project.create({ data: { ownerId: owner.id, name: `Projeto de sessões ${suffix}`, description: "Teste de preservação seletiva.", objective: "Excluir uma sessão.", context: "Loja de roupas." } });
    projectId = project.id;
    const firstSession = await createSession(project.id, owner.id, 1, "Sessão a excluir");
    const retainedSession = await createSession(project.id, owner.id, 2, "Sessão preservada");
    const firstQuestion = await createQuestionAndAnswer(firstSession.id, owner.id, "Resposta exclusiva da sessão removida");
    const retainedQuestion = await createQuestionAndAnswer(retainedSession.id, owner.id, "Resposta preservada da segunda sessão");
    const exclusiveAnalysis = await createAnalysis(project.id, owner.id, "REQUIREMENT_EXTRACTION", [firstSession.id]);
    const sharedAnalysis = await createAnalysis(project.id, owner.id, "REFINEMENT", [firstSession.id, retainedSession.id]);
    const retainedAnalysis = await createAnalysis(project.id, owner.id, "AMBIGUITY_DETECTION", [retainedSession.id]);
    const exclusiveRequirement = await createRequirement(project.id, owner.id, `RF-EX-${suffix}`);
    const sharedRequirement = await createRequirement(project.id, owner.id, `RF-SH-${suffix}`);
    const manualRequirement = await createRequirement(project.id, owner.id, `RF-MA-${suffix}`);
    await prisma.requirementAnswerSource.create({ data: { requirementId: exclusiveRequirement.id, answerId: firstQuestion.answerId } });
    await prisma.requirementAnalysisSource.create({ data: { requirementId: exclusiveRequirement.id, analysisId: exclusiveAnalysis.id } });
    await prisma.requirementAnswerSource.create({ data: { requirementId: sharedRequirement.id, answerId: retainedQuestion.answerId } });
    await prisma.requirementAnalysisSource.create({ data: { requirementId: sharedRequirement.id, analysisId: sharedAnalysis.id } });
    const exclusiveStory = await createStory(project.id, owner.id, `US-EX-${suffix}`, exclusiveAnalysis.id);
    const sharedStory = await createStory(project.id, owner.id, `US-SH-${suffix}`, sharedAnalysis.id);
    const manualStory = await createStory(project.id, owner.id, `US-MA-${suffix}`, null);
    await prisma.requirementUserStory.createMany({ data: [
      { requirementId: exclusiveRequirement.id, userStoryId: exclusiveStory.id },
      { requirementId: sharedRequirement.id, userStoryId: sharedStory.id },
      { requirementId: exclusiveRequirement.id, userStoryId: manualStory.id },
    ] });
    const [exclusiveCriterion, sharedCriterion, manualCriterion] = await Promise.all([
      createCriterion(exclusiveStory.id, owner.id),
      createCriterion(sharedStory.id, owner.id),
      createCriterion(manualStory.id, owner.id),
    ]);
    const [exclusiveAmbiguity, sharedAmbiguity, manualAmbiguity] = await Promise.all([
      prisma.ambiguity.create({ data: { projectId: project.id, generatedByAnalysisId: exclusiveAnalysis.id, description: "Ambiguidade exclusiva" } }),
      prisma.ambiguity.create({ data: { projectId: project.id, generatedByAnalysisId: sharedAnalysis.id, description: "Ambiguidade compartilhada" } }),
      prisma.ambiguity.create({ data: { projectId: project.id, description: "Ambiguidade manual" } }),
    ]);
    const [exclusiveSuggestion, sharedSuggestion, manualSuggestion] = await Promise.all([
      prisma.suggestion.create({ data: { projectId: project.id, generatedByAnalysisId: exclusiveAnalysis.id, description: "Sugestão exclusiva" } }),
      prisma.suggestion.create({ data: { projectId: project.id, generatedByAnalysisId: sharedAnalysis.id, description: "Sugestão compartilhada" } }),
      prisma.suggestion.create({ data: { projectId: project.id, description: "Sugestão manual" } }),
    ]);
    await prisma.activityLog.createMany({ data: [
      { projectId: project.id, actorId: owner.id, action: "SESSION_STARTED", entityType: "SESSION", entityId: firstSession.id, summary: "Sessão exclusiva." },
      { projectId: project.id, actorId: owner.id, action: "ANSWER_RECORDED", entityType: "ANSWER", entityId: firstQuestion.answerId, summary: "Resposta exclusiva." },
      { projectId: project.id, actorId: owner.id, action: "ANALYSIS_COMPLETED", entityType: "ANALYSIS", entityId: exclusiveAnalysis.id, summary: "Análise exclusiva." },
      { projectId: project.id, actorId: owner.id, action: "REQUIREMENT_CREATED", entityType: "REQUIREMENT", entityId: exclusiveRequirement.id, summary: "Requisito exclusivo." },
      { projectId: project.id, actorId: owner.id, action: "STORY_CREATED", entityType: "USER_STORY", entityId: exclusiveStory.id, summary: "Story exclusiva." },
      { projectId: project.id, actorId: owner.id, action: "CRITERION_CREATED", entityType: "ACCEPTANCE_CRITERION", entityId: exclusiveCriterion.id, summary: "Critério exclusivo." },
      { projectId: project.id, actorId: owner.id, action: "ANALYSIS_COMPLETED", entityType: "ANALYSIS", entityId: sharedAnalysis.id, summary: "Análise compartilhada." },
      { projectId: project.id, actorId: owner.id, action: "REQUIREMENT_CREATED", entityType: "REQUIREMENT", entityId: manualRequirement.id, summary: "Requisito manual." },
    ] });
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
    const url = `http://localhost/api/sessions/${firstSession.id}`;

    assert.equal((await deleteSessionRoute(request(url), routeContext(firstSession.id))).status, 401);
    assert.equal((await deleteSessionRoute(request(url, otherCookie), routeContext(firstSession.id))).status, 403);
    assert.equal((await deleteSessionRoute(request(`http://localhost/api/sessions/${missingId}`, ownerCookie), routeContext(missingId))).status, 404);
    const activeAnalysis = await createAnalysis(project.id, owner.id, "QUESTION_GENERATION", [firstSession.id], "RUNNING");
    assert.equal((await deleteSessionRoute(request(url, ownerCookie), routeContext(firstSession.id))).status, 409);
    assert.equal(await prisma.elicitationSession.count({ where: { id: firstSession.id } }), 1);
    assert.equal(await prisma.requirement.count({ where: { id: exclusiveRequirement.id } }), 1);
    await prisma.aIAnalysis.update({ where: { id: activeAnalysis.id }, data: { status: "FAILED", completedAt: new Date() } });

    const response = await deleteSessionRoute(request(url, ownerCookie), routeContext(firstSession.id));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { data: { id: string; projectId: string; deletedRequirementIds: string[]; deletedUserStoryIds: string[] } }).data, {
      id: firstSession.id,
      projectId: project.id,
      deletedRequirementIds: [exclusiveRequirement.id],
      deletedUserStoryIds: [exclusiveStory.id],
    });

    assert.equal(await prisma.elicitationSession.count({ where: { id: firstSession.id } }), 0);
    assert.equal(await prisma.elicitationQuestion.count({ where: { id: firstQuestion.questionId } }), 0);
    assert.equal(await prisma.elicitationAnswer.count({ where: { id: firstQuestion.answerId } }), 0);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: exclusiveAnalysis.id } }), 0);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: activeAnalysis.id } }), 0);
    assert.equal(await prisma.aIAnalysisSession.count({ where: { analysisId: sharedAnalysis.id, sessionId: firstSession.id } }), 0);
    assert.equal(await prisma.aIAnalysisSession.count({ where: { analysisId: sharedAnalysis.id, sessionId: retainedSession.id } }), 1);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: sharedAnalysis.id } }), 1);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: retainedAnalysis.id } }), 1);
    assert.equal(await prisma.requirement.count({ where: { id: exclusiveRequirement.id } }), 0);
    assert.equal(await prisma.requirementRevision.count({ where: { requirementId: exclusiveRequirement.id } }), 0);
    assert.equal(await prisma.requirement.count({ where: { id: sharedRequirement.id } }), 1);
    assert.equal(await prisma.requirement.count({ where: { id: manualRequirement.id } }), 1);
    assert.equal(await prisma.requirementAnswerSource.count({ where: { requirementId: sharedRequirement.id, answerId: retainedQuestion.answerId } }), 1);
    assert.equal(await prisma.requirementAnalysisSource.count({ where: { requirementId: sharedRequirement.id, analysisId: sharedAnalysis.id } }), 1);
    assert.equal(await prisma.userStory.count({ where: { id: exclusiveStory.id } }), 0);
    assert.equal(await prisma.userStory.count({ where: { id: sharedStory.id } }), 1);
    assert.equal(await prisma.userStory.count({ where: { id: manualStory.id } }), 1);
    assert.equal(await prisma.acceptanceCriterion.count({ where: { id: exclusiveCriterion.id } }), 0);
    assert.equal(await prisma.acceptanceCriterion.count({ where: { id: sharedCriterion.id } }), 1);
    assert.equal(await prisma.acceptanceCriterion.count({ where: { id: manualCriterion.id } }), 1);
    assert.equal(await prisma.requirementUserStory.count({ where: { requirementId: exclusiveRequirement.id } }), 0);
    assert.equal(await prisma.ambiguity.count({ where: { id: exclusiveAmbiguity.id } }), 0);
    assert.equal(await prisma.ambiguity.count({ where: { id: sharedAmbiguity.id } }), 1);
    assert.equal(await prisma.ambiguity.count({ where: { id: manualAmbiguity.id } }), 1);
    assert.equal(await prisma.suggestion.count({ where: { id: exclusiveSuggestion.id } }), 0);
    assert.equal(await prisma.suggestion.count({ where: { id: sharedSuggestion.id } }), 1);
    assert.equal(await prisma.suggestion.count({ where: { id: manualSuggestion.id } }), 1);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, entityId: { in: [firstSession.id, firstQuestion.answerId, exclusiveAnalysis.id, exclusiveRequirement.id, exclusiveStory.id, exclusiveCriterion.id] } } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, entityId: { in: [sharedAnalysis.id, manualRequirement.id] } } }), 2);
    assert.equal(await prisma.elicitationSession.count({ where: { id: retainedSession.id } }), 1);
    assert.equal(await prisma.elicitationQuestion.count({ where: { id: retainedQuestion.questionId } }), 1);
    assert.equal(await prisma.elicitationAnswer.count({ where: { id: retainedQuestion.answerId } }), 1);
    assert.equal(await prisma.project.count({ where: { id: project.id } }), 1);
  } finally {
    if (projectId && ownerId && await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      await deleteProject(projectId, ownerId);
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});

async function createProjectGraph(projectId: string, ownerId: string, sequence: number) {
  const session = await createSession(projectId, ownerId, sequence, "Sessão do projeto");
  const question = await createQuestionAndAnswer(session.id, ownerId, "Resposta de contexto para exclusão total.");
  const analysis = await createAnalysis(projectId, ownerId, "REQUIREMENT_EXTRACTION", [session.id]);
  const requirement = await createRequirement(projectId, ownerId, `RF-${sequence}-${randomBytes(3).toString("hex")}`);
  await prisma.requirementAnswerSource.create({ data: { requirementId: requirement.id, answerId: question.answerId } });
  await prisma.requirementAnalysisSource.create({ data: { requirementId: requirement.id, analysisId: analysis.id } });
  const story = await createStory(projectId, ownerId, `US-${sequence}-${randomBytes(3).toString("hex")}`, analysis.id);
  await prisma.requirementUserStory.create({ data: { requirementId: requirement.id, userStoryId: story.id } });
  const criterion = await createCriterion(story.id, ownerId);
  await prisma.ambiguity.create({ data: { projectId, generatedByAnalysisId: analysis.id, description: "Ambiguidade do projeto." } });
  await prisma.suggestion.create({ data: { projectId, generatedByAnalysisId: analysis.id, description: "Sugestão do projeto." } });
  await prisma.activityLog.create({ data: { projectId, actorId: ownerId, action: "PROJECT_CREATED", entityType: "PROJECT", entityId: projectId, summary: "Projeto temporário criado." } });
  return { sessionId: session.id, analysisId: analysis.id, requirementId: requirement.id, userStoryId: story.id, criterionId: criterion.id, ...question };
}

async function createSession(projectId: string, ownerId: string, sequence: number, title: string) {
  return prisma.elicitationSession.create({ data: { projectId, createdById: ownerId, sequence, title, context: `Contexto de ${title}.`, status: "ACTIVE", startedAt: new Date() } });
}

async function createQuestionAndAnswer(sessionId: string, ownerId: string, content: string) {
  const question = await prisma.elicitationQuestion.create({ data: { sessionId, position: 1, content: "Pergunta de teste", source: "MANUAL", askedAt: new Date() } });
  const answer = await prisma.elicitationAnswer.create({ data: { questionId: question.id, authorId: ownerId, version: 1, content } });
  return { questionId: question.id, answerId: answer.id };
}

async function createAnalysis(projectId: string, ownerId: string, type: "REQUIREMENT_EXTRACTION" | "AMBIGUITY_DETECTION" | "QUESTION_GENERATION" | "REFINEMENT", sessionIds: string[], status: "SUCCEEDED" | "RUNNING" | "FAILED" = "SUCCEEDED") {
  return prisma.aIAnalysis.create({
    data: {
      projectId,
      requestedById: ownerId,
      type,
      status,
      provider: "mock",
      model: "test-model",
      promptVersion: "test-v1",
      promptText: "Prompt de teste sem conteúdo sensível.",
      inputSnapshot: {},
      structuredOutput: {},
      ...(status === "SUCCEEDED" || status === "FAILED" ? { completedAt: new Date() } : {}),
      sessions: { create: sessionIds.map((sessionId) => ({ sessionId })) },
    },
  });
}

async function createRequirement(projectId: string, ownerId: string, code: string) {
  const requirement = await prisma.requirement.create({ data: { projectId, createdById: ownerId, code, title: `Título ${code}`, description: `Descrição ${code}`, type: "FUNCTIONAL", priority: "MEDIUM", status: "PENDING" } });
  await prisma.requirementRevision.create({ data: { requirementId: requirement.id, revisionNumber: 1, operation: "BASELINE", changedById: ownerId, code, title: requirement.title, description: requirement.description, type: requirement.type, priority: requirement.priority, status: requirement.status } });
  return requirement;
}

async function createStory(projectId: string, ownerId: string, code: string, generatedByAnalysisId: string | null) {
  const story = await prisma.userStory.create({ data: { projectId, createdById: ownerId, generatedByAnalysisId, code, title: `Título ${code}`, actor: "Cliente", objective: "Realizar uma ação", benefit: "Obter um benefício", priority: "MEDIUM", status: "PENDING" } });
  await prisma.userStoryRevision.create({ data: { userStoryId: story.id, revisionNumber: 1, operation: "BASELINE", changedById: ownerId, code, title: story.title, actor: story.actor, objective: story.objective, benefit: story.benefit, description: story.description, priority: story.priority, status: story.status, generatedByAnalysisId } });
  return story;
}

async function createCriterion(userStoryId: string, ownerId: string) {
  const criterion = await prisma.acceptanceCriterion.create({ data: { userStoryId, position: 1, description: "Critério de aceitação de teste." } });
  await prisma.acceptanceCriterionRevision.create({ data: { acceptanceCriterionId: criterion.id, userStoryId, revisionNumber: 1, operation: "BASELINE", changedById: ownerId, description: criterion.description, position: criterion.position } });
  return criterion;
}
