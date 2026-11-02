import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

const projectId = "project-multiple-sessions-ui";
const firstSessionId = "session-ui-first";
const secondSessionId = "session-ui-second";
const draftSessionId = "session-ui-draft";

test("abre exclusivamente a sessão indicada na URL e preserva a seleção atual", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const calls: string[] = [];

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        calls.push(url);
        return jsonResponse(selectionPayload(url));
      },
    });
    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const view = render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: secondSessionId }));
    await waitFor(() => assert.equal((view.getByLabelText("Sessão") as HTMLSelectElement).value, secondSessionId));
    await waitFor(() => assert.ok(view.getByText("Pergunta da sessão de estoque")));
    assert.ok(calls.includes(`/api/sessions/${secondSessionId}/questions`));
    assert.ok(calls.includes(`/api/sessions/${secondSessionId}`));
    assert.equal(calls.some((url) => url.includes(firstSessionId)), false);
    assert.match(view.getByText(/Sessão 2 · Gestão de estoque · Ativa/).textContent ?? "", /Ativa/);

    view.unmount();
    const foreignSessionId = "session-from-another-project";
    const fallbackView = render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: foreignSessionId }));
    await waitFor(() => assert.equal((fallbackView.getByLabelText("Sessão") as HTMLSelectElement).value, secondSessionId));
    await waitFor(() => assert.ok(fallbackView.getByText("Pergunta da sessão de estoque")));
    assert.equal(calls.some((url) => url.includes(foreignSessionId)), false);
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

test("cria uma nova sessão pelo endpoint de início e seleciona o resultado", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const postBodies: unknown[] = [];

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === `/api/projects/${projectId}/elicitation/start`) {
          assert.equal(init?.method, "POST");
          postBodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ session: session("session-ui-new", 2, "Compras e pagamentos", "ACTIVE"), question: {}, answer: {} }, 201);
        }
        return jsonResponse(newSessionPayload(url));
      },
    });
    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { fireEvent, render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const view = render(createElement(ElicitationSession, { initialProjectId: projectId, startNewSession: true }));
    await waitFor(() => assert.ok(view.getByRole("button", { name: "Iniciar sessão" })));
    fireEvent.change(view.getByLabelText("Título da sessão (opcional)"), { target: { value: "Compras e pagamentos" } });
    fireEvent.change(view.getByLabelText("Descrição inicial do sistema ou necessidade"), { target: { value: "Quero definir como clientes autenticados finalizam pedidos e realizam pagamentos." } });
    fireEvent.click(view.getByRole("button", { name: "Iniciar sessão" }));

    await waitFor(() => assert.equal((view.getByLabelText("Sessão") as HTMLSelectElement).value, "session-ui-new"));
    assert.deepEqual(postBodies, [{ title: "Compras e pagamentos", description: "Quero definir como clientes autenticados finalizam pedidos e realizam pagamentos." }]);
    await waitFor(() => assert.ok(view.getByText("Pergunta da sessão de compras")));
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

test("inicializa um rascunho existente sem criar uma sessão adicional", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const postBodies: unknown[] = [];
  let initialized = false;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === `/api/projects/${projectId}/elicitation/start`) {
          initialized = true;
          postBodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ session: session(draftSessionId, 2, "Administração", "ACTIVE"), question: {}, answer: {} }, 201);
        }
        return jsonResponse(draftPayload(url, initialized));
      },
    });
    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { fireEvent, render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const view = render(createElement(ElicitationSession, { initialProjectId: projectId, initialSessionId: draftSessionId }));
    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: "Inicializar rascunho" }));
      assert.equal((view.getByLabelText("Título da sessão (opcional)") as HTMLInputElement).value, "Administração");
    });
    fireEvent.change(view.getByLabelText("Descrição inicial do sistema ou necessidade"), { target: { value: "Quero detalhar as funcionalidades administrativas e o cadastro de produtos." } });
    fireEvent.click(view.getByRole("button", { name: "Inicializar rascunho" }));

    await waitFor(() => assert.equal((view.getByLabelText("Sessão") as HTMLSelectElement).value, draftSessionId));
    assert.deepEqual(postBodies, [{ title: "Administração", description: "Quero detalhar as funcionalidades administrativas e o cadastro de produtos.", draftSessionId }]);
    await waitFor(() => assert.ok(view.getByText("Pergunta da sessão de rascunho")));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

test("alterna sessões sem misturar perguntas ou sugestões de respostas", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  let unmount: (() => void) | undefined;
  const calls: Array<{ method: string; url: string }> = [];
  const firstQuestion = "Como o estoque deve ser atualizado após a confirmação de um pedido?";
  const secondQuestion = "O cliente precisa estar autenticado para finalizar um pedido?";
  const firstSuggestion = "Como proposta para validação, o estoque deve ser reduzido após a confirmação do pedido.";
  const secondSuggestion = "Como proposta para validação, o cliente deve estar autenticado para finalizar o pedido.";

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        calls.push({ method: init?.method ?? "GET", url });
        return jsonResponse(suggestedAnswersPayload(url, {
          firstQuestion,
          secondQuestion,
          firstSuggestion,
          secondSuggestion,
        }));
      },
    });
    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { fireEvent, render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const view = render(createElement(ElicitationSession, { initialProjectId: projectId }));
    unmount = view.unmount;
    await waitFor(() => assert.equal(
      (view.getByLabelText(`Resposta para: ${secondQuestion}`) as HTMLTextAreaElement).value,
      secondSuggestion,
    ));
    assert.ok(view.getByText("0/1 respondidas"));
    assert.equal(view.queryByLabelText(`Resposta para: ${firstQuestion}`), null);

    fireEvent.change(view.getByLabelText("Sessão"), { target: { value: firstSessionId } });
    await waitFor(() => assert.equal(
      (view.getByLabelText(`Resposta para: ${firstQuestion}`) as HTMLTextAreaElement).value,
      firstSuggestion,
    ));
    assert.ok(view.getByText("0/1 respondidas"));
    assert.equal(view.queryByLabelText(`Resposta para: ${secondQuestion}`), null);
    assert.ok(calls.some((call) => call.url === `/api/sessions/${firstSessionId}/questions`));
    assert.ok(calls.every((call) => call.method === "GET" && !call.url.startsWith("/api/ai/")));
  } finally {
    unmount?.();
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

function session(id: string, sequence: number, title: string, status: "DRAFT" | "ACTIVE" | "COMPLETED") {
  return { id, sequence, title, status, createdAt: "2026-11-02T10:00:00.000Z" };
}

function selectionPayload(url: string): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Sistema de Gestão de Loja de Roupas" }];
  if (url === `/api/projects/${projectId}/sessions`) return [
    session(firstSessionId, 1, "Levantamento inicial", "COMPLETED"),
    session(secondSessionId, 2, "Gestão de estoque", "ACTIVE"),
  ];
  if (url === `/api/sessions/${secondSessionId}/questions`) return [question("question-stock", "Pergunta da sessão de estoque")];
  if (url === `/api/sessions/${secondSessionId}`) return { ...session(secondSessionId, 2, "Gestão de estoque", "ACTIVE"), context: "Contexto de estoque.", analyses: [] };
  throw new Error(`Leitura inesperada: ${url}`);
}

function newSessionPayload(url: string): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Sistema de Gestão de Loja de Roupas" }];
  if (url === `/api/projects/${projectId}/sessions`) return [session(firstSessionId, 1, "Levantamento inicial", "ACTIVE")];
  if (url === "/api/sessions/session-ui-new/questions") return [question("question-new", "Pergunta da sessão de compras")];
  if (url === "/api/sessions/session-ui-new") return { ...session("session-ui-new", 2, "Compras e pagamentos", "ACTIVE"), context: "Contexto de compras.", analyses: [] };
  throw new Error(`Leitura inesperada: ${url}`);
}

function draftPayload(url: string, initialized = false): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Sistema de Gestão de Loja de Roupas" }];
  if (url === `/api/projects/${projectId}/sessions`) return [
    session(firstSessionId, 1, "Levantamento inicial", "ACTIVE"),
    session(draftSessionId, 2, "Administração", initialized ? "ACTIVE" : "DRAFT"),
  ];
  if (url === `/api/sessions/${draftSessionId}/questions`) return initialized ? [question("question-draft", "Pergunta da sessão de rascunho")] : [];
  if (url === `/api/sessions/${draftSessionId}`) return { ...session(draftSessionId, 2, "Administração", initialized ? "ACTIVE" : "DRAFT"), context: "Contexto inicial do rascunho administrativo.", analyses: [] };
  throw new Error(`Leitura inesperada: ${url}`);
}

function question(id: string, content: string) {
  return { id, position: 1, content, guidance: null, source: "TEMPLATE", generatedByAnalysis: null, answers: [{ id: `${id}-answer`, version: 1, content: "Descrição inicial persistida para a sessão." }] };
}

function suggestedAnswersPayload(
  url: string,
  values: {
    firstQuestion: string;
    secondQuestion: string;
    firstSuggestion: string;
    secondSuggestion: string;
  },
): unknown {
  if (url === "/api/projects") return [{ id: projectId, name: "Sistema de Gestão de Loja de Roupas" }];
  if (url === `/api/projects/${projectId}/sessions`) return [
    session(firstSessionId, 1, "Gestão de estoque", "COMPLETED"),
    session(secondSessionId, 2, "Pedidos", "ACTIVE"),
  ];
  if (url === `/api/sessions/${firstSessionId}/questions`) return suggestedQuestions(firstSessionId, values.firstQuestion, values.firstSuggestion);
  if (url === `/api/sessions/${secondSessionId}/questions`) return suggestedQuestions(secondSessionId, values.secondQuestion, values.secondSuggestion);
  if (url === `/api/sessions/${firstSessionId}`) return { ...session(firstSessionId, 1, "Gestão de estoque", "COMPLETED"), context: "Contexto de estoque.", analyses: [] };
  if (url === `/api/sessions/${secondSessionId}`) return { ...session(secondSessionId, 2, "Pedidos", "ACTIVE"), context: "Contexto de pedidos.", analyses: [] };
  throw new Error(`Leitura inesperada: ${url}`);
}

function suggestedQuestions(sessionId: string, question: string, suggestedAnswer: string) {
  const questionId = `${sessionId}-refinement-question`;
  return [
    {
      id: `${sessionId}-initial-question`,
      position: 1,
      content: "Qual necessidade o sistema deve atender?",
      guidance: null,
      source: "TEMPLATE",
      generatedByAnalysis: null,
      answers: [{ id: `${sessionId}-initial-answer`, version: 1, content: "Descrição inicial persistida para esta sessão." }],
    },
    {
      id: questionId,
      position: 2,
      content: question,
      guidance: "O esclarecimento é necessário para a análise.",
      source: "AI",
      suggestedAnswer,
      generatedByAnalysis: {
        id: `${sessionId}-question-analysis`,
        structuredOutput: {
          questions: [{
            questionId,
            ambiguityId: `${sessionId}-ambiguity`,
            question,
            reason: "O esclarecimento é necessário para a análise.",
            suggestedAnswer,
            ambiguity: { description: "Ambiguidade da sessão.", severity: "medium", context: null },
          }],
        },
      },
      answers: [],
    },
  ];
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}
