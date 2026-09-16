import React from 'react';
import styled from 'styled-components';
import QRCode from 'react-qr-code';
import SideDrawer, {
  DrawerCard,
  DrawerCardBody,
  DrawerHint,
  DrawerSection,
} from '../Modals/SideDrawer/SideDrawer';
import { StyledInput } from '../styled/StyledInputComponents/StyledInputComponents';
import Button from '../styled/Button';
import { QRCODE_URL } from '../../helpers/constants/PLATFORM_CONSTANTS';
import { handleCopyClick } from '../../helpers/handleCopyClick';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';

/**
 * The chat's QR / share-link panel.
 *
 * It used to be a fixed, full-viewport overlay with a centred card, which put
 * it in a different visual language from every other panel reached out of the
 * chat profile AND covered the conversation. It is rendered from inside
 * `ChatProfileModal`'s `SideDrawer`, and the nearest positioned ancestor is
 * that drawer's panel (`position: relative; overflow: hidden`), so parking
 * this layer on `inset: 0` stacks it over the PROFILE COLUMN only, header
 * included: the room list and the chat stay exactly where they are. Its
 * containing block is the panel rather than the drawer's scrolling body, so
 * the body's `overflow-y: auto` does not clip it. Reusing `SideDrawer` also
 * gets the shared Escape/focus/accessible-name contract for free, and because
 * `useModalDismiss` stacks, Escape peels this panel off and leaves the profile
 * open underneath.
 *
 * NOTE: how the link itself is built (`config.qrUrl` / the current origin) is
 * deliberately untouched here - that is being fixed separately.
 */

// Stacks over the profile panel that renders this, not over the chat.
const QrPanelLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
`;

const QrFrame = styled.div`
  display: flex;
  justify-content: center;
  padding: var(--ethora-space-4, 16px);
  background-color: var(--ethora-color-bg, #fff);
`;

const QrCodeBox = styled.div`
  width: 100%;
  max-width: 240px;
`;

const QrLinkRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-2, 8px);
  width: 100%;
  min-width: 0;
`;

// The column is a fixed 400px, so the copy affordance has to promise not to
// wrap its label onto a second line and shove the link input to nothing.
const QrCopyAction = styled.div`
  flex: 0 0 auto;
  white-space: nowrap;
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
  const t = useT();
  // Prefer app-provided qrUrl; else build from the current origin so QA /
  // self-hosted deployments don't point QR codes at the prod default.
  const qrBase =
    config?.qrUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/app/chat/?chatId=`
      : QRCODE_URL);

  if (!isVisible) return null;

  const qrValue = `${qrBase}${chatJid.split('@')[0]}`;

  return (
    <QrPanelLayer>
      <SideDrawer
        title={t('modal.qr.title')}
        onClose={() => setVisible(false)}
        backLabel={t('action.close')}
      >
        <DrawerSection>
          <DrawerCard>
            <QrFrame>
              <QrCodeBox>
                <QRCode
                  size={256}
                  style={{ width: '100%', height: 'auto', maxWidth: '100%' }}
                  value={qrValue}
                  viewBox="0 0 256 256"
                />
              </QrCodeBox>
            </QrFrame>
          </DrawerCard>
        </DrawerSection>

        <DrawerSection>
          <DrawerCard>
            <DrawerCardBody>
              <QrLinkRow>
                <StyledInput
                  $colorBg={config?.colors?.colorInput}
                  value={qrValue}
                  readOnly
                  aria-label={t('modal.qr.title')}
                  style={{ flex: '1 1 auto', minWidth: 0 }}
                />
                <QrCopyAction>
                  <Button
                    text={t('action.copyLink')}
                    onClick={() => handleCopyClick(qrValue)}
                  />
                </QrCopyAction>
              </QrLinkRow>
              <DrawerHint>{t('modal.qr.hint')}</DrawerHint>
            </DrawerCardBody>
          </DrawerCard>
        </DrawerSection>
      </SideDrawer>
    </QrPanelLayer>
  );
};

export default OperationalModal;
