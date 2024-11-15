import React, { useMemo } from 'react';
import styled from 'styled-components';

interface ChatHeaderAvatarProps {
  name?: string;
  icon?: string;
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

export const ChatHeaderAvatar: React.FC<ChatHeaderAvatarProps> = ({
  name,
  icon,
  size = 64,
  upload,
  remove,
  role = 'participant',
}) => {
  const randomColor = useMemo(() => {
    if (!icon) {
      const index = Math.floor(Math.random() * backgroundColors.length);
      return backgroundColors[index];
    }
    return '';
  }, [icon]);

  const getInitials = () => (!icon && name ? name[0].toUpperCase() : '');

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
      isClickable={!!upload?.active}
    >
      <AvatarCircle
        bgColor={icon ? 'transparent' : randomColor}
        size={size}
        isClickable={role === 'participant' && !!upload?.active}
        onClick={handleAvatarClick}
      >
        {icon ? (
          <AvatarImage src={icon} alt="avatar icon" size={size} />
        ) : (
          getInitials()
        )}
        {upload?.active && (
          <FileInput
            type="file"
            id="avatar-file-input"
            accept="image/*"
            onChange={handleFileChange}
          />
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
