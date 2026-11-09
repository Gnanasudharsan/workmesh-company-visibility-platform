"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * "Living WorkMesh" — the decorative signature visual. A deterministic constellation of nodes
 * with slowly drifting positions and pulses travelling along a few edges. It is purely
 * ornamental (aria-hidden) and never pretends to be real activity; data-backed views use
 * <ContributionMap> or the Company Map instead.
 */
export function LivingMesh({ className, density = 22, seed = 7, tone = "navy" }: { className?: string; density?: number; seed?: number; tone?: "navy" | "light" }) {
  const reduce = useReducedMotion();
  const { nodes, edges } = useMemo(() => build(density, seed), [density, seed]);
  const stroke = tone === "navy" ? "rgba(155,178,198,0.22)" : "rgba(11,27,43,0.10)";
  const palette = ["#37D5C3", "#9D87F5", "#F4AD69", "#E8EEF4"];
  return (
    <svg className={cn("pointer-events-none select-none", className)} viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`lm-glow-${seed}`}>
          <stop offset="0%" stopColor="#37D5C3" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#37D5C3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke={stroke} strokeWidth="1">
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />
        ))}
      </g>
      {!reduce && (
        <g fill="none" strokeWidth="1.6" strokeLinecap="round">
          {edges.filter((_, i) => i % 5 === 0).map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke={palette[i % 2]}
              strokeOpacity="0.75"
              strokeDasharray="6 34"
              style={{ animation: `dash ${3.2 + (i % 4) * 0.7}s linear infinite` }}
            />
          ))}
        </g>
      )}
      {nodes.map((n, i) => (
        <g key={i} style={reduce ? undefined : ({ animation: `drift ${9 + (i % 5) * 2}s ease-in-out ${-(i % 7)}s infinite`, "--dx": `${n.dx}px`, "--dy": `${n.dy}px` } as React.CSSProperties)}>
          {n.hub && <circle cx={n.x} cy={n.y} r={n.r * 4.5} fill={`url(#lm-glow-${seed})`} opacity="0.35" />}
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.hub ? palette[0] : palette[(i % 3) + 1]} fillOpacity={n.hub ? 0.95 : tone === "navy" ? 0.55 : 0.4} />
        </g>
      ))}
    </svg>
  );
}

function build(count: number, seed: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const nodes = Array.from({ length: count }, (_, i) => ({
    x: 30 + rnd() * 540,
    y: 30 + rnd() * 340,
    r: i % 6 === 0 ? 4.2 : 2 + rnd() * 1.6,
    hub: i % 6 === 0,
    dx: (rnd() - 0.5) * 14,
    dy: (rnd() - 0.5) * 12,
  }));
  const edges: Array<[number, number]> = [];
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, n.hub ? 4 : 2);
    near.forEach(({ j }) => {
      if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
    });
  });
  return { nodes, edges };
}
