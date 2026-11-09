import Link from "next/link";
import { cn, initials } from "@/lib/utils";
import type { PersonLite } from "@/lib/types";

const SIZES = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-[13px]", lg: "h-12 w-12 text-[16px]", xl: "h-16 w-16 text-[20px]" };

export function Avatar({ name, hue = 210, size = "sm", className }: { name?: string | null; hue?: number; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-white", SIZES[size], className)}
      style={{ background: `hsl(${hue} 70% 94%)`, color: `hsl(${hue} 55% 32%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function PersonChip({ person, sub, link = true, size = "sm" }: { person?: PersonLite | null; sub?: string | null; link?: boolean; size?: "xs" | "sm" | "md" }) {
  if (!person) return <span className="text-muted">—</span>;
  const content = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={person.name} hue={person.avatarHue} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{person.name}</span>
        {sub !== null && (sub ?? person.title) && <span className="block truncate text-[12px] text-muted">{sub ?? person.title}</span>}
      </span>
    </span>
  );
  return link ? (
    <Link href={`/people/${person.id}`} className="inline-flex min-w-0 rounded-md hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}

export function AvatarStack({ people, max = 4 }: { people: Array<PersonLite | null | undefined>; max?: number }) {
  const list = people.filter(Boolean) as PersonLite[];
  return (
    <span className="flex -space-x-1.5" aria-label={list.map((p) => p.name).join(", ")}>
      {list.slice(0, max).map((p) => (
        <Avatar key={p.id} name={p.name} hue={p.avatarHue} size="sm" />
      ))}
      {list.length > max && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-[11px] font-medium text-muted ring-2 ring-white">+{list.length - max}</span>}
    </span>
  );
}
