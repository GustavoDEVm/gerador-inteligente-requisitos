"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";

export type DeletedSession = {
  id: string;
  projectId: string;
  deletedRequirementIds: string[];
  deletedUserStoryIds: string[];
};

type SessionToDelete = { id: string; sequence: number; title: string | null };

export function SessionDeletionDialog({
  open,
  session,
  onClose,
  onDeleted,
}: {
  open: boolean;
  session: SessionToDelete | null;
  onClose: () => void;
  onDeleted: (result: DeletedSession) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteSession() {
    if (!session || deleting) return;

    setDeleting(true);
    setError(null);
    try {
      const result = await apiFetch<DeletedSession>(`/api/sessions/${session.id}`, { method: "DELETE" });
      onDeleted(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível excluir a sessão.");
      setDeleting(false);
    }
  }

  const label = session ? `Sessão ${session.sequence}${session.title ? ` — ${session.title}` : ""}` : "esta sessão";
  return (
    <Dialog open={open} onClose={deleting ? () => undefined : onClose} title="Excluir sessão permanentemente">
      <p className="text-sm leading-6 text-slate-700">
        {label} e as informações exclusivas geradas nela serão excluídas. Artefatos sem vínculo com esta sessão, ou compartilhados com outra sessão, serão preservados.
      </p>
      <p className="mt-3 text-sm font-semibold text-red-700">Esta ação não pode ser desfeita.</p>
      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={deleting}>Cancelar</Button>
        <Button variant="danger" onClick={deleteSession} disabled={deleting}>
          {deleting ? "Excluindo…" : "Excluir sessão"}
        </Button>
      </div>
    </Dialog>
  );
}
