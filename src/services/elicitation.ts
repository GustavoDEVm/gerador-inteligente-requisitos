import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api/errors";
import { logActivity, nextPosition, requireOwnedProject, requireOwnedQuestion, requireOwnedSession, requireUser } from "@/services/shared";

type SessionStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export const INITIAL_DESCRIPTION_QUESTION = "Descreva a necessidade inicial do sistema.";
const INITIAL_DESCRIPTION_GUIDANCE = "Registre o problema, os usuários envolvidos e o resultado esperado com as informações disponíveis neste momento.";

export async function listSessions(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.elicitationSession.findMany({
    where: { projectId },
    include: { _count: { select: { questions: true } }, createdBy: { select: { id: true, name: true } } },
    orderBy: { sequence: "asc" },
  });
}

export async function getSession(id: string, userId: string) {
  await requireOwnedSession(prisma, id, userId);
  const session = await prisma.elicitationSession.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      questions: { orderBy: { position: "asc" }, include: { answers: { orderBy: { version: "asc" }, include: { author: { select: { id: true, name: true } } } } } },
    },
  });
  if (!session) throw notFound("Sessão de elicitação");
  return session;
}

export async function createSession(projectId: string, userId: string, data: { title?: string; context: string; status?: SessionStatus; sequence?: number }) {
  return prisma.$transaction(async (db) => {
    await requireOwnedProject(db, projectId, userId);
    await requireUser(db, userId);
    const status = data.status ?? "DRAFT";
    const session = await db.elicitationSession.create({
      data: {
        ...data,
        projectId,
        createdById: userId,
        sequence: data.sequence ?? (await nextPosition(db, "session", projectId)),
        status,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        completedAt: status === "COMPLETED" || status === "CANCELLED" ? new Date() : undefined,
      },
    });
    if (status === "ACTIVE" || status === "COMPLETED") {
      await logActivity(db, {
        projectId,
        actorId: userId,
        action: status === "COMPLETED" ? "SESSION_COMPLETED" : "SESSION_STARTED",
        entityType: "SESSION",
        entityId: session.id,
        summary: `Sessão ${session.sequence} ${status === "COMPLETED" ? "concluída" : "iniciada"}.`,
      });
    }
    return session;
  });
}

export async function startElicitationSession(projectId: string, userId: string, data: { title?: string; description: string }) {
  return prisma.$transaction(async (db) => {
    await requireOwnedProject(db, projectId, userId);
    await requireUser(db, userId);
    const session = await db.elicitationSession.create({
      data: {
        projectId,
        createdById: userId,
        sequence: await nextPosition(db, "session", projectId),
        title: data.title,
        context: data.description,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    const question = await db.elicitationQuestion.create({
      data: {
        sessionId: session.id,
        position: 1,
        content: INITIAL_DESCRIPTION_QUESTION,
        guidance: INITIAL_DESCRIPTION_GUIDANCE,
        source: "TEMPLATE",
        askedAt: new Date(),
      },
    });
    const answer = await db.elicitationAnswer.create({
      data: {
        questionId: question.id,
        authorId: userId,
        version: 1,
        content: data.description,
      },
    });
    await logActivity(db, {
      projectId,
      actorId: userId,
      action: "SESSION_STARTED",
      entityType: "SESSION",
      entityId: session.id,
      summary: `Sessão ${session.sequence} iniciada com descrição inicial.`,
    });
    await logActivity(db, {
      projectId,
      actorId: userId,
      action: "QUESTION_ADDED",
      entityType: "QUESTION",
      entityId: question.id,
      summary: `Pergunta inicial adicionada à sessão ${session.sequence}.`,
    });
    await logActivity(db, {
      projectId,
      actorId: userId,
      action: "ANSWER_RECORDED",
      entityType: "ANSWER",
      entityId: answer.id,
      summary: "Descrição inicial registrada no histórico da elicitação.",
    });

    return { session, question, answer };
  });
}

export async function updateSession(id: string, userId: string, data: { title?: string | null; context?: string; status?: SessionStatus }) {
  return prisma.$transaction(async (db) => {
    const before = await requireOwnedSession(db, id, userId);
    const nextStatus = data.status ?? before.status;
    const session = await db.elicitationSession.update({
      where: { id },
      data: {
        ...data,
        startedAt: nextStatus === "ACTIVE" && !before.startedAt ? new Date() : before.startedAt,
        completedAt: nextStatus === "COMPLETED" || nextStatus === "CANCELLED" ? before.completedAt ?? new Date() : null,
      },
    });
    if (data.status && data.status !== before.status && (data.status === "ACTIVE" || data.status === "COMPLETED")) {
      await logActivity(db, {
        projectId: session.projectId,
        actorId: userId,
        action: data.status === "COMPLETED" ? "SESSION_COMPLETED" : "SESSION_STARTED",
        entityType: "SESSION",
        entityId: id,
        summary: `Sessão ${session.sequence} ${data.status === "COMPLETED" ? "concluída" : "iniciada"}.`,
      });
    }
    return session;
  });
}

export async function listQuestions(sessionId: string, userId: string) {
  const session = await requireOwnedSession(prisma, sessionId, userId);
  const [latestRefinementAnalysis, latestAmbiguityAnalysis, questions] = await Promise.all([
    prisma.aIAnalysis.findFirst({
      where: {
        projectId: session.projectId,
        type: "QUESTION_GENERATION",
        status: "SUCCEEDED",
        sessions: { some: { sessionId } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.aIAnalysis.findFirst({
      where: {
        projectId: session.projectId,
        type: "AMBIGUITY_DETECTION",
        status: "SUCCEEDED",
        sessions: { some: { sessionId } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.elicitationQuestion.findMany({
      where: { sessionId },
      include: {
        answers: { orderBy: { version: "asc" }, include: { author: { select: { id: true, name: true } } } },
        generatedByAnalysis: { select: { id: true, structuredOutput: true } },
      },
      orderBy: { position: "asc" },
    }),
  ]);

  if (!latestRefinementAnalysis) return questions.filter((question) => question.source !== "AI");

  const latestAmbiguityIds = latestAmbiguityAnalysis
    ? new Set((await prisma.ambiguity.findMany({
      where: { projectId: session.projectId, generatedByAnalysisId: latestAmbiguityAnalysis.id },
      select: { id: true },
    })).map((ambiguity) => ambiguity.id))
    : null;

  return questions.filter((question) => {
    if (question.source !== "AI") return true;
    if (question.generatedByAnalysisId !== latestRefinementAnalysis.id) return false;
    if (!latestAmbiguityIds) return true;

    const ambiguityId = getRefinementQuestionAmbiguityId(question.generatedByAnalysis?.structuredOutput, question.id);
    return ambiguityId !== null && latestAmbiguityIds.has(ambiguityId);
  });
}

function getRefinementQuestionAmbiguityId(value: unknown, questionId: string): string | null {
  if (!value || typeof value !== "object" || !("questions" in value) || !Array.isArray(value.questions)) return null;
  const question = value.questions.find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).questionId === questionId
  ));
  return question && typeof question.ambiguityId === "string" ? question.ambiguityId : null;
}

export async function createQuestion(sessionId: string, userId: string, data: { content: string; guidance?: string; source?: "MANUAL" | "TEMPLATE"; position?: number }) {
  return prisma.$transaction(async (db) => {
    const session = await requireOwnedSession(db, sessionId, userId);
    const question = await db.elicitationQuestion.create({
      data: {
        ...data,
        sessionId,
        source: data.source ?? "MANUAL",
        position: data.position ?? (await nextPosition(db, "question", sessionId)),
        askedAt: new Date(),
      },
    });
    await logActivity(db, {
      projectId: session.projectId,
      actorId: userId,
      action: "QUESTION_ADDED",
      entityType: "QUESTION",
      entityId: question.id,
      summary: `Pergunta ${question.position} adicionada à sessão ${session.sequence}.`,
    });
    return question;
  });
}

export async function listAnswers(questionId: string, userId: string) {
  await requireOwnedQuestion(prisma, questionId, userId);
  return prisma.elicitationAnswer.findMany({
    where: { questionId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { version: "asc" },
  });
}

export async function appendAnswer(questionId: string, userId: string, data: { content: string }) {
  return prisma.$transaction(async (db) => {
    const question = await requireOwnedQuestion(db, questionId, userId);
    await requireUser(db, userId);
    const latest = await db.elicitationAnswer.findFirst({ where: { questionId }, orderBy: { version: "desc" }, select: { version: true } });
    const answer = await db.elicitationAnswer.create({ data: { ...data, questionId, authorId: userId, version: (latest?.version ?? 0) + 1 } });
    const session = await db.elicitationSession.findUnique({ where: { id: question.sessionId }, select: { projectId: true } });
    if (!session) throw notFound("Sessão de elicitação");
    await logActivity(db, {
      projectId: session.projectId,
      actorId: userId,
      action: "ANSWER_RECORDED",
      entityType: "ANSWER",
      entityId: answer.id,
      summary: `Resposta versão ${answer.version} registrada para a pergunta ${question.position}.`,
    });
    return answer;
  });
}
