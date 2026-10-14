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
  ${({ $textColor }) =>
    $textColor
      ? `color: ${$textColor};`
      : `[data-ethora-color-scheme='dark'] & { color: #141414; }`}
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;

  transition: box-shadow var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:hover {
    box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  }
`;

/**
 * Neutral stand-in for a sender nobody could name. Placeholder punctuation
 * such as "??" reads as a rendering bug, so an unknown sender gets a person
 * silhouette instead.
 */
const PersonGlyph: React.FC = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    data-testid="avatar-unknown-glyph"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.9 3.6-6 8-6s8 2.1 8 6v1H4v-1z" />
  </svg>
);

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
  const hasName = Boolean((username || firstName || '').trim());
  const backgroundColor =
    iconsBg || (hasName ? hashedBg : 'rgba(128, 138, 152, 0.45)');

  const getInitials = () => {
    // Same permissive rule as ProfileImagePlaceholder.getTwoUppercaseLetters
    // (letters, numbers or punctuation in any script) - the old latin/
    // cyrillic-only check rejected a leading digit, so a name like
    // "5test 5test" produced an empty circle in the message bubble while
    // the profile modal (using the wider rule) correctly showed "55".
    const isValidInitialChar = (char: string) => /^[\p{L}\p{N}\p{P}]$/u.test(char);

    if (firstName && lastName) {
      const firstInitial = isValidInitialChar(firstName[0])
        ? firstName[0].toUpperCase()
        : '';
      const lastInitial = isValidInitialChar(lastName[0])
        ? lastName[0].toUpperCase()
        : '';
      return `${firstInitial}${lastInitial}`;
    } else if (username) {
      const names = username.split(' ');
      if (names.length > 1) {
        const firstInitial = isValidInitialChar(names[0][0])
          ? names[0][0].toUpperCase()
          : '';
        const secondInitial = isValidInitialChar(names[1][0])
          ? names[1][0].toUpperCase()
          : '';
        return `${firstInitial}${secondInitial}`;
      } else {
        const singleInitial = isValidInitialChar(names[0][0])
          ? names[0][0].toUpperCase()
          : '';
        return `${singleInitial}`;
      }
    }
    return '';
  };

  const initials = getInitials();

  return (
    <AvatarCircle style={style} $bgColor={backgroundColor} $textColor={iconColor}>
      {initials || <PersonGlyph />}
    </AvatarCircle>
  );
};
