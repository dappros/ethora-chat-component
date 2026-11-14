import React from 'react';
import styled, { css } from 'styled-components';
import { useT } from '../../i18n/useT';
import { safeImageUrl } from '../../helpers/safeUrl';
import { MEDIA_WIDTH_CSS } from '../../helpers/mediaBox';
import { EyeOffIcon, ShieldIcon } from './icons';
import { AgeDialog } from './AgeDialog';
import { RevealStatus, useSensitiveReveal } from '../../hooks/useSensitiveReveal';

const Cover = styled.button<{ $interactive: boolean; $fill?: boolean }>`
  position: relative;
  display: block;
  box-sizing: border-box;
  ${({ $fill }) =>
    $fill
      ? css`
          width: 100%;
          height: 100%;
          min-height: 200px;
        `
      : css`
          width: min(280px, ${MEDIA_WIDTH_CSS});
          max-width: 100%;
          aspect-ratio: 4 / 3;
        `}
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  isolation: isolate;
  border-radius: var(--ethora-radius-md, 12px);
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  color: var(--ethora-color-text, #141414);
  font: inherit;
  cursor: ${({ $interactive }) => ($interactive ? 'pointer' : 'default')};

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

// The preview is already blurred by the server; the CSS blur on top is a
// second line, so a preview generated before moderation is never sharp here.
const CoverImage = styled.img`
  position: absolute;
  inset: -12%;
  width: 124%;
  height: 124%;
  object-fit: cover;
  filter: blur(24px) saturate(0.9);
  transform: scale(1.05);
  z-index: 0;
`;

const Scrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  text-align: center;
  background: color-mix(in srgb, var(--ethora-color-bg, #ffffff) 55%, transparent);
  color: var(--ethora-color-text, #141414);
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: 600;
  line-height: 1.35;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ethora-color-bg, #ffffff);
  color: var(--ethora-color-text, #141414);
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.35));
`;

const Muted = styled.span`
  font-weight: 400;
  color: var(--ethora-color-text-secondary, #555555);
`;

const Notice = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--ethora-radius-sm, 8px);
  background-color: var(--ethora-color-bg-subtle, rgba(140, 140, 140, 0.08));
  border: 1px dashed var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-style: italic;
  font-size: var(--ethora-font-size-sm, 13px);
  line-height: 1.45;
`;

/** "Removed by moderators", in place of a file moderation hid. */
export const RemovedByModerators: React.FC = () => {
  const t = useT();
  return (
    <Notice data-testid="media-removed" role="note">
      <ShieldIcon size={14} />
      <span>{t('ts.media.removed')}</span>
    </Notice>
  );
};

interface SensitiveCoverProps {
  status: Exclude<RevealStatus, 'revealed' | 'removed'>;
  previewUrl?: string;
  onReveal: () => void;
  /** Fill the parent (the media viewer) instead of sizing itself. */
  fill?: boolean;
}

/**
 * The blurred stand-in for a sensitive file: the server's blurred preview, an
 * eye-off badge and "Sensitive content. Tap to view". A minor (or a refusal)
 * sees "This content is not available for your account." instead.
 */
export const SensitiveCover: React.FC<SensitiveCoverProps> = ({
  status,
  previewUrl,
  onReveal,
  fill,
}) => {
  const t = useT();
  const interactive = status === 'covered';
  const label =
    status === 'unavailable'
      ? t('ts.sensitive.unavailable')
      : status === 'checking'
        ? t('ts.sensitive.checking')
        : t('ts.sensitive.overlay');
  return (
    <Cover
      type="button"
      data-testid="sensitive-cover"
      data-state={status}
      $interactive={interactive}
      $fill={fill}
      aria-label={label}
      aria-disabled={interactive ? undefined : 'true'}
      aria-busy={status === 'checking' ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (interactive) onReveal();
      }}
    >
      {previewUrl && (
        <CoverImage src={safeImageUrl(previewUrl)} alt="" aria-hidden="true" draggable={false} />
      )}
      <Scrim>
        <Badge>
          <EyeOffIcon size={22} />
        </Badge>
        {status === 'unavailable' ? <Muted>{label}</Muted> : <span>{label}</span>}
      </Scrim>
    </Cover>
  );
};

const HideAgain = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  background: color-mix(in srgb, var(--ethora-color-bg, #ffffff) 85%, transparent);
  color: var(--ethora-color-text, #141414);
  font: inherit;
  font-size: var(--ethora-font-size-xs, 12px);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const RevealedWrap = styled.div`
  position: relative;
  min-width: 0;
  max-width: 100%;
`;

interface SensitiveMediaGateProps {
  messageId?: string;
  /** Original file asked about before revealing. */
  probeUrl?: string;
  /** Server-blurred preview, token already appended. */
  previewUrl?: string;
  /** What to show once revealed. */
  children: React.ReactNode;
  fill?: boolean;
}

/**
 * Wraps sensitive media: covered until the viewer taps and may see it, then
 * the media itself with a "Hide" control that blurs it again.
 */
export const SensitiveMediaGate: React.FC<SensitiveMediaGateProps> = ({
  messageId,
  probeUrl,
  previewUrl,
  children,
  fill,
}) => {
  const t = useT();
  const reveal = useSensitiveReveal({ messageId, probeUrl });

  if (reveal.status === 'removed') return <RemovedByModerators />;

  if (reveal.status === 'revealed') {
    return (
      <RevealedWrap data-testid="sensitive-revealed" style={fill ? { width: '100%', height: '100%' } : undefined}>
        {children}
        <HideAgain
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            reveal.conceal();
          }}
          aria-label={t('ts.sensitive.hideAgain')}
          title={t('ts.sensitive.hideAgain')}
        >
          <EyeOffIcon size={14} />
          <span>{t('ts.sensitive.hide')}</span>
        </HideAgain>
      </RevealedWrap>
    );
  }

  return (
    <>
      <SensitiveCover
        status={reveal.status}
        previewUrl={previewUrl}
        onReveal={reveal.requestReveal}
        fill={fill}
      />
      {reveal.dialogOpen && (
        <AgeDialog onCancel={reveal.onAgeCancel} onDeclared={reveal.onAgeDeclared} />
      )}
    </>
  );
};

export default SensitiveMediaGate;
