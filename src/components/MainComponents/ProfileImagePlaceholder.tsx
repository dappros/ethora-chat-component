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

const backgroundColors = ['#f44336', '#2196f3', '#4caf50', '#ff9800'];

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
  const randomColor = useMemo(() => {
    if (!icon) {
      const index = Math.floor(Math.random() * backgroundColors.length);
      return backgroundColors[index];
    }
    return '';
  }, [icon]);

  const { backgroundColor, textColor } = nameToColor(name);

  const getTwoUppercaseLetters = (fullName: string) => {
    if (!fullName) return '';

    const words = fullName.trim().split(' ');
    const firstLetter = words[0]?.[0]?.toUpperCase() || '';
    const secondLetter = words[words.length - 1]?.[0]?.toUpperCase() || '';

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
        color={textColor}
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
