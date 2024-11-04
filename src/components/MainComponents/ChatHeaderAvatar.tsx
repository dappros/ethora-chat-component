import React, { useMemo } from 'react';
import styled from 'styled-components';

interface ChatHeaderAvatarProps {
  name?: string;
  onClick?: () => void;
  size?: number;
}

const backgroundColors = ['#f44336', '#2196f3', '#4caf50', '#ff9800'];

const AvatarCircle = styled.div<{
  bgColor: string;
  size?: number;
  textColor?: string;
}>`
  width: ${({ size }) => `${size}px` || '64px'};
  height: ${({ size }) => `${size}px` || '64px'};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  color: ${({ textColor }) => textColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
`;

export const ChatHeaderAvatar: React.FC<ChatHeaderAvatarProps> = ({
  name,
  size = 64,
}) => {
  const getInitials = () => {
    return name[0]?.toUpperCase();
  };

  const randomColor = useMemo(() => {
    const index = Math.floor(Math.random() * backgroundColors.length);
    return backgroundColors[index];
  }, []);

  const getTextColor = (bgColor: string) => {
    const lightColors = ['#4caf50', '#ff9800'];
    return lightColors.includes(bgColor) ? '#000' : '#fff';
  };

  return (
    <AvatarCircle
      bgColor={randomColor}
      color={getTextColor(randomColor)}
      size={size}
    >
      {getInitials()}
    </AvatarCircle>
  );
};
