import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { executeDetectAmbiguities } from "../../src/app/api/ai/detect-ambiguities/route";
import { executeGenerateRequirements } from "../../src/app/api/ai/generate-requirements/route";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import type { AIProvider, StructuredGenerationResponse } from "../../src/services/ai/types";
import type { AmbiguityDetectionResult, RequirementsGenerationAIResult } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

const requirementsOutput: RequirementsGenerationAIResult = {
  userStory: "Como cliente, quero consultar produtos, para realizar pedidos.",
  functionalRequirements: ["O sistema deve permitir que o cliente consulte produtos."],
  nonFunctionalRequirements: ["A interface deve apresentar informacoes compreensiveis."],
  acceptanceCriteria: ["Quando existirem produtos cadastrados, o sistema deve exibi-los ao cliente."],
};

const ambiguityOutput: AmbiguityDetectionResult = {
  ambiguities: [{
    description: "Nao esta definido como o estoque deve ser atualizado apos um pedido.",
    severity: "medium",
    context: "Confirmacao de pedidos.",
  }],
};

function requirementsRequest(body: unknown, cookie: string) {
  return new Request("http://localhost/api/ai/generate-requirements", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function ambiguitiesRequest(body: unknown, cookie: string) {
  return new Request("http://localhost/api/ai/detect-ambiguities", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function createDelayedRequirementsProvider() {
  let calls = 0;
  let releaseFirstCall!: () => void;
  let notifyFirstCall!: () => void;
  const firstCallStarted = new Promise<void>((resolve) => { notifyFirstCall = resolve; });
  const firstCallReleased = new Promise<void>((resolve) => { releaseFirstCall = resolve; });

  const provider: AIProvider = {
    name: "delayed-requirements-provider",
    async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
      calls += 1;
      if (calls === 1) {
        notifyFirstCall();
        await firstCallReleased;
      }
      return { output: requirementsOutput as T, model: "delayed-test-model" };
    },
  };

  return {
    provider,
    getCalls: () => calls,
    releaseFirstCall,
    waitForFirstCall: () => firstCallStarted,
  };
}

function createImmediateAmbiguityProvider(onCall: () => void): AIProvider {
  return {
    name: "immediate-ambiguity-provider",
    async generateStructuredResponse<T>(): Promise<StructuredGenerationResponse<T>> {
      onCall();
      return { output: ambiguityOutput as T, model: "immediate-test-model" };
    },
  };
}

test("a coordenacao no PostgreSQL bloqueia operacao equivalente sem bloquear outro tipo", async () => {
  const fixture = await createFixture("coordination");

  try {
    const delayed = createDelayedRequirementsProvider();
    const requirementsService = new AIService({ providerFactory: () => delayed.provider });
    const body = { projectId: fixture.projectId, sessionId: fixture.sessionId };

    const firstRequest = executeGenerateRequirements(requirementsRequest(body, fixture.cookie), requirementsService);
    await delayed.waitForFirstCall();

    const duplicateResponse = await executeGenerateRequirements(requirementsRequest(body, fixture.cookie), requirementsService);
    assert.equal(duplicateResponse.status, 409);
    const duplicatePayload = await duplicateResponse.json() as { error: { code: string; message: string } };
    assert.equal(duplicatePayload.error.code, "CONFLICT");
    assert.match(duplicatePayload.error.message, /em andamento/);
    assert.equal(delayed.getCalls(), 1);
    assert.equal(await prisma.aIAnalysis.count({ where: { projectId: fixture.projectId, type: "REQUIREMENT_EXTRACTION" } }), 1);
    assert.equal(await prisma.requirement.count({ where: { projectId: fixture.projectId } }), 0);
    assert.equal(await prisma.userStory.count({ where: { projectId: fixture.projectId } }), 0);

    let ambiguityProviderCalls = 0;
    const ambiguityResponse = await executeDetectAmbiguities(
      ambiguitiesRequest(body, fixture.cookie),
      new AIService({ providerFactory: () => createImmediateAmbiguityProvider(() => { ambiguityProviderCalls += 1; }) }),
    );
    assert.equal(ambiguityResponse.status, 201);
    assert.equal(ambiguityProviderCalls, 1);
    assert.equal(await prisma.ambiguity.count({ where: { projectId: fixture.projectId } }), 1);

    delayed.releaseFirstCall();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.status, 201);
    assert.equal(await prisma.requirement.count({ where: { projectId: fixture.projectId } }), 2);
    assert.equal(await prisma.userStory.count({ where: { projectId: fixture.projectId } }), 1);

    const intentionalRetry = await executeGenerateRequirements(requirementsRequest(body, fixture.cookie), requirementsService);
    assert.equal(intentionalRetry.status, 201);
    assert.equal(delayed.getCalls(), 2);
    assert.equal(await prisma.aIAnalysis.count({ where: { projectId: fixture.projectId, type: "REQUIREMENT_EXTRACTION", status: "SUCCEEDED" } }), 2);
    assert.equal(await prisma.requirement.count({ where: { projectId: fixture.projectId } }), 4);
    assert.equal(await prisma.userStory.count({ where: { projectId: fixture.projectId } }), 2);
  } finally {
    await deleteFixture(fixture);
  }
});

test("uma analise abandonada e preservada como falha antes de permitir nova tentativa", async () => {
  const fixture = await createFixture("abandoned");

  try {
    const abandonedAnalysis = await prisma.aIAnalysis.create({
      data: {
        projectId: fixture.projectId,
        requestedById: fixture.userId,
        type: "AMBIGUITY_DETECTION",
        status: "RUNNING",
        provider: "test-provider",
        model: "test-model",
        promptVersion: "ambiguities-v1",
        promptText: "teste",
        inputSnapshot: { sessionId: fixture.sessionId },
        startedAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    await prisma.aIAnalysisSession.create({ data: { analysisId: abandonedAnalysis.id, sessionId: fixture.sessionId } });

    let providerCalls = 0;
    const response = await executeDetectAmbiguities(
      ambiguitiesRequest({ projectId: fixture.projectId, sessionId: fixture.sessionId }, fixture.cookie),
      new AIService({ providerFactory: () => createImmediateAmbiguityProvider(() => { providerCalls += 1; }) }),
    );
    assert.equal(response.status, 201);
    assert.equal(providerCalls, 1);

    const preservedAbandonedAnalysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: abandonedAnalysis.id } });
    assert.equal(preservedAbandonedAnalysis.status, "FAILED");
    assert.equal(preservedAbandonedAnalysis.errorCode, "AI_OPERATION_ABANDONED");
    assert.ok(preservedAbandonedAnalysis.completedAt);
    assert.equal(await prisma.aIAnalysis.count({ where: { projectId: fixture.projectId, type: "AMBIGUITY_DETECTION" } }), 2);
    assert.equal(await prisma.ambiguity.count({ where: { projectId: fixture.projectId } }), 1);
  } finally {
    await deleteFixture(fixture);
  }
});

async function createFixture(prefix: string) {
  const suffix = randomBytes(6).toString("hex");
  const user = await prisma.user.create({
    data: { name: `Pessoa ${prefix}`, email: `${prefix}-${suffix}@example.test`, passwordHash: "test-only" },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: `Projeto ${prefix} ${suffix}`,
      description: "Projeto temporario para validar coordenacao de operacoes de IA.",
      objective: "Evitar artefatos duplicados em requisicoes concorrentes.",
      context: "Teste automatizado.",
    },
  });
  const session = await prisma.elicitationSession.create({
    data: { projectId: project.id, createdById: user.id, sequence: 1, context: "Sessao temporaria de teste." },
  });
  const question = await prisma.elicitationQuestion.create({
    data: { sessionId: session.id, position: 1, content: "Descreva a necessidade inicial do sistema.", source: "TEMPLATE" },
  });
  await prisma.elicitationAnswer.create({
    data: {
      questionId: question.id,
      authorId: user.id,
      version: 1,
      content: "Quero um sistema para uma loja de roupas com produtos, carrinho e pedidos para clientes.",
    },
  });

  return {
    projectId: project.id,
    sessionId: session.id,
    userId: user.id,
    cookie: `${sessionCookieName}=${await encryptSession({ userId: user.id })}`,
  };
}

async function deleteFixture(fixture: { projectId: string; userId: string }) {
  await prisma.activityLog.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.requirement.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.userStory.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.ambiguity.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.aIAnalysis.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.elicitationAnswer.deleteMany({ where: { question: { session: { projectId: fixture.projectId } } } });
  await prisma.elicitationQuestion.deleteMany({ where: { session: { projectId: fixture.projectId } } });
  await prisma.elicitationSession.deleteMany({ where: { projectId: fixture.projectId } });
  await prisma.project.delete({ where: { id: fixture.projectId } });
  await prisma.user.delete({ where: { id: fixture.userId } });
}
