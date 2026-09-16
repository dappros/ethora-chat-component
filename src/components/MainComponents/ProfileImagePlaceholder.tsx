import React, { useEffect, useMemo, useState } from 'react';
import { EditIcon } from '../../assets/icons';
import {
  AvatarCircle,
  AvatarImage,
  FileInput,
  Overlay,
  RemoveButton,
  Wrapper,
} from '../styled/StyledComponents';
import { nameToColor } from '../../helpers/hashcolor';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';

interface ProfileImagePlaceholderProps {
  name?: string;
  icon?: string | File;
  onClick?: () => void;
  size?: number;
  upload?: {
    onUpload: (image: File) => void;
    active: boolean;
  };
  remove?: {
    enabled: boolean;
    onRemoveClick: () => void;
  };
  role?: string;
  active?: boolean;
  placeholderIcon?: React.ReactNode;
  disableOverlay?: boolean;
  /** Show a green online-status dot on the avatar. */
  online?: boolean;
}

export const ProfileImagePlaceholder: React.FC<
  ProfileImagePlaceholderProps
> = ({
  name,
  icon,
  size = 64,
  upload,
  remove,
  role,
  active = false,
  placeholderIcon,
  disableOverlay,
  online = false,
}) => {
  const { config } = useChatSettingState();
  const t = useT();
  const iconsBg = config?.colors?.iconsBg;
  const iconColor = config?.colors?.icons;
  const { backgroundColor: hashedBg } = nameToColor(name);
  const backgroundColor = iconsBg || hashedBg;

  // Social-login avatars (Google/Facebook profile photos) commonly fail to
  // load, either because the CDN refuses hotlinked/referrer-carrying
  // requests or because the URL has simply expired. When that happens the
  // browser renders a broken-image glyph plus the alt text clipped to the
  // circle, which is very visible in member lists. Track the failure and
  // fall back to the same initials/placeholder rendering used when there is
  // no icon at all, so a failed avatar looks exactly like one that was
  // never set.
  const [imageFailed, setImageFailed] = useState(false);

  // A recycled row (e.g. a virtualized member list) reuses this component
  // for a different person. Reset the failure flag whenever the icon
  // changes, otherwise the new user's valid avatar keeps showing initials
  // forever because of a previous, unrelated failure.
  useEffect(() => {
    setImageFailed(false);
  }, [icon]);

  const avatarAlt = name
    ? t('avatar.altWithName', { name })
    : t('avatar.altGeneric');

  const getTwoUppercaseLetters = (fullName: string) => {
    if (!fullName) return '';

    const normalizedName = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const words = normalizedName.split(/\s+/);

    const extractFirstValidChar = (word: string): string => {
      const validCharRegex = /^[\p{L}\p{N}\p{P}]/u;

      if (word && validCharRegex.test(word[0])) {
        return word[0].toUpperCase();
      }

      return '';
    };

    const firstLetter = extractFirstValidChar(words[0] || '');
    const secondLetter = extractFirstValidChar(words[1] || '');

    return firstLetter + secondLetter;
  };

  // A failed image is indistinguishable from no icon at all: same initials,
  // same background.
  const showImage = !!icon && !imageFailed;

  const getInitials = () =>
    !showImage && name ? getTwoUppercaseLetters(name) : '';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && upload?.onUpload) {
      upload.onUpload(file);
    }
  };

  const handleAvatarClick = () => {
    if (upload?.active) {
      document.getElementById('avatar-file-input')?.click();
    }
  };

  return (
    <Wrapper
      bgColor={showImage ? 'transparent' : backgroundColor}
      size={size}
      isClickable={active || !!upload?.active}
    >
      <AvatarCircle
        bgColor={showImage ? 'transparent' : backgroundColor}
        size={size}
        isClickable={active || (role === 'participant' && !!upload?.active)}
        onClick={handleAvatarClick}
        style={{
          fontSize: size >= 64 ? '24px' : '18px',
          ...(iconColor ? { color: iconColor } : {}),
          cursor: 'pointer'
        }}
      >
        {showImage ? (
          <AvatarImage
            src={typeof icon === 'string' ? icon : URL.createObjectURL(icon as File)}
            alt={avatarAlt}
            size={size}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : placeholderIcon ? (
          placeholderIcon
        ) : (
          getInitials()
        )}
        {upload?.active && (
          <>
            <FileInput
              type="file"
              id="avatar-file-input"
              accept="image/png, image/jpeg"
              onChange={handleFileChange}
            />
            {!disableOverlay && (
              <Overlay>
                <EditIcon style={{ fontSize: size / 2 }} color="#fff" />
              </Overlay>
            )}
          </>
        )}
      </AvatarCircle>
      {online && (
        <span
          aria-label="online"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: Math.max(8, Math.round(size * 0.28)),
            height: Math.max(8, Math.round(size * 0.28)),
            borderRadius: 'var(--ethora-radius-full, 999px)',
            backgroundColor: 'var(--ethora-color-online, #12B76A)',
            border: '2px solid var(--ethora-color-bg, #fff)',
            boxSizing: 'border-box',
          }}
        />
      )}
      {remove?.enabled && icon && role !== 'participant' && (
        <RemoveButton
          onClick={(e) => {
            e.stopPropagation();
            remove.onRemoveClick();
          }}
        >
          &times;
        </RemoveButton>
      )}
    </Wrapper>
  );
};
