/**
 * WorkMesh mark: five nodes connected into a "W", with faint cross-links that turn the W into
 * a mesh (people connected through teams and work). Built from simple geometry so it stays
 * legible at 16 px.
 *
 *   MeshGlyph   — mark only; `tone` = brand (teal/white) or mono (currentColor)
 *   LogoMark    — app icon: glyph on a midnight rounded square
 *   Logo        — icon + wordmark lockup; `theme` = dark (on navy) or light (on porcelain)
 */
const NODES = [
  [6, 9],
  [11, 23],
  [16, 13.5],
  [21, 23],
  [26, 9],
] as const;
const W_PATH = "M6 9 L11 23 L16 13.5 L21 23 L26 9";
const MESH_PATHS = ["M6 9 L16 13.5 L26 9", "M11 23 L21 23"];

export function MeshGlyph({ size = 24, tone = "brand", className }: { size?: number; tone?: "brand" | "mono" | "ink"; className?: string }) {
  const line = tone === "brand" ? "#37D5C3" : tone === "ink" ? "#0B7A6E" : "currentColor";
  const node = tone === "brand" ? "#FFFFFF" : tone === "ink" ? "#091B2D" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      {MESH_PATHS.map((d) => (
        <path key={d} d={d} stroke={line} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      ))}
      <path d={W_PATH} stroke={line} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r={idx === 2 ? 3.1 : 2.5} fill={idx === 2 && tone === "brand" ? "#37D5C3" : node} stroke={tone === "brand" ? "#091B2D" : "none"} strokeWidth="1.2" />
      ))}
    </svg>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-[9px] bg-navy-950 ring-1 ring-inset ring-white/10" style={{ width: size, height: size }} aria-hidden>
      <MeshGlyph size={size * 0.82} />
    </span>
  );
}

export function Logo({ theme = "light", compact = false }: { theme?: "light" | "dark"; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className={`font-display text-[16.5px] font-semibold tracking-[-0.03em] ${theme === "dark" ? "text-white" : "text-navy-950"}`}>
          Work<span className={theme === "dark" ? "text-teal" : "text-teal-ink"}>Mesh</span>
        </span>
      )}
    </span>
  );
}
