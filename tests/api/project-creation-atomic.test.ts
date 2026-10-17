import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as createProjectRoute } from "../../src/app/api/projects/route";
import { POST as createStakeholderRoute } from "../../src/app/api/projects/[id]/stakeholders/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function projectRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function stakeholderRequest(projectId: string, body: unknown, cookie: string) {
  return new Request(`http://localhost/api/projects/${projectId}/stakeholders`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("a criação conjunta de projeto e stakeholders é atômica e preserva autorização", async () => {
  const suffix = randomBytes(6).toString("hex");
  const projectIds: string[] = [];
  const projectNames = {
    empty: `Projeto sem stakeholders ${suffix}`,
    multiple: `Projeto com stakeholders ${suffix}`,
    invalid: `Projeto inválido ${suffix}`,
    duplicate: `Projeto duplicado ${suffix}`,
    ownership: `Projeto com proprietário da sessão ${suffix}`,
  };
  let ownerId: string | undefined;
  let otherUserId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      prisma.user.create({ data: { name: "Proprietário atômico", email: `atomic-owner-${suffix}@example.test`, passwordHash: "test-only" } }),
      prisma.user.create({ data: { name: "Outro usuário atômico", email: `atomic-other-${suffix}@example.test`, passwordHash: "test-only" } }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const ownerCookie = `${sessionCookieName}=${await encryptSession({ userId: owner.id })}`;
    const otherUserCookie = `${sessionCookieName}=${await encryptSession({ userId: otherUser.id })}`;

    const unauthenticated = await createProjectRoute(projectRequest({
      name: "Projeto sem sessão",
      description: "Não deve ser criado sem uma sessão válida.",
      objective: "Validar autenticação.",
      context: "Teste temporário.",
    }));
    assert.equal(unauthenticated.status, 401);

    const withoutStakeholders = await createProjectRoute(projectRequest({
      name: projectNames.empty,
      description: "Projeto temporário criado sem stakeholders.",
      objective: "Validar a lista opcional.",
      context: "Teste automatizado de criação atômica.",
      ownerId: otherUser.id,
    }, ownerCookie));
    assert.equal(withoutStakeholders.status, 201);
    const emptyProject = (await withoutStakeholders.json() as { data: { id: string; ownerId: string } }).data;
    projectIds.push(emptyProject.id);
    assert.equal(emptyProject.ownerId, owner.id);
    assert.equal(await prisma.stakeholder.count({ where: { projectId: emptyProject.id } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { projectId: emptyProject.id, action: "PROJECT_CREATED" } }), 1);

    const withStakeholders = await createProjectRoute(projectRequest({
      name: projectNames.multiple,
      description: "Projeto temporário criado com vários stakeholders.",
      objective: "Validar criação conjunta.",
      context: "Teste automatizado de criação atômica.",
      stakeholders: [
        { name: "Cliente", role: "Utiliza o sistema" },
        { name: "Administrador", role: "Gerencia as informações" },
      ],
    }, ownerCookie));
    assert.equal(withStakeholders.status, 201);
    const projectWithStakeholders = (await withStakeholders.json() as { data: { id: string } }).data;
    projectIds.push(projectWithStakeholders.id);
    assert.deepEqual(
      await prisma.stakeholder.findMany({ where: { projectId: projectWithStakeholders.id }, select: { name: true, role: true }, orderBy: { name: "asc" } }),
      [
        { name: "Administrador", role: "Gerencia as informações" },
        { name: "Cliente", role: "Utiliza o sistema" },
      ],
    );
    assert.equal(await prisma.activityLog.count({ where: { projectId: projectWithStakeholders.id, action: "PROJECT_CREATED" } }), 1);

    const invalidStakeholder = await createProjectRoute(projectRequest({
      name: projectNames.invalid,
      description: "Projeto que deve ser rejeitado por stakeholder inválido.",
      objective: "Validar entrada atômica.",
      context: "Teste automatizado de criação atômica.",
      stakeholders: [{ name: " " }],
    }, ownerCookie));
    assert.equal(invalidStakeholder.status, 400);
    assert.equal(await prisma.project.count({ where: { name: projectNames.invalid } }), 0);
    assert.equal(await prisma.stakeholder.count({ where: { name: " " } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { summary: `Projeto ${projectNames.invalid} criado.` } }), 0);

    const duplicateStakeholder = await createProjectRoute(projectRequest({
      name: projectNames.duplicate,
      description: "Projeto que deve reverter ao violar unicidade de stakeholder.",
      objective: "Validar rollback transacional.",
      context: "Teste automatizado de criação atômica.",
      stakeholders: [{ name: `Duplicado ${suffix}` }, { name: `Duplicado ${suffix}` }],
    }, ownerCookie));
    assert.equal(duplicateStakeholder.status, 409);
    assert.equal(await prisma.project.count({ where: { name: projectNames.duplicate } }), 0);
    assert.equal(await prisma.stakeholder.count({ where: { name: `Duplicado ${suffix}` } }), 0);
    assert.equal(await prisma.activityLog.count({ where: { summary: `Projeto ${projectNames.duplicate} criado.` } }), 0);

    const individualStakeholder = await createStakeholderRoute(
      stakeholderRequest(emptyProject.id, { name: "Stakeholder individual" }, ownerCookie),
      { params: Promise.resolve({ id: emptyProject.id }) },
    );
    assert.equal(individualStakeholder.status, 201);
    assert.equal(await prisma.stakeholder.count({ where: { projectId: emptyProject.id, name: "Stakeholder individual" } }), 1);

    const foreignStakeholder = await createStakeholderRoute(
      stakeholderRequest(emptyProject.id, { name: "Tentativa não autorizada" }, otherUserCookie),
      { params: Promise.resolve({ id: emptyProject.id }) },
    );
    assert.equal(foreignStakeholder.status, 403);
    assert.equal(await prisma.stakeholder.count({ where: { projectId: emptyProject.id, name: "Tentativa não autorizada" } }), 0);
  } finally {
    if (projectIds.length > 0) {
      await prisma.activityLog.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.stakeholder.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});
