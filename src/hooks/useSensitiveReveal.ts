import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState } from '../roomStore';
import {
  AgeState,
  concealMessageMedia,
  markMediaBlocked,
  revealMessageMedia,
} from '../roomStore/trustSafetySlice';
import { ensureAppPolicy, ensureMyAge } from '../roomStore/trustSafetyThunks';
import { FileAccess, probeFileAccess } from '../helpers/fileAccessProbe';

/**
 * - `covered`: the server-blurred preview with "Sensitive content. Tap to view".
 * - `checking`: the tap is being answered (policy, age, a probe of the file).
 * - `revealed`: the viewer asked to see it and may; the original is shown.
 * - `unavailable`: not for this account (a minor, a locked age, a refusal).
 * - `removed`: the file was hidden by moderation.
 */
export type RevealStatus = 'covered' | 'checking' | 'revealed' | 'unavailable' | 'removed';

interface Options {
  /** The message the media belongs to; the reveal is remembered per message. */
  messageId?: string;
  /** Original file to ask the server about before showing it. */
  probeUrl?: string;
  /** Test seam: probe override. */
  probe?: (url: string) => Promise<FileAccess>;
}

const appIdOf = (state: RootState): string =>
  state.chatSettingStore?.appId ||
  state.chatSettingStore?.config?.appId ||
  state.chatSettingStore?.user?.appId ||
  '';

/**
 * The tap-to-view flow for sensitive media (Trust & Safety):
 *
 *  1. Is sensitive media age gated in this App (GET /v2/apps/:appId/trust-safety,
 *     once per session)? Unknown counts as yes; the server enforces it anyway.
 *  2. If it is: the viewer's age (GET /v2/users/me/age, once per session).
 *     Unknown opens the age dialog, a minor gets "not available".
 *  3. One request for the original (see fileAccessProbe): a 403 names why.
 *  4. Reveal, remembered in the store for the session.
 *
 * Nothing here repeats by itself: every request is one tap, and the dialog is
 * offered at most once per tap.
 */
export const useSensitiveReveal = ({ messageId, probeUrl, probe }: Options) => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore?.user?.fileToken || ''
  );
  const revealed = useSelector((state: RootState) =>
    Boolean(messageId && state.trustSafety?.revealed?.[messageId])
  );
  const blocked = useSelector((state: RootState) =>
    messageId ? state.trustSafety?.blocked?.[messageId] : undefined
  );
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback(
    (url: string) =>
      probe ? probe(url) : probeFileAccess(url, { force: true, fileToken }),
    [probe, fileToken]
  );

  const run = useCallback(
    async (afterDialog: boolean) => {
      if (!messageId) return;
      setChecking(true);
      setUnavailable(false);
      const settle = (next: { unavailable?: boolean; dialog?: boolean }) => {
        if (!mounted.current) return;
        if (next.unavailable) setUnavailable(true);
        if (next.dialog) setDialogOpen(true);
      };
      try {
        const policy = await ensureAppPolicy(store, appIdOf(store.getState()));
        const gated = policy.ageGate !== false;
        let age: AgeState | undefined;
        if (gated) {
          age = await ensureMyAge(store);
          if (age.isAdult === false) return settle({ unavailable: true });
          if (age.isAdult !== true) {
            return settle(afterDialog ? { unavailable: true } : { dialog: true });
          }
        }

        const access: FileAccess = probeUrl ? await ask(probeUrl) : 'unknown';
        if (access === 'moderation') {
          dispatch(markMediaBlocked({ messageId, reason: 'moderation' }));
          return;
        }
        if (access === 'age-required') {
          // The server wants an age it does not have (or an adult one).
          if (!age) age = await ensureMyAge(store);
          if (age.isAdult === true || age.isAdult === false || afterDialog) {
            return settle({ unavailable: true });
          }
          return settle({ dialog: true });
        }
        if (access === 'forbidden') {
          // Refused without a readable reason: do not show a broken original.
          return settle({ unavailable: true });
        }
        dispatch(revealMessageMedia(messageId));
      } finally {
        if (mounted.current) setChecking(false);
      }
    },
    [messageId, probeUrl, store, dispatch, ask]
  );

  const requestReveal = useCallback(() => {
    if (checking) return;
    void run(false);
  }, [checking, run]);

  const conceal = useCallback(() => {
    if (messageId) dispatch(concealMessageMedia(messageId));
  }, [dispatch, messageId]);

  const onAgeDeclared = useCallback(() => {
    setDialogOpen(false);
    void run(true);
  }, [run]);

  const onAgeCancel = useCallback(() => setDialogOpen(false), []);

  const status: RevealStatus =
    blocked === 'moderation'
      ? 'removed'
      : revealed
        ? 'revealed'
        : checking
          ? 'checking'
          : unavailable
            ? 'unavailable'
            : 'covered';

  return {
    status,
    requestReveal,
    conceal,
    dialogOpen,
    onAgeDeclared,
    onAgeCancel,
  };
};
