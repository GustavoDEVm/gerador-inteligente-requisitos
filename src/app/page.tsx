import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/layout/page-header";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Visão geral" description="Acompanhe projetos, sessões de elicitação e a evolução dos requisitos do seu TCC." actions={<><Button href="/projetos/novo"><Icon name="plus" className="size-4" />Novo projeto</Button><Button href="/elicitacao" variant="secondary"><Icon name="message-square" className="size-4" />Iniciar elicitação</Button></>} />
      <DashboardContent />
      <Card className="border-blue-100 bg-blue-50 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700"><Icon name="sparkles" className="size-5" /></span><div><h2 className="font-bold text-blue-950">Próxima etapa: iniciar uma sessão de elicitação</h2><p className="mt-1 text-sm leading-6 text-blue-800">Registre o contexto do sistema e avance com análises por IA, requisitos e refinamentos da sessão.</p></div></div><Button href="/elicitacao">Abrir sessão <Icon name="arrow-right" className="size-4" /></Button></div></Card>
    </div>
  );
}
