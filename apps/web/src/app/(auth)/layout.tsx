import { GitBranch, Lock, Network, Users } from "lucide-react";
import type { ReactNode } from "react";
import { LivingMesh } from "@/components/midnight/living-mesh";
import { Logo } from "@/components/shell/logo";

const POINTS = [
  { icon: Network, t: "A living map of people, teams, goals and projects" },
  { icon: Users, t: "Progress updates that take a minute, not a meeting" },
  { icon: GitBranch, t: "See how a blocked dependency ripples downstream" },
  { icon: Lock, t: "Permission-aware by design — confidential stays confidential" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-7 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] animate-rise">{children}</div>
        </div>
        <p className="text-[12px] text-faint">Visibility without surveillance. WorkMesh never tracks activity, keystrokes or screens.</p>
      </div>
      <aside className="surface-midnight on-navy relative isolate hidden overflow-hidden text-navy-text lg:block">
        <LivingMesh className="absolute inset-0 -z-10 h-full w-full" density={30} seed={3} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" aria-hidden />
        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-teal">Company visibility platform</p>
          <h2 className="mt-3 max-w-lg text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-white xl:text-[46px]">See how your company connects.</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-navy-muted">People, projects, priorities and progress — all in one clear view.</p>
          <ul className="mt-9 grid max-w-xl grid-cols-2 gap-3 text-[13px]">
            {POINTS.map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-start gap-3 rounded-[14px] border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-teal/15 text-teal"><Icon className="h-4 w-4" aria-hidden /></span>
                <span className="text-navy-text/90">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
