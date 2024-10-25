import React from 'react';
import styled from 'styled-components';
import { IMessage } from '../../types/types';
import FileDownload from '../styled/UnsupportedType';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';

interface MediaMessageProps {
  mimeType?: string;
  message?: IMessage;
  location?: string;
  messageText?: string;
}

const Audio = styled.audio`
  width: 300px;
`;

const MediaMessage: React.FC<MediaMessageProps> = ({
  mimeType,
  location,
  message,
  messageText,
}) => {
  if (mimeType)
    switch (true) {
      case mimeType.startsWith('image/'):
        return <CustomMessageImage imageAlt="image" imageUrl={messageText} />;
      case mimeType.startsWith('video/'):
        return <CustomMessageVideo videoUrl={location} />;
      case mimeType.startsWith('audio/'):
        return <Audio src={location} controls />;
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
