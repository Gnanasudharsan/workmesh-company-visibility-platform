"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/members", label: "Members & roles" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/structure", label: "Teams & departments" },
  { href: "/admin/reporting", label: "Reporting lines" },
  { href: "/admin/permissions", label: "Permission inspector" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Organization" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  if (me && !me.active?.workspaces.includes("admin")) return <EmptyState title="Administrators only" description="Your role doesn't include organization administration." />;
  return (
    <>
      <PageHeader title="Administration" description="Configure the organization. Administrative rights do not grant access to confidential project content." />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Administration">
        {NAV.map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-medium", active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
