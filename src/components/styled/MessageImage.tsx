import React, { useEffect, useState } from 'react';
import {
  Container,
  MediaLoadingSkeleton,
} from './StyledInputComponents/MediaComponents';
import { useDispatch } from 'react-redux';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import {
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../helpers/secureFileUrl';

const NO_IMAGE_PLACEHOLDER =
  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';

interface CustomMessageImageProps {
  fileURL: string;
  fileName: string;
  mimetype: string;
  locationPreview?: string;
  /**
   * Called once the image is confirmed unreachable (a fresh fileToken
   * didn't help either) rather than just slow to load. The only known
   * cause in practice is the file having been deleted from the Files
   * panel without a matching message found locally to tombstone up front
   * (see FilesPanel.tsx's handleDelete) - the caller uses this to flip the
   * message to the normal "deleted" placeholder instead of leaving this
   * broken-image card on screen.
   */
  onUnavailable?: () => void;
}

type LoadState = 'loading' | 'recovering' | 'loaded' | 'failed';

const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
  onUnavailable,
}) => {
  const dispatch = useDispatch();

  // Preload off-DOM with a bare Image(), so the skeleton stays up for the
  // whole fetch and we only ever mount the visible <img> once the bytes are
  // already in the browser cache - a straight skeleton -> image swap, no
  // blank gap while it decodes and no layout double-booking from stacking
  // a hidden <img> under the skeleton.
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!locationPreview) {
      setState('loading');
      return;
    }
    setState('loading');
    let cancelled = false;
    const preloader = new Image();
    preloader.onload = () => {
      if (!cancelled) setState('loaded');
    };
    preloader.onerror = () => {
      if (cancelled) return;
      if (isSecureFileUrl(locationPreview)) {
        setState('recovering');
        // Expired fileToken: kick the refresh flow. On success the store
        // update produces a fresh `locationPreview` prop, which re-runs
        // this effect and retries; on failure we fall through to the
        // static placeholder.
        requestFileTokenRecovery().then((gotToken) => {
          if (cancelled || gotToken) return;
          setState('failed');
          onUnavailable?.();
        });
      } else {
        setState('failed');
        onUnavailable?.();
      }
    };
    preloader.src = locationPreview;
    return () => {
      cancelled = true;
    };
  }, [locationPreview, onUnavailable]);

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  if (!fileURL || state === 'loading' || state === 'recovering') {
    return (
      <Container>
        <MediaLoadingSkeleton $width={150} $height={200} />
      </Container>
    );
  }

  return (
    <Container>
      <img
        src={state === 'failed' ? NO_IMAGE_PLACEHOLDER : locationPreview}
        alt={fileName}
        onClick={state === 'failed' ? undefined : handleOpen}
        style={{
          borderRadius: 'var(--ethora-radius-lg, 16px)',
          cursor: state === 'failed' ? 'default' : 'pointer',
          maxWidth: '150px',
          maxHeight: '200px',
        }}
      />
    </Container>
  );
};

export default CustomMessageImage;
