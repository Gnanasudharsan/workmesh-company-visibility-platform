"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { LogoMark } from "@/components/shell/logo";
import { UpdateComposer } from "@/components/work/update-composer";
import { useMe } from "@/lib/hooks";
import { useRealtime } from "@/lib/realtime";

/**
 * Authenticated shell. The session is validated by the API on every request; this layout only
 * decides what to render while that answer is loading, and redirects to sign-in on 401.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: me, error, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  useRealtime(!!me?.active, me?.active?.organization.id);

  useEffect(() => {
    if (error?.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me && !me.active) router.replace("/login?reason=no-org");
  }, [error, me, router, pathname]);

  if (isLoading || !me?.active) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading WorkMesh">
        {error && error.status !== 401 ? (
          <div className="max-w-sm text-center">
            <p className="font-medium">We couldn&apos;t reach WorkMesh</p>
            <p className="mt-1 text-[13px] text-muted">{error.message}</p>
            <button className="mt-4 text-[13px] font-medium text-brand" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : (
          <div className="animate-pulse"><LogoMark size={36} /></div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {me.active.organization.isDemo && (
            <p className="mb-4 rounded-lg border border-dashed border-line bg-surface/60 px-3 py-1.5 text-[12px] text-muted">
              You are viewing <strong className="font-medium text-ink">{me.active.organization.name}</strong>, a fictional company with synthetic demo data.
            </p>
          )}
          {children}
        </main>
      </div>
      <CommandPalette />
      <UpdateComposer />
    </div>
  );
}
