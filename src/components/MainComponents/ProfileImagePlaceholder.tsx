import React, { useMemo } from 'react';
import styled from 'styled-components';
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
}) => {
  const { backgroundColor } = nameToColor(name);

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
        style={{ fontSize: size >= 64 ? '24px' : '18px' }}
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
