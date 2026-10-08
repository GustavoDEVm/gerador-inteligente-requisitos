import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gerador Inteligente de Requisitos",
  description:
    "Aplicação para apoiar a elicitação e o refinamento de requisitos de software.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
