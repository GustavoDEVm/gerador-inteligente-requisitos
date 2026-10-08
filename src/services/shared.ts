import { Prisma, type PrismaClient } from "../../generated/prisma/client";

import { forbidden, notFound } from "@/lib/api/errors";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export async function requireUser(db: DatabaseClient, id: string) {
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!user) throw notFound("Usuário");
  return user;
}

export async function requireProject(db: DatabaseClient, id: string) {
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw notFound("Projeto");
  return project;
}

export async function requireOwnedProject(db: DatabaseClient, projectId: string, userId: string) {
  const project = await requireProject(db, projectId);
  if (project.ownerId !== userId) throw forbidden();
  return project;
}

export async function requireSession(db: DatabaseClient, id: string) {
  const session = await db.elicitationSession.findUnique({ where: { id } });
  if (!session) throw notFound("Sessão de elicitação");
  return session;
}

export async function requireOwnedSession(db: DatabaseClient, id: string, userId: string) {
  const session = await requireSession(db, id);
  await requireOwnedProject(db, session.projectId, userId);
  return session;
}

export async function requireQuestion(db: DatabaseClient, id: string) {
  const question = await db.elicitationQuestion.findUnique({ where: { id } });
  if (!question) throw notFound("Pergunta de elicitação");
  return question;
}

export async function requireOwnedQuestion(db: DatabaseClient, id: string, userId: string) {
  const question = await requireQuestion(db, id);
  await requireOwnedSession(db, question.sessionId, userId);
  return question;
}

export async function requireRequirement(db: DatabaseClient, id: string) {
  const requirement = await db.requirement.findUnique({ where: { id } });
  if (!requirement) throw notFound("Requisito");
  return requirement;
}

export async function requireOwnedRequirement(db: DatabaseClient, id: string, userId: string) {
  const requirement = await requireRequirement(db, id);
  await requireOwnedProject(db, requirement.projectId, userId);
  return requirement;
}

export async function requireUserStory(db: DatabaseClient, id: string) {
  const userStory = await db.userStory.findUnique({ where: { id } });
  if (!userStory) throw notFound("User Story");
  return userStory;
}

export async function requireOwnedUserStory(db: DatabaseClient, id: string, userId: string) {
  const userStory = await requireUserStory(db, id);
  await requireOwnedProject(db, userStory.projectId, userId);
  return userStory;
}

export async function logActivity(
  db: DatabaseClient,
  input: {
    projectId: string;
    actorId?: string | null;
    action:
      | "PROJECT_CREATED"
      | "PROJECT_UPDATED"
      | "PROJECT_ARCHIVED"
      | "SESSION_STARTED"
      | "SESSION_COMPLETED"
      | "QUESTION_ADDED"
      | "ANSWER_RECORDED"
      | "ANALYSIS_COMPLETED"
      | "REQUIREMENT_CREATED"
      | "REQUIREMENT_UPDATED"
      | "STORY_CREATED"
      | "STORY_UPDATED";
    entityType: "PROJECT" | "SESSION" | "QUESTION" | "ANSWER" | "ANALYSIS" | "REQUIREMENT" | "USER_STORY" | "AMBIGUITY" | "SUGGESTION";
    entityId: string;
    summary: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return db.activityLog.create({ data: input });
}

export async function nextPosition(
  db: DatabaseClient,
  model: "session" | "question" | "criterion",
  parentId: string,
) {
  if (model === "session") {
    const latest = await db.elicitationSession.findFirst({
      where: { projectId: parentId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    return (latest?.sequence ?? 0) + 1;
  }

  if (model === "question") {
    const latest = await db.elicitationQuestion.findFirst({
      where: { sessionId: parentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return (latest?.position ?? 0) + 1;
  }

  const latest = await db.acceptanceCriterion.findFirst({
    where: { userStoryId: parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (latest?.position ?? 0) + 1;
}
