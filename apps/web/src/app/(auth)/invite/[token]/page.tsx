"use client";

import { label } from "@workmesh/core";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { useApi, useInvalidate } from "@/lib/hooks";

interface Lookup {
  organizationName: string;
  email: string;
  role: string;
  title: string | null;
  inviterName: string | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  existingAccount: boolean;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const invalidate = useInvalidate();
  const { data, error, isLoading } = useApi<Lookup>(`/invitations/lookup/${token}`, { retry: false });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ name: string; password: string }>();

  const accept = handleSubmit(async (v) => {
    setSubmitError(null);
    try {
      await api.post("/invitations/accept", { token, name: data?.existingAccount ? undefined : v.name, password: v.password });
      await invalidate();
      router.replace("/onboarding");
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Couldn't accept the invitation");
    }
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data)
    return (
      <div>
        <h1 className="text-[22px] font-semibold">Invitation not found</h1>
        <p className="mt-2 text-[13.5px] text-muted">This link is invalid. Ask your administrator to send a new invitation.</p>
        <Link href="/login" className="mt-4 inline-block text-[13px] font-medium text-brand">Go to sign in</Link>
      </div>
    );
  if (data.status !== "PENDING")
    return (
      <div>
        <h1 className="text-[22px] font-semibold">This invitation is {data.status.toLowerCase()}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{data.status === "ACCEPTED" ? "It has already been used. Sign in instead." : "Ask an administrator at " + data.organizationName + " to resend it."}</p>
        <Link href="/login" className="mt-4 inline-block text-[13px] font-medium text-brand">Go to sign in</Link>
      </div>
    );

  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><MailCheck className="h-5 w-5" aria-hidden /></span>
      <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">Join {data.organizationName}</h1>
      <p className="mt-1 text-[13.5px] text-muted">
        {data.inviterName ?? "A colleague"} invited <strong className="text-ink">{data.email}</strong>
        {data.title ? ` as ${data.title}` : ""} ({label(data.role)}).
      </p>
      <form onSubmit={accept} className="mt-6 space-y-4">
        {!data.existingAccount && (
          <Field label="Your full name" htmlFor="i-name" error={formState.errors.name && "Required"}><Input id="i-name" autoComplete="name" {...register("name", { required: true, minLength: 2 })} /></Field>
        )}
        <Field label={data.existingAccount ? "Your WorkMesh password" : "Choose a password"} htmlFor="i-pass" hint={data.existingAccount ? "You already have an account with this email." : "At least 10 characters."} error={formState.errors.password && "At least 10 characters"}>
          <Input id="i-pass" type="password" autoComplete={data.existingAccount ? "current-password" : "new-password"} {...register("password", { required: true, minLength: data.existingAccount ? 1 : 10 })} />
        </Field>
        {submitError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-red-800">{submitError}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>Accept invitation</Button>
      </form>
    </>
  );
}
