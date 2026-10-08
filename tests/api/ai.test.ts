import "dotenv/config";

import type { GoogleGenAI } from "@google/genai";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { executeAnalyze, POST as analyzeRoute } from "../../src/app/api/ai/analyze/route";
import { AppError } from "../../src/lib/api/errors";
import { encryptSession, sessionCookieName } from "../../src/lib/auth/session";
import { prisma } from "../../src/lib/prisma";
import { AIService } from "../../src/services/ai/ai-service";
import { getAIConfiguration } from "../../src/services/ai/config";
import { AIProviderError } from "../../src/services/ai/errors";
import { formatAIEvent } from "../../src/services/ai/observability";
import { getAIProvider } from "../../src/services/ai/provider";
import { GEMINI_RETRY_DELAY_MS, GeminiProvider, getGeminiDiagnostic, isTransientGeminiServiceUnavailable, mapGeminiError } from "../../src/services/ai/providers/gemini";
import { MOCK_MODEL, MockAIProvider } from "../../src/services/ai/providers/mock";
import { initialRequirementAnalysisSchema, toProviderJsonSchema } from "../../src/services/ai/schemas";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "../../src/services/ai/types";
import type { InitialRequirementAnalysis, InitialRequirementAnalysisResponse } from "../../src/types/ai";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64url");

const validResult: InitialRequirementAnalysis = {
  summary: "Sistema de biblioteca para consulta e reserva de livros pelos alunos.",
  userStory: {
    actor: "aluno",
    action: "consultar e reservar livros disponíveis",
    benefit: "encontrar e reservar obras antes de ir à biblioteca",
  },
  observations: ["A descrição prioriza consulta de disponibilidade e reserva."],
  ambiguities: ["Não foi informado por quanto tempo uma reserva permanece ativa."],
  suggestions: ["Definir regras de fila e expiração para reservas."],
};

class FakeProvider implements AIProvider {
  readonly name = "fake";

  constructor(private readonly output: unknown = validResult, private readonly error?: Error) {}

  async generateStructuredResponse<T>(_request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResponse<T>> {
    void _request;
    if (this.error) throw this.error;
    return { output: this.output as T, model: "fake-model-v1" };
  }
}

type GeminiAttemptOutcome = { modelVersion?: string; text: string } | Error;

function createGeminiClient(outcomes: GeminiAttemptOutcome[]) {
  let calls = 0;
  const client = {
    models: {
      async generateContent() {
        const outcome = outcomes[calls++];
        if (!outcome) throw new Error("Resultado de teste Gemini ausente.");
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  } as unknown as Pick<GoogleGenAI, "models">;

  return { calls: () => calls, client };
}

function geminiProvider(outcomes: GeminiAttemptOutcome[]) {
  const fakeClient = createGeminiClient(outcomes);
  const waits: number[] = [];
  const provider = new GeminiProvider({
    apiKey: "test-only-api-key",
    client: fakeClient.client,
    model: "test-gemini-model",
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });

  return { calls: fakeClient.calls, provider, waits };
}

function geminiRequest(operation = "generate-requirements"): StructuredGenerationRequest<{ generated: boolean }> {
  return {
    model: "test-gemini-model",
    systemInstruction: "Instrução de teste.",
    userInput: "Entrada de teste.",
    responseJsonSchema: { type: "object" },
    timeoutMs: 30_000,
    metadata: { operation },
  };
}

function geminiSuccess() {
  return { modelVersion: "test-gemini-model", text: JSON.stringify({ generated: true }) };
}

function geminiHttpError(status: number, property: "status" | "statusCode" = "status") {
  return Object.assign(new Error("Falha HTTP de teste."), { name: "ApiError", [property]: status });
}

test("falha de cadeia TLS do Gemini é diagnosticada no servidor e mantém resposta segura", () => {
  const secret = "test-api-key-value";
  const certificateError = Object.assign(new Error(`unable to verify the first certificate; authorization=${secret}`), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  });
  const fetchError = new TypeError("fetch failed", { cause: certificateError });

  const diagnostic = getGeminiDiagnostic(fetchError);
  assert.equal(diagnostic.errorName, "TypeError");
  assert.equal(diagnostic.causeName, "Error");
  assert.equal(diagnostic.causeCode, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
  assert.equal(diagnostic.technicalMessage, "certificate-verification-failed");

  const log = formatAIEvent("gemini-request-failed", {
    causeCode: diagnostic.causeCode,
    causeName: diagnostic.causeName,
    durationMs: 25,
    errorName: diagnostic.errorName,
    model: "gemini-3.8-flash",
    operation: "generate-requirements",
    responseReceived: false,
    technicalMessage: diagnostic.technicalMessage,
    timeout: false,
    timeoutMs: 30_000,
  });
  assert.match(log, /event=gemini-request-failed/);
  assert.match(log, /durationMs=25/);
  assert.match(log, /responseReceived=false/);
  assert.match(log, /causeCode=UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
  assert.doesNotMatch(log, /\{\}/);
  assert.doesNotMatch(log, new RegExp(secret));

  const mapped = mapGeminiError(fetchError, diagnostic);
  assert.equal(mapped.code, "AI_PROVIDER_UNAVAILABLE");
  assert.equal(mapped.status, 503);
  assert.equal(mapped.message, "O provedor de IA está indisponível no momento. Tente novamente mais tarde.");

  const timeoutError = Object.assign(new Error("request timeout"), { name: "RequestTimeoutError" });
  assert.equal(getGeminiDiagnostic(timeoutError).technicalMessage, "request-timed-out");
  assert.equal(mapGeminiError(timeoutError).code, "AI_TIMEOUT");

  const statusCodeError = geminiHttpError(503, "statusCode");
  const wrappedStatusCodeError = new Error("Falha de transporte.", { cause: statusCodeError });
  assert.equal(getGeminiDiagnostic(wrappedStatusCodeError).status, 503);
  assert.equal(isTransientGeminiServiceUnavailable(wrappedStatusCodeError), true);
});

test("GeminiProvider não repete uma primeira tentativa bem-sucedida", async () => {
  const { calls, provider, waits } = geminiProvider([geminiSuccess()]);

  const result = await provider.generateStructuredResponse(geminiRequest());

  assert.deepEqual(result.output, { generated: true });
  assert.equal(calls(), 1);
  assert.deepEqual(waits, []);
});

test("GeminiProvider repete uma única vez após HTTP 503 e conclui no segundo sucesso", async () => {
  const { calls, provider, waits } = geminiProvider([geminiHttpError(503, "statusCode"), geminiSuccess()]);

  const result = await provider.generateStructuredResponse(geminiRequest());

  assert.deepEqual(result.output, { generated: true });
  assert.equal(calls(), 2);
  assert.deepEqual(waits, [GEMINI_RETRY_DELAY_MS]);
});

test("GeminiProvider repete detect-ambiguities uma única vez após HTTP 503 e conclui no segundo sucesso", async () => {
  const { calls, provider, waits } = geminiProvider([geminiHttpError(503, "statusCode"), geminiSuccess()]);

  const result = await provider.generateStructuredResponse(geminiRequest("detect-ambiguities"));

  assert.deepEqual(result.output, { generated: true });
  assert.equal(calls(), 2);
  assert.deepEqual(waits, [GEMINI_RETRY_DELAY_MS]);
});

test("GeminiProvider interrompe após duas falhas HTTP 503", async () => {
  const { calls, provider, waits } = geminiProvider([geminiHttpError(503), geminiHttpError(503, "statusCode")]);

  await assert.rejects(
    provider.generateStructuredResponse(geminiRequest()),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_PROVIDER_UNAVAILABLE" && error.status === 503,
  );
  assert.equal(calls(), 2);
  assert.deepEqual(waits, [GEMINI_RETRY_DELAY_MS]);
});

test("GeminiProvider não cria uma terceira tentativa para detect-ambiguities após dois HTTP 503", async () => {
  const { calls, provider, waits } = geminiProvider([geminiHttpError(503), geminiHttpError(503, "statusCode")]);

  await assert.rejects(
    provider.generateStructuredResponse(geminiRequest("detect-ambiguities")),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_PROVIDER_UNAVAILABLE" && error.status === 503,
  );
  assert.equal(calls(), 2);
  assert.deepEqual(waits, [GEMINI_RETRY_DELAY_MS]);
});

test("GeminiProvider não repete erros HTTP não transitórios", async () => {
  const cases = [
    { expectedCode: "AI_PROVIDER_UNAVAILABLE", status: 400 },
    { expectedCode: "AI_CONFIGURATION", status: 401 },
    { expectedCode: "AI_CONFIGURATION", status: 403 },
    { expectedCode: "AI_PROVIDER_UNAVAILABLE", status: 404 },
    { expectedCode: "AI_RATE_LIMIT", status: 429 },
  ] as const;

  for (const operation of ["generate-requirements", "detect-ambiguities"]) {
    for (const testCase of cases) {
      const { calls, provider, waits } = geminiProvider([geminiHttpError(testCase.status)]);
      await assert.rejects(
        provider.generateStructuredResponse(geminiRequest(operation)),
        (error: unknown) => error instanceof AIProviderError && error.code === testCase.expectedCode,
      );
      assert.equal(calls(), 1);
      assert.deepEqual(waits, []);
    }
  }
});

test("GeminiProvider mantém operações não autorizadas sem retry", async () => {
  for (const operation of ["analyze-system-description", "generate-refinement-questions"]) {
    const { calls, provider, waits } = geminiProvider([geminiHttpError(503)]);

    await assert.rejects(
      provider.generateStructuredResponse(geminiRequest(operation)),
      (error: unknown) => error instanceof AIProviderError && error.code === "AI_PROVIDER_UNAVAILABLE",
    );
    assert.equal(calls(), 1);
    assert.deepEqual(waits, []);
  }
});

test("GeminiProvider não repete timeout ou resposta estruturada inválida", async () => {
  const timeout = Object.assign(new Error("Tempo esgotado."), { name: "RequestTimeoutError" });
  const timeoutProvider = geminiProvider([timeout]);
  await assert.rejects(
    timeoutProvider.provider.generateStructuredResponse(geminiRequest()),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_TIMEOUT",
  );
  assert.equal(timeoutProvider.calls(), 1);
  assert.deepEqual(timeoutProvider.waits, []);

  const invalidResponseProvider = geminiProvider([{ text: "não é JSON" }]);
  await assert.rejects(
    invalidResponseProvider.provider.generateStructuredResponse(geminiRequest()),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_INVALID_RESPONSE",
  );
  assert.equal(invalidResponseProvider.calls(), 1);
  assert.deepEqual(invalidResponseProvider.waits, []);
});

function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function withMockProvider<T>(operation: () => Promise<T> | T) {
  const previousProvider = process.env.AI_PROVIDER;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.AI_PROVIDER = "mock";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;

  try {
    return await operation();
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
}

test("a infraestrutura de IA valida, registra o histórico e protege o endpoint", async () => {
  const suffix = `${Date.now()}`.slice(-8);
  const email = `ai-${suffix}@example.test`;
  let userId: string | undefined;
  let projectId: string | undefined;

  try {
    const user = await prisma.user.create({ data: { name: "Usuário de teste IA", email, passwordHash: "test-only" } });
    userId = user.id;
    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: `Projeto IA ${suffix}`,
        description: "Projeto temporário para validar a infraestrutura de IA.",
        objective: "Testar o registro de análises estruturadas.",
        context: "Ambiente automatizado de testes.",
      },
    });
    projectId = project.id;
    const session = await prisma.elicitationSession.create({
      data: { projectId: project.id, createdById: user.id, sequence: 1, context: "Sessão temporária para análise inicial." },
    });
    const cookie = `${sessionCookieName}=${await encryptSession({ userId: user.id })}`;
    const input = "Quero um sistema para uma biblioteca onde alunos possam consultar livros disponíveis e reservar livros.";

    const successfulService = new AIService({ providerFactory: () => new FakeProvider() });
    const successfulAnalysis = await successfulService.analyzeSystemDescription({ projectId: project.id, sessionId: session.id, userId: user.id, input });
    assert.deepEqual(successfulAnalysis.result, validResult);

    const persistedSuccess = await prisma.aIAnalysis.findUniqueOrThrow({
      where: { id: successfulAnalysis.analysisId },
      include: { sessions: true },
    });
    assert.equal(persistedSuccess.status, "SUCCEEDED");
    assert.equal(persistedSuccess.provider, "fake");
    assert.equal(persistedSuccess.model, "fake-model-v1");
    assert.equal(persistedSuccess.sessions[0]?.sessionId, session.id);
    assert.deepEqual(persistedSuccess.structuredOutput, validResult);
    assert.equal(await prisma.activityLog.count({ where: { projectId: project.id, entityId: successfulAnalysis.analysisId, action: "ANALYSIS_COMPLETED" } }), 1);

    const invalidService = new AIService({ providerFactory: () => new FakeProvider({ summary: "incompleto" }) });
    await assert.rejects(
      invalidService.analyzeSystemDescription({ projectId: project.id, sessionId: session.id, userId: user.id, input }),
      (error: unknown) => error instanceof AppError && error.code === "AI_INVALID_RESPONSE" && error.status === 422,
    );

    const unavailableService = new AIService({ providerFactory: () => new FakeProvider(undefined, new AIProviderError("AI_TIMEOUT")) });
    await assert.rejects(
      unavailableService.analyzeSystemDescription({ projectId: project.id, sessionId: session.id, userId: user.id, input }),
      (error: unknown) => error instanceof AppError && error.code === "AI_TIMEOUT" && error.status === 504,
    );

    const failedAnalyses = await prisma.aIAnalysis.findMany({ where: { projectId: project.id, status: { in: ["FAILED", "INVALID_RESPONSE"] } }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(failedAnalyses.map((analysis) => [analysis.status, analysis.errorCode]), [["INVALID_RESPONSE", "AI_INVALID_RESPONSE"], ["FAILED", "AI_TIMEOUT"]]);

    const anonymousResponse = await analyzeRoute(request({ projectId: project.id, sessionId: session.id, input }));
    assert.equal(anonymousResponse.status, 401);

    let receivedByEndpoint: { projectId: string; sessionId: string; userId: string; input: string } | undefined;
    const endpointResponse = await executeAnalyze(
      request({ projectId: project.id, sessionId: session.id, input }, cookie),
      {
        async analyzeSystemDescription(endpointInput) {
          receivedByEndpoint = endpointInput;
          return { analysisId: "00000000-0000-4000-8000-000000000001", result: validResult } satisfies InitialRequirementAnalysisResponse;
        },
      },
    );
    assert.equal(endpointResponse.status, 201);
    assert.deepEqual(receivedByEndpoint, { projectId: project.id, sessionId: session.id, userId: user.id, input });

    const invalidEndpointResponse = await executeAnalyze(
      request({ projectId: project.id, sessionId: session.id, input: "curta" }, cookie),
      { async analyzeSystemDescription() { throw new Error("não deve ser chamado"); } },
    );
    assert.equal(invalidEndpointResponse.status, 400);
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.aIAnalysis.deleteMany({ where: { projectId } });
      await prisma.elicitationSession.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  }
});

test("a factory retorna erro controlado quando Gemini não está configurado", () => {
  const previousProvider = process.env.AI_PROVIDER;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.AI_PROVIDER = "gemini";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;

  try {
    assert.throws(
      () => getAIProvider(),
      (error: unknown) => error instanceof AppError && error.code === "AI_CONFIGURATION" && error.status === 503,
    );
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test("MockAIProvider é determinístico, reutiliza o schema Zod e não exige configuração Gemini", async () => {
  await withMockProvider(async () => {
    assert.deepEqual(getAIConfiguration(), { provider: "mock", gemini: {} });
    const provider = getAIProvider();
    assert.ok(provider instanceof MockAIProvider);

    const clothingStoreInput = "Quero um sistema para uma loja de roupas onde clientes possam visualizar produtos, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos.";

    const first = await provider.generateStructuredResponse<InitialRequirementAnalysis>({
      model: "",
      systemInstruction: "instrução de teste",
      userInput: clothingStoreInput,
      responseJsonSchema: toProviderJsonSchema(initialRequirementAnalysisSchema),
    });
    const second = await provider.generateStructuredResponse<InitialRequirementAnalysis>({
      model: "outro-modelo",
      systemInstruction: "outra instrução",
      userInput: clothingStoreInput,
      responseJsonSchema: toProviderJsonSchema(initialRequirementAnalysisSchema),
    });

    assert.equal(first.model, MOCK_MODEL);
    assert.deepEqual(first, second);
    assert.equal(initialRequirementAnalysisSchema.safeParse(first.output).success, true);
    assert.equal(first.output.userStory.actor, "cliente");
    assert.match(first.output.userStory.action, /tamanho e cor/i);
    assert.doesNotMatch(JSON.stringify(first.output), /\b(aluno|livro|acervo|reserva)\b/i);
  });
});

test("o endpoint executa análise com Mock sem chave Gemini e registra AIAnalysis", async () => {
  const suffix = `${Date.now()}`.slice(-8);
  const email = `mock-ai-${suffix}@example.test`;
  let userId: string | undefined;
  let projectId: string | undefined;

  await withMockProvider(async () => {
    try {
      const user = await prisma.user.create({ data: { name: "Usuário Mock IA", email, passwordHash: "test-only" } });
      userId = user.id;
      const project = await prisma.project.create({
        data: {
          ownerId: user.id,
          name: `Projeto Mock IA ${suffix}`,
          description: "Projeto temporário para testar o provider simulado.",
          objective: "Validar a análise sem serviço externo.",
          context: "Ambiente automatizado de testes.",
        },
      });
      projectId = project.id;
      const session = await prisma.elicitationSession.create({
        data: { projectId: project.id, createdById: user.id, sequence: 1, context: "Sessão para teste do provider mock." },
      });
      const cookie = `${sessionCookieName}=${await encryptSession({ userId: user.id })}`;
      const response = await analyzeRoute(request({
        projectId: project.id,
        sessionId: session.id,
        input: "Quero um sistema para uma biblioteca onde alunos possam consultar e reservar livros disponíveis.",
      }, cookie));

      assert.equal(response.status, 201);
      const payload = await response.json() as { data: InitialRequirementAnalysisResponse };
      assert.equal(initialRequirementAnalysisSchema.safeParse(payload.data.result).success, true);

      const analysis = await prisma.aIAnalysis.findUniqueOrThrow({ where: { id: payload.data.analysisId }, include: { sessions: true } });
      assert.equal(analysis.status, "SUCCEEDED");
      assert.equal(analysis.provider, "mock");
      assert.equal(analysis.model, MOCK_MODEL);
      assert.equal(analysis.sessions[0]?.sessionId, session.id);
    } finally {
      if (projectId) {
        await prisma.activityLog.deleteMany({ where: { projectId } });
        await prisma.aIAnalysis.deleteMany({ where: { projectId } });
        await prisma.elicitationSession.deleteMany({ where: { projectId } });
        await prisma.project.delete({ where: { id: projectId } });
      }
      if (userId) await prisma.user.delete({ where: { id: userId } });
    }
  });
});
