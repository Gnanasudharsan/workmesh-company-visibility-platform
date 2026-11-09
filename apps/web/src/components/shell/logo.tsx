export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="wm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#wm-g)" />
      <g stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M9 21 16 11l7 10" />
        <path d="M9 21h14" opacity=".55" />
      </g>
      <g fill="#fff">
        <circle cx="16" cy="11" r="2.6" />
        <circle cx="9" cy="21" r="2.6" />
        <circle cx="23" cy="21" r="2.6" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15.5px] font-semibold tracking-[-0.02em] text-ink">WorkMesh</span>
    </span>
  );
}
