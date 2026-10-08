import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/layout/page-header";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { activities, projects, requirements } from "@/lib/mock-data";

const stats = [
  { label: "Projetos", value: projects.length, description: "em acompanhamento", icon: "folder" as const, tone: "bg-blue-50 text-blue-700" },
  { label: "Requisitos", value: 75, description: "identificados até agora", icon: "file-text" as const, tone: "bg-violet-50 text-violet-700" },
  { label: "Sessões", value: 14, description: "de elicitação realizadas", icon: "message-square" as const, tone: "bg-emerald-50 text-emerald-700" },
  { label: "Em revisão", value: requirements.filter((item) => item.status !== "Revisado").length, description: "requisitos pendentes", icon: "clipboard" as const, tone: "bg-amber-50 text-amber-700" },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Visão geral" description="Acompanhe projetos, sessões de elicitação e a evolução dos requisitos do seu TCC." actions={<><Button href="/projetos/novo"><Icon name="plus" className="size-4" />Novo projeto</Button><Button href="/elicitacao" variant="secondary"><Icon name="message-square" className="size-4" />Iniciar elicitação</Button></>} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores gerais">{stats.map((stat) => <Card key={stat.label} className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{stat.value}</p></div><span className={`flex size-10 items-center justify-center rounded-lg ${stat.tone}`}><Icon name={stat.icon} className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{stat.description}</p></Card>)}</section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">Projetos recentes</h2><p className="mt-1 text-sm text-slate-500">Continue de onde parou.</p></div><Button href="/projetos" variant="ghost">Ver todos <Icon name="arrow-right" className="size-4" /></Button></div><div className="mt-5 divide-y divide-slate-100">{projects.slice(0, 3).map((project) => <div key={project.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-semibold text-slate-900">{project.name}</h3><p className="mt-1 text-sm text-slate-500">{project.description}</p></div><StatusBadge status={project.status} /></div><div className="mt-3 max-w-md"><Progress label="Progresso" value={project.progress} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{project.requirementsCount} requisitos · {project.elicitationSessions} sessões</span><span>{project.updatedAt}</span></div></div>)}</div></Card>
        <Card className="p-5 sm:p-6"><h2 className="text-lg font-bold text-slate-950">Atividade recente</h2><div className="mt-5 space-y-5">{activities.map((activity) => <div key={activity.id} className="flex gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon name={activity.type === "project" ? "folder" : activity.type === "session" ? "message-square" : "file-text"} className="size-4" /></span><div><p className="text-sm font-semibold text-slate-800">{activity.title}</p><p className="mt-0.5 text-xs text-slate-500">{activity.description}</p><p className="mt-1 text-xs text-slate-400">{activity.timestamp}</p></div></div>)}</div></Card>
      </section>
      <Card className="border-blue-100 bg-blue-50 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700"><Icon name="sparkles" className="size-5" /></span><div><h2 className="font-bold text-blue-950">Próxima etapa: iniciar uma sessão de elicitação</h2><p className="mt-1 text-sm leading-6 text-blue-800">Registre o contexto e as respostas que futuramente serão analisadas pela camada de IA.</p></div></div><Button href="/elicitacao">Abrir sessão <Icon name="arrow-right" className="size-4" /></Button></div></Card>
    </div>
  );
}
