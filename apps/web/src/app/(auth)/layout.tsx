import { GitBranch, Lock, Network, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-[12px] text-faint">Visibility without surveillance. WorkMesh never tracks activity, keystrokes or screens.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-gradient-to-br from-[#eef4ff] via-[#f5f8ff] to-[#eefbff] lg:block">
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#c7d6f2_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Company visibility platform</p>
          <h2 className="mt-3 max-w-md text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">Know who&apos;s building what. Understand how it all connects.</h2>
          <ul className="mt-8 space-y-4 text-[14px] text-slate-600">
            {[
              { icon: Network, t: "A living map of people, teams, goals and projects" },
              { icon: Users, t: "Progress updates that take a minute, not a meeting" },
              { icon: GitBranch, t: "See how a blocked dependency ripples downstream" },
              { icon: Lock, t: "Permission-aware by design — confidential stays confidential" },
            ].map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-card ring-1 ring-line"><Icon className="h-4 w-4 text-brand" aria-hidden /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
