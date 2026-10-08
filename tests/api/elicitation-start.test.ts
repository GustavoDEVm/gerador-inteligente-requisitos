import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as startElicitationRoute } from "../../src/app/api/projects/[id]/elicitation/start/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { INITIAL_DESCRIPTION_QUESTION } from "../../src/services/elicitation";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/projects/project-id/elicitation/start", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("a API inicia a elicitação com sessão, pergunta e resposta inicial rastreáveis", async () => {
  const suffix = randomBytes(6).toString("hex");
  const description = "Quero um sistema de biblioteca em que alunos consultem livros disponíveis e solicitem reservas.";
  let projectId: string | undefined;
  let ownerId: string | undefined;
  let otherUserId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Pessoa proprietária da elicitação", email: `elicitation-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Pessoa sem acesso à elicitação", email: `elicitation-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de elicitação ${suffix}`,
        description: "Projeto temporário para validar o início da elicitação.",
        objective: "Registrar uma descrição inicial de forma rastreável.",
        context: "Ambiente automatizado de testes.",
      },
    });
    projectId = project.id;
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;
    const body = { title: "Levantamento inicial", description };

    assert.equal((await startElicitationRoute(request(body), routeContext(project.id))).status, 401);
    assert.equal((await startElicitationRoute(request({ ...body, description: "curta" }, ownerCookie), routeContext(project.id))).status, 400);
    assert.equal((await startElicitationRoute(request(body, ownerCookie), routeContext("00000000-0000-4000-8000-000000000001"))).status, 404);
    assert.equal((await startElicitationRoute(request(body, otherUserCookie), routeContext(project.id))).status, 403);

    const response = await startElicitationRoute(request(body, ownerCookie), routeContext(project.id));
    assert.equal(response.status, 201);
    const payload = await response.json() as { data: { session: { id: string; title: string | null; context: string; status: string; sequence: number }; question: { id: string; content: string; source: string }; answer: { content: string; version: number; authorId: string } } };

    assert.equal(payload.data.session.title, body.title);
    assert.equal(payload.data.session.context, description);
    assert.equal(payload.data.session.status, "ACTIVE");
    assert.equal(payload.data.session.sequence, 1);
    assert.equal(payload.data.question.content, INITIAL_DESCRIPTION_QUESTION);
    assert.equal(payload.data.question.source, "TEMPLATE");
    assert.equal(payload.data.answer.content, description);
    assert.equal(payload.data.answer.version, 1);
    assert.equal(payload.data.answer.authorId, owner.id);

    const persisted = await prisma.elicitationSession.findUniqueOrThrow({
      where: { id: payload.data.session.id },
      include: { questions: { include: { answers: true } } },
    });
    assert.equal(persisted.questions.length, 1);
    assert.equal(persisted.questions[0]?.answers.length, 1);
    assert.equal(persisted.questions[0]?.answers[0]?.content, description);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, action: { in: ["SESSION_STARTED", "QUESTION_ADDED", "ANSWER_RECORDED"] } } }), 3);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
      await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});
