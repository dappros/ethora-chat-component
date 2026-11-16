import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import { useT } from '../../i18n/useT';
import { safeImageUrl } from '../../helpers/safeUrl';
import { MEDIA_WIDTH_CSS, SoloBox } from '../../helpers/mediaBox';
import { MediaCoverContext, MediaCoverState } from './mediaCover';
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

// The covered media itself, in its real layout, under the cover button: the
// box is the one the revealed media will have.
const InPlace = styled.div`
  position: relative;
  min-width: 0;
  max-width: 100%;
  border-radius: var(--ethora-radius-md, 12px);
  overflow: hidden;
`;

const InPlaceMedia = styled.div`
  pointer-events: none;
  user-select: none;
`;

const InPlaceButton = styled.button<{ $interactive: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: ${({ $interactive }) => ($interactive ? 'pointer' : 'default')};

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

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
  /** The viewer sent it: covered, but revealed on tap without an age check. */
  own?: boolean;
  /**
   * The same media as `children`, laid out the same way, for the covered
   * state (drawn from the blurred previews). With it the cover takes exactly
   * the box of the revealed media; without it a fixed 4:3 cover is shown.
   */
  cover?: React.ReactNode;
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
  own,
  cover,
}) => {
  const t = useT();
  const reveal = useSensitiveReveal({ messageId, probeUrl, own });

  // One box for both states (mediaCover.ts). Until the first switch the
  // covered picture may still settle (4:3, then the preview's ratio); at the
  // first reveal or hide its box is frozen and reused both ways after that.
  const latest = useRef<SoloBox | null>(null);
  const [lockedSolo, setLockedSolo] = useState<SoloBox | null>(null);
  const revealed = reveal.status === 'revealed';
  const lastRevealed = useRef(revealed);
  useEffect(() => {
    if (lastRevealed.current !== revealed) {
      lastRevealed.current = revealed;
      if (!lockedSolo && latest.current) setLockedSolo(latest.current);
    }
  }, [revealed, lockedSolo]);
  const onSoloBox = useCallback((box: SoloBox, placeholder: boolean) => {
    // Revealed media of unknown size passes through the 4:3 placeholder
    // before it decodes: only a real size counts there.
    if (placeholder && lastRevealed.current) return;
    latest.current = box;
  }, []);
  const coveredCtx = useMemo<MediaCoverState>(() => ({ covered: true, lockedSolo, onSoloBox }), [lockedSolo, onSoloBox]);
  const revealedCtx = useMemo<MediaCoverState>(() => ({ covered: false, lockedSolo, onSoloBox }), [lockedSolo, onSoloBox]);

  if (reveal.status === 'removed') return <RemovedByModerators />;

  if (reveal.status === 'revealed') {
    return (
      <RevealedWrap data-testid="sensitive-revealed" style={fill ? { width: '100%', height: '100%' } : undefined}>
        <MediaCoverContext.Provider value={revealedCtx}>{children}</MediaCoverContext.Provider>
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

  const dialog = reveal.dialogOpen && (
    <AgeDialog onCancel={reveal.onAgeCancel} onDeclared={reveal.onAgeDeclared} />
  );

  if (cover && !fill) {
    const interactive = reveal.status === 'covered';
    const label =
      reveal.status === 'unavailable'
        ? t('ts.sensitive.unavailable')
        : reveal.status === 'checking'
          ? t('ts.sensitive.checking')
          : t('ts.sensitive.overlay');
    return (
      <>
        <InPlace data-testid="sensitive-in-place">
          <InPlaceMedia aria-hidden="true" {...{ inert: '' }}>
            <MediaCoverContext.Provider value={coveredCtx}>{cover}</MediaCoverContext.Provider>
          </InPlaceMedia>
          <InPlaceButton
            type="button"
            data-testid="sensitive-cover"
            data-state={reveal.status}
            $interactive={interactive}
            aria-label={label}
            aria-disabled={interactive ? undefined : 'true'}
            aria-busy={reveal.status === 'checking' ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (interactive) reveal.requestReveal();
            }}
          >
            {previewUrl && (
              <CoverImage src={safeImageUrl(previewUrl)} alt="" aria-hidden="true" draggable={false} />
            )}
            <Scrim>
              <Badge>
                <EyeOffIcon size={22} />
              </Badge>
              {reveal.status === 'unavailable' ? <Muted>{label}</Muted> : <span>{label}</span>}
            </Scrim>
          </InPlaceButton>
        </InPlace>
        {dialog}
      </>
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
