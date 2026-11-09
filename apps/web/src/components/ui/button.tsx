import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Buttons. `primary` is midnight navy on light surfaces; `accent` is electric teal with navy
 * text (10:1 contrast) for the single most important action in a view and on navy surfaces.
 * Interaction feedback is transform/opacity only.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[background,box-shadow,color,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-navy-950 text-white shadow-[0_1px_2px_rgba(9,27,45,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-navy-900",
        accent: "bg-teal text-navy-950 shadow-[0_1px_2px_rgba(9,27,45,0.2),inset_0_1px_0_rgba(255,255,255,0.35)] hover:bg-teal-bright",
        secondary: "bg-surface text-ink border border-line shadow-card hover:border-line-strong hover:bg-subtle/60",
        ghost: "text-muted hover:text-ink hover:bg-subtle",
        danger: "bg-danger text-white hover:bg-danger-ink",
        soft: "bg-teal-soft text-teal-ink hover:bg-[#d2f2ec]",
        link: "text-teal-ink hover:text-brand-deep underline-offset-4 hover:underline px-0 h-auto",
        "on-navy": "bg-white/8 text-navy-text ring-1 ring-inset ring-navy-line hover:bg-white/12",
        "ghost-navy": "text-navy-muted hover:text-white hover:bg-white/8",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-[13.5px]",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

export function ButtonLink({ href, className, variant, size, children }: { href: string; className?: string; children: React.ReactNode } & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}
