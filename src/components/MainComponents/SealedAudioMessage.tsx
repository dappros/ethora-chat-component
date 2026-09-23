import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

import AudioMessage from '../styled/AudioMessage';
import { useT } from '../../i18n/useT';
import { openSealedAttachmentUrl } from '../../helpers/sealedAttachments';

const Note = styled.div`
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: var(--ethora-font-size-sm, 13px);
  font-style: italic;
`;

/**
 * A sealed voice note, played in place.
 *
 * Decrypting on mount rather than on a click is deliberate and costs nothing
 * extra: the plain audio renderer draws its waveform with wavesurfer, which
 * loads the whole file on mount anyway. So an encrypted room fetches exactly
 * what a plain one does, and the user still just presses play once.
 *
 * That is the opposite of the rule for other sealed attachments, which stay
 * untouched until asked for - a document is big and rarely opened, a voice
 * note is small and exists to be listened to.
 */
const SealedAudioMessage: React.FC<{ location?: string; keyMaterial?: string }> = ({
  location,
  keyMaterial,
}) => {
  const t = useT();
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!location || !keyMaterial) return;

    let cancelled = false;
    let opened = '';
    setFailed(false);

    openSealedAttachmentUrl(location, keyMaterial)
      .then(({ objectUrl: url }) => {
        opened = url;
        // Unmounted while decrypting: revoke immediately rather than leaking
        // the plaintext for a player that will never exist.
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setObjectUrl(url);
      })
      .catch((error) => {
        console.warn('sealed voice note could not be opened', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (opened) URL.revokeObjectURL(opened);
    };
  }, [location, keyMaterial]);

  if (!location || !keyMaterial || failed) {
    return <Note>{t('media.sealedUnavailable')}</Note>;
  }

  if (!objectUrl) {
    return <Note>{t('media.sealedDownloading')}</Note>;
  }

  return <AudioMessage src={objectUrl} />;
};

export default SealedAudioMessage;
