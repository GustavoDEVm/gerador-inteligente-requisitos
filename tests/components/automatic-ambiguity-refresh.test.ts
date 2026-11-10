import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

const projectId = "project-automatic-refresh";
const sessionId = "session-automatic-refresh";
const oldDescription = "Sistema para loja de roupas com produtos, tamanhos, cores, estoque e pedidos.";
const firstDescription = "Sistema escolar para cadastrar tarefas, definir prazos, registrar entregas e acompanhar alunos.";
const secondDescription = "Sistema escolar para organizar trabalhos, atribuir turmas e acompanhar avaliacoes.";

type FetchCall = { method: string; url: string; body?: unknown };

test("atualizacao automatica de ambiguidades", async () => {
  const restoreTestDom = installDomEnvironment();

  try {
  {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let cleanup: (() => void) | undefined;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = captureRequest(input, init);
        calls.push(request);
        if (request.method === "POST" && request.url === "/api/questions/question-initial/answers") {
          return jsonResponse({ id: "answer-v2", version: 2, content: firstDescription }, 201);
        }
        if (request.method === "POST" && request.url === "/api/ai/detect-ambiguities") {
          return jsonResponse(detection("analysis-v2", firstDescription, "Nao esta definido quem pode atribuir tarefas aos alunos."), 201);
        }
        return jsonResponse(readInitialPayload(request.url));
      },
    });

    const testingLibrary = await renderSession();
    cleanup = testingLibrary.cleanup;
    const { fireEvent, screen, waitFor } = testingLibrary;
    const input = screen.getByPlaceholderText("Descreva sua resposta aqui...");

    await delay(100);
    assert.equal(calls.filter((call) => call.method === "POST").length, 0);

    fireEvent.change(input, { target: { value: "Sistema escolar para cadastrar tarefas." } });
    fireEvent.change(input, { target: { value: "Sistema escolar para cadastrar tarefas e definir prazos." } });
    fireEvent.change(input, { target: { value: firstDescription } });

    await waitFor(() => assert.ok(screen.getAllByText(/Resultados desatualizados/).length > 0));
    await delay(400);
    assert.equal(calls.filter((call) => call.method === "POST").length, 0);

    await waitFor(() => {
      assert.ok(screen.getByText("Nao esta definido quem pode atribuir tarefas aos alunos."));
      assert.equal(screen.queryByText("Perguntas de refinamento desatualizadas"), null);
    }, { timeout: 3_000 });

    assert.deepEqual(
      calls.filter((call) => call.method === "POST").map((call) => ({ method: call.method, url: call.url, body: call.body })),
      [
        { method: "POST", url: "/api/questions/question-initial/answers", body: { content: firstDescription } },
        { method: "POST", url: "/api/ai/detect-ambiguities", body: { projectId, sessionId } },
      ],
    );
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
  }
  }

  {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let cleanup: (() => void) | undefined;
  let resolveFirstDetection: ((response: Response) => void) | undefined;
  let answerVersion = 1;
  let detectionCount = 0;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = captureRequest(input, init);
        calls.push(request);
        if (request.method === "POST" && request.url === "/api/questions/question-initial/answers") {
          answerVersion += 1;
          const content = (request.body as { content: string }).content;
          return jsonResponse({ id: `answer-v${answerVersion}`, version: answerVersion, content }, 201);
        }
        if (request.method === "POST" && request.url === "/api/ai/detect-ambiguities") {
          detectionCount += 1;
          if (detectionCount === 1) {
            return new Promise<Response>((resolve) => { resolveFirstDetection = resolve; });
          }
          return jsonResponse(detection("analysis-v3", secondDescription, "Nao esta definido como os trabalhos devem ser avaliados."), 201);
        }
        return jsonResponse(readInitialPayload(request.url));
      },
    });

    const testingLibrary = await renderSession();
    cleanup = testingLibrary.cleanup;
    const { fireEvent, screen, waitFor } = testingLibrary;
    const input = screen.getByPlaceholderText("Descreva sua resposta aqui...");

    fireEvent.change(input, { target: { value: firstDescription } });
    await waitFor(() => assert.ok(resolveFirstDetection), { timeout: 3_000 });

    fireEvent.change(input, { target: { value: secondDescription } });
    await delay(1_700);
    assert.equal(detectionCount, 1);

    resolveFirstDetection?.(jsonResponse(detection("analysis-v2", firstDescription, "RESPOSTA-ANTIGA-NAO-DEVE-APARECER."), 201));

    await waitFor(() => {
      assert.ok(screen.getByText("Nao esta definido como os trabalhos devem ser avaliados."));
      assert.equal(screen.queryByText("RESPOSTA-ANTIGA-NAO-DEVE-APARECER."), null);
    }, { timeout: 4_000 });
    assert.equal(detectionCount, 2);
    assert.deepEqual(
      calls.filter((call) => call.url === "/api/questions/question-initial/answers").map((call) => call.body),
      [{ content: firstDescription }, { content: secondDescription }],
    );
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
  }
  }

  {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let cleanup: (() => void) | undefined;
  let detectionCount = 0;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = captureRequest(input, init);
        calls.push(request);
        if (request.method === "POST" && request.url === "/api/questions/question-initial/answers") {
          return jsonResponse({ id: "answer-v2", version: 2, content: firstDescription }, 201);
        }
        if (request.method === "POST" && request.url === "/api/ai/detect-ambiguities") {
          detectionCount += 1;
          if (detectionCount === 1) return errorResponse("Falha temporaria na atualizacao.", 503);
          return jsonResponse(detection("analysis-v2", firstDescription, "Nao esta definido quem pode atribuir tarefas aos alunos."), 201);
        }
        return jsonResponse(readInitialPayload(request.url));
      },
    });

    const testingLibrary = await renderSession();
    cleanup = testingLibrary.cleanup;
    const { fireEvent, screen, waitFor } = testingLibrary;
    const input = screen.getByPlaceholderText("Descreva sua resposta aqui...") as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: firstDescription } });
    await waitFor(() => assert.ok(screen.getByRole("alert").textContent?.includes("Falha temporaria na atualizacao.")), { timeout: 3_000 });
    assert.equal(input.value, firstDescription);
    assert.ok(screen.getAllByText(/Resultados desatualizados/).length > 0);

    fireEvent.click(screen.getByRole("button", { name: "Detectar ambiguidades" }));
    await waitFor(() => assert.ok(screen.getByText("Nao esta definido quem pode atribuir tarefas aos alunos.")));
    assert.equal(detectionCount, 2);
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
  }
  }
  } finally {
    await restoreTestDom();
  }
});

async function renderSession() {
  const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
    import("react"),
    import("@testing-library/react"),
    import("../../src/components/elicitation/elicitation-session"),
  ]);
  testingLibrary.render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: sessionId }));
  await testingLibrary.waitFor(() => assert.ok(testingLibrary.screen.getByPlaceholderText("Descreva sua resposta aqui...")));
  return testingLibrary;
}

function captureRequest(input: RequestInfo | URL, init?: RequestInit): FetchCall {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

function readInitialPayload(url: string): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Projeto de loja" }];
  if (url === `/api/projects/${projectId}/sessions`) {
    return [{ id: sessionId, sequence: 1, title: "Levantamento", status: "ACTIVE", createdAt: "2026-11-09T10:00:00.000Z" }];
  }
  if (url === `/api/sessions/${sessionId}/questions`) {
    return [
      { id: "question-initial", position: 1, content: "Descreva a necessidade inicial.", guidance: null, source: "TEMPLATE", generatedByAnalysis: null, answers: [{ id: "answer-v1", version: 1, content: oldDescription }] },
      {
        id: "question-old-stock",
        position: 2,
        content: "Como o estoque deve ser atualizado?",
        guidance: "A regra de estoque precisa ser definida.",
        source: "AI",
        generatedByAnalysis: {
          id: "analysis-questions-v1",
          structuredOutput: { questions: [{ questionId: "question-old-stock", ambiguityId: "ambiguity-stock-v1", question: "Como o estoque deve ser atualizado?", reason: "A regra de estoque precisa ser definida.", ambiguity: { description: "Nao esta definido como o estoque deve ser atualizado.", severity: "high", context: oldDescription } }] },
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
        { analysis: { id: "analysis-ambiguity-v1", type: "AMBIGUITY_DETECTION", createdAt: "2026-11-09T10:01:00.000Z", inputSnapshot: { sourceAnswerId: "answer-v1", sourceAnswerVersion: 1, input: oldDescription }, structuredOutput: { ambiguities: [{ description: "Nao esta definido como o estoque deve ser atualizado.", severity: "high", context: oldDescription }] } } },
        { analysis: { id: "analysis-questions-v1", type: "QUESTION_GENERATION", createdAt: "2026-11-09T10:02:00.000Z", inputSnapshot: {}, structuredOutput: { questions: [] } } },
      ],
    };
  }
  throw new Error(`Leitura inesperada: ${url}`);
}

function detection(analysisId: string, context: string, description: string) {
  return { analysisId, result: { ambiguities: [{ description, severity: "high", context }] } };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), { status, headers: { "content-type": "application/json" } });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
