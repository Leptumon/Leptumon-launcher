/**
 * Motion tokens for the motion package, matching the SCSS ones in
 * styles/base/_variables.scss so CSS and JS animations feel like one system.
 */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.18,
  slow: 0.28,
} as const;

/** Things that move to a new place (the sidebar's active marker). Critically damped: no bounce. */
export const SPRING_SNAPPY = { type: 'spring', stiffness: 520, damping: 44, mass: 1 } as const;

/** Page-to-page crossfade. */
export const PAGE_TRANSITION = { duration: DURATION.base, ease: EASE_OUT } as const;

/** Height reveals (the Advanced section). A spring would bounce the content below. */
export const COLLAPSE_TRANSITION = {
  height: { duration: DURATION.slow, ease: EASE_OUT },
  opacity: { duration: DURATION.base, ease: 'easeOut' },
} as const;

/** Menus and popovers. */
export const POPOVER_TRANSITION = { duration: DURATION.base, ease: EASE_OUT } as const;
