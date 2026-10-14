import { safeImageUrl } from '../../helpers/safeUrl';
import React, { useEffect, useMemo } from 'react';
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
import { useSelector } from 'react-redux';
import type { RootState } from '../../roomStore';
import { useAvatarImage } from '../../hooks/useAvatarImage';
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
  // Only the colours: subscribing to the whole settings slice re-rendered
  // every avatar in a list on unrelated settings changes.
  const colors = useSelector(
    (state: RootState) => state.chatSettingStore.config?.colors
  );
  const t = useT();
  const iconsBg = colors?.iconsBg;
  const iconColor = colors?.icons;
  const { backgroundColor: hashedBg } = nameToColor(name);
  const backgroundColor = iconsBg || hashedBg;

  // A picked File needs an object URL; make it once per File and release it
  // (it used to be recreated on every render, restarting the image load).
  const fileUrl = useMemo(
    () => (icon instanceof File ? URL.createObjectURL(icon) : ''),
    [icon]
  );
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl]
  );

  // Initials are painted from the first frame; the photo is layered on top
  // and faded in once decoded, so a slow avatar never shows an empty circle.
  // A photo that fails (hotlink-blocked social avatars, expired URLs) simply
  // leaves the initials in place, exactly like an avatar that was never set.
  // Resolution/dedupe/token handling lives in useAvatarImage.
  const image = useAvatarImage(typeof icon === 'string' ? icon : fileUrl);

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

  const showImage = !!icon && !!image.src && image.status !== 'failed';
  const imageLoaded = image.status === 'loaded';

  const getInitials = () =>
    !imageLoaded && name ? getTwoUppercaseLetters(name) : '';

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
      bgColor={imageLoaded ? 'transparent' : backgroundColor}
      size={size}
      isClickable={active || !!upload?.active}
    >
      <AvatarCircle
        bgColor={imageLoaded ? 'transparent' : backgroundColor}
        size={size}
        isClickable={active || (role === 'participant' && !!upload?.active)}
        onClick={handleAvatarClick}
        style={{
          fontSize: size >= 64 ? '24px' : '18px',
          ...(iconColor ? { color: iconColor } : {}),
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {!imageLoaded && (placeholderIcon ?? getInitials())}
        {showImage && (
          <AvatarImage
            src={safeImageUrl(image.src)}
            alt={avatarAlt}
            size={size}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={image.onLoad}
            onError={image.onError}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 150ms ease',
            }}
          />
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
