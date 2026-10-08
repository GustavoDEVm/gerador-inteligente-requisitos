"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível concluir a autenticação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <div className="mb-7"><p className="text-sm font-semibold text-blue-700">Gerador Inteligente de Requisitos</p><h1 className="mt-2 text-2xl font-bold text-slate-950">{isRegister ? "Criar conta" : "Entrar"}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{isRegister ? "Crie sua conta para registrar e organizar seus projetos." : "Acesse seus projetos e continue a elicitação de requisitos."}</p></div>
      <form className="space-y-5" noValidate onSubmit={submit}>
        {isRegister && <Input label="Nome" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />}
        <Input label="E-mail" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Input label="Senha" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegister ? 12 : undefined} required />
        {isRegister && <p className="-mt-2 text-xs leading-5 text-slate-500">Use pelo menos 12 caracteres, incluindo uma letra e um número.</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">{isRegister ? "Já possui uma conta?" : "Ainda não possui uma conta?"} <Link className="font-semibold text-blue-700 hover:text-blue-800" href={isRegister ? "/login" : "/cadastro"}>{isRegister ? "Entrar" : "Criar conta"}</Link></p>
    </Card>
  );
}
