import { Prisma } from "../../../generated/prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503 | 504,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function invalidInput(message: string, details?: unknown) {
  return new AppError(400, "INVALID_INPUT", message, details);
}

export function notFound(resource: string) {
  return new AppError(404, "NOT_FOUND", `${resource} não foi encontrado.`);
}

export function conflict(message: string) {
  return new AppError(409, "CONFLICT", message);
}

export function unauthenticated() {
  return new AppError(401, "UNAUTHENTICATED", "É necessário autenticar-se para acessar este recurso.");
}

export function forbidden() {
  return new AppError(403, "FORBIDDEN", "Você não possui permissão para acessar este recurso.");
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Os dados enviados são inválidos.",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return Response.json({ error: { code: "CONFLICT", message: "Já existe um registro com estes dados únicos." } }, { status: 409 });
    }

    if (error.code === "P2025") {
      return Response.json({ error: { code: "NOT_FOUND", message: "O registro solicitado não foi encontrado." } }, { status: 404 });
    }

    if (error.code === "P2003") {
      return Response.json({ error: { code: "INVALID_REFERENCE", message: "Uma referência informada não é válida." } }, { status: 400 });
    }
  }

  console.error("Erro não tratado na API", error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a solicitação." } },
    { status: 500 },
  );
}
