import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

const projectId = "project-idea-refresh";
const sessionId = "session-idea-refresh";
const oldDescription = "Sistema para loja de roupas com produtos, tamanhos, cores, estoque e pedidos.";
const newDescription = "Sistema escolar para cadastrar tarefas, definir prazos, registrar entregas e acompanhar alunos.";

test("salva a ideia alterada e substitui a deteccao na mesma sessao sem navegacao", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  let cleanup: (() => void) | undefined;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, url, body });

        if (method === "POST" && url === "/api/questions/question-initial/answers") {
          assert.deepEqual(body, { content: newDescription });
          return jsonResponse({ id: "answer-initial-v2", version: 2, content: newDescription }, 201);
        }
        if (method === "POST" && url === "/api/ai/detect-ambiguities") {
          assert.deepEqual(body, { projectId, sessionId });
          return jsonResponse({
            analysisId: "analysis-school-v2",
            result: {
              ambiguities: [{
                description: "Nao esta definido quem pode atribuir tarefas aos alunos.",
                severity: "high",
                context: newDescription,
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
    const { cleanup: testingCleanup, fireEvent, render, screen, waitFor } = testingLibrary;
    cleanup = testingCleanup;

    render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: sessionId }));
    await waitFor(() => {
      assert.ok(screen.getByPlaceholderText("Descreva sua resposta aqui..."));
      assert.ok(screen.getByLabelText("Resposta para: Como o estoque deve ser atualizado?"));
    });

    fireEvent.change(screen.getByPlaceholderText("Descreva sua resposta aqui..."), { target: { value: newDescription } });

    await waitFor(() => {
      assert.ok(screen.getAllByText(/Resultados desatualizados/).length > 0);
      assert.ok(screen.getByText("Perguntas de refinamento desatualizadas"));
      assert.equal(screen.queryByLabelText("Resposta para: Como o estoque deve ser atualizado?"), null);
    });
    assert.equal(calls.filter((call) => call.method === "POST").length, 0);

    fireEvent.click(screen.getByRole("button", { name: "Detectar ambiguidades" }));

    await waitFor(() => {
      assert.ok(screen.getByText("Nao esta definido quem pode atribuir tarefas aos alunos."));
      assert.ok(screen.getAllByText(newDescription).length > 0);
      assert.equal(screen.queryByText("Perguntas de refinamento desatualizadas"), null);
      assert.equal(screen.queryByText("Nao esta definido como o estoque deve ser atualizado."), null);
    });

    assert.deepEqual(
      calls.filter((call) => call.method === "POST").map((call) => ({ method: call.method, url: call.url })),
      [
        { method: "POST", url: "/api/questions/question-initial/answers" },
        { method: "POST", url: "/api/ai/detect-ambiguities" },
      ],
    );
    assert.equal(calls.filter((call) => call.method === "GET").length, 4);
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    await restoreDom();
  }
});

function readPayload(url: string): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Projeto de loja" }];
  if (url === `/api/projects/${projectId}/sessions`) {
    return [{ id: sessionId, sequence: 1, title: "Levantamento", status: "ACTIVE", createdAt: "2026-11-06T10:00:00.000Z" }];
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
        answers: [{ id: "answer-initial-v1", version: 1, content: oldDescription }],
      },
      {
        id: "question-old-stock",
        position: 2,
        content: "Como o estoque deve ser atualizado?",
        guidance: "A regra de estoque precisa ser definida.",
        source: "AI",
        generatedByAnalysis: {
          id: "analysis-questions-v1",
          structuredOutput: {
            questions: [{
              questionId: "question-old-stock",
              ambiguityId: "ambiguity-stock-v1",
              question: "Como o estoque deve ser atualizado?",
              reason: "A regra de estoque precisa ser definida.",
              ambiguity: {
                description: "Nao esta definido como o estoque deve ser atualizado.",
                severity: "high",
                context: oldDescription,
              },
            }],
          },
        },
        answers: [],
      },
    ];
  }
  if (url === `/api/sessions/${sessionId}`) {
    return {
      id: sessionId,
      title: "Levantamento",
      context: oldDescription,
      status: "ACTIVE",
      currentAmbiguityAnalysisId: "analysis-ambiguity-v1",
      currentRefinementQuestionAnalysisId: "analysis-questions-v1",
      analyses: [
        {
          analysis: {
            id: "analysis-ambiguity-v1",
            type: "AMBIGUITY_DETECTION",
            createdAt: "2026-11-06T10:01:00.000Z",
            inputSnapshot: {
              sourceAnswerId: "answer-initial-v1",
              sourceAnswerVersion: 1,
              input: oldDescription,
            },
            structuredOutput: {
              ambiguities: [{
                description: "Nao esta definido como o estoque deve ser atualizado.",
                severity: "high",
                context: oldDescription,
              }],
            },
          },
        },
        {
          analysis: {
            id: "analysis-questions-v1",
            type: "QUESTION_GENERATION",
            createdAt: "2026-11-06T10:02:00.000Z",
            inputSnapshot: {},
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
