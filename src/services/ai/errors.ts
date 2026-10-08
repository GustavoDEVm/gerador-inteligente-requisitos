import { AppError } from "@/lib/api/errors";

export type AIErrorCode =
  | "AI_CONFIGURATION"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE";

const errorDefinitions: Record<AIErrorCode, { status: 422 | 429 | 503 | 504; message: string }> = {
  AI_CONFIGURATION: {
    status: 503,
    message: "A integração de IA ainda não está configurada no servidor.",
  },
  AI_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "O provedor de IA está indisponível no momento. Tente novamente mais tarde.",
  },
  AI_RATE_LIMIT: {
    status: 429,
    message: "O limite temporário de uso da IA foi atingido. Aguarde alguns instantes e tente novamente.",
  },
  AI_TIMEOUT: {
    status: 504,
    message: "A análise demorou mais que o limite permitido. Tente novamente.",
  },
  AI_INVALID_RESPONSE: {
    status: 422,
    message: "A IA retornou uma resposta em formato inválido. Nenhum resultado foi salvo.",
  },
};

export class AIProviderError extends AppError {
  constructor(code: AIErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.status, code, definition.message);
    this.name = "AIProviderError";
  }
}

export function aiConfigurationError() {
  return new AIProviderError("AI_CONFIGURATION");
}

export function aiInvalidResponseError() {
  return new AIProviderError("AI_INVALID_RESPONSE");
}

export function aiProviderUnavailableError() {
  return new AIProviderError("AI_PROVIDER_UNAVAILABLE");
}
