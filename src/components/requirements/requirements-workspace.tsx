"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api-client";
import { presentPriority, presentRequirementType, presentReviewStatus } from "@/lib/presentation";
import type { ApiPriority, ApiRequirementType, ApiReviewStatus, ProjectListItem } from "@/types/api";

type RequirementItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  type: ApiRequirementType;
  priority: ApiPriority;
  status: ApiReviewStatus;
  answerSources: { answer: { question: { session: { sequence: number; title: string | null } } } }[];
  userStoryLinks: { userStory: { id: string; code: string; title: string } }[];
  project: { id: string; name: string };
};

function priorityTone(priority: ApiPriority) { return priority === "HIGH" ? "red" : priority === "MEDIUM" ? "amber" : "slate" as const; }
function origin(requirement: RequirementItem) {
  const source = requirement.answerSources[0]?.answer.question.session;
  return source ? `Sessão #${source.sequence}${source.title ? ` · ${source.title}` : ""}` : "Registro manual";
}

export function RequirementsWorkspace() {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [type, setType] = useState("Todos");
  const [priority, setPriority] = useState("Todas");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const projects = await apiFetch<ProjectListItem[]>("/api/projects");
        const nested = await Promise.all(projects.map(async (project) => {
          const items = await apiFetch<Omit<RequirementItem, "project">[]>(`/api/projects/${project.id}/requirements`);
          return items.map((item) => ({ ...item, project: { id: project.id, name: project.name } }));
        }));
        if (active) {
          const items = nested.flat();
          setProjects(projects);
          setRequirements(items);
          setSelectedId(items[0]?.id ?? null);
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os requisitos.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => requirements.filter((requirement) => {
    const matches = `${requirement.code} ${requirement.title} ${requirement.description}`.toLowerCase().includes(query.toLowerCase());
    return matches
      && (projectId === "all" || requirement.project.id === projectId)
      && (type === "Todos" || presentRequirementType(requirement.type) === type)
      && (priority === "Todas" || presentPriority(requirement.priority) === priority);
  }), [priority, projectId, query, requirements, type]);
  const selected = filtered.find((requirement) => requirement.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)_10rem_10rem]"><div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" /><Input aria-label="Buscar requisitos" className="pl-10" placeholder="Buscar por identificação ou descrição" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select aria-label="Filtrar requisitos por projeto" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">Todos os projetos</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Select aria-label="Filtrar requisitos por tipo" value={type} onChange={(event) => setType(event.target.value)}><option>Todos</option><option>Funcional</option><option>Não funcional</option></Select><Select aria-label="Filtrar requisitos por prioridade" value={priority} onChange={(event) => setPriority(event.target.value)}><option>Todas</option><option>Alta</option><option>Média</option><option>Baixa</option></Select></div>
      {loading ? <Card className="p-5 text-sm text-slate-500">Carregando requisitos…</Card> : error ? <EmptyState icon="file-text" title="Não foi possível carregar os requisitos" description={error} /> : <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>{filtered.length === 0 ? <EmptyState icon="file-text" title="Nenhum requisito encontrado" description="Ajuste os filtros ou registre requisitos no projeto." /> : <DataTable headers={["Requisito", "Tipo", "Prioridade", "Revisão", "Origem", ""]}>{filtered.map((requirement) => <tr key={requirement.id} className="cursor-pointer text-slate-700 hover:bg-slate-50" onClick={() => setSelectedId(requirement.id)}><td className="px-5 py-4"><p className="font-bold text-slate-900">{requirement.code}</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{requirement.title}</p>{projectId === "all" && <p className="mt-1 text-xs font-medium text-slate-600">Projeto: {requirement.project.name}</p>}</td><td className="px-5 py-4"><Badge tone={requirement.type === "FUNCTIONAL" ? "blue" : "violet"}>{presentRequirementType(requirement.type)}</Badge></td><td className="px-5 py-4"><Badge tone={priorityTone(requirement.priority)}>{presentPriority(requirement.priority)}</Badge></td><td className="px-5 py-4"><StatusBadge status={presentReviewStatus(requirement.status)} /></td><td className="px-5 py-4 text-xs text-slate-500">{origin(requirement)}</td><td className="px-5 py-4"><Icon name="chevron-right" className="size-4 text-slate-400" /></td></tr>)}</DataTable>}</div>
        <Card className="h-fit p-5">{selected ? <><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Detalhes do requisito</p><div className="mt-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{selected.code}</h2><StatusBadge status={presentReviewStatus(selected.status)} /></div><h3 className="mt-4 font-semibold text-slate-800">{selected.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{selected.description}</p><dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm"><div><dt className="text-slate-500">Projeto</dt><dd className="mt-1 font-medium text-slate-700">{selected.project.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Tipo</dt><dd className="font-medium">{presentRequirementType(selected.type)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Prioridade</dt><dd className="font-medium">{presentPriority(selected.priority)}</dd></div><div><dt className="text-slate-500">Origem</dt><dd className="mt-1 font-medium text-slate-700">{origin(selected)}</dd></div></dl>{selected.userStoryLinks[0] && <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">User Story relacionada</p><p className="mt-2 text-sm font-semibold text-blue-950">{selected.userStoryLinks[0].userStory.code} · {selected.userStoryLinks[0].userStory.title}</p></div>}</> : <p className="text-sm text-slate-500">Selecione um requisito para visualizar seus detalhes.</p>}</Card>
      </div>}
    </div>
  );
}
