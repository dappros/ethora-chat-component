import { css, keyframes } from 'styled-components';

/**
 * Shared motion primitives for the chat UI.
 *
 * Keep durations/easing in sync with the tokens published by
 * `styles/tokens.ts` (`--ethora-motion-fast` = 150ms, `--ethora-motion-base`
 * = 220ms, `--ethora-motion-ease`). The literal values are duplicated here
 * (rather than reading the CSS variables inside `@keyframes`, which most
 * browsers don't support) but must stay numerically identical.
 */

export const MOTION_FAST = '150ms';
export const MOTION_BASE = '220ms';
export const MOTION_EASE = 'cubic-bezier(.2,.8,.2,1)';

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

export const shimmer = keyframes`
  from { background-position: -200% 0; }
  to { background-position: 200% 0; }
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

/** Shimmering skeleton background, respecting reduced motion (stays static). */
export const shimmerBackground = css`
  background: linear-gradient(
    90deg,
    var(--ethora-color-bg-subtle, #f5f7fa) 25%,
    var(--ethora-color-bg-hover, #f0f2f5) 37%,
    var(--ethora-color-bg-subtle, #f5f7fa) 63%
  );
  background-size: 400% 100%;
  animation: ${shimmer} 1.4s ease infinite;
  ${reducedMotion}
`;
