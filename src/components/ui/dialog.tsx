"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface DialogProps {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function Dialog({ children, onClose, open, title }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-bold text-slate-900">{title}</h2>
          <Button variant="ghost" className="size-9 min-h-0 p-0" onClick={onClose} aria-label="Fechar diálogo">
            <Icon name="close" className="size-5" />
          </Button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}
