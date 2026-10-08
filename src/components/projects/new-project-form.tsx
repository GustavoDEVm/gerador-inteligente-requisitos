"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";

type FormData = {
  context: string;
  description: string;
  name: string;
  objective: string;
  stakeholders: string;
};

const initialForm: FormData = { name: "", description: "", objective: "", context: "", stakeholders: "" };

export function NewProjectForm() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [created, setCreated] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: keyof FormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) nextErrors.name = "Informe um nome para o projeto.";
    if (!form.description.trim()) nextErrors.description = "Descreva brevemente o projeto.";
    if (!form.objective.trim()) nextErrors.objective = "Informe o objetivo principal.";
    if (!form.context.trim()) nextErrors.context = "Adicione o contexto inicial.";
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const project = await apiFetch<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify({ name: form.name, description: form.description, objective: form.objective, context: form.context }) });
      const stakeholders = form.stakeholders.split(",").map((item) => item.trim()).filter(Boolean);
      await Promise.all(stakeholders.map((name) => apiFetch(`/api/projects/${project.id}/stakeholders`, { method: "POST", body: JSON.stringify({ name }) })));
      setCreatedProjectId(project.id);
      setCreated(true);
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "Não foi possível criar o projeto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card className="max-w-3xl p-5 sm:p-7">
        <form className="space-y-5" noValidate onSubmit={submit}>
          <Input label="Nome do projeto" name="name" placeholder="Ex.: Plataforma de delivery local" value={form.name} error={errors.name} onChange={(event) => updateField("name", event.target.value)} />
          <Textarea label="Descrição" name="description" placeholder="Explique de forma resumida o sistema que será desenvolvido." value={form.description} error={errors.description} onChange={(event) => updateField("description", event.target.value)} />
          <Textarea label="Objetivo" name="objective" placeholder="Qual problema o projeto busca resolver?" value={form.objective} error={errors.objective} onChange={(event) => updateField("objective", event.target.value)} />
          <Textarea label="Contexto" name="context" placeholder="Descreva o cenário, necessidades atuais e restrições conhecidas." value={form.context} error={errors.context} onChange={(event) => updateField("context", event.target.value)} />
          <Input label="Stakeholders" name="stakeholders" placeholder="Ex.: clientes, atendentes, administradores" value={form.stakeholders} onChange={(event) => updateField("stakeholders", event.target.value)} />
          <p className="text-xs leading-5 text-slate-500">O projeto será associado automaticamente à sua conta autenticada.</p>
          {submitError && <p className="text-sm text-red-600" role="alert">{submitError}</p>}
          <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row"><Button href="/projetos" variant="ghost">Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Criando…" : "Criar projeto"}</Button></div>
        </form>
      </Card>
      <Dialog open={created} onClose={() => setCreated(false)} title="Projeto criado">
        <p className="text-sm leading-6 text-slate-600">O projeto e seus stakeholders foram registrados na camada de persistência de desenvolvimento.</p>
        <div className="mt-5 flex justify-end">{createdProjectId && <Button href={`/projetos/${createdProjectId}`} onClick={() => setCreated(false)}>Ver projeto</Button>}</div>
      </Dialog>
    </>
  );
}
