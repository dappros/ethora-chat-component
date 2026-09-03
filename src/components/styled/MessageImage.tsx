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
}

type LoadState = 'loading' | 'recovering' | 'loaded' | 'failed';

const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
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
          if (!cancelled && !gotToken) setState('failed');
        });
      } else {
        setState('failed');
      }
    };
    preloader.src = locationPreview;
    return () => {
      cancelled = true;
    };
  }, [locationPreview]);

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
          borderRadius: 16,
          cursor: state === 'failed' ? 'default' : 'pointer',
          maxWidth: '150px',
          maxHeight: '200px',
        }}
      />
    </Container>
  );
};

export default CustomMessageImage;
