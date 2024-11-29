import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { CloseButton } from '../Modals/styledModalComponents';
import { Overlay, StyledModal } from '../styled/MediaModal';
import { StyledInput } from '../styled/StyledInputComponents/StyledInputComponents';
import Button from '../styled/Button';

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
  const handleCopyClick = () => {
    navigator.clipboard.writeText(
      `https://beta.ethora.com/app/chat/${chatJid}`
    );
  };

  return (
    isVisible && (
      <Overlay
        style={{
          position: 'absolute',
        }}
      >
        <StyledModal
          style={{
            borderRadius: '16px',
            width: 'auto',
            height: 'auto',
            padding: '32px 64px',
            minWidth: '480px',
          }}
        >
          <CloseButton
            onClick={() => setVisible(false)}
            style={{ fontSize: 24 }}
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
                style={{
                  width: '100%',
                  height: '70%',
                  maxWidth: '100%',
                }}
                value={`https://beta.ethora.com/app/chat/${chatJid}`}
                viewBox={`0 0 256 256`}
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
                value={chatJid}
                disabled={true}
                style={{ width: '80%' }}
              />
              <Button text="Copy" onClick={handleCopyClick} />
            </div>
          </div>
        </StyledModal>
      </Overlay>
    )
  );
};

export default OperationalModal;
