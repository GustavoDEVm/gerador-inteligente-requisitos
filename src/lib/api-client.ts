import type { ApiEnvelope, ApiErrorEnvelope } from "@/types/api";

export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { message: "Não foi possível concluir a solicitação." };
    throw new ApiClientError(error.message, response.status, "code" in error ? error.code : undefined);
  }

  return payload.data;
}
