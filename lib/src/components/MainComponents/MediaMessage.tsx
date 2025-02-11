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
  message,
}) => {
  const getFilename = () => {
    return message.originalName || location?.split('/')?.pop() || 'MediaFile';
  };

  if (mimeType)
    switch (true) {
      case mimeType.startsWith('image/'):
        return (
          <CustomMessageImage
            fileName="image"
            fileURL={messageText}
            mimetype={mimeType}
          />
        );
      case mimeType.startsWith('video/'):
        return (
          <CustomMessageVideo
            fileName="image"
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
          />
        );
    }
  return <div>Unsupported media type</div>;
};

export default MediaMessage;
