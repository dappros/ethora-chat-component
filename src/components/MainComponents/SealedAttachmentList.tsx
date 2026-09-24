import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { IAttachment } from '../../types/types';
import { useT } from '../../i18n/useT';
import { DownloadIcon, LockIcon } from '../../assets/icons';
import { formatFileName, formatFileSize } from '../../helpers/fileKind';
import { saveSealedAttachment } from '../../helpers/sealedAttachments';

// Deliberately NOT built on the shared MediaComponents file card: that one
// sizes its icon box 100%/100% because it wraps a thumbnail, and a sealed
// attachment has no thumbnail to bound it. This is a fixed-size chip.
const SealedStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SealedCard = styled.button`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: 240px;
  max-width: 100%;
  padding: 8px 10px;
  text-align: left;
  border-radius: var(--ethora-radius-sm, 8px);
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  border: 1px solid var(--ethora-color-border, transparent);
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
`;

const IconBox = styled.span`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ethora-radius-sm, 8px);
  background-color: var(--ethora-color-bg, #fff);
`;

const Details = styled.span`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const Name = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--ethora-color-text, #141414);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Meta = styled.span`
  font-size: var(--ethora-font-size-sm, 12px);
  color: var(--ethora-color-text-secondary, #53575a);
`;

const ErrorNote = styled(Meta)`
  color: var(--ethora-color-danger, #c0392b);
`;

const Action = styled.span`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--ethora-color-text-secondary, #53575a);
`;

type CardState = 'idle' | 'working' | 'failed';

const SealedAttachmentCard: React.FC<{
  attachment: IAttachment;
  keyMaterial?: string;
}> = ({ attachment, keyMaterial }) => {
  const t = useT();
  const [state, setState] = useState<CardState>('idle');
  // Unknown until the file has been opened once: the real name lives inside
  // the seal, so there is nothing to show before the first download.
  const [name, setName] = useState<string>('');

  const canDownload = Boolean(keyMaterial && attachment.location);

  const handleDownload = useCallback(async () => {
    if (!canDownload || state === 'working') return;
    setState('working');
    try {
      const meta = await saveSealedAttachment(
        attachment.location as string,
        keyMaterial as string
      );
      setName(meta.originalname);
      setState('idle');
    } catch (error) {
      console.warn('sealed attachment could not be downloaded', error);
      setState('failed');
    }
  }, [attachment.location, canDownload, keyMaterial, state]);

  // No key means the message body never decrypted, so these bytes cannot be
  // opened on this device. Say that instead of offering a button that cannot
  // work.
  if (!canDownload) {
    return (
      <SealedCard as="div" title={t('media.sealedUnavailable')}>
        <IconBox>
          <LockIcon width={18} height={18} />
        </IconBox>
        <Details>
          <Name>{t('media.sealedFile')}</Name>
          <Meta>{t('media.sealedUnavailable')}</Meta>
        </Details>
      </SealedCard>
    );
  }

  const label =
    state === 'working'
      ? t('media.sealedDownloading')
      : name
        ? formatFileName(name, 20)
        : t('media.sealedFile');

  const size = formatFileSize(attachment.size);

  return (
    <SealedCard
      onClick={handleDownload}
      disabled={state === 'working'}
      title={name || t('media.sealedFile')}
      aria-label={t('media.sealedDownload')}
    >
      <IconBox>
        <LockIcon width={18} height={18} />
      </IconBox>
      <Details>
        <Name>{label}</Name>
        {state === 'failed' ? (
          <ErrorNote>{t('media.sealedDownloadFailed')}</ErrorNote>
        ) : (
          size && <Meta>{size}</Meta>
        )}
      </Details>
      <Action aria-hidden="true">
        <DownloadIcon width={18} height={18} />
      </Action>
    </SealedCard>
  );
};

/**
 * Sealed attachments, offered as downloads rather than previews.
 *
 * `keys` are positional: keys[i] opens attachments[i] (getDataFromXml lifts
 * them out of the OMEMO-decrypted <body>). An attachment with no key belongs
 * to a message we could not decrypt, and renders as unavailable.
 */
const SealedAttachmentList: React.FC<{
  attachments: IAttachment[];
  keys?: string[];
}> = ({ attachments, keys }) => (
  <SealedStack>
    {attachments.map((attachment, index) => (
      <SealedAttachmentCard
        key={attachment.attachmentId || attachment.location || index}
        attachment={attachment}
        keyMaterial={keys?.[index]}
      />
    ))}
  </SealedStack>
);

export default SealedAttachmentList;
