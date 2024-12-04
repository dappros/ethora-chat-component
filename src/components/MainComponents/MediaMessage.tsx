import React from 'react';
import { IMessage } from '../../types/types';
import FileDownload from '../styled/UnsupportedType';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';

interface MediaMessageProps {
  mimeType?: string;
  message?: IMessage;
  location?: string;
  messageText?: string;
}

const MediaMessage: React.FC<MediaMessageProps> = ({
  mimeType,
  location,
  messageText,
}) => {
  if (mimeType)
    switch (true) {
      case mimeType.startsWith('image/'):
        return <CustomMessageImage imageAlt="image" imageUrl={messageText} />;
      case mimeType.startsWith('video/'):
        return <CustomMessageVideo videoUrl={location} />;
      case mimeType.startsWith('audio/') ||
        mimeType.includes('application/octet-stream'):
        return <AudioMessage src={location} />;
      default:
        return (
          <FileDownload
            fileUrl={location ? location : ''}
            fileName={location?.split('/')?.pop() || 'MediaFile'}
          />
        );
    }
  return <div>Unsupported media type</div>;
};

export default MediaMessage;
