import React, { useMemo } from 'react';
import styled from 'styled-components';

interface AvatarProps {
  username?: string;
  firstName?: string;
  lastName?: string;
}

const backgroundColors = ['#f44336', '#2196f3', '#4caf50', '#ff9800'];

const AvatarCircle = styled.div<{ bgColor: string; textColor?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  color: ${({ textColor }) => textColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
`;

export const Avatar: React.FC<AvatarProps> = ({
  username,
  firstName,
  lastName,
}) => {
  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    } else if (username) {
      const names = username.split(' ');
      return names.length > 1
        ? `${names[0][0]}${names[1][0]}`.toUpperCase()
        : `${names[0][0]}`.toUpperCase();
    }
    return '??';
  };

  const randomColor = useMemo(() => {
    const index = Math.floor(Math.random() * backgroundColors.length);
    return backgroundColors[index];
  }, []);

  const getTextColor = (bgColor: string) => {
    const lightColors = ['#4caf50', '#ff9800'];
    return lightColors.includes(bgColor) ? '#000' : '#fff';
  };

  return <AvatarCircle bgColor={'#2196f3'}>{getInitials()}</AvatarCircle>;
};
