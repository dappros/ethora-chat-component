import React from 'react';
import styled, { css } from 'styled-components';
import { useT } from '../../i18n/useT';
import type { MessageModeration } from '../../types/types';
import { isPersonalInfoCategory } from '../../helpers/moderation';
import { EyeOffIcon, PersonIcon, ShieldIcon } from './icons';

const baseStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: var(--ethora-radius-sm, 8px);
  background-color: var(--ethora-color-bg-subtle, rgba(140, 140, 140, 0.08));
  border: 1px dashed var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-style: italic;
  font-size: var(--ethora-font-size-sm, 13px);
  line-height: 1.45;
  text-align: left;
`;

const Base = styled.div`
  ${baseStyle}
`;

const Collapsed = styled.button`
  ${baseStyle}
  font-family: inherit;
  cursor: pointer;

  &:hover {
    color: var(--ethora-color-text-secondary, #555555);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

/** The collapsed text for a blurred message, by category. */
export const blurredLabelKey = (category?: string) =>
  isPersonalInfoCategory(category) ? 'ts.message.blurredPersonal' : 'ts.message.blurred';

interface ModeratedMessageProps {
  moderation: MessageModeration;
  /** Expands a blurred message; not used for a hidden one. */
  onExpand?: () => void;
}

/**
 * A message moderation blurred (collapsed, "Tap to view") or hid ("Message
 * hidden by moderators", no content). Deleted messages keep the existing
 * deleted rendering.
 */
export const ModeratedMessage: React.FC<ModeratedMessageProps> = ({
  moderation,
  onExpand,
}) => {
  const t = useT();
  if (moderation.action === 'hidden') {
    return (
      <Base data-testid="moderated-hidden" role="note">
        <ShieldIcon size={14} />
        <span>{t('ts.message.hidden')}</span>
      </Base>
    );
  }
  return (
    <Collapsed
      type="button"
      data-testid="moderated-blurred"
      onClick={(event) => {
        event.stopPropagation();
        onExpand?.();
      }}
    >
      <EyeOffIcon size={14} />
      <span>{t(blurredLabelKey(moderation.category))}</span>
    </Collapsed>
  );
};

const MaskedCircle = styled.div`
  width: var(--ethora-message-avatar-size, 40px);
  height: var(--ethora-message-avatar-size, 40px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

/** Neutral avatar for a sender whose name a suspension masked. */
export const MaskedSenderAvatar: React.FC = () => (
  <MaskedCircle data-testid="masked-sender-avatar" aria-hidden="true">
    <PersonIcon size={20} />
  </MaskedCircle>
);
