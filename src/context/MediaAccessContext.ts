import { createContext, useContext } from 'react';

/**
 * Lets a media tile tell its message that a secure file failed to load, so
 * the message can ask the server once why (see helpers/fileAccessProbe.ts)
 * and switch to the matching Trust & Safety state: a sensitive file a client
 * never flagged ("age-required"), or a file moderation removed.
 */
export interface MediaAccessContextValue {
  reportFailure: (url: string) => void;
}

export const MediaAccessContext = createContext<MediaAccessContextValue | null>(null);

export const useMediaAccess = () => useContext(MediaAccessContext);
