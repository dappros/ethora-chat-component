import { downloadFile } from '../../../helpers/downloadFile';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useIsModalExiting } from '../../../context/ModalTransitionContext';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomResetIcon,
} from '../../../assets/icons';
import { RootState, getActiveRoom } from '../../../roomStore';
import { FullScreenVideo } from '../../styled/VideoMessage';
import { setActiveFile } from '../../../roomStore/chatSettingsSlice';
import PdfViewer from './PdfView';
import ImageLightbox, {
  ImageLightboxHandle,
  MAX_SCALE,
  MIN_SCALE,
} from './ImageLightbox';
import { MessageAvatarPhoto } from '../../MessageBubble/MessageAvatarPhoto';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
  withFileToken,
} from '../../../helpers/secureFileUrl';
import { useT } from '../../../i18n/useT';
import {
  FileKind,
  getFileExtension,
  getFileKind,
} from '../../../helpers/fileKind';
import {
  collectRoomMedia,
  findGalleryIndex,
  galleryFromFiles,
} from '../../../helpers/roomImageGallery';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import {
  ActionGroup,
  AudioCard,
  BottomBar,
  ControlRow,
  Counter,
  ErrorPanel,
  ExternalLinkGlyph,
  FileCard,
  IconButton,
  MediaFrame,
  NavButton,
  SenderName,
  SenderText,
  Stage,
  SubLine,
  Thumb,
  ThumbImage,
  ThumbPlayBadge,
  ThumbVideoGlyph,
  ThumbStrip,
  TopBar,
  TopIdentity,
  ViewerSurface,
  ZoomGroup,
  formatViewerDate,
  withRetryMarker,
} from './ViewerChrome';

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  const tag = element?.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(element?.isContentEditable)
  );
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], [tabindex]:not([tabindex="-1"])';

interface FilePreviewModalProps {
  handleCloseModal: any;
}

/**
 * Full-screen media viewer.
 *
 * Images get a real lightbox: previous/next across every image loaded for
 * the room (see helpers/roomImageGallery for exactly what that set is),
 * a thumbnail strip, wheel/pinch zoom with bounded panning, double-click or
 * double-tap to toggle fit, arrow and swipe navigation, and a blurred
 * low-resolution stand-in while the full picture loads. Video, audio, PDF and
 * other files each get their own view; none of them get gallery chrome.
 *
 * Escape and initial focus are handled by useModalDismiss at the modal layer
 * (Modals/Modal/ModalContent.tsx), which also restores focus to the opener on
 * close. This component adds the Tab trap and the arrow and zoom keys, and it
 * leaves Escape alone so the key is not handled twice.
 */
const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  // Modal.tsx keeps this mounted for the exit animation's duration after
  // close; the surface plays its own exit for that window.
  const isClosing = useIsModalExiting();
  const { activeFile: openedFile } = useSelector(
    (state: RootState) => state.chatSettingStore
  );
  // The modal only mounts with a file selected, but the store type allows
  // none (closing clears it), and every read below used to assume otherwise.
  // An empty stand-in falls through to the "unsupported file" branch instead
  // of throwing on `activeFile.mimetype`.
  const activeFile = useMemo(
    () => openedFile ?? { fileName: '', fileURL: '', mimetype: '' },
    [openedFile]
  );
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );
  const roomMessages = useSelector(
    (state: RootState) => getActiveRoom(state)?.messages
  );

  const surfaceRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<ImageLightboxHandle>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [scale, setScale] = useState(MIN_SCALE);
  // The URL whose image failed to load, and the retry count for it. Keyed by
  // URL so moving to another picture never inherits an error or a retry.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ url: string; count: number } | null>(
    null
  );

  const kind: FileKind = getFileKind(activeFile?.mimetype, activeFile?.fileName);

  const roomGallery = useMemo(() => collectRoomMedia(roomMessages), [roomMessages]);
  const siblings = activeFile.siblings;
  // The room's loaded messages are the gallery. When the opened file is not
  // among them (an album whose message is outside the loaded window), the
  // list the opener passed along is used instead, so paging still works.
  const gallery = useMemo(() => {
    if (findGalleryIndex(roomGallery, activeFile) >= 0) return roomGallery;
    const fromSiblings = galleryFromFiles(siblings);
    return findGalleryIndex(fromSiblings, activeFile) >= 0
      ? fromSiblings
      : roomGallery;
  }, [roomGallery, siblings, activeFile]);
  // Images and videos page. A PDF/audio/other file is simply not in the
  // gallery, so `index` is -1 and no navigation chrome renders for it.
  const index = useMemo(
    () =>
      kind === 'image' || kind === 'video'
        ? findGalleryIndex(gallery, activeFile)
        : -1,
    [gallery, activeFile, kind]
  );
  const hasGallery = index >= 0 && gallery.length > 1;
  const hasPrevious = hasGallery && index > 0;
  const hasNext = hasGallery && index < gallery.length - 1;

  // The gallery entry carries the sender, date and low-res copy. A file opened
  // outside the gallery has none of them and shows its name alone.
  const current = index >= 0 ? gallery[index] : undefined;
  const displayName = current?.fileName || activeFile.fileName;
  const senderName = useMemo(() => {
    const sender = current?.sender;
    if (!sender) return '';
    const fullName = [sender.firstName, sender.lastName]
      .filter(Boolean)
      .join(' ');
    return fullName || sender.username || '';
  }, [current]);
  const dateText = formatViewerDate(current?.date);

  const hasSource = Boolean(activeFile.fileURL);
  const imageFailed =
    kind === 'image' && (!hasSource || failedUrl === activeFile.fileURL);

  const imageSrc = useMemo(() => {
    const base = appendFileToken(activeFile.fileURL, fileToken);
    if (retry?.url === activeFile.fileURL) {
      return withRetryMarker(base, retry.count);
    }
    return base;
  }, [activeFile.fileURL, fileToken, retry]);

  const previewSrc = current?.previewURL
    ? appendFileToken(current.previewURL, fileToken)
    : undefined;

  const goTo = useCallback(
    (nextIndex: number) => {
      const target = gallery[nextIndex];
      if (!target) return;
      // Dispatching the same shape the message bubbles dispatch keeps every
      // downstream behaviour identical for the next image: the `?ft=` token
      // is re-appended from the live fileToken below, and the download
      // action reads the newly active file.
      dispatch(
        setActiveFile({
          fileName: target.fileName,
          fileURL: target.fileURL,
          mimetype: target.mimetype,
          // Keep the opener's list so paging never loses it.
          siblings,
        })
      );
    },
    [dispatch, gallery, siblings]
  );

  const goPrevious = useCallback(() => {
    if (hasPrevious) goTo(index - 1);
  }, [goTo, hasPrevious, index]);

  const goNext = useCallback(() => {
    if (hasNext) goTo(index + 1);
  }, [goTo, hasNext, index]);

  // Warm the neighbours so the next arrow press lands on a decoded picture.
  useEffect(() => {
    if (!hasGallery || typeof Image === 'undefined') return;
    [index - 1, index + 1].forEach((neighbour) => {
      const entry = gallery[neighbour];
      if (!entry || entry.kind !== 'image') return;
      const src = appendFileToken(entry.fileURL, fileToken);
      if (src) new Image().src = src;
    });
  }, [hasGallery, index, gallery, fileToken]);

  // Keep the active thumbnail in view when the picture changes.
  useEffect(() => {
    if (!hasGallery) return;
    const thumb = thumbRefs.current[index];
    thumb?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [hasGallery, index]);

  // The page behind the viewer must not scroll while it is open.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Arrows navigate the gallery; + / - / 0 drive the image zoom. Escape stays
  // with useModalDismiss at the modal layer.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // Never steal a key from a text field the viewer may sit above.
      if (isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (!hasGallery) return;
        // Arrows seek inside a focused video or audio player.
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'VIDEO' || tag === 'AUDIO') return;
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
          goPrevious();
        } else {
          goNext();
        }
        return;
      }

      if (kind !== 'image' || imageFailed) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        lightboxRef.current?.zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        lightboxRef.current?.zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        lightboxRef.current?.reset();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasGallery, goPrevious, goNext, kind, imageFailed]);

  const saveClick = () => {
    // The old code appended the whole file name as the extension for
    // anything that was not an image or video, so `report.pdf` saved as
    // `MEDIA-ETHORA.report.pdf`. Keep the user's own name when we have
    // one, and only synthesise an extension when we do not.
    const hasOwnExtension = !!getFileExtension(activeFile.fileName);
    const fallbackExtension =
      kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'bin';
    const name = hasOwnExtension
      ? activeFile.fileName
      : `MEDIA-ETHORA.${fallbackExtension}`;

    downloadFile(withFileToken(activeFile.fileURL), name).catch((err) => {
      ethoraLogger.log(err);
    });
  };

  const openInNewTab = () => {
    if (!hasSource) return;
    window.open(
      withFileToken(activeFile.fileURL),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const closeModal = () => {
    dispatch(setActiveFile(undefined));
    handleCloseModal?.();
  };

  // A press on the empty backdrop closes; a press on anything inside the
  // stage (the picture, the arrows, the video) is that element's own business.
  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeModal();
  };

  const handleImageError = () => {
    if (isSecureFileUrl(activeFile.fileURL)) {
      void requestFileTokenRecovery();
    }
    setFailedUrl(activeFile.fileURL);
  };

  const tryAgain = () => {
    setRetry({
      url: activeFile.fileURL,
      count: (retry?.url === activeFile.fileURL ? retry.count : 0) + 1,
    });
    setFailedUrl(null);
  };

  // Tab stays inside the viewer. Focus starts inside (useModalDismiss), so
  // wrapping between the first and last control is enough.
  const onSurfaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !surfaceRef.current) return;
    const focusable = Array.from(
      surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const outside = !active || !surfaceRef.current.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  const imageAlt = activeFile.fileName || t('modal.filePreview.imageAlt');
  const unsupportedText = t('modal.filePreview.unsupported');
  const sourceURL = appendFileToken(activeFile.fileURL, fileToken);

  let media: React.ReactNode;
  let mediaFit: 'media' | 'content' = 'media';
  if (imageFailed) {
    mediaFit = 'content';
    media = <ErrorPanel onRetry={tryAgain} onDownload={saveClick} />;
  } else {
    switch (kind) {
      case 'image':
        media = (
          <ImageLightbox
            ref={lightboxRef}
            src={imageSrc}
            previewSrc={previewSrc}
            alt={imageAlt}
            loadingLabel={t('modal.filePreview.loading')}
            onScaleChange={setScale}
            onSwipeLeft={goNext}
            onSwipeRight={goPrevious}
            onError={handleImageError}
          />
        );
        break;
      case 'video':
        media = (
          <FullScreenVideo
            key={sourceURL}
            src={sourceURL}
            controls
            autoPlay={false}
          />
        );
        break;
      case 'audio':
        mediaFit = 'content';
        media = <AudioCard fileName={displayName} src={sourceURL} />;
        break;
      case 'pdf':
        media = <PdfViewer pdfUrl={sourceURL} />;
        break;
      default:
        mediaFit = 'content';
        media = (
          <FileCard
            fileName={displayName}
            unsupportedText={unsupportedText}
            onDownload={saveClick}
          />
        );
    }
  }

  const showImageControls = kind === 'image' && !imageFailed;

  return (
    <ViewerSurface
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('modal.filePreview.title')}
      data-testid="file-viewer"
      $closing={isClosing}
      onKeyDown={onSurfaceKeyDown}
    >
      <TopBar>
        <TopIdentity>
          {current?.sender && (
            <MessageAvatarPhoto
              src={current.sender.photo}
              username={senderName || current.sender.username}
            />
          )}
          <SenderText>
            {senderName && <SenderName>{senderName}</SenderName>}
            <SubLine>
              {[dateText, displayName].filter(Boolean).join(' · ') ||
                t('modal.filePreview.title')}
            </SubLine>
          </SenderText>
        </TopIdentity>
        <ActionGroup>
          <IconButton
            type="button"
            onClick={saveClick}
            aria-label={t('action.save')}
            title={t('action.save')}
          >
            <SaveIcon color="currentColor" />
          </IconButton>
          <IconButton
            type="button"
            onClick={openInNewTab}
            disabled={!hasSource}
            aria-label={t('modal.filePreview.openExternally')}
            title={t('modal.filePreview.openExternally')}
          >
            <ExternalLinkGlyph />
          </IconButton>
          <IconButton
            type="button"
            onClick={closeModal}
            aria-label={t('modal.filePreview.close')}
            title={t('modal.filePreview.close')}
          >
            <CloseIcon color="currentColor" width={20} height={20} />
          </IconButton>
        </ActionGroup>
      </TopBar>

      <Stage onClick={onStageClick} data-testid="file-viewer-stage">
        {hasGallery && (
          <NavButton
            type="button"
            $side="left"
            onClick={goPrevious}
            disabled={!hasPrevious}
            aria-label={t('modal.filePreview.previousImage')}
          >
            <ChevronLeftIcon color="currentColor" />
          </NavButton>
        )}
        <MediaFrame $fit={mediaFit}>{media}</MediaFrame>
        {hasGallery && (
          <NavButton
            type="button"
            $side="right"
            onClick={goNext}
            disabled={!hasNext}
            aria-label={t('modal.filePreview.nextImage')}
          >
            <ChevronRightIcon color="currentColor" />
          </NavButton>
        )}
      </Stage>

      <BottomBar>
        {hasGallery && (
          <ThumbStrip
            role="group"
            aria-label={t('modal.filePreview.thumbnails')}
            data-testid="file-viewer-thumbnails"
          >
            {gallery.map((item, i) => (
              <Thumb
                key={item.key}
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                type="button"
                $active={i === index}
                aria-label={t('modal.filePreview.showImage', {
                  current: i + 1,
                  total: gallery.length,
                })}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              >
                {item.kind === 'video' && !item.previewURL ? (
                  <ThumbVideoGlyph />
                ) : (
                  <ThumbImage
                    src={appendFileToken(
                      item.previewURL || item.fileURL,
                      fileToken
                    )}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                )}
                {item.kind === 'video' && <ThumbPlayBadge />}
              </Thumb>
            ))}
          </ThumbStrip>
        )}
        <ControlRow>
          <span />
          {hasGallery ? (
            <Counter data-testid="lightbox-position" aria-live="polite">
              {t('modal.filePreview.position', {
                current: index + 1,
                total: gallery.length,
              })}
            </Counter>
          ) : (
            <span />
          )}
          {showImageControls ? (
            <ZoomGroup>
              <IconButton
                type="button"
                onClick={() => lightboxRef.current?.zoomOut()}
                disabled={scale <= MIN_SCALE}
                aria-label={t('modal.filePreview.zoomOut')}
              >
                <ZoomOutIcon color="currentColor" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => lightboxRef.current?.zoomIn()}
                disabled={scale >= MAX_SCALE}
                aria-label={t('modal.filePreview.zoomIn')}
              >
                <ZoomInIcon color="currentColor" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => lightboxRef.current?.reset()}
                disabled={scale <= MIN_SCALE}
                aria-label={t('modal.filePreview.resetZoom')}
              >
                <ZoomResetIcon color="currentColor" />
              </IconButton>
            </ZoomGroup>
          ) : (
            <span />
          )}
        </ControlRow>
      </BottomBar>
    </ViewerSurface>
  );
};

export default FilePreviewModal;
