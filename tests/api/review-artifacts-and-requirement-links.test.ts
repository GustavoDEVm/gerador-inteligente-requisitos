import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PATCH as updateAmbiguityRoute } from "../../src/app/api/ambiguities/[id]/route";
import { GET as listAmbiguitiesRoute, POST as createAmbiguityRoute } from "../../src/app/api/projects/[id]/ambiguities/route";
import { GET as listSuggestionsRoute, POST as createSuggestionRoute } from "../../src/app/api/projects/[id]/suggestions/route";
import { PATCH as updateSuggestionRoute } from "../../src/app/api/suggestions/[id]/route";
import { DELETE as unlinkRequirementRoute } from "../../src/app/api/user-stories/[id]/requirements/[requirementId]/route";
import { POST as linkRequirementRoute } from "../../src/app/api/user-stories/[id]/requirements/route";
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

function linkRouteContext(id: string, requirementId: string) {
  return { params: Promise.resolve({ id, requirementId }) };
}

test("as rotas HTTP de ambiguidades preservam propriedade, análise de origem e estado persistido", async () => {
  const fixture = await createFixture("ambiguity");

  try {
    const analysis = await createAnalysis(fixture.projectId, fixture.ownerId);
    const ambiguity = await prisma.ambiguity.create({
      data: {
        projectId: fixture.projectId,
        generatedByAnalysisId: analysis.id,
        description: "Não está definido quem confirma a alteração de preço.",
        severity: "HIGH",
      },
    });

    const ownerList = await listAmbiguitiesRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "GET", fixture.ownerCookie), routeContext(fixture.projectId));
    assert.equal(ownerList.status, 200);
    assert.deepEqual((await ownerList.json() as { data: Array<{ id: string }> }).data.map((item) => item.id), [ambiguity.id]);
    assert.equal((await listAmbiguitiesRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "GET"), routeContext(fixture.projectId))).status, 401);
    assert.equal(
      (await listAmbiguitiesRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "GET", fixture.otherUserCookie), routeContext(fixture.projectId))).status,
      403,
    );
    assert.equal(
      (await listAmbiguitiesRoute(request(`http://localhost/api/projects/${missingId}/ambiguities`, "GET", fixture.ownerCookie), routeContext(missingId))).status,
      404,
    );

    assert.equal(
      (await createAmbiguityRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "POST", fixture.ownerCookie, { description: " " }), routeContext(fixture.projectId))).status,
      400,
    );
    const createdResponse = await createAmbiguityRoute(
      request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "POST", fixture.ownerCookie, { description: "Não está definido o limite de desconto.", severity: "LOW" }),
      routeContext(fixture.projectId),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json() as { data: { id: string; projectId: string; severity: string } }).data;
    assert.equal(created.projectId, fixture.projectId);
    assert.equal(created.severity, "LOW");
    assert.equal(await prisma.ambiguity.count({ where: { projectId: fixture.projectId } }), 2);

    assert.equal(
      (await updateAmbiguityRoute(request(`http://localhost/api/ambiguities/${ambiguity.id}`, "PATCH", fixture.ownerCookie, { status: "RESOLVED" }), routeContext(ambiguity.id))).status,
      400,
    );
    const resolvedResponse = await updateAmbiguityRoute(
      request(`http://localhost/api/ambiguities/${ambiguity.id}`, "PATCH", fixture.ownerCookie, { status: "RESOLVED", resolution: "O administrador do catálogo confirma alterações de preço." }),
      routeContext(ambiguity.id),
    );
    assert.equal(resolvedResponse.status, 200);
    const resolved = await prisma.ambiguity.findUniqueOrThrow({ where: { id: ambiguity.id } });
    assert.equal(resolved.status, "RESOLVED");
    assert.equal(resolved.resolvedById, fixture.ownerId);
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.generatedByAnalysisId, analysis.id);

    const stateBeforeDeniedRequests = await readReviewArtifactState(fixture.projectId, ambiguity.id, created.id);
    for (const response of await Promise.all([
      createAmbiguityRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "POST"), routeContext(fixture.projectId)),
      updateAmbiguityRoute(request(`http://localhost/api/ambiguities/${ambiguity.id}`, "PATCH"), routeContext(ambiguity.id)),
    ])) {
      assert.equal(response.status, 401);
    }
    for (const response of await Promise.all([
      createAmbiguityRoute(request(`http://localhost/api/projects/${fixture.projectId}/ambiguities`, "POST", fixture.otherUserCookie, { description: "Tentativa externa" }), routeContext(fixture.projectId)),
      updateAmbiguityRoute(request(`http://localhost/api/ambiguities/${ambiguity.id}`, "PATCH", fixture.otherUserCookie, { status: "DISMISSED" }), routeContext(ambiguity.id)),
    ])) {
      assert.equal(response.status, 403);
    }
    assert.equal(
      (await createAmbiguityRoute(request(`http://localhost/api/projects/${missingId}/ambiguities`, "POST", fixture.ownerCookie, { description: "Não encontrada" }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await updateAmbiguityRoute(request(`http://localhost/api/ambiguities/${missingId}`, "PATCH", fixture.ownerCookie, { status: "DISMISSED" }), routeContext(missingId))).status,
      404,
    );
    assert.deepEqual(await readReviewArtifactState(fixture.projectId, ambiguity.id, created.id), stateBeforeDeniedRequests);
  } finally {
    await deleteFixture(fixture);
  }
});

test("as rotas HTTP de sugestões preservam propriedade, análise de origem e decisões", async () => {
  const fixture = await createFixture("suggestion");

  try {
    const analysis = await createAnalysis(fixture.projectId, fixture.ownerId);
    const suggestion = await prisma.suggestion.create({
      data: {
        projectId: fixture.projectId,
        generatedByAnalysisId: analysis.id,
        description: "Definir a política de descontos por período.",
      },
    });

    const ownerList = await listSuggestionsRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "GET", fixture.ownerCookie), routeContext(fixture.projectId));
    assert.equal(ownerList.status, 200);
    assert.deepEqual((await ownerList.json() as { data: Array<{ id: string }> }).data.map((item) => item.id), [suggestion.id]);
    assert.equal((await listSuggestionsRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "GET"), routeContext(fixture.projectId))).status, 401);
    assert.equal(
      (await listSuggestionsRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "GET", fixture.otherUserCookie), routeContext(fixture.projectId))).status,
      403,
    );
    assert.equal(
      (await listSuggestionsRoute(request(`http://localhost/api/projects/${missingId}/suggestions`, "GET", fixture.ownerCookie), routeContext(missingId))).status,
      404,
    );

    assert.equal(
      (await createSuggestionRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "POST", fixture.ownerCookie, { description: " " }), routeContext(fixture.projectId))).status,
      400,
    );
    const createdResponse = await createSuggestionRoute(
      request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "POST", fixture.ownerCookie, { description: "Documentar condições especiais de pagamento." }),
      routeContext(fixture.projectId),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json() as { data: { id: string; projectId: string; status: string } }).data;
    assert.equal(created.projectId, fixture.projectId);
    assert.equal(created.status, "PENDING");

    assert.equal(
      (await updateSuggestionRoute(request(`http://localhost/api/suggestions/${suggestion.id}`, "PATCH", fixture.ownerCookie, {}), routeContext(suggestion.id))).status,
      400,
    );
    const acceptedResponse = await updateSuggestionRoute(
      request(`http://localhost/api/suggestions/${suggestion.id}`, "PATCH", fixture.ownerCookie, { status: "ACCEPTED" }),
      routeContext(suggestion.id),
    );
    assert.equal(acceptedResponse.status, 200);
    const accepted = await prisma.suggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.decidedById, fixture.ownerId);
    assert.ok(accepted.decidedAt);
    assert.equal(accepted.generatedByAnalysisId, analysis.id);

    const stateBeforeDeniedRequests = await readReviewArtifactState(fixture.projectId, suggestion.id, created.id, "suggestion");
    for (const response of await Promise.all([
      createSuggestionRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "POST"), routeContext(fixture.projectId)),
      updateSuggestionRoute(request(`http://localhost/api/suggestions/${suggestion.id}`, "PATCH"), routeContext(suggestion.id)),
    ])) {
      assert.equal(response.status, 401);
    }
    for (const response of await Promise.all([
      createSuggestionRoute(request(`http://localhost/api/projects/${fixture.projectId}/suggestions`, "POST", fixture.otherUserCookie, { description: "Tentativa externa" }), routeContext(fixture.projectId)),
      updateSuggestionRoute(request(`http://localhost/api/suggestions/${suggestion.id}`, "PATCH", fixture.otherUserCookie, { status: "DISMISSED" }), routeContext(suggestion.id)),
    ])) {
      assert.equal(response.status, 403);
    }
    assert.equal(
      (await createSuggestionRoute(request(`http://localhost/api/projects/${missingId}/suggestions`, "POST", fixture.ownerCookie, { description: "Não encontrada" }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await updateSuggestionRoute(request(`http://localhost/api/suggestions/${missingId}`, "PATCH", fixture.ownerCookie, { status: "DISMISSED" }), routeContext(missingId))).status,
      404,
    );
    assert.deepEqual(await readReviewArtifactState(fixture.projectId, suggestion.id, created.id, "suggestion"), stateBeforeDeniedRequests);
  } finally {
    await deleteFixture(fixture);
  }
});

test("as rotas HTTP de vínculo entre requisito e User Story validam ambos os artefatos", async () => {
  const fixture = await createFixture("requirement-link");

  try {
    const analysis = await createAnalysis(fixture.projectId, fixture.ownerId);
    const requirement = await prisma.requirement.create({
      data: {
        projectId: fixture.projectId,
        createdById: fixture.ownerId,
        code: "RF-951",
        title: "Manter vínculo rastreável",
        description: "O sistema deve preservar a relação entre requisito e User Story.",
        type: "FUNCTIONAL",
        analysisSources: { create: { analysisId: analysis.id } },
      },
    });
    await prisma.requirementRevision.create({
      data: {
        requirementId: requirement.id,
        revisionNumber: 1,
        operation: "CREATED",
        changedById: fixture.ownerId,
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
        projectId: fixture.projectId,
        createdById: fixture.ownerId,
        generatedByAnalysisId: analysis.id,
        code: "US-951",
        title: "Relacionar requisito",
        actor: "analista",
        objective: "associar o requisito à User Story",
        benefit: "preservar a rastreabilidade",
      },
    });
    await prisma.userStoryRevision.create({
      data: {
        userStoryId: userStory.id,
        revisionNumber: 1,
        operation: "CREATED",
        changedById: fixture.ownerId,
        code: userStory.code,
        title: userStory.title,
        actor: userStory.actor,
        objective: userStory.objective,
        benefit: userStory.benefit,
        description: userStory.description,
        priority: userStory.priority,
        status: userStory.status,
        generatedByAnalysisId: analysis.id,
      },
    });
    const foreignRequirement = await prisma.requirement.create({
      data: {
        projectId: fixture.otherProjectId,
        createdById: fixture.otherUserId,
        code: "RF-952",
        title: "Requisito estrangeiro",
        description: "Este requisito pertence a outro proprietário.",
        type: "FUNCTIONAL",
      },
    });

    const linkUrl = `http://localhost/api/user-stories/${userStory.id}/requirements`;
    assert.equal((await linkRequirementRoute(request(linkUrl, "POST"), routeContext(userStory.id))).status, 401);
    assert.equal(
      (await linkRequirementRoute(request(linkUrl, "POST", fixture.ownerCookie, { requirementId: "invalid" }), routeContext(userStory.id))).status,
      400,
    );
    assert.equal(
      (await linkRequirementRoute(request(linkUrl, "POST", fixture.ownerCookie, { requirementId: missingId }), routeContext(userStory.id))).status,
      404,
    );
    assert.equal(
      (await linkRequirementRoute(request(linkUrl, "POST", fixture.ownerCookie, { requirementId: foreignRequirement.id }), routeContext(userStory.id))).status,
      403,
    );
    assert.equal(
      (await linkRequirementRoute(request(`http://localhost/api/user-stories/${missingId}/requirements`, "POST", fixture.ownerCookie, { requirementId: requirement.id }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await linkRequirementRoute(request(linkUrl, "POST", fixture.otherUserCookie, { requirementId: requirement.id }), routeContext(userStory.id))).status,
      403,
    );

    const linkResponse = await linkRequirementRoute(
      request(linkUrl, "POST", fixture.ownerCookie, { requirementId: requirement.id, ownerId: fixture.otherUserId }),
      routeContext(userStory.id),
    );
    assert.equal(linkResponse.status, 201);
    assert.equal(await prisma.requirementUserStory.count({ where: { requirementId: requirement.id, userStoryId: userStory.id } }), 1);
    assert.equal(await prisma.activityLog.count({ where: { projectId: fixture.projectId, action: "STORY_UPDATED" } }), 1);
    assert.equal(await prisma.requirementRevision.count({ where: { requirementId: requirement.id } }), 1);
    assert.equal(await prisma.userStoryRevision.count({ where: { userStoryId: userStory.id } }), 1);
    assert.equal(await prisma.requirementAnalysisSource.count({ where: { requirementId: requirement.id, analysisId: analysis.id } }), 1);
    assert.equal((await prisma.userStory.findUniqueOrThrow({ where: { id: userStory.id } })).generatedByAnalysisId, analysis.id);

    assert.equal(
      (await linkRequirementRoute(request(linkUrl, "POST", fixture.ownerCookie, { requirementId: requirement.id }), routeContext(userStory.id))).status,
      409,
    );
    assert.equal(await prisma.activityLog.count({ where: { projectId: fixture.projectId, action: "STORY_UPDATED" } }), 1);

    const stateBeforeDeniedUnlink = await readLinkState(fixture.projectId, requirement.id, userStory.id, analysis.id);
    const unlinkUrl = `http://localhost/api/user-stories/${userStory.id}/requirements/${requirement.id}`;
    assert.equal((await unlinkRequirementRoute(request(unlinkUrl, "DELETE"), linkRouteContext(userStory.id, requirement.id))).status, 401);
    assert.equal(
      (await unlinkRequirementRoute(request(unlinkUrl, "DELETE", fixture.otherUserCookie), linkRouteContext(userStory.id, requirement.id))).status,
      403,
    );
    assert.deepEqual(await readLinkState(fixture.projectId, requirement.id, userStory.id, analysis.id), stateBeforeDeniedUnlink);

    assert.equal((await unlinkRequirementRoute(request(unlinkUrl, "DELETE", fixture.ownerCookie), linkRouteContext(userStory.id, requirement.id))).status, 204);
    assert.equal(await prisma.requirementUserStory.count({ where: { requirementId: requirement.id, userStoryId: userStory.id } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { projectId: fixture.projectId, action: "STORY_UPDATED" } }), 2);
    assert.equal(await prisma.requirementRevision.count({ where: { requirementId: requirement.id } }), 1);
    assert.equal(await prisma.userStoryRevision.count({ where: { userStoryId: userStory.id } }), 1);
    assert.equal(await prisma.requirementAnalysisSource.count({ where: { requirementId: requirement.id, analysisId: analysis.id } }), 1);

    assert.equal((await unlinkRequirementRoute(request(unlinkUrl, "DELETE", fixture.ownerCookie), linkRouteContext(userStory.id, requirement.id))).status, 404);
    assert.equal(
      (await unlinkRequirementRoute(request(`http://localhost/api/user-stories/${missingId}/requirements/${requirement.id}`, "DELETE", fixture.ownerCookie), linkRouteContext(missingId, requirement.id))).status,
      404,
    );
  } finally {
    await deleteFixture(fixture);
  }
});

type Fixture = {
  ownerId: string;
  otherUserId: string;
  projectId: string;
  otherProjectId: string;
  ownerCookie: string;
  otherUserCookie: string;
};

async function createFixture(scope: string): Promise<Fixture> {
  const suffix = randomBytes(6).toString("hex");
  const [owner, otherUser] = await Promise.all([
    prisma.user.create({ data: { name: `Proprietário ${scope}`, email: `${scope}-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
    prisma.user.create({ data: { name: `Outro proprietário ${scope}`, email: `${scope}-other-${suffix}@example.test`, passwordHash: "test-only" } }),
  ]);
  const [project, otherProject] = await Promise.all([
    prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto ${scope} ${suffix}`,
        description: "Projeto temporário para validar rotas HTTP de artefatos de revisão.",
        objective: "Preservar autorização e integridade no PostgreSQL.",
        context: "Dados isolados de testes automatizados.",
      },
    }),
    prisma.project.create({
      data: {
        ownerId: otherUser.id,
        name: `Projeto externo ${scope} ${suffix}`,
        description: "Projeto temporário pertencente a outro usuário.",
        objective: "Validar isolamento entre proprietários.",
        context: "Dados isolados de testes automatizados.",
      },
    }),
  ]);

  return {
    ownerId: owner.id,
    otherUserId: otherUser.id,
    projectId: project.id,
    otherProjectId: otherProject.id,
    ownerCookie: `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`,
    otherUserCookie: `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`,
  };
}

async function createAnalysis(projectId: string, requestedById: string) {
  return prisma.aIAnalysis.create({
    data: {
      projectId,
      requestedById,
      type: "REQUIREMENT_EXTRACTION",
      status: "SUCCEEDED",
      provider: "mock",
      model: "mock-model",
      promptVersion: "test",
      promptText: "Prompt temporário sem dados sensíveis.",
      inputSnapshot: { source: "test" },
    },
  });
}

async function readReviewArtifactState(projectId: string, primaryId: string, createdId: string, type: "ambiguity" | "suggestion" = "ambiguity") {
  const [primary, created, activityCount] = await Promise.all([
    type === "ambiguity"
      ? prisma.ambiguity.findUniqueOrThrow({ where: { id: primaryId }, select: { projectId: true, description: true, severity: true, status: true, resolution: true, resolvedById: true, resolvedAt: true, generatedByAnalysisId: true } })
      : prisma.suggestion.findUniqueOrThrow({ where: { id: primaryId }, select: { projectId: true, description: true, status: true, decidedById: true, decidedAt: true, generatedByAnalysisId: true } }),
    type === "ambiguity"
      ? prisma.ambiguity.findUniqueOrThrow({ where: { id: createdId }, select: { projectId: true, description: true, severity: true, status: true } })
      : prisma.suggestion.findUniqueOrThrow({ where: { id: createdId }, select: { projectId: true, description: true, status: true } }),
    prisma.activityLog.count({ where: { projectId } }),
  ]);

  return {
    primary: normalizeDates(primary),
    created,
    activityCount,
  };
}

function normalizeDates<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item instanceof Date ? item.toISOString() : item]));
}

async function readLinkState(projectId: string, requirementId: string, userStoryId: string, analysisId: string) {
  const [linkCount, activityCount, requirementRevisionCount, userStoryRevisionCount, analysisSourceCount, userStory] = await Promise.all([
    prisma.requirementUserStory.count({ where: { requirementId, userStoryId } }),
    prisma.activityLog.count({ where: { projectId } }),
    prisma.requirementRevision.count({ where: { requirementId } }),
    prisma.userStoryRevision.count({ where: { userStoryId } }),
    prisma.requirementAnalysisSource.count({ where: { requirementId, analysisId } }),
    prisma.userStory.findUniqueOrThrow({ where: { id: userStoryId }, select: { generatedByAnalysisId: true } }),
  ]);
  return { linkCount, activityCount, requirementRevisionCount, userStoryRevisionCount, analysisSourceCount, userStory };
}

async function deleteFixture(fixture: Fixture) {
  for (const projectId of [fixture.projectId, fixture.otherProjectId]) {
    await prisma.activityLog.deleteMany({ where: { projectId } });
    await prisma.acceptanceCriterionRevision.deleteMany({ where: { userStory: { projectId } } });
    await prisma.acceptanceCriterion.deleteMany({ where: { userStory: { projectId } } });
    await prisma.requirementUserStory.deleteMany({ where: { userStory: { projectId } } });
    await prisma.requirementAnswerSource.deleteMany({ where: { requirement: { projectId } } });
    await prisma.requirementAnalysisSource.deleteMany({ where: { requirement: { projectId } } });
    await prisma.requirementRevision.deleteMany({ where: { requirement: { projectId } } });
    await prisma.userStoryRevision.deleteMany({ where: { userStory: { projectId } } });
    await prisma.requirement.deleteMany({ where: { projectId } });
    await prisma.userStory.deleteMany({ where: { projectId } });
    await prisma.ambiguity.deleteMany({ where: { projectId } });
    await prisma.suggestion.deleteMany({ where: { projectId } });
    await prisma.aIAnalysisSession.deleteMany({ where: { analysis: { projectId } } });
    await prisma.aIAnalysis.deleteMany({ where: { projectId } });
    await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
    await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
    await prisma.elicitationSession.deleteMany({ where: { projectId } });
    await prisma.stakeholder.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
  }
  await prisma.user.delete({ where: { id: fixture.ownerId } });
  await prisma.user.delete({ where: { id: fixture.otherUserId } });
}
