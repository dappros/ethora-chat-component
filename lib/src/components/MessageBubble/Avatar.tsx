import React, { CSSProperties } from 'react';
import styled from 'styled-components';
import { nameToColor } from '../../helpers/hashcolor';
import { useChatSettingState } from '../../hooks/useChatSettingState';

interface AvatarProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  style?: CSSProperties;
}

const AvatarCircle = styled.div<{ $bgColor: string; $textColor?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${({ $bgColor }) => $bgColor};
  ${({ $textColor }) => ($textColor ? `color: ${$textColor};` : '')}
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
  const { config } = useChatSettingState();
  // When the host themes icons, message avatars follow `colors.iconsBg` (circle
  // bg) and `colors.icons` (initials). Otherwise keep the per-name hashed colour
  // so distinct users stay visually distinguishable.
  const iconsBg = config?.colors?.iconsBg;
  const iconColor = config?.colors?.icons;
  const { backgroundColor: hashedBg } = nameToColor(
    username ? username : firstName
  );
  const backgroundColor = iconsBg || hashedBg;

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
    <AvatarCircle style={style} $bgColor={backgroundColor} $textColor={iconColor}>
      {getInitials()}
    </AvatarCircle>
  );
};
