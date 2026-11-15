import React from 'react';
import styled from 'styled-components';
import { useT } from '../../i18n/useT';
import { InputContainer } from '../styled/StyledInputComponents/StyledInputComponents';

/** Stable test ids for the suspended-account badge and notice. */
export const SuspendedPeerTestIds = {
  badge: 'suspended_peer_badge',
  notice: 'suspended_peer_notice',
} as const;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 100%;
  padding: 1px 6px;
  border-radius: var(--ethora-radius-full, 999px);
  background-color: var(--ethora-color-bg-subtle, rgba(140, 140, 140, 0.12));
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-family: var(--ethora-font-family, inherit);
  font-size: var(--ethora-font-size-xs, 11px);
  font-style: normal;
  font-weight: var(--ethora-font-weight-medium, 500);
  line-height: 16px;
  white-space: nowrap;
  vertical-align: middle;
`;

/**
 * The small "Suspended" pill that follows the name of a suspended account
 * (message headers, member lists, the profile, the room list). It says
 * only that: never why, never until when.
 */
export const SuspendedBadge: React.FC<{ style?: React.CSSProperties }> = ({
  style,
}) => {
  const t = useT();
  return (
    <Badge
      data-testid={SuspendedPeerTestIds.badge}
      title={t('user.suspendedAccount')}
      style={style}
    >
      {t('peer.suspended.badge')}
    </Badge>
  );
};

const NoticeText = styled.p`
  margin: 0;
  text-align: center;
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-family: var(--ethora-font-family, inherit);
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: 1.45;
`;

/**
 * Takes the composer's place in a 1:1 chat whose other member is
 * suspended. Same container as the composer, so the pane keeps its shape.
 */
export const SuspendedPeerNotice: React.FC = () => {
  const t = useT();
  return (
    <InputContainer role="status" data-testid={SuspendedPeerTestIds.notice}>
      <NoticeText>{t('peer.suspended.notice')}</NoticeText>
    </InputContainer>
  );
};

/** Greys an avatar out: a suspended account cannot answer. */
export const suspendedAvatarStyle: React.CSSProperties = {
  filter: 'grayscale(1)',
  opacity: 0.55,
};
