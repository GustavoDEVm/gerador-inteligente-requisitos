import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as appendAnswerRoute } from "../../src/app/api/questions/[id]/answers/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function answerRequest(questionId: string, content: string, cookie?: string) {
  return new Request(`http://localhost/api/questions/${questionId}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ content }),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

test("submissões concorrentes de respostas são serializadas pelo PostgreSQL em versões consecutivas", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let projectId: string | undefined;
  let lockHolder: Promise<unknown> | undefined;
  let firstSubmission: Promise<Response> | undefined;
  let secondSubmission: Promise<Response> | undefined;
  const releaseLock = deferred();

  try {
    const owner = await prisma.user.create({
      data: { name: "Proprietário das respostas concorrentes", email: `answer-concurrency-${suffix}@example.test`, passwordHash: "test-only" },
    });
    ownerId = owner.id;
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Projeto de concorrência de respostas ${suffix}`,
        description: "Projeto temporário para validar respostas versionadas concorrentes.",
        objective: "Preservar todas as respostas submetidas à mesma pergunta.",
        context: "Teste de lock de linha PostgreSQL.",
      },
    });
    projectId = project.id;
    const session = await prisma.elicitationSession.create({
      data: { projectId: project.id, createdById: owner.id, sequence: 1, context: "Sessão temporária de concorrência." },
    });
    const question = await prisma.elicitationQuestion.create({
      data: { sessionId: session.id, position: 1, content: "Qual é a regra de negócio?", source: "MANUAL" },
    });
    await prisma.elicitationAnswer.create({
      data: { questionId: question.id, authorId: owner.id, version: 1, content: "Resposta inicial preservada." },
    });

    const cookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const lockAcquired = deferred();
    lockHolder = prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT "id" FROM "elicitation_questions" WHERE "id" = ${question.id} FOR UPDATE`;
      lockAcquired.resolve();
      await releaseLock.promise;
    });
    await lockAcquired.promise;

    const concurrentContents = [
      "Primeira resposta concorrente preservada.",
      "Segunda resposta concorrente preservada.",
    ];
    firstSubmission = appendAnswerRoute(answerRequest(question.id, concurrentContents[0]!, cookie), routeContext(question.id));
    secondSubmission = appendAnswerRoute(answerRequest(question.id, concurrentContents[1]!, cookie), routeContext(question.id));

    await waitForAnswerLockWaiters(2);
    releaseLock.resolve();
    await lockHolder;

    const [firstResponse, secondResponse] = await Promise.all([firstSubmission, secondSubmission]);
    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);
    const [firstPayload, secondPayload] = await Promise.all([
      firstResponse.json() as Promise<{ data: { id: string; version: number; content: string } }>,
      secondResponse.json() as Promise<{ data: { id: string; version: number; content: string } }>,
    ]);
    assert.deepEqual([firstPayload.data.version, secondPayload.data.version].sort(), [2, 3]);

    const concurrentAnswers = await prisma.elicitationAnswer.findMany({
      where: { questionId: question.id },
      select: { id: true, version: true, content: true },
      orderBy: { version: "asc" },
    });
    assert.deepEqual(concurrentAnswers.map((answer) => answer.version), [1, 2, 3]);
    assert.deepEqual(
      new Set(concurrentAnswers.map((answer) => answer.content)),
      new Set(["Resposta inicial preservada.", ...concurrentContents]),
    );
    const concurrentActivities = await prisma.activityLog.findMany({
      where: { projectId: project.id, action: "ANSWER_RECORDED" },
      select: { entityId: true },
    });
    assert.equal(concurrentActivities.length, 2);
    assert.deepEqual(
      new Set(concurrentActivities.map((activity) => activity.entityId)),
      new Set([firstPayload.data.id, secondPayload.data.id]),
    );

    const subsequentResponse = await appendAnswerRoute(
      answerRequest(question.id, "Resposta posterior recebe a próxima versão.", cookie),
      routeContext(question.id),
    );
    assert.equal(subsequentResponse.status, 201);
    assert.equal((await subsequentResponse.json() as { data: { version: number } }).data.version, 4);
    assert.deepEqual(
      (await prisma.elicitationAnswer.findMany({ where: { questionId: question.id }, select: { version: true }, orderBy: { version: "asc" } })).map((answer) => answer.version),
      [1, 2, 3, 4],
    );
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, action: "ANSWER_RECORDED" } }), 3);

    const answersBeforeUnauthorizedRequest = await prisma.elicitationAnswer.count({ where: { questionId: question.id } });
    const activitiesBeforeUnauthorizedRequest = await prisma.activityLog.count({ where: { projectId: project.id, action: "ANSWER_RECORDED" } });
    const unauthorizedResponse = await appendAnswerRoute(
      answerRequest(question.id, "Resposta sem autenticação não deve ser persistida."),
      routeContext(question.id),
    );
    assert.equal(unauthorizedResponse.status, 401);
    assert.equal(await prisma.elicitationAnswer.count({ where: { questionId: question.id } }), answersBeforeUnauthorizedRequest);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, action: "ANSWER_RECORDED" } }), activitiesBeforeUnauthorizedRequest);
  } finally {
    releaseLock.resolve();
    if (lockHolder) await lockHolder.catch(() => undefined);
    await Promise.allSettled([firstSubmission, secondSubmission].filter((submission): submission is Promise<Response> => Boolean(submission)));
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
      await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
  }
});

async function waitForAnswerLockWaiters(expectedCount: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [result] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM pg_locks AS locks
      INNER JOIN pg_stat_activity AS activity ON activity.pid = locks.pid
      WHERE NOT locks.granted
        AND activity.query LIKE ${'%FROM "elicitation_questions"%FOR UPDATE%'}
    `;
    if (Number(result?.count ?? 0) >= expectedCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  assert.fail("As duas submissões não chegaram ao lock de linha da pergunta dentro do intervalo esperado.");
}
