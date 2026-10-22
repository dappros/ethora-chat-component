import React, { CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { useAvatarImage } from '../../hooks/useAvatarImage';
import { safeImageUrl } from '../../helpers/safeUrl';

interface MessageAvatarPhotoProps {
  /** Sender photo URL; empty renders the initials circle alone. */
  src?: string | null;
  /** Display name, used for the initials. */
  username?: string;
  style?: CSSProperties;
}

/**
 * Sender avatar in a message bubble. The initials circle is always rendered
 * (no layout shift, nothing waits on the network); the photo is layered over
 * it and faded in once it has loaded. A photo that fails to load leaves the
 * initials, where the old bare <img> showed a broken-image glyph. A sender
 * with many bubbles shares one load through useAvatarImage's cache.
 */
export const MessageAvatarPhoto: React.FC<MessageAvatarPhotoProps> = ({
  src,
  username,
  style,
}) => {
  const image = useAvatarImage(src);
  const showImage = !!image.src && image.status !== 'failed';
  const loaded = image.status === 'loaded';

  if (!showImage) return <Avatar username={username} style={style} />;

  return (
    <div
      style={{
        position: 'relative',
        width: 'var(--ethora-message-avatar-size, 40px)',
        height: 'var(--ethora-message-avatar-size, 40px)',
      }}
    >
      {!loaded && <Avatar username={username} style={style} />}
      <img
        src={safeImageUrl(image.src)}
        alt="userIcon"
        // Already loaded this session: draw at once instead of flashing empty.
        loading={loaded ? 'eager' : 'lazy'}
        decoding={loaded ? 'sync' : 'async'}
        referrerPolicy="no-referrer"
        onLoad={image.onLoad}
        onError={image.onError}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 150ms ease',
          cursor: style?.cursor,
        }}
      />
    </div>
  );
};
