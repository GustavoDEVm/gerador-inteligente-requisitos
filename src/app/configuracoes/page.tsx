import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export default function SettingsPage() {
  return (
    <div className="space-y-6"><PageHeader eyebrow="Ambiente do projeto" title="Configurações" description="Preferências e integrações serão disponibilizadas de forma incremental nas próximas fases." /><div className="grid max-w-3xl gap-4"><Card className="p-5"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon name="settings" className="size-5" /></span><div><h2 className="font-bold text-slate-900">Preferências da interface</h2><p className="mt-1 text-sm leading-6 text-slate-600">As preferências visuais serão armazenadas quando a persistência do sistema for implementada.</p><Badge tone="slate">Planejado</Badge></div></div></Card><Card className="border-violet-100 bg-violet-50 p-5"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700"><Icon name="sparkles" className="size-5" /></span><div><h2 className="font-bold text-violet-950">Integração com IA</h2><p className="mt-1 text-sm leading-6 text-violet-800">O provedor, as variáveis de ambiente e os prompts serão configurados apenas na fase específica de integração com IA.</p><Badge tone="violet">Não configurada</Badge></div></div></Card></div></div>
  );
}
