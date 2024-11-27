import React, { useMemo } from 'react';
import styled from 'styled-components';
import { EditIcon } from '../../assets/icons';

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
}

const backgroundColors = ['#f44336', '#2196f3', '#4caf50', '#ff9800'];

const Wrapper = styled.div<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => `${size}px` || '64px'};
  height: ${({ size }) => `${size}px` || '64px'};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  position: relative;
`;

const AvatarCircle = styled.div<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => `${size}px` || '64px'};
  height: ${({ size }) => `${size}px` || '64px'};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  overflow: hidden;
`;

const AvatarImage = styled.img<{ size?: number }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RemoveButton = styled.button`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 0;
  padding: 0;
`;

const FileInput = styled.input`
  display: none;
`;

const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  border-radius: 50%;
  &:hover {
    background-color: rgba(0, 0, 0, 0.7);
  }
`;

export const ProfileImagePlaceholder: React.FC<
  ProfileImagePlaceholderProps
> = ({
  name,
  icon,
  size = 64,
  upload,
  remove,
  role = 'participant',
  active = false,
}) => {
  const randomColor = useMemo(() => {
    if (!icon) {
      const index = Math.floor(Math.random() * backgroundColors.length);
      return backgroundColors[index];
    }
    return '';
  }, [icon]);

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
      bgColor={icon ? 'transparent' : randomColor}
      size={size}
      isClickable={active || !!upload?.active}
    >
      <AvatarCircle
        bgColor={icon ? 'transparent' : randomColor}
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
        ) : (
          getInitials()
        )}
        {upload?.active && (
          <>
            <FileInput
              type="file"
              id="avatar-file-input"
              accept="image/*"
              onChange={handleFileChange}
            />
            <Overlay>
              <EditIcon style={{ color: '#fff', fontSize: size / 2 }} />
            </Overlay>
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
