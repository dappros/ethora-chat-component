import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { IAttachment } from '../../types/types';
import { useT } from '../../i18n/useT';
import { DownloadIcon, LockIcon } from '../../assets/icons';
import { formatFileName, formatFileSize } from '../../helpers/fileKind';
import { saveSealedAttachment } from '../../helpers/sealedAttachments';
import {
  BackgroundFile,
  FileInformation,
  FileName,
  FileSize,
  FileSizeContainer,
  UnsupportedContainer,
} from '../styled/StyledInputComponents/MediaComponents';

const SealedStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SealedCard = styled(UnsupportedContainer)`
  min-width: 220px;
`;

const Action = styled.span`
  display: flex;
  align-items: center;
  color: var(--ethora-color-text-secondary, #53575a);
`;

const ErrorNote = styled.span`
  color: var(--ethora-color-danger, #c0392b);
  font-size: var(--ethora-font-size-sm, 13px);
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
        <BackgroundFile>
          <LockIcon />
        </BackgroundFile>
        <FileInformation>
          <FileName>{t('media.sealedUnavailable')}</FileName>
        </FileInformation>
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
      <BackgroundFile>
        <LockIcon />
      </BackgroundFile>
      <FileInformation>
        <FileName>{label}</FileName>
        {state === 'failed' ? (
          <ErrorNote>{t('media.sealedDownloadFailed')}</ErrorNote>
        ) : (
          size && (
            <FileSizeContainer>
              <FileSize>{size}</FileSize>
            </FileSizeContainer>
          )
        )}
      </FileInformation>
      <Action aria-hidden="true">
        <DownloadIcon />
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
