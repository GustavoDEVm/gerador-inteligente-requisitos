import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { DELETE as deleteCriterionRoute, GET as getCriterionRoute, PATCH as updateCriterionRoute } from "../../src/app/api/acceptance-criteria/[id]/route";
import { GET as getAnswerRoute, POST as appendAnswerRoute } from "../../src/app/api/questions/[id]/answers/route";
import { GET as getQuestionRoute, POST as createQuestionRoute } from "../../src/app/api/sessions/[id]/questions/route";
import { GET as getRequirementRoute, PATCH as updateRequirementRoute } from "../../src/app/api/requirements/[id]/route";
import { GET as getUserStoryRoute, PATCH as updateUserStoryRoute } from "../../src/app/api/user-stories/[id]/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

const missingId = "00000000-0000-4000-8000-000000000099";

function request(url: string, method: "GET" | "POST" | "PATCH" | "DELETE", cookie?: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("as rotas de artefatos editáveis exigem sessão e preservam dados após tentativas de outro proprietário", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Proprietário dos artefatos", email: `artifact-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Outro proprietário", email: `artifact-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de autorização de artefatos ${suffix}`,
        description: "Projeto temporário para validar autorização das rotas de artefatos.",
        objective: "Impedir acesso ou alteração por outro proprietário.",
        context: "Teste automatizado de segurança.",
      },
    });
    projectId = project.id;
    const session = await prisma.elicitationSession.create({
      data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão protegida de teste." },
    });
    const question = await prisma.elicitationQuestion.create({
      data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial.", source: "TEMPLATE" },
    });
    const answer = await prisma.elicitationAnswer.create({
      data: { questionId: question.id, authorId: owner.id, version: 1, content: "A resposta inicial deve permanecer protegida." },
    });
    const requirement = await prisma.requirement.create({
      data: {
        projectId: project.id,
        createdById: owner.id,
        code: "RF-801",
        title: "Proteger requisito",
        description: "O sistema deve proteger requisitos de outro proprietário.",
        type: "FUNCTIONAL",
        answerSources: { create: { answerId: answer.id } },
      },
    });
    await prisma.requirementRevision.create({
      data: {
        requirementId: requirement.id,
        revisionNumber: 1,
        operation: "CREATED",
        changedById: owner.id,
        code: requirement.code,
        title: requirement.title,
        description: requirement.description,
        type: requirement.type,
        priority: requirement.priority,
        status: requirement.status,
      },
    });
    const userStory = await prisma.userStory.create({
      data: {
        projectId: project.id,
        createdById: owner.id,
        code: "US-801",
        title: "Proteger artefatos",
        actor: "proprietário",
        objective: "consultar seus artefatos",
        benefit: "manter a confidencialidade do projeto",
        requirementLinks: { create: { requirementId: requirement.id } },
      },
    });
    await prisma.userStoryRevision.create({
      data: {
        userStoryId: userStory.id,
        revisionNumber: 1,
        operation: "CREATED",
        changedById: owner.id,
        code: userStory.code,
        title: userStory.title,
        actor: userStory.actor,
        objective: userStory.objective,
        benefit: userStory.benefit,
        description: userStory.description,
        priority: userStory.priority,
        status: userStory.status,
        generatedByAnalysisId: userStory.generatedByAnalysisId,
      },
    });
    const criterion = await prisma.acceptanceCriterion.create({
      data: { userStoryId: userStory.id, position: 1, description: "O proprietário deve consultar os artefatos do seu projeto." },
    });
    await prisma.acceptanceCriterionRevision.create({
      data: {
        acceptanceCriterionId: criterion.id,
        userStoryId: userStory.id,
        revisionNumber: 1,
        operation: "CREATED",
        changedById: owner.id,
        description: criterion.description,
        position: criterion.position,
      },
    });

    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;

    const ownerRequirement = await getRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "GET", ownerCookie), routeContext(requirement.id));
    const ownerStory = await getUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "GET", ownerCookie), routeContext(userStory.id));
    const ownerCriterion = await getCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "GET", ownerCookie), routeContext(criterion.id));
    const ownerQuestions = await getQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "GET", ownerCookie), routeContext(session.id));
    const ownerAnswers = await getAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "GET", ownerCookie), routeContext(question.id));
    assert.equal(ownerRequirement.status, 200);
    assert.equal(ownerStory.status, 200);
    assert.equal(ownerCriterion.status, 200);
    assert.equal(ownerQuestions.status, 200);
    assert.equal(ownerAnswers.status, 200);
    assert.equal((await ownerRequirement.json() as { data: { revisions: unknown[] } }).data.revisions.length, 1);
    assert.equal((await ownerStory.json() as { data: { revisions: unknown[] } }).data.revisions.length, 1);
    assert.equal((await ownerCriterion.json() as { data: { revisions: unknown[] } }).data.revisions.length, 1);

    assert.equal(
      (await updateRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "PATCH", ownerCookie, { title: "Requisito protegido atualizado" }), routeContext(requirement.id))).status,
      200,
    );
    assert.equal(
      (await updateUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "PATCH", ownerCookie, { title: "User Story protegida atualizada" }), routeContext(userStory.id))).status,
      200,
    );
    assert.equal(
      (await updateCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "PATCH", ownerCookie, { description: "O proprietário deve poder atualizar seu critério de aceitação." }), routeContext(criterion.id))).status,
      200,
    );
    assert.equal(
      (await createQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "POST", ownerCookie, { content: "Pergunta permitida ao proprietário." }), routeContext(session.id))).status,
      201,
    );
    assert.equal(
      (await appendAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "POST", ownerCookie, { content: "Nova versão permitida ao proprietário." }), routeContext(question.id))).status,
      201,
    );

    const stateBeforeDeniedRequests = await readArtifactState({ projectId: project.id, sessionId: session.id, questionId: question.id, requirementId: requirement.id, userStoryId: userStory.id, criterionId: criterion.id });

    for (const response of await Promise.all([
      getRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "GET"), routeContext(requirement.id)),
      updateRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "PATCH", undefined, { title: "Não deve atualizar" }), routeContext(requirement.id)),
      getUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "GET"), routeContext(userStory.id)),
      updateUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "PATCH", undefined, { title: "Não deve atualizar" }), routeContext(userStory.id)),
      getCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "GET"), routeContext(criterion.id)),
      updateCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "PATCH", undefined, { description: "Não deve atualizar" }), routeContext(criterion.id)),
      deleteCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "DELETE"), routeContext(criterion.id)),
      getQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "GET"), routeContext(session.id)),
      createQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "POST", undefined, { content: "Não deve criar pergunta" }), routeContext(session.id)),
      getAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "GET"), routeContext(question.id)),
      appendAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "POST", undefined, { content: "Não deve criar resposta" }), routeContext(question.id)),
    ])) {
      assert.equal(response.status, 401);
    }

    for (const response of await Promise.all([
      getRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "GET", otherUserCookie), routeContext(requirement.id)),
      updateRequirementRoute(request(`http://localhost/api/requirements/${requirement.id}`, "PATCH", otherUserCookie, { title: "Tentativa externa", ownerId: owner.id }), routeContext(requirement.id)),
      getUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "GET", otherUserCookie), routeContext(userStory.id)),
      updateUserStoryRoute(request(`http://localhost/api/user-stories/${userStory.id}`, "PATCH", otherUserCookie, { title: "Tentativa externa", ownerId: owner.id }), routeContext(userStory.id)),
      getCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "GET", otherUserCookie), routeContext(criterion.id)),
      updateCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "PATCH", otherUserCookie, { description: "Tentativa externa", ownerId: owner.id }), routeContext(criterion.id)),
      deleteCriterionRoute(request(`http://localhost/api/acceptance-criteria/${criterion.id}`, "DELETE", otherUserCookie), routeContext(criterion.id)),
      getQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "GET", otherUserCookie), routeContext(session.id)),
      createQuestionRoute(request(`http://localhost/api/sessions/${session.id}/questions`, "POST", otherUserCookie, { content: "Tentativa externa", ownerId: owner.id }), routeContext(session.id)),
      getAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "GET", otherUserCookie), routeContext(question.id)),
      appendAnswerRoute(request(`http://localhost/api/questions/${question.id}/answers`, "POST", otherUserCookie, { content: "Tentativa externa", ownerId: owner.id }), routeContext(question.id)),
    ])) {
      assert.equal(response.status, 403);
    }

    assert.deepEqual(
      await readArtifactState({ projectId: project.id, sessionId: session.id, questionId: question.id, requirementId: requirement.id, userStoryId: userStory.id, criterionId: criterion.id }),
      stateBeforeDeniedRequests,
    );

    const missingResponses = await Promise.all([
      getRequirementRoute(request(`http://localhost/api/requirements/${missingId}`, "GET", ownerCookie), routeContext(missingId)),
      getUserStoryRoute(request(`http://localhost/api/user-stories/${missingId}`, "GET", ownerCookie), routeContext(missingId)),
      getCriterionRoute(request(`http://localhost/api/acceptance-criteria/${missingId}`, "GET", ownerCookie), routeContext(missingId)),
      getQuestionRoute(request(`http://localhost/api/sessions/${missingId}/questions`, "GET", ownerCookie), routeContext(missingId)),
      getAnswerRoute(request(`http://localhost/api/questions/${missingId}/answers`, "GET", ownerCookie), routeContext(missingId)),
    ]);
    for (const response of missingResponses) assert.equal(response.status, 404);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.acceptanceCriterion.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementUserStory.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementAnswerSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirementAnalysisSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirement.deleteMany({ where: { projectId } });
      await prisma.userStory.deleteMany({ where: { projectId } });
      await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
      await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});

async function readArtifactState(input: {
  projectId: string;
  sessionId: string;
  questionId: string;
  requirementId: string;
  userStoryId: string;
  criterionId: string;
}) {
  const [requirement, userStory, criterion, questionCount, answers, requirementAnswerSourceCount, requirementStoryLinkCount, activityCount] = await Promise.all([
    prisma.requirement.findUniqueOrThrow({ where: { id: input.requirementId }, select: { title: true, description: true, version: true } }),
    prisma.userStory.findUniqueOrThrow({ where: { id: input.userStoryId }, select: { title: true, version: true } }),
    prisma.acceptanceCriterion.findUniqueOrThrow({ where: { id: input.criterionId }, select: { description: true, version: true, archivedAt: true } }),
    prisma.elicitationQuestion.count({ where: { sessionId: input.sessionId } }),
    prisma.elicitationAnswer.findMany({ where: { questionId: input.questionId }, select: { version: true, content: true }, orderBy: { version: "asc" } }),
    prisma.requirementAnswerSource.count({ where: { requirementId: input.requirementId } }),
    prisma.requirementUserStory.count({ where: { requirementId: input.requirementId, userStoryId: input.userStoryId } }),
    prisma.activityLog.count({ where: { projectId: input.projectId } }),
  ]);
  const [requirementRevisionCount, userStoryRevisionCount, criterionRevisionCount] = await Promise.all([
    prisma.requirementRevision.count({ where: { requirementId: input.requirementId } }),
    prisma.userStoryRevision.count({ where: { userStoryId: input.userStoryId } }),
    prisma.acceptanceCriterionRevision.count({ where: { acceptanceCriterionId: input.criterionId } }),
  ]);

  return {
    requirement,
    userStory,
    criterion: { ...criterion, archivedAt: criterion.archivedAt?.toISOString() ?? null },
    questionCount,
    answers,
    requirementAnswerSourceCount,
    requirementStoryLinkCount,
    requirementRevisionCount,
    userStoryRevisionCount,
    criterionRevisionCount,
    activityCount,
  };
}
