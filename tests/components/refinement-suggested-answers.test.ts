import assert from "node:assert/strict";
import test from "node:test";

import type { RefinementQuestionDisplay } from "../../src/components/ai/refinement-questions-results";
import { installDomEnvironment } from "../helpers/dom";

const suggestedQuestion: RefinementQuestionDisplay = {
  questionId: "question-suggested",
  ambiguityId: "ambiguity-suggested",
  question: "Como o estoque deve ser atualizado após a confirmação de um pedido?",
  reason: "A disponibilidade precisa permanecer correta.",
  suggestedAnswer: "Como proposta para validação, o estoque deve ser reduzido após a confirmação do pedido.",
  ambiguity: {
    description: "Não está definido como o estoque é atualizado após um pedido.",
    severity: "high" as const,
    context: "A descrição menciona pedidos e estoque.",
  },
  answers: [],
};

const manualQuestion: RefinementQuestionDisplay = {
  questionId: "question-manual",
  ambiguityId: "ambiguity-manual",
  question: "Quem pode confirmar uma solicitação?",
  reason: "A responsabilidade ainda não foi definida.",
  ambiguity: {
    description: "Não está definido quem confirma a solicitação.",
    severity: "medium" as const,
    context: null,
  },
  answers: [],
};

const persistedQuestion: RefinementQuestionDisplay = {
  questionId: "question-persisted",
  ambiguityId: "ambiguity-persisted",
  question: "Como o cliente deve confirmar o pedido?",
  reason: "A regra de confirmação precisa ser clara.",
  suggestedAnswer: "Sugestão que não deve substituir a resposta registrada.",
  ambiguity: {
    description: "Não está definido como o pedido é confirmado.",
    severity: "medium" as const,
    context: null,
  },
  answers: [{ id: "answer-persisted-v1", version: 1, content: "O cliente autenticado deve confirmar o pedido antes da conclusão." }],
};

test("a sugestão é um rascunho editável e só se torna resposta após o salvamento", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined }> = [];
  let cleanup: (() => void) | undefined;

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });

        return new Response(JSON.stringify({
          data: { id: "answer-suggested-v1", version: 1, content: "Resposta revisada pelo usuário." },
        }), {
          headers: { "content-type": "application/json" },
          status: 201,
        });
      },
    });

    const [{ createElement, useState }, testingLibrary, { RefinementQuestionsResults }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/ai/refinement-questions-results"),
    ]);
    const { fireEvent, render, screen, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    function Harness() {
      const [questions, setQuestions] = useState<RefinementQuestionDisplay[]>([suggestedQuestion, persistedQuestion, manualQuestion]);

      return createElement(RefinementQuestionsResults, {
        questions,
        generated: true,
        hasAmbiguities: true,
        onAnswerSaved: (questionId, answer) => setQuestions((current) => current.map((question) => (
          question.questionId === questionId
            ? { ...question, answers: [...question.answers, answer] }
            : question
        ))),
      });
    }

    let view = render(createElement(Harness));
    let suggestedTextarea = screen.getByLabelText(`Resposta para: ${suggestedQuestion.question}`) as HTMLTextAreaElement;
    let manualTextarea = screen.getByLabelText(`Resposta para: ${manualQuestion.question}`) as HTMLTextAreaElement;
    const persistedTextarea = screen.getByLabelText(`Resposta para: ${persistedQuestion.question}`) as HTMLTextAreaElement;

    assert.equal(screen.getByText("1/3 respondidas").textContent, "1/3 respondidas");
    assert.equal(suggestedTextarea.value, suggestedQuestion.suggestedAnswer);
    assert.equal(manualTextarea.value, "");
    assert.equal(persistedTextarea.value, persistedQuestion.answers[0]?.content);
    assert.ok(screen.getByText("Sugestão da IA — revise antes de salvar."));
    assert.equal(calls.length, 0);

    view.unmount();
    view = render(createElement(Harness));
    suggestedTextarea = screen.getByLabelText(`Resposta para: ${suggestedQuestion.question}`) as HTMLTextAreaElement;
    manualTextarea = screen.getByLabelText(`Resposta para: ${manualQuestion.question}`) as HTMLTextAreaElement;
    assert.equal(suggestedTextarea.value, suggestedQuestion.suggestedAnswer);
    assert.equal(calls.length, 0);

    fireEvent.change(suggestedTextarea, { target: { value: "Resposta ajustada temporariamente." } });
    assert.equal(suggestedTextarea.value, "Resposta ajustada temporariamente.");
    fireEvent.change(suggestedTextarea, { target: { value: "" } });
    assert.equal(suggestedTextarea.value, "");

    view.rerender(createElement(Harness));
    suggestedTextarea = screen.getByLabelText(`Resposta para: ${suggestedQuestion.question}`) as HTMLTextAreaElement;
    assert.equal(suggestedTextarea.value, "");

    fireEvent.change(manualTextarea, { target: { value: "A pessoa responsável deve confirmar a solicitação." } });
    assert.equal(manualTextarea.value, "A pessoa responsável deve confirmar a solicitação.");
    assert.equal(calls.length, 0);

    fireEvent.change(suggestedTextarea, { target: { value: "Resposta revisada pelo usuário." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar resposta" })[0]!);

    await waitFor(() => {
      assert.equal(calls.length, 1);
      assert.equal(screen.getByText("2/3 respondidas").textContent, "2/3 respondidas");
    });
    assert.deepEqual(calls, [{
      url: "/api/questions/question-suggested/answers",
      method: "POST",
      body: JSON.stringify({ content: "Resposta revisada pelo usuário." }),
    }]);
    assert.equal((screen.getByLabelText(`Resposta para: ${suggestedQuestion.question}`) as HTMLTextAreaElement).value, "Resposta revisada pelo usuário.");
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
