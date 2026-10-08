type AIObservabilityValue = boolean | number | string | undefined;

type AIObservabilityField =
  | "analysisId"
  | "attempt"
  | "causeCode"
  | "causeName"
  | "durationMs"
  | "errorCode"
  | "errorName"
  | "model"
  | "operation"
  | "outcome"
  | "responseReceived"
  | "retry"
  | "retryDelayMs"
  | "stage"
  | "status"
  | "technicalMessage"
  | "timeout"
  | "timeoutMs";

export type AIObservabilityFields = Partial<Record<AIObservabilityField, AIObservabilityValue>>;

export type AITimingContext = {
  analysisId?: string;
  operation: string;
};

export async function measureAIStage<T>(context: AITimingContext, stage: string, operation: () => Promise<T> | T): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await operation();
    logAIEvent("ai-stage-completed", {
      analysisId: context.analysisId,
      durationMs: Date.now() - startedAt,
      operation: context.operation,
      outcome: "succeeded",
      stage,
    });
    return result;
  } catch (error) {
    logAIEvent("ai-stage-completed", {
      analysisId: context.analysisId,
      durationMs: Date.now() - startedAt,
      errorName: getSafeErrorName(error),
      operation: context.operation,
      outcome: "failed",
      stage,
    });
    throw error;
  }
}

export function logAIEvent(event: string, fields: AIObservabilityFields) {
  console.info(formatAIEvent(event, fields));
}

export function logAIError(event: string, fields: AIObservabilityFields) {
  console.error(formatAIEvent(event, fields));
}

export function formatAIEvent(event: string, fields: AIObservabilityFields) {
  const values = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value!)}`);

  return `[AI_OBSERVABILITY] event=${formatValue(event)}${values.length > 0 ? ` ${values.join(" ")}` : ""}`;
}

function getSafeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function formatValue(value: boolean | number | string) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^A-Za-z0-9._:/=-]/g, "_")
    .slice(0, 160);
}
