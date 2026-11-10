import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

const projectId = "project-ambiguity-refresh";
const sessionId = "session-ambiguity-refresh";
const oldQuestionAnalysisId = "question-analysis-old";
const oldAmbiguityAnalysisId = "ambiguity-analysis-old";
const oldContext = "Sistema web para uma loja de roupas com estoque, tamanhos, cores e pedidos.";
const newContext = "Sistema web para gerenciamento de tarefas escolares, permitindo cadastrar atividades, atribuir responsáveis e acompanhar prazos e entregas.";

test("uma nova detecção substitui imediatamente as ambiguidades e perguntas atuais da sessão", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const calls: Array<{ url: string; method: string }> = [];

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? "GET";
        calls.push({ url, method });

        if (method === "POST" && url === "/api/ai/detect-ambiguities") {
          return jsonResponse({
            analysisId: "ambiguity-analysis-school",
            result: {
              ambiguities: [{
                description: "Não está definido quem pode cadastrar e atribuir tarefas aos alunos.",
                severity: "high",
                context: newContext,
              }],
            },
          }, 201);
        }

        return jsonResponse(readPayload(url));
      },
    });

    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { fireEvent, render, screen, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: sessionId }));
    await waitFor(() => {
      assert.ok(screen.getAllByText("Não está definido como o estoque é atualizado após um pedido.").length >= 1);
      assert.ok(screen.getByLabelText("Resposta para: Como o estoque deve ser atualizado após um pedido?"));
    });

    fireEvent.click(screen.getByRole("button", { name: "Detectar ambiguidades" }));

    await waitFor(() => {
      assert.ok(screen.getByText("Não está definido quem pode cadastrar e atribuir tarefas aos alunos."));
      assert.ok(screen.getAllByText(newContext).length >= 2);
      assert.equal(screen.queryByText(oldContext), null);
      assert.equal(screen.queryByLabelText("Resposta para: Como o estoque deve ser atualizado após um pedido?"), null);
    });
    assert.deepEqual(calls.filter((call) => call.method === "POST"), [{ url: "/api/ai/detect-ambiguities", method: "POST" }]);
    assert.equal(calls.filter((call) => call.method === "GET").length, 4);
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    await restoreDom();
  }
});

function readPayload(url: string): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Projeto de tarefas" }];
  if (url === `/api/projects/${projectId}/sessions`) {
    return [{ id: sessionId, sequence: 1, title: "Levantamento inicial", status: "ACTIVE", createdAt: "2026-11-06T10:00:00.000Z" }];
  }
  if (url === `/api/sessions/${sessionId}/questions`) {
    return [
      {
        id: "question-initial",
        position: 1,
        content: "Descreva a necessidade inicial.",
        guidance: null,
        source: "TEMPLATE",
        generatedByAnalysis: null,
        answers: [{ id: "answer-initial", version: 1, content: newContext }],
      },
      {
        id: "question-old-stock",
        position: 2,
        content: "Como o estoque deve ser atualizado após um pedido?",
        guidance: "A regra de estoque precisa ser definida.",
        source: "AI",
        generatedByAnalysis: {
          id: oldQuestionAnalysisId,
          structuredOutput: {
            questions: [{
              questionId: "question-old-stock",
              ambiguityId: "ambiguity-old-stock",
              question: "Como o estoque deve ser atualizado após um pedido?",
              reason: "A regra de estoque precisa ser definida.",
              ambiguity: {
                description: "Não está definido como o estoque é atualizado após um pedido.",
                severity: "high",
                context: oldContext,
              },
            }],
          },
        },
        answers: [{ id: "answer-old-stock", version: 1, content: "A resposta histórica da loja." }],
      },
    ];
  }
  if (url === `/api/sessions/${sessionId}`) {
    return {
      id: sessionId,
      title: "Levantamento inicial",
      context: newContext,
      status: "ACTIVE",
      currentAmbiguityAnalysisId: oldAmbiguityAnalysisId,
      currentRefinementQuestionAnalysisId: oldQuestionAnalysisId,
      analyses: [
        {
          analysis: {
            id: oldAmbiguityAnalysisId,
            type: "AMBIGUITY_DETECTION",
            createdAt: "2026-11-06T10:01:00.000Z",
            structuredOutput: {
              ambiguities: [{
                description: "Não está definido como o estoque é atualizado após um pedido.",
                severity: "high",
                context: oldContext,
              }],
            },
          },
        },
        {
          analysis: {
            id: oldQuestionAnalysisId,
            type: "QUESTION_GENERATION",
            createdAt: "2026-11-06T10:02:00.000Z",
            structuredOutput: { questions: [] },
          },
        },
      ],
    };
  }
  throw new Error(`Leitura inesperada: ${url}`);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
