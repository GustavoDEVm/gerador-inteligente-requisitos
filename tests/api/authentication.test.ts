import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import { POST as register } from "../../src/app/api/auth/register/route";
import { GET as session } from "../../src/app/api/auth/session/route";
import { GET as getProject, PATCH as updateProject } from "../../src/app/api/projects/[id]/route";
import { POST as createProject } from "../../src/app/api/projects/route";
import { prisma } from "../../src/lib/prisma";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

function jsonRequest(url: string, body?: unknown, cookie?: string) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function cookieFrom(response: Response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "A resposta deveria definir um cookie de sessão.");
  return header.split(";", 1)[0];
}

test("autenticação, sessão e autorização por proprietário", async () => {
  const suffix = `${Date.now()}`.slice(-8);
  const password = `Senha-${randomBytes(12).toString("base64url")}9`;
  const userAEmail = `auth-a-${suffix}@example.test`;
  const userBEmail = `auth-b-${suffix}@example.test`;
  let userAId: string | undefined;
  let userBId: string | undefined;
  let projectId: string | undefined;

  try {
    const invalidRegistration = await register(jsonRequest("http://localhost/api/auth/register", { name: "Senha curta", email: `invalid-${suffix}@example.test`, password: "curta" }));
    assert.equal(invalidRegistration.status, 400);

    const registration = await register(jsonRequest("http://localhost/api/auth/register", { name: "Usuário A", email: userAEmail, password }));
    assert.equal(registration.status, 201);
    const registeredPayload = await registration.json() as { data: { id: string; email: string; passwordHash?: unknown } };
    userAId = registeredPayload.data.id;
    assert.equal(registeredPayload.data.email, userAEmail);
    assert.equal("passwordHash" in registeredPayload.data, false);
    const userACookie = cookieFrom(registration);

    const duplicateRegistration = await register(jsonRequest("http://localhost/api/auth/register", { name: "Usuário A duplicado", email: userAEmail, password }));
    assert.equal(duplicateRegistration.status, 409);

    const invalidLogin = await login(jsonRequest("http://localhost/api/auth/login", { email: userAEmail, password: `${password}-incorreta` }));
    assert.equal(invalidLogin.status, 401);

    const validLogin = await login(jsonRequest("http://localhost/api/auth/login", { email: userAEmail, password }));
    assert.equal(validLogin.status, 200);
    const loggedInCookie = cookieFrom(validLogin);

    const anonymousSession = await session(jsonRequest("http://localhost/api/auth/session"));
    assert.equal(anonymousSession.status, 200);
    assert.equal((await anonymousSession.json() as { data: null }).data, null);

    const authenticatedSession = await session(jsonRequest("http://localhost/api/auth/session", undefined, loggedInCookie));
    assert.equal(authenticatedSession.status, 200);
    assert.equal((await authenticatedSession.json() as { data: { id: string } }).data.id, userAId);

    const anonymousProjectList = await createProject(jsonRequest("http://localhost/api/projects", { name: "Sem sessão", description: "x", objective: "x", context: "x" }));
    assert.equal(anonymousProjectList.status, 401);

    const createdProject = await createProject(jsonRequest("http://localhost/api/projects", {
      name: `Projeto autenticado ${suffix}`,
      description: "Projeto criado pelo usuário autenticado.",
      objective: "Validar associação automática de proprietário.",
      context: "Teste temporário de autenticação e autorização.",
    }, userACookie));
    assert.equal(createdProject.status, 201);
    const createdProjectPayload = await createdProject.json() as { data: { id: string; ownerId: string } };
    projectId = createdProjectPayload.data.id;
    assert.equal(createdProjectPayload.data.ownerId, userAId);

    const registrationB = await register(jsonRequest("http://localhost/api/auth/register", { name: "Usuário B", email: userBEmail, password }));
    assert.equal(registrationB.status, 201);
    userBId = (await registrationB.json() as { data: { id: string } }).data.id;
    const userBCookie = cookieFrom(registrationB);

    const foreignRead = await getProject(jsonRequest(`http://localhost/api/projects/${projectId}`, undefined, userBCookie), { params: Promise.resolve({ id: projectId }) });
    assert.equal(foreignRead.status, 403);
    const foreignUpdate = await updateProject(new Request(`http://localhost/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: userBCookie },
      body: JSON.stringify({ name: "Tentativa não autorizada" }),
    }), { params: Promise.resolve({ id: projectId }) });
    assert.equal(foreignUpdate.status, 403);

    const logoutResponse = await logout();
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userAId) await prisma.user.delete({ where: { id: userAId } });
    if (userBId) await prisma.user.delete({ where: { id: userBId } });
  }
});
