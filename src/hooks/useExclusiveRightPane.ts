import { useEffect, useRef } from 'react';

/**
 * Keeps the chat to at most three columns.
 *
 * Two different things want to be the right-hand column: the thread view
 * (`Thread/ThreadWrapper`) and the profile/settings panel
 * (`Modals/SidePanel`). Letting both take space at once gives four columns
 * and squeezes the conversation into nothing, so the rule is the one most
 * products use: THE ONE OPENED LAST WINS, and the other closes. Opening a
 * profile while reading a thread puts the profile there and drops back to the
 * room's messages; opening a thread from a message while a profile is open
 * closes the profile. Either way, dismissing the survivor leaves the plain
 * two-column chat, never a half-state.
 *
 * The tie-break for "both already open on the first render" (a remount with
 * persisted state, not something a click can produce) is to close the panel:
 * the thread is the reading context the user was in, the panel is chrome.
 */
interface UseExclusiveRightPaneOptions {
  threadOpen: boolean;
  panelOpen: boolean;
  closeThread: () => void;
  closePanel: () => void;
}

export const useExclusiveRightPane = ({
  threadOpen,
  panelOpen,
  closeThread,
  closePanel,
}: UseExclusiveRightPaneOptions): void => {
  // Read through refs inside the effect so a caller passing fresh inline
  // closures every render (ChatWrapper does) cannot re-trigger the effect
  // and close a pane the user just re-opened.
  const closeThreadRef = useRef(closeThread);
  closeThreadRef.current = closeThread;
  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

  const prevRef = useRef<{ threadOpen: boolean; panelOpen: boolean } | null>(
    null
  );

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { threadOpen, panelOpen };

    if (!threadOpen || !panelOpen) return;

    // First render with both already open: keep the thread.
    if (!prev) {
      closePanelRef.current();
      return;
    }

    if (!prev.panelOpen) {
      // The panel is the new arrival, so the thread yields.
      closeThreadRef.current();
      return;
    }
    if (!prev.threadOpen) {
      // The thread is the new arrival, so the panel yields.
      closePanelRef.current();
    }
  }, [threadOpen, panelOpen]);
};

export default useExclusiveRightPane;
