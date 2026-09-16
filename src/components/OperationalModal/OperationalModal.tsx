import React from 'react';
import styled from 'styled-components';
import QRCode from 'react-qr-code';
import SideDrawer, {
  DrawerCard,
  DrawerHint,
} from '../Modals/SideDrawer/SideDrawer';
import { StyledInput } from '../styled/StyledInputComponents/StyledInputComponents';
import Button from '../styled/Button';
import { buildChatShareLink } from '../../helpers/buildChatShareLink';
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

// The panel body is a tall flex column with exactly one child (this
// wrapper), so `margin: auto 0` centres the whole QR block in whatever
// vertical space is available instead of letting it pile up under the
// header with dead space below - the classic single-flex-child centring
// trick, and it degrades gracefully to top-anchored-plus-scroll on a short
// viewport where the content doesn't fit.
const QrCenterWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: auto 0;
  gap: var(--ethora-space-5, 20px);
`;

// One card, not two: the QR and the link are the same object (two ways to
// get to the same chat), so one bordered surface with a hairline between
// its two halves reads as a single deliberate unit rather than debris.
const QrCard = styled(DrawerCard)`
  width: 100%;
`;

const QrCodeSection = styled.div`
  display: flex;
  justify-content: center;
  padding: var(--ethora-space-6, 24px) var(--ethora-space-5, 20px);
`;

// A fixed, moderate size rather than "as big as the column allows": the
// code needs to stay scannable, not fill the card. Real margin on every
// side makes it read as an object sitting on the card's surface.
const QrCodeBox = styled.div`
  width: 176px;
`;

const QrLinkSection = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: var(--ethora-space-3, 12px);
  padding: var(--ethora-space-4, 16px) var(--ethora-space-5, 20px);
  border-top: 1px solid var(--ethora-color-border, #e6e8ec);
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

  if (!isVisible) return null;

  // The link is built by the shared helper: it prefers a host-provided
  // `config.qrUrl` and otherwise points back at THIS page. The old
  // fallback appended a hardcoded `/app/chat/` path to the origin, a
  // route most deployments do not serve, so the QR opened a blank page.
  const qrValue = buildChatShareLink(chatJid, config?.qrUrl);

  return (
    <QrPanelLayer>
      <SideDrawer
        title={t('modal.qr.title')}
        onClose={() => setVisible(false)}
        backLabel={t('action.close')}
      >
        <QrCenterWrapper>
          <QrCard>
            <QrCodeSection>
              <QrCodeBox>
                <QRCode
                  size={176}
                  style={{ width: '100%', height: 'auto' }}
                  value={qrValue}
                  viewBox="0 0 176 176"
                />
              </QrCodeBox>
            </QrCodeSection>

            <QrLinkSection>
              <StyledInput
                $colorBg={config?.colors?.colorInput}
                value={qrValue}
                readOnly
                aria-label={t('modal.qr.title')}
                style={{ width: '100%' }}
              />
              <Button
                text={t('action.copyLink')}
                onClick={() => handleCopyClick(qrValue)}
                variant="filled"
                style={{ width: '100%' }}
              />
            </QrLinkSection>
          </QrCard>

          <DrawerHint style={{ textAlign: 'center' }}>
            {t('modal.qr.hint')}
          </DrawerHint>
        </QrCenterWrapper>
      </SideDrawer>
    </QrPanelLayer>
  );
};

export default OperationalModal;
