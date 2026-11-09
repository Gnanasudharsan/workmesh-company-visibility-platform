"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ email: string }>();
  const submit = handleSubmit(async (v) => {
    const r = await api.post<{ message: string }>("/auth/password/forgot", v).catch((e: Error) => ({ message: e.message }));
    setSent(r.message);
  });
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Reset your password</h1>
      <p className="mt-1 text-[13.5px] text-muted">We&apos;ll email a single-use link that expires in one hour.</p>
      {sent ? (
        <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-[13.5px]">
          <p>{sent}</p>
          <p className="mt-2 text-[12.5px] text-muted">Running locally? Messages land in the <Link className="font-medium text-brand" href="/dev/mailbox">developer mailbox</Link>.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Work email" htmlFor="f-email"><Input id="f-email" type="email" required {...register("email")} /></Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="mt-4 inline-block text-[13px] text-muted hover:text-ink">← Back to sign in</Link>
    </>
  );
}
