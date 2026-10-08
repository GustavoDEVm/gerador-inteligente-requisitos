import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export default function SettingsPage() {
  return (
    <div className="space-y-6"><PageHeader eyebrow="Ambiente do projeto" title="Configurações" description="Informações sobre os recursos disponíveis e a configuração segura do ambiente." /><div className="grid max-w-3xl gap-4"><Card className="p-5"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon name="settings" className="size-5" /></span><div><h2 className="font-bold text-slate-900">Persistência de dados</h2><p className="mt-1 text-sm leading-6 text-slate-600">Projetos, sessões, respostas, análises e artefatos de requisitos são persistidos no banco de dados. Preferências visuais individuais ainda não são configuráveis nesta tela.</p><Badge tone="green">Disponível</Badge></div></div></Card><Card className="border-violet-100 bg-violet-50 p-5"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700"><Icon name="sparkles" className="size-5" /></span><div><h2 className="font-bold text-violet-950">Integração com IA</h2><p className="mt-1 text-sm leading-6 text-violet-800">A aplicação possui uma camada de IA no servidor, com provedores, prompts versionados e respostas estruturadas validadas. As configurações sensíveis permanecem somente em variáveis de ambiente do servidor.</p><Badge tone="violet">Disponível</Badge></div></div></Card></div></div>
  );
}
