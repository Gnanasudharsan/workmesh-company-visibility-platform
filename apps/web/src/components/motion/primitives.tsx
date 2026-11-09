"use client";

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fadeRise, pageTransition, stagger } from "@/lib/motion";

/** Fades and lifts each page in on navigation. Never blocks input. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div key={pathname} variants={pageTransition} initial={reduce ? false : "hidden"} animate="show">
      {children}
    </motion.div>
  );
}

/** Staggers its <Reveal.Item> children into view once. */
export function Reveal({ children, className, step = 0.05 }: { children: ReactNode; className?: string; step?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={stagger(step)} initial={reduce ? false : "hidden"} animate="show">
      {children}
    </motion.div>
  );
}

function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeRise}>
      {children}
    </motion.div>
  );
}
Reveal.Item = RevealItem;

/**
 * Counts up to a real value once, the first time it scrolls into view. Subsequent changes
 * animate from the previous value. Reduced motion renders the final value directly.
 */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    if (!inView) return;
    const controls = animate(from.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce]);
  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}
