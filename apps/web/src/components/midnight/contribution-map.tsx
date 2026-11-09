"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface CMNode {
  id: string;
  label: string;
  sub?: string;
  href?: string;
}
export interface CMColumn {
  key: string;
  title: string;
  color: string;
  nodes: CMNode[];
}

const ROW = 60;
const PAD = 8;

/**
 * Shows how real work connects upward: Task → Project → Initiative → Goal. Columns and edges
 * come straight from the caller's authorized API data; hovering a node highlights its chain.
 */
export function ContributionMap({ columns, edges, emptyHint }: { columns: CMColumn[]; edges: Array<[string, string]>; emptyHint?: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const visible = columns.filter((c) => c.nodes.length > 0);
  const rows = Math.max(1, ...visible.map((c) => c.nodes.length));
  const height = rows * ROW + PAD * 2;
  const n = visible.length;
  const W = 100 / Math.max(n, 1);
  const G = 2; // horizontal gap (in % of width) between a column edge and its nodes
  const colX = (i: number) => i * W;
  const pos = new Map<string, { x: number; y: number; col: number }>();
  visible.forEach((c, ci) => {
    const offset = ((rows - c.nodes.length) * ROW) / 2;
    c.nodes.forEach((node, ri) => pos.set(node.id, { x: colX(ci), y: PAD + offset + ri * ROW + ROW / 2, col: ci }));
  });

  // Highlight the whole upstream + downstream chain of the hovered node.
  const chain = new Set<string>();
  if (hover) {
    chain.add(hover);
    const walk = (id: string, dir: 0 | 1) => {
      for (const e of edges) {
        if (e[dir] === id && !chain.has(e[1 - dir])) {
          chain.add(e[1 - dir]);
          walk(e[1 - dir], dir);
        }
      }
    };
    walk(hover, 0);
    walk(hover, 1);
  }

  if (visible.length < 2) return <p className="py-6 text-center text-[13px] text-muted">{emptyHint ?? "Not enough linked work yet to draw a map."}</p>;

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="min-w-[620px]">
        <div className="mb-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {visible.map((c) => (
            <div key={c.key} className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted" style={{ paddingLeft: `${(G / W) * 100}%` }}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.title}
            </div>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
            {edges.map(([a, b], i) => {
              const p = pos.get(a);
              const q = pos.get(b);
              if (!p || !q) return null;
              const x1 = p.x + W - G;
              const x2 = q.x + G;
              const mid = (x1 + x2) / 2;
              const lit = hover ? chain.has(a) && chain.has(b) : false;
              return (
                <motion.path
                  key={`${a}-${b}`}
                  d={`M ${x1} ${p.y} C ${mid} ${p.y}, ${mid} ${q.y}, ${x2} ${q.y}`}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  stroke={lit ? "var(--color-teal-ink)" : "var(--color-line-strong)"}
                  strokeWidth={lit ? 2 : 1.25}
                  strokeOpacity={hover && !lit ? 0.35 : 1}
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.1 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
              );
            })}
          </svg>
          {visible.map((c, ci) =>
            c.nodes.map((node) => {
              const p = pos.get(node.id)!;
              const dim = hover && !chain.has(node.id);
              const style = { top: p.y, left: `${p.x + G}%`, width: `${W - 2 * G}%` };
              const body = (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[12px] font-medium leading-[1.25]" title={node.label}>{node.label}</span>
                    {node.sub && <span className="block truncate text-[11px] leading-tight text-muted">{node.sub}</span>}
                  </span>
                </>
              );
              const cls = cn(
                "absolute flex -translate-y-1/2 items-center gap-2 rounded-[10px] border bg-surface px-2 py-1.5 shadow-card transition-[opacity,border-color,box-shadow] duration-200",
                dim ? "opacity-40" : "opacity-100",
                hover === node.id ? "border-teal shadow-raised" : "border-line",
              );
              const handlers = { onMouseEnter: () => setHover(node.id), onMouseLeave: () => setHover(null), onFocus: () => setHover(node.id), onBlur: () => setHover(null) };
              return node.href ? (
                <Link key={node.id} href={node.href} className={cn(cls, "hover:border-teal")} style={style} {...handlers}>
                  {body}
                </Link>
              ) : (
                <div key={node.id} tabIndex={0} className={cls} style={style} {...handlers}>
                  {body}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
