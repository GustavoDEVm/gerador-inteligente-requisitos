import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PATCH as archiveProjectRoute } from "../../src/app/api/projects/[id]/archive/route";
import { GET as getProjectRoute, PATCH as updateProjectRoute } from "../../src/app/api/projects/[id]/route";
import { GET as listProjectSessionsRoute, POST as createSessionRoute } from "../../src/app/api/projects/[id]/sessions/route";
import { GET as listStakeholdersRoute, POST as createStakeholderRoute } from "../../src/app/api/projects/[id]/stakeholders/route";
import { GET as listProjectsRoute } from "../../src/app/api/projects/route";
import { GET as getSessionRoute, PATCH as updateSessionRoute } from "../../src/app/api/sessions/[id]/route";
import { DELETE as deleteStakeholderRoute, PATCH as updateStakeholderRoute } from "../../src/app/api/stakeholders/[id]/route";
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

test("as rotas de projetos, stakeholders e arquivamento preservam propriedade e histórico", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;
  let otherProjectId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Proprietário dos projetos", email: `project-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Outro proprietário", email: `project-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;

    const [project, otherProject] = await Promise.all([
      prisma.project.create({
        data: {
          ownerId: owner.id,
          name: `Projeto HTTP ${suffix}`,
          description: "Projeto temporário para validar as rotas HTTP de projetos.",
          objective: "Cobrir listagem, consulta, atualização e arquivamento.",
          context: "Teste automatizado de autorização e persistência.",
        },
      }),
      prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: `Projeto de outro usuário ${suffix}`,
          description: "Projeto temporário que não pode aparecer para o proprietário principal.",
          objective: "Validar isolamento de listagens.",
          context: "Teste automatizado de autorização e persistência.",
        },
      }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;

    const historySession = await prisma.elicitationSession.create({
      data: {
        projectId: project.id,
        createdById: owner.id,
        sequence: 1,
        context: "Sessão histórica que deve permanecer após o arquivamento.",
      },
    });
    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId: project.id,
        requestedById: owner.id,
        type: "REQUIREMENT_EXTRACTION",
        status: "SUCCEEDED",
        provider: "mock",
        model: "mock-model",
        promptVersion: "test",
        promptText: "Prompt temporário sem dados sensíveis.",
        inputSnapshot: { source: "test" },
      },
    });
    await prisma.aIAnalysisSession.create({ data: { analysisId: analysis.id, sessionId: historySession.id } });
    const requirement = await prisma.requirement.create({
      data: {
        projectId: project.id,
        createdById: owner.id,
        code: "RF-901",
        title: "Preservar histórico arquivado",
        description: "O sistema deve preservar requisitos após arquivar um projeto.",
        type: "FUNCTIONAL",
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

    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;

    assert.equal((await listProjectsRoute(request("http://localhost/api/projects", "GET"))).status, 401);
    const initialList = await listProjectsRoute(request("http://localhost/api/projects", "GET", ownerCookie));
    assert.equal(initialList.status, 200);
    const initialProjects = (await initialList.json() as { data: Array<{ id: string }> }).data;
    assert.deepEqual(initialProjects.map((item) => item.id), [project.id]);
    const otherUserList = await listProjectsRoute(request("http://localhost/api/projects", "GET", otherUserCookie));
    assert.deepEqual((await otherUserList.json() as { data: Array<{ id: string }> }).data.map((item) => item.id), [otherProject.id]);
    assert.equal((await listProjectsRoute(request("http://localhost/api/projects?status=INVALID", "GET", ownerCookie))).status, 400);

    const ownerProject = await getProjectRoute(request(`http://localhost/api/projects/${project.id}`, "GET", ownerCookie), routeContext(project.id));
    assert.equal(ownerProject.status, 200);
    assert.equal((await ownerProject.json() as { data: { id: string; owner: { id: string } } }).data.owner.id, owner.id);
    assert.equal((await getProjectRoute(request(`http://localhost/api/projects/${project.id}`, "GET"), routeContext(project.id))).status, 401);
    assert.equal((await getProjectRoute(request(`http://localhost/api/projects/${project.id}`, "GET", otherUserCookie), routeContext(project.id))).status, 403);
    assert.equal((await getProjectRoute(request(`http://localhost/api/projects/${missingId}`, "GET", ownerCookie), routeContext(missingId))).status, 404);

    assert.equal(
      (await updateProjectRoute(request(`http://localhost/api/projects/${project.id}`, "PATCH", ownerCookie, {}), routeContext(project.id))).status,
      400,
    );
    const updateProject = await updateProjectRoute(
      request(`http://localhost/api/projects/${project.id}`, "PATCH", ownerCookie, {
        name: `Projeto HTTP atualizado ${suffix}`,
        ownerId: otherUser.id,
      }),
      routeContext(project.id),
    );
    assert.equal(updateProject.status, 200);
    assert.equal((await updateProject.json() as { data: { ownerId: string } }).data.ownerId, owner.id);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).name, `Projeto HTTP atualizado ${suffix}`);
    assert.equal((await updateProjectRoute(request(`http://localhost/api/projects/${project.id}`, "PATCH"), routeContext(project.id))).status, 401);
    assert.equal(
      (await updateProjectRoute(request(`http://localhost/api/projects/${project.id}`, "PATCH", otherUserCookie, { name: "Tentativa externa" }), routeContext(project.id))).status,
      403,
    );
    assert.equal(
      (await updateProjectRoute(request(`http://localhost/api/projects/${missingId}`, "PATCH", ownerCookie, { name: "Não encontrado" }), routeContext(missingId))).status,
      404,
    );

    const invalidStakeholder = await createStakeholderRoute(
      request(`http://localhost/api/projects/${project.id}/stakeholders`, "POST", ownerCookie, { name: " " }),
      routeContext(project.id),
    );
    assert.equal(invalidStakeholder.status, 400);
    const firstStakeholder = await createStakeholderRoute(
      request(`http://localhost/api/projects/${project.id}/stakeholders`, "POST", ownerCookie, { name: "Cliente", role: "Valida requisitos" }),
      routeContext(project.id),
    );
    const secondStakeholder = await createStakeholderRoute(
      request(`http://localhost/api/projects/${project.id}/stakeholders`, "POST", ownerCookie, { name: "Administrador", role: "Mantém o catálogo" }),
      routeContext(project.id),
    );
    assert.equal(firstStakeholder.status, 201);
    assert.equal(secondStakeholder.status, 201);
    const firstStakeholderId = (await firstStakeholder.json() as { data: { id: string } }).data.id;
    const secondStakeholderId = (await secondStakeholder.json() as { data: { id: string } }).data.id;

    const stakeholderList = await listStakeholdersRoute(request(`http://localhost/api/projects/${project.id}/stakeholders`, "GET", ownerCookie), routeContext(project.id));
    assert.equal(stakeholderList.status, 200);
    assert.deepEqual(
      (await stakeholderList.json() as { data: Array<{ id: string }> }).data.map((item) => item.id).sort(),
      [firstStakeholderId, secondStakeholderId].sort(),
    );
    assert.equal(
      (await updateStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "PATCH", ownerCookie, { role: "Valida requisitos revisados" }), routeContext(firstStakeholderId))).status,
      200,
    );
    assert.equal(
      (await deleteStakeholderRoute(request(`http://localhost/api/stakeholders/${secondStakeholderId}`, "DELETE", ownerCookie), routeContext(secondStakeholderId))).status,
      204,
    );
    assert.deepEqual(
      await prisma.stakeholder.findMany({ where: { projectId: project.id }, select: { id: true, role: true }, orderBy: { id: "asc" } }),
      [{ id: firstStakeholderId, role: "Valida requisitos revisados" }],
    );
    assert.equal((await listStakeholdersRoute(request(`http://localhost/api/projects/${project.id}/stakeholders`, "GET"), routeContext(project.id))).status, 401);
    assert.equal(
      (await createStakeholderRoute(request(`http://localhost/api/projects/${project.id}/stakeholders`, "POST"), routeContext(project.id))).status,
      401,
    );
    assert.equal((await updateStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "PATCH"), routeContext(firstStakeholderId))).status, 401);
    assert.equal((await deleteStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "DELETE"), routeContext(firstStakeholderId))).status, 401);
    assert.equal(
      (await listStakeholdersRoute(request(`http://localhost/api/projects/${project.id}/stakeholders`, "GET", otherUserCookie), routeContext(project.id))).status,
      403,
    );
    assert.equal(
      (await createStakeholderRoute(request(`http://localhost/api/projects/${project.id}/stakeholders`, "POST", otherUserCookie, { name: "Tentativa externa" }), routeContext(project.id))).status,
      403,
    );
    assert.equal(
      (await listStakeholdersRoute(request(`http://localhost/api/projects/${missingId}/stakeholders`, "GET", ownerCookie), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await createStakeholderRoute(request(`http://localhost/api/projects/${missingId}/stakeholders`, "POST", ownerCookie, { name: "Não encontrado" }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await updateStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "PATCH", ownerCookie, {}), routeContext(firstStakeholderId))).status,
      400,
    );
    assert.equal(
      (await updateStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "PATCH", otherUserCookie, { name: "Tentativa externa" }), routeContext(firstStakeholderId))).status,
      403,
    );
    assert.equal(
      (await deleteStakeholderRoute(request(`http://localhost/api/stakeholders/${firstStakeholderId}`, "DELETE", otherUserCookie), routeContext(firstStakeholderId))).status,
      403,
    );
    assert.equal(
      (await updateStakeholderRoute(request(`http://localhost/api/stakeholders/${missingId}`, "PATCH", ownerCookie, { name: "Não encontrado" }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await deleteStakeholderRoute(request(`http://localhost/api/stakeholders/${missingId}`, "DELETE", ownerCookie), routeContext(missingId))).status,
      404,
    );

    const archive = await archiveProjectRoute(request(`http://localhost/api/projects/${project.id}/archive`, "PATCH", ownerCookie, {}), routeContext(project.id));
    assert.equal(archive.status, 200);
    const archivedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(archivedProject.status, "ARCHIVED");
    assert.ok(archivedProject.archivedAt);
    assert.equal(await prisma.requirement.count({ where: { id: requirement.id } }), 1);
    assert.equal(await prisma.requirementRevision.count({ where: { requirementId: requirement.id } }), 1);
    assert.equal(await prisma.aIAnalysis.count({ where: { id: analysis.id } }), 1);
    assert.equal(await prisma.aIAnalysisSession.count({ where: { analysisId: analysis.id, sessionId: historySession.id } }), 1);
    assert.deepEqual(
      await prisma.activityLog.findMany({ where: { projectId: project.id }, select: { action: true }, orderBy: { action: "asc" } }),
      [{ action: "PROJECT_UPDATED" }, { action: "PROJECT_ARCHIVED" }],
    );

    const defaultListAfterArchive = await listProjectsRoute(request("http://localhost/api/projects", "GET", ownerCookie));
    assert.equal(defaultListAfterArchive.status, 200);
    assert.equal((await defaultListAfterArchive.json() as { data: Array<{ id: string }> }).data.some((item) => item.id === project.id), false);
    const archivedList = await listProjectsRoute(request("http://localhost/api/projects?includeArchived=true", "GET", ownerCookie));
    assert.equal((await archivedList.json() as { data: Array<{ id: string }> }).data.some((item) => item.id === project.id), true);
    const archivedOnlyList = await listProjectsRoute(request("http://localhost/api/projects?status=ARCHIVED", "GET", ownerCookie));
    assert.deepEqual((await archivedOnlyList.json() as { data: Array<{ id: string }> }).data.map((item) => item.id), [project.id]);
    assert.equal((await getProjectRoute(request(`http://localhost/api/projects/${project.id}`, "GET", ownerCookie), routeContext(project.id))).status, 200);

    const stateBeforeDeniedRequests = await readProjectState(project.id, firstStakeholderId, historySession.id, requirement.id, analysis.id);
    assert.equal((await archiveProjectRoute(request(`http://localhost/api/projects/${project.id}/archive`, "PATCH"), routeContext(project.id))).status, 401);
    assert.equal(
      (await archiveProjectRoute(request(`http://localhost/api/projects/${project.id}/archive`, "PATCH", otherUserCookie, {}), routeContext(project.id))).status,
      403,
    );
    assert.equal(
      (await archiveProjectRoute(request(`http://localhost/api/projects/${missingId}/archive`, "PATCH", ownerCookie, {}), routeContext(missingId))).status,
      404,
    );
    assert.deepEqual(
      await readProjectState(project.id, firstStakeholderId, historySession.id, requirement.id, analysis.id),
      stateBeforeDeniedRequests,
    );
  } finally {
    if (projectId) await deleteProjectGraph(projectId);
    if (otherProjectId) await deleteProjectGraph(otherProjectId);
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});

test("as rotas de sessões de elicitação preservam vínculo, validação e propriedade", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Proprietário das sessões", email: `session-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Outro proprietário das sessões", email: `session-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de sessões HTTP ${suffix}`,
        description: "Projeto temporário para validar as rotas de sessões.",
        objective: "Cobrir criação, listagem, consulta e atualização.",
        context: "Teste automatizado de autorização e persistência.",
      },
    });
    projectId = project.id;

    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
    const sessionUrl = `http://localhost/api/projects/${project.id}/sessions`;

    assert.equal((await createSessionRoute(request(sessionUrl, "POST"), routeContext(project.id))).status, 401);
    assert.equal((await listProjectSessionsRoute(request(sessionUrl, "GET"), routeContext(project.id))).status, 401);
    assert.equal(
      (await createSessionRoute(request(sessionUrl, "POST", ownerCookie, { context: " " }), routeContext(project.id))).status,
      400,
    );
    assert.equal(await prisma.elicitationSession.count({ where: { projectId: project.id } }), 0);
    assert.equal(
      (await createSessionRoute(request(`http://localhost/api/projects/${missingId}/sessions`, "POST", ownerCookie, { context: "Sessão inexistente" }), routeContext(missingId))).status,
      404,
    );
    assert.equal(
      (await listProjectSessionsRoute(request(`http://localhost/api/projects/${missingId}/sessions`, "GET", ownerCookie), routeContext(missingId))).status,
      404,
    );

    const createSession = await createSessionRoute(
      request(sessionUrl, "POST", ownerCookie, { title: "Levantamento HTTP", context: "Contexto inicial da sessão criada pela rota pública.", status: "ACTIVE" }),
      routeContext(project.id),
    );
    assert.equal(createSession.status, 201);
    const createdSession = (await createSession.json() as { data: { id: string; projectId: string; createdById: string; sequence: number; status: string } }).data;
    assert.equal(createdSession.projectId, project.id);
    assert.equal(createdSession.createdById, owner.id);
    assert.equal(createdSession.sequence, 1);
    assert.equal(createdSession.status, "ACTIVE");

    const listedSessions = await listProjectSessionsRoute(request(sessionUrl, "GET", ownerCookie), routeContext(project.id));
    assert.equal(listedSessions.status, 200);
    assert.deepEqual((await listedSessions.json() as { data: Array<{ id: string }> }).data.map((item) => item.id), [createdSession.id]);
    const fetchedSession = await getSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "GET", ownerCookie), routeContext(createdSession.id));
    assert.equal(fetchedSession.status, 200);
    assert.equal((await fetchedSession.json() as { data: { project: { id: string } } }).data.project.id, project.id);

    assert.equal(
      (await updateSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "PATCH", ownerCookie, {}), routeContext(createdSession.id))).status,
      400,
    );
    const updateSession = await updateSessionRoute(
      request(`http://localhost/api/sessions/${createdSession.id}`, "PATCH", ownerCookie, { title: "Levantamento concluído", status: "COMPLETED" }),
      routeContext(createdSession.id),
    );
    assert.equal(updateSession.status, 200);
    const persistedSession = await prisma.elicitationSession.findUniqueOrThrow({ where: { id: createdSession.id } });
    assert.equal(persistedSession.title, "Levantamento concluído");
    assert.equal(persistedSession.status, "COMPLETED");
    assert.ok(persistedSession.completedAt);
    assert.deepEqual(
      await prisma.activityLog.findMany({ where: { projectId: project.id }, select: { action: true }, orderBy: { action: "asc" } }),
      [{ action: "SESSION_STARTED" }, { action: "SESSION_COMPLETED" }],
    );

    const stateBeforeDeniedRequests = await readSessionState(project.id, createdSession.id);
    for (const response of await Promise.all([
      getSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "GET"), routeContext(createdSession.id)),
      updateSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "PATCH"), routeContext(createdSession.id)),
      listProjectSessionsRoute(request(sessionUrl, "GET"), routeContext(project.id)),
      createSessionRoute(request(sessionUrl, "POST"), routeContext(project.id)),
    ])) {
      assert.equal(response.status, 401);
    }
    for (const response of await Promise.all([
      listProjectSessionsRoute(request(sessionUrl, "GET", otherUserCookie), routeContext(project.id)),
      createSessionRoute(request(sessionUrl, "POST", otherUserCookie, { context: "Tentativa externa" }), routeContext(project.id)),
      getSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "GET", otherUserCookie), routeContext(createdSession.id)),
      updateSessionRoute(request(`http://localhost/api/sessions/${createdSession.id}`, "PATCH", otherUserCookie, { title: "Tentativa externa" }), routeContext(createdSession.id)),
    ])) {
      assert.equal(response.status, 403);
    }
    assert.equal((await getSessionRoute(request(`http://localhost/api/sessions/${missingId}`, "GET", ownerCookie), routeContext(missingId))).status, 404);
    assert.equal(
      (await updateSessionRoute(request(`http://localhost/api/sessions/${missingId}`, "PATCH", ownerCookie, { title: "Não encontrada" }), routeContext(missingId))).status,
      404,
    );
    assert.deepEqual(await readSessionState(project.id, createdSession.id), stateBeforeDeniedRequests);
  } finally {
    if (projectId) await deleteProjectGraph(projectId);
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});

async function readProjectState(projectId: string, stakeholderId: string, sessionId: string, requirementId: string, analysisId: string) {
  const [project, stakeholder, session, requirement, activityActions, revisionCount, analysisCount, analysisSessionCount] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerId: true, name: true, status: true, archivedAt: true } }),
    prisma.stakeholder.findUniqueOrThrow({ where: { id: stakeholderId }, select: { projectId: true, name: true, role: true } }),
    prisma.elicitationSession.findUniqueOrThrow({ where: { id: sessionId }, select: { projectId: true, sequence: true, status: true } }),
    prisma.requirement.findUniqueOrThrow({ where: { id: requirementId }, select: { projectId: true, title: true, version: true } }),
    prisma.activityLog.findMany({ where: { projectId }, select: { action: true }, orderBy: { action: "asc" } }),
    prisma.requirementRevision.count({ where: { requirementId } }),
    prisma.aIAnalysis.count({ where: { id: analysisId } }),
    prisma.aIAnalysisSession.count({ where: { analysisId, sessionId } }),
  ]);

  return {
    project: { ...project, archivedAt: project.archivedAt?.toISOString() ?? null },
    stakeholder,
    session,
    requirement,
    activityActions,
    revisionCount,
    analysisCount,
    analysisSessionCount,
  };
}

async function readSessionState(projectId: string, sessionId: string) {
  const [session, sessionCount, activityActions] = await Promise.all([
    prisma.elicitationSession.findUniqueOrThrow({ where: { id: sessionId }, select: { projectId: true, createdById: true, title: true, context: true, status: true, sequence: true, completedAt: true } }),
    prisma.elicitationSession.count({ where: { projectId } }),
    prisma.activityLog.findMany({ where: { projectId }, select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  return {
    session: { ...session, completedAt: session.completedAt?.toISOString() ?? null },
    sessionCount,
    activityActions,
  };
}

async function deleteProjectGraph(projectId: string) {
  await prisma.activityLog.deleteMany({ where: { projectId } });
  await prisma.aIAnalysisSession.deleteMany({ where: { session: { projectId } } });
  await prisma.aIAnalysis.deleteMany({ where: { projectId } });
  await prisma.requirement.deleteMany({ where: { projectId } });
  await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
  await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
  await prisma.elicitationSession.deleteMany({ where: { projectId } });
  await prisma.stakeholder.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
}
