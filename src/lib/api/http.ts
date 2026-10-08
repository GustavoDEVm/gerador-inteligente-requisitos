import type { z } from "zod";

import { invalidInput, errorResponse } from "@/lib/api/errors";

export function ok<T>(data: T, status = 200) {
  return Response.json({ data }, { status });
}

export async function handleApi(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function parseBody<TSchema extends z.ZodType>(request: Request, schema: TSchema): Promise<z.output<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw invalidInput("O corpo da requisição deve conter JSON válido.");
  }

  return schema.parse(body);
}

export function parseId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalidInput("O identificador informado não é um UUID válido.");
  }

  return value;
}
