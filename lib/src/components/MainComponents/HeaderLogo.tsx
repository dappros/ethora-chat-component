import React from 'react';
import { useT } from '../../i18n/useT';

interface HeaderLogoProps {
  /**
   * A plain string is treated as an image URL and rendered as an `<img>`;
   * any other node is rendered as-is. Same string-or-node duality as
   * `config.fallbackScreens` (see FallbackScreen).
   */
  logo: string | React.ReactElement;
  /** Rendered height in pixels. Default 32. */
  size?: number;
}

export const HEADER_LOGO_TEST_ID = 'ethora-header-logo';

/**
 * Host-provided logo shown at the left of the chat header, for white-label
 * embedding. See IConfig.headerLogo.
 */
const HeaderLogo: React.FC<HeaderLogoProps> = ({ logo, size = 32 }) => {
  const t = useT();

  if (typeof logo === 'string') {
    const src = logo.trim();
    if (!src) return null;

    return (
      <img
        data-testid={HEADER_LOGO_TEST_ID}
        src={src}
        alt={t('header.logoAlt')}
        style={{
          height: size,
          maxWidth: size * 4,
          objectFit: 'contain',
          alignSelf: 'center',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      data-testid={HEADER_LOGO_TEST_ID}
      style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
    >
      {logo}
    </span>
  );
};

export default HeaderLogo;
