import React from 'react';
import { useSelector } from 'react-redux';
import { IMessage } from '../../types/types';
import { RootState } from '../../roomStore';
import FileDownload from '../styled/UnsupportedType';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';
import { appendFileToken } from '../../helpers/secureFileUrl';

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

  const getFilename = () => {
    return (
      message.originalName || rawLocation?.split('/')?.pop() || 'MediaFile'
    );
  };

  if (mimeType)
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
  return <div>Unsupported media type</div>;
};

export default MediaMessage;
