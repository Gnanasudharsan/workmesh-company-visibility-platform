/**
 * WorkMesh motion system. One vocabulary for every animation in the product:
 * durations, easing, springs and a few shared variants. Transforms and opacity only.
 * Components use `useReducedMotion()` from motion/react; CSS respects
 * `prefers-reduced-motion` globally (see globals.css).
 */
import type { Transition, Variants } from "motion/react";

export const DURATION = { fast: 0.12, base: 0.2, slow: 0.28 } as const;
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING = {
  /** Indicators, tabs, toggles — settles quickly without wobble. */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 } satisfies Transition,
  /** Panels, drawers, cards entering. */
  soft: { type: "spring", stiffness: 260, damping: 30 } satisfies Transition,
};

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

/** Parent variant that staggers its children's `fadeRise`. Keep counts small. */
export const stagger = (step = 0.045, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
};
