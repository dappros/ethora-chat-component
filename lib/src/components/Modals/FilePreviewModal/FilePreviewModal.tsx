import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { CenterContainer } from '../styledModalComponents';
import { PresenceModalContainerFullScreen } from '../motionVariants';
import { useIsModalExiting } from '../../../context/ModalTransitionContext';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomResetIcon,
} from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../styled/Button';
import { RootState, getActiveRoom } from '../../../roomStore';
import { FullScreenVideo } from '../../styled/VideoMessage';
import { setActiveFile } from '../../../roomStore/chatSettingsSlice';
import PdfViewer from './PdfView';
import ImageLightbox, {
  ImageLightboxHandle,
  MAX_SCALE,
  MIN_SCALE,
} from './ImageLightbox';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
  withFileToken,
} from '../../../helpers/secureFileUrl';
import { useT } from '../../../i18n/useT';
import { getFileExtension, getFileKind } from '../../../helpers/fileKind';
import {
  collectRoomImages,
  findGalleryIndex,
} from '../../../helpers/roomImageGallery';

const IMAGE_FALLBACK =
  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';

const Stage = styled.div`
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const NavButton = styled(Button)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: var(--ethora-radius-full, 999px);
  background-color: var(--ethora-color-bg, #fff);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  z-index: 2;
`;

const PreviousButton = styled(NavButton)`
  left: 8px;
`;

const NextButton = styled(NavButton)`
  right: 8px;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

/* Narrow screens are touch screens: pinch and double-tap already cover zoom,
   and four icon buttons plus the counter do not fit next to the title. */
const ZoomControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 480px) {
    display: none;
  }
`;

const PositionLabel = styled.span`
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text-secondary, #5a5f66);
  white-space: nowrap;
  padding: 0 4px;
`;

interface FilePreviewModalProps {
  handleCloseModal: any;
}

/**
 * Full-screen media viewer.
 *
 * Images get a real lightbox: previous/next across every image loaded for
 * the room (see helpers/roomImageGallery for exactly what that set is),
 * wheel/pinch zoom with bounded panning, double-click/double-tap to toggle
 * fit, arrow-key and swipe navigation. Video, PDF and unsupported files take
 * the same paths they always did and get no navigation chrome, so opening a
 * PDF is the experience it was before.
 *
 * Escape, initial focus and focus restore are NOT handled here: the modal
 * layer (Modals/Modal/Modal.tsx) already runs `useModalDismiss` around every
 * entry in MODAL_COMPONENTS, this one included. Adding a second Escape
 * listener would double-handle the key and fight that hook's focus restore,
 * so the only key listener below is for the arrows, and it explicitly leaves
 * every other key (Escape included) alone.
 */
const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  // Modal.tsx keeps this mounted for the exit animation's duration after
  // close; fade it out for that window instead of letting it just vanish.
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

  const lightboxRef = useRef<ImageLightboxHandle>(null);
  const [scale, setScale] = useState(MIN_SCALE);

  const kind = getFileKind(activeFile?.mimetype, activeFile?.fileName);

  const gallery = useMemo(() => collectRoomImages(roomMessages), [roomMessages]);
  // Only images page. A PDF/video/other file is simply not in the gallery,
  // so `index` is -1 and no navigation chrome renders for it.
  const index = useMemo(
    () => (kind === 'image' ? findGalleryIndex(gallery, activeFile) : -1),
    [gallery, activeFile, kind]
  );
  const hasGallery = index >= 0 && gallery.length > 1;
  const hasPrevious = hasGallery && index > 0;
  const hasNext = hasGallery && index < gallery.length - 1;

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
        })
      );
    },
    [dispatch, gallery]
  );

  const goPrevious = useCallback(() => {
    if (hasPrevious) goTo(index - 1);
  }, [goTo, hasPrevious, index]);

  const goNext = useCallback(() => {
    if (hasNext) goTo(index + 1);
  }, [goTo, hasNext, index]);

  // Arrows only. Escape stays with useModalDismiss at the modal layer.
  useEffect(() => {
    if (!hasGallery || typeof document === 'undefined') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      // Never steal an arrow key from a text field: the viewer can be opened
      // over surfaces that keep an editable element focused.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      if (event.key === 'ArrowLeft') {
        goPrevious();
      } else {
        goNext();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasGallery, goPrevious, goNext]);

  const saveClick = () => {
    fetch(withFileToken(activeFile.fileURL), {
      method: 'GET',
      headers: {},
    })
      .then((response) => {
        // The old code appended the whole file name as the extension for
        // anything that was not an image or video, so `report.pdf` saved as
        // `MEDIA-ETHORA.report.pdf`. Keep the user's own name when we have
        // one, and only synthesise an extension when we do not.
        const hasOwnExtension = !!getFileExtension(activeFile.fileName);
        const fallbackExtension =
          kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'bin';
        const downloadName = hasOwnExtension
          ? activeFile.fileName
          : `MEDIA-ETHORA.${fallbackExtension}`;

        response.arrayBuffer().then(function (buffer) {
          if (typeof window === 'undefined') {
            return;
          }
          const url = window.URL.createObjectURL(new Blob([buffer]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', downloadName);
          document.body.appendChild(link);
          link.click();
          // Both the node and the blob outlived every download before this.
          link.remove();
          window.URL.revokeObjectURL(url);
        });
      })
      .catch((err) => {
        ethoraLogger.log(err);
      });
  };

  const closeModal = () => {
    dispatch(setActiveFile(undefined));
    handleCloseModal?.();
  };

  const imageAlt = activeFile?.fileName || t('modal.filePreview.imageAlt');

  const getMediaComponent = useMemo(() => {
    switch (kind) {
      case 'image':
        return (
          <ImageLightbox
            ref={lightboxRef}
            src={
              appendFileToken(activeFile.fileURL, fileToken) || IMAGE_FALLBACK
            }
            alt={imageAlt}
            onScaleChange={setScale}
            onSwipeLeft={goNext}
            onSwipeRight={goPrevious}
            onError={(e) => {
              if (isSecureFileUrl(activeFile.fileURL)) {
                requestFileTokenRecovery();
              }
              (e.target as HTMLImageElement).src = IMAGE_FALLBACK;
            }}
          />
        );
      case 'video':
        return (
          <FullScreenVideo
            src={appendFileToken(activeFile.fileURL, fileToken)}
            controls
            autoPlay={false}
          />
        );
      case 'pdf':
        return (
          <PdfViewer pdfUrl={appendFileToken(activeFile.fileURL, fileToken)} />
        );
      default:
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <FileIcon style={{ minWidth: '100px', minHeight: '100px' }} />
            <div
              style={{
                backgroundColor: 'var(--ethora-color-bg-subtle, #F5F7FA)',
                borderRadius: 'var(--ethora-radius-lg, 16px)',
                display: 'flex',
                padding: '16px',
                color: 'var(--ethora-color-text, #141414)',
              }}
            >
              {t('modal.filePreview.unsupported')}
            </div>
          </div>
        );
    }
  }, [activeFile, fileToken, imageAlt, kind, goNext, goPrevious, t]);

  return (
    <PresenceModalContainerFullScreen
      aria-label={t('modal.filePreview.title')}
      $closing={isClosing}
    >
      <ModalHeaderComponent
        handleCloseModal={closeModal}
        headerTitle={t('modal.filePreview.title')}
        rightMenu={
          <HeaderControls>
            {hasGallery && (
              <PositionLabel data-testid="lightbox-position" aria-live="polite">
                {t('modal.filePreview.position', {
                  current: index + 1,
                  total: gallery.length,
                })}
              </PositionLabel>
            )}
            {kind === 'image' && (
              <ZoomControls>
                <Button
                  onClick={() => lightboxRef.current?.zoomOut()}
                  disabled={scale <= MIN_SCALE}
                  aria-label={t('modal.filePreview.zoomOut')}
                >
                  <ZoomOutIcon />
                </Button>
                <Button
                  onClick={() => lightboxRef.current?.zoomIn()}
                  disabled={scale >= MAX_SCALE}
                  aria-label={t('modal.filePreview.zoomIn')}
                >
                  <ZoomInIcon />
                </Button>
                <Button
                  onClick={() => lightboxRef.current?.reset()}
                  disabled={scale <= MIN_SCALE}
                  aria-label={t('modal.filePreview.resetZoom')}
                >
                  <ZoomResetIcon />
                </Button>
              </ZoomControls>
            )}
            <Button onClick={saveClick} aria-label={t('action.save')}>
              <SaveIcon />
            </Button>
          </HeaderControls>
        }
      />

      <CenterContainer
        style={{
          display: 'flex',
          flex: '1 1 auto',
          height: '100%',
          minHeight: 0,
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '16px',
          width: '90%',
        }}
      >
        <Stage>
          {hasGallery && (
            <PreviousButton
              onClick={goPrevious}
              disabled={!hasPrevious}
              aria-label={t('modal.filePreview.previousImage')}
            >
              <ChevronLeftIcon />
            </PreviousButton>
          )}
          {getMediaComponent}
          {hasGallery && (
            <NextButton
              onClick={goNext}
              disabled={!hasNext}
              aria-label={t('modal.filePreview.nextImage')}
            >
              <ChevronRightIcon />
            </NextButton>
          )}
        </Stage>
      </CenterContainer>
    </PresenceModalContainerFullScreen>
  );
};

export default FilePreviewModal;
