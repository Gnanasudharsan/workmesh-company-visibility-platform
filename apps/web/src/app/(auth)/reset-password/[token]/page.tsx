"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ password: string }>();
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/auth/password/reset", { token, password: v.password });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Reset failed");
    }
  });
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Choose a new password</h1>
      {done ? (
        <p className="mt-4 text-[13.5px]">Your password was changed and other sessions were signed out. <Link href="/login" className="font-medium text-brand">Sign in</Link></p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="New password" htmlFor="np" hint="At least 10 characters." error={formState.errors.password && "At least 10 characters"}><Input id="np" type="password" autoComplete="new-password" {...register("password", { required: true, minLength: 10 })} /></Field>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-red-800">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>Update password</Button>
        </form>
      )}
    </>
  );
}
