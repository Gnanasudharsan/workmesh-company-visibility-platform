"use client";

import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useApi, useInvalidate } from "@/lib/hooks";

interface Persona {
  key: string;
  email: string;
  name: string;
  label: string;
  description: string;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(params.get("reason") === "no-org" ? "Your account isn't an active member of any organization." : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit } = useForm<{ email: string; password: string }>();
  // Only available when the API runs with DEMO_MODE=true (never in production).
  const { data: personas } = useApi<Persona[]>("/dev/personas", { retry: false, staleTime: Infinity });

  const after = async () => {
    await invalidate();
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
  };

  const submit = handleSubmit(async (v) => {
    setBusy("form");
    setError(null);
    try {
      await api.post("/auth/login", v);
      await after();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed");
      setBusy(null);
    }
  });

  const demo = async (p: Persona) => {
    setBusy(p.key);
    setError(null);
    try {
      await api.post("/auth/demo-login", { email: p.email });
      await after();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <>
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">Welcome back</h1>
      <p className="mt-1.5 text-[14px] text-muted">Sign in to WorkMesh. Everyone uses the same sign-in — your access comes from your real role and relationships.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="pr-10" {...register("password")} />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-subtle hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "form"}>
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="flex justify-between text-[13px]">
          <Link href="/forgot-password" className="text-muted hover:text-ink">Forgot password?</Link>
          <Link href="/register" className="font-medium text-teal-ink hover:underline">Create a company</Link>
        </div>
      </form>

      {personas && personas.length > 0 && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-violet" aria-hidden /> Demo personas · Northstar Labs</p>
          <p className="mt-0.5 text-[12px] text-muted">Local development only. A fictional company with synthetic data — each persona exercises real permission rules.</p>
          <div className="mt-3 grid min-w-0 gap-1.5">
            {personas.map((p) => (
              <button key={p.key} onClick={() => demo(p)} disabled={!!busy} className="group flex w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-left transition-colors hover:border-teal/50 hover:bg-teal-soft/50 disabled:opacity-60" data-testid={`persona-${p.key}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{p.label} <span className="font-normal text-muted">· {p.name}</span></span>
                  <span className="block truncate text-[12px] text-muted">{p.description}</span>
                </span>
                {busy === p.key ? <span className="text-[12px] text-muted">Signing in…</span> : <ArrowRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-teal-ink" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
