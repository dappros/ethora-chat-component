import React, { useMemo } from 'react';
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
  const iconsBg = config?.colors?.iconsBg;
  const iconColor = config?.colors?.icons;
  const { backgroundColor: hashedBg } = nameToColor(name);
  const backgroundColor = iconsBg || hashedBg;

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

  const getInitials = () => (!icon && name ? getTwoUppercaseLetters(name) : '');

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
      bgColor={icon ? 'transparent' : backgroundColor}
      size={size}
      isClickable={active || !!upload?.active}
    >
      <AvatarCircle
        bgColor={icon ? 'transparent' : backgroundColor}
        size={size}
        isClickable={active || (role === 'participant' && !!upload?.active)}
        onClick={handleAvatarClick}
        style={{
          fontSize: size >= 64 ? '24px' : '18px',
          ...(iconColor ? { color: iconColor } : {}),
          cursor: 'pointer'
        }}
      >
        {icon ? (
          <AvatarImage
            src={typeof icon === 'string' ? icon : URL.createObjectURL(icon)}
            alt="avatar icon"
            size={size}
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
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            border: '2px solid #fff',
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
