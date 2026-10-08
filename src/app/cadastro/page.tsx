import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Suspense fallback={<div className="text-sm text-slate-500">Carregando…</div>}>
        <AuthForm mode="register" />
      </Suspense>
    </main>
  );
}
