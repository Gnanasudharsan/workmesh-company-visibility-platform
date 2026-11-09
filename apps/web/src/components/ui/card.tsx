import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action, icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function Stat({ label, value, hint, tone = "default", href, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warning" | "danger" | "success" | "info"; href?: string; icon?: ReactNode }) {
  const toneClass = { default: "text-ink", warning: "text-warning", danger: "text-danger", success: "text-success", info: "text-info" }[tone];
  const inner = (
    <Card className={cn("p-4 transition-shadow", href && "hover:shadow-raised")}>
      <div className="flex items-center justify-between text-[12px] font-medium text-muted">
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="mt-1.5 text-[12px] text-muted">{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-[var(--radius-card)]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-medium uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight sm:text-[24px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">{children}</h3>
      {action}
    </div>
  );
}
