import React, { CSSProperties, useMemo } from 'react';
import styled from 'styled-components';
import { nameToColor } from '../../helpers/hashcolor';

interface AvatarProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  style?: CSSProperties;
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

  transition: box-shadow 0.2s ease-in-out;

  &:hover {
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.2);
  }
`;

export const Avatar: React.FC<AvatarProps> = ({
  username,
  firstName,
  lastName,
  style,
}) => {
  const { backgroundColor, textColor } = nameToColor(
    username ? username : firstName
  );

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

  return (
    <AvatarCircle style={style} bgColor={backgroundColor} textColor={textColor}>
      {getInitials()}
    </AvatarCircle>
  );
};
