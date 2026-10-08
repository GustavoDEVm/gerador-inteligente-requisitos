import { GoogleGenAI } from "@google/genai";

import { AIProviderError, aiConfigurationError, aiInvalidResponseError, aiProviderUnavailableError } from "@/services/ai/errors";
import { logAIError, logAIEvent } from "@/services/ai/observability";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "@/services/ai/types";

type GeminiProviderOptions = {
  apiKey?: string;
  client?: Pick<GoogleGenAI, "models">;
  model?: string;
  wait?: (milliseconds: number) => Promise<void>;
};

export const GEMINI_RETRY_DELAY_MS = 1_000;
const MAX_GEMINI_ATTEMPTS = 2;
const RETRYABLE_GEMINI_OPERATIONS = new Set(["generate-requirements", "detect-ambiguities"]);

export type GeminiDiagnostic = {
  causeCode?: string;
  causeName?: string;
  errorCode?: string;
  errorName: string;
  status?: number;
  technicalMessage: string;
};

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private readonly client: Pick<GoogleGenAI, "models">;
  private readonly defaultModel: string;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor({ apiKey, client, model, wait = waitFor }: GeminiProviderOptions) {
    if (!apiKey || !model) throw aiConfigurationError();

    this.client = client ?? new GoogleGenAI({ apiKey });
    this.defaultModel = model;
    this.wait = wait;
  }

  async generateStructuredResponse<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResponse<T>> {
    const operation = request.metadata?.operation ?? "unknown";
    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs ?? 30_000;
    try {
      const response = await this.generateContentWithRetry({ model, operation, request, timeoutMs });

      if (!response.text) throw aiInvalidResponseError();

      try {
        return {
          output: JSON.parse(response.text) as T,
          model: response.modelVersion ?? model,
        };
      } catch {
        throw aiInvalidResponseError();
      }
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw mapGeminiError(error);
    }
  }

  private async generateContentWithRetry({
    model,
    operation,
    request,
    timeoutMs,
  }: {
    model: string;
    operation: string;
    request: StructuredGenerationRequest<unknown>;
    timeoutMs: number;
  }) {
    for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
      const retryAttempt = attempt > 1;
      const startedAt = Date.now();
      logAIEvent("gemini-request-started", { attempt, model, operation, retry: retryAttempt, timeoutMs });

      try {
        const response = await this.client.models.generateContent({
          model,
          contents: request.userInput,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: request.responseJsonSchema,
            temperature: request.temperature,
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });
        logAIEvent("gemini-generate-content-returned", {
          attempt,
          durationMs: Date.now() - startedAt,
          model,
          operation,
          responseReceived: true,
          retry: retryAttempt,
          timeoutMs,
        });
        return response;
      } catch (error) {
        const diagnostic = getGeminiDiagnostic(error);
        const retry = attempt === 1
          && RETRYABLE_GEMINI_OPERATIONS.has(operation)
          && isTransientGeminiServiceUnavailable(error, diagnostic);
        logAIError("gemini-request-failed", {
          attempt,
          causeCode: diagnostic.causeCode,
          causeName: diagnostic.causeName,
          durationMs: Date.now() - startedAt,
          errorCode: diagnostic.errorCode,
          errorName: diagnostic.errorName,
          model,
          operation,
          responseReceived: false,
          retry,
          status: diagnostic.status,
          technicalMessage: diagnostic.technicalMessage,
          timeout: isTimeoutDiagnostic(diagnostic),
          timeoutMs,
        });

        if (!retry) throw error;

        logAIEvent("gemini-retry-scheduled", {
          attempt,
          model,
          operation,
          retry: true,
          retryDelayMs: GEMINI_RETRY_DELAY_MS,
          status: diagnostic.status,
        });
        await this.wait(GEMINI_RETRY_DELAY_MS);
      }
    }

    throw new Error("Fluxo de retry Gemini finalizado sem resposta.");
  }
}

export function mapGeminiError(error: unknown, diagnostic = getGeminiDiagnostic(error)) {
  const { status } = diagnostic;

  if (isTimeoutDiagnostic(diagnostic)) return new AIProviderError("AI_TIMEOUT");
  if (status === 429) return new AIProviderError("AI_RATE_LIMIT");
  if (status === 401 || status === 403) return aiConfigurationError();

  return aiProviderUnavailableError();
}

export function getGeminiDiagnostic(error: unknown): GeminiDiagnostic {
  const cause = error instanceof Error ? error.cause : undefined;
  const errorCode = getErrorCode(error);
  const causeCode = getErrorCode(cause);
  const status = getStatusCode(error);

  return {
    causeCode,
    causeName: cause instanceof Error ? cause.name : undefined,
    errorCode,
    errorName: error instanceof Error ? error.name : "UnknownError",
    status,
    technicalMessage: getSafeTechnicalMessage(error, cause, status, errorCode, causeCode),
  };
}

export function isTransientGeminiServiceUnavailable(error: unknown, diagnostic = getGeminiDiagnostic(error)) {
  return diagnostic.status === 503 && !isTimeoutDiagnostic(diagnostic);
}

function isTimeoutDiagnostic(diagnostic: GeminiDiagnostic) {
  return diagnostic.status === 408 || [diagnostic.errorName, diagnostic.causeName].some((name) => (
    name !== undefined && ["AbortError", "TimeoutError", "RequestTimeoutError", "APIConnectionTimeoutError"].includes(name)
  ));
}

function getStatusCode(error: unknown, inspected = new Set<object>()): number | undefined {
  if (!error || typeof error !== "object" || inspected.has(error)) return undefined;
  inspected.add(error);

  if ("status" in error && typeof error.status === "number") return error.status;
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;

  for (const property of ["cause", "response"]) {
    if (property in error) {
      const nestedStatus = getStatusCode((error as Record<string, unknown>)[property], inspected);
      if (nestedStatus !== undefined) return nestedStatus;
    }
  }

  return undefined;
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function getSafeTechnicalMessage(error: unknown, cause: unknown, status?: number, errorCode?: string, causeCode?: string) {
  const code = errorCode ?? causeCode;

  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "certificate-verification-failed";
  if (code === "CERT_HAS_EXPIRED") return "certificate-expired";
  if (code === "ENOTFOUND") return "dns-resolution-failed";
  if (code === "ECONNRESET") return "connection-reset";
  if (code === "ETIMEDOUT") return "connection-timed-out";
  if (status !== undefined) return "http-request-failed";

  const messages = [error, cause]
    .filter((value): value is Error => value instanceof Error)
    .map((value) => value.message.toLowerCase());

  if (messages.some((message) => message.includes("timeout") || message.includes("timed out") || message.includes("aborted"))) {
    return "request-timed-out";
  }
  if (messages.some((message) => message.includes("fetch failed"))) return "fetch-failed";

  return "technical-message-omitted";
}

function waitFor(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
