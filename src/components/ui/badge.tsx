import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "blue" | "green" | "amber" | "red" | "slate" | "violet";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ children, tone = "slate" }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tones[tone])}>
      {children}
    </span>
  );
}
