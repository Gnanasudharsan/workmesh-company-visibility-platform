"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useInvalidate } from "@/lib/hooks";

interface Values {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  slug: string;
  title: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export default function RegisterPage() {
  const router = useRouter();
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(null);
  const [touchedSlug, setTouchedSlug] = useState(false);
  const { register, handleSubmit, setValue, formState } = useForm<Values>({ defaultValues: { title: "Founder" } });

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/auth/register", v);
      await invalidate();
      router.replace("/onboarding?setup=1");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Registration failed");
    }
  });

  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Create your company</h1>
      <p className="mt-1 text-[13.5px] text-muted">You&apos;ll be the owner. Next you&apos;ll add departments, teams and invite people.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Your name" htmlFor="r-name" error={formState.errors.name && "Required"}><Input id="r-name" autoComplete="name" {...register("name", { required: true, minLength: 2 })} /></Field>
          <Field label="Your title" htmlFor="r-title"><Input id="r-title" {...register("title")} /></Field>
        </div>
        <Field label="Work email" htmlFor="r-email" error={formState.errors.email && "Required"}><Input id="r-email" type="email" autoComplete="email" {...register("email", { required: true })} /></Field>
        <Field label="Password" htmlFor="r-pass" hint="At least 10 characters." error={formState.errors.password && "Use at least 10 characters"}>
          <Input id="r-pass" type="password" autoComplete="new-password" {...register("password", { required: true, minLength: 10 })} />
        </Field>
        <Field label="Company name" htmlFor="r-org" error={formState.errors.organizationName && "Required"}>
          <Input id="r-org" {...register("organizationName", { required: true, minLength: 2, onChange: (e) => !touchedSlug && setValue("slug", slugify(e.target.value)) })} />
        </Field>
        <Field label="Company URL" htmlFor="r-slug" hint="Lowercase letters, numbers and dashes." error={formState.errors.slug && "3–40 characters: letters, numbers, dashes"}>
          <div className="flex items-center rounded-lg border border-line bg-subtle pl-3 text-[13px] text-muted focus-within:border-brand focus-within:ring-[3px] focus-within:ring-blue-100">
            workmesh.app/
            <input id="r-slug" className="h-9 flex-1 rounded-r-lg bg-surface px-2 text-ink outline-none" {...register("slug", { required: true, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, minLength: 3, maxLength: 40, onChange: () => setTouchedSlug(true) })} />
          </div>
        </Field>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-red-800">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>Create company</Button>
        <p className="text-center text-[13px] text-muted">Already have an account? <Link href="/login" className="font-medium text-brand">Sign in</Link></p>
      </form>
    </>
  );
}
