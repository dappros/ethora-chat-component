import React, { useEffect } from 'react';
import styled from 'styled-components';
import QRCode from 'react-qr-code';
import { CloseButton } from '../Modals/styledModalComponents';
import { Overlay, StyledModal } from '../styled/MediaModal';
import { StyledInput } from '../styled/StyledInputComponents/StyledInputComponents';
import Button from '../styled/Button';
import { buildChatShareLink } from '../../helpers/buildChatShareLink';
import { handleCopyClick } from '../../helpers/handleCopyClick';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { fadeInAnimation, scaleInAnimation } from '../../styles/motion';

// Local wrappers (not shared) so the modal picks up the token-driven radius/
// shadow and an entrance animation without touching the shared MediaModal
// primitives, which other modal surfaces also consume as-is.
const AnimatedOverlay = styled(Overlay)`
  background-color: rgba(16, 24, 40, 0.45);
  ${fadeInAnimation}
`;

const AnimatedModal = styled(StyledModal)`
  border-radius: var(--ethora-radius-lg, 16px);
  box-shadow: var(--ethora-shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.18));
  background: var(--ethora-color-bg, #fff);
  ${scaleInAnimation}
`;

interface OperationalModalProps {
  isVisible: boolean;
  chatJid: string;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

const OperationalModal: React.FC<OperationalModalProps> = ({
  isVisible,
  chatJid,
  setVisible,
}) => {
  const { config } = useChatSettingState();
  // Prefer an app-provided qrUrl; otherwise point the link back at THIS
  // page. The previous fallback appended a hard-coded `/app/chat/` path to
  // the origin, which is a route most deployments (including this repo's
  // own dev harness) do not serve - the QR then opened a blank page.
  const shareLink = buildChatShareLink(chatJid, config?.qrUrl);

  useEffect(() => {
    const { overflow } = document.body.style;
    if (isVisible) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isVisible]);

  return (
    isVisible && (
      <AnimatedOverlay
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
        }}
      >
        <AnimatedModal
          style={{
            width: 'auto',
            height: 'auto',
            padding: '32px 64px',
            minWidth: '480px',
          }}
        >
          <CloseButton
            onClick={() => setVisible(false)}
            style={{
              fontSize: 24,
              width: '36px',
              height: '36px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            &times;
          </CloseButton>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '70%', position: 'relative' }}>
              <QRCode
                size={256}
                style={{ width: '100%', height: '70%', maxWidth: '100%' }}
                value={shareLink}
                viewBox="0 0 256 256"
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                minWidth: '400px',
              }}
            >
              <StyledInput
                $colorBg={config?.colors?.colorInput}
                value={shareLink}
                disabled
                style={{ width: '80%' }}
              />
              <Button
                text="Copy"
                onClick={() =>
                  handleCopyClick(shareLink)
                }
              />
            </div>
          </div>
        </AnimatedModal>
      </AnimatedOverlay>
    )
  );
};

export default OperationalModal;
