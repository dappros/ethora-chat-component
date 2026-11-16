import { createContext, useContext } from 'react';
import type { SoloBox } from '../../helpers/mediaBox';

/**
 * Sensitive media is shown covered and revealed in the same box, so the
 * chat does not jump when a viewer reveals or hides it. SensitiveMediaGate
 * renders the message's own attachment list in both states and provides
 * this context:
 *
 *  - `covered`: draw only the server's blurred preview (never the
 *    original), blurred again in CSS, with no viewer and no video chrome;
 *  - `lockedSolo`: once the media has been switched between covered and
 *    revealed, the single picture's box from that moment, reused by both
 *    states (the picture is fitted into it, never the box to the picture);
 *  - `onSoloBox`: where a single picture reports the box it settled on.
 */
export interface MediaCoverState {
  covered: boolean;
  lockedSolo?: SoloBox | null;
  onSoloBox?: (box: SoloBox, placeholder: boolean) => void;
}

export const MediaCoverContext = createContext<MediaCoverState | null>(null);

export const useMediaCover = () => useContext(MediaCoverContext);
