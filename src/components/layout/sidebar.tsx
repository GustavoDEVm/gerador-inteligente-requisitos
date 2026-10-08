"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  icon: IconName;
  label: string;
}

const navigationItems: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/projetos", label: "Projetos", icon: "folder" },
  { href: "/elicitacao", label: "Elicitação", icon: "message-square" },
  { href: "/requisitos", label: "Requisitos", icon: "file-text" },
  { href: "/user-stories", label: "User Stories", icon: "book" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
];

interface SidebarProps {
  mobileOpen: boolean;
  onNavigate: () => void;
}

export function Sidebar({ mobileOpen, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={onNavigate} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-70 -translate-x-full flex-col border-r border-slate-200 bg-white px-3 py-5 transition-transform lg:translate-x-0", mobileOpen && "translate-x-0")}>
        <Link href="/" className="flex items-center gap-3 px-3 py-2" onClick={onNavigate}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-blue-700 text-white"><Icon name="clipboard" className="size-5" /></span>
          <span className="text-sm font-bold leading-4 text-slate-950">Gerador de<br />Requisitos</span>
        </Link>
        <nav className="mt-8 space-y-1" aria-label="Navegação principal">
          {navigationItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
                <Icon name={item.icon} className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          <strong className="block text-slate-700">Fluxo do TCC</strong>
          Projetos → Elicitação → Análise futura → Requisitos
        </div>
      </aside>
    </>
  );
}
