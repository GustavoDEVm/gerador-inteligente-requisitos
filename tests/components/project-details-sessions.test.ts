import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

test("o detalhe do projeto lista sessões navegáveis e oferece a criação de uma nova sessão", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const projectId = "project-details-sessions";

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        assert.equal(url, `/api/projects/${projectId}`);
        return new Response(JSON.stringify({ data: {
          id: projectId,
          name: "Sistema de Gestão de Loja de Roupas",
          description: "Projeto usado para validar a navegação entre sessões.",
          objective: "Organizar a elicitação do sistema.",
          context: "Loja de roupas.",
          status: "ACTIVE",
          stakeholders: [],
          sessions: [
            { id: "session-details-1", sequence: 1, title: "Levantamento inicial", status: "COMPLETED", createdAt: "2026-11-01T10:00:00.000Z", _count: { questions: 3 } },
            { id: "session-details-2", sequence: 2, title: "Gestão de estoque", status: "ACTIVE", createdAt: "2026-11-02T10:00:00.000Z", _count: { questions: 1 } },
          ],
          requirements: [],
          _count: { requirements: 0, sessions: 2 },
        } }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const [{ createElement }, testingLibrary, { ProjectDetailsContent }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/projects/project-details-content"),
    ]);
    const { render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;

    const view = render(createElement(ProjectDetailsContent, { projectId }));
    await waitFor(() => assert.ok(view.getByText("Sessões de elicitação")));
    assert.ok(view.getByText("Sessão 1 · Levantamento inicial"));
    assert.ok(view.getByText("Sessão 2 · Gestão de estoque"));
    assert.ok(view.getByText(/Concluída/));
    assert.ok(view.getByText(/Ativa/));

    const openLinks = view.getAllByRole("link", { name: "Abrir sessão" });
    assert.deepEqual(openLinks.map((link) => link.getAttribute("href")), [
      `/elicitacao?projectId=${projectId}&sessionId=session-details-1`,
      `/elicitacao?projectId=${projectId}&sessionId=session-details-2`,
    ]);
    assert.ok(view.getAllByRole("link", { name: "Nova sessão de elicitação" })
      .some((link) => link.getAttribute("href") === `/elicitacao?projectId=${projectId}&newSession=true`));
    assert.equal(view.getAllByRole("button", { name: "Excluir sessão" }).length, 2);
    assert.ok(view.getByRole("button", { name: "Excluir projeto" }));
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    await restoreDom();
  }
});
