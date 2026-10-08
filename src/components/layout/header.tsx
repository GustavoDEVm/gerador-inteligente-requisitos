"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api-client";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/projetos": "Projetos",
  "/elicitacao": "Elicitação",
  "/requisitos": "Requisitos",
  "/user-stories": "User Stories",
  "/configuracoes": "Configurações",
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pathname.startsWith("/projetos/") ? "Projetos" : titles[pathname] ?? "Gerador de Requisitos";
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ name: string; email: string } | null>("/api/auth/session").then((currentUser) => { if (active) setUser(currentUser); }).catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenuClick} aria-label="Abrir menu">
          <Icon name="menu" className="size-5" />
        </button>
        <div>
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="hidden text-xs text-slate-500 sm:block">Elicitação e organização de requisitos</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notificações">
          <Icon name="bell" className="size-5" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-600" />
        </button>
        <div className="hidden text-right sm:block"><p className="text-sm font-semibold text-slate-800">{user?.name ?? "Carregando…"}</p><p className="text-xs text-slate-500">{user?.email ?? ""}</p></div>
        <Avatar name={user?.name ?? "Usuário"} />
        <button className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50" onClick={logout} disabled={loggingOut}>{loggingOut ? "Saindo…" : "Sair"}</button>
      </div>
    </header>
  );
}
