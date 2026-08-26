import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { IMessage } from '../../types/types';
import { RootState } from '../../roomStore';
import FileDownload from '../styled/UnsupportedType';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../helpers/secureFileUrl';
import { MediaLoadingSkeleton } from '../styled/StyledInputComponents/MediaComponents';

interface MediaMessageProps {
  mimeType?: string;
  message?: IMessage;
  location?: string;
  locationPreview?: string;
}

const MediaMessage: React.FC<MediaMessageProps> = ({
  mimeType,
  location: rawLocation,
  locationPreview: rawLocationPreview,
  message,
}) => {
  // Secure (v2) file URLs are membership-gated: append the viewer's own
  // fileToken at render time. Public (v1) URLs pass through untouched.
  // Subscribed via useSelector so a token refresh re-renders the media
  // with a fresh URL (recovering images that failed on an expired token).
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );
  const location = appendFileToken(rawLocation, fileToken);
  const locationPreview = appendFileToken(rawLocationPreview, fileToken);

  // In a freshly reloaded tab the fileToken arrives only after the first
  // token rotation, so a secure URL rendered immediately would 403 and the
  // media flashed the "no image" placeholder before recovering. Hold the
  // loading skeleton instead and kick the rotation ourselves; if no rotation
  // is possible (refresh disabled, no session) fall through and render the
  // tokenless URL so the failure stays visible rather than an eternal
  // skeleton.
  const needsFileToken =
    isSecureFileUrl(rawLocation) || isSecureFileUrl(rawLocationPreview);
  const [tokenRecoveryFailed, setTokenRecoveryFailed] = useState(false);
  const waitingForFileToken =
    needsFileToken && !fileToken && !tokenRecoveryFailed;

  useEffect(() => {
    if (!needsFileToken || fileToken) return;
    let cancelled = false;
    requestFileTokenRecovery().then((gotToken) => {
      if (!cancelled && !gotToken) setTokenRecoveryFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [needsFileToken, fileToken]);

  const getFilename = () => {
    return (
      message.originalName || rawLocation?.split('/')?.pop() || 'MediaFile'
    );
  };

  if (mimeType) {
    if (waitingForFileToken) {
      if (mimeType.startsWith('image/')) {
        return <MediaLoadingSkeleton $width={150} $height={200} />;
      }
      if (mimeType.startsWith('video/')) {
        return <MediaLoadingSkeleton $width={300} $height={200} />;
      }
      // Audio and generic files fetch on interaction, and their download
      // path signs the URL at click time (withFileToken) - render them.
    }
    switch (true) {
      case mimeType.startsWith('image/'):
        return (
          <CustomMessageImage
            fileName={message.originalName}
            fileURL={location}
            mimetype={mimeType}
            locationPreview={locationPreview}
          />
        );
      case mimeType.startsWith('video/'):
        return (
          <CustomMessageVideo
            fileName={message.originalName}
            fileURL={location}
            mimetype={mimeType}
          />
        );
      case mimeType.startsWith('audio/') ||
        mimeType.includes('application/octet-stream'):
        return <AudioMessage src={location} />;
      default:
        return (
          <FileDownload
            fileURL={location ? location : ''}
            fileName={getFilename()}
            mimetype={mimeType}
            size={message.size}
            locationPreview={locationPreview}
          />
        );
    }
  }
  return <div>Unsupported media type</div>;
};

export default MediaMessage;
