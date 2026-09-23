import { useEffect, useMemo, useRef, useState } from 'react';

import { IAttachment } from '../types/types';
import {
  applyOpenedAttachment,
  openSealedAttachment,
} from '../helpers/sealedAttachments';
import { withoutFileToken } from '../helpers/secureFileUrl';

export type SealedState = 'opening' | 'ready' | 'failed';

/**
 * Swaps sealed attachments for openable ones.
 *
 * `keys` come off the message (lifted out of the OMEMO-decrypted <body> by
 * getDataFromXml) and are positional: keys[i] opens attachments[i]. With no
 * keys - a plain room, or a message whose body we could not decrypt - the
 * input is handed straight back, so this hook is inert everywhere else.
 */
export function useSealedAttachments(
  attachments: IAttachment[],
  keys?: string[]
): { attachments: IAttachment[]; state: SealedState } {
  const sealed = Boolean(keys?.length);

  const [opened, setOpened] = useState<Record<number, IAttachment>>({});
  const [failed, setFailed] = useState(false);

  // Identity of the work, not of the array: MediaMessage rebuilds the
  // attachment objects on every fileToken refresh, and re-running the effect
  // on that would re-download each file roughly hourly.
  const signature = useMemo(
    () =>
      sealed
        ? attachments.map((a) => withoutFileToken(a.location)).join('|')
        : '',
    [attachments, sealed]
  );

  const latest = useRef(attachments);
  latest.current = attachments;

  useEffect(() => {
    if (!sealed) return;

    let cancelled = false;
    setFailed(false);

    void Promise.all(
      latest.current.map(async (attachment, index) => {
        const keyMaterial = keys?.[index];
        if (!keyMaterial || !attachment.location) return;
        try {
          const result = await openSealedAttachment(
            attachment.location,
            keyMaterial
          );
          if (cancelled) return;
          setOpened((prev) => ({
            ...prev,
            [index]: applyOpenedAttachment(latest.current[index], result),
          }));
        } catch (error) {
          // One unreadable file must not blank the whole message, so the
          // failure is surfaced per message and the tile keeps its place.
          console.warn('sealed attachment could not be opened', error);
          if (!cancelled) setFailed(true);
        }
      })
    );

    return () => {
      cancelled = true;
    };
    // `signature` stands in for the attachment list; see above.
  }, [signature, sealed, keys]);

  const result = useMemo(() => {
    if (!sealed) return attachments;
    return attachments.map((attachment, index) => {
      const ready = opened[index];
      if (ready) return ready;
      // Not open yet: hand the tile an empty location, which every renderer
      // already treats as "not available yet" rather than as a broken file.
      // Handing over the ciphertext URL instead would render a broken image.
      return { ...attachment, location: '', locationPreview: '' };
    });
  }, [attachments, opened, sealed]);

  const openedCount = Object.keys(opened).length;
  const state: SealedState = !sealed
    ? 'ready'
    : openedCount === attachments.length
      ? 'ready'
      : failed
        ? 'failed'
        : 'opening';

  return { attachments: result, state };
}
