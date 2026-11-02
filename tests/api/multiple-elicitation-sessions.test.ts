import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as startElicitationRoute } from "../../src/app/api/projects/[id]/elicitation/start/route";
import { GET as listSessionsRoute, POST as createSessionRoute } from "../../src/app/api/projects/[id]/sessions/route";
import { GET as getSessionRoute, PATCH as updateSessionRoute } from "../../src/app/api/sessions/[id]/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(url: string, method: string, cookie?: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function startSession(projectId: string, cookie: string, title: string, description: string, draftSessionId?: string) {
  return startElicitationRoute(
    request(`http://localhost/api/projects/${projectId}/elicitation/start`, "POST", cookie, { title, description, ...(draftSessionId ? { draftSessionId } : {}) }),
    routeContext(projectId),
  );
}

async function cleanProject(projectId?: string) {
  if (!projectId) return;
  await prisma.activityLog.deleteMany({ where: { projectId } });
  await prisma.aIAnalysisSession.deleteMany({ where: { session: { projectId } } });
  await prisma.aIAnalysis.deleteMany({ where: { projectId } });
  await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
  await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
  await prisma.elicitationSession.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
}

test("cria, lista e inicializa várias sessões sem misturar seus dados", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let projectId: string | undefined;
  let otherProjectId: string | undefined;

  try {
    const owner = await prisma.user.create({ data: { name: "Pessoa de sessões", email: `multiple-sessions-${suffix}@example.test`, passwordHash: "test-only" } });
    ownerId = owner.id;
    const [project, otherProject] = await Promise.all([
      prisma.project.create({ data: { ownerId: owner.id, name: `Projeto de sessões ${suffix}`, description: "Projeto para validar sessões independentes.", objective: "Validar várias sessões.", context: "Teste automatizado." } }),
      prisma.project.create({ data: { ownerId: owner.id, name: `Outro projeto de sessões ${suffix}`, description: "Projeto separado para validar o vínculo.", objective: "Validar isolamento.", context: "Teste automatizado." } }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;

    const firstResponse = await startSession(project.id, ownerCookie, "Levantamento inicial", "Quero uma loja de roupas em que clientes consultem produtos e realizem pedidos.");
    const secondResponse = await startSession(project.id, ownerCookie, "Gestão de estoque", "Quero detalhar o controle de estoque por tamanho e cor para os produtos da loja.");
    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);
    const first = (await firstResponse.json() as { data: { session: { id: string; sequence: number; status: string; title: string }; question: { id: string } } }).data;
    const second = (await secondResponse.json() as { data: { session: { id: string; sequence: number; status: string; title: string }; question: { id: string } } }).data;
    assert.deepEqual([first.session.sequence, second.session.sequence], [1, 2]);

    const completed = await updateSessionRoute(request(`http://localhost/api/sessions/${first.session.id}`, "PATCH", ownerCookie, { status: "COMPLETED" }), routeContext(first.session.id));
    assert.equal(completed.status, 200);
    const listed = await listSessionsRoute(request(`http://localhost/api/projects/${project.id}/sessions`, "GET", ownerCookie), routeContext(project.id));
    assert.equal(listed.status, 200);
    const sessions = (await listed.json() as { data: Array<{ id: string; sequence: number; title: string | null; status: string; createdAt: string }> }).data;
    assert.deepEqual(sessions.map((session) => [session.sequence, session.title, session.status]), [
      [1, "Levantamento inicial", "COMPLETED"],
      [2, "Gestão de estoque", "ACTIVE"],
    ]);
    assert.ok(sessions.every((session) => Boolean(session.createdAt)));

    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId: project.id,
        requestedById: owner.id,
        type: "REQUIREMENT_EXTRACTION",
        status: "SUCCEEDED",
        provider: "test",
        model: "test",
        promptVersion: "test",
        promptText: "test",
        inputSnapshot: {},
        structuredOutput: {},
        completedAt: new Date(),
        sessions: { create: { sessionId: first.session.id } },
      },
    });
    const secondSession = await getSessionRoute(request(`http://localhost/api/sessions/${second.session.id}`, "GET", ownerCookie), routeContext(second.session.id));
    assert.equal(secondSession.status, 200);
    const secondPayload = (await secondSession.json() as { data: { questions: Array<{ id: string; answers: unknown[] }>; analyses: unknown[] } }).data;
    assert.deepEqual(secondPayload.questions.map((question) => question.id), [second.question.id]);
    assert.equal(secondPayload.questions[0]?.answers.length, 1);
    assert.equal(secondPayload.analyses.length, 0);
    assert.equal(await prisma.aIAnalysisSession.count({ where: { analysisId: analysis.id, sessionId: first.session.id } }), 1);

    const draftResponse = await createSessionRoute(
      request(`http://localhost/api/projects/${project.id}/sessions`, "POST", ownerCookie, { title: "Compras e pagamentos", context: "Rascunho para detalhar compras e pagamentos." }),
      routeContext(project.id),
    );
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json() as { data: { id: string; sequence: number; status: string } }).data;
    assert.equal(draft.status, "DRAFT");

    const initialized = await startSession(project.id, ownerCookie, "Compras e pagamentos", "Quero definir como clientes autenticados finalizam pedidos e realizam pagamentos.", draft.id);
    assert.equal(initialized.status, 201);
    const initializedSession = (await initialized.json() as { data: { session: { id: string; sequence: number; status: string }; question: { id: string }; answer: { version: number } } }).data;
    assert.equal(initializedSession.session.id, draft.id);
    assert.equal(initializedSession.session.sequence, draft.sequence);
    assert.equal(initializedSession.session.status, "ACTIVE");
    assert.equal(initializedSession.answer.version, 1);
    assert.equal(await prisma.elicitationSession.count({ where: { projectId: project.id } }), 3);
    assert.equal(await prisma.elicitationQuestion.count({ where: { sessionId: draft.id } }), 1);

    const repeatedInitialization = await startSession(project.id, ownerCookie, "Compras e pagamentos", "Quero definir como clientes autenticados finalizam pedidos e realizam pagamentos.", draft.id);
    assert.equal(repeatedInitialization.status, 409);
    assert.equal(await prisma.elicitationSession.count({ where: { projectId: project.id } }), 3);

    const otherDraft = await createSessionRoute(
      request(`http://localhost/api/projects/${otherProject.id}/sessions`, "POST", ownerCookie, { context: "Rascunho pertencente a outro projeto do mesmo usuário." }),
      routeContext(otherProject.id),
    );
    const otherDraftId = (await otherDraft.json() as { data: { id: string } }).data.id;
    const wrongProject = await startSession(project.id, ownerCookie, "Tentativa inválida", "Esta descrição não pode inicializar um rascunho de outro projeto.", otherDraftId);
    assert.equal(wrongProject.status, 400);
    assert.equal(await prisma.elicitationSession.count({ where: { projectId: project.id } }), 3);
  } finally {
    await cleanProject(projectId);
    await cleanProject(otherProjectId);
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  }
});

test("serializa a criação concorrente de sessões com sequências consecutivas", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let projectId: string | undefined;

  try {
    const owner = await prisma.user.create({ data: { name: "Pessoa concorrente", email: `concurrent-sessions-${suffix}@example.test`, passwordHash: "test-only" } });
    ownerId = owner.id;
    const project = await prisma.project.create({ data: { ownerId: owner.id, name: `Projeto concorrente ${suffix}`, description: "Projeto para validar criação concorrente de sessões.", objective: "Serializar sequências.", context: "Teste automatizado." } });
    projectId = project.id;
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const descriptions = [
      "Quero levantar os requisitos iniciais para o catálogo de roupas e os pedidos de clientes.",
      "Quero detalhar regras de controle de estoque por tamanho e cor em cada produto.",
      "Quero definir regras de autenticação e pagamento para a finalização de pedidos.",
    ];

    const responses = await Promise.all(descriptions.map((description, index) => startSession(project.id, ownerCookie, `Sessão concorrente ${index + 1}`, description)));
    assert.deepEqual(responses.map((response) => response.status), [201, 201, 201]);
    const sessions = await prisma.elicitationSession.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" }, include: { questions: { include: { answers: true } } } });
    assert.deepEqual(sessions.map((session) => session.sequence), [1, 2, 3]);
    assert.equal(new Set(sessions.map((session) => session.sequence)).size, 3);
    assert.ok(sessions.every((session) => session.questions.length === 1 && session.questions[0]?.answers.length === 1));
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, action: "SESSION_STARTED" } }), 3);
  } finally {
    await cleanProject(projectId);
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  }
});
