import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api/errors";
import { logActivity, requireOwnedProject, requireUser } from "@/services/shared";

type CreateProjectInput = {
  name: string;
  description: string;
  objective: string;
  context: string;
  status?: "ACTIVE" | "IN_REVIEW" | "COMPLETED" | "ARCHIVED";
  stakeholders?: Array<{ name: string; role?: string }>;
};

type UpdateProjectInput = Partial<Omit<CreateProjectInput, "stakeholders">>;

export async function listProjects(ownerId: string, filters?: { status?: CreateProjectInput["status"]; includeArchived?: boolean }) {
  return prisma.project.findMany({
    where: {
      ownerId,
      ...(filters?.status ? { status: filters.status } : filters?.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    },
    select: {
      id: true,
      name: true,
      description: true,
      objective: true,
      context: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { stakeholders: true, sessions: true, requirements: true, userStories: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProject(id: string, userId: string) {
  await requireOwnedProject(prisma, id, userId);
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      stakeholders: { orderBy: { name: "asc" } },
      sessions: { orderBy: { sequence: "asc" }, include: { _count: { select: { questions: true } } } },
      requirements: { orderBy: { code: "asc" }, include: { userStoryLinks: { include: { userStory: true } } } },
      userStories: { orderBy: { code: "asc" }, include: { acceptanceCriteria: { where: { archivedAt: null }, orderBy: { position: "asc" } } } },
      ambiguities: { orderBy: { createdAt: "desc" } },
      suggestions: { orderBy: { createdAt: "desc" } },
      _count: { select: { stakeholders: true, sessions: true, requirements: true, userStories: true } },
    },
  });
  if (!project) throw notFound("Projeto");
  return project;
}

export async function createProject(ownerId: string, data: CreateProjectInput) {
  return prisma.$transaction(async (db) => {
    await requireUser(db, ownerId);
    const { stakeholders, ...projectData } = data;
    const project = await db.project.create({
      data: {
        ...projectData,
        ownerId,
        ...(stakeholders?.length ? { stakeholders: { create: stakeholders } } : {}),
      },
    });
    await logActivity(db, {
      projectId: project.id,
      actorId: ownerId,
      action: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: project.id,
      summary: `Projeto ${project.name} criado.`,
    });
    return project;
  });
}

export async function updateProject(id: string, userId: string, data: UpdateProjectInput) {
  return prisma.$transaction(async (db) => {
    const before = await requireOwnedProject(db, id, userId);
    const archivedAt = data.status === "ARCHIVED" ? before.archivedAt ?? new Date() : data.status ? null : before.archivedAt;
    const project = await db.project.update({ where: { id }, data: { ...data, archivedAt } });
    await logActivity(db, {
      projectId: id,
      actorId: userId,
      action: data.status === "ARCHIVED" ? "PROJECT_ARCHIVED" : "PROJECT_UPDATED",
      entityType: "PROJECT",
      entityId: id,
      summary: data.status === "ARCHIVED" ? `Projeto ${project.name} arquivado.` : `Projeto ${project.name} atualizado.`,
      metadata: { before: { status: before.status }, after: { status: project.status } },
    });
    return project;
  });
}

export async function archiveProject(id: string, userId: string) {
  return prisma.$transaction(async (db) => {
    const project = await requireOwnedProject(db, id, userId);
    const archived = await db.project.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await logActivity(db, {
      projectId: id,
      actorId: userId,
      action: "PROJECT_ARCHIVED",
      entityType: "PROJECT",
      entityId: id,
      summary: `Projeto ${project.name} arquivado.`,
    });
    return archived;
  });
}

export async function listStakeholders(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.stakeholder.findMany({ where: { projectId }, orderBy: { name: "asc" } });
}

export async function createStakeholder(projectId: string, userId: string, data: { name: string; role?: string }) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.stakeholder.create({ data: { projectId, ...data } });
}

export async function updateStakeholder(id: string, userId: string, data: { name?: string; role?: string | null }) {
  const stakeholder = await prisma.stakeholder.findUnique({ where: { id } });
  if (!stakeholder) throw notFound("Stakeholder");
  await requireOwnedProject(prisma, stakeholder.projectId, userId);
  return prisma.stakeholder.update({ where: { id }, data });
}

export async function deleteStakeholder(id: string, userId: string) {
  const stakeholder = await prisma.stakeholder.findUnique({ where: { id } });
  if (!stakeholder) throw notFound("Stakeholder");
  await requireOwnedProject(prisma, stakeholder.projectId, userId);
  await prisma.stakeholder.delete({ where: { id } });
}

export async function listActivities(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.activityLog.findMany({
    where: { projectId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
