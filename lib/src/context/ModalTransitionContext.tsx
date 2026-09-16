import { createContext, useContext } from 'react';

/**
 * Tells whatever `Modal.tsx` is currently rendering (a lazy `MODAL_COMPONENTS`
 * entry - a settings/profile side drawer, or the full-screen file preview)
 * whether it is in its exit window: `Modal.tsx` keeps the outgoing panel
 * mounted for `MOTION_BASE_MS` after the modal closes so its exit animation
 * can play (see `useExitTransition`), and needs a way to tell that panel to
 * actually play it. A context avoids threading an `isExiting` prop through
 * every modal component and through `modalComponents.ts`'s shared
 * `ModalComponent` type, none of which otherwise need to know this exists.
 *
 * Consumed today by `SideDrawer.tsx` (all of Settings/Profile/ChatProfile/
 * ManageData/Visibility go through it) and `FilePreviewModal.tsx`.
 */
const ModalTransitionContext = createContext(false);

export const ModalExitingProvider = ModalTransitionContext.Provider;

export const useIsModalExiting = (): boolean =>
  useContext(ModalTransitionContext);
