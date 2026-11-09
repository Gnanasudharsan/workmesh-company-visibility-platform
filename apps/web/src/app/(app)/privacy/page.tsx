import { Ban, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, PageHeader } from "@/components/ui/card";

export const metadata = { title: "Privacy & trust" };

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">{icon}</span>
      <div><p className="text-[14px] font-semibold">{title}</p><div className="mt-0.5 text-[13.5px] text-ink-soft">{children}</div></div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Our commitment" title="Visibility without surveillance" description="WorkMesh exists to replace status meetings and guesswork — not to watch people." />
      <Card className="mb-5">
        <CardBody className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
          <Item icon={<Ban className="h-4 w-4" aria-hidden />} title="What we never do">No keystroke, mouse, screen, webcam or browser monitoring. No online-time tracking. No productivity scores, rankings or behavioral profiles.</Item>
          <Item icon={<Eye className="h-4 w-4" aria-hidden />} title="What we show">What people choose to share: progress updates, blockers, help requests and project records. Freshness labels describe information, never people.</Item>
          <Item icon={<EyeOff className="h-4 w-4" aria-hidden />} title="Drafts stay yours">Drafts and private updates are visible only to their author — not to managers, executives or administrators.</Item>
          <Item icon={<Users className="h-4 w-4" aria-hidden />} title="Relationships, not rank">Managers see what is shared with their reporting line; project leads see their project. Seniority alone grants summaries, never details.</Item>
          <Item icon={<Lock className="h-4 w-4" aria-hidden />} title="Confidential stays confidential">Restricted projects are invisible without a relationship or explicit grant — no names, counts, graph edges, search results or notifications.</Item>
          <Item icon={<ShieldCheck className="h-4 w-4" aria-hidden />} title="Admins configure, they don&apos;t snoop">Administration rights manage members and structure. They don&apos;t unlock project content.</Item>
          <Item icon={<KeyRound className="h-4 w-4" aria-hidden />} title="Enforced on the server">Every request is authorized by a central policy engine and the database&apos;s row-level security. Nothing is hidden with CSS.</Item>
        </CardBody>
      </Card>
      <p className="text-[12.5px] text-muted">Audit records capture who changed structure, access and status — not the text of your updates.</p>
    </div>
  );
}
