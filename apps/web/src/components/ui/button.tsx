import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background,box-shadow,color,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white shadow-[0_1px_2px_rgba(37,99,235,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-brand-deep",
        secondary: "bg-surface text-ink border border-line shadow-card hover:border-line-strong hover:bg-subtle/60",
        ghost: "text-muted hover:text-ink hover:bg-subtle",
        danger: "bg-danger text-white hover:bg-red-700",
        soft: "bg-brand-soft text-brand-deep hover:bg-blue-100",
        link: "text-brand hover:text-brand-deep underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-2.5 text-[13px]",
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
