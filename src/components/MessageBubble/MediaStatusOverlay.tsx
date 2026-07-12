import React from 'react';
import styled from 'styled-components';
import Loader from '../styled/Loader';
import { RedCross } from '../../assets/icons';

const OverlayContainer = styled.div`
  position: relative;
  display: inline-block;
  max-width: 100%;
`;

const Overlay = styled.div<{ $isError?: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $isError }) =>
    $isError ? 'rgba(220, 38, 38, 0.55)' : 'rgba(0, 0, 0, 0.35)'};
`;

interface MediaStatusOverlayProps {
  pending?: boolean;
  failed?: boolean;
  children: React.ReactNode;
}

// Wraps a media render (single message or one album tile) with a spinner
// while it's still uploading/sending, or an error badge if the send
// failed - media messages previously had no in-flight indicator at all.
export const MediaStatusOverlay: React.FC<MediaStatusOverlayProps> = ({
  pending,
  failed,
  children,
}) => (
  <OverlayContainer>
    {children}
    {pending && (
      <Overlay>
        <Loader size={28} color="#fff" />
      </Overlay>
    )}
    {failed && (
      <Overlay $isError title="Failed to send">
        <RedCross color="#fff" />
      </Overlay>
    )}
  </OverlayContainer>
);
