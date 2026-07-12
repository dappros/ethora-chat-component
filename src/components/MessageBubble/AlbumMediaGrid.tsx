import React from 'react';
import styled from 'styled-components';
import { IMessage } from '../../types/types';
import MediaMessage from '../MainComponents/MediaMessage';
import { MediaStatusOverlay } from './MediaStatusOverlay';

const GridContainer = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, 1fr);
  gap: 4px;
  max-width: 320px;
  border-radius: 12px;
  overflow: hidden;
`;

const GridTile = styled.div`
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;

  /* MessageImage/VideoMessage size themselves for a standalone bubble
     (maxWidth/maxHeight, or a fixed 300x200) - force-fill the square tile
     instead so several files line up into an even grid. */
  img,
  video {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: cover !important;
  }
`;

interface AlbumMediaGridProps {
  messages: IMessage[];
}

// Several media files sent together (see SendInput's albumId batching)
// render as one grid instead of N separate bubbles - only the first
// message of the group actually mounts this (see Message.tsx).
const AlbumMediaGrid: React.FC<AlbumMediaGridProps> = ({ messages }) => {
  const columns = Math.min(Math.max(messages.length, 1), 3);

  return (
    <GridContainer $columns={columns}>
      {messages.map((albumMessage) => (
        <GridTile key={albumMessage.id}>
          <MediaStatusOverlay
            pending={albumMessage.pending}
            failed={albumMessage.sendFailed}
          >
            <MediaMessage
              mimeType={albumMessage.mimetype}
              locationPreview={albumMessage.locationPreview}
              location={albumMessage.location}
              message={albumMessage}
            />
          </MediaStatusOverlay>
        </GridTile>
      ))}
    </GridContainer>
  );
};

export default AlbumMediaGrid;
