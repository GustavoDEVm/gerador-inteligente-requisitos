import { prisma } from "@/lib/prisma";
import { conflict, invalidInput, notFound } from "@/lib/api/errors";
import { logActivity, nextPosition, requireOwnedProject, requireOwnedRequirement, requireOwnedUserStory, requireUser } from "@/services/shared";

type StoryStatus = "PENDING" | "IN_REVIEW" | "REVIEWED" | "REJECTED" | "OBSOLETE";
type Priority = "HIGH" | "MEDIUM" | "LOW";
type StoryInput = {
  code: string;
  title: string;
  actor: string;
  objective: string;
  benefit: string;
  description?: string;
  priority?: Priority;
  status?: StoryStatus;
  requirementIds?: string[];
};
type StoryUpdate = Partial<Omit<StoryInput, "code" | "requirementIds" | "description">> & { description?: string | null };

export async function listUserStories(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.userStory.findMany({
    where: { projectId },
    include: {
      acceptanceCriteria: { orderBy: { position: "asc" } },
      requirementLinks: { include: { requirement: { select: { id: true, code: true, title: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getUserStory(id: string, userId: string) {
  await requireOwnedUserStory(prisma, id, userId);
  const userStory = await prisma.userStory.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      acceptanceCriteria: { orderBy: { position: "asc" } },
      requirementLinks: { include: { requirement: { select: { id: true, code: true, title: true, status: true } } } },
    },
  });
  if (!userStory) throw notFound("User Story");
  return userStory;
}

export async function createUserStory(projectId: string, userId: string, data: StoryInput) {
  return prisma.$transaction(async (db) => {
    await requireOwnedProject(db, projectId, userId);
    await requireUser(db, userId);
    const requirementIds = [...new Set(data.requirementIds ?? [])];
    if (requirementIds.length > 0) {
      const requirements = await db.requirement.findMany({ where: { id: { in: requirementIds } }, select: { id: true, projectId: true } });
      if (requirements.length !== requirementIds.length || requirements.some((requirement) => requirement.projectId !== projectId)) {
        throw invalidInput("Os requisitos relacionados devem existir e pertencer ao mesmo projeto da User Story.");
      }
    }
    const userStory = await db.userStory.create({
      data: {
        projectId,
        createdById: userId,
        code: data.code.toUpperCase(),
        title: data.title,
        actor: data.actor,
        objective: data.objective,
        benefit: data.benefit,
        description: data.description,
        priority: data.priority,
        status: data.status,
        requirementLinks: requirementIds.length > 0 ? { create: requirementIds.map((requirementId) => ({ requirementId })) } : undefined,
      },
    });
    await logActivity(db, {
      projectId,
      actorId: userId,
      action: "STORY_CREATED",
      entityType: "USER_STORY",
      entityId: userStory.id,
      summary: `User Story ${userStory.code} criada.`,
    });
    return userStory;
  });
}

export async function updateUserStory(id: string, userId: string, data: StoryUpdate) {
  return prisma.$transaction(async (db) => {
    const before = await requireOwnedUserStory(db, id, userId);
    const userStory = await db.userStory.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "STORY_UPDATED",
      entityType: "USER_STORY",
      entityId: id,
      summary: `User Story ${userStory.code} atualizada para a versão ${userStory.version}.`,
      metadata: { before: { status: before.status, priority: before.priority, version: before.version }, after: { status: userStory.status, priority: userStory.priority, version: userStory.version } },
    });
    return userStory;
  });
}

export async function linkRequirement(userStoryId: string, requirementId: string, userId: string) {
  return prisma.$transaction(async (db) => {
    const userStory = await requireOwnedUserStory(db, userStoryId, userId);
    const requirement = await requireOwnedRequirement(db, requirementId, userId);
    if (requirement.projectId !== userStory.projectId) throw invalidInput("O requisito deve pertencer ao mesmo projeto da User Story.");
    const existing = await db.requirementUserStory.findUnique({ where: { requirementId_userStoryId: { requirementId, userStoryId } } });
    if (existing) throw conflict("O requisito já está relacionado a esta User Story.");
    const link = await db.requirementUserStory.create({ data: { requirementId, userStoryId } });
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "STORY_UPDATED",
      entityType: "USER_STORY",
      entityId: userStoryId,
      summary: `Requisito ${requirement.code} relacionado à User Story ${userStory.code}.`,
    });
    return link;
  });
}

export async function unlinkRequirement(userStoryId: string, requirementId: string, userId: string) {
  const userStory = await requireOwnedUserStory(prisma, userStoryId, userId);
  const link = await prisma.requirementUserStory.findUnique({ where: { requirementId_userStoryId: { requirementId, userStoryId } } });
  if (!link) throw notFound("Relação entre requisito e User Story");
  await prisma.$transaction(async (db) => {
    await db.requirementUserStory.delete({ where: { requirementId_userStoryId: { requirementId, userStoryId } } });
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "STORY_UPDATED",
      entityType: "USER_STORY",
      entityId: userStoryId,
      summary: "Relação entre requisito e User Story removida.",
    });
  });
}

export async function listCriteria(userStoryId: string, userId: string) {
  await requireOwnedUserStory(prisma, userStoryId, userId);
  return prisma.acceptanceCriterion.findMany({ where: { userStoryId }, orderBy: { position: "asc" } });
}

export async function createCriterion(userStoryId: string, userId: string, data: { description: string; position?: number }) {
  return prisma.$transaction(async (db) => {
    await requireOwnedUserStory(db, userStoryId, userId);
    return db.acceptanceCriterion.create({ data: { userStoryId, description: data.description, position: data.position ?? (await nextPosition(db, "criterion", userStoryId)) } });
  });
}

export async function updateCriterion(id: string, userId: string, data: { description: string }) {
  const criterion = await prisma.acceptanceCriterion.findUnique({ where: { id } });
  if (!criterion) throw notFound("Critério de aceitação");
  await requireOwnedUserStory(prisma, criterion.userStoryId, userId);
  return prisma.acceptanceCriterion.update({ where: { id }, data });
}

export async function deleteCriterion(id: string, userId: string) {
  const criterion = await prisma.acceptanceCriterion.findUnique({ where: { id } });
  if (!criterion) throw notFound("Critério de aceitação");
  await requireOwnedUserStory(prisma, criterion.userStoryId, userId);
  await prisma.acceptanceCriterion.delete({ where: { id } });
}
