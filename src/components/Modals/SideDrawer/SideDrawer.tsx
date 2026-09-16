import { FC, ReactNode, useId, useRef } from 'react';
import styled from 'styled-components';
import { BackIcon } from '../../../assets/icons';
import Button from '../../styled/Button';
import { useT } from '../../../i18n/useT';
import { useModalDismiss } from '../../../hooks/useModalDismiss';
import { slideInRightAnimation, slideOutRightAnimation } from '../../../styles/motion';
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport';
// Motion: Modal.tsx keeps this drawer mounted for one exit-animation's worth
// of time after it closes (see useExitTransition there) and reports it via
// this context, since threading a prop through every SideDrawer-hosting
// modal component would touch five files this drawer doesn't need to.
import { useIsModalExiting } from '../../../context/ModalTransitionContext';

/**
 * The one side-drawer surface for the profile/settings family of panels.
 *
 * Built on the existing store-driven `Modals/Modal` primitive rather than as
 * a new modal system: `Modal.tsx` already owns the routing (which panel is
 * open), the backdrop element, the lazy/Suspense boundary and the focus
 * plumbing, and it renders whichever `MODAL_COMPONENTS` entry is active
 * inside `ModalBackground`. All this component replaces is the *surface*
 * those panels used to render - `ModalContainerFullScreen`, which was
 * width:100%/height:100% and therefore covered the room list and the chat.
 * `Modal.tsx` puts `ModalBackground` into its `$drawer` mode for these panel
 * types (transparent, pointer-events:none, child parked right), so the room
 * list and chat behind the drawer stay visible and clickable on desktop.
 *
 * Behaviour:
 * - Slides in from the right, and back out on close, using `styles/motion`'s
 *   shared primitives (which already no-op under `prefers-reduced-motion`).
 *   `Modal.tsx` keeps this component mounted for the exit animation's
 *   duration after closing and reports it through `ModalTransitionContext`
 *   (`useIsModalExiting`), which flips `DrawerPanel`'s `$closing` prop.
 * - Escape closes, initial focus moves inside, focus is restored on close -
 *   all via the shared `useModalDismiss` hook (whose modal stack means a
 *   nested confirm dialog opened from inside the drawer closes first).
 * - Carries `role="dialog"` plus an accessible name from the heading it
 *   renders. `aria-modal` is deliberately only set in full-screen (mobile)
 *   mode: on desktop the rest of the app really does stay interactive, and
 *   claiming otherwise would be a lie to a screen reader.
 */

const DRAWER_BREAKPOINT_PX = 767;
const DRAWER_BREAKPOINT = `${DRAWER_BREAKPOINT_PX}px`;

export const DrawerPanel = styled.div<{ $closing?: boolean }>`
  position: relative;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background-color: var(--ethora-color-bg, #fff);
  overflow: hidden;
  ${({ $closing }) => ($closing ? slideOutRightAnimation : slideInRightAnimation)}

  @media (min-width: 768px) {
    width: 400px;
    max-width: 100%;
    border-left: 1px solid var(--ethora-color-border, #e6e8ec);
    box-shadow: var(--ethora-shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.14));
  }
`;

const DrawerHeader = styled.header`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-2, 8px);
  flex: 0 0 auto;
  padding: var(--ethora-space-2, 8px) var(--ethora-space-3, 12px);
  border-bottom: 1px solid var(--ethora-color-border, #e6e8ec);
  background-color: var(--ethora-color-bg, #fff);
`;

const DrawerTitle = styled.h2`
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
  font-size: var(--ethora-font-size-lg, 18px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  color: var(--ethora-color-text, #141414);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DrawerHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-1, 4px);
  flex: 0 0 auto;
`;

const DrawerBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-6, 24px);
  padding: var(--ethora-space-5, 20px) var(--ethora-space-4, 16px)
    var(--ethora-space-6, 24px);

  @media (max-width: ${DRAWER_BREAKPOINT}) {
    padding-left: var(--ethora-space-4, 16px);
    padding-right: var(--ethora-space-4, 16px);
  }
`;

// ---------------------------------------------------------------------------
// Section primitives - the hierarchy the panels were missing.
// ---------------------------------------------------------------------------

/** A labelled group: small caps heading, then a bordered card of rows. */
export const DrawerSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-2, 8px);
`;

export const DrawerSectionTitle = styled.h3`
  margin: 0;
  padding: 0 var(--ethora-space-1, 4px);
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

/** The surface a section's rows sit on. */
export const DrawerCard = styled.div`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 12px);
  background-color: var(--ethora-color-bg, #fff);
  overflow: hidden;
`;

/** Padded block inside a card, for free-form content rather than a row list. */
export const DrawerCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-1, 4px);
  padding: var(--ethora-space-3, 12px) var(--ethora-space-4, 16px);
`;

/** Section heading with a trailing control (e.g. "Files" ... "Show all"). */
export const SectionHeaderRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ethora-space-2, 8px);
`;

/**
 * Text-only affordance for "Show more" / "Show all". A real <button>, so it
 * is reachable by keyboard and announced as a button - the panels used to
 * fake this with a div carrying role="button" and hand-rolled key handling.
 */
export const ShowMoreButton = styled.button`
  border: none;
  background: transparent;
  padding: var(--ethora-space-2, 8px) 0;
  cursor: pointer;
  font: inherit;
  font-size: var(--ethora-font-size-xs, 13px);
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-primary, #0052cd);
  align-self: center;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: var(--ethora-radius-sm, 8px);
  }
`;

/** Hairline between two rows of the same card. */
export const DrawerRowDivider = styled.div`
  height: 1px;
  margin: 0 var(--ethora-space-4, 16px);
  background-color: var(--ethora-color-border, #e6e8ec);
`;

export const DrawerLabel = styled.div`
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-text, #141414);
  text-align: start;
`;

export const DrawerHint = styled.div`
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: var(--ethora-font-weight-regular, 400);
  color: var(--ethora-color-text-muted, #8c8c8c);
  text-align: start;
  line-height: 1.4;
`;

/** Interactive row: label + optional hint on the left, chevron on the right. */
const DrawerNavRowButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  width: 100%;
  min-height: 56px;
  padding: var(--ethora-space-3, 12px) var(--ethora-space-4, 16px);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: start;
  font: inherit;
  color: inherit;
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

const DrawerNavRowText = styled.span`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-1, 4px);
  flex: 1 1 auto;
  min-width: 0;
`;

const DrawerChevron = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

// Inline rather than added to assets/icons.tsx: it is a 16px affordance used
// only by this row, and drawing it with `currentColor` lets the row's own
// token-driven color drive it (no hardcoded hex).
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6 3.5L10.5 8L6 12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface DrawerNavRowProps {
  label: string;
  hint?: string;
  onClick: () => void;
}

/** One "opens another panel" row inside a `DrawerCard`. */
export const DrawerNavRow: FC<DrawerNavRowProps> = ({
  label,
  hint,
  onClick,
}) => (
  <DrawerNavRowButton type="button" onClick={onClick}>
    <DrawerNavRowText>
      <DrawerLabel>{label}</DrawerLabel>
      {hint && <DrawerHint>{hint}</DrawerHint>}
    </DrawerNavRowText>
    <DrawerChevron aria-hidden="true">
      <ChevronRight />
    </DrawerChevron>
  </DrawerNavRowButton>
);

export interface SideDrawerProps {
  /** Heading text; also the dialog's accessible name. */
  title: string;
  /** Invoked by the back button and by Escape. */
  onClose: () => void;
  /** Controls in the header's trailing slot (edit, overflow menu, QR, ...). */
  headerActions?: ReactNode;
  /**
   * Label for the leading button. Sub-panels step back to their parent, so
   * they read as "Back"; a top-level panel reads as "Close".
   */
  backLabel?: string;
  children: ReactNode;
}

const SideDrawer: FC<SideDrawerProps> = ({
  title,
  onClose,
  headerActions,
  backLabel,
  children,
}) => {
  const t = useT();
  const titleId = useId();
  // Rendered synchronously once the lazy panel chunk has resolved, so the
  // panel is in the DOM by the time useModalDismiss's mount effect runs -
  // no MutationObserver needed here (unlike Modal.tsx, which has to wait
  // for Suspense to swap the chunk in).
  const containerRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ onClose, containerRef });
  // Below the breakpoint the panel really is the whole screen and nothing
  // behind it is reachable, so it is a modal dialog. Above it, the room list
  // and the chat stay interactive, so claiming `aria-modal` would misreport
  // the panel to assistive tech.
  const isFullScreen = useIsMobileViewport(DRAWER_BREAKPOINT_PX);
  const isClosing = useIsModalExiting();

  return (
    <DrawerPanel
      ref={containerRef}
      role="dialog"
      aria-modal={isFullScreen ? true : undefined}
      aria-labelledby={titleId}
      data-testid="side-drawer"
      $closing={isClosing}
    >
      <DrawerHeader>
        <Button
          EndIcon={<BackIcon />}
          onClick={onClose}
          aria-label={backLabel ?? t('action.close')}
        />
        <DrawerTitle id={titleId}>{title}</DrawerTitle>
        {headerActions && (
          <DrawerHeaderActions>{headerActions}</DrawerHeaderActions>
        )}
      </DrawerHeader>
      <DrawerBody>{children}</DrawerBody>
    </DrawerPanel>
  );
};

export default SideDrawer;
