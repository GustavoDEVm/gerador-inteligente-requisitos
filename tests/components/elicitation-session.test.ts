import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

const projectId = "project-ui-test";
const sessionId = "session-ui-test";
const questionsAnalysisId = "analysis-questions";

const initialRequirements = {
  userStory: {
    actor: "cliente",
    action: "consultar produtos e adicionar itens ao carrinho",
    benefit: "montar um pedido de roupas",
  },
  functionalRequirements: [{
    code: "RF-001",
    title: "Consultar produtos",
    description: "O sistema deve permitir que o cliente consulte produtos da loja.",
  }],
  nonFunctionalRequirements: [{
    code: "RNF-001",
    category: "Usabilidade",
    description: "O catálogo deve apresentar informações de forma clara.",
  }],
  acceptanceCriteria: [{
    description: "Quando houver produtos cadastrados, o cliente deve visualizar o catálogo.",
  }],
};

const refinedRequirements = {
  userStory: {
    actor: "cliente autenticado",
    action: "finalizar o pedido com itens do carrinho",
    benefit: "comprar roupas com estoque consistente",
  },
  functionalRequirements: [{
    code: "RF-101",
    title: "Finalizar pedido autenticado",
    description: "O sistema deve exigir autenticação para o cliente finalizar um pedido.",
  }],
  nonFunctionalRequirements: [{
    code: "RNF-101",
    category: "Confiabilidade",
    description: "A atualização de estoque deve ser consistente após a confirmação do pedido.",
  }],
  acceptanceCriteria: [{
    description: "Quando um cliente não autenticado tentar finalizar o pedido, o sistema deve solicitar autenticação.",
  }],
};

const refinementQuestions = [
  {
    questionId: "question-refinement-authentication",
    ambiguityId: "ambiguity-authentication",
    question: "O cliente precisa estar autenticado para finalizar um pedido?",
    reason: "A regra de acesso precisa estar definida antes da finalização.",
    ambiguity: {
      description: "Não está definido se o cliente precisa estar autenticado para finalizar um pedido.",
      severity: "medium",
      context: "A descrição inicial menciona pedidos, mas não informa a regra de acesso.",
    },
  },
  {
    questionId: "question-refinement-stock",
    ambiguityId: "ambiguity-stock",
    question: "Como o estoque deve ser atualizado após a confirmação de um pedido?",
    reason: "A regra de atualização do estoque precisa ser definida.",
    ambiguity: {
      description: "Não está definido como o estoque é atualizado após um pedido.",
      severity: "high",
      context: "O projeto possui pedidos, mas não detalha a baixa de estoque.",
    },
  },
  {
    questionId: "question-refinement-variation",
    ambiguityId: "ambiguity-variation",
    question: "Como funcionam as combinações de tamanho e cor de cada produto?",
    reason: "As variações precisam ter estoque próprio.",
    ambiguity: {
      description: "Não está definida a combinação de tamanho e cor de cada produto.",
      severity: "medium",
      context: "Produtos de roupas podem possuir múltiplas variações.",
    },
  },
] as const;

const latestAnswers = {
  authentication: "O cliente deve estar autenticado para finalizar o pedido.",
  stock: "O estoque deve ser reduzido automaticamente após a confirmação do pedido.",
  variation: "Cada produto deve controlar o estoque separadamente por combinação de tamanho e cor.",
} as const;

test("a sessão de elicitação reidrata visualmente respostas e resultados sem executar IA", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];
  let cleanup: (() => void) | undefined;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? "GET";
        calls.push({ method, url });

        if (method !== "GET") {
          throw new Error(`A montagem não deve executar ${method} ${url}.`);
        }

        return jsonResponse(readPayloadFor(url));
      },
    });

    const [{ createElement }, testingLibrary, { ElicitationSession }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/elicitation-session"),
    ]);
    const { render, screen, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const firstMount = render(createElement(ElicitationSession, { initialProjectId: projectId }));
    await waitFor(() => assertVisualState(screen));
    assertReadOnlyLoadCalls(calls);

    firstMount.unmount();

    render(createElement(ElicitationSession, { initialProjectId: projectId }));
    await waitFor(() => assertVisualState(screen));
    assertReadOnlyLoadCalls(calls.slice(4));

    assert.equal(calls.length, 8);
    assert.ok(calls.every((call) => call.method === "GET"));
    assert.ok(calls.every((call) => !call.url.startsWith("/api/ai/")));
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
    restoreDom();
  }
});

function readPayloadFor(url: string): unknown {
  if (url === "/api/projects") {
    return [{ id: projectId, name: "Sistema de Gestão de Loja de Roupas" }];
  }
  if (url === `/api/projects/${projectId}/sessions`) {
    return [{ id: sessionId, sequence: 1, title: "Elicitação da loja de roupas" }];
  }
  if (url === `/api/sessions/${sessionId}/questions`) {
    return [
      {
        id: "question-initial",
        position: 1,
        content: "Qual necessidade o sistema deve atender?",
        guidance: null,
        source: "MANUAL",
        generatedByAnalysis: null,
        answers: [{ id: "answer-initial", version: 1, content: "A loja deve permitir consultar roupas, montar carrinho e realizar pedidos." }],
      },
      {
        id: refinementQuestions[0].questionId,
        position: 2,
        content: refinementQuestions[0].question,
        guidance: refinementQuestions[0].reason,
        source: "AI",
        generatedByAnalysis: { id: questionsAnalysisId, structuredOutput: { questions: refinementQuestions } },
        answers: [
          { id: "answer-authentication-v1", version: 1, content: "Ainda não definido." },
          { id: "answer-authentication-v2", version: 2, content: latestAnswers.authentication },
        ],
      },
      {
        id: refinementQuestions[1].questionId,
        position: 3,
        content: refinementQuestions[1].question,
        guidance: refinementQuestions[1].reason,
        source: "AI",
        generatedByAnalysis: { id: questionsAnalysisId, structuredOutput: { questions: refinementQuestions } },
        answers: [{ id: "answer-stock-v1", version: 1, content: latestAnswers.stock }],
      },
      {
        id: refinementQuestions[2].questionId,
        position: 4,
        content: refinementQuestions[2].question,
        guidance: refinementQuestions[2].reason,
        source: "AI",
        generatedByAnalysis: { id: questionsAnalysisId, structuredOutput: { questions: refinementQuestions } },
        answers: [{ id: "answer-variation-v1", version: 1, content: latestAnswers.variation }],
      },
    ];
  }
  if (url === `/api/sessions/${sessionId}`) {
    return {
      analyses: [
        {
          analysis: {
            id: "analysis-requirements",
            type: "REQUIREMENT_EXTRACTION",
            createdAt: "2026-10-30T10:00:00.000Z",
            structuredOutput: initialRequirements,
          },
        },
        {
          analysis: {
            id: "analysis-ambiguities",
            type: "AMBIGUITY_DETECTION",
            createdAt: "2026-10-30T10:01:00.000Z",
            structuredOutput: { ambiguities: refinementQuestions.map((item) => ({
              description: item.ambiguity.description,
              severity: item.ambiguity.severity,
              context: item.ambiguity.context,
            })) },
          },
        },
        {
          analysis: {
            id: questionsAnalysisId,
            type: "QUESTION_GENERATION",
            createdAt: "2026-10-30T10:02:00.000Z",
            structuredOutput: { questions: refinementQuestions },
          },
        },
        {
          analysis: {
            id: "analysis-refinement",
            type: "REFINEMENT",
            createdAt: "2026-10-30T10:03:00.000Z",
            structuredOutput: refinedRequirements,
          },
        },
      ],
    };
  }

  throw new Error(`Leitura inesperada durante a montagem: ${url}`);
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function assertVisualState(screen: typeof import("@testing-library/react")["screen"]) {
  assert.ok(screen.getByText("3/3 respondidas"));
  assert.equal(screen.getAllByText("Respondida").length, 3);
  assert.equal(
    (screen.getByLabelText(`Resposta para: ${refinementQuestions[0].question}`) as HTMLTextAreaElement).value,
    latestAnswers.authentication,
  );
  assert.equal(
    (screen.getByLabelText(`Resposta para: ${refinementQuestions[1].question}`) as HTMLTextAreaElement).value,
    latestAnswers.stock,
  );
  assert.equal(
    (screen.getByLabelText(`Resposta para: ${refinementQuestions[2].question}`) as HTMLTextAreaElement).value,
    latestAnswers.variation,
  );
  const initialPanel = screen.getByRole("heading", { name: "Requisitos gerados pela IA" }).closest("section");
  const refinedPanel = screen.getByRole("heading", { name: "Requisitos refinados pela IA" }).closest("section");
  assert.ok(initialPanel);
  assert.ok(refinedPanel);
  assert.match(initialPanel.textContent ?? "", /RF-001/);
  assert.doesNotMatch(initialPanel.textContent ?? "", /RF-101/);
  assert.match(refinedPanel.textContent ?? "", /Nova versão refinada/);
  assert.match(refinedPanel.textContent ?? "", /RF-101/);
  assert.doesNotMatch(refinedPanel.textContent ?? "", /RF-001/);
}

function assertReadOnlyLoadCalls(calls: Array<{ method: string; url: string }>) {
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.method === "GET"));
  assert.deepEqual(
    new Set(calls.map((call) => call.url)),
    new Set([
      "/api/projects",
      `/api/projects/${projectId}/sessions`,
      `/api/sessions/${sessionId}/questions`,
      `/api/sessions/${sessionId}`,
    ]),
  );
  assert.ok(calls.every((call) => !call.url.startsWith("/api/ai/")));
}
