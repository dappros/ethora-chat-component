import { css, keyframes } from 'styled-components';

/**
 * Shared motion primitives for the chat UI.
 *
 * Keep durations/easing in sync with the tokens published by
 * `styles/tokens.ts` (`--ethora-motion-fast` = 150ms, `--ethora-motion-base`
 * = 220ms, `--ethora-motion-ease`). The literal values are duplicated here
 * (rather than reading the CSS variables inside `@keyframes`, which most
 * browsers don't support) but must stay numerically identical.
 *
 * This module also owns the two hooks that keep an element mounted for the
 * length of an exit animation (`useExitTransition` in `hooks/`, plus the
 * `useDelayedAction` helper below for self-closing components) - see the
 * "Presence / exit transitions" section near the bottom of this file.
 */

export const MOTION_FAST = '150ms';
export const MOTION_BASE = '220ms';
export const MOTION_EASE = 'cubic-bezier(.2,.8,.2,1)';

// Numeric twins of the two durations above, for the handful of call sites
// that need a plain millisecond number (setTimeout for an exit transition,
// mostly) rather than a CSS length. Keep these numerically identical to
// MOTION_FAST/MOTION_BASE - same rule as the CSS duplication noted above.
export const MOTION_FAST_MS = 150;
export const MOTION_BASE_MS = 220;

export const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

/** Skeleton timing: one sweep cycle, and the delay before anything shows. */
export const SHIMMER_SWEEP_MS = 2000;
export const SHIMMER_DELAY_MS = 120;
export const SHIMMER_FADE_IN_MS = 240;

/**
 * The loading band drifts left to right (reading direction). Keyframes move
 * the band's own transform, not background-position, so the browser can run
 * it on the compositor. The band is 60% of the host wide, so -100% parks it
 * just off the left edge and 166.67% just off the right edge.
 */
export const shimmerSweep = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(166.67%); }
`;

/**
 * Right-hand side drawer entrance. Travels further than `fadeInUp` (a panel
 * sliding in from the screen edge reads as motion only if it actually
 * covers some distance) but keeps the same duration/easing as everything
 * else, so a drawer does not feel like a different app.
 */
export const slideInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

/**
 * Disables all animations/transitions when the user prefers reduced motion.
 * Spread this LAST in a styled-components template so it wins the cascade,
 * e.g.:
 *
 *   const Row = styled.div`
 *     animation: ${fadeInUp} ${MOTION_BASE} ${MOTION_EASE};
 *     ${reducedMotion}
 *   `;
 */
export const reducedMotion = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    transition: none !important;
  }
`;

/** Convenience: fade+rise-in animation shorthand, respecting reduced motion. */
export const fadeInUpAnimation = css`
  animation: ${fadeInUp} ${MOTION_BASE} ${MOTION_EASE} both;
  ${reducedMotion}
`;

/** Convenience: cross-fade animation shorthand, respecting reduced motion. */
export const fadeInAnimation = css`
  animation: ${fadeIn} ${MOTION_FAST} ${MOTION_EASE} both;
  ${reducedMotion}
`;

/** Convenience: scale-in animation shorthand, respecting reduced motion. */
export const scaleInAnimation = css`
  animation: ${scaleIn} ${MOTION_FAST} ${MOTION_EASE} both;
  ${reducedMotion}
`;

/** Convenience: side-drawer slide-in shorthand, respecting reduced motion. */
export const slideInRightAnimation = css`
  /*
   * backwards, deliberately, not both.
   *
   * With both, the element keeps computing the 100% keyframe after the
   * animation finishes: transform translateX(0) rather than transform
   * none. Any non-none transform makes the element a containing block
   * for its position:fixed descendants, so a fixed, viewport-centred
   * overlay opened from inside a settled panel would centre on the
   * panel instead of the screen, and get clipped by it.
   *
   * backwards still applies the 0% state before the animation starts, so
   * there is no first-frame flash at the final position, and the end
   * state is visually identical to having no transform at all.
   */
  animation: ${slideInRight} ${MOTION_BASE} ${MOTION_EASE} backwards;
  ${reducedMotion}
`;

/**
 * Loading skeleton: a calm, slightly tinted base with one soft band sweeping
 * left to right every 2s. The band fades in with its own transparent edges,
 * so there is no hard leading or trailing line. Nothing shows for the first
 * 120ms, so an image that arrives quickly never flashes a placeholder.
 *
 * The host must be positioned (`position: relative` or `absolute`, set by the
 * host itself so this helper cannot override it); the band is an ::after
 * clipped by the host's `overflow: hidden`. Reduced motion keeps only the
 * static base.
 */
export const shimmerBackground = css`
  overflow: hidden;
  background-color: color-mix(in srgb, var(--ethora-color-text, #141414) 3%, var(--ethora-color-bg-subtle, #f5f7fa));
  animation: ${fadeIn} ${SHIMMER_FADE_IN_MS}ms ${MOTION_EASE} ${SHIMMER_DELAY_MS}ms backwards;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 60%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--ethora-color-text, #141414) 7%, transparent) 50%,
      transparent 100%
    );
    transform: translateX(-100%);
    will-change: transform;
    animation: ${shimmerSweep} ${SHIMMER_SWEEP_MS}ms ease-in-out ${SHIMMER_DELAY_MS}ms infinite backwards;
  }

  [data-ethora-color-scheme='dark'] &::after {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.05) 50%,
      transparent 100%
    );
  }

  ${reducedMotion}

  @media (prefers-reduced-motion: reduce) {
    &::after {
      display: none;
    }
  }
`;

// ---------------------------------------------------------------------------
// Exit keyframes - the mirror image of the entrances above.
//
// A CSS `animation` cannot itself be reversed with the `direction` property
// while keeping the same "hold at the start/end frame" fill behaviour we
// want (entrance holds at frame 1, exit needs to hold at frame 0 while the
// element gets removed), so each entrance gets a small, explicit opposite
// instead of trying to run the same keyframes backwards.
// ---------------------------------------------------------------------------

export const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const scaleOut = keyframes`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.98);
  }
`;

/** Mirror of `slideInRight`: the drawer leaves back the way it came. */
export const slideOutRight = keyframes`
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(24px);
  }
`;

/** Convenience: cross-fade-out shorthand, respecting reduced motion. */
export const fadeOutAnimation = css`
  animation: ${fadeOut} ${MOTION_FAST} ${MOTION_EASE} both;
  ${reducedMotion}
`;

/** Convenience: scale-out shorthand, respecting reduced motion. */
export const scaleOutAnimation = css`
  animation: ${scaleOut} ${MOTION_FAST} ${MOTION_EASE} both;
  ${reducedMotion}
`;

/** Convenience: side-drawer slide-out shorthand, respecting reduced motion. */
export const slideOutRightAnimation = css`
  animation: ${slideOutRight} ${MOTION_BASE} ${MOTION_EASE} both;
  ${reducedMotion}
`;

// ---------------------------------------------------------------------------
// Shared decorative loops.
//
// `pulse` and `dot-fade` each existed as 3-4 near-identical copies scattered
// across typing indicators and recording UI (same shape, slightly different
// literal numbers). Consolidated here so there is one definition to tune -
// component-local copies should import these instead of redefining them.
// ---------------------------------------------------------------------------

/** Gentle scale+opacity breathing loop - typing bubbles, recording dot. */
export const pulse = keyframes`
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
`;

/** Three-dot "typing" fade loop. Stagger children with `animation-delay`. */
export const dotFade = keyframes`
  0% { opacity: 0.2; }
  20% { opacity: 1; }
  100% { opacity: 0.2; }
`;

/** Convenience: breathing pulse shorthand, respecting reduced motion. */
export const pulseAnimation = css`
  animation: ${pulse} 2s ease-in-out infinite;
  ${reducedMotion}
`;

/** Convenience: typing-dot fade shorthand, respecting reduced motion. */
export const dotFadeAnimation = css`
  animation: ${dotFade} 1.5s ease-in-out infinite;
  ${reducedMotion}
`;

// ---------------------------------------------------------------------------
// Presence helpers - JS-side reduced-motion check for the exit-transition
// hooks (`hooks/useExitTransition.ts`, `hooks/useDelayedAction.ts`). Kept
// here rather than duplicated in each hook so the CSS media query above and
// the JS check below are next to each other and obviously meant to agree.
// ---------------------------------------------------------------------------

/** True when the platform/browser has "prefers-reduced-motion: reduce" set. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
