import React, { CSSProperties, useMemo } from 'react';
import styled from 'styled-components';
import { nameToColor } from '../../helpers/hashcolor';

interface AvatarProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  style?: CSSProperties;
}

const AvatarCircle = styled.div<{ bgColor: string; textColor?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
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
  const { backgroundColor } = nameToColor(username ? username : firstName);

  const getInitials = () => {
    const isAlphabetic = (char: string) => /^[a-zA-Zа-яА-ЯёЁ]$/.test(char);

    if (firstName && lastName) {
      const firstInitial = isAlphabetic(firstName[0])
        ? firstName[0].toUpperCase()
        : '';
      const lastInitial = isAlphabetic(lastName[0])
        ? lastName[0].toUpperCase()
        : '';
      return `${firstInitial}${lastInitial}`;
    } else if (username) {
      const names = username.split(' ');
      if (names.length > 1) {
        const firstInitial = isAlphabetic(names[0][0])
          ? names[0][0].toUpperCase()
          : '';
        const secondInitial = isAlphabetic(names[1][0])
          ? names[1][0].toUpperCase()
          : '';
        return `${firstInitial}${secondInitial}`;
      } else {
        const singleInitial = isAlphabetic(names[0][0])
          ? names[0][0].toUpperCase()
          : '';
        return `${singleInitial}`;
      }
    }
    return '??';
  };

  return (
    <AvatarCircle style={style} bgColor={backgroundColor}>
      {getInitials()}
    </AvatarCircle>
  );
};
