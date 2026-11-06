import assert from "node:assert/strict";
import test from "node:test";

import { installDomEnvironment } from "../helpers/dom";

test("a confirmação de exclusão de projeto exige o nome exato antes de chamar a API", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const deleted: Array<{ id: string; name: string }> = [];
  const calls: Array<{ url: string; method: string }> = [];

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, method: init?.method ?? "GET" });
        return new Response(JSON.stringify({ data: { id: "project-delete-ui", name: "Loja de Roupas" } }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const [{ createElement }, testingLibrary, { ProjectDeletionDialog }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/projects/project-deletion-dialog"),
    ]);
    const { fireEvent, render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;
    const view = render(createElement(ProjectDeletionDialog, {
      open: true,
      project: { id: "project-delete-ui", name: "Loja de Roupas" },
      onClose: () => undefined,
      onDeleted: (project) => deleted.push(project),
    }));

    const confirmation = view.getByRole("textbox", { name: "Nome do projeto para confirmar exclusão" });
    const deleteButton = view.getByRole("button", { name: "Excluir permanentemente" }) as HTMLButtonElement;
    assert.equal(deleteButton.disabled, true);
    fireEvent.change(confirmation, { target: { value: "Nome incorreto" } });
    assert.equal(deleteButton.disabled, true);
    fireEvent.change(confirmation, { target: { value: "Loja de Roupas" } });
    assert.equal(deleteButton.disabled, false);
    fireEvent.click(deleteButton);

    await waitFor(() => assert.deepEqual(deleted, [{ id: "project-delete-ui", name: "Loja de Roupas" }]));
    assert.deepEqual(calls, [{ url: "/api/projects/project-delete-ui", method: "DELETE" }]);
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

test("a confirmação de exclusão de sessão informa a remoção seletiva e atualiza a sessão selecionada", async () => {
  const restoreDom = installDomEnvironment();
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | undefined;
  const deleted: Array<{ id: string; projectId: string; deletedRequirementIds: string[]; deletedUserStoryIds: string[] }> = [];

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        assert.equal(url, "/api/sessions/session-delete-ui");
        assert.equal(init?.method, "DELETE");
        return new Response(JSON.stringify({ data: { id: "session-delete-ui", projectId: "project-delete-ui", deletedRequirementIds: ["requirement-1"], deletedUserStoryIds: ["story-1"] } }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const [{ createElement }, testingLibrary, { SessionDeletionDialog }] = await Promise.all([
      import("react"),
      import("@testing-library/react"),
      import("../../src/components/elicitation/session-deletion-dialog"),
    ]);
    const { fireEvent, render, waitFor } = testingLibrary;
    cleanup = testingLibrary.cleanup;
    const view = render(createElement(SessionDeletionDialog, {
      open: true,
      session: { id: "session-delete-ui", sequence: 2, title: "Gestão de estoque" },
      onClose: () => undefined,
      onDeleted: (result) => deleted.push(result),
    }));

    assert.ok(view.getByText(/Artefatos sem vínculo com esta sessão/));
    fireEvent.click(view.getByRole("button", { name: "Excluir sessão" }));
    await waitFor(() => assert.deepEqual(deleted, [{ id: "session-delete-ui", projectId: "project-delete-ui", deletedRequirementIds: ["requirement-1"], deletedUserStoryIds: ["story-1"] }]));
  } finally {
    cleanup?.();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
    restoreDom();
  }
});

test("a seleção e a URL removem a sessão excluída e preferem outra sessão ativa", async () => {
  const { selectSessionAfterDeletion, sessionUrlAfterDeletion } = await import("../../src/components/elicitation/elicitation-session");
  const sessions = [
    { id: "session-to-delete", sequence: 1, title: "Sessão removida", status: "COMPLETED" as const, createdAt: "2026-11-01T10:00:00.000Z" },
    { id: "session-to-keep", sequence: 2, title: "Sessão preservada", status: "ACTIVE" as const, createdAt: "2026-11-02T10:00:00.000Z" },
  ];
  const selection = selectSessionAfterDeletion(sessions, "session-to-delete");

  assert.deepEqual(selection.remainingSessions, [sessions[1]]);
  assert.equal(selection.nextSession?.id, "session-to-keep");
  assert.equal(
    sessionUrlAfterDeletion("http://localhost/elicitacao?projectId=project-1&sessionId=session-to-delete&newSession=true", selection.nextSession?.id),
    "/elicitacao?projectId=project-1&sessionId=session-to-keep",
  );

  const emptySelection = selectSessionAfterDeletion([sessions[0]], "session-to-delete");
  assert.equal(emptySelection.nextSession, undefined);
  assert.equal(
    sessionUrlAfterDeletion("http://localhost/elicitacao?projectId=project-1&sessionId=session-to-delete"),
    "/elicitacao?projectId=project-1",
  );
});

