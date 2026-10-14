import { type AcceptanceCriterion, type Prisma, type RevisionOperation, type UserStory } from "../../generated/prisma/client";

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
      acceptanceCriteria: { where: { archivedAt: null }, orderBy: { position: "asc" } },
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
      acceptanceCriteria: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      requirementLinks: { include: { requirement: { select: { id: true, code: true, title: true, status: true } } } },
      revisions: {
        orderBy: { revisionNumber: "asc" },
        include: { changedBy: { select: { id: true, name: true } } },
      },
    },
  });
  if (!userStory) throw notFound("User Story");
  return userStory;
}

export async function listUserStoryRevisions(id: string, userId: string) {
  await requireOwnedUserStory(prisma, id, userId);
  return prisma.userStoryRevision.findMany({
    where: { userStoryId: id },
    orderBy: { revisionNumber: "asc" },
    include: { changedBy: { select: { id: true, name: true } } },
  });
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
    await createUserStoryRevision(db, userStory, "CREATED", userId);
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
    const before = await lockOwnedUserStoryForRevision(db, id, userId);
    const userStory = await db.userStory.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await createUserStoryRevision(db, userStory, "UPDATED", userId);
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "STORY_UPDATED",
      entityType: "USER_STORY",
      entityId: id,
      summary: `User Story ${userStory.code} atualizada para a versão ${userStory.version}.`,
      metadata: {
        before: {
          title: before.title,
          actor: before.actor,
          objective: before.objective,
          benefit: before.benefit,
          description: before.description,
          status: before.status,
          priority: before.priority,
          version: before.version,
        },
        after: {
          title: userStory.title,
          actor: userStory.actor,
          objective: userStory.objective,
          benefit: userStory.benefit,
          description: userStory.description,
          status: userStory.status,
          priority: userStory.priority,
          version: userStory.version,
        },
      },
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
  return prisma.acceptanceCriterion.findMany({ where: { userStoryId, archivedAt: null }, orderBy: { position: "asc" } });
}

export async function createCriterion(userStoryId: string, userId: string, data: { description: string; position?: number }) {
  return prisma.$transaction(async (db) => {
    const userStory = await lockOwnedUserStoryForRevision(db, userStoryId, userId);
    const criterion = await db.acceptanceCriterion.create({
      data: { userStoryId, description: data.description, position: data.position ?? (await nextPosition(db, "criterion", userStoryId)) },
    });
    await createAcceptanceCriterionRevision(db, criterion, "CREATED", userId);
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "CRITERION_CREATED",
      entityType: "ACCEPTANCE_CRITERION",
      entityId: criterion.id,
      summary: `Critério de aceitação ${criterion.position} criado para a User Story ${userStory.code}.`,
    });
    return criterion;
  });
}

export async function updateCriterion(id: string, userId: string, data: { description: string }) {
  return prisma.$transaction(async (db) => {
    const criterion = await lockOwnedCriterionForRevision(db, id, userId);
    if (criterion.archivedAt) throw conflict("O critério de aceitação já está arquivado.");
    const updated = await db.acceptanceCriterion.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await createAcceptanceCriterionRevision(db, updated, "UPDATED", userId);
    const userStory = await db.userStory.findUnique({ where: { id: updated.userStoryId }, select: { projectId: true, code: true } });
    if (!userStory) throw notFound("User Story");
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "CRITERION_UPDATED",
      entityType: "ACCEPTANCE_CRITERION",
      entityId: updated.id,
      summary: `Critério de aceitação ${updated.position} atualizado na User Story ${userStory.code}.`,
    });
    return updated;
  });
}

export async function deleteCriterion(id: string, userId: string) {
  return prisma.$transaction(async (db) => {
    const criterion = await lockOwnedCriterionForRevision(db, id, userId);
    if (criterion.archivedAt) throw conflict("O critério de aceitação já está arquivado.");
    const archived = await db.acceptanceCriterion.update({
      where: { id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await createAcceptanceCriterionRevision(db, archived, "ARCHIVED", userId);
    const userStory = await db.userStory.findUnique({ where: { id: archived.userStoryId }, select: { projectId: true, code: true } });
    if (!userStory) throw notFound("User Story");
    await logActivity(db, {
      projectId: userStory.projectId,
      actorId: userId,
      action: "CRITERION_ARCHIVED",
      entityType: "ACCEPTANCE_CRITERION",
      entityId: archived.id,
      summary: `Critério de aceitação ${archived.position} arquivado na User Story ${userStory.code}.`,
    });
  });
}

export async function getCriterion(id: string, userId: string) {
  const criterion = await prisma.acceptanceCriterion.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { revisionNumber: "asc" },
        include: { changedBy: { select: { id: true, name: true } } },
      },
    },
  });
  if (!criterion) throw notFound("Critério de aceitação");
  await requireOwnedUserStory(prisma, criterion.userStoryId, userId);
  return criterion;
}

export async function listCriterionRevisions(id: string, userId: string) {
  const criterion = await getCriterion(id, userId);
  return criterion.revisions;
}

export async function createUserStoryRevision(
  db: Prisma.TransactionClient,
  userStory: Pick<UserStory, "id" | "code" | "title" | "actor" | "objective" | "benefit" | "description" | "priority" | "status" | "version" | "archivedAt" | "generatedByAnalysisId">,
  operation: RevisionOperation,
  changedById: string | null,
) {
  return db.userStoryRevision.create({
    data: {
      userStoryId: userStory.id,
      revisionNumber: userStory.version,
      operation,
      changedById,
      code: userStory.code,
      title: userStory.title,
      actor: userStory.actor,
      objective: userStory.objective,
      benefit: userStory.benefit,
      description: userStory.description,
      priority: userStory.priority,
      status: userStory.status,
      archivedAt: userStory.archivedAt,
      generatedByAnalysisId: userStory.generatedByAnalysisId,
    },
  });
}

export async function createAcceptanceCriterionRevision(
  db: Prisma.TransactionClient,
  criterion: Pick<AcceptanceCriterion, "id" | "userStoryId" | "version" | "description" | "position" | "archivedAt">,
  operation: RevisionOperation,
  changedById: string | null,
) {
  return db.acceptanceCriterionRevision.create({
    data: {
      acceptanceCriterionId: criterion.id,
      userStoryId: criterion.userStoryId,
      revisionNumber: criterion.version,
      operation,
      changedById,
      description: criterion.description,
      position: criterion.position,
      archivedAt: criterion.archivedAt,
    },
  });
}

async function lockOwnedUserStoryForRevision(db: Prisma.TransactionClient, id: string, userId: string) {
  await requireOwnedUserStory(db, id, userId);
  await db.$queryRaw`SELECT "id" FROM "user_stories" WHERE "id" = ${id} FOR UPDATE`;
  const userStory = await db.userStory.findUnique({ where: { id } });
  if (!userStory) throw notFound("User Story");
  return userStory;
}

async function lockOwnedCriterionForRevision(db: Prisma.TransactionClient, id: string, userId: string) {
  const existing = await db.acceptanceCriterion.findUnique({ where: { id }, select: { userStoryId: true } });
  if (!existing) throw notFound("Critério de aceitação");
  await requireOwnedUserStory(db, existing.userStoryId, userId);
  await db.$queryRaw`SELECT "id" FROM "acceptance_criteria" WHERE "id" = ${id} FOR UPDATE`;
  const criterion = await db.acceptanceCriterion.findUnique({ where: { id } });
  if (!criterion) throw notFound("Critério de aceitação");
  return criterion;
}
