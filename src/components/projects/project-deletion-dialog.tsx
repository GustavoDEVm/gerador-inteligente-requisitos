"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";

type ProjectToDelete = { id: string; name: string };

export function ProjectDeletionDialog({
  open,
  project,
  onClose,
  onDeleted,
}: {
  open: boolean;
  project: ProjectToDelete | null;
  onClose: () => void;
  onDeleted: (project: ProjectToDelete) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteProject() {
    if (!project || confirmation !== project.name || deleting) return;

    setDeleting(true);
    setError(null);
    try {
      await apiFetch<ProjectToDelete>(`/api/projects/${project.id}`, { method: "DELETE" });
      onDeleted(project);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível excluir o projeto.");
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onClose={deleting ? () => undefined : onClose} title="Excluir projeto permanentemente">
      <p className="text-sm leading-6 text-slate-700">
        Esta ação exclui permanentemente o projeto, suas sessões, respostas, análises, requisitos, User Stories e demais dados vinculados. Ela não pode ser desfeita.
      </p>
      <p className="mt-3 text-sm font-semibold text-slate-900">
        Para confirmar, digite exatamente: <span className="font-bold">{project?.name}</span>
      </p>
      <Input
        className="mt-4"
        aria-label="Nome do projeto para confirmar exclusão"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={deleting}
      />
      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={deleting}>Cancelar</Button>
        <Button variant="danger" onClick={deleteProject} disabled={confirmation !== project?.name || deleting}>
          {deleting ? "Excluindo…" : "Excluir permanentemente"}
        </Button>
      </div>
    </Dialog>
  );
}
